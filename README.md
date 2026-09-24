# LinkedIn Connect (Windows desktop)

Desktop app for **Windows 11** that:

1. Lets you **sign in to LinkedIn once** in an embedded browser window.
2. **Saves your session** locally (persistent Electron profile — same idea as staying logged in in a browser).
3. Opens [My Network → Grow](https://www.linkedin.com/mynetwork/grow/) and clicks **Connect** on suggestions, with configurable delays and a per-run limit.

## Download (recommended)

Pre-built installers are produced by GitHub Actions:

1. Open **[Actions](https://github.com/cosmichackerx/linkedin-connection-automation/actions)** on this repo.
2. Open the latest **Build Windows installer** workflow run (green check).
3. Under **Artifacts**, download **LinkedIn-Connect-Windows-Setup**.
4. Run `LinkedIn-Connect-Setup-1.0.0.exe` on your PC and follow the installer.

Tagged releases (`v*`) also attach the same `.exe` to a GitHub Release.

## First use on your laptop

1. Launch **LinkedIn Connect** from the Start menu or desktop shortcut.
2. Click **Sign in to LinkedIn**, complete login (and 2FA if prompted), then **close** the LinkedIn window.
3. Adjust **Settings** if you want (defaults: 45–90s between connects, max 15 per run).
4. Click **Start connecting**. A LinkedIn window opens on the grow page; you can watch progress in the app log.
5. Use **Stop** anytime.

If LinkedIn shows the **weekly connection invitation limit** toast (“was not sent because you have reached the weekly limit…”), the app **detects it and auto-stops** so you do not keep clicking in vain.

Session files live under your Windows user profile (Electron `userData` path shown in the app after sign-in). They are **not** uploaded to GitHub.

## Build locally (Windows)

```bash
npm ci
npm run pack:win
```

Installer output: `release/LinkedIn-Connect-Setup-1.0.0.exe`

## Development

```bash
npm ci
npm start
```

## Important

Automating connection requests may conflict with [LinkedIn’s User Agreement](https://www.linkedin.com/legal/user-agreement). Use conservative limits, monitor your account, and accept that restrictions or warnings are possible. This project is for personal/educational use; you are responsible for how you use it.

## Repository

Private repo: [cosmichackerx/linkedin-connection-automation](https://github.com/cosmichackerx/linkedin-connection-automation)
