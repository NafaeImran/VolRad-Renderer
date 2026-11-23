import './styles.css';
import { VolumeRenderer } from './render/VolumeRenderer';
import { makeTestPET } from './volume/testData';
import { COLOR_MAPS } from './render/transferFunctions';
import { createOpacityEditor, type OpacityEditor } from './ui/opacityEditor';
import type { VolumeStudy } from './volume/VolumeStudy';


const renderer = new VolumeRenderer(document.getElementById('view')!);

const loadtestButton = document.getElementById('load-test') as HTMLElement;
loadtestButton.onclick = () => {renderer.setStudy(makeTestPET());};

renderer.setStudy(makeTestPET());


// Color Map Logic
const colorMapSelect = document.getElementById('colormap') as HTMLSelectElement;
for (const c of COLOR_MAPS) 
    colorMapSelect.add(new Option(c.name, c.name));
colorMapSelect.value = COLOR_MAPS[0].name;
colorMapSelect.onchange = () => {renderer.setColorMap(colorMapSelect.value); opacityEditor?.refresh(); renderer.render();};


// Renderer Logic
const renderModeSelect = document.getElementById('mode') as HTMLSelectElement;
for (const m of ['MIP', 'Composite'])
    renderModeSelect.add(new Option(m, m));
renderModeSelect.value = 'Composite';
renderModeSelect.onchange = () => {renderer.setRenderMode(renderModeSelect.value as 'MIP' | 'Composite'); renderer.render();};


// Shading Logic
const shadingCheckbox = document.getElementById('shade') as HTMLInputElement;
shadingCheckbox.checked = true;
renderer.setShading(shadingCheckbox.checked); 
shadingCheckbox.onchange = () => {renderer.setShading(shadingCheckbox.checked); renderer.render();};



// Reset Camera Logic
const resetCameraButton = document.getElementById('reset-camera') as HTMLButtonElement;
resetCameraButton.onclick = () => {renderer.resetCamera(); renderer.render();};




// Opacity Editor Logic
let opacityEditor: OpacityEditor | undefined;
opacityEditor = createOpacityEditor(
    document.getElementById('opacity-editor')!,
    renderer.getStudy()!.pet,
    renderer.getColorTransferFunction()!,
    renderer.getOpacityTransferFunction()!,
    () => {renderer.render();}
);


function showStudy(study: VolumeStudy): void {
    renderer.setStudy(study);
    opacityEditor?.dispose();
    
    opacityEditor = createOpacityEditor(
        document.getElementById('opacity-editor')!,
        study.pet,
        renderer.getColorTransferFunction()!,
        renderer.getOpacityTransferFunction()!,
        () => renderer.render()
    )
    
}