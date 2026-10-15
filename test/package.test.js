// npm run package: the zip holds exactly what the site needs, every file intact, and the site starts from it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { ROOT } from "../server/config.js";
import { buildPackage, crc32 } from "../scripts/package.js";

// Reads every entry of a zip archive through its central directory.
function readZip(buf) {
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50, "end-of-archive record");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, "central directory entry");
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    assert.equal(buf.readUInt32LE(local), 0x04034b50, `local header for ${name}`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    assert.equal(crc32(data), crc, `checksum of ${name}`);
    out.set(name, data);
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

test("the upload zip holds the site and nothing private, and the site runs from it", async () => {
  const dir = path.join(ROOT, ".test-data", crypto.randomBytes(6).toString("hex"));
  try {
    const { file } = buildPackage(path.join(dir, "d3mon-site.zip"));
    const entries = readZip(fs.readFileSync(file));
    const names = [...entries.keys()];

    for (const must of ["app.cjs", "package.json", "README.md", "DEPLOY.md", "server/start.js", "server/index.js", "server/cli.js", "public/index.html", "public/login.html", "public/js/d3mon.js", "public/js/runtime.js", "public/css/d3mon.css"]) {
      assert.ok(entries.has(`d3mon/${must}`), must);
    }
    for (const name of names) {
      assert.ok(name.startsWith("d3mon/"), name);
      assert.doesNotMatch(name, /(^|\/)\.|^d3mon\/(test|data|node_modules|scripts|artifact-original|dist)\/|CLAUDE|package-lock/, name);
    }
    for (const name of names.filter(n => n !== "d3mon/package.json")) {
      assert.ok(entries.get(name).equals(fs.readFileSync(path.join(ROOT, name.slice("d3mon/".length)))), `${name} matches the source`);
    }
    const pkg = JSON.parse(entries.get("d3mon/package.json"));
    assert.equal(pkg.devDependencies, undefined);
    assert.equal(pkg.scripts.test, undefined);
    assert.equal(pkg.scripts.start, "node server/start.js");

    // Unpack it and start the site the way a hosting panel would: from app.cjs, under a path.
    const site = path.join(dir, "site");
    for (const [name, data] of entries) {
      fs.mkdirSync(path.dirname(path.join(site, name)), { recursive: true });
      fs.writeFileSync(path.join(site, name), data);
    }
    const env = { ...process.env, PORT: "0", HOST: "127.0.0.1", D3MON_DOTENV: "off", D3MON_DATA_DIR: path.join(dir, "data"), D3MON_BASE_PATH: "/d3mon", ANTHROPIC_API_KEY: "", D3MON_KALSHI: "off" };
    const child = spawn(process.execPath, ["app.cjs"], { cwd: path.join(site, "d3mon"), env, stdio: ["ignore", "pipe", "pipe"] });
    const exited = new Promise(resolve => child.on("exit", (code, signal) => resolve({ code, signal })));
    try {
      const url = await new Promise((resolve, reject) => {
        let out = "";
        const timer = setTimeout(() => reject(new Error(`no start-up line; output: ${out}`)), 10000);
        child.stdout.on("data", c => {
          out += c;
          const m = out.match(/running at (http:\/\/127\.0\.0\.1:\d+\/d3mon\/)/);
          if (m) { clearTimeout(timer); resolve(m[1]); }
        });
        child.stderr.on("data", c => (out += c));
      });
      const home = await fetch(url);
      assert.equal(home.status, 200);
      assert.match(await home.text(), /<title>D3MON\.CO<\/title>/);
      assert.deepEqual(await (await fetch(`${url}api/session`)).json(), { user: null, sampling: false, signups: true });
    } finally {
      child.kill("SIGTERM");
    }
    assert.deepEqual(await exited, { code: 0, signal: null }, "a clean shutdown on SIGTERM");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
