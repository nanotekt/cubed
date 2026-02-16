/**
 * URL source sharing — deflate + base64url encode CUBE source into ?src= parameter.
 */

// Base64url encoding (RFC 4648 §5): no padding, + → -, / → _
function toBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(str: string): Uint8Array {
  // Restore standard base64
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding
  while (b64.length % 4 !== 0) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Deflate source text and return base64url-encoded string */
export async function encodeSource(source: string): Promise<string> {
  const input = new TextEncoder().encode(source);
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return toBase64url(result);
}

/** Decode base64url + inflate back to source text. Returns null on failure. */
export async function decodeSource(encoded: string): Promise<string | null> {
  try {
    const bytes = fromBase64url(encoded);
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(bytes as unknown as BufferSource);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.length;
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(result);
  } catch {
    return null;
  }
}

/** Update the URL ?src= parameter without reloading the page */
export async function updateUrlSource(source: string): Promise<void> {
  const encoded = await encodeSource(source);
  const url = new URL(window.location.href);
  url.searchParams.set('src', encoded);
  window.history.replaceState(null, '', url.toString());
}

/** Read initial source from URL ?src= parameter */
export async function readUrlSource(): Promise<string | null> {
  const url = new URL(window.location.href);
  const encoded = url.searchParams.get('src');
  if (!encoded) return null;
  return decodeSource(encoded);
}
