import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile, groupBySeries, pickPetCt, zRange, findOverlap, type Slice } from './Loader.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

// Usage: node loaderTest.ts            → runs Lung_Dx-A0168
//        node loaderTest.ts A0167      → runs Lung_Dx-A0167
const caseId = process.argv[2] ?? 'A0168';
const dataDir = path.join(here, 'Test Files', 'lung_pet_ct_dx', `Lung_Dx-${caseId}`);

function listFiles(dir: string): string[] {
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name));
}

// One line per series: modality, slice count, UID
function describeSeries(group: Slice[]): string {
    return `${group[0].modality}  ${group.length} slices  ${group[0].seriesUID}`;
}

console.log(`Case: ${caseId}`);

// 1. Parse every file
const paths = listFiles(dataDir);
const blobs = await Promise.all(paths.map((p) => fs.openAsBlob(p)));
const results = await Promise.all(blobs.map((b) => parseFile(b)));
const slices = results.filter((s): s is Slice => s !== null);
console.log(`Files: ${paths.length}, image slices: ${slices.length}, skipped: ${paths.length - slices.length}`);

// Where did the skipped files come from?
const skippedByFolder: Record<string, number> = {};
results.forEach((r, i) => {
    if (r === null) {
        const folder = path.basename(path.dirname(paths[i]));
        skippedByFolder[folder] = (skippedByFolder[folder] ?? 0) + 1;
    }
});
console.log('Skipped by folder:', skippedByFolder);

// 2. Group into series
const groups = groupBySeries(slices);
console.log(`\nSeries found: ${groups.size}`);
for (const group of groups.values()) {
    console.log('  ' + describeSeries(group));
}

// 3. Pick one PET and (optionally) one CT
const picked = pickPetCt(groups);
if (picked === null) {
    console.log('\npickPetCt: no PET series found');
} else {
    const { pet, ct } = picked;
    const petZ = zRange(pet);
    console.log(`\nPET: ${describeSeries(pet)}`);
    console.log(`  z: ${petZ.minZ} → ${petZ.maxZ}`);

    if (ct === undefined) {
        console.log('\nNo CT, PET only');
    } else {
        console.log('\nCT candidates:');
        for (const group of groups.values()) {
            if (group[0].modality !== 'CT') continue;
            const z = zRange(group);
            const overlap = findOverlap(group, pet);
            const mark = group === ct ? '  ← picked' : '';
            console.log(`  ${describeSeries(group)}`);
            console.log(`    z: ${z.minZ} → ${z.maxZ}   overlap: ${overlap.toFixed(1)} mm${mark}`);
        }
    }
}