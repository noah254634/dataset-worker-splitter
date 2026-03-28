import { SPLIT_RATIOS } from './constants.js';

export async function getDeterministicSplit(inputString) {
  const msgUint8 = new TextEncoder().encode(inputString);
  
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  const hashInt = (hashArray[0] << 8) | hashArray[1];
  
  const score = hashInt % 100;

  const trainCutoff = SPLIT_RATIOS.TRAIN;
  const validationCutoff = SPLIT_RATIOS.TRAIN + SPLIT_RATIOS.VALIDATION;

  if (score < trainCutoff) return "train";
  if (score < validationCutoff) return "val";
  return "test";
}

export async function uploadToR2(env, key, body, splitType, contentType) {
  return await env.MY_BUCKET.put(key, body, {
    httpMetadata: { contentType: contentType },
    customMetadata: {
      "vera-split": splitType,
      "uploaded-at": new Date().toISOString()
    }
  });
}

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

    const handshakeUrl = env?.HANDSHAKE_URL || env?.BACKEND_HANDSHAKE_URL || env?.BACKEND_HANDSHAKE;
    if (handshakeUrl) {
      headers['handshake-url'] = String(handshakeUrl);
    }

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
      const taskCount = Array.isArray(taskDetails?.tasks) ? taskDetails.tasks.length : 0;
      console.warn(
        `Backend registration failed for batch (${taskCount} tasks): ${response.status} ${response.statusText}${bodyText ? ` | ${bodyText}` : ''}`
      );
      return { ok: false, status: response.status, statusText: response.statusText, body: bodyText };
    }

    return { ok: true };
  } catch (error) {
    const taskCount = Array.isArray(taskDetails?.tasks) ? taskDetails.tasks.length : 0;
    console.warn(`Failed to register batch (${taskCount} tasks): ${error?.message || String(error)}`);
    return { ok: false, reason: 'fetch_error', error: error?.message || String(error) };
  }
}


