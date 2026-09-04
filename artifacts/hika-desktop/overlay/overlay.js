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
let realtimePeer    = null;
let realtimeEvents  = null;
let realtimeAnswer  = "";
let realtimeResponseId = null;
const cancelledRealtimeResponseIds = new Set();
let realtimeConnecting = false;
let realtimeClosedByUser = false;
let realtimeStream = null;
let realtimeReconnectTimer = null;
let realtimeReconnectAttempts = 0;
let realtimePartialTranscript = "";
let realtimeTranscriptFinalized = false;
let realtimeStopRequested = false;
let realtimeResponseRequested = false;
let forceHttpFallback = false;
const useRealtimeVoice = true;
const realtimeMetrics = {};
let realtimeDiagnostics = false;
let selectedSessionMode = "interview";
let selectedModel = "gpt-4.1";
let autoAnswerEnabled = true;
let saveTranscriptEnabled = true;
let screenBeforeMinimize = "start";
let availableUpdateUrl = "";

function markRealtimeMetric(name) {
  const now = performance.now();
  realtimeMetrics[name] = now;
  if (name === "first_answer_delta" && realtimeMetrics.speech_stopped) {
    realtimeMetrics.speech_end_to_first_answer_ms = Math.round(now - realtimeMetrics.speech_stopped);
  }
  // Electron DevTools is opt-in; this is intentionally diagnostic-only and
  // never includes credentials or transcript content.
  if (realtimeDiagnostics) {
    console.debug("[hikanest:realtime]", name, realtimeMetrics.speech_end_to_first_answer_ms
      ? { speech_end_to_first_answer_ms: realtimeMetrics.speech_end_to_first_answer_ms }
      : "");
  }
}

function appendRealtimeDelta(current, delta) {
  if (!delta || current.endsWith(delta)) return current;
  return delta.startsWith(current) ? delta : current + delta;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const startScreen    = $("start-screen");
const setupScreen    = $("setup-screen");
const sessionScreen  = $("session-screen");
const meetingNameEl  = $("meeting-name");
const setupMeetingNameEl = $("setup-meeting-name");
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
const splashScreen   = $("splash-screen");
const googleSigninScreen = $("google-signin-screen");
const continueGoogleBtn = $("continue-google-btn");
const minimizedLauncher = $("minimized-launcher");
const jobPostUrl      = $("job-post-url");
const modelSelect     = $("model-select");
const outputLanguage  = $("output-language");
const autoAnswer      = $("auto-answer");
const saveTranscript  = $("save-transcript");
const setupUploadedList = $("setup-uploaded-list");
const accountMenuBtn = $("account-menu-btn");
const accountMenuWrap = accountMenuBtn?.closest(".account-menu-wrap");
const accountMenu = $("account-menu");
const accountMenuEmail = $("account-menu-email");
const checkUpdateBtn = $("check-update-btn");
const downloadUpdateBtn = $("download-update-btn");
const updateStatus = $("update-status");
const privateOverlay = $("private-overlay");

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  if (window.hikaElectron) {
    apiUrl = await window.hikaElectron.getApiUrl();
    realtimeDiagnostics = await window.hikaElectron.isDevelopment();
    window.hikaElectron.pin();

    // Listen for meeting auto-detection from main process
    window.hikaElectron.onMeetingDetected(name => {
      meetingBadge.textContent = `● ${name}`;
      meetingBadge.style.display = "inline-block";
    });
    window.hikaElectron.onDesktopAuthCode((code) => { void completeDesktopHandoff(code); });
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
  $("setup-start-btn")?.addEventListener("click", handleStart);
  $("setup-btn")?.addEventListener("click", showSetupScreen);
  $("setup-back-btn")?.addEventListener("click", showStartScreen);
  continueGoogleBtn?.addEventListener("click", () => openWebHandoff());
  meetingNameEl.addEventListener("keydown", e => { if (e.key === "Enter") handleStart(); });
  document.querySelectorAll(".mode-choice").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSessionMode = button.dataset.mode || "interview";
      document.querySelectorAll(".mode-choice").forEach((item) => item.classList.toggle("active", item === button));
    });
  });
  if (modelSelect) modelSelect.addEventListener("change", () => { selectedModel = modelSelect.value; });
  if (autoAnswer) autoAnswer.addEventListener("change", () => { autoAnswerEnabled = autoAnswer.checked; });
  if (saveTranscript) saveTranscript.addEventListener("change", () => { saveTranscriptEnabled = saveTranscript.checked; });
  micBtn.addEventListener("click", toggleRecording);
  endBtn.addEventListener("click", handleEnd);
  endHdrBtn.addEventListener("click", handleEnd);
  hideBtn.addEventListener("click", minimizeToLauncher);
  if (wndMinBtn) {
    wndMinBtn.addEventListener("click", minimizeToLauncher);
  }
  minimizedLauncher?.addEventListener("click", restoreFromLauncher);
  accountMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    accountMenu.hidden = !accountMenu.hidden;
  });
  checkUpdateBtn?.addEventListener("click", checkForUpdates);
  downloadUpdateBtn?.addEventListener("click", () => {
    if (availableUpdateUrl) window.hikaElectron?.openExternal(availableUpdateUrl);
    closeAccountMenu();
  });
  $("open-dashboard-btn")?.addEventListener("click", () => {
    closeAccountMenu();
    showToast("Dashboard URL is configured on the web app.");
  });
  $("menu-logout-btn")?.addEventListener("click", async () => {
    closeAccountMenu();
    await clearAuthSession();
    await clearAuthToken();
    showSetupScreen();
  });
  privateOverlay?.addEventListener("change", () => {
    if (!privateOverlay.checked) showToast("Screen-share protection remains enabled for safety.");
    privateOverlay.checked = true;
  });
  if (wndCloseBtn) {
    wndCloseBtn.addEventListener("click", () => window.hikaElectron?.close());
  }
  document.addEventListener("click", (event) => {
    if (!accountMenu.hidden && !accountMenuWrap?.contains(event.target)) closeAccountMenu();
  });
  askBtn.addEventListener("click", handleManualAsk);
  askInput.addEventListener("keydown", e => { if (e.key === "Enter") handleManualAsk(); });
  exportBtn.addEventListener("click", exportSession);
  langFilterSel.addEventListener("change", () => { langFilter = langFilterSel.value; renderInsights(); });
  const docUpload = $("doc-upload");
  const uploadedList = $("uploaded-list");
  if (docUpload) {
    docUpload.addEventListener("change", async (e) => {
      await uploadDocuments(docUpload.files, uploadedList);
    });
  }
  [$("resume-upload"), $("setup-doc-upload")].filter(Boolean).forEach((input) => {
    input.addEventListener("change", async () => uploadDocuments(input.files, setupUploadedList));
  });

  // Electron minimizes/restores the renderer without recreating it. Recover a
  // dead peer after focus, wake, or a network switch without opening duplicates.
  const recoverRealtime = () => {
    if (isRecording && realtimeStream && realtimePeer?.connectionState !== "connected" && !realtimeConnecting) {
      void startRealtimeVoice(realtimeStream, true);
    }
  };
  window.addEventListener("online", recoverRealtime);
  window.addEventListener("focus", recoverRealtime);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") recoverRealtime();
  });

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

  setTimeout(() => {
    splashScreen?.classList.add("hidden");
    if (authSession) showSetupScreen();
    else showGoogleSigninScreen();
  }, 3000);

  // Resize handle
  initResize();

  // Global hotkeys:
  // Ctrl+Shift+H = hide to tray
  // Ctrl+Shift+C = toggle click-through mode
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !accountMenu.hidden) {
      e.preventDefault();
      closeAccountMenu();
      return;
    }

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

function closeAccountMenu() {
  if (accountMenu) accountMenu.hidden = true;
}

async function uploadDocuments(files, listElement) {
  if (!files || files.length === 0) return;
  const toUpload = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    toUpload.push({ name: file.name, contentBase64: btoa(binary) });
  }
  try {
    const response = await api("POST", "/api/documents", { files: toUpload });
    for (const file of response?.files || []) uploadedDocs.unshift({ id: file.id, name: file.name });
    if (listElement) listElement.textContent = uploadedDocs.length ? `${uploadedDocs.length} document${uploadedDocs.length === 1 ? "" : "s"} added` : "No documents added";
  } catch (error) {
    console.error("upload error", error);
    if (listElement) listElement.textContent = "Upload failed";
  }
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

function minimizeToLauncher() {
  screenBeforeMinimize = sessionScreen.style.display !== "none" ? "session" : googleSigninScreen.style.display !== "none" ? "google" : setupScreen.style.display !== "none" ? "setup" : "start";
  shell.classList.add("launcher-mode");
  window.hikaElectron?.setSize(64, 64);
}

function restoreFromLauncher() {
  shell.classList.remove("launcher-mode");
  window.hikaElectron?.setSize(620, 680);
  if (screenBeforeMinimize === "session") {
    sessionScreen.style.display = "flex";
  } else if (screenBeforeMinimize === "google") {
    showGoogleSigninScreen();
  } else {
    showSetupScreen();
  }
}

function openWebHandoff() {
  window.hikaElectron?.openExternal("https://hikanest-web-beta.onrender.com/login?next=%2Fdesktop-connect");
}

function compareVersions(left, right) {
  const leftParts = String(left).replace(/^v/, "").split(".").map(Number);
  const rightParts = String(right).replace(/^v/, "").split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

async function checkForUpdates() {
  if (!updateStatus) return;
  updateStatus.textContent = "Checking...";
  downloadUpdateBtn.hidden = true;
  availableUpdateUrl = "";
  try {
    const currentVersion = await window.hikaElectron?.getAppVersion?.() || "0.0.0";
    const response = await fetch(`${apiUrl}/api/desktop/update`);
    if (!response.ok) throw new Error("Update service unavailable");
    const release = await response.json();
    if (release?.downloadUrl && /^https:\/\//i.test(release.downloadUrl) && compareVersions(release.version, currentVersion) > 0) {
      availableUpdateUrl = release.downloadUrl;
      updateStatus.textContent = `Version ${release.version} is ready.`;
      downloadUpdateBtn.hidden = false;
    } else {
      updateStatus.textContent = "You are up to date.";
    }
  } catch {
    updateStatus.textContent = "Could not check for updates.";
  }
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
  const title = (setupScreen.style.display !== "none" ? setupMeetingNameEl?.value : meetingNameEl.value).trim() || "Meeting";
  const startControl = setupScreen.style.display !== "none" ? $("setup-start-btn") : startBtn;
  const jobContext = (jobPostUrl?.value || "").trim();
  const languageContext = outputLanguage?.value ? `Respond in ${outputLanguage.value}.` : "";
  sessionGuidance = [
    selectedSessionMode === "interview" ? "This is an interview. Answer as a confident, experienced candidate." : "This is a regular professional call.",
    jobContext ? `Job post URL supplied by the user: ${jobContext}` : "",
    languageContext,
    (sessionGuidanceEl?.value || "").trim(),
  ].filter(Boolean).join("\n");
  forceHttpFallback = false;
  cancelledRealtimeResponseIds.clear();
  startControl.disabled = true;
  startControl.textContent = "Starting...";

  try {
    const res = await api("POST", "/api/sessions", { title, platform: "teams", status: "active" });
    sessionId    = res.id;
    sessionStart = Date.now();

    hdrTitle.textContent            = title;
    startScreen.style.display       = "none";
    setupScreen.style.display       = "none";
    sessionScreen.style.display     = "flex";
    sessionScreen.style.flexDirection = "column";
    sessionScreen.style.height      = "100%";

    startTimer();
  } catch (err) {
    startControl.disabled = false;
    startControl.textContent = setupScreen.style.display !== "none" ? "Start session" : "Start Session";
    const msg = err instanceof Error ? err.message : String(err || "");
    if (msg.includes(" 401:")) {
      openWebHandoff();
      alert("Opening web sign-in. After you sign in, Hikanest will return to this session setup page.");
      return;
    }
    alert(`Could not connect to Hikanest API.\n\nAPI URL: ${apiUrl}\n\n${msg || "Check your internet connection and the hosted API service."}`);
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
  showSetupScreen();
  meetingNameEl.value  = "";
  if (setupMeetingNameEl) setupMeetingNameEl.value = "";
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
    statusDot.textContent = "● Connecting microphone";
    const stream = await buildRecordingStream();
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== "live") throw new Error("No active microphone track was found.");
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    audioChunks   = [];
    let lastAnalyzedText = "";

    // A persistent WebRTC connection avoids serializing and re-uploading an
    // ever-growing WebM blob every few seconds. If Realtime is unavailable,
    // retain the existing recorder/transcription workflow as a safe fallback.
    if (useRealtimeVoice && !forceHttpFallback && await startRealtimeVoice(stream)) {
      isRecording = true;
      micBtn.classList.add("recording");
      micBtn.textContent = "⏹";
      micBtn.title = "Stop recording";
      recIndicator.style.display = "inline";
      statusDot.textContent = "● REC";
      statusDot.className = "status-dot rec";
      liveTxEl.style.display = "flex";
      liveTxText.textContent = "";
      return;
    }

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
        liveTxText.textContent = text;
        liveTxEl.style.display = "flex";
        if (autoAnswerEnabled && text.trim().length > 12) {
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
      liveTxEl.style.display = "flex";

    }, 2500);

    mediaRecorder.start();
    isRecording = true;
    micBtn.classList.add("recording");
    micBtn.textContent        = "⏹";
    micBtn.title              = "Stop recording";
    recIndicator.style.display = "inline";
    statusDot.textContent      = "● REC";
    statusDot.className        = "status-dot rec";
    liveTxEl.style.display     = "flex";
    liveTxText.textContent     = "";

  } catch (err) {
    const message = err instanceof Error ? err.message : "Microphone access failed.";
    alert(`Microphone could not start.\n\n${message}\n\nAllow microphone access for Hikanest in Windows Settings, then select the correct microphone.`);
    statusDot.textContent = "● Mic unavailable";
    statusDot.className = "status-dot";
    stopAudioPipeline();
    console.error(err);
  }
}

async function stopRecording() {
  if (!isRecording) return;
  clearInterval(chunkTimer);
  isRecording = false;
  micBtn.classList.remove("recording");
  micBtn.textContent         = "🎤";
  micBtn.title               = "Record";
  recIndicator.style.display = "none";
  statusDot.textContent      = "● Live";
  statusDot.className        = "status-dot";

  if (realtimePeer?.connectionState === "connected" && realtimeEvents?.readyState === "open") {
    statusDot.textContent = "● Preparing answer";
    realtimeStopRequested = true;
    realtimeResponseRequested = false;
    mediaRecorder?.stream.getTracks().forEach(t => t.stop());
    stopAudioPipeline();
    if (realtimeEvents?.readyState === "open") {
      realtimeEvents.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      if (realtimeTranscriptFinalized && latestUtterance.trim()) {
        realtimeResponseRequested = true;
        realtimeEvents.send(JSON.stringify({ type: "response.create" }));
      }
    }
    return;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  mediaRecorder = null;
  stopAudioPipeline();
}

function stopRealtimeVoice(closedByUser = true) {
  realtimeClosedByUser = closedByUser;
  if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer = null;
  if (realtimeEvents) realtimeEvents.close();
  realtimeEvents = null;
  if (realtimePeer) realtimePeer.close();
  realtimePeer = null;
  realtimeAnswer = "";
  realtimeResponseId = null;
  realtimePartialTranscript = "";
  realtimeTranscriptFinalized = false;
  realtimeStopRequested = false;
  realtimeResponseRequested = false;
}

async function startRealtimeVoice(stream, reconnect = false) {
  if (!window.RTCPeerConnection || realtimeConnecting) return false;
  if (realtimePeer?.connectionState === "connected") return true;
  if (!stream?.getAudioTracks?.().length) return false;
  if (reconnect && realtimePeer) stopRealtimeVoice(false);

  realtimeConnecting = true;
  markRealtimeMetric(reconnect ? "reconnect_started" : "connection_started");
  realtimeClosedByUser = false;
  realtimeStream = stream;
  const peer = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
  const events = peer.createDataChannel("oai-events");
  realtimePeer = peer;
  realtimeEvents = events;
  realtimeAnswer = "";
  realtimeStopRequested = false;
  realtimeResponseRequested = false;
  realtimeTranscriptFinalized = false;

  const showRealtimeAnswer = (answer, complete = false) => {
    const text = (answer || "").trim();
    if (!text) return;
    const insight = {
      question: latestUtterance || "Live question",
      answer: text,
      confidence: complete ? "high" : "medium",
      suggestions: [], sections: [], timestamp: new Date(),
    };
    insights[0] = insight;
    setAnalyzing(!complete);
    renderInsights();
  };

  events.addEventListener("message", (event) => {
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }
    if (payload.type === "input_audio_buffer.speech_started") {
      markRealtimeMetric("speech_started");
      if (realtimeResponseId) cancelledRealtimeResponseIds.add(realtimeResponseId);
      if (cancelledRealtimeResponseIds.size > 64) cancelledRealtimeResponseIds.clear();
      if (realtimeResponseId && events.readyState === "open") events.send(JSON.stringify({ type: "response.cancel", response_id: realtimeResponseId }));
      realtimeResponseId = null;
      realtimeAnswer = "";
      setAnalyzing(false);
      statusDot.textContent = "● Speech detected";
    } else if (payload.type === "input_audio_buffer.speech_stopped") {
      markRealtimeMetric("speech_stopped");
      statusDot.textContent = "● Understanding";
    } else if (payload.type === "conversation.item.input_audio_transcription.delta") {
      if (payload.delta) markRealtimeMetric("first_transcript_delta");
      realtimePartialTranscript += payload.delta || "";
      realtimeTranscriptFinalized = false;
      liveTxText.textContent = realtimePartialTranscript;
    } else if (payload.type === "conversation.item.input_audio_transcription.completed") {
      const text = (payload.transcript || realtimePartialTranscript || "").trim();
      if (text) {
        latestUtterance = text;
        addTranscriptChunk(text);
        liveTxText.textContent = text;
        if (realtimeStopRequested && !realtimeResponseRequested) {
          realtimeResponseRequested = true;
          if (events.readyState === "open") events.send(JSON.stringify({ type: "response.create" }));
        }
      }
      realtimePartialTranscript = text;
      realtimeTranscriptFinalized = Boolean(text);
      markRealtimeMetric("transcript_completed");
    } else if (payload.type === "response.created") {
      markRealtimeMetric("response_created");
      realtimeResponseId = payload.response?.id || payload.response_id || null;
      realtimeAnswer = "";
      setAnalyzing(true);
    } else if (payload.type === "response.output_text.delta") {
      if (payload.response_id && cancelledRealtimeResponseIds.has(payload.response_id)) return;
      if (!realtimeAnswer) markRealtimeMetric("first_answer_delta");
      if (realtimeResponseId && payload.response_id && payload.response_id !== realtimeResponseId) return;
      realtimeAnswer = appendRealtimeDelta(realtimeAnswer, payload.delta || "");
      showRealtimeAnswer(realtimeAnswer);
    } else if (payload.type === "response.output_text.done") {
      if (payload.response_id && cancelledRealtimeResponseIds.has(payload.response_id)) return;
      realtimeAnswer = payload.text || realtimeAnswer;
      showRealtimeAnswer(realtimeAnswer, true);
    } else if (payload.type === "response.done") {
      if (payload.response?.id && cancelledRealtimeResponseIds.has(payload.response.id)) return;
      if (realtimeResponseId && payload.response?.id && payload.response.id !== realtimeResponseId) return;
      const text = (payload.response?.output || [])
        .flatMap(item => item.content || [])
        .map(content => content.text || "").join("") || realtimeAnswer;
      showRealtimeAnswer(text, true);
      realtimeResponseId = null;
      markRealtimeMetric("response_completed");
      statusDot.textContent = isRecording ? "● REC" : "● Live";
      if (realtimeStopRequested || !isRecording) stopRealtimeVoice();
    }
  });

  const scheduleReconnect = () => {
    if (realtimeClosedByUser || realtimePeer !== peer || realtimeReconnectTimer) return;
    const attempt = ++realtimeReconnectAttempts;
    if (attempt > 3) {
      forceHttpFallback = true;
      stopRealtimeVoice(false);
      statusDot.textContent = "● Fallback mode";
      // Recreate the recorder only after the peer and tracks are closed, so
      // a microphone is never streamed and uploaded at the same time.
      isRecording = false;
      stopAudioPipeline();
      setTimeout(() => { void startRecording(); }, 0);
      return;
    }
    statusDot.textContent = "● Reconnecting";
    markRealtimeMetric("reconnect_scheduled");
    realtimeReconnectTimer = setTimeout(() => {
      realtimeReconnectTimer = null;
      if (!realtimeClosedByUser && realtimeStream) void startRealtimeVoice(realtimeStream, true);
    }, Math.min(8000, 500 * 2 ** (attempt - 1)));
  };
  peer.addEventListener("connectionstatechange", () => {
    if (realtimePeer !== peer) return;
    if (peer.connectionState === "connected") {
      realtimeReconnectAttempts = 0;
      statusDot.textContent = "● Listening live";
      markRealtimeMetric(reconnect ? "reconnect_completed" : "connection_completed");
    } else if (peer.connectionState === "failed" || peer.connectionState === "disconnected") scheduleReconnect();
  });
  events.addEventListener("close", scheduleReconnect);
  events.addEventListener("error", scheduleReconnect);

  try {
    stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const authorization = await fetch(apiUrl + "/api/openai/realtime/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ sessionGuidance, mode: selectedSessionMode === "call" ? "meeting" : "interview", uploadedDocs }),
    });
    if (!authorization.ok) throw new Error(`Realtime authorization failed (${authorization.status})`);
    const { clientSecret } = await authorization.json();
    if (typeof clientSecret !== "string" || !clientSecret.startsWith("ek_")) throw new Error("Invalid realtime authorization response");
    const form = new FormData();
    form.set("sdp", new Blob([offer.sdp || ""], { type: "application/sdp" }), "offer.sdp");
    const res = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST", headers: { Authorization: `Bearer ${clientSecret}` }, body: form,
    });
    if (!res.ok) throw new Error(`Realtime setup failed (${res.status})`);
    await peer.setRemoteDescription({ type: "answer", sdp: await res.text() });
    return true;
  } catch (error) {
    console.warn("Realtime voice unavailable; using recording fallback.", error);
    peer.close();
    if (realtimePeer === peer) {
      realtimePeer = null;
      realtimeEvents = null;
    }
    return false;
  } finally {
    realtimeConnecting = false;
  }
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

  const sysTrack = null;

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

  const codeRequest = /\b(code|pyspark|spark|python|sql|query|script|databricks)\b/i.test(utterance);
  const context = [
    `ANSWER THIS: "${utterance}"`,
    sessionGuidance ? `Session guidance: ${sessionGuidance}` : "",
    codeRequest
      ? "Return complete executable code first. Do not use interview-answer headings, resume matches, tips, or prose templates. Include only a brief explanation after the code when necessary."
      : "Give a detailed, natural answer the candidate can say aloud. Speak in confident first person only when supported by the uploaded resume or context. Include concrete responsibilities, technical decisions, impact, and one relevant example. Never invent experience.",
    `Timestamp: ${new Date().toISOString()}`,
  ].filter(Boolean).join("\n");

  try {
    let result = await api("POST", "/api/openai/analyze", {
      transcript: context,
      sessionId,
      screenshotBase64: screenshotBase64 || undefined,
      uploadedDocs: uploadedDocs.map(d => ({ id: d.id, name: d.name })),
      model: selectedModel,
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

    insights = [insight];
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

  if (ins.question && ins.question !== "Live question") {
    const question = document.createElement("div");
    question.className = "ai-q";
    question.textContent = ins.question;
    card.appendChild(question);
  }

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

function updateLoginStatus() {
  if (accountMenuEmail) accountMenuEmail.textContent = authSession?.email || "Not signed in";
}

function showStartScreen() {
  if (googleSigninScreen) googleSigninScreen.style.display = "none";
  if (setupScreen) setupScreen.style.display = "none";
  if (sessionScreen) sessionScreen.style.display = "none";
  if (startScreen) startScreen.style.display = "flex";
  updateLoginStatus();
}

function showSetupScreen() {
  if (googleSigninScreen) googleSigninScreen.style.display = "none";
  if (startScreen) startScreen.style.display = "none";
  if (sessionScreen) sessionScreen.style.display = "none";
  if (setupScreen) setupScreen.style.display = "block";
}

function showGoogleSigninScreen() {
  if (startScreen) startScreen.style.display = "none";
  if (setupScreen) setupScreen.style.display = "none";
  if (sessionScreen) sessionScreen.style.display = "none";
  if (googleSigninScreen) googleSigninScreen.style.display = "flex";
}

async function completeDesktopHandoff(code) {
  try {
    const result = await api("POST", "/api/auth/desktop/exchange", { code });
    if (!result?.token || !result?.session) throw new Error("Desktop sign-in could not be completed.");
    await setAuthToken(result.token);
    await setAuthSession(result.session);
    showSetupScreen();
  } catch (error) {
    showSetupScreen();
    alert(error instanceof Error ? error.message : "Desktop sign-in could not be completed.");
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────
init();

window.addEventListener("beforeunload", () => {
  stopAudioPipeline();
});
