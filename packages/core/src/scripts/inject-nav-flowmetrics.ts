// One-shot: inject the cross-linking sub-footer nav into the
// /tmp/flowmetrics-pr2 working tree (PR #3 branch). Used to add the nav
// to PR #3 without re-running the full pipeline.

import { injectTanstackNav } from "../lovable/inject-tanstack-nav.js";

async function main() {
  const result = await injectTanstackNav({
    cloneDir: "/tmp/flowmetrics-pr2",
    brand: "FlowMetrics",
    links: [
      { route: "/vs/klipfolio", label: "vs Klipfolio", group: "compare" },
      { route: "/vs/databox", label: "vs Databox", group: "compare" },
      { route: "/vs/cometly", label: "vs Cometly", group: "compare" },
    ],
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
