import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseFile, groupBySeries, pickPetCt, zRange, findOverlap, sortSlices,
    readPixels, buildVolume, computeSuvFactor, load, type Slice,
} from './Loader.ts';
import { createChannel } from '../volume/VolumeStudy.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

// Usage: node loaderTest.ts            → runs Lung_Dx-A0168
//        node loaderTest.ts A0167      → runs Lung_Dx-A0167
const caseId = process.argv[2] ?? 'A0168';
const dataDir = path.join(here, 'Test Files', 'lung_pet_ct_dx', `Lung_Dx-${caseId}`);

// ---------- helpers ----------

function listFiles(dir: string): string[] {
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name));
}

function describeSeries(group: Slice[]): string {
    return `${group[0].modality}  ${group.length} slices  ${group[0].seriesUID}`;
}

function check(label: string, passed: boolean) {
    console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${label}`);
}

function expectThrow(label: string, fn: () => unknown) {
    try {
        fn();
        console.log(`  FAIL  ${label}: expected an error, got none`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ok    ${label}: threw "${msg}"`);
    }
}

function reportSorted(label: string, series: Slice[]) {
    try {
        const r = sortSlices(series);
        const first = r.slices[0].position[2];
        const last = r.slices[r.slices.length - 1].position[2];
        console.log(`\n${label}: ${r.slices.length} slices, z ${first} → ${last}`);
        console.log(`  normal: [${r.normal.join(', ')}]`);
        console.log(`  gap avg ${r.avgGap.toFixed(4)}  min ${r.minGap.toFixed(4)}  max ${r.maxGap.toFixed(4)} mm`);
    } catch (err) {
        if (err instanceof Error) console.log(`\n${label}: ${err.message}`);
    }
}

function reportPixels(label: string, s: Slice) {
    const px = readPixels(s);
    let rawMin = Infinity;
    let rawMax = -Infinity;
    for (let i = 0; i < px.length; i++) {
        if (px[i] < rawMin) rawMin = px[i];
        if (px[i] > rawMax) rawMax = px[i];
    }
    console.log(`\n${label}: ${px.constructor.name}(${px.length}), bits ${s.bitsAllocated}`);
    console.log(`  raw values:  ${rawMin} → ${rawMax}`);
    console.log(`  real values: ${(rawMin * s.slope + s.intercept).toFixed(2)} → ${(rawMax * s.slope + s.intercept).toFixed(2)}`);
}

function reportVolume(label: string, series: Slice[], modality: 'PT' | 'CT', units: 'Bq/ml' | 'HU') {
    try {
        const sorted = sortSlices(series);
        const t0 = performance.now();
        const { scalars, geometry } = buildVolume(sorted.slices, sorted.normal, sorted.avgGap);
        const ms = performance.now() - t0;
        const channel = createChannel({ modality, geometry, scalars, units });

        const [nx, ny, nz] = geometry.dimensions;
        const centre = Math.floor(nz / 2) * nx * ny + Math.floor(ny / 2) * nx + Math.floor(nx / 2);

        console.log(`\n${label}:`);
        console.log(`  dimensions: ${geometry.dimensions.join(' × ')}`);
        console.log(`  spacing:    ${geometry.spacing.map((v) => v.toFixed(3)).join(', ')} mm`);
        console.log(`  origin:     ${geometry.origin.map((v) => v.toFixed(2)).join(', ')} mm`);
        console.log(`  direction:  [${geometry.direction.join(', ')}]`);
        console.log(`  range:      ${channel.range[0].toFixed(1)} → ${channel.range[1].toFixed(1)} ${channel.units}`);
        console.log(`  centre voxel: ${scalars[centre].toFixed(1)} ${channel.units}`);
        console.log(`  built in ${ms.toFixed(0)} ms, ${(scalars.byteLength / 1e6).toFixed(0)} MB`);
    } catch (err) {
        if (err instanceof Error) console.log(`\n${label}: ${err.message}`);
    }
}

function reportSuv(series: Slice[]) {
    const ds = series[0].dataset;
    const radio = ds.elements.x00540016?.items?.[0]?.dataSet;
    console.log('\nSUV ingredients:');
    console.log(`  units: ${ds.string('x00541001')}   decay correction: ${ds.string('x00541102')}`);
    console.log(`  weight: ${ds.floatString('x00101030')} kg`);
    console.log(`  dose: ${radio?.floatString('x00181074')} Bq   half-life: ${radio?.floatString('x00181075')} s`);
    console.log(`  injection: ${radio?.string('x00181072')}   series: ${ds.string('x00080031')}`);

    const factor = computeSuvFactor(series[0]);
    if (factor === null) {
        console.log('  → no SUV (stays Bq/ml)');
        return;
    }

    const sorted = sortSlices(series);
    const { scalars, geometry } = buildVolume(sorted.slices, sorted.normal, sorted.avgGap);
    const [nx, ny, nz] = geometry.dimensions;
    const centre = Math.floor(nz / 2) * nx * ny + Math.floor(ny / 2) * nx + Math.floor(nx / 2);
    let max = 0;
    for (let i = 0; i < scalars.length; i++) if (scalars[i] > max) max = scalars[i];

    console.log(`  factor: ${factor.toExponential(3)}`);
    console.log(`  centre voxel: ${(scalars[centre] * factor).toFixed(2)} SUV`);
    console.log(`  maximum:      ${(max * factor).toFixed(2)} SUV`);
}

console.log(`Case: ${caseId}`);

// ---------- 1. parseFile ----------

const paths = listFiles(dataDir);
const blobs = await Promise.all(paths.map((p) => fs.openAsBlob(p)));
const results = await Promise.all(blobs.map((b) => parseFile(b)));
const slices = results.filter((s): s is Slice => s !== null);
console.log(`Files: ${paths.length}, image slices: ${slices.length}, skipped: ${paths.length - slices.length}`);

const skippedByFolder: Record<string, number> = {};
results.forEach((r, i) => {
    if (r === null) {
        const folder = path.basename(path.dirname(paths[i]));
        skippedByFolder[folder] = (skippedByFolder[folder] ?? 0) + 1;
    }
});
console.log('Skipped by folder:', skippedByFolder);

// ---------- 2. groupBySeries ----------

const groups = groupBySeries(slices);
console.log(`\nSeries found: ${groups.size}`);
for (const group of groups.values()) {
    console.log('  ' + describeSeries(group));
}

// ---------- 3. pickPetCt (+ zRange, findOverlap) ----------

const picked = pickPetCt(groups);
if (picked === null) {
    console.log('\npickPetCt: no PET series found');
} else {
    const { pet, ct, ctSameFrame } = picked;
    const petZ = zRange(pet);
    console.log(`\nPET: ${describeSeries(pet)}`);
    console.log(`  z: ${petZ.minZ} → ${petZ.maxZ}`);

    if (ct === undefined) {
        console.log('\nNo CT, PET only');
    } else {
        console.log(`\nCT candidates (picked CT in PET's frame of reference: ${ctSameFrame ? 'yes' : 'no'}):`);
        for (const group of groups.values()) {
            if (group[0].modality !== 'CT') continue;
            const z = zRange(group);
            const overlap = findOverlap(group, pet);
            const mark = group === ct ? '  ← picked' : '';
            console.log(`  ${describeSeries(group)}`);
            console.log(`    z: ${z.minZ} → ${z.maxZ}   overlap: ${overlap.toFixed(1)} mm${mark}`);
        }
    }

    // ---------- 4. sortSlices ----------

    reportSorted('PET sorted', pet);
    if (ct !== undefined) reportSorted('CT sorted', ct);

    // ---------- 5. readPixels ----------

    reportPixels('PET pixels (first slice)', pet[0]);
    if (ct !== undefined) reportPixels('CT pixels (first slice)', ct[0]);

    // ---------- 6. SUV ----------

    reportSuv(pet);

    // ---------- 7. buildVolume + createChannel ----------

    reportVolume('PET volume', pet, 'PT', 'Bq/ml');
    if (ct !== undefined) reportVolume('CT volume', ct, 'CT', 'HU');

    // ---------- 8. Edge cases ----------

    console.log('\nEdge cases:');

    check('pickPetCt: empty map → null', pickPetCt(new Map()) === null);
    const petOnly = pickPetCt(new Map([[pet[0].seriesUID, pet]]));
    check('pickPetCt: PET only → ct is undefined', petOnly !== null && petOnly.ct === undefined);

    try {
        const sorted = sortSlices(pet).slices;

        const reversed = sortSlices([...pet].reverse()).slices;
        check('sortSlices: input order does not matter', reversed.every((s, i) => s === sorted[i]));

        check('sortSlices: does not reorder the input array', pet.some((s, i) => s !== sorted[i]) || pet.length < 3);

        expectThrow('sortSlices: single slice', () => sortSlices([pet[0]]));
        expectThrow('sortSlices: missing slice', () => sortSlices([...sorted.slice(0, 10), ...sorted.slice(11)]));
        expectThrow('sortSlices: duplicate slice', () => sortSlices([...sorted, sorted[5]]));
    } catch (err) {
        if (err instanceof Error) console.log(`  FAIL  sortSlices on the real PET threw: ${err.message}`);
    }
}

// ---------- 9. load() end to end ----------

try {
    const t0 = performance.now();
    const study = await load(blobs);
    console.log(`\nload(): study ${study.id} in ${(performance.now() - t0).toFixed(0)} ms`);
    for (const channel of [study.pet, study.ct]) {
        if (channel === undefined) {
            console.log('  CT: none');
            continue;
        }
        const g = channel.geometry;
        console.log(`  ${channel.modality}: ${channel.units}, ${g.dimensions.join(' × ')}, range ${channel.range[0].toFixed(2)} → ${channel.range[1].toFixed(2)}`);
        console.log('    metadata:', channel.metadata);
    }
    console.log(`  source: ${study.source.format}, ${study.source.files.length} files`);
} catch (err) {
    if (err instanceof Error) console.log(`\nload() failed: ${err.message}`);
}