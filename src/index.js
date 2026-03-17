import { processTextStream } from './splitters/textSplitter.js';
import { processMediaZip } from './splitters/mediaSplitter.js';

export default {
  async fetch(request, env) {
    // 1. Security Guard: Only VeraLabel authorized sources can trigger this
    const authHeader = request.headers.get("X-Vera-Signature");
    if (authHeader !== env.INTERNAL_SECRET) {
      return new Response("Unauthorized", { status: 403 });
    }

    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const contentType = request.headers.get("Content-Type") || "";

    if (!projectId) {
      return new Response("Missing Project ID", { status: 400 });
    }

    try {
      // 2. Routing Logic based on Industry Data Types
      if (contentType.includes("application/zip")) {
        // Handle Media (Images/Video)
        return await processMediaZip(env, request.body, projectId);
      } 
      
      if (contentType.includes("text/plain") || contentType.includes("application/jsonl")) {
        // Handle Text/RLHF Data
        const result = await processTextStream(env, request.body, projectId);
        
        // 3. Notify Node.js Backend that the Project is ready for labeling
        await this.notifyBackend(env, {
          projectId,
          status: "split_complete",
          itemCount: result.count
        });

        return new Response(JSON.stringify(result), { 
          status: 200, 
          headers: { "Content-Type": "application/json" } 
        });
      }

      return new Response("Unsupported Dataset Format", { status: 415 });

    } catch (error) {
      return new Response(`Worker Error: ${error.message}`, { status: 500 });
    }
  },

  // Robust Callback Logic to your Node.js Server
  async notifyBackend(env, payload) {
    return fetch(env.BACKEND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.BACKEND_TOKEN}`
      },
      body: JSON.stringify(payload)
    });
  }
};