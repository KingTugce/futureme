export class JsonBodyError extends Error {
  constructor(readonly status: 400 | 413) {
    super(status === 413 ? 'Request body too large' : 'Invalid JSON');
  }
}

// Bound the bytes read, including chunked requests without Content-Length.
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.body) throw new JsonBodyError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new JsonBodyError(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new JsonBodyError(400);
  }
}
