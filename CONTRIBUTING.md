# Contributing to LinkXOrbit

Thanks for helping! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs
Open an [issue](https://github.com/cosmichackerx/LinkXOrbit/issues/new/choose) using the **Bug report** template. Include:
- Your LinkXOrbit version and Windows version
- The mode you ran (Grow or Unfollow, Followers or Following)
- Lines from the **Activity log** (use the Copy button)

LinkedIn changes its pages often. A screenshot of the page where it got stuck helps a lot.

## Development setup
```powershell
git clone https://github.com/cosmichackerx/LinkXOrbit.git
cd LinkXOrbit
npm ci
npm start
```

| Path | What it is |
| --- | --- |
| `src/main/` | Electron main process: windows, IPC, automation scripts |
| `src/preload/` | Safe bridge between the UI and the main process |
| `src/renderer/` | The app UI (HTML, CSS, JS) |
| `build/` | Icons and installer resources |

## Pull requests
1. Fork the repo and create a branch from `main`.
2. Keep changes focused, and run `npm run build` before pushing.
3. Describe what changed and how you tested it.

Please be respectful. See the [Code of Conduct](CODE_OF_CONDUCT.md).
