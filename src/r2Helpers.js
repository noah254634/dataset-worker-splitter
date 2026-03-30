import { SPLIT_RATIOS } from './constants.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getDeterministicSplit(inputString) {
  const msgUint8 = new TextEncoder().encode(inputString);
  
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  const hashInt = (hashArray[0] << 8) | hashArray[1];
  
  const score = hashInt % 100;

  const trainCutoff = SPLIT_RATIOS.TRAIN;
  const validationCutoff = SPLIT_RATIOS.TRAIN + SPLIT_RATIOS.VALIDATION;

  if (score < trainCutoff) return "train";
  if (score < validationCutoff) return "validation";
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

  const configuredAttempts = Number(env.BACKEND_RETRY_ATTEMPTS);
  const maxAttempts = Number.isFinite(configuredAttempts)
    ? Math.min(Math.max(Math.trunc(configuredAttempts), 1), 5)
    : 3;

  const configuredTimeoutMs = Number(env.BACKEND_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
    ? configuredTimeoutMs
    : 8000;

  const rawBackendApi = String(env.BACKEND_API).replace(/\/+$/, '');
  const endpoint = /(\/tasks\/register|\/register-task)$/i.test(rawBackendApi)
    ? rawBackendApi
    : `${rawBackendApi}`;

  const taskCount = Array.isArray(taskDetails?.tasks) ? taskDetails.tasks.length : 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(taskDetails),
        signal: controller.signal
      });

      if (response.ok) {
        return { ok: true };
      }

      const bodyText = await response.text().catch(() => '');
      const retryableStatus = [408, 425, 429, 500, 502, 503, 504].includes(response.status);

      console.warn(
        `Backend registration failed for batch (${taskCount} tasks), attempt ${attempt}/${maxAttempts}: ${response.status} ${response.statusText}${bodyText ? ` | ${bodyText}` : ''}`
      );

      if (!retryableStatus || attempt === maxAttempts) {
        return {
          ok: false,
          status: response.status,
          statusText: response.statusText,
          body: bodyText,
          attempts: attempt,
        };
      }
    } catch (error) {
      const message = error?.message || String(error);
      console.warn(
        `Failed to register batch (${taskCount} tasks), attempt ${attempt}/${maxAttempts}: ${message}`
      );

      if (attempt === maxAttempts) {
        return { ok: false, reason: 'fetch_error', error: message, attempts: attempt };
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const backoffMs = 300 * (2 ** (attempt - 1));
    await sleep(backoffMs);
  }

  return {
    ok: false,
    reason: 'unknown_registration_failure',
    attempts: maxAttempts,
  };
}


