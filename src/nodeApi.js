export function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export function getExtension(filename) {
  return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
}

export function generateUUID() {
  return crypto.randomUUID();
}