// Minimal ULID implementation (time-sortable, Crockford base32)
// Good enough for local file IDs without external dependencies.

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

function encodeBase32(value: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out = ENCODING.charAt(value % 32) + out;
    value = Math.floor(value / 32);
  }
  return out;
}

function encodeTime(time: number, length = 10): string {
  // ULID time is in ms, 48 bits, but we only need 10 chars base32
  return encodeBase32(time, length);
}

function encodeRandom(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    const r = Math.floor(Math.random() * 32);
    out += ENCODING.charAt(r);
  }
  return out;
}

export function ulid(date: Date = new Date()): string {
  const time = date.getTime();
  return encodeTime(time) + encodeRandom(16);
}

