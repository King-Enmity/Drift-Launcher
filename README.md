# DRIFT

**Games live on.**

Drift is a Windows-first, community-oriented PC game launcher. The goal is to organize locally installed games and eventually let players import profiles for community-operated multiplayer backends.

## Current development build (v0.1.0)

- Steam-inspired library layout: compact left game list, large game banner and a Play strip, with Drift branding.
- Add an installed game with an executable path and optional Steam App ID.
- Persist local library data in Drift's app data folder.
- Launch local executable files from the desktop app. The Default profile uses Steam's registered launch protocol for games with a Steam App ID unless you switch its launch method to Direct in Game Properties.
- Automatically request available Steam Store metadata (game description, artwork, trailers and screenshots) when an App ID is provided. Refresh an existing game with the toolbar icon or Game Properties. Steam's public Store endpoint may be unavailable or rate-limited; metadata is not guaranteed.
- Import data-only JSON / `.gprofile` files and switch profiles per game through Game Options → Community Profiles.
- Reject launch profiles that require unsupported native adapters.

**Not implemented yet:** automatic Steam scanning, installable native adapters, user accounts, game downloads, and multiplayer server redirection. Importing a profile does not automatically reroute a game's connection.

## Development setup

Use the **`development`** branch. On Windows, install Node.js, Rust, Microsoft C++ Build Tools, and the Tauri prerequisites (WebView2).

```powershell
git clone https://github.com/King-Enmity/Drift-Launcher.git
cd Drift-Launcher
git switch development
npm install
npm run tauri dev
```

For a frontend-only preview, run `npm run dev`. Browser previews use localStorage and **cannot launch native games**. `npm run build` validates TypeScript and bundles the frontend. Windows and frontend CI compile checks are configured; code signing and distributable installers are not yet configured.

## Release branches

- `development` — active feature development.
- `coming-soon` — preview and release-candidate testing.
- `stable` — tested releases.
- `main` — original bootstrap branch.

Promote reviewed changes from `development` to `coming-soon` to `stable` using pull requests; see [branching guide](docs/BRANCHING.md).

## Security model

Community profiles are data, never executable code. Importing profiles does not download or run adapters. Future native adapters must be installed separately with explicit user consent and publisher transparency. Only add executables and profiles you trust. Drift never bundles game binaries or modifies game installations.

See [draft profile specification](docs/PROFILE-SPEC.md).

## Launch methods

For Steam games, Drift's built-in **Default** profile requests a launch using `steam://run/<APP_ID>` (for example, `steam://run/1063730` for New World). Steam chooses its installed game build and configured launch method, including any required launcher. This requires Steam to be installed and the game to be available in the player's Steam library. A successful URI dispatch is not proof the game actually started. In **Game Options → Game Properties** you can select **Direct executable** instead.

Community profiles retain their own selected client files and SHA-256 compatibility checks. Drift does not silently redirect an older community client through Steam, because Steam might launch a different version than the profile requires. Profile-specific Steam adapter integration is future work.
