// The Arena's history: an append-only log, one JSON line per event, one file per month in data/ledger/.
// Lines are never changed or removed. A correction is a new line, and readers take the latest one for
// each key. Each append is flushed to disk before it returns, so an answered request survives a crash.
//
// Every line has t (its type), id, at (server time) and by (who wrote it). The types are in
// ARCHITECTURE.md §5: "metric" and "score" since step 3; "call" from step 4.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

const MAX_LINE_BYTES = 8 * 1024;
const FILE_RE = /^\d{4}-\d{2}\.jsonl$/;

// Emits "append" with the new lines, so readers can keep their own indexes up to date.
export class Ledger extends EventEmitter {
  constructor({ dir }) {
    super();
    this.dir = dir;
    this.lines = []; // in write order
  }

  load() {
    let files;
    try {
      files = fs.readdirSync(this.dir).filter(f => FILE_RE.test(f)).sort();
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    for (const f of files) {
      const file = path.join(this.dir, f);
      const text = fs.readFileSync(file, "utf8");
      const rows = text.split("\n");
      rows.forEach((row, i) => {
        if (!row.trim()) return;
        try {
          this.lines.push(JSON.parse(row));
        } catch {
          // Only a crash in the middle of a write leaves a bad line, and only as the last one.
          console.warn(`Skipping an unreadable line in ${file} (line ${i + 1}).`);
        }
      });
      // A cut-off last line has no newline; end it so the next append starts on a line of its own.
      if (text && !text.endsWith("\n")) fs.appendFileSync(file, "\n");
    }
    this.lines.sort((a, b) => a.at - b.at || (a.seq ?? 0) - (b.seq ?? 0));
  }

  // Appends lines (all in one write, so a batch lands together) and returns them with id and at filled in.
  // `at` is the server time to stamp them with; the calls module passes the clock that decides the lock.
  append(entries, by, at = Date.now()) {
    const out = entries.map((e, i) => ({ ...e, id: crypto.randomBytes(9).toString("base64url"), at, seq: i, by }));
    const text = out.map(e => {
      const line = JSON.stringify(e);
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw new Error("ledger line too large");
      return `${line}\n`;
    }).join("");
    fs.mkdirSync(this.dir, { recursive: true });
    const fd = fs.openSync(path.join(this.dir, `${new Date(at).toISOString().slice(0, 7)}.jsonl`), "a");
    try {
      fs.writeSync(fd, text);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.lines.push(...out);
    this.emit("append", out);
    return out;
  }

  filter(match) {
    return this.lines.filter(match);
  }
}
