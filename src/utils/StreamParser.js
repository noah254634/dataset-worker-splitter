
export async function* universalStreamParser(stream, options = {}) {
  const onMalformed = typeof options.onMalformed === 'function' ? options.onMalformed : null;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let isArray = false;
  let firstChunk = true;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    if (firstChunk) {
      const trimmed = buffer.trimStart();
      if (trimmed.startsWith('[')) {
        isArray = true;
        buffer = trimmed.slice(1); // Strip the opening bracket
      } else {
        buffer = trimmed;
      }
      firstChunk = false;
    }

    // Process Buffer
    let boundary;
    while ((boundary = findNextBoundary(buffer, isArray)) !== -1) {
      let segment = buffer.slice(0, boundary + 1).trim();
      buffer = buffer.slice(boundary + 1);

      // Clean up JSON Array commas
      if (segment.startsWith(',')) segment = segment.slice(1).trim();
      if (isArray && segment.startsWith(',')) segment = segment.slice(1).trim();
      if (isArray && segment.endsWith(']')) segment = segment.slice(0, -1).trim();

      const objectStart = segment.indexOf('{');
      const objectEnd = segment.lastIndexOf('}');
      if (objectStart !== -1 && objectEnd >= objectStart) {
        segment = segment.slice(objectStart, objectEnd + 1).trim();
      }

      if (segment) {
        try {
          yield JSON.parse(segment);
        } catch (e) {
          // If it's a partial or malformed line, we ignore or log
          if (onMalformed) onMalformed(segment, e);
          console.error("Parser skip: Malformed segment");
        }
      }
    }
  }

  // Handle trailing segment after stream ends
  let finalSegment = buffer.trim();
  if (isArray) {
    if (finalSegment.startsWith(',')) finalSegment = finalSegment.slice(1).trim();
    if (finalSegment.endsWith(']')) finalSegment = finalSegment.slice(0, -1).trim();
  }

  if (finalSegment.startsWith(',')) finalSegment = finalSegment.slice(1).trim();
  const finalObjectStart = finalSegment.indexOf('{');
  const finalObjectEnd = finalSegment.lastIndexOf('}');
  if (finalObjectStart !== -1 && finalObjectEnd >= finalObjectStart) {
    finalSegment = finalSegment.slice(finalObjectStart, finalObjectEnd + 1).trim();
  }

  if (finalSegment) {
    try {
      yield JSON.parse(finalSegment);
    } catch (e) {
      if (onMalformed) onMalformed(finalSegment, e);
      console.error("Parser skip: Malformed segment");
    }
  }
}

function findNextBoundary(str, isArray) {
  // Find a complete top-level JSON object boundary, handling strings/escapes.
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === '\\') {
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      depth++;
      continue;
    }

    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
      continue;
    }

    if (isArray && depth === 0 && ch === ']') {
      return i;
    }
  }

  return -1;
}