// Finds the local Steam install and lists installed games. No API key needed:
// everything comes from Steam's own files (libraryfolders.vdf + appmanifest_*.acf).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Minimal parser for Valve's text KeyValues format (.vdf / .acf).
function parseVdf(text) {
  let i = 0;
  const skipWs = () => {
    while (i < text.length) {
      if (/\s/.test(text[i])) i++;
      else if (text[i] === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++;
      } else break;
    }
  };
  const readString = () => {
    if (text[i] === '"') {
      i++;
      let out = '';
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
          const n = text[++i];
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
        } else out += text[i];
        i++;
      }
      i++;
      return out;
    }
    let out = '';
    while (i < text.length && !/[\s{}"]/.test(text[i])) out += text[i++];
    return out;
  };
  const readObject = () => {
    const obj = {};
    for (;;) {
      skipWs();
      if (i >= text.length || text[i] === '}') {
        i++;
        return obj;
      }
      const key = readString();
      skipWs();
      if (text[i] === '{') {
        i++;
        obj[key] = readObject();
      } else obj[key] = readString();
    }
  };
  return readObject();
}

function readVdf(file) {
  try {
    return parseVdf(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function findSteamRoot(override) {
  const candidates = [];
  if (override) candidates.push(override);
  if (process.env.STEAM_PATH) candidates.push(process.env.STEAM_PATH);

  if (process.platform === 'win32') {
    try {
      const out = execFileSync(
        'reg',
        ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
        { encoding: 'utf8', windowsHide: true }
      );
      const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (m) candidates.push(m[1].trim());
    } catch {}
    candidates.push(
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(path.join(os.homedir(), 'Library/Application Support/Steam'));
  } else {
    candidates.push(
      path.join(os.homedir(), '.steam/steam'),
      path.join(os.homedir(), '.local/share/Steam'),
      path.join(os.homedir(), '.var/app/com.valvesoftware.Steam/.local/share/Steam')
    );
  }
  return candidates.find((c) => fs.existsSync(path.join(c, 'steamapps'))) || null;
}

function libraryDirs(root) {
  const dirs = new Set([path.join(root, 'steamapps')]);
  const vdf = readVdf(path.join(root, 'steamapps', 'libraryfolders.vdf'));
  const folders = vdf && (vdf.libraryfolders || vdf.LibraryFolders);
  if (folders) {
    for (const entry of Object.values(folders)) {
      // New format: { path: "...", ... }. Old format: "1" "D:\\SteamLibrary".
      const p = typeof entry === 'string' ? entry : entry && entry.path;
      if (p && fs.existsSync(path.join(p, 'steamapps'))) dirs.add(path.join(p, 'steamapps'));
    }
  }
  return [...dirs];
}

// Tools/runtimes that show up as "apps" but aren't games.
const NOT_GAMES = /^(Steamworks Common Redistributables|Steam Linux Runtime|Proton|SteamVR|Steam Controller Configs)/i;

// Steam keeps cover art in appcache/librarycache. Older clients use flat
// "<appid>_header.jpg"; newer ones use "<appid>/<hash>/<name>". Demos, playtests
// and prologues often only have some of the images, so take the best one found.
const PORTRAIT_ART = [/^library_600x900\.(jpg|png)$/i, /^library_capsule\.(jpg|png)$/i];
const WIDE_ART = [
  /^(library_)?header\.(jpg|png)$/i,
  /^capsule_616x353\.(jpg|png)$/i,
  /^library_capsule\.(jpg|png)$/i,
  /^capsule_.*\.(jpg|png)$/i,
  /^library_hero\.(jpg|png)$/i,
  /\.(jpg|jpeg)$/i,
];

function localArt(root, appid, priority) {
  const cache = path.join(root, 'appcache', 'librarycache');
  let best = null;
  let bestRank = priority.length;
  const consider = (name, full) => {
    if (/^logo/i.test(name)) return;
    const rank = priority.findIndex((re) => re.test(name));
    if (rank !== -1 && rank < bestRank) {
      best = full;
      bestRank = rank;
    }
  };
  // Flat layout: <appid>_header.jpg, <appid>_library_600x900.jpg, ...
  try {
    const prefix = `${appid}_`;
    for (const f of fs.readdirSync(cache)) {
      if (f.startsWith(prefix)) consider(f.slice(prefix.length), path.join(cache, f));
    }
  } catch {}
  // Nested layout: <appid>/<hash>/<name>
  try {
    const stack = [path.join(cache, String(appid))];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) stack.push(full);
        else consider(e.name, full);
      }
    }
  } catch {}
  return best;
}

function personaName(root) {
  const vdf = readVdf(path.join(root, 'config', 'loginusers.vdf'));
  const users = vdf && vdf.users;
  if (!users) return null;
  const all = Object.values(users);
  const recent = all.find((u) => u.MostRecent === '1') || all[0];
  return (recent && recent.PersonaName) || null;
}

function loadLibrary(steamPathOverride) {
  const root = findSteamRoot(steamPathOverride);
  if (!root) return { root: null, persona: null, games: [] };

  const games = [];
  const seen = new Set();
  for (const dir of libraryDirs(root)) {
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/.test(f));
    } catch {}
    for (const f of files) {
      const state = (readVdf(path.join(dir, f)) || {}).AppState;
      if (!state || !state.appid || !state.name || seen.has(state.appid)) continue;
      if (NOT_GAMES.test(state.name)) continue;
      seen.add(state.appid);
      games.push({
        appid: Number(state.appid),
        name: state.name,
        lastPlayed: Number(state.LastPlayed) || 0,
        sizeOnDisk: Number(state.SizeOnDisk) || 0,
        art: localArt(root, state.appid, WIDE_ART),
        portrait: localArt(root, state.appid, PORTRAIT_ART),
      });
    }
  }
  games.sort((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name));
  return { root, persona: personaName(root), games };
}

module.exports = { loadLibrary, parseVdf };
