import '@kitware/vtk.js/Rendering/Profiles/Volume';

import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { BlendMode } from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';


import type { VolumeStudy } from '../volume/VolumeStudy';
import { toImageData } from './toImageData';



import { COLOR_MAPS, defaultOpacity, applyColor, applyOpacity } from './transferFunctions';


export class VolumeRenderer {

    private grw: vtkGenericRenderWindow;
    private mapper: vtkVolumeMapper;
    private volume: vtkVolume;
    private colorTransferFunction?: vtkColorTransferFunction;
    private opacityTransferFunction?: vtkPiecewiseFunction;
    private imageData?: vtkImageData;
    private study?: VolumeStudy;
    private currentCmap?: string;

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
        this.currentCmap = COLOR_MAPS[0].name;
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
        applyColor(COLOR_MAPS[0].build([low, high]), this.colorTransferFunction!);
        applyOpacity(defaultOpacity([low, high]), this.opacityTransferFunction!);
        this.resetCamera();
    }


    getColorTransferFunction(): vtkColorTransferFunction | undefined {
        return this.colorTransferFunction;
    }

    getOpacityTransferFunction(): vtkPiecewiseFunction | undefined {
        return this.opacityTransferFunction;
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
        const cmap = COLOR_MAPS.find((p) => p.name === name);
        if (cmap) {
            applyColor(cmap.build(this.study?.pet.range || [0, 1]), this.colorTransferFunction!);
            applyOpacity(defaultOpacity(this.study?.pet.range || [0, 1]), this.opacityTransferFunction!);
        }
        if (rerender) this.render();
    }


    setColorMap(name: string): void {
        this.currentCmap = name;

        const cmap = COLOR_MAPS.find((p) => p.name === name);
        if (cmap) {
            applyColor(cmap.build(this.study?.pet.range || [0, 1]), this.colorTransferFunction!);
        }
    }

    setRenderMode(mode: 'MIP' | 'Composite', rerender = true): void {
        const renderer = this.grw.getRenderer();
        switch (mode) {
            case 'MIP':
                this.mapper.setBlendMode(BlendMode.MAXIMUM_INTENSITY_BLEND);
                break;
            case 'Composite':
                this.mapper.setBlendMode(BlendMode.COMPOSITE_BLEND);
                break;
        }
        if (rerender) this.render();
    }

    setShading(enabled: boolean, rerender = true): void {
        const prop = this.volume.getProperty();
        prop.setShade(enabled);
        if (rerender) this.render();
    }


}


