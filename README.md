<p align="center">
  <img src="build/icon.png" alt="LinkXOrbit logo" width="120" />
</p>

<h1 align="center">LinkXOrbit</h1>

<p align="center">
  Windows desktop app to grow and tidy your LinkedIn network: sign in once, then automate <b>Connect</b> or <b>Unfollow</b> with human-like pacing.
</p>

<p align="center">
  <a href="https://github.com/cosmichackerx/LinkXOrbit/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/cosmichackerx/LinkXOrbit?label=download"></a>
  <a href="https://github.com/cosmichackerx/LinkXOrbit/actions/workflows/build-windows.yml"><img alt="Build" src="https://github.com/cosmichackerx/LinkXOrbit/actions/workflows/build-windows.yml/badge.svg"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0a66c2">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

---

## Features

- **One-time sign-in** – log in to LinkedIn (including 2FA) in a secure window. The session is saved locally on your PC only.
- **Two automation modes**
  - **Grow network** – opens *My Network → Grow* and sends **Connect** requests.
  - **Unfollow** – opens your *Followers* or *Following* list and unfollows accounts marked “Following”. “Follow” buttons are skipped.
- **Safe pacing** – random delay between a min and max you set, plus a per-run action limit and an estimated run time.
- **Weekly-limit detection** – stops automatically when LinkedIn shows the weekly invitation limit message.
- **Dashboard** – run status, live progress bar, this-run and all-time counters, and live follower/following counts.
- **Activity log** – timestamped, color-coded log with copy and clear.
- **Settings** – mode cards, inline validation, unsaved-changes bar (Ctrl+S to save). Settings are locked while a run is active.

## Download

1. Go to **[Releases](https://github.com/cosmichackerx/LinkXOrbit/releases/latest)**.
2. Download `LinkXOrbit-Setup-<version>.exe`.
3. Run the installer and follow the steps. Windows SmartScreen may warn because the installer isn’t code-signed. Choose **More info → Run anyway**.

Builds from every push to `main` are also available as **Artifacts** on the [Actions](https://github.com/cosmichackerx/LinkXOrbit/actions) page.

## Getting started

1. Launch **LinkXOrbit** from the Start menu or desktop shortcut.
2. **Sign in** – click *Sign in to LinkedIn*, finish login and 2FA, then close the LinkedIn window.
3. **Choose a mode** – open *Settings*, pick *Grow network* or *Unfollow*, adjust delays and limits, then *Save changes*.
4. **Start** – click *Start connecting* / *Start unfollowing* on the Dashboard. Use **Stop** at any time. The current action finishes first.

Defaults: 45–90 seconds between actions, up to 15 actions per run.

## Privacy

Your LinkedIn session, settings and counters are stored under your Windows user profile (Electron `userData`). Nothing is uploaded anywhere.

## Development

```powershell
npm ci
npm start          # build and run
npm run pack:win   # build the installer -> release/LinkXOrbit-Setup-<version>.exe
npm run icons      # regenerate build/icon.png + icon.ico from build/icon.svg
```

Tech: Electron + TypeScript, packaged with electron-builder (NSIS). Pushing a `v*` tag builds the installer and publishes a GitHub Release.

The installer is about 70–90 MB, which is typical for an Electron app.

## Disclaimer

Automating actions may conflict with [LinkedIn’s User Agreement](https://www.linkedin.com/legal/user-agreement). Use conservative limits and monitor your account. Restrictions or warnings are possible. This project is for personal and educational use, and you are responsible for how you use it.

## License

MIT
