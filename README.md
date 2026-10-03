# Robloxsteam

A prank launcher. It looks like the Roblox home screen, but every "experience" is one of the Steam games installed on the PC.
Click a game, hit the green **Play** button, get a "Starting Roblox..." splash, and the Steam game launches.

It only reads Steam's local files (`libraryfolders.vdf`, `appmanifest_*.acf`, `loginusers.vdf`). It needs no login or API key, and it never touches the real Roblox install.

## Run it

```
npm install
npm run demo     # sample games, works without Steam
npm start        # reads the real Steam library
```

## Get a Windows .exe

Either run `npm run dist` on Windows (output: `dist/RobloxPlayer.exe`, a portable single file), or use the **Build Windows exe** GitHub Action (Actions tab, Run workflow) and download the `RobloxPlayer` artifact.

Tips for the full effect: put the exe on her desktop, rename it, and give the shortcut a Roblox-y name.

## Config (optional)

Create `config.json` next to the exe:

```json
{ "steamPath": "D:\\Steam", "name": "Her Name", "decoyAppId": 1145360 }
```

- `steamPath`: only needed if Steam isn't auto-detected.
- `name`: overrides the Steam display name used in the greeting.
- `decoyAppId`: the Steam app id that the fake **Adopt Me!** tile really launches. Defaults to her most recently played game.

## The Adopt Me! decoy

The first tile is a fake **Adopt Me!** entry. Its images are fetched from Roblox's public thumbnail API when the launcher starts (it falls back to a plain title card if she's offline). Pressing Play on it shows the normal "Starting Roblox..." splash, then launches a real Steam game (see `decoyAppId`).

## Notes

- Like %, player counts and visits are fake (stable per game).
- Only the Home page and game pages work; the sidebar and top links are decorative.
- Cover art comes from Steam's local cache, then the Steam CDN.
- Only games installed on the PC show up.
