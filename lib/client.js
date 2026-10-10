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

    const LANGS = ["en-US", "en-GB", "ru-RU", "de-DE", "fr-FR", "es-ES", "it-IT", "tr-TR", "pl-PL", "nl-NL", "ja-JP", "ko-KR", "zh-CN"];

    function micIcon() {
      return React.createElement("svg", {
        width: 14, height: 14, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round",
        "stroke-linejoin": "round", "aria-hidden": true
      },
        React.createElement("path", { d: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" }),
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
            lastResultAt: 0
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

        React.useEffect(() => {
          const data = new Uint8Array(512);
          return ctx.interval(() => {
            if (entry.analyser === null) return;
            entry.analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i += 1) {
              const v = (data[i] - 128) / 128;
              sum += v * v;
            }
            setLevel(Math.min(1, Math.sqrt(sum / data.length) * 6));
          }, 150);
        }, []);

        React.useEffect(() => ctx.interval(() => {
          if (recording && status === "listening" && entry.lastResultAt > 0 && Date.now() - entry.lastResultAt > 10000) {
            setStalled(true);
          }
        }, 2000), [recording, status]);

        React.useEffect(() => () => {
          flushPending();
          entry.shouldListen = false;
          if (entry.rec !== null) {
            try { entry.rec.stop(); } catch (err) { /* already ended */ }
            entry.rec = null;
          }
          stopMeter();
        }, []);

        const beginRecognition = () => {
          if (SpeechCtor === undefined) return;
          const rec = new SpeechCtor();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = entry.lang;
          rec.onstart = () => setStatus("listening");
          rec.onresult = (event) => {
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
          if (SpeechCtor === undefined || entry.rec !== null) return;
          entry.shouldListen = true;
          entry.restarts = 0;
          entry.pending = "";
          entry.lastResultAt = Date.now();
          setStalled(false);
          setError("");
          setRecording(true);
          setStatus("starting");
          beginRecognition();
          startMeter();
        };

        const stop = () => {
          flushPending();
          entry.shouldListen = false;
          const rec = entry.rec;
          entry.rec = null;
          if (rec !== null) {
            try { rec.stop(); } catch (err) { /* ignore */ }
          }
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

        const supported = SpeechCtor !== undefined;
        const hint = stalled
          ? "No results for 10s — \"" + entry.lang + "\" may not be supported; pick another language"
          : (status === "no-speech" ? "No speech detected yet — is the mic picking you up?" : "");

        return React.createElement("div", { className: "dictation-mic" },
          React.createElement("button", {
            type: "button",
            className: recording ? "recording" : "",
            disabled: !supported,
            onClick,
            title: supported
              ? (recording ? "Stop dictation (" + entry.lang + ")" : "Start dictation (" + entry.lang + ")")
              : "Web Speech API is not supported in this browser"
          }, micIcon(), React.createElement("span", null, recording ? "Listening…" : "Dictate")),
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
