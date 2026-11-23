import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import type {VolumeChannel, VoxelArray} from '../volume/VolumeStudy';

export function toImageData(channel: VolumeChannel): vtkImageData {
    const g = channel.geometry;
    const image = vtkImageData.newInstance();
    image.setDimensions(g.dimensions);
    image.setSpacing(g.spacing);
    image.setOrigin(g.origin);

    const scalars = vtkDataArray.newInstance({
        name: 'scalers',
        numberOfComponents: 1,
        values: gpuFriendly(channel.scalars),
    });
    
    image.getPointData().setScalars(scalars);
    return image;
}


function gpuFriendly(a: VoxelArray): VoxelArray {
  if (a instanceof Float32Array || a instanceof Int16Array || a instanceof Uint16Array || a instanceof Uint8Array) {
    return a; // no copy
  }
  return Float32Array.from(a);
}