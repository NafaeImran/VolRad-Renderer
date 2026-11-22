import type vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';


export interface TransferFunctionSpec {
    name: string;
    color: {x: number, r: number, g: number, b: number}[];
    opacity: {x: number, a: number}[];
}

export interface Preset {
    name: string;
    build: (range: [number, number]) => TransferFunctionSpec;
}

const at = (range: [number, number], t: number) => range[0] + (t * (range[1] - range[0]));


export const PET_PRESETS: Preset[] = [
    {
        name: 'Hot Iron',
        build: (range) => ({
            name: 'Hot Iron',
            color: [
                {x: at(range, 0.0), r: 0, g: 0, b: 0},
                {x: at(range, 0.25), r: 0.6, g: 0, b: 0},
                {x: at(range, 0.5), r: 1, g: 0.5, b: 0},
                {x: at(range, 0.75), r: 1, g: 0.85, b: 0.2},
                {x: at(range, 1.0), r: 1, g: 1, b: 1},
            ],
            opacity: [
                {x: at(range, 0.0), a: 0},
                {x: at(range, 0.15), a: 0.0},
                {x: at(range, 0.4), a: 0.3},
                {x: at(range, 1.0), a: 0.9},
            ]
        }),
    },

    {
        name: 'GrayScale',
        build: (range) => ({
            name: 'GrayScale',
            color: [
                {x: at(range, 0.0), r: 0, g: 0, b: 0},
                {x: at(range, 1.0), r: 1, g: 1, b: 1},
            ],
            opacity: [
                {x: at(range, 0.0), a: 0},
                {x: at(range, 0.1), a: 0},
                {x: at(range, 1.0), a: 1},
            ]
        })
    },

    {
        name: 'Faint Body + Hot Spots',
        build: (range) => ({
            name: 'Faint Body + Hot Spots',
            color: [
                {x: at(range, 0.0), r:0.2, g:0.3, b:0.6 },
                {x: at(range, 0.3), r:1, g:0.3, b:0 },
                {x: at(range, 1.0), r:1, g:1, b:0.6 },
            ],
            opacity: [
                {x: at(range, 0.0), a: 0},
                {x: at(range, 0.03), a: 0.01},
                {x: at(range, 0.2), a: 0.01},
                {x: at(range, 0.3), a: 0.6},
                {x: at(range, 1.0), a: 0.9},
            ],
        }),  
    },
]


export function applySpec(spec: TransferFunctionSpec, colorTransferFunction: vtkColorTransferFunction, opacityTransferFunction: vtkPiecewiseFunction) {
    colorTransferFunction.removeAllPoints();
    for (const c of spec.color)
        colorTransferFunction.addRGBPoint(c.x, c.r, c.g, c.b);
    opacityTransferFunction.removeAllPoints();
    for (const o of spec.opacity)
        opacityTransferFunction.addPoint(o.x, o.a);
}