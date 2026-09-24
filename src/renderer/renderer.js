const sessionBadge = document.getElementById("sessionBadge");
const sessionHint = document.getElementById("sessionHint");
const btnLogin = document.getElementById("btnLogin");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnSave = document.getElementById("btnSave");
const logEl = document.getElementById("log");
const minDelay = document.getElementById("minDelay");
const maxDelay = document.getElementById("maxDelay");
const maxConnects = document.getElementById("maxConnects");

function appendLog(line) {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
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
  return {
    minDelayMs: Number(minDelay.value) * 1000,
    maxDelayMs: Number(maxDelay.value) * 1000,
    maxConnects: Number(maxConnects.value),
  };
}

function loadSettingsToForm(settings) {
  minDelay.value = Math.round(settings.minDelayMs / 1000);
  maxDelay.value = Math.round(settings.maxDelayMs / 1000);
  maxConnects.value = settings.maxConnects;
}

async function refreshStatus() {
  const status = await window.linkedInConnect.getSessionStatus();
  setSessionUi(status.loggedIn);
  loadSettingsToForm(status.settings);
}

btnLogin.addEventListener("click", async () => {
  btnLogin.disabled = true;
  appendLog("Opening LinkedIn sign-in…");
  try {
    const result = await window.linkedInConnect.login();
    setSessionUi(result.loggedIn);
  } finally {
    btnLogin.disabled = false;
  }
});

btnStart.addEventListener("click", async () => {
  btnStart.disabled = true;
  btnStop.disabled = false;
  appendLog("Starting automation…");
  try {
    const result = await window.linkedInConnect.startAutomation();
    if (!result.ok) appendLog(result.error || "Could not start.");
  } finally {
    btnStop.disabled = true;
    btnStart.disabled = !(await window.linkedInConnect.getSessionStatus()).loggedIn;
  }
});

btnStop.addEventListener("click", () => {
  window.linkedInConnect.stopAutomation();
});

btnSave.addEventListener("click", async () => {
  const s = settingsFromForm();
  if (s.minDelayMs > s.maxDelayMs) {
    appendLog("Min delay must be ≤ max delay.");
    return;
  }
  await window.linkedInConnect.saveSettings(s);
  appendLog("Settings saved.");
});

window.linkedInConnect.onLog(appendLog);
refreshStatus();
