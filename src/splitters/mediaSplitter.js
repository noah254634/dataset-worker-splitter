import { getDeterministicSplit, uploadToR2 } from '../r2Helpers.js';
// Note: You would typically npm install fflate for streaming unzip support
import { unzipSync } from 'fflate'; 

export async function processMediaZip(env, requestBody, projectId) {
  // 1. Convert the stream to an ArrayBuffer 
  // (For very large ZIPs >100MB, you would use a 'TransformStream' approach)
  const buffer = await new Response(requestBody).arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));

  let count = 0;

  for (const [filename, fileData] of Object.entries(unzipped)) {
    // Skip directories and system files like __MACOSX
    if (filename.includes('/') && filename.split('/').pop() === '') continue;
    if (filename.startsWith('__MACOSX')) continue;

    // 2. Identify the file type (jpg, png, mp4, etc.)
    const extension = filename.split('.').pop().toLowerCase();
    const contentType = getMimeType(extension);

    // 3. Robust Hashing: Use the filename to decide the 80/10/10 split
    const splitType = await getDeterministicSplit(filename);
    const r2Key = `projects/${projectId}/${splitType}/${filename}`;

    // 4. Upload to R2
    await uploadToR2(env, r2Key, fileData, splitType, contentType);
    
    count++;
  }

  return new Response(JSON.stringify({ 
    success: true, 
    processed: count,
    message: "Media split and stored successfully" 
  }), { headers: { "Content-Type": "application/json" } });
}

function getMimeType(ext) {
  const map = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'mp4': 'video/mp4',
    'gif': 'image/gif'
  };
  return map[ext] || 'application/octet-stream';
}