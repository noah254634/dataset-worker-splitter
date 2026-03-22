import {
  getDeterministicSplit,
  uploadToR2,
  registerTaskWithBackend, 
} from "../r2Helpers.js";

export async function processRLHFStream(env, requestBody, projectId, datasetId) {
  const reader = requestBody.getReader();
  const decoder = new TextDecoder();
  let partialLine = "";
  let count = 0;
  
  // Batching variables
  let taskBuffer = []; 
  const BATCH_SIZE = 100; 
  let failedBatches = 0;

  const flushBatch = async (isLast = false) => {
    if (taskBuffer.length === 0) return;

    // Send the whole array as one request
    const result = await registerTaskWithBackend(env, {
      datasetId,
      projectId,
      tasks: taskBuffer,
      isLastBatch: isLast 
    });

    if (!result.ok) failedBatches++;
    taskBuffer = []; // Clear the buffer after sending
  };

  const processLine = async (line) => {
    if (!line.trim()) return;

    try {
      const entry = JSON.parse(line);
      const splitType = await getDeterministicSplit(entry.prompt);
      const taskId = crypto.randomUUID();
      const r2Key = `projects/${projectId}/${datasetId}/${splitType}/${taskId}.json`;

      const rlhfTask = {
        taskId,
        prompt: entry.prompt,
        responses: entry.responses,
        metadata: { ...entry.metadata, datasetId }
      };

      // 1. Upload individual file to R2
      await uploadToR2(env, r2Key, JSON.stringify(rlhfTask), splitType, "application/json");

      // 2. Add to batch instead of sending immediately
      taskBuffer.push({
        taskId,
        r2_url: r2Key,
        split: splitType,
        contentPreview: entry.prompt.substring(0, 100),
      });

      count++;

      // 3. If batch is full, send it
      if (taskBuffer.length >= BATCH_SIZE) {
        await flushBatch(false);
      }
    } catch (e) {
      console.error("RLHF line processing failed", e.message);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = (partialLine + chunk).split("\n");
    partialLine = lines.pop();
    for (const line of lines) { await processLine(line); }
  }

  if (partialLine.trim()) { await processLine(partialLine); }

  // : Send remaining tasks and mark as last
  await flushBatch(true);

  return { 
    success: true, 
    count, 
    datasetId, 
    failedBatches,
    batchSizeUsed: BATCH_SIZE 
  };
}