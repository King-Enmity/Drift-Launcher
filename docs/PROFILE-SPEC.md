# Drift profile format (draft v0.1)

Drift profiles are **data only**. They do not execute embedded scripts or download arbitrary binaries. An imported profile must match an existing game. A profile may specify alternate executable, working directory and launch arguments. Community-specific host metadata is displayed, but does **not** cause network redirection unless a future trusted adapter supports that game.

Example:

```json
{
  "schemaVersion": 1,
  "profile": { "id": "example.community", "name": "Example Community", "version": "1.0.0", "publisher": "Example" },
  "game": { "steamAppId": 1063730, "name": "New World" },
  "launch": { "adapter": "standard", "args": [] },
  "connection": { "host": "play.example.invalid", "port": 7777 }
}
```

All addresses are illustrative. Importing an advanced profile is not equivalent to installing a native adapter; unsupported adapters will not be run. The importer enforces a small JSON file size limit and never evaluates profile content as code.

## Planned future adapter contract

We intend to define a versioned subprocess protocol with explicit installation, publisher identity, user consent, installation checks and restricted capabilities. No native community adapter execution is implemented in v0.1.
