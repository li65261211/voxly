// Generate Voxly extension icons (solid indigo with white diamond sparkle)
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// CRC32 for PNG chunks
let crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  const INDIGO = [94, 106, 210];
  const WHITE = [255, 255, 255];
  const cx = size / 2, cy = size / 2;
  const r = size * 0.30; // diamond radius
  const cornerR = size * 0.18; // rounded corners

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4);
    for (let x = 0; x < size; x++) {
      // rounded corner test
      const inCornerX = x < cornerR || x >= size - cornerR;
      const inCornerY = y < cornerR || y >= size - cornerR;
      let inside = true;
      if (inCornerX && inCornerY) {
        const dx = x < cornerR ? cornerR - x : x - (size - 1 - cornerR);
        const dy = y < cornerR ? cornerR - y : y - (size - 1 - cornerR);
        inside = dx * dx + dy * dy <= cornerR * cornerR;
      }
      // diamond sparkle: |dx|+|dy| < r
      const dl = Math.abs(x + 0.5 - cx) + Math.abs(y + 0.5 - cy);
      const diamond = dl <= r;
      const [R, G, B] = !inside ? [0, 0, 0] : diamond ? WHITE : INDIGO;
      row[x * 4] = R; row[x * 4 + 1] = G; row[x * 4 + 2] = B; row[x * 4 + 3] = inside ? 255 : 0;
    }
    rows.push(Buffer.concat([Buffer.from([0]), row])); // filter byte 0
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = process.argv[2] || '.';
for (const s of [16, 48, 128]) {
  const p = path.join(outDir, `icon${s}.png`);
  fs.writeFileSync(p, makePng(s));
  console.log('wrote', p, fs.statSync(p).size, 'bytes');
}
