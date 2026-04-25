import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type Detection = {
  isLovable: boolean;
  detectionReasons: string[];
};

export async function detect(workdir: string): Promise<Detection> {
  const reasons: string[] = [];
  let pkgRaw = '';
  try {
    pkgRaw = await readFile(join(workdir, 'package.json'), 'utf8');
  } catch {
    return { isLovable: false, detectionReasons: ['no package.json found'] };
  }

  let pkg: Record<string, unknown> = {};
  try {
    pkg = JSON.parse(pkgRaw);
  } catch {
    reasons.push('package.json failed to parse');
    return { isLovable: false, detectionReasons: reasons };
  }

  const allDeps = {
    ...((pkg.dependencies as Record<string, string>) ?? {}),
    ...((pkg.devDependencies as Record<string, string>) ?? {}),
  };

  if (allDeps.vite) reasons.push('package.json has vite');
  if (allDeps['@vitejs/plugin-react-swc']) reasons.push('package.json has @vitejs/plugin-react-swc');
  if (/lovable(-tagger)?/i.test(pkgRaw)) reasons.push('package.json mentions lovable / lovable-tagger');

  if (await isDir(join(workdir, 'src/components/ui'))) {
    reasons.push('src/components/ui/ exists (shadcn-style)');
  }

  // Heuristic: vite + components/ui is a strong Lovable signal even without
  // an explicit "lovable" string. Plain vite alone is too generic.
  const hasVite = reasons.some((r) => r.includes('vite'));
  const hasUiDir = reasons.some((r) => r.includes('components/ui'));
  const hasLovableString = reasons.some((r) => r.includes('lovable'));
  const isLovable = hasLovableString || (hasVite && hasUiDir);

  return { isLovable, detectionReasons: reasons };
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
