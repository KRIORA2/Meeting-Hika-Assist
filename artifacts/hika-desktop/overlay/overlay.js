/* global window, document, navigator, MediaRecorder, FileReader, Blob */
// Hikanest Electron Overlay — overlay.js
// Full Parakeet-parity feature set

"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
let apiUrl          = "http://localhost:5000";
let webAppUrl       = "https://hikanest-web-beta.onrender.com";
let sessionId       = null;
let sessionStart    = null;
let timerHandle     = null;
let isRecording     = false;
let mediaRecorder   = null;
let audioChunks     = [];
let mimeType        = "audio/webm;codecs=opus";
let latestUtterance = "";
let micTranscriptText = "";
let transcriptReadyForAsk = false;
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
let meterSource     = null;
let meterCaptureStream = null;
let silentListenFrames = 0;
let warnedSilentMic = false;
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
let pendingAnalyzeOnStop = false;
let answerOnStopLock = false;
let listenFinalizeTimer = null;
let forceHttpFallback = false;
const useRealtimeVoice = true;
const realtimeMetrics = {};
let realtimeDiagnostics = false;
let selectedSessionMode = "interview";
let selectedModel = "gpt-4.1";
let autoAnswerEnabled = true;
let saveTranscriptEnabled = true;
let remainingCredits = null;
let screenBeforeMinimize = "start";
let availableUpdateUrl = "";
let latestUpdateState = null;

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
const creditsBadge   = $("credits-badge");
const setupCredits   = $("setup-credits");
const startCredits   = $("start-credits");
const meetingBadge   = $("meeting-badge");
const recIndicator   = $("rec-indicator");
const txScroll       = $("tx-scroll");
const liveTxEl       = $("live-tx");
const liveTxText     = $("live-tx-text");
const liveTxLabel    = $("live-tx-label");
const aiScroll       = $("ai-scroll");
const historyStrip   = $("history-strip");
const historyList    = $("history-list");
const micBtn         = $("mic-btn");
const micLabel       = $("mic-label");
const micHint        = $("mic-hint");
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
const continueEmailBtn = $("continue-email-btn");
const desktopSigninStatus = $("desktop-signin-status");
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
const installUpdateBtn = $("install-update-btn");
const updateStatus = $("update-status");
const updateNotification = $("update-notification");
const updateNotificationTitle = $("update-notification-title");
const updateNotificationMessage = $("update-notification-message");
const updateProgressWrap = $("update-progress-wrap");
const updateProgressFill = $("update-progress-fill");
const updateProgressLabel = $("update-progress-label");
const updateLaterBtn = $("update-later-btn");
const updateNowBtn = $("update-now-btn");

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  if (window.hikaElectron) {
    apiUrl = await window.hikaElectron.getApiUrl();
    webAppUrl = await window.hikaElectron.getWebAppUrl();
    realtimeDiagnostics = await window.hikaElectron.isDevelopment();
    window.hikaElectron.pin();
    const installedVersion = await window.hikaElectron.getAppVersion();
    if (updateStatus && !latestUpdateState) {
      updateStatus.textContent = `HikaNest ${installedVersion}. Check GitHub Releases for updates.`;
    }

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
  micSource.addEventListener("change", () => {
    selectedDeviceId = micSource.value;
    persistMicDevice(selectedDeviceId);
    if (isRecording) showToast("Stop, then Listen again to use that microphone.");
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", () => {
    if (!isRecording) void loadMicSources();
  });

  // Event listeners
  startBtn.addEventListener("click", handleStart);
  $("setup-start-btn")?.addEventListener("click", handleStart);
  $("setup-btn")?.addEventListener("click", showSetupScreen);
  $("setup-back-btn")?.addEventListener("click", showStartScreen);
  continueGoogleBtn?.addEventListener("click", () => { void openWebHandoff("google"); });
  continueEmailBtn?.addEventListener("click", () => { void openWebHandoff(); });
  meetingNameEl.addEventListener("keydown", e => { if (e.key === "Enter") handleStart(); });
  setupMeetingNameEl?.addEventListener("keydown", e => {
    if (e.key === "Enter") void handleStart();
  });
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
    const opening = accountMenu.hidden;
    accountMenu.hidden = !accountMenu.hidden;
    if (opening && !accountMenu.hidden) void checkForUpdates();
  });
  checkUpdateBtn?.addEventListener("click", () => { void checkForUpdates(); });
  downloadUpdateBtn?.addEventListener("click", () => { void startUpdateDownload(); });
  installUpdateBtn?.addEventListener("click", () => { void installDownloadedUpdate(); });
  $("open-dashboard-btn")?.addEventListener("click", () => {
    closeAccountMenu();
    void window.hikaElectron?.openExternal(`${webAppUrl}/dashboard`);
  });
  $("menu-logout-btn")?.addEventListener("click", async () => {
    closeAccountMenu();
    try {
      await api("POST", "/api/auth/logout");
    } catch (err) {
      console.warn("Server logout failed; clearing local session", err);
    }
    await clearAuthSession();
    await clearAuthToken();
    showGoogleSigninScreen();
  });
  updateLaterBtn?.addEventListener("click", () => {
    updateNotification.hidden = true;
  });
  updateNowBtn?.addEventListener("click", () => { void handleUpdateAction(); });
  window.hikaElectron?.onUpdateState(renderUpdateState);
  if (wndCloseBtn) {
    wndCloseBtn.addEventListener("click", () => window.hikaElectron?.close());
  }
  document.addEventListener("click", (event) => {
    if (!accountMenu.hidden && !accountMenuWrap?.contains(event.target)) closeAccountMenu();
  });
  askBtn.addEventListener("click", handleManualAsk);
  liveTxText.addEventListener("input", () => {
    micTranscriptText = liveTxText.value.trim();
    transcriptReadyForAsk = Boolean(micTranscriptText);
  });
  askInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void handleManualAsk();
    }
  });
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
  void refreshCredits();

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

    if (e.ctrlKey && e.code === "Space" && sessionScreen.style.display !== "none") {
      e.preventDefault();
      void toggleRecording();
    }
  });
}

function closeAccountMenu() {
  if (accountMenu) accountMenu.hidden = true;
}

function setTranscriptDraft(value, { syncAsk = false } = {}) {
  liveTxText.value = value;
  if (syncAsk) askInput.value = value;
}

function setCredits(value) {
  remainingCredits = typeof value === "number" ? value : remainingCredits;
  const label = remainingCredits == null ? "— credits" : `${remainingCredits} credits`;
  [creditsBadge, setupCredits, startCredits].forEach((el) => {
    if (!el) return;
    el.textContent = label;
    el.classList.toggle("low", remainingCredits != null && remainingCredits < 10);
  });
}

async function refreshCredits() {
  if (!authToken) return;
  try {
    const me = await api("GET", "/api/me");
    if (typeof me?.credits === "number") setCredits(me.credits);
  } catch {
    // Credits are informational; the next AI call will report 402 if empty.
  }
}

function currentTranscript() {
  return (liveTxText.value || micTranscriptText || latestUtterance || "").replace(/\s+/g, " ").trim();
}

function setLiveBadge(text, kind = "") {
  liveTxLabel.textContent = text;
  liveTxLabel.className = kind ? `live-badge ${kind}` : "live-badge";
}

function setListeningUI(listening) {
  micBtn.classList.toggle("recording", listening);
  micBtn.textContent = listening ? "⏹" : "🎤";
  micBtn.title = listening ? "Stop and answer" : "Start listening";
  askInput.classList.toggle("recording", listening);
  if (micLabel) micLabel.textContent = listening ? "Stop" : "Listen";
  if (micHint) micHint.textContent = listening ? "Release to answer" : "Capture audio";
  if (recIndicator) recIndicator.hidden = !listening;
  liveTxEl.classList.toggle("listening", listening);
  if (listening) setLiveBadge("● LIVE", "live");
}

function resetSessionStage() {
  liveTxText.value = "";
  askInput.value = "";
  setListeningUI(false);
  setLiveBadge("Ready");
  liveTxEl.style.display = "flex";
  txScroll.innerHTML = "";
  aiScroll.innerHTML = emptyHint("✦", "Press Listen, then Stop — the answer appears here");
  historyStrip.style.display = "none";
  historyList.innerHTML = "";
  statusDot.textContent = "● Ready";
  statusDot.className = "status-dot";
}

async function waitForTranscriptionIdle(ms = 4000) {
  const started = Date.now();
  while (isTranscribing && Date.now() - started < ms) {
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
}

async function uploadDocuments(files, listElement) {
  if (!files || files.length === 0) return;
  if (uploadedDocs.length + files.length > 3) {
    showToast("Use up to 3 documents in a session.");
    return;
  }
  if (Array.from(files).reduce((total, file) => total + file.size, 0) > 15 * 1024 * 1024) {
    showToast("Combined document size must be under 15 MB.");
    return;
  }
  const toUpload = [];
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      showToast(`${file.name} is larger than 10 MB.`);
      return;
    }
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
    showToast(`${response?.files?.length || 0} document(s) added.`);
  } catch (error) {
    console.error("upload error", error);
    if (listElement) listElement.textContent = "Upload failed";
    showToast("Document upload failed.");
  }
}

// ── Mic source selector ────────────────────────────────────────────────────────
const LOOPBACK_MIC = /stereo mix|what u hear|loopback|cable (in|out)|vb-audio|voicemeeter|virtual cable|hdmi|display audio|monitor of/i;
const HALLUCINATED_TRANSCRIPT = /^(thanks for watching|thank you for watching|please subscribe|subscribe|bye\.?|you|thanks\.?|\.|\[music\]|\[silence\]|thank you\.?)$/i;

function persistMicDevice(deviceId) {
  if (!deviceId) return;
  try { localStorage.setItem("hikaMicDeviceId", deviceId); } catch { /* ignore */ }
}

function savedMicDevice() {
  try { return localStorage.getItem("hikaMicDeviceId") || ""; } catch { return ""; }
}

function scoreMicrophone(device, preferredId) {
  const label = device.label || "";
  if (LOOPBACK_MIC.test(label)) return -100;
  if (preferredId && device.deviceId === preferredId) return 200;
  if (device.deviceId === "default" || /^default\b/i.test(label)) return 120;
  if (/communications/i.test(label)) return 90;
  if (/headset|headphone|earbud|airpods|bluetooth/i.test(label)) return 80;
  if (/microphone|mic array|internal/i.test(label)) return 40;
  return 10;
}

function pickPreferredMic(mics, preferredId) {
  if (!mics.length) return "";
  const ranked = [...mics].sort((left, right) => scoreMicrophone(right, preferredId) - scoreMicrophone(left, preferredId));
  return ranked[0].deviceId;
}

function isHallucinatedTranscript(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return true;
  return HALLUCINATED_TRANSCRIPT.test(value);
}

function appendCapturedTranscript(existing, incoming) {
  const next = String(incoming || "").replace(/\s+/g, " ").trim();
  if (!next || isHallucinatedTranscript(next)) return existing || "";
  const current = String(existing || "").replace(/\s+/g, " ").trim();
  if (!current) return next;
  if (current.endsWith(next)) return current;
  if (next.startsWith(current) && next.length > current.length) return next;
  return `${current} ${next}`.replace(/\s+/g, " ").trim();
}

async function loadMicSources() {
  if (isRecording) return;
  const previous = selectedDeviceId || savedMicDevice();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const usedId = stream.getAudioTracks()[0]?.getSettings?.().deviceId || "";
    stream.getTracks().forEach((track) => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((device) => device.kind === "audioinput");

    micSource.innerHTML = "";
    mics.forEach((device) => {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.textContent = device.label || `Mic ${micSource.options.length + 1}`;
      if (LOOPBACK_MIC.test(device.label || "")) opt.textContent += " (skip — not a mic)";
      micSource.appendChild(opt);
    });

    selectedDeviceId = pickPreferredMic(mics, previous || usedId);
    if (micSource && selectedDeviceId) micSource.value = selectedDeviceId;
    persistMicDevice(selectedDeviceId);
  } catch {
    micSource.innerHTML = "";
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

async function openWebHandoff(provider) {
  if (!window.hikaElectron) return;
  if (continueGoogleBtn) continueGoogleBtn.disabled = true;
  if (continueEmailBtn) continueEmailBtn.disabled = true;
  desktopSigninStatus.className = "desktop-signin-status waiting";
  desktopSigninStatus.textContent = provider === "google"
    ? "Opening Google sign-in in your browser…"
    : "Opening your secure browser sign-in…";
  try {
    const next = provider === "google"
      ? `${webAppUrl}/login?next=%2Fdesktop-connect&provider=google`
      : `${webAppUrl}/login?next=%2Fdesktop-connect`;
    const opened = await window.hikaElectron.openExternal(next);
    if (!opened) throw new Error("The browser could not be opened.");
    desktopSigninStatus.textContent = "Waiting for browser authentication. This window will continue automatically.";
  } catch {
    desktopSigninStatus.className = "desktop-signin-status error";
    desktopSigninStatus.textContent = "Could not open your browser. Check your default browser and try again.";
  } finally {
    if (continueGoogleBtn) continueGoogleBtn.disabled = false;
    if (continueEmailBtn) continueEmailBtn.disabled = false;
  }
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

function setUpdateActionButtons(state) {
  if (downloadUpdateBtn) downloadUpdateBtn.hidden = state !== "update-available";
  if (installUpdateBtn) installUpdateBtn.hidden = state !== "update-downloaded";
}

function renderUpdateState(payload) {
  latestUpdateState = payload;
  const currentVersion = payload.currentVersion || "current version";
  const nextVersion = payload.version || "the latest version";

  if (payload.state === "checking") {
    setUpdateActionButtons(payload.state);
    updateStatus.textContent = "Checking GitHub Releases for updates...";
    return;
  }

  if (payload.state === "up-to-date") {
    setUpdateActionButtons(payload.state);
    updateStatus.textContent = `HikaNest ${currentVersion} is up to date.`;
    updateNotification.hidden = true;
    return;
  }

  if (payload.state === "error") {
    setUpdateActionButtons(payload.state);
    updateStatus.textContent = payload.message || "Could not check for updates.";
    updateNotification.hidden = true;
    return;
  }

  updateNotification.hidden = false;
  if (payload.state === "update-available") {
    setUpdateActionButtons(payload.state);
    updateNotificationTitle.textContent = "New update available";
    updateNotificationMessage.textContent = `HikaNest ${nextVersion} is available. You are currently using ${currentVersion}. Open the ⋮ menu to download it.`;
    updateProgressWrap.hidden = true;
    updateNowBtn.textContent = "Download update";
    updateNowBtn.disabled = false;
    updateLaterBtn.hidden = false;
    updateStatus.textContent = `Version ${nextVersion} is available. Download it from this menu.`;
  } else if (payload.state === "downloading") {
    setUpdateActionButtons(payload.state);
    const percent = Math.round(payload.percent ?? 0);
    updateNotificationTitle.textContent = "Downloading HikaNest update...";
    updateNotificationMessage.textContent = `HikaNest ${nextVersion} is downloading. You can keep using the app.`;
    updateProgressWrap.hidden = false;
    updateProgressFill.style.width = `${percent}%`;
    updateProgressLabel.textContent = `${percent}%`;
    updateNowBtn.disabled = true;
    updateLaterBtn.hidden = true;
    updateStatus.textContent = `Downloading update... ${percent}%`;
  } else if (payload.state === "update-downloaded") {
    setUpdateActionButtons(payload.state);
    updateNotificationTitle.textContent = "Update ready";
    updateNotificationMessage.textContent = sessionId
      ? `Update downloaded. Restart HikaNest when you're ready to finish your session.`
      : `HikaNest ${nextVersion} is ready to install. Use Install update & restart.`;
    updateProgressWrap.hidden = true;
    updateNowBtn.textContent = "Install & restart";
    updateNowBtn.disabled = false;
    updateLaterBtn.hidden = false;
    updateStatus.textContent = sessionId ? "Update ready after this session." : "Update ready. Install from this menu.";
  }
}

async function checkForUpdates() {
  if (!window.hikaElectron?.checkForUpdates) {
    updateStatus.textContent = "Updates are available in the installed desktop app.";
    return;
  }
  await window.hikaElectron.checkForUpdates();
}

async function startUpdateDownload() {
  if (latestUpdateState?.state !== "update-available" || !window.hikaElectron?.downloadUpdate) return;
  await window.hikaElectron.downloadUpdate();
}

async function installDownloadedUpdate() {
  if (latestUpdateState?.state !== "update-downloaded" || !window.hikaElectron?.installUpdate) return;
  const result = await window.hikaElectron.installUpdate();
  if (!result.ok) {
    updateNotification.hidden = false;
    updateNotificationMessage.textContent = "Update downloaded. Restart HikaNest when you're ready.";
    updateStatus.textContent = "Finish your session, then install the update.";
    showToast("Finish your active session before restarting.");
  }
}

async function handleUpdateAction() {
  if (latestUpdateState?.state === "update-available") {
    await startUpdateDownload();
    return;
  }
  if (latestUpdateState?.state === "update-downloaded") {
    await installDownloadedUpdate();
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
  if (!transcriptChunks.length && !insights.length) {
    showToast("Nothing to export yet.");
    return;
  }

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
    "Write as this person in first person. Match their domain (data engineer, backend, ML, etc.) from the resume and the prompt below.",
    "Show the answer on screen in a natural conversational tone, like a human typing what they would say. Example: 'Yeah that's a nice one actually — so the dataflow is...'. Never use voice or read answers aloud.",
    selectedSessionMode === "interview" ? "This is an interview. Answer as the candidate." : "This is a regular professional call. Answer as this person.",
    jobContext ? `Job description / role context:\n${jobContext}` : "",
    languageContext,
    (sessionGuidanceEl?.value || "").trim()
      ? `User persona prompt (follow strictly):\n${(sessionGuidanceEl?.value || "").trim()}`
      : "If a resume is uploaded, review it and answer as that professional.",
  ].filter(Boolean).join("\n");
  forceHttpFallback = false;
  cancelledRealtimeResponseIds.clear();
  startControl.disabled = true;
  startControl.textContent = "Starting...";

  try {
    const res = await api("POST", "/api/sessions", { title, platform: "other", status: "active" });
    sessionId    = res.id;
    sessionStart = Date.now();
    window.hikaElectron?.setUpdateSessionActive(true);

    hdrTitle.textContent            = title;
    startScreen.style.display       = "none";
    setupScreen.style.display       = "none";
    sessionScreen.style.display     = "flex";
    sessionScreen.style.flexDirection = "column";
    sessionScreen.style.height      = "100%";
    resetSessionStage();
    startTimer();
    void ensureMicPermission();
    void refreshCredits();
    if (uploadedDocs.length) showToast("Resume and documents loaded. Answers stay on screen.");
  } catch (err) {
    startControl.disabled = false;
    startControl.textContent = setupScreen.style.display !== "none" ? "Start session" : "Start Session";
    const msg = err instanceof Error ? err.message : String(err || "");
    if (err?.status === 401) {
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
  try {
    if (saveTranscriptEnabled) {
      await api("PATCH", `/api/sessions/${sessionId}`, { status: "ended" });
    } else {
      await api("DELETE", `/api/sessions/${sessionId}`);
    }
  } catch (err) {
    console.error("Could not finalize session", err);
    showToast("Session ended, but history could not be updated.");
  }
  window.hikaElectron?.setUpdateSessionActive(false);
  sessionId    = null;
  clearInterval(timerHandle);
  timerHandle  = null;
  transcriptChunks = [];
  insights     = [];
  latestUtterance  = "";
  micTranscriptText = "";
  transcriptReadyForAsk = false;
  pendingAnalyzeOnStop = false;
  answerOnStopLock = false;
  if (listenFinalizeTimer) {
    clearTimeout(listenFinalizeTimer);
    listenFinalizeTimer = null;
  }
  setTranscriptDraft("");
  resetSessionStage();
  meetingBadge.style.display  = "none";
  sessionScreen.style.display = "none";
  showSetupScreen();
  meetingNameEl.value  = "";
  if (setupMeetingNameEl) setupMeetingNameEl.value = "";
  startBtn.disabled    = false;
  startBtn.textContent = "Start Session";
  if (latestUpdateState?.state === "update-downloaded") renderUpdateState(latestUpdateState);
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
    pendingAnalyzeOnStop = false;
    answerOnStopLock = false;
    if (listenFinalizeTimer) {
      clearTimeout(listenFinalizeTimer);
      listenFinalizeTimer = null;
    }
    statusDot.textContent = "● Connecting microphone";
    const stream = await buildRecordingStream();
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== "live") throw new Error("No active microphone track was found.");
    track.enabled = true;
    warnedSilentMic = false;
    silentListenFrames = 0;
    const micLabel = track.label || "Microphone";
    if (micSource && track.getSettings?.().deviceId) {
      const actualId = track.getSettings().deviceId;
      if (actualId && micSource.value !== actualId) {
        const match = Array.from(micSource.options).find((option) => option.value === actualId);
        if (match) micSource.value = actualId;
      }
    }

    // Listen-only while the mic is open. Answers fire when the user stops.
    // Do not construct MediaRecorder on this stream before Realtime starts —
    // Chromium can starve WebRTC if both grab the same track.
    if (useRealtimeVoice && !forceHttpFallback && await startRealtimeVoice(stream)) {
      isRecording = true;
      setListeningUI(true);
      recIndicator.hidden = false;
      statusDot.textContent = `● Listening · ${micLabel}`;
      statusDot.className = "status-dot rec";
      liveTxEl.style.display = "flex";
      setTranscriptDraft("");
      micTranscriptText = "";
      latestUtterance = "";
      transcriptReadyForAsk = false;
      setLiveBadge(`● LIVE · ${micLabel}`, "live");
      return;
    }

    const recorderOptions = mimeType ? { mimeType } : undefined;
    mediaRecorder = new MediaRecorder(stream, recorderOptions);
    audioChunks   = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      await waitForTranscriptionIdle();
      const blob = new Blob(audioChunks, { type: mimeType });
      audioChunks = [];
      let text = "";
      if (blob.size >= 800) text = await transcribeBlob(blob);
      text = (text || currentTranscript()).trim();
      await finishListenAndAnswer(text);
    };

    chunkTimer = setInterval(async () => {
      if (!mediaRecorder || mediaRecorder.state !== "recording" || pendingAnalyzeOnStop || isTranscribing) return;
      mediaRecorder.requestData();
      const snap = audioChunks.slice();
      if (!snap.length) return;
      const blob = new Blob(snap, { type: mimeType });
      if (blob.size < 2500) return;
      const text = await transcribeBlob(blob);
      if (!text || pendingAnalyzeOnStop) return;

      latestUtterance = text;
      micTranscriptText = text;
      setTranscriptDraft(text);
      liveTxEl.style.display = "flex";
    }, 2500);

    mediaRecorder.start(2000);
    isRecording = true;
    setListeningUI(true);
    recIndicator.hidden = false;
    statusDot.textContent      = `● Listening · ${micLabel}`;
    statusDot.className        = "status-dot rec";
    liveTxEl.style.display     = "flex";
    setTranscriptDraft("");
    micTranscriptText = "";
    latestUtterance = "";
    transcriptReadyForAsk = false;
    setLiveBadge(`● LIVE · ${micLabel}`, "live");

  } catch (err) {
    const message = err instanceof Error ? err.message : "Microphone access failed.";
    alert(`Microphone could not start.\n\n${message}\n\nAllow microphone access for Hikanest in Windows Settings, then select the correct microphone.`);
    statusDot.textContent = "● Mic unavailable";
    statusDot.className = "status-dot";
    setListeningUI(false);
    stopAudioPipeline();
    console.error(err);
  }
}

async function stopRecording() {
  if (!isRecording && !pendingAnalyzeOnStop) return;
  clearInterval(chunkTimer);
  isRecording = false;
  pendingAnalyzeOnStop = true;
  setListeningUI(false);
  statusDot.textContent      = "● Capturing";
  statusDot.className        = "status-dot";
  setLiveBadge("Capturing", "captured");

  if (realtimePeer?.connectionState === "connected" && realtimeEvents?.readyState === "open") {
    realtimeStopRequested = true;
    realtimeResponseRequested = false;
    if (realtimeEvents?.readyState === "open") {
      realtimeEvents.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    }
    mediaRecorder?.stream.getTracks().forEach(t => t.stop());
    stopAudioPipeline();
    if (listenFinalizeTimer) clearTimeout(listenFinalizeTimer);
    listenFinalizeTimer = setTimeout(() => {
      void finishListenAndAnswer();
    }, realtimeTranscriptFinalized ? 350 : 2800);
    return;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    await waitForTranscriptionIdle(1500);
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  } else {
    await finishListenAndAnswer();
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

async function finishListenAndAnswer(sourceText) {
  if (answerOnStopLock) return;
  answerOnStopLock = true;
  if (listenFinalizeTimer) {
    clearTimeout(listenFinalizeTimer);
    listenFinalizeTimer = null;
  }
  pendingAnalyzeOnStop = false;
  stopRealtimeVoice();

  const text = (sourceText || currentTranscript()).trim();
  if (!text) {
    setLiveBadge("No speech");
    statusDot.textContent = "● Ready";
    statusDot.className = "status-dot";
    showToast("No speech captured. Press Listen and speak, then Stop.");
    answerOnStopLock = false;
    return;
  }

  latestUtterance = text;
  micTranscriptText = text;
  setTranscriptDraft(text);
  setLiveBadge("Captured", "captured");
  addTranscriptChunk(text);
  transcriptReadyForAsk = false;
  statusDot.textContent = "⚡ Answering";
  statusDot.className = "status-dot ai";
  setLiveBadge("Answering", "answering");

  try {
    if (autoAnswerEnabled) {
      await analyze(text);
    } else {
      transcriptReadyForAsk = true;
      askInput.value = text;
      askInput.focus();
      showToast("Transcript ready — press Ask to generate an answer.");
      statusDot.textContent = "● Ready";
      statusDot.className = "status-dot";
      setLiveBadge("Captured", "captured");
    }
  } finally {
    answerOnStopLock = false;
  }
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
    if (isRecording && !realtimeStopRequested) return;
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
      realtimePartialTranscript = "";
      if (realtimeResponseId) cancelledRealtimeResponseIds.add(realtimeResponseId);
      if (cancelledRealtimeResponseIds.size > 64) cancelledRealtimeResponseIds.clear();
      if (realtimeResponseId && events.readyState === "open") events.send(JSON.stringify({ type: "response.cancel", response_id: realtimeResponseId }));
      realtimeResponseId = null;
      realtimeAnswer = "";
      setAnalyzing(false);
      statusDot.textContent = "● Speech detected";
    } else if (payload.type === "input_audio_buffer.speech_stopped") {
      markRealtimeMetric("speech_stopped");
      statusDot.textContent = realtimeStopRequested ? "● Capturing" : "● Listening";
    } else if (payload.type === "conversation.item.input_audio_transcription.delta") {
      if (payload.delta) markRealtimeMetric("first_transcript_delta");
      realtimePartialTranscript += payload.delta || "";
      realtimeTranscriptFinalized = false;
      setTranscriptDraft([micTranscriptText, realtimePartialTranscript].filter(Boolean).join(" "));
    } else if (payload.type === "conversation.item.input_audio_transcription.completed") {
      const text = (payload.transcript || realtimePartialTranscript || "").trim();
      if (text && !isHallucinatedTranscript(text)) {
        latestUtterance = text;
        micTranscriptText = appendCapturedTranscript(micTranscriptText, text);
        setTranscriptDraft(micTranscriptText);
        if (isRecording && !realtimeStopRequested) setLiveBadge("● LIVE", "live");
        else setLiveBadge("Captured", "captured");
      }
      realtimePartialTranscript = isHallucinatedTranscript(text) ? "" : text;
      realtimeTranscriptFinalized = Boolean(micTranscriptText);
      if (micTranscriptText) transcriptReadyForAsk = true;
      markRealtimeMetric("transcript_completed");
      if (realtimeStopRequested || pendingAnalyzeOnStop) {
        void finishListenAndAnswer(micTranscriptText || text);
      }
    } else if (payload.type === "response.created") {
      if (isRecording && !realtimeStopRequested) return;
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
      statusDot.textContent = isRecording ? "● Listening" : "● Ready";
      if ((realtimeStopRequested || pendingAnalyzeOnStop) && !answerOnStopLock) {
        void finishListenAndAnswer();
      }
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
    const micTrack = stream.getAudioTracks()[0];
    if (micTrack) {
      micTrack.enabled = true;
      peer.addTrack(micTrack, stream);
    }
    peer.addEventListener("track", (event) => {
      event.track.enabled = false;
      event.track.stop();
    });
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const authorization = await fetch(apiUrl + "/api/openai/realtime/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        sessionGuidance,
        mode: selectedSessionMode === "call" ? "meeting" : "interview",
        autoAnswer: false,
        uploadedDocs,
      }),
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
    void refreshCredits();
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
  silentListenFrames = 0;
  const tick = () => {
    const micLevel = computeLevel(micAnalyser);
    const clientLevel = computeLevel(clientAnalyser);
    if (meterMicFill) meterMicFill.style.width = `${Math.max(2, Math.round(micLevel * 100))}%`;
    if (meterClientFill) meterClientFill.style.width = `${Math.max(2, Math.round(clientLevel * 100))}%`;
    if (isRecording) {
      if (micLevel < 0.02) silentListenFrames += 1;
      else {
        silentListenFrames = 0;
        warnedSilentMic = false;
      }
      if (!warnedSilentMic && silentListenFrames > 180) {
        warnedSilentMic = true;
        showToast("Mic is silent. Choose another input or allow microphone access in Windows.");
        statusDot.textContent = "● Mic silent";
      }
    }
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
  const existing = micStream?.getAudioTracks?.()[0];
  if (existing && existing.readyState === "live") {
    const existingId = existing.getSettings?.().deviceId;
    if (!selectedDeviceId || !existingId || existingId === selectedDeviceId) {
      existing.enabled = true;
      return micStream;
    }
  }
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }

  const base = {
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: true,
    channelCount: 1,
  };
  const attempts = [];
  if (selectedDeviceId && selectedDeviceId !== "default") {
    attempts.push({ audio: { ...base, deviceId: { exact: selectedDeviceId } } });
    attempts.push({ audio: { ...base, deviceId: { ideal: selectedDeviceId } } });
  }
  attempts.push({ audio: base });
  attempts.push({ audio: true });

  let lastError = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const constraints = attempts[index];
    const isLast = index === attempts.length - 1;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") {
        stream.getTracks().forEach((item) => item.stop());
        continue;
      }
      if (!isLast && LOOPBACK_MIC.test(track.label || "")) {
        stream.getTracks().forEach((item) => item.stop());
        continue;
      }
      track.enabled = true;
      track.onended = () => {
        if (micStream === stream) micStream = null;
      };
      selectedDeviceId = track.getSettings?.().deviceId || selectedDeviceId;
      if (micSource && selectedDeviceId) micSource.value = selectedDeviceId;
      persistMicDevice(selectedDeviceId);
      micStream = stream;
      return micStream;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Microphone access failed.");
}

async function ensureMicPermission() {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((track) => track.stop());
    if (statusDot && !isRecording) statusDot.textContent = "● Mic ready";
  } catch {
    if (statusDot) statusDot.textContent = "● Allow mic";
    showToast("Allow microphone access for Hikanest, then press Listen.");
  }
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
  if (!micTrack || micTrack.readyState !== "live") throw new Error("No microphone track");
  micTrack.enabled = true;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!audioContext || audioContext.state === "closed") audioContext = new Ctx();
  if (audioContext.state === "suspended") await audioContext.resume();

  if (meterSource) {
    try { meterSource.disconnect(); } catch { /* already disconnected */ }
    meterSource = null;
  }
  if (meterCaptureStream) {
    meterCaptureStream.getTracks().forEach((track) => track.stop());
    meterCaptureStream = null;
  }
  const meterTrack = typeof micTrack.clone === "function" ? micTrack.clone() : micTrack;
  meterCaptureStream = new MediaStream([meterTrack]);
  meterSource = audioContext.createMediaStreamSource(meterCaptureStream);
  micAnalyser = audioContext.createAnalyser();
  micAnalyser.fftSize = 2048;
  meterSource.connect(micAnalyser);
  clientAnalyser = null;

  mixedStream = mic;
  startMeters();
  return mic;
}

function stopAudioPipeline() {
  stopMeters();
  micAnalyser = null;
  clientAnalyser = null;
  meterSource = null;
  if (meterCaptureStream) {
    meterCaptureStream.getTracks().forEach((track) => track.stop());
    meterCaptureStream = null;
  }

  if (mixedStream && mixedStream !== micStream) {
    mixedStream.getTracks().forEach(t => t.stop());
  }
  mixedStream = null;
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
  await waitForTranscriptionIdle(6000);
  isTranscribing = true;

  try {
    if (blob.size < 800) return "";
    const b64 = await blobToBase64(blob);
    const res = await api("POST", "/api/openai/transcribe", {
      audioBase64: b64,
      mimeType: blob.type,
    });
    const text = (res.transcript || "").replace(/\s+/g, " ").trim();
    return isHallucinatedTranscript(text) ? "" : text;
  } catch (err) {
    console.error("Transcribe error", err);
    return "";
  } finally {
    isTranscribing = false;
  }
}

// ── AI Analysis ───────────────────────────────────────────────────────────────
async function analyze(utterance) {
  if (!utterance || isAnalyzing) return false;
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
      ? "Return complete executable code first, then a short spoken explanation."
      : "Write the answer on screen as this person, in natural conversational English. First person. Use the resume, JD, and persona prompt. Human tone, e.g. 'Yeah that's a nice one actually — so the dataflow is...'. Do not speak with voice. Never invent experience.",
    `Timestamp: ${new Date().toISOString()}`,
  ].filter(Boolean).join("\n");

  try {
    let result = await api("POST", "/api/openai/analyze", {
      transcript: context,
      sessionId,
      screenshotBase64: screenshotBase64 || undefined,
      uploadedDocs: uploadedDocs.slice(0, 3).map(d => ({ id: d.id, name: d.name })),
      model: selectedModel,
      mode: selectedSessionMode === "call" ? "meeting" : "interview",
      history: insights.slice(0, 8).reverse().flatMap(item => [
        { role: "user", content: item.question || "" },
        { role: "assistant", content: item.answer || "" },
      ]),
    });
    if (!result) return false;

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

    insights = [insight, ...insights].slice(0, 20);
    selectedHistoryInsight = null;
    renderInsights();
    if (typeof result.credits === "number") setCredits(result.credits);
    else void refreshCredits();
    return true;
  } catch (err) {
    console.error("Analyze error", err);
    showToast("Could not get an answer. Check your connection and try again.");
    return false;
  } finally {
    isAnalyzing = false;
    setAnalyzing(false);
  }
}

async function handleManualAsk() {
  if (isRecording) {
    showToast("Stop listening first — the answer is generated when you stop the mic.");
    return;
  }
  const typedQuestion = askInput.value.trim();
  const q = typedQuestion || currentTranscript();
  if (!q || isAnalyzing) return;
  latestUtterance = q;
  if (typedQuestion) askInput.value = "";
  if (!transcriptReadyForAsk && typedQuestion) addTranscriptChunk(q);
  transcriptReadyForAsk = false;
  askBtn.disabled   = true;
  const answered = await analyze(q);
  if (!answered && typedQuestion) askInput.value = typedQuestion;
  askBtn.disabled = false;
  askInput.focus();
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
  statusDot.textContent = on ? "⚡ Answering" : (isRecording ? "● Listening" : "● Ready");
  statusDot.className   = on ? "status-dot ai" : (isRecording ? "status-dot rec" : "status-dot");
  if (on) setLiveBadge("Answering", "answering");
  else if (!isRecording && currentTranscript()) setLiveBadge("Captured", "captured");

  const existingRow = aiScroll.querySelector(".analyzing-row");
  if (on && !existingRow) {
    const hint = aiScroll.querySelector(".empty-hint");
    if (hint) hint.remove();
    const row = document.createElement("div");
    row.className = "analyzing-row";
    row.innerHTML = `<span class="pulse">⚡</span><span>Analyzing transcript…</span>`;
    aiScroll.prepend(row);
  } else if (!on && existingRow) {
    existingRow.remove();
  }
}

function renderInsights() {
  aiScroll.innerHTML = "";
  if (!insights.length) {
    aiScroll.innerHTML = emptyHint("✦", "Press Listen, then Stop — the answer appears here");
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
    const payload = await res.json().catch(() => null);
    const serverMessage = typeof payload?.error === "string" ? payload.error : "";
    const error = new Error(serverMessage || `Request failed (${res.status})`);
    error.status = res.status;
    if (res.status === 402) {
      if (typeof payload?.credits === "number") setCredits(payload.credits);
      showToast(serverMessage || "Not enough credits. Open Pricing in the web app.");
    }
    throw error;
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
  void refreshCredits();
}

function showGoogleSigninScreen() {
  if (startScreen) startScreen.style.display = "none";
  if (setupScreen) setupScreen.style.display = "none";
  if (sessionScreen) sessionScreen.style.display = "none";
  if (googleSigninScreen) googleSigninScreen.style.display = "flex";
  if (desktopSigninStatus) {
    desktopSigninStatus.className = "desktop-signin-status";
    desktopSigninStatus.textContent = "A secure, one-time sign-in code connects this app.";
  }
}

async function completeDesktopHandoff(code) {
  try {
    const result = await api("POST", "/api/auth/desktop/exchange", { code });
    if (!result?.token || !result?.session) throw new Error("Desktop sign-in could not be completed.");
    await setAuthToken(result.token);
    await setAuthSession(result.session);
    if (desktopSigninStatus) {
      desktopSigninStatus.className = "desktop-signin-status success";
      desktopSigninStatus.textContent = "Signed in successfully.";
    }
    showSetupScreen();
    void refreshCredits();
  } catch (error) {
    showGoogleSigninScreen();
    if (desktopSigninStatus) {
      desktopSigninStatus.className = "desktop-signin-status error";
      desktopSigninStatus.textContent = error instanceof Error ? error.message : "Desktop sign-in could not be completed.";
    }
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────
init();

window.addEventListener("beforeunload", () => {
  stopAudioPipeline();
});
