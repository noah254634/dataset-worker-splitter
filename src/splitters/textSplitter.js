import { getDeterministicSplit, uploadToR2, registerTaskWithBackend } from '../r2Helpers.js';

export async function processTextStream(env, requestBody, projectId, datasetId) {
  const reader = requestBody.getReader();
  const decoder = new TextDecoder();
  let partialLine = "";
  let count = 0;
  let failedBatches = 0;
  let taskBuffer = [];
  const BATCH_SIZE = 100;

  const flushBatch = async (isLast = false) => {
    if (taskBuffer.length === 0) return;
    try {
      const result = await registerTaskWithBackend(env, {
        datasetId,
        projectId,
        tasks: taskBuffer,
        isLastBatch: isLast,
      });
      if (!result?.ok) failedBatches++;
    } catch (error) {
      failedBatches++;
      console.error("Text batch registration failed", {
        datasetId,
        projectId,
        batchSize: taskBuffer.length,
        isLastBatch: isLast,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    taskBuffer = [];
  };

  const uploadLine = async (line) => {
    if (!line.trim()) return;

    let finalContent = line;
    let contentType = "text/plain";

    const isJson = line.trim().startsWith('{');
    if (isJson) {
      try {
        JSON.parse(line);
        contentType = "application/json";
      } catch (e) {
        contentType = "text/plain";
      }
    }

    const splitType = await getDeterministicSplit(line);
    const taskId = crypto.randomUUID();
    const extension = contentType === "application/json" ? "json" : "txt";
    const r2Key = `projects/${projectId}/${datasetId}/${splitType}/${taskId}.${extension}`;

    await uploadToR2(env, r2Key, finalContent, splitType, contentType);

    taskBuffer.push({
      taskId,
      taskType: "text",
      r2_url: r2Key,
      split: splitType,
      contentType,
      contentPreview: line.substring(0, 100),
    });

    if (taskBuffer.length >= BATCH_SIZE) {
      await flushBatch(false);
    }

    count++;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = (partialLine + chunk).split("\n");
    partialLine = lines.pop();

    for (const line of lines) {
      await uploadLine(line);
    }
  }

  const remainingChunk = decoder.decode();
  if (remainingChunk) {
    partialLine += remainingChunk;
  }

  if (partialLine.trim()) {
    await uploadLine(partialLine);
  }

  await flushBatch(true);

  return { success: true, count, failedBatches };
}