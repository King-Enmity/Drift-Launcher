# Drift profile format — draft v0.2

Drift profiles are portable **data-only JSON** files with a `.gprofile` or `.json` extension. The launcher imports them through Game Options → Community Profiles.

A game always retains its own official Steam metadata. The built-in **Default** profile presents that metadata unchanged. A community profile may optionally customize the **presentation**, without replacing or modifying the stored Steam metadata. Changing profiles immediately changes the game page, not the game files.

## Example: hypothetical New World community

This is **not an official or working Project Azoth profile**. It illustrates how a community such as Azoth could customize its game page in Drift once it publishes a compatible profile and game-specific adapter.

```json
{
  "schemaVersion": 1,
  "profile": {
    "id": "example.newworld-community",
    "name": "Example New World Community",
    "version": "1.0.0",
    "publisher": "Example Community"
  },
  "game": { "steamAppId": 1063730, "name": "New World: Aeternum" },
  "launch": { "adapter": "newworld-community", "args": [] },
  "connection": { "host": "play.example.invalid", "port": 7777 },
  "client": {
    "buildLabel": "1.400.6031.6004151",
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "presentation": {
    "title": "New World — Example Community",
    "description": "Explore Aeternum with our community's own progression and events.",
    "descriptionMode": "replace",
    "heroImage": "https://example.com/assets/hero.jpg",
    "headerImage": "https://example.com/assets/header.jpg",
    "website": "https://example.com",
    "screenshotsMode": "append",
    "screenshots": ["https://example.com/assets/community-screenshot.jpg"],
    "trailersMode": "append",
    "trailers": [
      {
        "name": "Community overview",
        "url": "https://example.com/media/trailer.mp4",
        "format": "mp4",
        "thumbnail": "https://example.com/assets/trailer.jpg"
      }
    ]
  }
}
```

URLs and the SHA-256 above are illustrative placeholders. They will not resolve or launch a game. An actual adapter publisher must provide a trustworthy fingerprint for the exact executable it supports.

## Presentation options

| Field | Behavior |
| --- | --- |
| `title` | Override the displayed title only while this profile is selected |
| `description` | Override the game summary; does not edit official Steam metadata |
| `descriptionMode` | `replace` (default when description provided) hides original about-game text, or `append` keeps original about-game text below the community summary |
| `heroImage` | Community banner, or Steam banner if absent |
| `headerImage` | Community detail artwork, or Steam artwork if absent |
| `website` | Clearly labeled link to the community website |
| `screenshots` | Up to 30 HTTPS image URLs |
| `trailers` | Up to 12 HTTPS video URLs, optional thumbnails, `format` `mp4` or `hls` |
| `screenshotsMode`, `trailersMode` | `inherit` ignores custom media, `append` combines and de-duplicates, and `replace` uses only community media; defaults to `append` |

If `screenshots` or `trailers` is absent, Drift inherits Steam media. With `replace`, an explicit empty array clears that media section for the selected profile. Custom items and default Steam items remain separately identifiable; publisher and official release information still come from Steam.

All community customizations are displayed as community content. Do not imply that a community operates the original game's official services.

## Multiple game-client installations

One Drift game can have multiple locally registered clients. Under Game Options → Community Profiles → Game Client, the player can register additional executable paths, assign one to each profile, and check its executable fingerprint. Each client entry is only a reference to an existing file: Drift does not duplicate or download the game, replace assets, change versions, or delete files.

Optional `client` manifest fields:

| Field | Meaning |
| --- | --- |
| `buildLabel` | Human-readable version required by a community, such as `1.400.6031.6004151`. Informational, **not** independently verified |
| `sha256` | Exact 64-character SHA-256 of the required game executable. Drift hashes the selected file before launch and refuses a mismatch |

If no checksum is supplied, Drift cannot prove the build matches and makes that clear in the UI. A profile requesting an unavailable installation must be manually reassigned; Drift never silently falls back to another installed version.

The developer's `.gprofile` never contains the player's machine-specific paths. Profiles declare compatibility; players assign local installations to them. The normal Default profile continues to use the original game's executable unless explicitly reassigned.

This verifies only the chosen executable. Game data/asset compatibility, manifest verification, file isolation, and custom adapter logic require later integration work. An exact executable hash is not proof that a community adapter itself is safe.

## Launch behavior and security

A presentation package **does not install a native adapter** or connect a game to a new server merely by declaring `host`. Unsupported adapters will not run. Native adapter support requires a separate security design and explicit installation consent.

Only HTTPS media and website URLs are permitted. Profile imports enforce length and item-count limits and never evaluate scripts. Media files are loaded remotely and should only be distributed when their publishers have the rights to use them. External network resources may be unavailable or disallow playback.

The profile specification is a development draft and may change before the first public SDK release.
