import { HEADERS, DATA_TYPES } from './constants.js';
import { processTextStream } from './splitters/textSplitter.js';
import { processMediaZip } from './splitters/mediaSplitter.js';
import { processRLHFStream } from './splitters/rflhfSplitter.js';
import { runSecurityScan } from './middleware/security.js'; 

export default {
  async fetch(request, env) {
    const signature = request.headers.get(HEADERS.SIGNATURE);
    if (!signature || signature !== env.INTERNAL_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!request.body) {
      return new Response("Request body required", { status: 400 });
    }

    // SECURITY LAYER
    // Tee the body: one for scanning, one for processing
    const [scanStream, processingStream] = request.body.tee();

    // Parse URL first
    const url = new URL(request.url);

    // Determine type (using your existing detection logic)
    // For brevity, assume dataType is determined here...
    let dataType = url.searchParams.get('type') || request.headers.get(HEADERS.DATA_TYPE);

    // Run the scan
    const security = await runSecurityScan(scanStream, dataType, env);
    
    if (!security.safe) {
      console.error(`Security Block: ${security.reason}`);
      return new Response(`Security Alert: ${security.reason}`, { status: 403 });
    }

    const projectId = url.searchParams.get('projectId') || request.headers.get(HEADERS.PROJECT_ID);
    const datasetId = url.searchParams.get('datasetId') || request.headers.get(HEADERS.DATASET_ID);

    try {
      let result;
      // IMPORTANT: Use processingStream here instead of request.body
      switch (dataType) {
        case DATA_TYPES.TEXT:
          result = await processTextStream(env, processingStream, projectId, datasetId);
          break;
        case DATA_TYPES.MEDIA:
          result = await processMediaZip(env, processingStream, projectId, datasetId);
          break;
        case DATA_TYPES.RLHF:
          result = await processRLHFStream(env, processingStream, projectId, datasetId);
          break;
        default:
          return new Response("Unsupported Type", { status: 400 });
      }

      return new Response(JSON.stringify(result), { status: 200 });

    } catch (error) {
      return new Response(`Worker Error: ${error.message}`, { status: 500 });
    }
  }
};