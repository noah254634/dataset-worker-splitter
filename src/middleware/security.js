const DEFAULT_SCAN_MAX_BYTES = 5 * 1024 * 1024;

function normalizeExpectedType(expectedType) {
  return String(expectedType || "").trim().toLowerCase();
}

function getBlockedHashSet(raw) {
  return new Set(
    String(raw || "")
      .split(/[\s,]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function runSecurityScan(stream, expectedType, env) {
  const [headerStream, contentStream] = stream.tee();
  const reader = headerStream.getReader();
  const normalizedExpectedType = normalizeExpectedType(expectedType);
  
  const { value: firstChunk } = await reader.read();
  if (firstChunk) {
    const isZip = firstChunk[0] === 0x50 && firstChunk[1] === 0x4b;
    if (normalizedExpectedType === "media" && !isZip) {
      return { safe: false, reason: "File type mismatch: Expected ZIP for Media" };
    }
  }
  reader.cancel();

  const blockedHashes = getBlockedHashSet(env.BLOCKED_HASHES);
  if (blockedHashes.size === 0) {
    return { safe: true };
  }

  const configuredMax = Number(env.SECURITY_SCAN_MAX_BYTES);
  const maxScanBytes = Number.isFinite(configuredMax) && configuredMax > 0
    ? configuredMax
    : DEFAULT_SCAN_MAX_BYTES;

  const contentReader = contentStream.getReader();
  const chunks = [];
  let totalBytes = 0;
  let chunk;
  while (!(chunk = await contentReader.read()).done) {
    totalBytes += chunk.value.length;
    if (totalBytes > maxScanBytes) {
      contentReader.cancel();
      return { safe: true, scanSkipped: true, reason: "hash_scan_size_limit" };
    }
    chunks.push(chunk.value);
  }

  const buffer = new Uint8Array(chunks.reduce((acc, val) => acc + val.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  if (blockedHashes.has(fileHash)) {
    return { safe: false, reason: `Malicious hash detected: ${fileHash}` };
  }

  return { safe: true, hash: fileHash };
}