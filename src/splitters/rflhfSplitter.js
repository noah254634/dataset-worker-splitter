import { universalStreamParser } from '../utils/StreamParser.js';
import { getDeterministicSplit, uploadToR2, registerTaskWithBackend } from "../r2Helpers.js";

export async function processRLHFStream(env, requestBody, projectId, datasetId) {
  let count = 0;
  let malformedLines = 0;
  let taskBuffer = [];
  const BATCH_SIZE = 100;

  const flushBatch = async (isLast = false) => {
    if (taskBuffer.length === 0) return;
    await registerTaskWithBackend(env, {
      datasetId, projectId, tasks: taskBuffer, isLastBatch: isLast,
    });
    taskBuffer = [];
  };

  //  Just loop over the generator
  for await (const entry of universalStreamParser(requestBody, {
    onMalformed: () => {
      malformedLines++;
    },
  })) {
    const prompt = typeof entry?.prompt === "string" ? entry.prompt : "";
    const responses = Array.isArray(entry?.responses)
      ? entry.responses
      : (typeof entry?.response === "string" ? [entry.response] : []);

    if (!entry || typeof entry !== "object" || !prompt || responses.length === 0) {
      malformedLines++;
      continue;
    }

    // 1. We only extract what we need
    const normalizedEntry = {
      prompt,
      responses,
      // 2. We manually define the metadata instead of copying it
      metadata: {
        datasetId,
        projectId,
        source_language: "en-KE", // Hardcoded or from a safe variable
        processed_at: new Date().toISOString()
      }
    };

    const splitType = await getDeterministicSplit(prompt);
    const taskId = crypto.randomUUID();
    const r2Key = `projects/${projectId}/${datasetId}/${splitType}/${taskId}.json`;

    // 3. Upload the strictly defined object
    await uploadToR2(env, r2Key, JSON.stringify(normalizedEntry), splitType, "application/json");

    taskBuffer.push({
      taskId,
      r2_url: r2Key,
      split: splitType,
      contentPreview: prompt.substring(0, 100),
    });

    count++;
    if (taskBuffer.length >= BATCH_SIZE) await flushBatch(false);
  }

  await flushBatch(true);

  return { success: true, count, malformedLines };
}