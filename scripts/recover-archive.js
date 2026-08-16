const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');

const EXPECTED_SHA = 'c09a0d2c38b1bf39300d2f364ad28d81ecaee58426fcad0cb84ffde6fca8f8b8';
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const parts = fs.readdirSync('.').filter((f) => /^source\.part\d+$/.test(f)).sort();
const b64 = parts.map((f) => fs.readFileSync(f, 'utf8')).join('').replace(/\s+/g, '');
const tgz = Buffer.from(b64, 'base64');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
console.log('parts', parts.length, 'base64Chars', b64.length, 'tgzBytes', tgz.length, 'currentSha', sha(tgz));
console.log('expectedSha', EXPECTED_SHA);
if (sha(tgz) === EXPECTED_SHA) process.exit(0);

function gzipPayloadStart(buf) {
  if (buf[0] !== 0x1f || buf[1] !== 0x8b || buf[2] !== 8) throw new Error('not gzip');
  const flg = buf[3];
  let p = 10;
  if (flg & 4) { const xlen = buf.readUInt16LE(p); p += 2 + xlen; }
  if (flg & 8) { while (buf[p++] !== 0); }
  if (flg & 16) { while (buf[p++] !== 0); }
  if (flg & 2) p += 2;
  return p;
}
const payloadStart = gzipPayloadStart(tgz);
const payloadEnd = tgz.length - 8;
const payload = tgz.subarray(payloadStart, payloadEnd);
const expectedCrc = tgz.readUInt32LE(payloadEnd);
const expectedSize = tgz.readUInt32LE(payloadEnd + 4);
console.log('payloadStart', payloadStart, 'payloadBytes', payload.length, 'trailerCRC', expectedCrc.toString(16), 'trailerISIZE', expectedSize);

const targetOut = 57631;
function partialLen(n) {
  try {
    return zlib.inflateRawSync(payload.subarray(0, n), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).length;
  } catch {
    return -1;
  }
}
let lo = 1, hi = payload.length;
while (lo < hi) {
  const mid = (lo + hi) >> 1;
  const n = partialLen(mid);
  if (n >= targetOut) hi = mid; else lo = mid + 1;
}
const approxPayload = lo;
const approxTgz = payloadStart + approxPayload;
const approxB64 = Math.floor(approxTgz * 4 / 3);
console.log('first compressed prefix reaching output offset', targetOut, '=> payloadByte', approxPayload, 'tgzByte', approxTgz, 'approxBase64Char', approxB64);
for (let d = -32; d <= 32; d += 8) {
  const n = Math.max(1, Math.min(payload.length, approxPayload + d));
  console.log('map', n, '=>', partialLen(n));
}

// Most likely failure mode: one Base64 character was altered while the archive was stored as text.
const radius = 640;
const start = Math.max(0, approxB64 - radius);
const end = Math.min(b64.length, approxB64 + radius + 1);
console.log('bruteforce single base64 char', start, end);
let checked = 0;
for (let i = start; i < end; i++) {
  const original = b64[i];
  for (const c of B64_ALPHABET) {
    if (c === original) continue;
    const candidateB64 = b64.slice(0, i) + c + b64.slice(i + 1);
    const candidate = Buffer.from(candidateB64, 'base64');
    checked++;
    if (sha(candidate) === EXPECTED_SHA) {
      console.log('FOUND_BASE64_FIX', JSON.stringify({ index: i, from: original, to: c, checked }));
      fs.writeFileSync('source.recovered.tgz', candidate);
      fs.writeFileSync('RECOVERY.txt', `base64 index ${i}: ${original} -> ${c}\n`);
      process.exit(0);
    }
  }
}
console.log('no single base64-char fix in window; checked', checked);

// Second likely failure mode: one decoded byte differs.
const byteRadius = 640;
const bs = Math.max(0, approxTgz - byteRadius);
const be = Math.min(tgz.length, approxTgz + byteRadius + 1);
console.log('bruteforce single tgz byte', bs, be);
for (let i = bs; i < be; i++) {
  const original = tgz[i];
  const prefixHash = crypto.createHash('sha256').update(tgz.subarray(0, i));
  for (let v = 0; v < 256; v++) {
    if (v === original) continue;
    const h = prefixHash.copy();
    h.update(Buffer.from([v]));
    h.update(tgz.subarray(i + 1));
    if (h.digest('hex') === EXPECTED_SHA) {
      const candidate = Buffer.from(tgz);
      candidate[i] = v;
      console.log('FOUND_BYTE_FIX', JSON.stringify({ index: i, from: original, to: v }));
      fs.writeFileSync('source.recovered.tgz', candidate);
      fs.writeFileSync('RECOVERY.txt', `tgz byte ${i}: ${original} -> ${v}\n`);
      process.exit(0);
    }
  }
}
console.log('NO_SINGLE_CHARACTER_OR_BYTE_FIX_FOUND');
process.exit(1);
