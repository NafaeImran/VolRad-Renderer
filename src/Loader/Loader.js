import dicomParser from 'dicom-parser'
const PET_CLASS_UID="1.2.840.10008.5.1.4.1.1.128"
const CT_CLASS_UID="1.2.840.10008.5.1.4.1.1.2"


async function readFile (file) {
    const buffer= await file.arrayBuffer();
    return new Uint8Array(buffer);
}
export async function parseFile (file)
{
    let fileDataset;
    const fileBytes = await readFile(file);
    try {
        fileDataset=dicomParser.parseDicom(fileBytes);

    }
    catch(err) {console.log('parse failed:', err); return null;}
    const classUID=fileDataset.string("x00080016");
    if(classUID!==PET_CLASS_UID && classUID!==CT_CLASS_UID)
    {
        // console.log("Class is neither CT or PET");
        return null;
    }
    if (!fileDataset.elements.x7fe00010) {
        console.log('no pixel data');
        return null;
    }

    let position = fileDataset.string('x00200032');
    if (!position) {
        console.log('no position', {
            sopClass: fileDataset.string('x00080016'),
            imageType: fileDataset.string('x00080008'),
            frames: fileDataset.string('x00280008'),
            hasPerFrame: !!fileDataset.elements.x52009230,
            sliceLocation: fileDataset.string('x00201041'),
        });
        return null;
    }
    position=position.split('\\').map(Number);
    const modality = fileDataset.string('x00080060');
    const rows = fileDataset.uint16('x00280010');
    const columns = fileDataset.uint16('x00280011');
    const signed = fileDataset.uint16('x00280103') === 1;
    const slope = fileDataset.floatString('x00281053') ?? 1;
    const seriesUID=fileDataset.string('x0020000e');
    const frameOfRefUID=fileDataset.string("x00200052");
    const pixelSpacing=fileDataset.string("x00280030").split('\\').map(Number);
    const orientation=fileDataset.string("x00200037").split('\\').map(Number);
    const intercept=fileDataset.floatString("x00281052")??0;


    return {data:fileBytes,dataset:fileDataset,signed,slope,position,modality,rows,seriesUID,frameOfRefUID,pixelSpacing,orientation,intercept,columns};
}
export function groupBySeries(slices)
{
    let map=new Map();
    for(const s of slices)
    {
        if (!map.has(s.seriesUID))
        {
            map.set(s.seriesUID,[]);
        }
        map.get(s.seriesUID).push(s);

    }

    return map;
}