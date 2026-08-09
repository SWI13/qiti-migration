// يتحقّق من validateUpload/sniffImageType في media-upload.mjs بلا ما يلمس
// أي تخزين — بينات حقيقية مبنية يدوياً، بلا شبكة، بلا Netlify Blobs.
import { validateUpload, sniffImageType } from '../../netlify/functions/media-upload.mjs';

function hex(...bytes) {
  return Uint8Array.from(bytes);
}

function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function fromAscii(str) {
  return Uint8Array.from(Array.from(str).map((c) => c.charCodeAt(0)));
}

// --- بينات حقيقية (minimal, لكن صحيحة في التوقيع) ---------------------

// PNG: توقيع 8 بايتات + IHDR وهمي باش الطول يفوت 12 بايت
const realPng = concat(
  hex(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  fromAscii('IHDR-filler-bytes-to-pad-length'),
);

// JPEG: FF D8 FF ثم بايتات عشوائية
const realJpeg = concat(hex(0xff, 0xd8, 0xff, 0xe0), fromAscii('JFIF-filler-bytes-here'));

// WebP: RIFF....WEBP
const realWebp = concat(fromAscii('RIFF'), hex(0x00, 0x00, 0x00, 0x00), fromAscii('WEBP'), fromAscii('VP8 extra'));

// AVIF: ftyp في offset 4 مع براند avif
const realAvif = concat(
  hex(0x00, 0x00, 0x00, 0x1c), // box size
  fromAscii('ftyp'),
  fromAscii('avif'),
  fromAscii('....extra-bytes-padding'),
);

// ملف كذّاب: يدّعي PNG لكن بايتاتو <?php ...>
const fakePngPhp = fromAscii('<?php system($_GET["c"]); ?> filler filler filler');

// ملف كبير برشا (6 ميغا > الحد 5 ميغا)
const oversized = new Uint8Array(6 * 1024 * 1024);
oversized.set(hex(0x89, 0x50, 0x4e, 0x47), 0); // حتى لو التوقيع صحيح، الحجم يرفضو قبل

// ملف فارغ
const empty = new Uint8Array(0);

// --- الحالات ------------------------------------------------------------

const cases = [
  {
    name: 'PNG حقيقي، content-type مطابق',
    bytes: realPng,
    declaredContentType: 'image/png',
    expect: 'accept',
  },
  {
    name: 'JPEG حقيقي، content-type مطابق',
    bytes: realJpeg,
    declaredContentType: 'image/jpeg',
    expect: 'accept',
  },
  {
    name: 'WebP حقيقي، content-type مطابق',
    bytes: realWebp,
    declaredContentType: 'image/webp',
    expect: 'accept',
  },
  {
    name: 'AVIF حقيقي، content-type مطابق',
    bytes: realAvif,
    declaredContentType: 'image/avif',
    expect: 'accept',
  },
  {
    name: 'ملف <?php يدّعي PNG (magic bytes ماشي مطابقة)',
    bytes: fakePngPhp,
    declaredContentType: 'image/png',
    expect: 'reject',
  },
  {
    name: 'ملف كبير برشا (6 ميغا)',
    bytes: oversized,
    declaredContentType: 'image/png',
    expect: 'reject',
  },
  {
    name: 'ملف فارغ',
    bytes: empty,
    declaredContentType: 'image/png',
    expect: 'reject',
  },
  {
    name: 'PNG حقيقي لكن content-type مصرّح غلط (image/gif)',
    bytes: realPng,
    declaredContentType: 'image/gif',
    expect: 'reject',
  },
  {
    name: 'PNG حقيقي، content-type مصرّح PNG لكن الفحص كذّاب (mismatch: bytes=jpeg, declared=png)',
    bytes: realJpeg,
    declaredContentType: 'image/png',
    expect: 'reject',
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const sniffed = sniffImageType(c.bytes);
  const result = validateUpload({ bytes: c.bytes, declaredContentType: c.declaredContentType });
  const got = result.ok ? 'accept' : 'reject';
  const ok = got === c.expect;
  pass += ok ? 1 : 0;
  fail += ok ? 0 : 1;

  console.log(
    `[${ok ? 'PASS' : 'FAIL'}] ${c.name}`,
    `| sniffed=${sniffed ?? 'null'}`,
    `| declared=${c.declaredContentType}`,
    `| size=${c.bytes.byteLength}`,
    `| result=${got}${result.ok ? '' : ` ("${result.error}")`}`,
  );
}

console.log(`\n${pass}/${cases.length} passed, ${fail} failed.`);
if (fail > 0) process.exitCode = 1;
