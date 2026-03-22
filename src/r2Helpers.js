import { SPLIT_RATIOS } from './constants.js';

/**
 * Deterministically assigns a split (train/val/test) based on a string input.
 * Uses SHA-256 for high-quality distribution.
 */
export async function getDeterministicSplit(inputString) {
  // 1. Convert string to a byte array
  const msgUint8 = new TextEncoder().encode(inputString);
  
  // 2. Generate a SHA-256 hash
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  // 3. Take the first two bytes to create a stable number between 0-65535
  const hashInt = (hashArray[0] << 8) | hashArray[1];
  
  // 4. Map to a 0-99 scale
  const score = hashInt % 100;

  const trainCutoff = SPLIT_RATIOS.TRAIN;
  const validationCutoff = SPLIT_RATIOS.TRAIN + SPLIT_RATIOS.VALIDATION;

  if (score < trainCutoff) return "train";
  if (score < validationCutoff) return "val";
  return "test";
}

/**
 * Robust R2 Uploader with Metadata tagging
 */
export async function uploadToR2(env, key, body, splitType, contentType) {
  return await env.MY_BUCKET.put(key, body, {
    httpMetadata: { contentType: contentType },
    customMetadata: {
      "vera-split": splitType,
      "uploaded-at": new Date().toISOString()
    }
  });
}

// Helper function to notify Node.js backend.
// Uses Worker env vars from wrangler.toml or secrets; no dotenv in Worker runtime.
export async function registerTaskWithBackend(env, taskDetails) {
  const skipRegistration = String(env?.SKIP_BACKEND_REGISTRATION || '').toLowerCase() === 'true';
  if (skipRegistration) {
    return { ok: false, reason: 'skipped_by_env' };
  }

  if (!env?.BACKEND_API) {
    console.warn("BACKEND_API not configured. Skipping backend registration.");
    return { ok: false, reason: 'missing_backend_api' };
  }

  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (env.BACKEND_TOKEN) {
      headers.Authorization = `Bearer ${env.BACKEND_TOKEN}`;
    }

    const rawBackendApi = String(env.BACKEND_API).replace(/\/+$/, '');

    const endpoint = /(\/tasks\/register|\/register-task)$/i.test(rawBackendApi)
      ? rawBackendApi
      : `${rawBackendApi}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(taskDetails),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      console.log(`${response}`)
      console.warn(
        `Backend registration failed for task ${taskDetails.taskId}: ${response.status} ${response.statusText}${bodyText ? ` | ${bodyText}` : ''}`
      );
      return { ok: false, status: response.status, statusText: response.statusText, body: bodyText };
    }

    return { ok: true };
  } catch (error) {
    console.warn(`Failed to register task ${taskDetails.taskId}: ${error?.message || String(error)}`);
    return { ok: false, reason: 'fetch_error', error: error?.message || String(error) };
  }
}


