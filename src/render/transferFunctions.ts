import type vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';




export interface ColorPoint {
    x: number, r: number, g: number, b: number;
}

export interface OpacityPoint {
    x: number, a: number;
}


export interface ColorMap {
    name: string;
    build: (range: [number, number]) => ColorPoint[];
}


export const COLOR_MAPS: ColorMap[] = [ 
    {
        name: 'Hot Iron',
        build: (range) => [
            {x: at(range, 0.0), r: 0, g: 0, b: 0},
            {x: at(range, 0.25), r: 0.6, g: 0, b: 0},
            {x: at(range, 0.5), r: 1, g: 0.5, b: 0},
            {x: at(range, 0.75), r: 1, g: 0.85, b: 0.2},
            {x: at(range, 1.0), r: 1, g: 1, b: 1},
        ]
    },
    {
        name: 'GrayScale',
        build: (range) => [
            {x: at(range, 0.0), r: 0, g: 0, b: 0},
            {x: at(range, 1.0), r: 1, g: 1, b: 1},
        ]
    },
    {
        name: 'Rainbow',
        build: (range) => [
            {x: at(range, 0.0), r: 0, g: 0, b: 1},
            {x: at(range, 0.2), r: 0, g: 1, b: 1},
            {x: at(range, 0.4), r: 0, g: 1, b: 0},
            {x: at(range, 0.6), r: 1, g: 1, b: 0},
            {x: at(range, 0.8), r: 1, g: 0, b: 0},
            {x: at(range, 1.0), r: 1, g: 0, b: 1},
        ]
    }

]
    

const at = (range: [number, number], t: number) => range[0] + (t * (range[1] - range[0]));


export function applyColor(points: ColorPoint[], colorTransferFunction: vtkColorTransferFunction) {
    colorTransferFunction.removeAllPoints();
    for (const c of points)
        colorTransferFunction.addRGBPoint(c.x, c.r, c.g, c.b);
}

export function applyOpacity(points: OpacityPoint[], opacityTransferFunction: vtkPiecewiseFunction) {
    opacityTransferFunction.removeAllPoints();
    for (const o of points)
        opacityTransferFunction.addPoint(o.x, o.a);
}

export const defaultOpacity = (range: [number, number]) =>  [
                {x: at(range, 0.0), a: 0},
                {x: at(range, 0.03), a: 0.01},
                {x: at(range, 0.2), a: 0.01},
                {x: at(range, 0.3), a: 0.6},
                {x: at(range, 1.0), a: 0.9},
            ]
