const api = window.linkXOrbit;
const $ = (id) => document.getElementById(id);

/* ---------- Elements ---------- */
const views = {
  dashboard: $("viewDashboard"),
  activity: $("viewActivity"),
  settings: $("viewSettings"),
};
const navItems = document.querySelectorAll(".nav-item");

const sessionDot = $("sessionDot");
const sessionTitle = $("sessionTitle");
const sessionSub = $("sessionSub");
const btnLogin = $("btnLogin");
const btnLoginInline = $("btnLoginInline");

const onboarding = $("onboarding");
const stepSignIn = $("stepSignIn");
const stepConfigure = $("stepConfigure");
const stepRun = $("stepRun");

const runStateBadge = $("runStateBadge");
const modeTitle = $("modeTitle");
const runHint = $("runHint");
const runMeta = $("runMeta");
const btnChangeMode = $("btnChangeMode");
const btnStart = $("btnStart");
const btnStartLabel = $("btnStartLabel");
const btnStop = $("btnStop");
const btnStopLabel = $("btnStopLabel");
const statDetail = $("statDetail");
const progressText = $("progressText");
const progressBar = $("progressBar");
const progressFill = $("progressFill");

const statThisRun = $("statThisRun");
const statTotal = $("statTotal");
const btnResetStats = $("btnResetStats");
const statFollowers = $("statFollowers");
const statFollowing = $("statFollowing");
const networkStatsDetail = $("networkStatsDetail");
const btnRefreshCounts = $("btnRefreshCounts");

const logEl = $("log");
const logRecent = $("logRecent");
const logUnread = $("logUnread");
const btnCopyLog = $("btnCopyLog");
const btnClearLog = $("btnClearLog");

const settingsForm = $("settingsForm");
const modeRadios = document.querySelectorAll('input[name="mode"]');
const unfollowTargetRadios = document.querySelectorAll('input[name="unfollowTarget"]');
const unfollowTargetCard = $("unfollowTargetCard");
const unfollowTargetHint = $("unfollowTargetHint");
const minDelay = $("minDelay");
const maxDelay = $("maxDelay");
const maxActions = $("maxActions");
const settingsError = $("settingsError");
const runEstimate = $("runEstimate");
const saveBar = $("saveBar");
const settingsStatus = $("settingsStatus");
const btnSaveSettings = $("btnSaveSettings");
const btnDiscard = $("btnDiscard");
const runningNotice = $("runningNotice");

/* ---------- State ---------- */
const state = {
  view: "dashboard",
  loggedIn: false,
  running: false,
  settings: null,
  dirty: false,
  logEntries: [],
  unread: 0,
  hasSavedOnce: false,
};

/* ---------- Helpers ---------- */
function modeLabel(mode) {
  return mode === "unfollow" ? "Unfollow" : "Grow network";
}

function targetLabel(target) {
  return target === "following" ? "Following" : "Followers";
}

function fmtNum(n) {
  return n === null || n === undefined ? "—" : Number(n).toLocaleString();
}

function fmtDuration(sec) {
  if (sec < 60) return `${Math.round(sec)} sec`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

function toast(message, kind = "info", ms = 3200) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  $("toasts").appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }, ms);
}

function confirmDialog({ title, body, okLabel = "Confirm", danger = true }) {
  return new Promise((resolve) => {
    const modal = $("confirmModal");
    const ok = $("confirmOk");
    const cancel = $("confirmCancel");
    $("confirmTitle").textContent = title;
    $("confirmBody").textContent = body;
    ok.textContent = okLabel;
    ok.className = `btn ${danger ? "danger" : "primary"}`;
    modal.classList.remove("hidden");
    ok.focus();

    const close = (result) => {
      modal.classList.add("hidden");
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (e) => { if (e.target === modal) close(false); };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
  });
}

/* ---------- Navigation ---------- */
async function navigate(view) {
  if (view === state.view) return;
  if (state.view === "settings" && state.dirty) {
    const leave = await confirmDialog({
      title: "Discard unsaved changes?",
      body: "You have settings changes that haven’t been saved.",
      okLabel: "Discard",
    });
    if (!leave) return;
    loadSettingsToForm(state.settings);
  }
  state.view = view;
  for (const [name, el] of Object.entries(views)) el.classList.toggle("hidden", name !== view);
  navItems.forEach((n) => n.classList.toggle("active", n.dataset.view === view));
  if (view === "activity") {
    state.unread = 0;
    renderUnread();
    logEl.scrollTop = logEl.scrollHeight;
  }
  document.querySelector(".main").scrollTop = 0;
}

navItems.forEach((n) => n.addEventListener("click", () => navigate(n.dataset.view)));
document.querySelectorAll("[data-goto]").forEach((b) =>
  b.addEventListener("click", () => navigate(b.dataset.goto))
);

/* ---------- Log ---------- */
function classifyLine(line) {
  const l = line.toLowerCase();
  if (/(error|failed|could not|cannot|limit reached)/.test(l)) return "err";
  if (/(success|connected|unfollowed|finished|saved|signed in)/.test(l)) return "ok";
  return "";
}

function renderLogItem(entry) {
  const li = document.createElement("li");
  if (entry.kind) li.className = entry.kind;
  const t = document.createElement("span");
  t.className = "log-time";
  t.textContent = entry.time;
  const m = document.createElement("span");
  m.className = "log-msg";
  m.textContent = entry.msg;
  li.append(t, m);
  return li;
}

function renderUnread() {
  logUnread.textContent = state.unread > 99 ? "99+" : String(state.unread);
  logUnread.classList.toggle("hidden", state.unread === 0);
}

function renderRecent() {
  logRecent.innerHTML = "";
  const recent = state.logEntries.slice(-5);
  if (!recent.length) {
    logRecent.innerHTML = '<li class="log-empty">No activity yet.</li>';
    return;
  }
  for (const e of recent) logRecent.appendChild(renderLogItem(e));
}

function appendLog(line) {
  const entry = {
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    msg: String(line),
    kind: classifyLine(String(line)),
  };
  state.logEntries.push(entry);
  if (state.logEntries.length > 1000) state.logEntries.shift();

  const empty = logEl.querySelector(".log-empty");
  if (empty) empty.remove();
  const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
  logEl.appendChild(renderLogItem(entry));
  while (logEl.children.length > 1000) logEl.firstChild.remove();
  if (atBottom) logEl.scrollTop = logEl.scrollHeight;

  if (state.view !== "activity") {
    state.unread++;
    renderUnread();
  }
  renderRecent();
}

btnCopyLog.addEventListener("click", async () => {
  const text = state.logEntries.map((e) => `[${e.time}] ${e.msg}`).join("\n");
  if (!text) return toast("Log is empty.");
  try {
    await navigator.clipboard.writeText(text);
    toast("Log copied to clipboard.", "ok");
  } catch {
    toast("Could not copy log.", "err");
  }
});

btnClearLog.addEventListener("click", () => {
  state.logEntries = [];
  logEl.innerHTML = '<li class="log-empty">No activity yet.</li>';
  renderRecent();
});

/* ---------- Session / onboarding ---------- */
function setSessionUi(loggedIn) {
  state.loggedIn = loggedIn;
  sessionDot.className = `dot ${loggedIn ? "ok" : "warn"}`;
  sessionTitle.textContent = loggedIn ? "Signed in" : "Not signed in";
  sessionSub.textContent = loggedIn ? "Session saved on this PC" : "Sign in to enable automation";
  btnLogin.textContent = loggedIn ? "Re-authenticate" : "Sign in to LinkedIn";
  btnLogin.className = `btn ${loggedIn ? "secondary" : "primary"} btn-block btn-sm`;
  renderOnboarding();
  renderRunControls();
}

function renderOnboarding() {
  const configured = state.hasSavedOnce;
  onboarding.classList.toggle("hidden", state.loggedIn && configured);
  stepSignIn.className = `step ${state.loggedIn ? "done" : "current"}`;
  btnLoginInline.classList.toggle("hidden", state.loggedIn);
  stepConfigure.className = `step ${configured ? "done" : state.loggedIn ? "current" : ""}`;
  stepRun.className = `step ${state.loggedIn && configured ? "current" : ""}`;
}

async function doLogin(btn) {
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Waiting for sign-in…";
  appendLog("Opening LinkedIn sign-in…");
  try {
    const result = await api.login();
    setSessionUi(result.loggedIn);
    if (result.loggedIn) toast("Signed in to LinkedIn.", "ok");
    else toast("Sign-in not completed.", "warn");
  } catch (err) {
    toast("Sign-in failed.", "err");
    appendLog(`Sign-in error: ${err?.message || err}`);
  } finally {
    btn.disabled = false;
    if (btn === btnLoginInline) btn.textContent = prev;
    else setSessionUi(state.loggedIn);
  }
}

btnLogin.addEventListener("click", () => doLogin(btnLogin));
btnLoginInline.addEventListener("click", () => doLogin(btnLoginInline));

/* ---------- Run controls ---------- */
function renderModeSummary(s) {
  if (!s) return;
  modeTitle.textContent = modeLabel(s.mode);
  if (s.mode === "unfollow") {
    runHint.textContent = `Opens your ${targetLabel(s.unfollowTarget)} list and unfollows accounts marked “Following”. “Follow” buttons are skipped.`;
    btnStartLabel.textContent = "Start unfollowing";
  } else {
    runHint.textContent = "Opens My Network → Grow and sends Connect requests with randomized delays.";
    btnStartLabel.textContent = "Start connecting";
  }
  const chips = [
    `${Math.round(s.minDelayMs / 1000)}–${Math.round(s.maxDelayMs / 1000)} sec delay`,
    `Up to ${s.maxActionsPerRun} actions`,
  ];
  if (s.mode === "unfollow") chips.unshift(`Source: ${targetLabel(s.unfollowTarget)}`);
  runMeta.innerHTML = "";
  for (const c of chips) {
    const el = document.createElement("span");
    el.className = "chip";
    el.textContent = c;
    runMeta.appendChild(el);
  }
  if (!state.running) setProgress(0);
}

function setProgress(count) {
  const max = state.settings?.maxActionsPerRun || 0;
  progressText.textContent = `${count} / ${max}`;
  progressBar.setAttribute("aria-valuemax", String(max));
  progressBar.setAttribute("aria-valuenow", String(count));
  const pct = max ? Math.min(100, (count / max) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressBar.classList.toggle("indeterminate", state.running && count === 0);
  if (state.running && count > 0) progressFill.style.removeProperty("transform");
}

function renderRunControls() {
  btnStart.classList.toggle("hidden", state.running);
  btnStop.classList.toggle("hidden", !state.running);
  btnStart.disabled = !state.loggedIn || state.running;
  btnStart.title = state.loggedIn ? "" : "Sign in to LinkedIn first";
  btnLogin.disabled = state.running;
  btnChangeMode.disabled = state.running;
  btnResetStats.disabled = state.running;

  if (state.running) {
    runStateBadge.className = "badge badge-live";
    runStateBadge.textContent = "Running";
  } else if (state.loggedIn) {
    runStateBadge.className = "badge badge-ok";
    runStateBadge.textContent = "Ready";
  } else {
    runStateBadge.className = "badge badge-warn";
    runStateBadge.textContent = "Sign-in required";
  }

  // Lock settings while running
  runningNotice.classList.toggle("hidden", !state.running);
  settingsForm.querySelectorAll("input").forEach((i) => (i.disabled = state.running));
  updateDirty();
}

btnStart.addEventListener("click", async () => {
  if (!state.loggedIn || state.running) return;
  state.running = true;
  btnStop.disabled = false;
  btnStopLabel.textContent = "Stop";
  statThisRun.textContent = "0";
  statDetail.textContent = "Starting automation…";
  setProgress(0);
  renderRunControls();

  appendLog(`Starting automation (${modeLabel(state.settings?.mode)})…`);
  try {
    const result = await api.startAutomation();
    if (!result.ok) {
      const msg = result.error || "Could not start.";
      appendLog(msg);
      statDetail.textContent = msg;
      toast(msg, "err");
    } else if (result.weeklyLimitReached) {
      appendLog("LinkedIn weekly invite limit reached — run ended automatically.");
      statDetail.textContent = `Weekly limit reached after ${result.actions} action(s).`;
      toast("LinkedIn weekly limit reached. Try again next week.", "warn", 5000);
    } else if (result.stopped) {
      appendLog(`Run stopped (${result.actions} action(s) completed).`);
      statDetail.textContent = `Stopped after ${result.actions} action(s).`;
      toast(`Stopped after ${result.actions} action(s).`);
    } else {
      appendLog(`Run finished (${result.actions} action(s)).`);
      statDetail.textContent = `Finished — ${result.actions} action(s) succeeded.`;
      toast(`Run finished: ${result.actions} action(s).`, "ok");
    }
    if (result.stats?.totalSucceeded !== undefined) statTotal.textContent = fmtNum(result.stats.totalSucceeded);
    if (typeof result.actions === "number") {
      state.running = false;
      setProgress(result.actions);
    }
  } catch (err) {
    appendLog(`Automation error: ${err?.message || err}`);
    statDetail.textContent = "Automation failed unexpectedly.";
    toast("Automation failed unexpectedly.", "err");
  } finally {
    state.running = false;
    progressBar.classList.remove("indeterminate");
    try {
      const status = await api.getSessionStatus();
      setSessionUi(status.loggedIn);
    } catch {
      renderRunControls();
    }
  }
});

btnStop.addEventListener("click", () => {
  btnStop.disabled = true;
  btnStopLabel.textContent = "Stopping…";
  statDetail.textContent = "Stopping after the current action…";
  api.stopAutomation();
});

api.onActionSuccess((data) => {
  statThisRun.textContent = fmtNum(data.runCount);
  statTotal.textContent = fmtNum(data.totalCount);
  const verb = data.mode === "unfollow" ? "Unfollowed" : "Connected with";
  statDetail.textContent = data.name ? `${verb} ${data.name}` : `${verb} #${data.runCount}`;
  setProgress(data.runCount);
});

/* ---------- Stats ---------- */
btnResetStats.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Reset all-time counter?",
    body: "The all-time total will be set to 0. This can’t be undone.",
    okLabel: "Reset",
  });
  if (!ok) return;
  try {
    const stats = await api.resetStats();
    statTotal.textContent = fmtNum(stats.totalSucceeded ?? 0);
    statThisRun.textContent = "0";
    appendLog("All-time counter reset to 0.");
    toast("Counter reset.", "ok");
  } catch {
    toast("Could not reset counter.", "err");
  }
});

function updateNetworkCountsUi(counts) {
  if (!counts) return;
  statFollowers.textContent = fmtNum(counts.followers);
  statFollowing.textContent = fmtNum(counts.following);
  if (counts.followers !== null || counts.following !== null) {
    if (counts.lastUpdated) {
      const d = new Date(counts.lastUpdated);
      networkStatsDetail.textContent = `Updated ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } else {
      networkStatsDetail.textContent = "Updated recently";
    }
  } else {
    networkStatsDetail.textContent = "Not fetched yet";
  }
}

btnRefreshCounts.addEventListener("click", async () => {
  if (!state.loggedIn) return toast("Sign in to fetch network stats.", "warn");
  btnRefreshCounts.disabled = true;
  btnRefreshCounts.classList.add("spinning");
  networkStatsDetail.textContent = "Fetching…";
  appendLog("Refreshing followers & following counts…");
  try {
    updateNetworkCountsUi(await api.refreshNetworkCounts());
  } catch {
    networkStatsDetail.textContent = "Fetch failed";
    toast("Could not fetch network stats.", "err");
  } finally {
    btnRefreshCounts.disabled = false;
    btnRefreshCounts.classList.remove("spinning");
  }
});

api.onNetworkCountsUpdated(updateNetworkCountsUi);

/* ---------- Settings ---------- */
function settingsFromForm() {
  const mode = [...modeRadios].find((r) => r.checked)?.value === "unfollow" ? "unfollow" : "grow";
  const unfollowTarget =
    [...unfollowTargetRadios].find((r) => r.checked)?.value === "following" ? "following" : "followers";
  return {
    mode,
    unfollowTarget,
    minDelayMs: Math.round(Number(minDelay.value) * 1000),
    maxDelayMs: Math.round(Number(maxDelay.value) * 1000),
    maxActionsPerRun: Math.round(Number(maxActions.value)),
  };
}

function validate(s) {
  const fields = [
    [minDelay, s.minDelayMs >= 1000 && s.minDelayMs <= 600000, "Min delay must be between 1 and 600 seconds."],
    [maxDelay, s.maxDelayMs >= 1000 && s.maxDelayMs <= 900000, "Max delay must be between 1 and 900 seconds."],
    [maxActions, s.maxActionsPerRun >= 1 && s.maxActionsPerRun <= 5000, "Max actions must be between 1 and 5000."],
  ];
  let error = "";
  for (const [input, ok, msg] of fields) {
    input.parentElement.classList.toggle("invalid", !ok);
    if (!ok && !error) error = msg;
  }
  if (!error && s.minDelayMs > s.maxDelayMs) {
    minDelay.parentElement.classList.add("invalid");
    maxDelay.parentElement.classList.add("invalid");
    error = "Min delay can’t be greater than max delay.";
  }
  settingsError.textContent = error;
  settingsError.classList.toggle("hidden", !error);
  return !error;
}

function sameSettings(a, b) {
  if (!a || !b) return false;
  return (
    a.mode === b.mode &&
    (a.mode !== "unfollow" || (a.unfollowTarget || "followers") === (b.unfollowTarget || "followers")) &&
    a.minDelayMs === b.minDelayMs &&
    a.maxDelayMs === b.maxDelayMs &&
    a.maxActionsPerRun === b.maxActionsPerRun
  );
}

function updateFormUi() {
  const s = settingsFromForm();
  unfollowTargetCard.classList.toggle("hidden", s.mode !== "unfollow");
  unfollowTargetHint.textContent =
    s.unfollowTarget === "followers"
      ? "Opens people who follow you and unfollows those you also follow back."
      : "Opens the list of people you follow.";
  const valid = validate(s);
  if (valid) {
    const avg = (s.minDelayMs + s.maxDelayMs) / 2000;
    runEstimate.textContent = `Estimated run time at max actions: about ${fmtDuration(avg * s.maxActionsPerRun)}.`;
  } else {
    runEstimate.textContent = "";
  }
  updateDirty();
}

function updateDirty() {
  const s = settingsFromForm();
  state.dirty = !sameSettings(s, state.settings);
  saveBar.classList.toggle("dirty", state.dirty);
  settingsStatus.textContent = state.dirty ? "You have unsaved changes" : "All changes saved";
  const valid = settingsError.classList.contains("hidden");
  btnSaveSettings.disabled = !state.dirty || !valid || state.running;
  btnDiscard.disabled = !state.dirty || state.running;
}

function loadSettingsToForm(s) {
  state.settings = s;
  for (const r of modeRadios) r.checked = r.value === s.mode;
  for (const r of unfollowTargetRadios) r.checked = r.value === (s.unfollowTarget || "followers");
  minDelay.value = Math.max(1, Math.round(s.minDelayMs / 1000));
  maxDelay.value = Math.max(1, Math.round(s.maxDelayMs / 1000));
  maxActions.value = s.maxActionsPerRun;
  updateFormUi();
  renderModeSummary(s);
}

settingsForm.addEventListener("input", updateFormUi);
settingsForm.addEventListener("change", updateFormUi);

settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const s = settingsFromForm();
  if (!validate(s) || state.running) return;
  btnSaveSettings.disabled = true;
  btnSaveSettings.textContent = "Saving…";
  try {
    const saved = await api.saveSettings(s);
    loadSettingsToForm(saved);
    markConfigured();
    appendLog(`Settings saved — mode: ${modeLabel(saved.mode)}.`);
    toast("Settings saved.", "ok");
    navigate("dashboard");
  } catch (err) {
    toast(err?.message || "Could not save settings.", "err");
  } finally {
    btnSaveSettings.textContent = "Save changes";
    updateDirty();
  }
});

btnDiscard.addEventListener("click", () => {
  if (state.settings) loadSettingsToForm(state.settings);
});

function markConfigured() {
  state.hasSavedOnce = true;
  try { localStorage.setItem("lxo.configured", "1"); } catch {}
  renderOnboarding();
}

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "s" && state.view === "settings") {
    e.preventDefault();
    if (!btnSaveSettings.disabled) settingsForm.requestSubmit();
  }
});

/* ---------- Init ---------- */
async function init() {
  try { state.hasSavedOnce = localStorage.getItem("lxo.configured") === "1"; } catch {}
  try {
    const status = await api.getSessionStatus();
    loadSettingsToForm(status.settings);
    setSessionUi(status.loggedIn);
    if (status.stats) statTotal.textContent = fmtNum(status.stats.totalSucceeded ?? 0);
    if (status.networkCounts) updateNetworkCountsUi(status.networkCounts);
  } catch (err) {
    appendLog(`Could not load status: ${err?.message || err}`);
    setSessionUi(false);
  }
}

api.onLog(appendLog);
init();
