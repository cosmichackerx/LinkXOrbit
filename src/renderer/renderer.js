const api = window.linkXOrbit;

const viewHome = document.getElementById("viewHome");
const viewSettings = document.getElementById("viewSettings");
const sessionBadge = document.getElementById("sessionBadge");
const modeBadge = document.getElementById("modeBadge");
const sessionHint = document.getElementById("sessionHint");
const runHint = document.getElementById("runHint");
const btnLogin = document.getElementById("btnLogin");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnOpenSettings = document.getElementById("btnOpenSettings");
const btnBackHome = document.getElementById("btnBackHome");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const settingsStatus = document.getElementById("settingsStatus");
const logEl = document.getElementById("log");
const minDelay = document.getElementById("minDelay");
const maxDelay = document.getElementById("maxDelay");
const maxActions = document.getElementById("maxActions");
const modeRadios = document.querySelectorAll('input[name="mode"]');

let cachedSettings = null;

function appendLog(line) {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function modeLabel(mode) {
  return mode === "unfollow" ? "Unfollow connections" : "Grow network";
}

function applyModeToHomeUi(settings) {
  modeBadge.textContent = modeLabel(settings.mode);
  if (settings.mode === "unfollow") {
    runHint.textContent =
      "Opens your followers list and unfollows people marked Following (with confirmation).";
    btnStart.textContent = "Start unfollowing";
  } else {
    runHint.textContent = "Opens My Network → Grow and clicks Connect with safe delays.";
    btnStart.textContent = "Start connecting";
  }
}

function setSessionUi(loggedIn) {
  if (loggedIn) {
    sessionBadge.textContent = "Signed in";
    sessionBadge.className = "badge badge-ok";
    sessionHint.textContent = "Your LinkedIn session is saved on this computer.";
    btnStart.disabled = false;
  } else {
    sessionBadge.textContent = "Not signed in";
    sessionBadge.className = "badge badge-warn";
    sessionHint.textContent = "Sign in once — cookies stay in a private app profile.";
    btnStart.disabled = true;
  }
}

function settingsFromForm() {
  const mode =
    [...modeRadios].find((r) => r.checked)?.value === "unfollow" ? "unfollow" : "grow";
  return {
    mode,
    minDelayMs: Number(minDelay.value) * 1000,
    maxDelayMs: Number(maxDelay.value) * 1000,
    maxActionsPerRun: Number(maxActions.value),
  };
}

function loadSettingsToForm(settings) {
  cachedSettings = settings;
  for (const radio of modeRadios) {
    radio.checked = radio.value === settings.mode;
  }
  minDelay.value = Math.round(settings.minDelayMs / 1000);
  maxDelay.value = Math.round(settings.maxDelayMs / 1000);
  maxActions.value = settings.maxActionsPerRun;
  applyModeToHomeUi(settings);
}

function showHome() {
  viewHome.classList.remove("hidden");
  viewSettings.classList.add("hidden");
  btnOpenSettings.classList.remove("hidden");
  settingsStatus.textContent = "";
}

function showSettings() {
  viewHome.classList.add("hidden");
  viewSettings.classList.remove("hidden");
  if (cachedSettings) loadSettingsToForm(cachedSettings);
}

async function refreshStatus() {
  const status = await api.getSessionStatus();
  setSessionUi(status.loggedIn);
  loadSettingsToForm(status.settings);
}

btnOpenSettings.addEventListener("click", showSettings);
btnBackHome.addEventListener("click", showHome);

btnLogin.addEventListener("click", async () => {
  btnLogin.disabled = true;
  appendLog("Opening LinkedIn sign-in…");
  try {
    const result = await api.login();
    setSessionUi(result.loggedIn);
  } finally {
    btnLogin.disabled = false;
  }
});

btnStart.addEventListener("click", async () => {
  btnStart.disabled = true;
  btnStop.disabled = false;
  const mode = cachedSettings?.mode ?? "grow";
  appendLog(`Starting automation (${modeLabel(mode)})…`);
  try {
    const result = await api.startAutomation();
    if (!result.ok) {
      appendLog(result.error || "Could not start.");
    } else if (result.weeklyLimitReached) {
      appendLog("LinkedIn weekly invite limit reached — run ended automatically.");
    } else {
      appendLog(`Run finished (${result.actions} action(s)).`);
    }
  } finally {
    btnStop.disabled = true;
    btnStart.disabled = !(await api.getSessionStatus()).loggedIn;
  }
});

btnStop.addEventListener("click", () => {
  api.stopAutomation();
});

btnSaveSettings.addEventListener("click", async () => {
  const s = settingsFromForm();
  if (s.minDelayMs > s.maxDelayMs) {
    settingsStatus.textContent = "Min delay must be ≤ max delay.";
    return;
  }
  try {
    const saved = await api.saveSettings(s);
    loadSettingsToForm(saved);
    settingsStatus.textContent = "Settings saved permanently on this PC.";
    appendLog(`Settings saved — mode: ${modeLabel(saved.mode)}.`);
  } catch (err) {
    settingsStatus.textContent = err?.message || "Could not save settings.";
  }
});

api.onLog(appendLog);
refreshStatus();
