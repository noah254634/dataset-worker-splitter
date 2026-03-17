import { HEADERS, DATA_TYPES } from './constants.js';
import { processTextStream } from './splitters/textSplitter.js';
import { processMediaZip } from './splitters/mediaSplitter.js';
import { processRLHFStream } from './splitters/rlhfSplitter.js';

export default {
  async fetch(request, env) {
    // 1. Security Check
    const signature = request.headers.get(HEADERS.SIGNATURE);
    if (!signature || signature !== env.INTERNAL_SECRET) {
      return new Response("Unauthorized: Invalid Vera Signature", { status: 401 });
    }

    // 2. Extract Project Metadata
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId') || request.headers.get(HEADERS.PROJECT_ID);
    const dataType = url.searchParams.get('type') || request.headers.get(HEADERS.DATA_TYPE);

    if (!projectId) {
      return new Response("Missing Project ID", { status: 400 });
    }

    try {
      // 3. Routing: Send to the specialized splitter
      let result;
      switch (dataType) {
        case DATA_TYPES.TEXT:
          result = await processTextStream(env, request.body, projectId);
          break;
        case DATA_TYPES.MEDIA:
          result = await processMediaZip(env, request.body, projectId);
          break;
        case DATA_TYPES.RLHF:
          result = await processRLHFStream(env, request.body, projectId);
          break;
        default:
          return new Response("Unsupported Data Type", { status: 400 });
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error("Worker Error:", error.message);
      return new Response(`Worker Error: ${error.message}`, { status: 500 });
    }
  }
};