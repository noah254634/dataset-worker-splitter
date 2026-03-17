import { getDeterministicSplit, uploadToR2 } from '../r2Helpers.js';

export async function processTextStream(env, requestBody, projectId) {
  const reader = requestBody.getReader();
  const decoder = new TextDecoder();
  let partialLine = "";
  let count = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Decode chunk and split by newlines
    const chunk = decoder.decode(value, { stream: true });
    const lines = (partialLine + chunk).split("\n");
    
    // The last element is either empty or a partial line; save it for the next chunk
    partialLine = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;

      // 1. Determine split based on the content (Deterministic)
      const splitType = await getDeterministicSplit(line);
      
      // 2. Generate a unique key for this specific task
      const taskId = crypto.randomUUID();
      const r2Key = `projects/${projectId}/${splitType}/${taskId}.json`;

      // 3. Upload individual task to R2
      await uploadToR2(env, r2Key, line, splitType, "application/json");
      
      count++;
    }
  }

  return { success: true, count };
}