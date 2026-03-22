import { HEADERS, DATA_TYPES } from './constants.js';
import { processTextStream } from './splitters/textSplitter.js';
import { processMediaZip } from './splitters/mediaSplitter.js';
import { processRLHFStream } from './splitters/rflhfSplitter.js';

export default {
  async fetch(request, env) {
    const signature = request.headers.get(HEADERS.SIGNATURE);
    if (!signature || signature !== env.INTERNAL_SECRET) {
      return new Response("Unauthorized: Invalid Vera Signature", { status: 401 });
    }

    if (!request.body) {
      return new Response("Request body is required", { status: 400 });
    }

    // 2. Clone the request to peek at the body for auto-detection
    const clonedRequest = request.clone();
    const reader = clonedRequest.body?.getReader();
    const { value } = reader ? await reader.read() : { value: undefined };
    const firstChunkBytes = value || new Uint8Array();
    const firstChunkText = new TextDecoder().decode(firstChunkBytes);

    // 3. Extract Project Metadata
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId') || request.headers.get(HEADERS.PROJECT_ID);
    const datasetId = url.searchParams.get('datasetId') || request.headers.get(HEADERS.DATASET_ID);
    
    // 4. Automatic Data Type Detection 
    let dataType = url.searchParams.get('type') || request.headers.get(HEADERS.DATA_TYPE);

    if (!dataType) {
      const firstLine = firstChunkText.split('\n')[0].trim();
      
      // Check for ZIP magic bytes (PK..)
      if (firstChunkBytes.length >= 2 && firstChunkBytes[0] === 0x50 && firstChunkBytes[1] === 0x4b) {
        dataType = DATA_TYPES.MEDIA;
      } else {
        try {
          const json = JSON.parse(firstLine);
          // If it has RLHF specific keys, it's RLHF
          if (json.prompt && json.responses) {
            dataType = DATA_TYPES.RLHF;
          } else {
            dataType = DATA_TYPES.TEXT;
          }
        } catch (e) {
          // If not valid JSON, default to raw text
          dataType = DATA_TYPES.TEXT;
        }
      }
    }

    if (!projectId) {
      return new Response("Missing Project ID", { status: 400 });
    }

    try {
      // 5. Routing: Send to the specialized splitter
      let result;
      switch (dataType) {
        case DATA_TYPES.TEXT:
          if (!datasetId) {
            return new Response("Missing datasetId for Text data", { status: 400 });
          }
          console.log("Processing detected Text Stream");
          result = await processTextStream(env, request.body, projectId, datasetId);
          break;
        case DATA_TYPES.MEDIA:
          if (!datasetId) {
            return new Response("Missing datasetId for Media data", { status: 400 });
          }
          console.log("Processing detected Media Zip");
          result = await processMediaZip(env, request.body, projectId, datasetId);
          break;
        case DATA_TYPES.RLHF:
          if (!datasetId) {
            return new Response("Missing datasetId for RLHF data", { status: 400 });
          }
          console.log("Processing detected RLHF Stream");
          result = await processRLHFStream(env, request.body, projectId, datasetId);
          break;
        default:
          return new Response("Unsupported Data Type", { status: 400 });
      }

      if (result instanceof Response) {
        return result;
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