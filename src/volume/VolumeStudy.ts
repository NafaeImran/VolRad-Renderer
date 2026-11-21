/**
 * VolRad's own volume format.
 *
 * This is the contract between the file readers (NIfTI / DICOM / NRRD / ...)
 * and the renderer. Readers produce a `VolumeStudy`; the renderer only ever
 * consumes a `VolumeStudy`. Nothing downstream should know which file format
 * the data came from.
 *
 * Design rules:
 *  - A study ALWAYS has a PET channel. The CT channel is optional.
 *  - Each channel keeps its OWN geometry (PET is usually ~4mm voxels,
 *    CT ~1mm). We never force them onto one grid at read time; the renderer
 *    resamples only when it needs a fused view.
 *  - Geometry is in patient/world millimetres, so PET and CT from the same
 *    PET/CT exam line up automatically if the reader fills it in correctly.
 */

export type Modality = 'PT' | 'CT';

/** What the numbers in `scalars` mean. The reader should convert PET to SUVbw when it can. */
export type ScalarUnits = 'SUVbw' | 'Bq/ml' | 'HU' | 'counts' | 'unknown';

export type Vec3 = [number, number, number];

/** Any typed array the readers might produce. Kept as-is (no copy) when rendering a single channel. */
export type VoxelArray =
  | Float32Array
  | Float64Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Int8Array
  | Uint8Array;

export interface VolumeGeometry {
  /** Number of voxels along i, j, k. */
  dimensions: Vec3;
  /** Voxel size in mm along i, j, k. */
  spacing: Vec3;
  /** World position (mm) of the CENTRE of voxel (0,0,0). */
  origin: Vec3;
  /**
   * 3x3 orientation, 9 numbers, same convention as vtk.js ImageData:
   *   direction[0..2] = world direction of the i axis
   *   direction[3..5] = world direction of the j axis
   *   direction[6..8] = world direction of the k axis
   * For DICOM: [rowCosines (first 3 of ImageOrientationPatient),
   *             columnCosines (last 3), sliceNormal (cross product)].
   * Use IDENTITY_DIRECTION if the file has no orientation info.
   */
  direction: number[];
}

export interface VolumeChannel {
  modality: Modality;
  geometry: VolumeGeometry;
  /**
   * Voxel values, length = dims[0]*dims[1]*dims[2],
   * ordered i fastest, then j, then k (x fastest, slice last).
   */
  scalars: VoxelArray;
  units: ScalarUnits;
  /** [min, max] of `scalars`. Use `createChannel` and this is computed for you. */
  range: [number, number];
  /** Free-form info the reader wants to pass along (series description, patient weight, ...). */
  metadata: Record<string, string | number>;
}

export interface VolumeStudy {
  id: string;
  pet: VolumeChannel;
  ct?: VolumeChannel;
  /** Where it came from; for display/debugging only. */
  source: { format: string; files: string[] };
}

export const IDENTITY_DIRECTION = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// ---------------------------------------------------------------------------
// Helpers for the readers
// ---------------------------------------------------------------------------

export function voxelCount(g: VolumeGeometry): number {
  return g.dimensions[0] * g.dimensions[1] * g.dimensions[2];
}

export function computeRange(values: ArrayLike<number>): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return [0, 0];
  return [min, max];
}

/** The one function readers should call to build a channel. Validates and computes the range. */
export function createChannel(args: {
  modality: Modality;
  geometry: Partial<VolumeGeometry> & { dimensions: Vec3 };
  scalars: VoxelArray;
  units?: ScalarUnits;
  metadata?: Record<string, string | number>;
}): VolumeChannel {
  const geometry: VolumeGeometry = {
    dimensions: args.geometry.dimensions,
    spacing: args.geometry.spacing ?? [1, 1, 1],
    origin: args.geometry.origin ?? [0, 0, 0],
    direction: args.geometry.direction ?? IDENTITY_DIRECTION.slice(),
  };
  const expected = voxelCount(geometry);
  if (args.scalars.length !== expected) {
    throw new Error(
      `${args.modality}: scalars has ${args.scalars.length} values but dimensions ` +
        `${geometry.dimensions.join('x')} need ${expected}. ` +
        `If the file is multi-frame (dynamic PET), pick one frame first.`
    );
  }
  if (geometry.direction.length !== 9) throw new Error(`${args.modality}: direction must have 9 numbers`);
  if (geometry.spacing.some((s) => !(s > 0))) throw new Error(`${args.modality}: spacing must be > 0`);

  return {
    modality: args.modality,
    geometry,
    scalars: args.scalars,
    units: args.units ?? (args.modality === 'CT' ? 'HU' : 'unknown'),
    range: computeRange(args.scalars),
    metadata: args.metadata ?? {},
  };
}

export function createStudy(args: {
  pet: VolumeChannel;
  ct?: VolumeChannel;
  id?: string;
  source?: { format: string; files: string[] };
}): VolumeStudy {
  if (args.pet.modality !== 'PT') throw new Error('pet channel must have modality PT');
  if (args.ct && args.ct.modality !== 'CT') throw new Error('ct channel must have modality CT');
  return {
    id: args.id ?? crypto.randomUUID(),
    pet: args.pet,
    ct: args.ct,
    source: args.source ?? { format: 'unknown', files: [] },
  };
}

export function hasCT(study: VolumeStudy): study is VolumeStudy & { ct: VolumeChannel } {
  return study.ct !== undefined;
}

/** World-space bounding box [xmin,xmax,ymin,ymax,zmin,zmax] of a geometry (voxel centres). */
export function worldBounds(g: VolumeGeometry): number[] {
  const b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let c = 0; c < 8; c++) {
    const ijk = [
      c & 1 ? g.dimensions[0] - 1 : 0,
      c & 2 ? g.dimensions[1] - 1 : 0,
      c & 4 ? g.dimensions[2] - 1 : 0,
    ];
    for (let a = 0; a < 3; a++) {
      let w = g.origin[a];
      for (let k = 0; k < 3; k++) w += g.direction[k * 3 + a] * g.spacing[k] * ijk[k];
      b[2 * a] = Math.min(b[2 * a], w);
      b[2 * a + 1] = Math.max(b[2 * a + 1], w);
    }
  }
  return b;
}
