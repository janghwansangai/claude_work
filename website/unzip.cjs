// 소개 사이트 빌드용 아주 작은 ZIP 풀기 (Node 내장 기능만 사용).
// Cloudflare 빌드 서버처럼 unzip·python이 없는 곳에서도 website/build.sh가 돌게 한다.
// 사용: node website/unzip.cjs <zip 파일> <풀 폴더>
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const [zipFile, outDir] = process.argv.slice(2);
if (!zipFile || !outDir) { console.error('사용: node unzip.cjs <zip> <폴더>'); process.exit(2); }
const buf = fs.readFileSync(zipFile);

// 중앙 디렉터리 끝(EOCD) 찾기
let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) throw new Error('ZIP 파일이 아닙니다: ' + zipFile);
const count = buf.readUInt16LE(eocd + 10);
let p = buf.readUInt32LE(eocd + 16);
const root = path.resolve(outDir);

for (let n = 0; n < count; n++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP 목록이 손상되었습니다');
  const flags = buf.readUInt16LE(p + 8);
  const method = buf.readUInt16LE(p + 10);
  const csize = buf.readUInt32LE(p + 20);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const commentLen = buf.readUInt16LE(p + 32);
  const local = buf.readUInt32LE(p + 42);
  const name = buf.subarray(p + 46, p + 46 + nameLen).toString(flags & 0x800 ? 'utf8' : 'latin1');
  p += 46 + nameLen + extraLen + commentLen;

  const dest = path.resolve(root, name);
  if (dest !== root && !dest.startsWith(root + path.sep)) throw new Error('잘못된 경로: ' + name);
  if (name.endsWith('/')) { fs.mkdirSync(dest, { recursive: true }); continue; }

  if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('ZIP 항목이 손상되었습니다: ' + name);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + csize);
  let out;
  if (method === 0) out = data;
  else if (method === 8) out = zlib.inflateRawSync(data);
  else throw new Error(`지원하지 않는 압축 방식(${method}): ${name}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
}
