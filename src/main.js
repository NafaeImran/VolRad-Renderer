// Registers the WebGL/WebGPU volume rendering backend. Without this, volumes silently render nothing.
import '@kitware/vtk.js/Rendering/Profiles/Volume';

import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkXMLImageDataReader from '@kitware/vtk.js/IO/XML/XMLImageDataReader';

// --- rendering setup ---
const fsr = vtkFullScreenRenderWindow.newInstance({ background: [0.1, 0.1, 0.1] });
const renderer = fsr.getRenderer();
const renderWindow = fsr.getRenderWindow();

const mapper = vtkVolumeMapper.newInstance();
mapper.setSampleDistance(1.0);

const volume = vtkVolume.newInstance();
volume.setMapper(mapper);

const ctf = vtkColorTransferFunction.newInstance();
const otf = vtkPiecewiseFunction.newInstance();
const prop = volume.getProperty();
prop.setRGBTransferFunction(0, ctf);
prop.setScalarOpacity(0, otf);
prop.setInterpolationTypeToLinear();
renderer.addVolume(volume);

// --- show a loaded image ---
function show(imageData) {
  const [min, max] = imageData.getPointData().getScalars().getRange();
  ctf.removeAllPoints();
  ctf.addRGBPoint(min, 0.0, 0.0, 0.0);
  ctf.addRGBPoint(max, 1.0, 1.0, 1.0);
  otf.removeAllPoints();
  otf.addPoint(min, 0.0);
  otf.addPoint(max, 0.5);

  mapper.setInputData(imageData);
  renderer.resetCamera();
  renderWindow.render();
}

// --- loading ---
const reader = vtkXMLImageDataReader.newInstance();
function loadBuffer(buffer) {
  reader.parseAsArrayBuffer(buffer);
  show(reader.getOutputData(0));
}

// sample dataset hosted by Kitware
fetch('https://kitware.github.io/vtk-js/data/volume/LIDC2.vti')
  .then((r) => r.arrayBuffer())
  .then(loadBuffer);

// local file picker
const input = document.createElement('input');
input.type = 'file';
input.accept = '.vti';
input.style.cssText = 'position:absolute;top:10px;left:10px;z-index:10';
document.body.appendChild(input);
input.onchange = async (e) => loadBuffer(await e.target.files[0].arrayBuffer());