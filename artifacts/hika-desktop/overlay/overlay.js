/* global window, document, navigator, MediaRecorder, FileReader, Blob */
// Hikanest Electron Overlay — overlay.js
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
let isTranscribing  = false;
let chunkTimer      = null;
let clickThrough    = false;
let selectedDeviceId = "";
let currentFontSize  = 12;        // px
let langFilter       = "all";
let uploadedDocs     = [];
let authToken       = null;
let authSession     = null;
let sessionGuidance = "";
let micStream       = null;
let systemStream    = null;
let mixedStream     = null;
let audioContext    = null;
let micAnalyser     = null;
let clientAnalyser  = null;
let meterFrame      = null;
let selectedHistoryInsight = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const startScreen    = $("start-screen");
const sessionScreen  = $("session-screen");
const meetingNameEl  = $("meeting-name");
const sessionGuidanceEl = $("session-guidance");
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
const meterMicFill   = $("meter-mic-fill");
const meterClientFill = $("meter-client-fill");
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
const wndMinBtn      = $("wnd-min-btn");
const wndCloseBtn    = $("wnd-close-btn");
const loginScreen    = $("login-screen");
const loginAuthBtn   = $("login-auth-btn");
const loginEmail     = $("login-email");
const loginPassword  = $("login-password");
const logoutBtn      = $("logout-btn");
const loginError     = $("login-error");
const loginStatus    = $("login-status");

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
  if (wndMinBtn) {
    wndMinBtn.addEventListener("click", () => window.hikaElectron?.hide());
  }
  if (wndCloseBtn) {
    wndCloseBtn.addEventListener("click", () => window.hikaElectron?.close());
  }
  askBtn.addEventListener("click", handleManualAsk);
  askInput.addEventListener("keydown", e => { if (e.key === "Enter") handleManualAsk(); });
  exportBtn.addEventListener("click", exportSession);
  langFilterSel.addEventListener("change", () => { langFilter = langFilterSel.value; renderInsights(); });
  const docUpload = $("doc-upload");
  const uploadedList = $("uploaded-list");
  if (docUpload) {
    docUpload.addEventListener("change", async (e) => {
      const files = docUpload.files;
      if (!files || files.length === 0) return;
      const toUpload = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const b = await f.arrayBuffer();
        const bytes = new Uint8Array(b);
        let binary = "";
        const chunkSize = 0x8000;
        for (let j = 0; j < bytes.length; j += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + chunkSize)));
        }
        const base64 = btoa(binary);
        toUpload.push({ name: f.name, contentBase64: base64 });
      }
      try {
        const res = await api('POST', '/api/documents', { files: toUpload });
        if (res && res.files) {
          res.files.forEach((f) => { uploadedDocs.unshift({ id: f.id, name: f.name }); });
          if (uploadedList) uploadedList.innerHTML = uploadedDocs.map(d=>d.name).join(', ');
        }
      } catch (err) { console.error('upload error', err); }
    });
  }

  if (loginAuthBtn) {
    loginAuthBtn.addEventListener("click", handleLogin);
  }
  if (loginPassword) {
    loginPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
  }
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      void clearAuthSession();
      void clearAuthToken();
      showLoginScreen();
    });
  }

  if (window.hikaElectron) {
    window.hikaElectron.onClickThroughChanged((enabled) => {
      clickThrough = enabled;
      updateClickThroughUI();
    });
  }

  await loadAuthSession();
  await loadAuthToken();

  // Toolbar controls
  opacitySlider.addEventListener("input", () => {
    shell.style.background = `rgba(7,7,15,${opacitySlider.value / 100})`;
  });
  fontDec.addEventListener("click", () => setFontSize(currentFontSize - 1));
  fontInc.addEventListener("click", () => setFontSize(currentFontSize + 1));
  clickthroughBtn.addEventListener("click", toggleClickThrough);
  updateClickThroughUI();

  if (!authSession) {
    showLoginScreen();
  } else {
    showStartScreen();
  }

  // Resize handle
  initResize();

  // Global hotkeys:
  // Ctrl+Shift+H = hide to tray
  // Ctrl+Shift+C = toggle click-through mode
  document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.shiftKey && e.key === "H") {
      e.preventDefault();
      window.hikaElectron?.hide();
    }

    if (e.ctrlKey && e.shiftKey && e.key === "C") {
      e.preventDefault();
      toggleClickThrough();
      showToast(`Click-through ${clickThrough ? "On" : "Off"}`);
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
function updateClickThroughUI() {
  clickthroughBtn.textContent = `🖱️ ${clickThrough ? "On" : "Off"}`;
  clickthroughBtn.classList.toggle("active", clickThrough);
}

function toggleClickThrough() {
  clickThrough = !clickThrough;
  if (window.hikaElectron) window.hikaElectron.setClickThrough(clickThrough);
  updateClickThroughUI();
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
  lines.push(`# Hikanest Session: ${title}`);
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
  a.download = `hikanest-${title.replace(/\s+/g, "-").toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("✓ Exported");
}

// ── Session ───────────────────────────────────────────────────────────────────
async function handleStart() {
  const title = meetingNameEl.value.trim() || "Meeting";
  sessionGuidance = (sessionGuidanceEl?.value || "").trim();
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
    const msg = err instanceof Error ? err.message : String(err || "");
    if (msg.includes(" 401:")) {
      showLoginScreen();
      setError("Your session expired. Please sign in again.");
      alert("Authentication required. Please sign in again.");
      return;
    }
    alert("Could not connect to Hikanest API.\n\nMake sure the API server is running at " + apiUrl);
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
    const stream = await buildRecordingStream();
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
      if (blob.size < 800) return;
      const text = await transcribeBlob(blob);
      if (text) {
        latestUtterance = text;
        addTranscriptChunk(text);
        if (text !== lastAnalyzedText && text.trim().length > 12) {
          lastAnalyzedText = text;
          analyze(text);
        }
      }
    };

    // ── Faster analysis cadence with less work ─────────────────────────────
    chunkTimer = setInterval(async () => {
      if (!mediaRecorder || mediaRecorder.state !== "recording" || isTranscribing) return;
      mediaRecorder.requestData();
      const snap = audioChunks.slice();
      if (!snap.length) return;
      const blob = new Blob(snap, { type: mimeType });
      if (blob.size < 1200) return;
      const text = await transcribeBlob(blob);
      if (!text) return;

      latestUtterance = text;
      liveTxText.textContent = text;
      liveTxEl.style.display = "block";

      const newChars = text.length - lastAnalyzedText.length;
      const looksComplete = /[.?!,;]\s*$/.test(text) || text.length > 60;
      if (!isAnalyzing && looksComplete && newChars > 25) {
        lastAnalyzedText = text;
        analyze(text);
      }
    }, 2500);

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
    alert("Microphone access denied. Please allow microphone access for Hikanest.");
    stopAudioPipeline();
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
  stopAudioPipeline();
}

function computeLevel(analyser) {
  if (!analyser) return 0;
  const arr = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(arr);
  let sum = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const v = (arr[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / arr.length);
  return Math.min(1, rms * 3.2);
}

function startMeters() {
  if (meterFrame) cancelAnimationFrame(meterFrame);
  const tick = () => {
    const micLevel = computeLevel(micAnalyser);
    const clientLevel = computeLevel(clientAnalyser);
    if (meterMicFill) meterMicFill.style.width = `${Math.max(2, Math.round(micLevel * 100))}%`;
    if (meterClientFill) meterClientFill.style.width = `${Math.max(2, Math.round(clientLevel * 100))}%`;
    meterFrame = requestAnimationFrame(tick);
  };
  meterFrame = requestAnimationFrame(tick);
}

function stopMeters() {
  if (meterFrame) cancelAnimationFrame(meterFrame);
  meterFrame = null;
  if (meterMicFill) meterMicFill.style.width = "0%";
  if (meterClientFill) meterClientFill.style.width = "0%";
}

async function getMicStream() {
  if (micStream) return micStream;
  const constraints = {
    audio: selectedDeviceId
      ? {
          deviceId: { exact: selectedDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        }
      : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
  };
  micStream = await navigator.mediaDevices.getUserMedia(constraints);
  return micStream;
}

async function getSystemAudioStream() {
  if (systemStream) return systemStream;
  if (!navigator.mediaDevices.getDisplayMedia) return null;
  try {
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const audioTrack = display.getAudioTracks()[0] || null;
    display.getVideoTracks().forEach(t => t.stop());
    if (!audioTrack) {
      display.getTracks().forEach(t => t.stop());
      return null;
    }
    systemStream = display;
    return systemStream;
  } catch {
    return null;
  }
}

async function buildRecordingStream() {
  const mic = await getMicStream();
  const micTrack = mic.getAudioTracks()[0];
  if (!micTrack) throw new Error("No microphone track");

  const sys = await getSystemAudioStream();
  const sysTrack = sys?.getAudioTracks?.()[0] || null;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  audioContext = new Ctx({ sampleRate: 48000 });
  const dest = audioContext.createMediaStreamDestination();

  const micSrc = audioContext.createMediaStreamSource(new MediaStream([micTrack]));
  const micGain = audioContext.createGain();
  micGain.gain.value = 1.1;
  micAnalyser = audioContext.createAnalyser();
  micAnalyser.fftSize = 1024;
  micSrc.connect(micGain);
  micGain.connect(dest);
  micGain.connect(micAnalyser);

  if (sysTrack) {
    const sysSrc = audioContext.createMediaStreamSource(new MediaStream([sysTrack]));
    const sysGain = audioContext.createGain();
    sysGain.gain.value = 1.3;
    clientAnalyser = audioContext.createAnalyser();
    clientAnalyser.fftSize = 1024;
    sysSrc.connect(sysGain);
    sysGain.connect(dest);
    sysGain.connect(clientAnalyser);
  } else {
    clientAnalyser = null;
  }

  mixedStream = dest.stream;
  startMeters();
  return mixedStream;
}

function stopAudioPipeline() {
  stopMeters();
  micAnalyser = null;
  clientAnalyser = null;

  if (mixedStream) {
    mixedStream.getTracks().forEach(t => t.stop());
    mixedStream = null;
  }
  if (systemStream) {
    systemStream.getTracks().forEach(t => t.stop());
    systemStream = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
}

// ── Transcription ─────────────────────────────────────────────────────────────
async function transcribeBlob(blob) {
  if (isTranscribing) return "";
  isTranscribing = true;

  const b64 = await blobToBase64(blob);
  const maxBytes = Math.min(1200000, Math.max(160000, blob.size));
  try {
    const res = await api("POST", "/api/openai/transcribe", {
      audioBase64: b64.slice(0, Math.floor(maxBytes / 1.35)),
      mimeType: blob.type,
    });
    return res.transcript || "";
  } catch (err) {
    console.error("Transcribe error", err);
    return "";
  } finally {
    isTranscribing = false;
  }
}

// ── AI Analysis ───────────────────────────────────────────────────────────────
async function analyze(utterance) {
  if (!utterance || isAnalyzing) return;
  isAnalyzing = true;
  setAnalyzing(true);

  let screenshotBase64 = null;
  if (window.hikaElectron && needsVisualContext(utterance)) {
    screenshotBase64 = await window.hikaElectron.captureScreen().catch(() => null);
  }

  const context = [
    `ANSWER THIS: "${utterance}"`,
    sessionGuidance ? `Session guidance: ${sessionGuidance}` : "",
    "Respond in 2-3 direct sentences and keep it concise.",
    `Timestamp: ${new Date().toISOString()}`,
  ].filter(Boolean).join("\n");

  try {
    let result = await api("POST", "/api/openai/analyze", {
      transcript: context,
      sessionId,
      screenshotBase64: screenshotBase64 || undefined,
      uploadedDocs: uploadedDocs.map(d => ({ id: d.id, name: d.name })),
    });
    if (!result) return;

    const previousTop = insights[0];
    const nextAnswer = normalizeComparableText(result.answer || "");
    const prevAnswer = normalizeComparableText(previousTop?.answer || "");
    const nextQuestion = normalizeComparableText(utterance || "");
    const prevQuestion = normalizeComparableText(previousTop?.question || "");

    // Skip the retry path in the desktop flow to keep latency low.

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
    selectedHistoryInsight = null;
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

  // Latest answer always shown to avoid stale-looking filtered state.
  const activeInsight = selectedHistoryInsight || insights[0];
  const card = buildInsightCard(activeInsight);
  aiScroll.appendChild(card);

  // History strip (language filter applies only to history list)
  const visibleHistory = insights.slice(1).filter((ins) => matchesLanguageFilter(ins));
  if (visibleHistory.length > 0) {
    historyStrip.style.display = "block";
    historyList.innerHTML = "";
    visibleHistory.forEach((ins, i) => {
      const div = document.createElement("div");
      div.className = "history-item";
      const t = ins.timestamp;
      div.innerHTML = `
        <span class="history-time">${pad(t.getHours())}:${pad(t.getMinutes())}</span>
        <span class="history-q">${escHtml(ins.question)}</span>
      `;
      div.addEventListener("click", () => {
        selectedHistoryInsight = ins;
        renderInsights();
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

  const rendered = renderAnswerBlocks(ins);
  card.appendChild(rendered);

  // Confidence badge
  const conf = document.createElement("div");
  conf.className = `confidence conf-${ins.confidence}`;
  conf.textContent = ins.confidence;
  card.appendChild(conf);


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

function normalizeLanguage(value) {
  const lang = String(value || "").toLowerCase();
  if (lang.includes("sql")) return "sql";
  if (lang.includes("py") || lang.includes("spark")) return "python";
  if (lang.includes("bash") || lang.includes("shell")) return "bash";
  if (lang.includes("hcl")) return "hcl";
  return lang || "text";
}

function normalizeComparableText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isCodeLike(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (t.includes("```")) return true;
  if (/^(select|with|insert|update|delete|create|alter|drop)\b/i.test(t)) return true;
  if (/^(import\s+\w+|from\s+\w+\s+import\s+\w+|def\s+\w+\s*\()/i.test(t)) return true;
  return /\n\s*(select|with|from|where|join|group by|order by|def\s|import\s)/i.test(t);
}

function collectCodeBlocks(ins) {
  const out = [];
  const sections = Array.isArray(ins.sections) ? ins.sections : [];
  sections.forEach((s) => {
    const type = String(s?.type || "").toLowerCase();
    const language = normalizeLanguage(s?.language || type);
    const content = String(s?.content || "").trim();
    if (!content) return;
    const isCode = ["code", "sql", "python", "pyspark", "bash", "hcl", "scala", "json"].includes(type)
      || ["sql", "python", "bash", "hcl", "scala", "json"].includes(language);
    if (isCode) {
      out.push({
        title: s?.title || (language === "sql" ? "SQL Query" : "Code"),
        language,
        content,
      });
    }
  });
  if (!out.length && isCodeLike(ins.answer)) {
    out.push({ title: "Code", language: "text", content: String(ins.answer || "").trim() });
  }
  return out;
}

function matchesLanguageFilter(ins) {
  if (langFilter === "all") return true;
  const blocks = collectCodeBlocks(ins);
  if (!blocks.length) return false;
  return blocks.some((b) => {
    const l = normalizeLanguage(b.language);
    if (langFilter === "pyspark") return l === "python" && /spark\./i.test(b.content);
    return l === langFilter;
  });
}

function renderAnswerBlocks(ins) {
  const wrap = document.createElement("div");
  const answer = String(ins.answer || "").trim();
  const blocks = collectCodeBlocks(ins);
  const textSections = (Array.isArray(ins.sections) ? ins.sections : [])
    .filter((s) => {
      const type = String(s?.type || "").toLowerCase();
      const content = String(s?.content || "").trim();
      return content && !["code", "sql", "python", "pyspark", "bash", "hcl", "scala", "json"].includes(type);
    });

  const isPureCode = blocks.length > 0 && answer === blocks[0].content;
  if (!isPureCode && answer) {
    const aWrap = document.createElement("div");
    aWrap.className = "ai-a-wrap";
    const aText = document.createElement("div");
    aText.className = "ai-a";
    aText.textContent = answer;
    const copyAnswerBtn = makeCopyBtn(answer);
    aWrap.appendChild(aText);
    aWrap.appendChild(copyAnswerBtn);
    wrap.appendChild(aWrap);
  }

  textSections.forEach((section) => {
    const block = document.createElement("div");
    block.className = "ai-code-block";
    block.innerHTML = `
      <div class="ai-code-lbl">${escHtml(section.title || "Details")}</div>
      <div class="ai-a">${escHtml(section.content || "")}</div>
    `;
    wrap.appendChild(block);
  });

  blocks.forEach((b) => {
    const block = document.createElement("div");
    block.className = "ai-code-block";
    block.innerHTML = `
      <div class="ai-code-lbl">${escHtml(b.title || "Code")}</div>
      <pre>${escHtml(b.content)}</pre>
    `;
    block.appendChild(makeCopyBtn(b.content));
    wrap.appendChild(block);
  });

  if (!answer && !blocks.length) {
    const empty = document.createElement("div");
    empty.className = "ai-a";
    empty.textContent = "No answer available.";
    wrap.appendChild(empty);
  }

  return wrap;
}

function showToast(msg) {
  copyToast.textContent = msg;
  copyToast.classList.add("show");
  setTimeout(() => copyToast.classList.remove("show"), 1800);
}

// ── API helper ────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: new Headers({ "Content-Type": "application/json" }) };
  const token = authToken;
  if (token) opts.headers.set("Authorization", `Bearer ${token}`);
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

function needsVisualContext(text) {
  return /(screen|screenshot|ui|page|window|dialog|button|error on screen|what do you see|visual|table shown|image|chart)/i.test(String(text || ""));
}

async function secureGet(key) {
  if (window.hikaElectron?.getSecureItem) return window.hikaElectron.getSecureItem(key);
  return localStorage.getItem(key);
}

async function secureSet(key, value) {
  if (window.hikaElectron?.setSecureItem) {
    await window.hikaElectron.setSecureItem(key, value);
    return;
  }
  localStorage.setItem(key, value);
}

async function secureDelete(key) {
  if (window.hikaElectron?.removeSecureItem) {
    await window.hikaElectron.removeSecureItem(key);
    return;
  }
  localStorage.removeItem(key);
}

async function loadAuthToken() {
  const token = await secureGet("hikaSessionToken");
  authToken = token || null;
  updateLoginStatus();
}

async function loadAuthSession() {
  try {
    const raw = await secureGet("hikaAuthSession");
    authSession = raw ? JSON.parse(raw) : null;
  } catch {
    authSession = null;
  }
  updateLoginStatus();
}

async function setAuthToken(token) {
  authToken = token;
  await secureSet("hikaSessionToken", token);
  updateLoginStatus();
}

async function setAuthSession(session) {
  authSession = session;
  await secureSet("hikaAuthSession", JSON.stringify(session));
  updateLoginStatus();
}

async function clearAuthToken() {
  authToken = null;
  await secureDelete("hikaSessionToken");
  updateLoginStatus();
}

async function clearAuthSession() {
  authSession = null;
  await secureDelete("hikaAuthSession");
  updateLoginStatus();
}

function setError(msg) {
  if (!loginError) return;
  loginError.textContent = msg || "";
  loginError.style.display = msg ? "block" : "none";
}

function setStatus(msg) {
  if (loginStatus) loginStatus.textContent = msg || "";
}

function isValidEmail(value) {
  return /.+@.+\..+/.test(String(value || "").trim());
}

function updateLoginStatus() {
  if (!loginStatus) return;

  const signedInText = authSession?.email
    ? `Signed in as ${authSession.email} (${authSession.provider || "password"})`
    : "Not signed in.";

  if (!loginStatus.textContent || loginStatus.textContent.startsWith("Signed in") || loginStatus.textContent.startsWith("Not signed")) {
    loginStatus.textContent = signedInText;
  }

  if (logoutBtn) {
    logoutBtn.style.display = authSession ? "block" : "none";
  }
}

function showLoginScreen() {
  if (loginScreen) loginScreen.style.display = "flex";
  if (startScreen) startScreen.style.display = "none";
  if (sessionScreen) sessionScreen.style.display = "none";
  updateLoginStatus();
}

function showStartScreen() {
  if (loginScreen) loginScreen.style.display = "none";
  if (sessionScreen) sessionScreen.style.display = "none";
  if (startScreen) startScreen.style.display = "flex";
  updateLoginStatus();
}

async function handleLogin() {
  const email = (loginEmail?.value || "").trim();
  const password = loginPassword?.value || "";

  if (!isValidEmail(email)) {
    setError("Please enter a valid email address.");
    return;
  }
  if (!password) {
    setError("Please enter your password.");
    return;
  }

  try {
    const result = await api("POST", "/api/auth/login", { email, password });
    if (!result?.token || !result?.session) {
      setError("Authentication failed.");
      return;
    }

    await setAuthToken(result.token);
    await setAuthSession(result.session);
    setError("");
    setStatus(`Signed in as ${result.session.email}.`);
    showStartScreen();
  } catch (err) {
    setError(err instanceof Error ? err.message.replace(/^POST .*?: /, "") : "Authentication failed.");
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────
init();

window.addEventListener("beforeunload", () => {
  stopAudioPipeline();
});
