import vtkPiecewiseGaussianWidget from '@kitware/vtk.js/Interaction/Widgets/PiecewiseGaussianWidget';
import type { VolumeChannel } from '../volume/VolumeStudy';
import type vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction'; 

export interface OpacityEditor {
    refresh(): void;
    dispose(): void;
}

export function createOpacityEditor(container: HTMLElement, channel: VolumeChannel, ctf: vtkColorTransferFunction, otf: vtkPiecewiseFunction, onChange: () => void): OpacityEditor {
    const widget = vtkPiecewiseGaussianWidget.newInstance({numberOfBins: 256, size: [326, 150]});

    widget.updateStyle({
    backgroundColor: 'rgba(255, 255, 255, 1)',
    histogramColor: 'rgba(0, 0, 0, 0.15)',
    strokeColor: 'rgb(15, 15, 15)',
    activeColor: 'rgb(242, 140, 40)',
    handleColor: 'rgb(6, 95, 212)',
    buttonFillColor: 'rgba(242, 242, 242, 1)',
    buttonStrokeColor: 'rgba(15, 15, 15, 1)',
    });

    widget.setDataArray(channel.scalars);
    widget.setColorTransferFunction(ctf);

    widget.addGaussian(0.6, 0.8, 0.3, 0.0, 0.0);
    widget.setContainer(container);
    widget.bindMouseListeners();

    widget.onOpacityChange(() => {
        widget.applyOpacity(otf, channel.range);
        onChange();
    });

    widget.applyOpacity(otf, channel.range);
    onChange();

    return {
        refresh() {
            widget.render();
        },
        dispose() {
            widget.unbindMouseListeners();
            widget.delete();
            container.innerHTML = '';
        }}
}