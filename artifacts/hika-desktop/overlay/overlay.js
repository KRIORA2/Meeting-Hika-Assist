/* global window, document, navigator, MediaRecorder, FileReader, Blob */
// Hika Electron Overlay — overlay.js
// Full Parakeet-parity feature set

"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
let apiUrl          = "http://localhost:5000";
let sessionId       = null;
let sessionStart    = null;
let timerHandle     = null;
let isRecording     = false;
let mediaRecorder   = null;
let audioChunks     = [];
let mimeType        = "audio/webm;codecs=opus";
let latestUtterance = "";
let transcriptChunks = [];
let insights        = [];
let isAnalyzing     = false;
let chunkTimer      = null;
let clickThrough    = false;
let selectedDeviceId = "";
let currentFontSize  = 12;        // px
let langFilter       = "all";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const startScreen    = $("start-screen");
const sessionScreen  = $("session-screen");
const meetingNameEl  = $("meeting-name");
const startBtn       = $("start-btn");
const hdrTitle       = $("hdr-title");
const hdrTimer       = $("hdr-timer");
const statusDot      = $("status-dot");
const meetingBadge   = $("meeting-badge");
const recIndicator   = $("rec-indicator");
const txScroll       = $("tx-scroll");
const liveTxEl       = $("live-tx");
const liveTxText     = $("live-tx-text");
const aiScroll       = $("ai-scroll");
const historyStrip   = $("history-strip");
const historyList    = $("history-list");
const micBtn         = $("mic-btn");
const micSource      = $("mic-source");
const askInput       = $("ask-input");
const askBtn         = $("ask-btn");
const endBtn         = $("end-btn");
const endHdrBtn      = $("end-hdr-btn");
const hideBtn        = $("hide-btn");
const opacitySlider  = $("opacity-slider");
const fontDec        = $("font-dec");
const fontInc        = $("font-inc");
const clickthroughBtn = $("clickthrough-btn");
const exportBtn      = $("export-btn");
const langFilterSel  = $("lang-filter");
const shell          = $("shell");
const copyToast      = $("copy-toast");
const resizeHandle   = $("resize-handle");

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  if (window.hikaElectron) {
    apiUrl = await window.hikaElectron.getApiUrl();
    window.hikaElectron.pin();

    // Listen for meeting auto-detection from main process
    window.hikaElectron.onMeetingDetected(name => {
      meetingBadge.textContent = `● ${name}`;
      meetingBadge.style.display = "inline-block";
    });
  }

  // Detect best audio mime type
  for (const mt of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
  }

  // Populate mic sources
  await loadMicSources();
  micSource.addEventListener("change", () => { selectedDeviceId = micSource.value; });

  // Event listeners
  startBtn.addEventListener("click", handleStart);
  meetingNameEl.addEventListener("keydown", e => { if (e.key === "Enter") handleStart(); });
  micBtn.addEventListener("click", toggleRecording);
  endBtn.addEventListener("click", handleEnd);
  endHdrBtn.addEventListener("click", handleEnd);
  hideBtn.addEventListener("click", () => window.hikaElectron?.hide());
  askBtn.addEventListener("click", handleManualAsk);
  askInput.addEventListener("keydown", e => { if (e.key === "Enter") handleManualAsk(); });
  exportBtn.addEventListener("click", exportSession);
  langFilterSel.addEventListener("change", () => { langFilter = langFilterSel.value; renderInsights(); });

  // Toolbar controls
  opacitySlider.addEventListener("input", () => {
    shell.style.background = `rgba(7,7,15,${opacitySlider.value / 100})`;
  });
  fontDec.addEventListener("click", () => setFontSize(currentFontSize - 1));
  fontInc.addEventListener("click", () => setFontSize(currentFontSize + 1));
  clickthroughBtn.addEventListener("click", toggleClickThrough);

  // Resize handle
  initResize();

  // Global hotkey: Ctrl+Shift+H = hide
  document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.shiftKey && e.key === "H") {
      window.hikaElectron?.hide();
    }
  });
}

// ── Mic source selector ────────────────────────────────────────────────────────
async function loadMicSources() {
  try {
    // Request permission first so labels are populated
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === "audioinput");

    micSource.innerHTML = "";
    mics.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Mic ${micSource.options.length + 1}`;
      micSource.appendChild(opt);
    });

    if (mics.length > 0) selectedDeviceId = mics[0].deviceId;
  } catch {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Default mic";
    micSource.appendChild(opt);
  }
}

// ── Opacity & font ─────────────────────────────────────────────────────────────
function setFontSize(px) {
  currentFontSize = Math.min(16, Math.max(9, px));
  document.documentElement.style.setProperty("--fs", `${currentFontSize}px`);
}

// ── Click-through toggle ───────────────────────────────────────────────────────
function toggleClickThrough() {
  clickThrough = !clickThrough;
  if (window.hikaElectron) window.hikaElectron.setClickThrough(clickThrough);
  clickthroughBtn.textContent = `🖱️ ${clickThrough ? "On" : "Off"}`;
  clickthroughBtn.classList.toggle("active", clickThrough);
}

// ── Resize handle ──────────────────────────────────────────────────────────────
function initResize() {
  let startX, startY, startW, startH;
  resizeHandle.addEventListener("mousedown", e => {
    e.preventDefault();
    startX = e.clientX; startY = e.clientY;
    startW = shell.offsetWidth; startH = shell.offsetHeight;
    document.addEventListener("mousemove", onResize);
    document.addEventListener("mouseup", stopResize);
  });

  function onResize(e) {
    const w = Math.max(400, startW + (e.clientX - startX));
    const h = Math.max(300, startH + (e.clientY - startY));
    document.body.style.width  = `${w}px`;
    document.body.style.height = `${h}px`;
    shell.style.width  = `${w}px`;
    shell.style.height = `${h}px`;
    if (window.hikaElectron) window.hikaElectron.setSize(w, h);
  }

  function stopResize() {
    document.removeEventListener("mousemove", onResize);
    document.removeEventListener("mouseup", stopResize);
  }
}

// ── Export session ─────────────────────────────────────────────────────────────
function exportSession() {
  if (!transcriptChunks.length && !insights.length) return;

  const lines = [];
  const title = hdrTitle.textContent || "Meeting";
  const date  = new Date().toLocaleDateString();
  lines.push(`# Hika Session: ${title}`);
  lines.push(`**Date:** ${date}  **Duration:** ${hdrTimer.textContent}`);
  lines.push("");

  if (transcriptChunks.length) {
    lines.push("## Transcript");
    transcriptChunks.forEach(t => lines.push(`- ${t}`));
    lines.push("");
  }

  if (insights.length) {
    lines.push("## AI Answers");
    insights.slice().reverse().forEach(ins => {
      const t = ins.timestamp;
      const ts = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
      lines.push(`### [${ts}] ${ins.question}`);
      lines.push(ins.answer);
      ins.sections.forEach(s => {
        lines.push("");
        lines.push(`**${s.title}**`);
        lines.push("```" + (s.language || ""));
        lines.push(s.content);
        lines.push("```");
      });
      lines.push("");
    });
  }

  const md = lines.join("\n");
  const blob = new Blob([md], { type: "text/markdown" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `hika-${title.replace(/\s+/g, "-").toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("✓ Exported");
}

// ── Session ───────────────────────────────────────────────────────────────────
async function handleStart() {
  const title = meetingNameEl.value.trim() || "Meeting";
  startBtn.disabled   = true;
  startBtn.textContent = "Starting…";

  try {
    const res = await api("POST", "/api/sessions", { title, platform: "teams", status: "active" });
    sessionId    = res.id;
    sessionStart = Date.now();

    hdrTitle.textContent            = title;
    startScreen.style.display       = "none";
    sessionScreen.style.display     = "flex";
    sessionScreen.style.flexDirection = "column";
    sessionScreen.style.height      = "100%";

    startTimer();
  } catch (err) {
    startBtn.disabled    = false;
    startBtn.textContent = "Start Session";
    alert("Could not connect to Hika API.\n\nMake sure the API server is running at " + apiUrl);
    console.error(err);
  }
}

async function handleEnd() {
  if (!sessionId) return;
  if (isRecording) await stopRecording();
  try { await api("PATCH", `/api/sessions/${sessionId}`, { status: "ended" }); } catch {}
  sessionId    = null;
  clearInterval(timerHandle);
  timerHandle  = null;
  transcriptChunks = [];
  insights     = [];
  latestUtterance  = "";

  txScroll.innerHTML    = emptyHint("🎤", "Tap Record to start");
  aiScroll.innerHTML    = emptyHint("⚡", "AI answers appear here");
  historyStrip.style.display  = "none";
  historyList.innerHTML       = "";
  liveTxEl.style.display      = "none";
  meetingBadge.style.display  = "none";
  sessionScreen.style.display = "none";
  startScreen.style.display   = "flex";
  meetingNameEl.value  = "";
  startBtn.disabled    = false;
  startBtn.textContent = "Start Session";
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  timerHandle = setInterval(() => {
    if (!sessionStart) return;
    const s = Math.floor((Date.now() - sessionStart) / 1000);
    const m = Math.floor(s / 60);
    hdrTimer.textContent = `${m}:${String(s % 60).padStart(2, "0")}`;
  }, 1000);
}

// ── Audio recording ───────────────────────────────────────────────────────────
async function toggleRecording() {
  if (isRecording) await stopRecording(); else await startRecording();
}

async function startRecording() {
  try {
    const constraints = { audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    audioChunks   = [];
    let lastAnalyzedText = "";

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    // Final transcription when stopped manually
    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mimeType });
      audioChunks = [];
      if (blob.size < 1000) return;
      const text = await transcribeBlob(blob);
      if (text) {
        latestUtterance = text;
        addTranscriptChunk(text);
        if (text !== lastAnalyzedText) {
          lastAnalyzedText = text;
          analyze(text);
        }
      }
    };

    // ── Instant analysis every 4s ──────────────────────────────────────────
    chunkTimer = setInterval(async () => {
      if (!mediaRecorder || mediaRecorder.state !== "recording") return;
      mediaRecorder.requestData();
      const snap = audioChunks.slice();
      if (!snap.length) return;
      const blob = new Blob(snap, { type: mimeType });
      if (blob.size < 1000) return;
      const text = await transcribeBlob(blob);
      if (!text) return;

      latestUtterance      = text;
      liveTxText.textContent = text;
      liveTxEl.style.display = "block";

      const newChars    = text.length - lastAnalyzedText.length;
      const looksComplete = /[.?!,;]\s*$/.test(text) || text.length > 40;
      if (!isAnalyzing && looksComplete && newChars > 20) {
        lastAnalyzedText = text;
        analyze(text);
      }
    }, 4000);

    mediaRecorder.start();
    isRecording = true;
    micBtn.classList.add("recording");
    micBtn.textContent        = "⏹";
    micBtn.title              = "Stop recording";
    recIndicator.style.display = "inline";
    statusDot.textContent      = "● REC";
    statusDot.className        = "status-dot rec";
    liveTxEl.style.display     = "block";
    liveTxText.textContent     = "";

  } catch (err) {
    alert("Microphone access denied. Please allow microphone access for Hika.");
    console.error(err);
  }
}

async function stopRecording() {
  clearInterval(chunkTimer);
  isRecording = false;
  liveTxEl.style.display     = "none";
  micBtn.classList.remove("recording");
  micBtn.textContent         = "🎤";
  micBtn.title               = "Record";
  recIndicator.style.display = "none";
  statusDot.textContent      = "● Live";
  statusDot.className        = "status-dot";

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  mediaRecorder = null;
}

// ── Transcription ─────────────────────────────────────────────────────────────
async function transcribeBlob(blob) {
  const b64 = await blobToBase64(blob);
  try {
    const res = await api("POST", "/api/openai/transcribe", {
      audioBase64: b64,
      mimeType: blob.type,
    });
    return res.transcript || "";
  } catch (err) {
    console.error("Transcribe error", err);
    return "";
  }
}

// ── AI Analysis ───────────────────────────────────────────────────────────────
async function analyze(utterance) {
  if (!utterance || isAnalyzing) return;
  isAnalyzing = true;
  setAnalyzing(true);

  let screenshotBase64 = null;
  if (window.hikaElectron) {
    screenshotBase64 = await window.hikaElectron.captureScreen().catch(() => null);
  }

  const context = `ANSWER THIS: "${utterance}"`;

  try {
    const result = await api("POST", "/api/openai/analyze", {
      transcript: context,
      sessionId,
      screenshotBase64: screenshotBase64 || undefined,
    });
    if (!result) return;

    const insight = {
      question:    result.question || utterance,
      answer:      result.answer   || "",
      confidence:  result.confidence || "medium",
      suggestions: result.suggestions || [],
      sections:    result.sections   || [],
      timestamp:   new Date(),
    };

    try {
      await api("POST", "/api/insights", {
        sessionId,
        question:   insight.question,
        answer:     insight.answer,
        confidence: insight.confidence,
      });
    } catch {}

    insights.unshift(insight);
    renderInsights();
  } catch (err) {
    console.error("Analyze error", err);
  } finally {
    isAnalyzing = false;
    setAnalyzing(false);
  }
}

async function handleManualAsk() {
  const q = askInput.value.trim();
  if (!q || isAnalyzing) return;
  askInput.value    = "";
  askBtn.disabled   = true;
  await analyze(q);
  askBtn.disabled   = false;
}

// ── Render ─────────────────────────────────────────────────────────────────────
function addTranscriptChunk(text) {
  transcriptChunks.push(text);
  const hint = txScroll.querySelector(".empty-hint");
  if (hint) hint.remove();

  const bubble = document.createElement("div");
  bubble.className = "tx-bubble";
  bubble.innerHTML = `<span class="tx-speaker">You</span><span class="tx-text">${escHtml(text)}</span>`;
  txScroll.appendChild(bubble);
  txScroll.scrollTop = txScroll.scrollHeight;
}

function setAnalyzing(on) {
  statusDot.textContent = on ? "⚡ AI" : (isRecording ? "● REC" : "● Live");
  statusDot.className   = on ? "status-dot ai" : (isRecording ? "status-dot rec" : "status-dot");

  const existingRow = aiScroll.querySelector(".analyzing-row");
  if (on && !existingRow) {
    const hint = aiScroll.querySelector(".empty-hint");
    if (hint) hint.remove();
    const row = document.createElement("div");
    row.className = "analyzing-row";
    row.innerHTML = `<span class="pulse">⚡</span><span>Thinking…</span>`;
    aiScroll.prepend(row);
  } else if (!on && existingRow) {
    existingRow.remove();
  }
}

function renderInsights() {
  aiScroll.innerHTML = "";
  if (!insights.length) {
    aiScroll.innerHTML = emptyHint("⚡", "AI answers appear here");
    return;
  }

  // Latest answer — full card
  const card = buildInsightCard(insights[0]);
  aiScroll.appendChild(card);

  // History strip
  if (insights.length > 1) {
    historyStrip.style.display = "block";
    historyList.innerHTML = "";
    insights.slice(1).forEach((ins, i) => {
      const div = document.createElement("div");
      div.className = "history-item";
      const t = ins.timestamp;
      div.innerHTML = `
        <span class="history-time">${pad(t.getHours())}:${pad(t.getMinutes())}</span>
        <span class="history-q">${escHtml(ins.question)}</span>
      `;
      div.addEventListener("click", () => {
        aiScroll.innerHTML = "";
        aiScroll.appendChild(buildInsightCard(ins));
      });
      historyList.appendChild(div);
    });
  } else {
    historyStrip.style.display = "none";
  }
}

function buildInsightCard(ins) {
  const card = document.createElement("div");
  card.className = "ai-card";

  // Question label
  const q = document.createElement("div");
  q.className = "ai-q";
  q.textContent = ins.question;
  card.appendChild(q);

  // Answer with copy button
  const aWrap = document.createElement("div");
  aWrap.className = "ai-a-wrap";
  const aText = document.createElement("div");
  aText.className = "ai-a";
  aText.textContent = ins.answer;
  const copyAnswerBtn = makeCopyBtn(ins.answer);
  aWrap.appendChild(aText);
  aWrap.appendChild(copyAnswerBtn);
  card.appendChild(aWrap);

  // Confidence badge
  const conf = document.createElement("div");
  conf.className = `confidence conf-${ins.confidence}`;
  conf.textContent = ins.confidence;
  card.appendChild(conf);

  // Code sections — filter by language if selected
  let codeSections = ins.sections.filter(s => s.type === "code" || s.type === "sql" || s.type === "pyspark");
  if (langFilter !== "all") {
    codeSections = codeSections.filter(s =>
      (s.language || "").toLowerCase().includes(langFilter) ||
      (s.title || "").toLowerCase().includes(langFilter)
    );
  }

  codeSections.forEach(s => {
    const block = document.createElement("div");
    block.className = "ai-code-block";
    const copyCode  = makeCopyBtn(s.content);
    block.innerHTML = `<div class="ai-code-lbl">${escHtml(s.title || s.language || "Code")}</div><pre>${escHtml(s.content)}</pre>`;
    block.appendChild(copyCode);
    card.appendChild(block);
  });

  // Text sections
  const textSections = ins.sections.filter(s => s.type === "text" || s.type === "list");
  textSections.forEach(s => {
    const block = document.createElement("div");
    block.className = "ai-code-block";
    block.style.background = "rgba(255,255,255,0.02)";
    block.innerHTML = `<div class="ai-code-lbl">${escHtml(s.title || "")}</div>
      <p style="font-size:11px;color:#94a3b8;line-height:1.6;white-space:pre-wrap">${escHtml(s.content)}</p>`;
    card.appendChild(block);
  });

  // Suggestion
  if (ins.suggestions.length > 0) {
    const sug = document.createElement("div");
    sug.className = "ai-suggest";
    sug.innerHTML = `<span class="ai-suggest-arrow">→</span><span>${escHtml(ins.suggestions[0])}</span>`;
    card.appendChild(sug);
  }

  return card;
}

function makeCopyBtn(text) {
  const btn = document.createElement("button");
  btn.className   = "copy-btn";
  btn.textContent = "Copy";
  btn.addEventListener("click", e => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "✓";
      showToast("✓ Copied");
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    }).catch(() => {});
  });
  return btn;
}

function showToast(msg) {
  copyToast.textContent = msg;
  copyToast.classList.add("show");
  setTimeout(() => copyToast.classList.remove("show"), 1800);
}

// ── API helper ────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(apiUrl + path, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${method} ${path} → ${res.status}: ${txt}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pad(n) { return String(n).padStart(2, "0"); }

function emptyHint(icon, text) {
  return `<div class="empty-hint"><span>${icon}</span>${text}</div>`;
}

// ── Start ──────────────────────────────────────────────────────────────────────
init();
