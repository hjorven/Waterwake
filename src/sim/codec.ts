/** Byte- und Float-Felder als Base64, für Spielstände und eigene Karten */

export function encodeBytes(u8: Uint8Array): string {
  let s = '';
  const chunk = 0x2000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + chunk)));
  }
  return btoa(s);
}

export function decodeBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeFloats(f: Float32Array): string {
  return encodeBytes(new Uint8Array(f.buffer, f.byteOffset, f.byteLength));
}

export function decodeFloats(s: string): Float32Array {
  const u = decodeBytes(s);
  return new Float32Array(u.buffer, 0, u.byteLength >> 2);
}
