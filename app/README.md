# AS Game Hub

A premium Windows game hub built around the supplied AS logo and banner.

## What changed in this version

- Scans Steam and Epic Games.
- Scans Xbox / Microsoft Store packaged games that Windows exposes through Start Apps.
- Detects common launcher entries from Ubisoft Connect, EA app, Battle.net, GOG Galaxy, Riot Client, Rockstar Games and other Windows game shortcuts.
- Checks Start Menu and Desktop shortcuts as a generic fallback for games from other launchers.
- **Add Game** lets you add any `.exe`, `.lnk`, or `.url` game manually when a launcher does not expose its library.
- Platform is shown on every game card.

## Run

1. Install Node.js LTS.
2. Open this folder in Command Prompt.
3. Run `npm install`.
4. Run `npm start`.

## Build portable EXE

Run:

```bat
npm run dist
```

The build will be created by electron-builder.

## Notes

Some Microsoft Store / Xbox games are protected by Windows and do not expose a normal `.exe` path. AS Game Hub launches those through their Windows App ID instead. If a game is not discoverable automatically, use **إضافة لعبة** and select its Windows shortcut or executable.
