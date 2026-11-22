import { VolumeRenderer } from './render/VolumeRenderer';
import { makeTestPET } from './volume/testData';


const renderer = new VolumeRenderer(document.getElementById('view')!);
renderer.setStudy(makeTestPET());
renderer.applyPreset('Hot Iron');