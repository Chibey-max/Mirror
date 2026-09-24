// Copies /deployments/<chainId>.json into the frontend before dev and build.
//
// Jason publishes those files (PRD §2); going live should be dropping one in,
// not editing frontend code. Turbopack won't resolve imports from outside this
// workspace, so they're copied in here instead, and lib/contracts.ts imports
// the copies. Missing or malformed files become all-zero addresses, which is
// what keeps the app on its fixture path.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "deployments");
const target = join(here, "..", "lib", "deployments");
const CHAINS = [46630, 31337];
const ZERO = "0x0000000000000000000000000000000000000000";
const FIELDS = [
  "agentRegistry",
  "trackRecord",
  "policyModule",
  "copyVault",
  "usdg",
];

mkdirSync(target, { recursive: true });

for (const chainId of CHAINS) {
  let published = {};
  try {
    published = JSON.parse(readFileSync(join(source, `${chainId}.json`), "utf8"));
  } catch {
    // No file yet, or not valid JSON: fixtures it is.
  }
  const resolved = { chainId };
  for (const field of FIELDS) {
    const value = published?.[field];
    resolved[field] = typeof value === "string" ? value : ZERO;
  }
  writeFileSync(
    join(target, `${chainId}.json`),
    `${JSON.stringify(resolved, null, 2)}\n`,
  );
  const live = FIELDS.filter((f) => resolved[f] !== ZERO).length;
  console.log(
    `deployments: chain ${chainId} -> ${live}/${FIELDS.length} addresses`,
  );
}
