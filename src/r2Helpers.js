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

  if (score < 80) return "train"; // 80%
  if (score < 90) return "val";   // 10%
  return "test";                  // 10%
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