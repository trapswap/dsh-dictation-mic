# dsh-dictation-mic

A static Cordis plugin row for the DeepSeek Harness Web UI: a microphone **Dictate**
button in the composer (`conversation.input.right` slot). Three STT engines:

- **Google (Web Speech API)** — desktop Chrome/Edge, fast streaming STT with live
  interim text; recognizes Bulgarian too (language auto-detected from the audio).
- **Whisper (server)** — audio is recorded in the browser, streamed as raw PCM chunks
  to an authenticated same-origin route (`/api/dictation/transcribe`), and transcribed
  locally on the Host with `Xenova/whisper-small` (CPU, offline after first download).
  This works where the Web Speech API has no backend: **Android Chrome**, Vivaldi,
  Firefox — and it supports **Bulgarian (`bg-BG`)**.
- **Voz (server)** — same PCM chunks, transcribed on the Host with Desert Ant Labs
  `@desert-ant-labs/voz` (NVIDIA Parakeet TDT 0.6B v3, CC BY 4.0) on `onnxruntime-node`
  CPU. 25 European languages incl. **Bulgarian**, auto-detected (no language parameter);
  noticeably more accurate than Whisper small for Bulgarian. Model (~409 MB) is cached
  under `~/.dsh/cache/desert-ant-models` (persistent volume).

Mode dropdown: `Auto` (Google on real Chrome/Edge, Whisper everywhere else — Vivaldi,
Opera, Firefox, Android), `Google (desktop)`, `Whisper (server)`, `Voz (server)`.

Features:
- auto-restart on engine `onend` (Chrome short-session ends) while you want to listen
- live audio level meter (getUserMedia + AnalyserNode) — proof the mic is picking you up
- live interim transcript display (Google mode); appended text feedback (Whisper mode)
- pending-text flush on stop/unmount
- language dropdown incl. `bg-BG` (Whisper forces `bg`; Google mode auto-detects the
  spoken language, so Bulgarian works there as well)
- stall watchdog: warns after 10s of listening with no results

## Install (survives container restarts)

1. Push this directory to GitHub, then on the machine running the DSH container:

   ```bash
   cd ~/.dsh/profiles/web
   pnpm install github:<your-user>/dsh-dictation-mic
   ```

   Note: `@huggingface/transformers` (pulled as a dependency) installs `onnxruntime-node`
   whose postinstall fetches the native ONNX Runtime binary. If pnpm withholds install
   scripts, approve them (`pnpm approve <pkg>` / config `trustedPackages`) or the Whisper
   route will report an import error at first use.

2. Add the row to `~/.dsh/profiles/web/cordis.patch.yml` (the editable patch layer —
   never edit `cordis.yml` itself):

   ```yaml
   - id: dictation-mic
     name: dsh-dictation-mic
   ```

3. Restart the web profile. The button appears in the composer tool row on every start;
   static composition rows need no approval.

## How it works

- `package.json` declares `dsh.client` (platform `web`, service providers consumed), so
  the client-modules node serves `./client` to the browser module graph.
- `lib/client.js` is the client half in `window.__ModuleLoader__.load` format; its plugin
  object declares `inject: ["timer"]` and `apply(ctx)`, which registers a React component
  (via `React.createElement`) in the `conversation.input.right` slot. Whisper mode records
  raw 16 kHz int16 PCM via `ScriptProcessorNode` and `fetch`es same-origin chunks.
- `lib/index.js` is the Host half: it registers the authenticated fetch route on the
  Connection service (`ctx.connection.fetch.register`) and lazily loads the Whisper model
  (cache: `~/.dsh/cache/dsh-dictation-whisper` — inside the persistent DSH volume, survives
  container recreation; ~280 MB, downloaded once from the HF mirror) or the Voz bundle
  (cache: `~/.dsh/cache/desert-ant-models`, ~409 MB; symlink `~/.cache/desert-ant-models`
  into the persistent volume so it survives container recreation).
- Voz in Node takes a **file path** (streamed WAV); its in-memory `Float32Array` input
  crashes the WASM build, so the Host half writes each chunk as a 16-bit WAV to a temp
  file and passes the path.

## Requirements

- Google mode: Chrome or Edge (the recognition backend is Google's; Chromium forks without
  it — e.g. Vivaldi — start but never return results).
- Whisper/Voz mode: any browser with `getUserMedia` (Android Chrome included); the Host needs
  network access once for the model download, disk, and a few hundred MB of RAM.
- Voz needs `onnxruntime-node`'s native binding (approve pnpm build scripts for it).
- Microphone permission in the browser.

License: MIT.
