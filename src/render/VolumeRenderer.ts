import '@kitware/vtk.js/Rendering/Profiles/Volume';

import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { VolumeStudy } from '../volume/VolumeStudy';
import { toImageData } from './toImageData';


import { PET_PRESETS, applySpec } from './transferFunctions';


export class VolumeRenderer {

    private grw: vtkGenericRenderWindow;
    private mapper: vtkVolumeMapper;
    private volume: vtkVolume;
    private colorTransferFunction?: vtkColorTransferFunction;
    private opacityTransferFunction?: vtkPiecewiseFunction;
    private imageData?: vtkImageData;
    private study?: VolumeStudy;


    constructor(container: HTMLElement) { 
        this.grw = vtkGenericRenderWindow.newInstance({
            background: [1.0, 1.0, 1.0],
        });

        this.grw.setContainer(container);
        this.grw.resize();

        new ResizeObserver(() => this.grw?.resize()).observe(container);

        this.mapper = vtkVolumeMapper.newInstance();
        this.volume = vtkVolume.newInstance();
        this.volume.setMapper(this.mapper);
        this.colorTransferFunction = vtkColorTransferFunction.newInstance();
        this.opacityTransferFunction = vtkPiecewiseFunction.newInstance();

        const prop = this.volume.getProperty();
        prop.setRGBTransferFunction(0, this.colorTransferFunction);
        prop.setScalarOpacity(0, this.opacityTransferFunction);
        prop.setInterpolationTypeToLinear();
        prop.setAmbient(0.25);
        prop.setDiffuse(0.75);
        prop.setSpecular(0.2);


    }

    setStudy(study: VolumeStudy) {
        this.study = study;

        const newImage = toImageData(study.pet);
        this.mapper.setInputData(newImage);
        this.imageData?.delete();
        this.imageData = newImage;

        const minSpacing = Math.min(...study.pet.geometry.spacing);
        this.mapper.setSampleDistance(minSpacing * 0.5);
        this.volume.getProperty().setScalarOpacityUnitDistance(0, minSpacing);

        const renderer = this.grw?.getRenderer();
        renderer?.removeAllVolumes();
        renderer?.addVolume(this.volume);


        const [low, high] = study.pet.range;
        this.applyPreset(PET_PRESETS[0].name, false);


        this.resetCamera();
    }


    getStudy(): VolumeStudy | undefined {
        return this.study;
    }

    resetCamera() {
        const renderer = this.grw.getRenderer();
        const camera = renderer.getActiveCamera();
        camera.setFocalPoint(0, 0, 0);
        camera.setPosition(0, -1, 0);
        camera.setViewUp(0, 1, 0);
        renderer.resetCamera();
    }


    render(): void {
        this.grw.getRenderWindow().render();
    }

    applyPreset(name: string, rerender = true): void {
        const preset = PET_PRESETS.find((p) => p.name === name);
        if (preset) {
            applySpec(preset.build(this.study?.pet.range || [0, 1]), this.colorTransferFunction!, this.opacityTransferFunction!);
        }
        if (rerender) this.render();
    }
}


