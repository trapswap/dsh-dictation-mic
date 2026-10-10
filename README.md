# dsh-dictation-mic

A static Cordis plugin row for the DeepSeek Harness Web UI: a microphone **Dictate**
button in the composer (`conversation.input.right` slot). Click to start/stop Web
Speech recognition; final transcript segments are appended to the draft input.

Features:
- auto-restart on engine `onend` (Chrome short-session ends) while you want to listen
- live audio level meter (getUserMedia + AnalyserNode) — proof the mic is picking you up
- live interim transcript display
- pending-text flush on stop/unmount
- language dropdown (Auto + supported languages; note `bg` is NOT supported by the
  Google backend — Chrome/Edge only, Vivaldi/Firefox have no recognition backend)
- stall watchdog: warns after 10s of listening with no results

## Install (survives container restarts)

1. Push this directory to GitHub, then on the machine running the DSH container:

   ```bash
   cd ~/.dsh/profiles/web
   pnpm install github:<your-user>/dsh-dictation-mic
   ```

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
  (via `React.createElement`) in the `conversation.input.right` slot.
- `lib/index.js` is the no-op Host half, matching the shipped client-package shape.

## Requirements

- Chrome or Edge (the recognition backend is Google's; Chromium forks without it —
  e.g. Vivaldi — start but never return results).
- Microphone permission in the browser.

License: MIT.
