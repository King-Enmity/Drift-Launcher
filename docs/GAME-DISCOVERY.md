# Drift discovery and metadata architecture

## Implemented (development)

- `discovery::scan_installed_games` is a read-only native command returning source, source ID, title, optional Steam App ID, installation location, and (for Epic) a manifest-provided launch executable.
- Steam game discovery reads library locations and Steam's app manifests. No Steam credentials, account login or API key are required. Steam manages execution using the Steam App ID.
- Epic Games discovery reads installation records in the Windows ProgramData Epic Games Launcher manifest folder. No account authentication is required. The recorded executable is only a starting point; Epic ownership/DRM-dependent launches may need an official launcher command or integration later.
- `steam::search_steam_games` queries public Steam Store suggestions. Users must confirm a cross-store match. There is no automatic fuzzy matching or silent change to the original launch provider.
- `steam::fetch_steam_metadata` fetches Steam Store artwork, screenshots, trailers and descriptions. The public storefront endpoints can change or rate-limit requests; metadata is not guaranteed.
- Imported game identity and store source are separate from `steamAppId`, which may exist solely for metadata on an Epic game.

## Provider contract (planned)

Discovery providers expose `scan()` and eventually `launch()`, `refresh()`, `watch()`. Every discovery result should have a stable `source:sourceId` identity, installation directory, launch capability, and optional game references. Sources should not request launcher passwords or store cloud credentials just to scan installed games.

Metadata providers expose `search(title, hints)`, `fetch(providerGameId)`, and `artwork(providerGameId)`. Source priorities are:

1. User-provided custom artwork and community profile overrides.
2. Verified native-store metadata (Steam App ID when a Steam game is discovered).
3. User-confirmed cross-store mapping to Steam metadata.
4. Future IGDB metadata lookup and SteamGridDB artwork enrichment where authorized.
5. Manual selection.

Only exact trusted identifiers trigger automatic matches. If more than one plausible result is found, show choices and require the user to pick. Metadata should be cached and refreshable, respecting provider limits and license obligations.

## Planned providers

- Ubisoft Connect: registry and local installation records, plus supported URI launch method.
- EA app, GOG Galaxy and Battle.net: respective local installation records and supported launch methods.
- IGDB: requires OAuth and API access; avoid bundling any client secret in the executable.
- SteamGridDB: requires an API key; clarify registration/licensing and protect user-provided credentials.

## Security and release notes

No game file modifications, bulk executable scanning, launcher password access or implicit community adapter execution. The scan command is user-initiated and reads only known manifest locations. Metadata from third parties remains untrusted and should never execute scripts. Preserve existing local library records and community profiles when importing discoveries. Do not claim game ownership, online entitlement, launch success, or compatibility solely from local manifest presence.

Future quality checks: integration tests with sample Steam VDF/ACF and Epic item files, duplicate detection across renamed games, false matches, Epic launch protocol, and source-specific metadata caching.
