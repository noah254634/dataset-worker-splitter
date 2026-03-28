import { getDeterministicSplit, uploadToR2 } from '../r2Helpers.js';

export async function processTextStream(env, requestBody, projectId) {
  const reader = requestBody.getReader();
  const decoder = new TextDecoder();
  let partialLine = "";
  let count = 0;

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
    const r2Key = `projects/${projectId}/${splitType}/${taskId}.${extension}`;

    await uploadToR2(env, r2Key, finalContent, splitType, contentType);
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

  return { success: true, count };
}