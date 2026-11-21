import dicomParser from 'dicom-parser'
const PET_CLASS_UID="1.2.840.10008.5.1.4.1.1.128"
const CT_CLASS_UID="1.2.840.10008.5.1.4.1.1.2"
type DataSet = ReturnType<typeof dicomParser.parseDicom>;

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
        console.log('no pixel data');
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
    if(!frameOfRefUID){return null;}
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


    return {data:fileBytes,dataset:fileDataset,signed,slope,position,modality,rows,seriesUID,frameOfRefUID,pixelSpacing,orientation,intercept,columns};
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
export function pickPetCt(slicesMap:Map<string,Slice[]>):{pet:Slice[];ct?:Slice[]}|null
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

    return {pet,ct};
}