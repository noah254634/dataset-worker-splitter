// security.js
export async function runSecurityScan(stream, expectedType, env) {
  const [headerStream, contentStream] = stream.tee();
  const reader = headerStream.getReader();
  
  // 1. Basic Magic Byte Check
  const { value: firstChunk } = await reader.read();
  if (firstChunk) {
    const isZip = firstChunk[0] === 0x50 && firstChunk[1] === 0x4b;
    if (expectedType === 'MEDIA' && !isZip) {
      return { safe: false, reason: "File type mismatch: Expected ZIP for Media" };
    }
  }
  // Cancel header reader so the stream doesn't hang
  reader.cancel();

  // 2. Hash-Based Blacklist Check
  // Convert stream to buffer
  const contentReader = contentStream.getReader();
  const chunks = [];
  let chunk;
  while (!(chunk = await contentReader.read()).done) {
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

  // Check against a known blacklist (stored in ENV or KV)
  const blacklist = env.BLOCKED_HASHES || ""; 
  if (blacklist.includes(fileHash)) {
    return { safe: false, reason: `Malicious hash detected: ${fileHash}` };
  }

  return { safe: true, hash: fileHash };
}