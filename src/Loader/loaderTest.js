import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile, groupBySeries } from './Loader.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Usage: node loaderTest.js            → runs Lung_Dx-A0167
//        node loaderTest.js A0168      → runs Lung_Dx-A0168
const caseId = process.argv[2] ?? 'A0167';
const dataDir = path.join(here, 'Test Files', 'lung_pet_ct_dx', `Lung_Dx-${caseId}`);

function listFiles(dir) {
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

// Only the fields worth printing (bytes and dataSet are huge)
function summarize(s) {
    if (!s) return 'none';
    const { modality, rows, columns, position, orientation,
        pixelSpacing, slope, intercept, signed } = s;
    return { modality, rows, columns, position, orientation,
        pixelSpacing, slope, intercept, signed };
}

console.log(`Case: ${caseId}`);

// 1. Parse every file
const paths = listFiles(dataDir);
const blobs = await Promise.all(paths.map((p) => fs.openAsBlob(p)));
const results = await Promise.all(blobs.map((b) => parseFile(b)));
const slices = results.filter((s) => s !== null);
console.log(`Files: ${paths.length}, image slices: ${slices.length}, skipped: ${paths.length - slices.length}`);

// 2. Group into series
const groups = groupBySeries(slices);
console.log(`\nSeries found: ${groups.size}`);
for (const [uid, group] of groups) {
    const first = group[0];
    const slopes = new Set(group.map((s) => s.slope));
    console.log(`\n${first.modality}  ${group.length} slices  (distinct slopes: ${slopes.size})`);
    console.log(`  UID: ${uid}`);
    console.log('  first slice:', summarize(first));
}