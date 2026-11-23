import dicomParser from 'dicom-parser'
const PET_CLASS_UID="1.2.840.10008.5.1.4.1.1.128"
const CT_CLASS_UID="1.2.840.10008.5.1.4.1.1.2"
type DataSet = ReturnType<typeof dicomParser.parseDicom>;
import {createStudy, type Vec3, type VolumeChannel, type VolumeGeometry, type VolumeStudy,type ScalarUnits} from "../volume/VolumeStudy.ts";
import { createChannel } from '../volume/VolumeStudy.ts';
export interface Slice {
    data: Uint8Array;
    dataset: DataSet;
    modality: string;
    seriesUID: string;
    frameOfRefUID: string | undefined;
    position: number[];
    orientation: number[];
    pixelSpacing: number[];
    rows: number;
    columns: number;
    signed: boolean;
    slope: number;
    intercept: number;
    bitsAllocated:number;
}
const GAP_TOLERANCE=0.01;
function cross(a:Vec3,b:Vec3):Vec3
{
    const i=a[1]*b[2]-a[2]*b[1];
    const j=a[2]*b[0]-a[0]*b[2];
    const k=a[0]*b[1]-a[1]*b[0];
    return [i,j,k];
}
function dot(a:Vec3,b:Vec3):number
{
    return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}
async function readFile (file:Blob) {
    const buffer= await file.arrayBuffer();
    return new Uint8Array(buffer);
}
export async function parseFile (file:Blob):Promise<Slice|null>
{
    let fileDataset:DataSet;
    const fileBytes = await readFile(file);
    try {
        fileDataset=dicomParser.parseDicom(fileBytes);

    }
    catch(err) {console.log('parse failed:', err); return null;}
    const classUID=fileDataset.string("x00080016");
    if(classUID!==PET_CLASS_UID && classUID!==CT_CLASS_UID)
    {
        // console.log("Class is neither CT or PET.UID:",classUID);
        return null;
    }
    if (!fileDataset.elements.x7fe00010) {
        // console.log('no pixel data');
        return null;
    }

    const positionStr = fileDataset.string('x00200032');
    if (!positionStr) {
        // console.log('no position', {
        //     sopClass: fileDataset.string('x00080016'),
        //     imageType: fileDataset.string('x00080008'),
        //     frames: fileDataset.string('x00280008'),
        //     hasPerFrame: !!fileDataset.elements.x52009230,
        //     sliceLocation: fileDataset.string('x00201041'),
        // });
        return null;
    }
    const position=positionStr.split('\\').map(Number);
    const modality = fileDataset.string('x00080060');
    if(!modality){return null;}
    const rows = fileDataset.uint16('x00280010');
    if(!rows){return null;}
    const columns = fileDataset.uint16('x00280011');
    if(!columns){return null;}
    const signed = fileDataset.uint16('x00280103') === 1;
    const slope = fileDataset.floatString('x00281053') ?? 1;
    const seriesUID=fileDataset.string('x0020000e');
    if(!seriesUID){return null;}
    const frameOfRefUID=fileDataset.string("x00200052");
    const pixelSpacingStr=fileDataset.string("x00280030")
    if(!pixelSpacingStr) {
        return null;
    }
    const pixelSpacing=pixelSpacingStr.split('\\').map(Number);
    const orientationStr=fileDataset.string("x00200037");
    if(!orientationStr) {
        return null;
    }
    const orientation=orientationStr.split('\\').map(Number);
    const intercept=fileDataset.floatString("x00281052")??0;

    const bitsAllocated = fileDataset.uint16('x00280100');
    if(!bitsAllocated){return null;}
    return {data:fileBytes,dataset:fileDataset,signed,slope,position,modality,rows,seriesUID,frameOfRefUID,pixelSpacing,orientation,intercept,columns,bitsAllocated};
}
export function groupBySeries(slices:Slice[])
{
    const map=new Map<string,Slice[]>();
    for(const s of slices)
    {
        let group = map.get(s.seriesUID);
        if (!group) {
            group = [];
            map.set(s.seriesUID, group);
        }
        group.push(s);

    }

    return map;
}


export function zRange(series:Slice[])
{
    let minZ=series[0].position[2];
    let maxZ=series[0].position[2];
    for(const s of series)
    {
        if(s.position[2]>maxZ)
        {
            maxZ=s.position[2];
        }
        if(s.position[2]<minZ)
        {
            minZ=s.position[2];
        }

    }
    return {maxZ,minZ};
}
export function findOverlap(ct:Slice[],pet:Slice[])
{
    const { maxZ: maxZCT, minZ: minZCT } = zRange(ct);
    const { maxZ: maxZPET, minZ: minZPET } = zRange(pet);
    const end=Math.min(maxZPET,maxZCT);
    const start=Math.max(minZCT,minZPET);
    return Math.max(0,end-start);
}
//TODO:Allow the user to pick their own ct scan instead of picking one ourselves
export function pickPetCt(slicesMap:Map<string,Slice[]>):{pet:Slice[];ct?:Slice[],ctSameFrame:boolean}|null
{
    const petScans:Slice[][]=[];
    const ctScans:Slice[][]=[];
    for (const group of slicesMap.values())
    {
        if(group[0].modality==="PT")
        {
            petScans.push(group)
        }
        else if(group[0].modality==="CT")
        {
            ctScans.push(group)
        }
    }
    if(petScans.length===0)
    {
        console.log("No petScans found.");
        return null;
    }

    let pet;
    if(petScans.length>1)
    {
        let largestSize=petScans[0].length;
        let largestIdx=0;
        for(const [idx,petScan] of petScans.entries())
        {
            if(petScan.length>largestSize)
            {
                largestSize=petScan.length;
                largestIdx=idx;
            }
        }
        pet=petScans[largestIdx];
    }
    else
    {
        pet=petScans[0];
    }
    const frameOfRefUID=pet[0].frameOfRefUID;
    let ct;
    let viableCTs:Slice[][]=[]
    for(const ctScan of ctScans)
    {
        if(ctScan[0].frameOfRefUID===frameOfRefUID)
        {
            viableCTs.push(ctScan);
        }
    }
    const ctSameFrame = viableCTs.length > 0

    if(viableCTs.length===0)
    {
        viableCTs=ctScans
    }
    if(viableCTs.length>1)
    {

        let maxOverlap=findOverlap(viableCTs[0],pet);
        ct=viableCTs[0];
        for(const ctScan of viableCTs)
        {
            const overlap=findOverlap(ctScan,pet);
            if(overlap>maxOverlap)
            {
                maxOverlap=overlap;
                ct=ctScan;
            }
        }

    }
    else
    {
        ct=viableCTs[0];
    }

    return {pet,ct,ctSameFrame};
}
type SliceDist = { slice: Slice; dist: number };
function distSort(a: SliceDist, b:SliceDist):number
{
    return a.dist-b.dist;
}
export function sortSlices(series:Slice[]):{slices:Slice[],normal:Vec3,gaps:number[],minGap:number,maxGap:number,avgGap:number}
{
    if(series.length<2)
    {
        throw new Error("Slices is less than 2.");
    }
    const s0=series[0];
    const o=s0.orientation;
    const rowDir:Vec3=[o[0],o[1],o[2]];
    const colDir:Vec3=[o[3],o[4],o[5]];
    const normal=cross(rowDir,colDir);

    const pairs:SliceDist[] = series.map((s) => ({ slice: s, dist: dot(s.position as Vec3, normal) }));
    pairs.sort(distSort);
    const gaps:number[]=[];
    let totalGap:number=0;

    let minGap:number=pairs[1].dist-pairs[0].dist;
    let maxGap:number=pairs[1].dist-pairs[0].dist;
    for(let i=0;i<pairs.length-1;i++)
    {
        let gap=pairs[i+1].dist-pairs[i].dist;
        gaps.push(gap);
        if(gap>maxGap)
        {
            maxGap=gap;
        }
        if(gap<minGap)
        {
            minGap=gap;
        }
        totalGap+=gap;


    }
    const avgGap=totalGap/gaps.length;
    if(avgGap<1e-10)
    {
        throw new Error("Slices have no gap");
    }
    const allowedTolerance=avgGap*GAP_TOLERANCE;
    for(let i=0;i<gaps.length;i++)
    {
        if(Math.abs(gaps[i]-avgGap)>allowedTolerance)
        {
            throw new Error(`${series[0].modality} series: irregular slice spacing between z = ${pairs[i].dist} and z = ${pairs[i+1].dist} mm`);
        }
    }

    return {slices:pairs.map((p) => p.slice),normal,gaps,minGap,maxGap,avgGap};




}

export function readPixels(slice:Slice):ArrayLike<number>
{
    const dataSet=slice.dataset;
    const element = dataSet.elements.x7fe00010;
    const signed=slice.signed;
    const bitsAllocated=slice.bitsAllocated;
    const offset=element.dataOffset;
    const expectedSize=(slice.rows*slice.columns*bitsAllocated)/8;
    if(expectedSize!==element.length) {
        throw new Error(`Expected Size (${expectedSize}) is not equal to actual size (${element.length})`);

    }
    const dataStart=slice.data.byteOffset+offset;
    const dataEnd=dataStart+element.length;
    const pixelBuffer = slice.data.buffer.slice(dataStart, dataEnd);

    switch(bitsAllocated) {
        case 8:
            return signed ? new Int8Array(pixelBuffer) : new Uint8Array(pixelBuffer);
        case 16:
            return signed ? new Int16Array(pixelBuffer) : new Uint16Array(pixelBuffer);
        case 32:
            return signed ? new Int32Array(pixelBuffer) : new Uint32Array(pixelBuffer);
        default:
            throw new Error(`Unsupported Bits Allocated: ${bitsAllocated}`);
    }


}
export function buildVolume(slices:Slice[],normal:Vec3,avgGap:number):{scalars:Float32Array;geometry:VolumeGeometry}
{
    const firstSlice=slices[0];
    const firstSliceRows=firstSlice.rows;
    const firstSliceCols=firstSlice.columns;
    const firstSliceSize=firstSliceRows*firstSliceCols;

    const scalars=new Float32Array(firstSliceSize*slices.length);
    for(let i=0;i<slices.length; i++)
    {

        const slice=slices[i];
        if(slice.rows!==firstSliceRows || slice.columns!==firstSliceCols)
        {
            throw new Error(`${slice.modality} Slice Size mismatch: First Slice:${firstSliceRows}x${firstSliceCols} vs Current Slice ${slice.rows}x${slice.columns}`);
        }

        const pixelData=readPixels(slice);
        const dataPos=i*firstSliceSize;
        const slope=slice.slope;
        const intercept=slice.intercept;
        for (let k = 0; k < pixelData.length; k++)
        {
            scalars[dataPos+k]=pixelData[k]*slope+intercept;
        }




    }
    const dimensions:Vec3=[firstSlice.columns,firstSlice.rows,slices.length];
    const spacing:Vec3=[firstSlice.pixelSpacing[1],firstSlice.pixelSpacing[0],avgGap];
    const origin:Vec3=[firstSlice.position[0],firstSlice.position[1],firstSlice.position[2]];
    const direction:number[]=[...firstSlice.orientation,...normal];
    const geometry:VolumeGeometry={dimensions,spacing,origin,direction};
    return {scalars,geometry};

}
function dicomTimeToSeconds(t:string):number
{
    const hours=Number(t.slice(0,2));
    const minutes=Number(t.slice(2,4));
    const seconds=Number(t.slice(4));
    return hours*3600+minutes*60+seconds;

}

export function computeSuvFactor(slice:Slice):number|null
{
    const dataset=slice.dataset;
    const units=dataset.string('x00541001');
    if(units !== 'BQML' )
    {return null;}
    const decay=dataset.string('x00541102');
    if(decay !== 'START')
    {return null;}

    const weight=dataset.floatString('x00101030');
    if(!weight)
    {
        return null;
    }
    const seriesTime=dataset.string('x00080031');
    if(!seriesTime)
    {return null;}
    const radInfoData = dataset.elements.x00540016?.items?.[0]?.dataSet;
    if(!radInfoData)
        {return null;}
    const radTotalDoses=radInfoData.floatString('x00181074');
    if(!radTotalDoses)
    {
        return null;
    }
    const radHalfLife=radInfoData.floatString('x00181075');
    if(!radHalfLife)
    {
        return null;
    }
    const radStartTime=radInfoData.string('x00181072');
    if(!radStartTime)
    {
        return null;

    }

    const injectionSeconds=dicomTimeToSeconds(radStartTime);
    const seriesSeconds=dicomTimeToSeconds(seriesTime);
    let timeElapsed=seriesSeconds-injectionSeconds;
    if(timeElapsed<0)
    {
        timeElapsed+=24*3600;
    }
    if(timeElapsed<0||timeElapsed>24*3600)
    {
        return null;
    }
    const decayedDose=radTotalDoses*Math.exp(-Math.log(2)*(timeElapsed/radHalfLife));
    return (weight*1000)/decayedDose;







}
function buildSeriesVolume(series:Slice[]):{sortedSlices:Slice[],geometry:VolumeGeometry,scalars:Float32Array}
{
    const {slices:sortedSlices,normal,gaps,minGap,maxGap,avgGap}=sortSlices(series);
    const{scalars,geometry}=buildVolume(sortedSlices,normal,avgGap);
    return {sortedSlices,geometry,scalars};

}
export async function load(files:Blob[]):Promise<VolumeStudy>
{
    const promisedSlices=files.map((file)=>parseFile(file));
    const results=await Promise.all(promisedSlices);
    const slices=results.filter((slice)=>slice!==null);

    if(slices.length===0)
    {
        throw new Error('No CT or PET image slices found in the dropped files.')
    }
    const groups=groupBySeries(slices);
    const pickedSeries=pickPetCt(groups);
    if(!pickedSeries)
    {
        throw new Error('No PET series found in the dropped files.')
    }
    const{pet:petSeries,ct:ctSeries,ctSameFrame}=pickedSeries;
    const {sortedSlices:petSortedSlices,geometry:petGeometry,scalars:petScalars}=buildSeriesVolume(petSeries);
    const suvFactor=computeSuvFactor(petSortedSlices[0]);
    let petUnits:ScalarUnits;
    if(suvFactor!==null)
    {
        for(let i=0;i<petScalars.length;i++)
        {
            petScalars[i]*=suvFactor;
        }
        petUnits="SUVbw";

    }
    else
    {
        petUnits="Bq/ml";
    }
    const petMetadata={studyUID: petSeries[0].dataset.string('x0020000d') ?? 'unknown',frameOfReferenceUID: petSeries[0].frameOfRefUID ?? 'unknown'};
    const petChannel=createChannel({modality:"PT",geometry:petGeometry,scalars:petScalars,units:petUnits,metadata:petMetadata});

    let ctChannel: VolumeChannel | undefined;
    try {
        if (ctSeries) {
            if(!ctSameFrame)
            {
                console.warn("different exam, alignment not guaranteed")
            }
            const {
                sortedSlices: ctSortedSlices,
                geometry: ctGeometry,
                scalars: ctScalars
            } = buildSeriesVolume(ctSeries);
            const ctMetadata={sameFrameAsPet:ctSameFrame?'yes':"no",studyUID: ctSeries[0].dataset.string('x0020000d') ?? 'unknown',frameOfReferenceUID: ctSeries[0].frameOfRefUID ?? 'unknown'};
            ctChannel = createChannel({modality: 'CT', geometry: ctGeometry, scalars: ctScalars, units: 'HU',metadata:ctMetadata});

        }
    }
    catch(err)
    {
        console.warn('CT skipped: ' + (err instanceof Error ? err.message : String(err)));
    }

    const study = createStudy({
        pet: petChannel,
        ct: ctChannel,
        source: { format: 'dicom', files: files.map((f) => (f instanceof File ? f.name : '')) },
    });
    return study;


}
