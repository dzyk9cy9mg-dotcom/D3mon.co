// The /api/v1 live feed: one Server-Sent Events stream per client, subscribed to named topics
// ("battles", "battle:<id>", "admin:applications"…). Each event is { type, data }, so any front end
// (the current page, the future 3D site, a bot dashboard) can follow along without polling.
//
// Who may see what is decided twice: when a stream opens (allow) and again for every event (the
// `visible` check passed to publish), using the reader's current role, so a demoted admin stops
// receiving admin events without reconnecting.

const MAX_TOPICS = 20;
const MAX_STREAMS_PER_IP = 20;
const TOPIC_RE = /^[a-z]+(:[A-Za-z0-9_-]{1,64})?$/;

export class Feed {
  // allow(ctx, topic) -> true | false; ctxNow(stream) -> the reader's current context.
  constructor({ allow, ctxNow }) {
    this.allow = allow;
    this.ctxNow = ctxNow;
    this.streams = new Set();
    this.seq = 0;
  }

  parseTopics(raw) {
    const topics = [...new Set(String(raw || "").split(",").map(s => s.trim()).filter(Boolean))];
    if (!topics.length || topics.length > MAX_TOPICS || !topics.every(t => TOPIC_RE.test(t))) return null;
    return topics;
  }

  // Returns false (and sends nothing) when the topics are bad or not allowed; the caller answers.
  open(res, { ctx, ip, topics }) {
    let fromIp = 0;
    for (const s of this.streams) if (s.ip === ip) fromIp++;
    if (fromIp >= MAX_STREAMS_PER_IP) return "too_many";
    if (!topics.every(t => this.allow(ctx, t))) return "not_granted";
    const stream = { ctx, ip, topics: new Set(topics), res };
    this.streams.add(stream);
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
    res.write(`retry: 2000\n\n`);
    this.#send(stream, "hello", { topics });
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    res.on("close", () => {
      clearInterval(ping);
      this.streams.delete(stream);
    });
    return "ok";
  }

  // data may be a function of the reader's context, so each reader gets only the fields they may see.
  // visible(ctx) narrows who receives this event among the topic's subscribers.
  publish(topic, type, data, visible = null) {
    for (const s of this.streams) {
      if (!s.topics.has(topic)) continue;
      const ctx = this.ctxNow(s);
      if (!ctx || !this.allow(ctx, topic) || (visible && !visible(ctx))) continue;
      this.#send(s, type, typeof data === "function" ? data(ctx) : data, topic);
    }
  }

  // "Who's here now" (owner, 2026-10-19): how many people have a page open on the live feed, and how many of
  // them are signed in. Counts only, never who (privacy by default). A person with several tabs counts once.
  presence() {
    const people = new Set(), members = new Set();
    for (const s of this.streams) { people.add(s.ctx.uid || `ip:${s.ip}`); if (s.ctx.uid) members.add(s.ctx.uid); }
    return { here: people.size, members: members.size };
  }

  // Ends the streams of a session that signed out.
  endSession(sessionKey) {
    for (const s of this.streams) if (sessionKey && s.ctx.sessionKey === sessionKey) s.res.end();
  }

  close() {
    for (const s of this.streams) s.res.end();
  }

  #send(stream, type, data, topic = null) {
    const id = ++this.seq;
    stream.res.write(`id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({ type, topic, at: Date.now(), data })}\n\n`);
    if (stream.res.writableLength > 4 * 1024 * 1024) stream.res.destroy();
  }
}
