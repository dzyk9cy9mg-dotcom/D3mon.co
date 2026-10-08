// The page's `sample` capability, used by the Cosmic assistant. On claude.ai it ran on each viewer's own
// Claude account; here the server relays the conversation to the Anthropic Messages API with the site's
// API key (ANTHROPIC_API_KEY) and streams the answer back.
export class SampleError extends Error {
  constructor(code, message, text = "") {
    super(message);
    this.code = code;
    this.text = text;
  }
}

const MAX_MESSAGES = 60;
const MAX_CHARS = 400_000;

// The page sends [{role, content}] turns. Consecutive turns from the same side are joined into one.
export function normalizeMessages(input) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_MESSAGES) throw new SampleError("invalid_request", `Send 1 to ${MAX_MESSAGES} messages.`);
  const out = [];
  let total = 0;
  for (const m of input) {
    const role = m?.role === "user" || m?.role === "assistant" ? m.role : null;
    if (!role || typeof m.content !== "string") throw new SampleError("invalid_request", "Each message needs a role and text content.");
    total += m.content.length;
    if (total > MAX_CHARS) throw new SampleError("invalid_request", "The conversation is too long.");
    if (!m.content.trim()) continue;
    if (out.length && out.at(-1).role === role) out.at(-1).content += `\n\n${m.content}`;
    else out.push({ role, content: m.content });
  }
  if (!out.length || out[0].role !== "user") throw new SampleError("invalid_request", "The conversation has to start with a user message.");
  return out;
}

function errorCode(status) {
  if (status === 429 || status === 529) return "rate_limited";
  if (status === 401 || status === 403) return "sampling_disabled";
  return "error";
}

// Streams one answer. onText(delta) gets each new piece of text. Resolves to { text, truncated }.
export async function streamMessage({ apiKey, baseUrl, model, maxTokens, messages, signal, onText }) {
  let res;
  try {
    res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages, stream: true }),
    });
  } catch {
    if (signal?.aborted) throw new SampleError("cancelled", "Stopped");
    throw new SampleError("unavailable", "Couldn't reach the Anthropic API.");
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch {}
    throw new SampleError(errorCode(res.status), detail || `The Anthropic API answered ${res.status}.`);
  }
  let text = "", stop = null, buf = "";
  const decoder = new TextDecoder();
  const handle = line => {
    if (!line.startsWith("data:")) return;
    let ev;
    try { ev = JSON.parse(line.slice(5)); } catch { return; }
    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
      text += ev.delta.text;
      onText?.(ev.delta.text);
    } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
      stop = ev.delta.stop_reason;
    } else if (ev.type === "error") {
      const t = ev.error?.type;
      throw new SampleError(t === "overloaded_error" || t === "rate_limit_error" ? "rate_limited" : "error", ev.error?.message || "The answer stream failed.", text);
    }
  };
  try {
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        handle(buf.slice(0, i).replace(/\r$/, ""));
        buf = buf.slice(i + 1);
      }
    }
    if (buf) handle(buf.replace(/\r$/, ""));
  } catch (e) {
    if (e instanceof SampleError) throw e;
    if (signal?.aborted) throw new SampleError("cancelled", "Stopped", text);
    throw new SampleError("error", "The answer was interrupted.", text);
  }
  if (stop === "refusal") throw new SampleError("refused", "Claude declined to answer that.", text);
  return { text, truncated: stop === "max_tokens" };
}
