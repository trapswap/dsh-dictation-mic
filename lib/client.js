window.__ModuleLoader__.load({
  id: "dsh-dictation-mic",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    const inject = ["timer"];

    const CSS =
      ".dictation-mic{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;}" +
      ".dictation-mic button{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;}" +
      ".dictation-mic button:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);}" +
      ".dictation-mic button.recording{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);animation:dictation-pulse 1.4s ease-in-out infinite;}" +
      ".dictation-mic button:disabled{opacity:.45;cursor:not-allowed;}" +
      ".dictation-mic select{font-size:12px;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:3px 4px;cursor:pointer;}" +
      ".dictation-mic .meter{width:44px;height:6px;border-radius:3px;background:var(--dsw-alias-border-l1);overflow:hidden;}" +
      ".dictation-mic .meter-fill{display:block;height:100%;background:var(--dsw-alias-state-error-primary);transition:width .15s ease;}" +
      ".dictation-mic .live{font-size:12px;color:var(--dsw-alias-label-secondary);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".dictation-mic .hint{font-size:12px;color:var(--dsw-alias-state-warn-primary);font-style:italic;}" +
      "@keyframes dictation-pulse{0%,100%{opacity:1}50%{opacity:.45}}";

    const LANGS = ["bg-BG", "en-US", "en-GB", "ru-RU", "de-DE", "fr-FR", "es-ES", "it-IT", "tr-TR", "pl-PL", "nl-NL", "ja-JP", "ko-KR", "zh-CN"];
    const WHISPER_LANG = {
      "bg-BG": "bg", "en-US": "en", "en-GB": "en", "ru-RU": "ru", "de-DE": "de",
      "fr-FR": "fr", "es-ES": "es", "it-IT": "it", "tr-TR": "tr", "pl-PL": "pl",
      "nl-NL": "nl", "ja-JP": "ja", "ko-KR": "ko", "zh-CN": "zh"
    };

    const isAndroid = /android/i.test(navigator.userAgent || "");

    function micIcon() {
      return React.createElement("svg", {
        width: 14, height: 14, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round",
        "stroke-linejoin": "round", "aria-hidden": true
      },
        React.createElement("path", { d: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0 3-3z" }),
        React.createElement("path", { d: "M5 11a7 7 0 0 0 14 0" }),
        React.createElement("line", { x1: 12, y1: 18, x2: 12, y2: 21 })
      );
    }

    function apply(ctx) {
      const slots = ctx.get("slots");
      if (slots === undefined) return;

      const SpeechCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-dictation-mic";
      tag.textContent = CSS;
      document.head.append(tag);
      ctx.effect(() => () => tag.remove(), "dictation styles");

      const bySession = new Map();
      function entryFor(sessionId) {
        let entry = bySession.get(sessionId);
        if (entry === undefined) {
          entry = {
            rec: null, draft: "", shouldListen: false, restarts: 0, pending: "",
            stream: null, analyser: null, audioCtx: null,
            lang: navigator.language || "en-US",
            lastResultAt: 0,
            server: null, acc: [], carrySum: 0, carryCount: 0, ratio: 3,
            pendingSends: 0
          };
          bySession.set(sessionId, entry);
        }
        return entry;
      }

      function DictationControl(props) {
        const inputActions = props.inputActions;
        const sessionId = props.sessionId;
        const draft = props.useInput((s) => s.draft);
        const entry = entryFor(sessionId);
        entry.draft = draft;

        const [recording, setRecording] = React.useState(false);
        const [status, setStatus] = React.useState("idle");
        const [interim, setInterim] = React.useState("");
        const [error, setError] = React.useState("");
        const [level, setLevel] = React.useState(0);
        const [langSel, setLangSel] = React.useState("auto");
        const [stalled, setStalled] = React.useState(false);
        const [modeSel, setModeSel] = React.useState("auto");

        const whisperMode = () => modeSel === "whisper" || (modeSel === "auto" && isAndroid);
        const googleMode = () => !whisperMode();

        const appendText = (text) => {
          if (inputActions === undefined || text === "") return;
          const base = entry.draft;
          inputActions.setDraft(base + (base === "" ? "" : " ") + text.trim());
        };

        const flushPending = () => {
          if (entry.pending !== "") appendText(entry.pending);
          entry.pending = "";
        };

        const stopMeter = () => {
          if (entry.stream !== null) {
            entry.stream.getTracks().forEach((t) => t.stop());
            entry.stream = null;
          }
          if (entry.audioCtx !== null) {
            try { entry.audioCtx.close(); } catch (err) { /* ignore */ }
            entry.audioCtx = null;
          }
          entry.analyser = null;
        };

        const startMeter = () => {
          if (navigator.mediaDevices === undefined) return;
          navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
            if (!entry.shouldListen) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            entry.stream = stream;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC === undefined) return;
            entry.audioCtx = new AC();
            const src = entry.audioCtx.createMediaStreamSource(stream);
            entry.analyser = entry.audioCtx.createAnalyser();
            entry.analyser.fftSize = 512;
            src.connect(entry.analyser);
          }).catch(() => {
            setError("Microphone access denied or unavailable");
            setStatus("error");
          });
        };

        // ---- Whisper (server) path: raw PCM chunks to the Host route ----
        const CHUNK_SAMPLES = 16000 * 10;

        const isFiller = (text) => {
          const t = text.toLowerCase().replace(/[.,!?…]+/g, " ").trim();
          if (t === "") return true;
          if (/^(you|your|you you.+|thanks?( you)?|thank you so much|too much thanks|bye|the  ?the(  ?the)+|много thanks|съжа|bogrski[r]?)$/.test(t)) return true;
          const words = t.split(/\s+/);
          if (words.length >= 3 && new Set(words).size === 1) return true;
          return false;
        };

        const sendChunk = (int16) => {
          let maxAbs = 0;
          let sumSq = 0;
          for (let i = 0; i < int16.length; i += 1) {
            const v = int16[i];
            const a = v < 0 ? -v : v;
            if (a > maxAbs) maxAbs = a;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / Math.max(1, int16.length));
          if (maxAbs < 2500 || rms < 900) return;
          const bytes = new Uint8Array(int16.buffer);
          let s = "";
          for (let i = 0; i < bytes.length; i += 0x8000) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          const lang = WHISPER_LANG[entry.lang] || "auto";
          entry.pendingSends += 1;
          fetch("/api/dictation/transcribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pcm: btoa(s), sr: 16000, lang })
          }).then((resp) => resp.text().then((t) => {
            entry.pendingSends -= 1;
            if (!resp.ok) {
              setError("Server STT: HTTP " + resp.status + " " + String(t).slice(0, 140));
              setStatus("error");
              return;
            }
            let p = null;
            try { p = JSON.parse(t); } catch (err) {
              setError("Server STT: not JSON — " + String(t).slice(0, 140));
              setStatus("error");
              return;
            }
            const langCode = WHISPER_LANG[entry.lang] || "auto";
            const wrongScript = langCode === "bg" && !/[\u0400-\u04FF]/.test(p.text);
            if (p.text !== undefined && p.text !== "" && !isFiller(p.text) && !wrongScript) {
              appendText(p.text);
              setInterim(p.text);
              entry.lastResultAt = Date.now();
              setStalled(false);
            } else if (p.error !== undefined) {
              setError("Server STT: " + p.error);
              setStatus("error");
            }
          })).catch((err) => {
            entry.pendingSends -= 1;
            setError("Server STT unreachable: " + (err instanceof Error ? err.message : String(err)));
            setStatus("error");
          });
        };

        const startServer = () => {
          if (navigator.mediaDevices === undefined) {
            setError("getUserMedia unavailable in this browser");
            setStatus("error");
            return;
          }
          navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
            if (!entry.shouldListen) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            entry.stream = stream;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC === undefined) return;
            entry.audioCtx = new AC();
            const src = entry.audioCtx.createMediaStreamSource(stream);
            entry.analyser = entry.audioCtx.createAnalyser();
            entry.analyser.fftSize = 512;
            src.connect(entry.analyser);
            const SR = entry.audioCtx.sampleRate || 48000;
            entry.ratio = Math.max(1, Math.round(SR / 16000));
            const proc = entry.audioCtx.createScriptProcessor(4096, 1, 1);
            const sink = entry.audioCtx.createGain();
            sink.gain.value = 0;
            src.connect(proc);
            proc.connect(sink);
            sink.connect(entry.audioCtx.destination);
            entry.server = proc;
            proc.onaudioprocess = (event) => {
              const data = event.inputBuffer.getChannelData(0);
              const ratio = entry.ratio;
              for (let i = 0; i < data.length; i += 1) {
                entry.carrySum += data[i];
                entry.carryCount += 1;
                if (entry.carryCount === ratio) {
                  let v = Math.round((entry.carrySum / ratio) * 32767);
                  if (v > 32767) v = 32767;
                  if (v < -32768) v = -32768;
                  entry.acc.push(v);
                  entry.carrySum = 0;
                  entry.carryCount = 0;
                }
              }
              if (entry.acc.length >= CHUNK_SAMPLES) {
                const head = entry.acc.slice(0, CHUNK_SAMPLES);
                entry.acc = entry.acc.slice(CHUNK_SAMPLES);
                sendChunk(Int16Array.from(head));
              }
            };
            setStatus("listening");
          }).catch(() => {
            setError("Microphone access denied or unavailable");
            setStatus("error");
          });
        };

        const flushServer = () => {
          if (entry.acc.length >= 16000 * 2) {
            const head = entry.acc;
            entry.acc = [];
            sendChunk(Int16Array.from(head));
          }
        };

        const stopServer = () => {
          if (entry.server !== null) {
            try { entry.server.disconnect(); } catch (err) { /* ignore */ }
            entry.server = null;
          }
          entry.acc = [];
          entry.carrySum = 0;
          entry.carryCount = 0;
        };

        // ---- Web Speech (Google) path ----
        const beginRecognition = () => {
          if (SpeechCtor === undefined) return;
          const rec = new SpeechCtor();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = entry.lang;
          rec.onstart = () => setStatus("listening");
          rec.onresult = (event) => {
            if (!entry.shouldListen) return;
            entry.lastResultAt = Date.now();
            setStalled(false);
            let live = "";
            let finalText = "";
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
              const result = event.results[i];
              if (result.isFinal) finalText += result[0].transcript;
              else live += result[0].transcript;
            }
            if (finalText !== "") {
              appendText(finalText);
              entry.pending = "";
              entry.restarts = 0;
            } else {
              entry.pending = live;
            }
            setInterim(live);
          };
          rec.onerror = (event) => {
            if (event.error === "no-speech") {
              setStatus("no-speech");
            } else if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture" || event.error === "aborted") {
              entry.shouldListen = false;
              setError("Microphone access denied or unavailable");
              setStatus("error");
              setInterim("");
            } else {
              setError(String(event.error));
              setStatus("error");
            }
          };
          rec.onend = () => {
            if (entry.shouldListen && entry.rec === rec && entry.restarts < 200) {
              entry.restarts += 1;
              try { rec.start(); } catch (err) { /* already started or disposed */ }
              return;
            }
            setRecording(false);
            setInterim("");
            setStatus("idle");
          };
          entry.rec = rec;
          try {
            rec.start();
          } catch (err) {
            entry.rec = null;
            setError("Could not start dictation");
            setStatus("error");
          }
        };

        const start = () => {
          if (entry.rec !== null || entry.server !== null) return;
          entry.shouldListen = true;
          entry.restarts = 0;
          entry.pending = "";
          entry.lastResultAt = Date.now();
          setStalled(false);
          setError("");
          setRecording(true);
          setStatus("starting");
          if (whisperMode()) {
            startServer();
          } else if (SpeechCtor !== undefined) {
            beginRecognition();
            startMeter();
          } else {
            setError("Web Speech API unavailable — switch mode to Whisper");
            setStatus("error");
            entry.shouldListen = false;
          }
        };

        const stop = () => {
          flushPending();
          flushServer();
          entry.shouldListen = false;
          const rec = entry.rec;
          entry.rec = null;
          if (rec !== null) {
            try { rec.stop(); } catch (err) { /* ignore */ }
          }
          stopServer();
          setRecording(false);
          setStatus("idle");
          setInterim("");
          setLevel(0);
          stopMeter();
        };

        const onClick = () => {
          if (recording) stop();
          else start();
        };

        const onLangChange = (event) => {
          const value = event.target.value;
          setLangSel(value);
          entry.lang = value === "auto" ? (navigator.language || "en-US") : value;
          setStalled(false);
          if (recording && entry.rec !== null) {
            const old = entry.rec;
            entry.rec = null;
            try { old.stop(); } catch (err) { /* ignore */ }
            beginRecognition();
          }
        };

        const onModeChange = (event) => {
          const value = event.target.value;
          setModeSel(value);
          setStalled(false);
          if (recording) {
            stop();
            start();
          }
        };

        const supported = whisperMode() || SpeechCtor !== undefined;
        const hint = stalled
          ? "No results for 10s — try Whisper mode (server STT, works on mobile)"
          : (status === "no-speech" ? "No speech detected yet — is the mic picking you up?" : "");

        return React.createElement("div", { className: "dictation-mic" },
          React.createElement("button", {
            type: "button",
            className: recording ? "recording" : "",
            disabled: !supported,
            onClick,
            title: supported
              ? (recording ? "Stop dictation (" + entry.lang + ")" : "Start dictation (" + entry.lang + ")")
              : "No STT backend available in this browser"
          }, micIcon(), React.createElement("span", null, recording ? (whisperMode() ? "Listening… (server)" : "Listening…") : "Dictate")),
          supported ? React.createElement("select", {
            className: "mode", value: modeSel, onChange: onModeChange,
            title: "STT engine: Auto = Whisper on Android, Google elsewhere"
          }, React.createElement("option", { value: "auto" }, "Auto"),
            React.createElement("option", { value: "google" }, "Google (desktop)"),
            React.createElement("option", { value: "whisper" }, "Whisper (server)")) : null,
          supported ? React.createElement("select", {
            className: "lang", value: langSel, onChange: onLangChange,
            title: "Recognition language"
          }, React.createElement("option", { value: "auto" }, "Auto"),
            LANGS.map((code) => React.createElement("option", { key: code, value: code }, code))) : null,
          recording ? React.createElement("span", { className: "meter" },
            React.createElement("span", { className: "meter-fill", style: { width: String(Math.round(level * 100)) + "%" } })) : null,
          error !== "" ? React.createElement("span", { className: "live" }, error) : null,
          interim !== "" ? React.createElement("span", { className: "live" }, interim) : null,
          hint !== "" ? React.createElement("span", { className: "hint" }, hint) : null
        );
      }

      slots.inject("conversation.input.right", () => slots.register(
        { name: "conversation.input.right", id: "dictation.mic", order: 10, label: "Dictation" },
        (props) => DictationControl(props)
      ));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
