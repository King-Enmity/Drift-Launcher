# Drift release channels

| Branch | Purpose | Promotion |
| --- | --- | --- |
| `development` | Active work and experiments | Feature branches merge here |
| `coming-soon` | Preview and release-candidate testing | PR from development after QA |
| `stable` | Tested builds only | PR from coming-soon after release QA |

The `main` branch holds the original repository bootstrap; use `development` as the working base when cloning. Do not commit directly to `stable`. Branch protections and default-branch selection must be configured in GitHub Settings if desired.

## Local checkout

```bash
git clone https://github.com/King-Enmity/Drift-Launcher.git
cd Drift-Launcher
git switch development
npm install
npm run tauri dev
```

Requires Node.js, Rust and Tauri's Windows prerequisites (Microsoft C++ Build Tools and WebView2). Run `npm run build` for a frontend-only build; only `npm run tauri dev` enables native game launching.
