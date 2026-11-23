import { createChannel, createStudy, type Vec3, type VolumeStudy } from './VolumeStudy';

/** A fake whole-body PET in SUV, centred on the world origin. LPS: +x left, +y back, +z head. */
export function makeTestPET(): VolumeStudy {
  const dims: Vec3 = [64, 64, 48];
  const spacing: Vec3 = [4, 4, 4]; // mm, typical PET voxel size
  const origin = dims.map((d, a) => (-(d - 1) * spacing[a]) / 2) as Vec3;

  const inSphere = (x: number, y: number, z: number, cx: number, cy: number, cz: number, r: number) =>
    (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 <= r * r;

  const scalars = new Float32Array(dims[0] * dims[1] * dims[2]);
  let v = 0;
  for (let k = 0; k < dims[2]; k++)
    for (let j = 0; j < dims[1]; j++)
      for (let i = 0; i < dims[0]; i++) {
        const x = origin[0] + i * spacing[0];
        const y = origin[1] + j * spacing[1];
        const z = origin[2] + k * spacing[2];
        let suv = 0;
        if ((x / 110) ** 2 + (y / 80) ** 2 + (z / 90) ** 2 <= 1) suv = 0.8 + 0.4 * Math.random(); // body
        if (inSphere(x, y, z, 0, 0, 70, 18)) suv = 7; // brain (top)
        if (inSphere(x, y, z, -40, 10, 30, 12)) suv = 9; // "tumour" (patient's right)
        if (inSphere(x, y, z, 0, -30, -70, 16)) suv = 15; // bladder (bottom, front)
        scalars[v++] = suv;
      }

  const pet = createChannel({
    modality: 'PT',
    units: 'SUVbw',
    geometry: { dimensions: dims, spacing, origin },
    scalars,
  });
  return createStudy({ pet, source: { format: 'test', files: [] } });
}