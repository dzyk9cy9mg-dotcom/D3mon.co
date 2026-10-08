// `npm run package` builds dist/d3mon-site.zip: everything the site needs to run on a host, and nothing
// else (no tests, site data, notes, dev tools, or hidden files such as .env). DEPLOY.md says what to do with it.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { ROOT } from "../server/config.js";

const TOP = "d3mon"; // the folder the zip unpacks into
const FOLDERS = ["public", "server"];
const FILES = ["app.cjs", "README.md", "DEPLOY.md"];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

// The site itself has no dependencies, so the packed package.json leaves out the test tools.
function sitePackageJson() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  delete pkg.devDependencies;
  delete pkg.scripts.test;
  delete pkg.scripts.package;
  return Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A plain zip archive (deflate, UTF-8 names) that any unzip tool or hosting panel can open.
function zip(entries, when = new Date()) {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const method = deflated.length < data.length ? 8 : 0;
    const body = method ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(0x0314, 4); // made by: Unix, 2.0 (so file permissions below apply)
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE((0o100644 << 16) >>> 0, 38); // a regular file, rw-r--r--
    dir.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, body);
    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

export function buildPackage(outFile = path.join(ROOT, "dist", "d3mon-site.zip")) {
  const files = [...FOLDERS.flatMap(d => walk(d)), ...FILES].sort();
  const entries = files.map(f => ({ name: `${TOP}/${f}`, data: fs.readFileSync(path.join(ROOT, f)) }));
  entries.push({ name: `${TOP}/package.json`, data: sitePackageJson() });
  const archive = zip(entries);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, archive);
  return { file: outFile, entries: entries.map(e => e.name), bytes: archive.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { file, entries, bytes } = buildPackage();
  console.log(`Built ${path.relative(ROOT, file)}: ${entries.length} files, ${(bytes / 1024).toFixed(0)} KB. See DEPLOY.md.`);
}
