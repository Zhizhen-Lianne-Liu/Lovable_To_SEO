"""
Minimal Claude agent loop using the anthropic SDK with tool use.
Implements Read, Write, Edit, Glob, Bash tools scoped to a working directory.
"""
from __future__ import annotations

import asyncio
import glob as glob_module
import logging
import re
import subprocess
from pathlib import Path
from typing import Any

import anthropic

log = logging.getLogger("lovable_to_seo.agent")

TOOL_SPECS = {
    "Read": {
        "name": "Read",
        "description": "Read the contents of a file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Path relative to the working directory"}
            },
            "required": ["file_path"],
        },
    },
    "Write": {
        "name": "Write",
        "description": "Write content to a file, creating parent directories as needed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["file_path", "content"],
        },
    },
    "Edit": {
        "name": "Edit",
        "description": "Replace the first occurrence of old_string with new_string in a file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"},
                "old_string": {"type": "string"},
                "new_string": {"type": "string"},
            },
            "required": ["file_path", "old_string", "new_string"],
        },
    },
    "Glob": {
        "name": "Glob",
        "description": "List files matching a glob pattern relative to the working directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string"},
            },
            "required": ["pattern"],
        },
    },
    "Bash": {
        "name": "Bash",
        "description": "Run a shell command in the working directory. Timeout 120s.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string"},
            },
            "required": ["command"],
        },
    },
}


class AgentError(Exception):
    pass


def _describe_tool(name: str, inputs: dict) -> str:
    """Return a human-readable one-liner for a tool call."""
    if name == "Read":
        return f"Read  {inputs.get('file_path', '?')}"
    if name == "Write":
        path = inputs.get("file_path", "?")
        size = len(inputs.get("content", ""))
        return f"Write {path}  ({size:,} chars)"
    if name == "Edit":
        path = inputs.get("file_path", "?")
        old = inputs.get("old_string", "")
        # Show a short snippet of what's being replaced
        snippet = old.strip()[:60].replace("\n", " ↵ ")
        return f"Edit  {path}  replacing: {snippet!r}"
    if name == "Bash":
        cmd = inputs.get("command", "")[:80]
        return f"Bash  {cmd}"
    if name == "Glob":
        return f"Glob  {inputs.get('pattern', '?')}"
    return f"{name}  {str(inputs)[:60]}"


def _resolve(cwd: Path, rel_path: str) -> Path:
    p = (cwd / rel_path).resolve()
    # Prevent path traversal outside cwd
    if not str(p).startswith(str(cwd.resolve())):
        raise AgentError(f"Path {rel_path!r} escapes working directory")
    return p


def _execute_tool(name: str, inputs: dict[str, Any], cwd: Path) -> str:
    try:
        if name == "Read":
            p = _resolve(cwd, inputs["file_path"])
            return p.read_text(errors="replace")

        elif name == "Write":
            p = _resolve(cwd, inputs["file_path"])
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(inputs["content"])
            return f"Written {len(inputs['content'])} bytes to {inputs['file_path']}"

        elif name == "Edit":
            p = _resolve(cwd, inputs["file_path"])
            content = p.read_text(errors="replace")
            old = inputs["old_string"]
            new = inputs["new_string"]
            if old not in content:
                return f"ERROR: old_string not found in {inputs['file_path']}"

            # Programmatic style guard: reject edits that remove or change existing
            # class/style attribute values. New attributes on NEW elements are fine;
            # existing ones are locked. This is enforced in code, not just by prompting.
            _attr_re = re.compile(r'(?:class|style)=["\']([^"\']*)["\']')
            old_attrs = _attr_re.findall(old)
            new_attrs = _attr_re.findall(new)
            missing = [a for a in old_attrs if a not in new_attrs]
            if missing:
                return (
                    "ERROR: Edit rejected — modifies existing class/style attributes. "
                    "Visual styling is locked; never change class=\"...\" or style=\"...\" "
                    "on existing elements. You may add new elements with their own classes. "
                    f"Attributes that would be lost: {missing[:3]}"
                )

            p.write_text(content.replace(old, new, 1))
            return f"Replaced in {inputs['file_path']}"

        elif name == "Glob":
            pattern = str(cwd / inputs["pattern"])
            matches = glob_module.glob(pattern, recursive=True)
            # Filter out Shadcn/Radix UI primitive dirs — no page content there
            _skip = {"ui", "icons", "__pycache__", "node_modules", ".git"}
            def _keep(p: str) -> bool:
                parts = Path(p).relative_to(cwd).parts
                return not any(part in _skip for part in parts)
            rel = [str(Path(m).relative_to(cwd)) for m in sorted(matches) if _keep(m)]
            return "\n".join(rel) if rel else "(no matches)"

        elif name == "Bash":
            result = subprocess.run(
                inputs["command"],
                shell=True,
                cwd=str(cwd),
                capture_output=True,
                text=True,
                timeout=120,
            )
            out = result.stdout + result.stderr
            if result.returncode != 0:
                return f"EXIT {result.returncode}\n{out}"
            return out or "(no output)"

        else:
            return f"ERROR: unknown tool {name!r}"

    except AgentError as e:
        return f"ERROR: {e}"
    except FileNotFoundError as e:
        return f"ERROR: {e}"
    except Exception as e:
        return f"ERROR: {type(e).__name__}: {e}"


async def run_agent(
    *,
    system_prompt: str,
    user_prompt: str,
    cwd: Path,
    allowed_tools: list[str],
    model: str,
    api_key: str,
    label: str = "agent",
    max_iterations: int = 100,
) -> str:
    """Run a Claude agent loop with file system tools scoped to cwd."""
    client = anthropic.Anthropic(api_key=api_key)
    tools = [TOOL_SPECS[t] for t in allowed_tools if t in TOOL_SPECS]
    messages: list[dict] = [{"role": "user", "content": user_prompt}]

    for iteration in range(max_iterations):
        log.info("  [%s] turn %d → POST /v1/messages", label, iteration + 1)
        response = await asyncio.to_thread(
            client.messages.create,
            model=model,
            system=system_prompt,
            messages=messages,
            tools=tools,
            max_tokens=4096,
        )

        assistant_content = [block.model_dump() for block in response.content]
        messages.append({"role": "assistant", "content": assistant_content})

        if response.stop_reason == "end_turn":
            log.info("  [%s] done (end_turn) after %d turns", label, iteration + 1)
            for block in response.content:
                if block.type == "text":
                    return block.text
            return ""

        if response.stop_reason == "tool_use":
            tool_calls = [b for b in response.content if b.type == "tool_use"]
            for b in tool_calls:
                log.info("  [%s] turn %d  %s", label, iteration + 1, _describe_tool(b.name, b.input))
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = _execute_tool(block.name, block.input, cwd)
                    # Log rejections from the style guard so they're visible
                    if result.startswith("ERROR: Edit rejected"):
                        log.warning("  [%s] STYLE GUARD blocked edit — %s", label, result[30:80])
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })
            messages.append({"role": "user", "content": tool_results})
            continue

        if response.stop_reason == "max_tokens":
            # Log every block type so we can see what was truncated
            block_summary = ", ".join(
                f"{b.type}({getattr(b, 'name', '')})" for b in response.content
            )
            log.info("  [%s] turn %d hit max_tokens — content: [%s]", label, iteration + 1, block_summary)

            # Find any tool_use blocks — use getattr in case SDK parses them differently
            pending = [b for b in response.content if getattr(b, "type", "") == "tool_use"]
            if pending:
                names = ", ".join(b.name for b in pending)
                log.info("  [%s] executing %d truncated tool(s): %s", label, len(pending), names)
                tool_results = []
                for block in pending:
                    # Input may be empty/incomplete if truncated mid-generation
                    inp = getattr(block, "input", {}) or {}
                    result = _execute_tool(block.name, inp, cwd)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })
                messages.append({"role": "user", "content": tool_results})
            else:
                # Text was cut off mid-output — continue the generation
                messages.append({"role": "user", "content": "Continue exactly where you left off."})
            continue

        log.info("  [%s] stopped: stop_reason=%s", label, response.stop_reason)
        break

    raise AgentError(f"Agent did not complete within {max_iterations} iterations")
