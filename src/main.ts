import './styles.css';
import { VolumeRenderer } from './render/VolumeRenderer';
import { makeTestPET } from './volume/testData';
import { load as loadDicom } from './Loader/Loader';
import { COLOR_MAPS } from './render/transferFunctions';
import { createOpacityEditor, type OpacityEditor } from './ui/opacityEditor';
import type { VolumeStudy } from './volume/VolumeStudy';


const renderer = new VolumeRenderer(document.getElementById('view')!);
const infoEl = document.getElementById('info') as HTMLParagraphElement;
const opacityEditorEl = document.getElementById('opacity-editor')!;


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
renderer.setShading(shadingCheckbox.checked, false);
shadingCheckbox.onchange = () => {renderer.setShading(shadingCheckbox.checked); renderer.render();};


// Reset Camera Logic
const resetCameraButton = document.getElementById('reset-camera') as HTMLButtonElement;
resetCameraButton.onclick = () => {renderer.resetCamera(); renderer.render();};


// Study display: shared by the test volume and real DICOM data
let opacityEditor: OpacityEditor | undefined;

function describeStudy(study: VolumeStudy): string {
    const pet = study.pet;
    const [lo, hi] = pet.range;
    const lines = [
        `PET ${pet.geometry.dimensions.join(' × ')} · ${pet.geometry.spacing.map((s) => s.toFixed(2)).join(' × ')} mm`,
        `${lo.toFixed(2)} → ${hi.toFixed(2)} ${pet.units}`,
    ];
    if (study.ct) lines.push(`CT ${study.ct.geometry.dimensions.join(' × ')} (not rendered)`);
    if (study.source.format === 'dicom') lines.push(`${study.source.files.length} files`);
    else lines.push(`Source: ${study.source.format}`);
    return lines.join(' · ');
}

function showStudy(study: VolumeStudy): void {
    renderer.setStudy(study);

    // setStudy resets to the default colour map; keep the user's choice.
    renderer.setColorMap(colorMapSelect.value);

    opacityEditor?.dispose();
    opacityEditor = createOpacityEditor(
        opacityEditorEl,
        study.pet,
        renderer.getColorTransferFunction()!,
        renderer.getOpacityTransferFunction()!,
        () => renderer.render()
    );

    infoEl.textContent = describeStudy(study);
    renderer.render();
}


// Test data button
const loadTestButton = document.getElementById('load-test') as HTMLButtonElement;
loadTestButton.onclick = () => showStudy(makeTestPET());


// DICOM folder button -> hidden folder picker -> Loader -> renderer
const loadDicomButton = document.getElementById('load-dicom') as HTMLButtonElement;
const dicomInput = document.getElementById('dicom-input') as HTMLInputElement;

loadDicomButton.onclick = () => dicomInput.click();

dicomInput.onchange = async () => {
    const files = Array.from(dicomInput.files ?? []);
    dicomInput.value = ''; // allow re-selecting the same folder
    if (files.length === 0) return;

    loadDicomButton.disabled = true;
    loadTestButton.disabled = true;
    const previousInfo = infoEl.textContent;
    infoEl.textContent = `Loading ${files.length} files…`;

    try {
        const t0 = performance.now();
        const study = await loadDicom(files);
        showStudy(study);
        console.log(`DICOM study loaded in ${(performance.now() - t0).toFixed(0)} ms`, study);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('DICOM load failed:', err);
        infoEl.textContent = previousInfo;
        alert(`Could not load DICOM folder:\n${msg}`);
    } finally {
        loadDicomButton.disabled = false;
        loadTestButton.disabled = false;
    }
};


// Start with the synthetic volume so the view isn't empty
showStudy(makeTestPET());
