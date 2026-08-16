const fs = require('fs');
const zlib = require('zlib');

const parts = fs.readdirSync('.').filter(f => /^source\.part\d+$/.test(f)).sort();
const b64 = parts.map(f => fs.readFileSync(f, 'utf8')).join('').replace(/\s+/g, '');
const tgz = Buffer.from(b64, 'base64');

function gzipPayloadStart(buf) {
  const flg = buf[3]; let p = 10;
  if (flg & 4) { const xlen = buf.readUInt16LE(p); p += 2 + xlen; }
  if (flg & 8) while (buf[p++] !== 0);
  if (flg & 16) while (buf[p++] !== 0);
  if (flg & 2) p += 2;
  return p;
}
const ps = gzipPayloadStart(tgz);
const payload = tgz.subarray(ps, tgz.length - 8);
const tar = zlib.inflateRawSync(payload, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
console.log('tar bytes', tar.length, 'mod512', tar.length % 512);

const needles = [
  ["crm-page", "'use client';\nimport Link from 'next/link';\nimport { useEffect, useMemo, useState } from 'react';"],
  ["modelos", "export default function Templates()"],
  ["perfil", "export default function ProfilePage()"],
  ["login", "export default function LoginPage()"],
  ["accept", "export default function AcceptInvite()"],
  ["landing", "export default function Landing()"],
  ["avatar", "export default function Avatar("],
  ["provider", "export function CrmProvider("],
  ["shell", "export default function CrmShell("],
  ["pagination", "export default function Pagination("],
  ["constants", "export const ROLE_LABELS"],
  ["supabase", "export const SUPABASE_URL"],
  ["nextconfig", "const nextConfig = {"],
  ["css-root", ":root"],
  ["css-landing", ".landing"],
  ["css-sidebar", ".sidebar"],
  ["use-client", "'use client';"],
  ["import-link", "import Link from 'next/link';"],
];
for (const [label, needle] of needles) {
  const n = Buffer.from(needle);
  let p = 0, hits = [];
  while ((p = tar.indexOf(n, p)) >= 0) { hits.push(p); p += Math.max(1, n.length); }
  console.log('HITS', label, JSON.stringify(hits));
}

function sanitize(buf) {
  return buf.toString('latin1').replace(/[\x00-\x1f\x7f-\xff]/g, '.').replace(/\s+/g, ' ').slice(0, 180);
}
console.log('--- aligned block candidates after first corruption ---');
for (let off = 59392; off + 512 <= tar.length; off += 512) {
  const block = tar.subarray(off, off + 512);
  let nul = 0; for (const x of block) if (x === 0) nul++;
  const oct = block.subarray(124,136).toString('ascii').replace(/\0/g,'').trim();
  const type = String.fromCharCode(block[156] || 0);
  const magic = block.subarray(257,262).toString('latin1');
  const name = sanitize(block.subarray(0,100));
  const numericish = /^[0-7 ]*$/.test(oct);
  if (nul > 80 || magic === 'ustar' || (numericish && name.length < 120)) {
    console.log('BLOCK', off, 'nul', nul, 'type', JSON.stringify(type), 'sizeField', JSON.stringify(oct), 'magic', JSON.stringify(magic), 'name', JSON.stringify(name));
    console.log(' DATA', sanitize(tar.subarray(off + 512, Math.min(off + 720, tar.length))));
  }
}
process.exit(1);
