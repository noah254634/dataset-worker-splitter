import { getDeterministicSplit, uploadToR2 } from '../r2Helpers.js';

export async function processRLHFStream(env, requestBody, projectId) {
  const reader = requestBody.getReader();
  const decoder = new TextDecoder();
  let partialLine = "";
  let count = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = (partialLine + chunk).split("\n");
    partialLine = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        
        // 1. Deterministic Split: We hash the PROMPT.
        const splitType = await getDeterministicSplit(entry.prompt);
        
        const taskId = crypto.randomUUID();
        const r2Key = `projects/${projectId}/${splitType}/${taskId}.json`;

        // Wrap in a VeraLabel Standard Format
        const rlhfTask = {
          taskId,
          prompt: entry.prompt,
          responses: entry.responses, // Array of { model: "...", text: "..." }
          metadata: {
            ...entry.metadata,
            source_language: entry.language || "en-KE",
            category: entry.category || "general"
          }
        };

        //  Upload to R2
        await uploadToR2(env, r2Key, JSON.stringify(rlhfTask), splitType, "application/json");
        
        count++;
      } catch (e) {
        console.error("Malformed JSONL line skipped");
      }
    }
  }

  return { success: true, count };
}