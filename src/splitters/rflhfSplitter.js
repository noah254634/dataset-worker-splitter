import { universalStreamParser } from '../utils/StreamParser.js';
import { getDeterministicSplit, uploadToR2, registerTaskWithBackend } from "../r2Helpers.js";

export async function processRLHFStream(env, requestBody, projectId, datasetId) {
  let count = 0;
  let malformedLines = 0;
  let failedEntries = 0;
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
      console.error("RLHF batch registration failed", {
        datasetId,
        projectId,
        batchSize: taskBuffer.length,
        isLastBatch: isLast,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    taskBuffer = [];
  };

  for await (const entry of universalStreamParser(requestBody, {
    onMalformed: () => {
      malformedLines++;
    },
  })) {
    try {
      const prompt = typeof entry?.prompt === "string" ? entry.prompt : "";
      const responses = Array.isArray(entry?.responses)
        ? entry.responses
        : (typeof entry?.response === "string" ? [entry.response] : []);

      if (!entry || typeof entry !== "object" || !prompt || responses.length === 0) {
        malformedLines++;
        continue;
      }

      const normalizedEntry = {
        prompt,
        responses,
        metadata: {
          datasetId,
          projectId,
          source_language: "en-KE",
          processed_at: new Date().toISOString()
        }
      };

      const splitType = await getDeterministicSplit(prompt);
      const taskId = crypto.randomUUID();
      const r2Key = `projects/${projectId}/${datasetId}/${splitType}/${taskId}.json`;

      await uploadToR2(env, r2Key, JSON.stringify(normalizedEntry), splitType, "application/json");

      taskBuffer.push({
        taskId,
        taskType: "rfhlearning",
        r2_url: r2Key,
        split: splitType,
        contentPreview: prompt.substring(0, 100),
      });

      count++;
      if (taskBuffer.length >= BATCH_SIZE) await flushBatch(false);
    } catch (error) {
      failedEntries++;
      console.error("RLHF entry processing failed", {
        datasetId,
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await flushBatch(true);

  return { success: true, count, malformedLines, failedEntries, failedBatches };
}