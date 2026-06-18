// Converts the legacy `skill_tree_data.js` (a global `const` assignment) into a
// clean JSON asset the app imports with full typing. Run: node scripts/convert-data.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../my-ttrpg-app-vanilla/skill_tree_data.js');
const OUT_DIR = resolve(here, '../src/data');
const OUT = resolve(OUT_DIR, 'skillTree.json');

const source = readFileSync(SRC, 'utf8');
// Execute the legacy file body, then hand back the object it defines.
const data = new Function(`${source}\n;return skillTreeData;`)();

if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
  throw new Error('Converted data is missing nodes/edges — aborting.');
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(data));

const itemCount = Object.values(data.worldItems ?? {}).reduce((n, arr) => n + arr.length, 0);
console.log(
  `✓ skillTree.json written: ${data.nodes.length} nodes, ${data.edges.length} edges, ${itemCount} world items`,
);
