const { app, BrowserWindow, ipcMain, net, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadLibrary } = require('./steam');

const DEMO = process.argv.includes('--demo');

// Optional config.json next to the exe (or the project root when run from source):
//   { "steamPath": "D:\\Steam", "name": "Display name override" }
function readConfig() {
  const dirs = [process.env.PORTABLE_EXECUTABLE_DIR, path.dirname(process.execPath), app.getAppPath()];
  for (const d of dirs.filter(Boolean)) {
    try {
      return JSON.parse(fs.readFileSync(path.join(d, 'config.json'), 'utf8'));
    } catch {}
  }
  return {};
}

const DEMO_GAMES = [
  [620, 'Portal 2'], [105600, 'Terraria'], [413150, 'Stardew Valley'], [1145360, 'Hades'],
  [945360, 'Among Us'], [367520, 'Hollow Knight'], [504230, 'Celeste'], [268910, 'Cuphead'],
  [1794680, 'Vampire Survivors'], [730, 'Counter-Strike 2'], [440, 'Team Fortress 2'],
  [292030, 'The Witcher 3: Wild Hunt'],
].map(([appid, name], i) => ({ appid, name, lastPlayed: 1e9 - i, sizeOnDisk: 0, art: null }));

// Decoy tile: looks like Adopt Me! (art is fetched from Roblox's public thumbnail
// API at startup). Pressing Play on it launches a real Steam game instead.
const ADOPT_ME_UNIVERSE = 383310974;

async function robloxJson(url) {
  try {
    const res = await net.fetch(url, { signal: AbortSignal.timeout(4000) });
    return (await res.json()).data || [];
  } catch {
    return [];
  }
}

async function adoptMeArt() {
  const base = 'https://thumbnails.roblox.com/v1/games';
  const [icons, thumbs] = await Promise.all([
    robloxJson(`${base}/icons?universeIds=${ADOPT_ME_UNIVERSE}&size=512x512&format=Png&isCircular=false`),
    robloxJson(`${base}/multiget/thumbnails?universeIds=${ADOPT_ME_UNIVERSE}&countPerUniverse=1&size=768x432&format=Png&isCircular=false`),
  ]);
  const ok = (t) => (t && t.state === 'Completed' && t.imageUrl) || null;
  return {
    portrait: ok(icons[0]),
    art: ok(thumbs[0] && thumbs[0].thumbnails && thumbs[0].thumbnails[0]),
  };
}

ipcMain.handle('library', async () => {
  const cfg = readConfig();
  const [lib, decoyArt] = await Promise.all([
    Promise.resolve(DEMO ? { persona: 'Player', games: DEMO_GAMES } : loadLibrary(cfg.steamPath)),
    adoptMeArt(),
  ]);
  const real = lib.games.map((g) => ({
    ...g,
    art: g.art ? pathToFileURL(g.art).href : null,
    portrait: g.portrait ? pathToFileURL(g.portrait).href : null,
  }));
  const decoy = {
    decoy: true,
    appid: 920587237,
    name: 'Adopt Me!',
    by: 'Uplift Games',
    likes: 92,
    players: 187000,
    visits: '40B+',
    serverSize: 48,
    lastPlayed: 4e9,
    ...decoyArt,
    // What Play really launches: config "decoyAppId", else her most recent game.
    decoyTarget: cfg.decoyAppId || (real[0] && real[0].appid) || null,
  };
  return { persona: cfg.name || lib.persona || 'Player', games: [decoy, ...real] };
});

// Last-resort art lookup: ask the Steam store for the app's real image URL
// (covers apps whose images live under hashed CDN paths, e.g. many demos).
const storeArtCache = new Map();
ipcMain.handle('storeArt', async (_e, appid) => {
  if (!/^\d+$/.test(String(appid))) return null;
  if (storeArtCache.has(appid)) return storeArtCache.get(appid);
  let url = null;
  try {
    const res = await net.fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = (await res.json())[appid];
    const d = data && data.success && data.data;
    url = (d && (d.header_image || d.capsule_image)) || null;
  } catch {}
  storeArtCache.set(appid, url);
  return url;
});

ipcMain.handle('launch', (_e, appid) => {
  if (!/^\d+$/.test(String(appid))) return;
  return shell.openExternal(`steam://rungameid/${appid}`);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Roblox',
    backgroundColor: '#121214',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.on('page-title-updated', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
