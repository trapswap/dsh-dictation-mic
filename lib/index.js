// Host half of dsh-dictation-mic: registers an authenticated same-origin route
// that the browser half POSTs audio chunks to for Whisper transcription.
//
// The browser half (lib/client.js) sends { pcm: <base64 little-endian int16>, sr, lang }
// to "/api/dictation/transcribe"; this half runs Xenova Whisper (CPU, local) and
// answers { text } or { error }. The model loads lazily on the first request.

const ROUTE_PATH = "/api/dictation/transcribe";
const MODEL_ID = "Xenova/whisper-small";
const MAX_BODY_BYTES = 8 * 1024 * 1024;

let asr = null;
let queue = null;

async function ensureModel() {
  if (asr !== null) return asr;
  const transformers = await import("@huggingface/transformers");
  const os = await import("node:os");
  transformers.env.cacheDir = os.homedir() + "/.dsh/cache/dsh-dictation-whisper";
  asr = await transformers.pipeline("automatic-speech-recognition", MODEL_ID);
  console.log("[dictation] whisper model loaded");
  return asr;
}

async function readBody(request) {
  const body = request.body;
  if (body === null) return null;
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const value = chunk.value;
    total += value.length;
    if (total > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i += 1) merged[offset + i] = c[i];
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

async function transcribe(payload) {
  const model = await ensureModel();
  const pcm = Uint8Array.from(atob(payload.pcm), (c) => c.charCodeAt(0));
  const count = pcm.length >> 1;
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const low = pcm[2 * i];
    const high = pcm[2 * i + 1];
    let v = low | (high << 8);
    if (v >= 0x8000) v -= 0x10000;
    samples[i] = v / 32768;
  }
  const options = { chunk_length_s: 30, stride_length_s: 5, task: "transcribe" };
  if (payload.lang !== "auto") options.language = payload.lang;
  const out = await model(samples, options);
  const text = typeof out === "string" ? out : (out.text ?? "");
  return text.trim();
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function handleTranscribe(request) {
  console.log("[dictation] POST hit the route: " + request.url);
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  let payload = null;
  try {
    const raw = await readBody(request);
    if (raw === null) return jsonError("missing body", 400);
    payload = JSON.parse(raw);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 400);
  }
  if (typeof payload.pcm !== "string" || typeof payload.sr !== "number") {
    return jsonError("expected { pcm, sr, lang }", 400);
  }
  const previous = queue;
  const mine = (async () => {
    if (previous !== null) {
      try { await previous; } catch (err) { /* previous failure is independent */ }
    }
    return await transcribe(payload);
  })();
  queue = mine;
  try {
    const text = await mine;
    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dictation] transcribe failed: " + msg);
    return jsonError(msg, 200);
  }
}

function apply(ctx) {
  const connection = ctx.get("connection", false);
  if (connection === undefined) {
    console.warn("[dictation] no connection service; Whisper route NOT registered");
    return;
  }
  ctx.effect(() => connection.fetch.register({
    path: ROUTE_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: (request) => handleTranscribe(request)
  }), "dictation: transcribe route");
  console.log("[dictation] Whisper route registered at " + ROUTE_PATH);
}

export { apply };
export const inject = ["connection"];
