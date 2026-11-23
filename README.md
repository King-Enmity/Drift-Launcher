# DRIFT

**Games live on.**

Drift is a Windows-first, community-oriented PC game launcher. The goal is to organize locally installed games and eventually let players import profiles for community-operated multiplayer backends.

## Current development build (v0.1.0)

- Dark, responsive library UI with game cards and a game detail panel.
- Add an installed game with an executable path and optional artwork URL / Steam App ID.
- Persist local library data in Drift's app data folder.
- Launch local executable files from the desktop app.
- Import data-only JSON / `.gprofile` files and switch profiles per game.
- Reject launch profiles that require unsupported native adapters.

**Not implemented yet:** automatic Steam scanning, automatic Steam metadata/artwork retrieval, installable native adapters, user accounts, game downloads, and multiplayer server redirection. Importing a profile does not automatically reroute a game's connection.

## Development setup

Use the **`development`** branch. On Windows, install Node.js, Rust, Microsoft C++ Build Tools, and the Tauri prerequisites (WebView2).

```powershell
git clone https://github.com/King-Enmity/Drift-Launcher.git
cd Drift-Launcher
git switch development
npm install
npm run tauri dev
```

For a frontend-only preview, run `npm run dev`. Browser previews use localStorage and **cannot launch native games**. `npm run build` validates TypeScript and bundles the frontend. Native packaging, code signing and CI are not yet configured.

## Release branches

- `development` — active feature development.
- `coming-soon` — preview and release-candidate testing.
- `stable` — tested releases.
- `main` — original bootstrap branch.

Promote reviewed changes from `development` to `coming-soon` to `stable` using pull requests; see [branching guide](docs/BRANCHING.md).

## Security model

Community profiles are data, never executable code. Importing profiles does not download or run adapters. Future native adapters must be installed separately with explicit user consent and publisher transparency. Only add executables and profiles you trust. Drift never bundles game binaries or modifies game installations.

See [draft profile specification](docs/PROFILE-SPEC.md).
