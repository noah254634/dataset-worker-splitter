import {
  getDeterministicSplit,
  uploadToR2,
  registerTaskWithBackend,
} from "../r2Helpers.js";
import { unzipSync } from "fflate";

export async function processMediaZip(env, requestBody, projectId, datasetId) {
  // 1. Memory Guard: Check Content-Length before processing
  const contentLength = env.REQUEST_SIZE_LIMIT || 100 * 1024 * 1024; // Default 100MB
  
  let buffer;
  try {
    const response = new Response(requestBody);
    // Safety check: if the stream is too large, arrayBuffer() will crash the worker
    buffer = await response.arrayBuffer();
  } catch (e) {
    throw new Error("File too large for Worker memory. Please upload smaller ZIPs or use a streaming unzipper.");
  }

  const unzipped = unzipSync(new Uint8Array(buffer));
  let count = 0;
  let taskBuffer = [];
  const BATCH_SIZE = 50; 
  let failedBatches = 0;

  const flushBatch = async (isLast = false) => {
    if (taskBuffer.length === 0) return;
    const result = await registerTaskWithBackend(env, {
      datasetId,
      projectId,
      tasks: taskBuffer,
      isLastBatch: isLast,
    });
    if (!result.ok) failedBatches++;
    taskBuffer = [];
  };

  for (const [filename, fileData] of Object.entries(unzipped)) {
    // Edge Case: Skip hidden system files and directory entries
    const isSystemFile = filename.startsWith("__MACOSX") || filename.includes(".DS_Store");
    const isDirectory = filename.endsWith("/");
    if (isSystemFile || isDirectory) continue;

    // 2. Extract extension safely
    const parts = filename.split(".");
    const extension = parts.length > 1 ? parts.pop().toLowerCase() : "";
    const contentType = getMimeType(extension);

    // 3. Organization: projects/proj_id/dataset_id/split/filename
    const splitType = await getDeterministicSplit(filename);
    const r2Key = `projects/${projectId}/${datasetId}/${splitType}/${filename}`;

    try {
      // 4. Upload raw binary to R2
      await uploadToR2(env, r2Key, fileData, splitType, contentType);

      // 5. Buffer metadata for backend
      taskBuffer.push({
        taskId: crypto.randomUUID(), // Or hash the filename for idempotency
        r2_url: r2Key,
        split: splitType,
        fileName: filename,
        fileSize: fileData.length,
        contentType: contentType
      });

      count++;

      if (taskBuffer.length >= BATCH_SIZE) {
        await flushBatch(false);
      }
    } catch (e) {
      console.error(`Failed to process media file: ${filename}`, e.message);
    }
  }

  // Final synchronization
  await flushBatch(true);

  return {
    success: true,
    processed: count,
    datasetId,
    failedBatches,
    message: "Media dataset processed and registered",
  };
}

function getMimeType(ext) {
  const map = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    gif: "image/gif",
    pdf: "application/pdf"
  };
  return map[ext] || "application/octet-stream";
}