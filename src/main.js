const { app, BrowserWindow, ipcMain, shell } = require('electron');
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

ipcMain.handle('library', () => {
  const cfg = readConfig();
  const lib = DEMO ? { persona: 'Player', games: DEMO_GAMES } : loadLibrary(cfg.steamPath);
  return {
    persona: cfg.name || lib.persona || 'Player',
    games: lib.games.map((g) => ({ ...g, art: g.art ? pathToFileURL(g.art).href : null })),
  };
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
