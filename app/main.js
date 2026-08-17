const { app, BrowserWindow, ipcMain, desktopCapturer, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');

function runDetached(command, args = [], cwd = undefined) {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore', cwd, windowsHide: true, shell: false });
      child.once('error', reject);
      child.unref();
      resolve(true);
    } catch (e) { reject(e); }
  });
}

async function openProtocol(url) {
  // Windows is more reliable with Explorer for custom game protocols.
  return new Promise((resolve, reject) => {
    exec(`explorer.exe "${String(url).replace(/"/g, '\"')}"`, { windowsHide: true }, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
}

let mainWindow;
const dataDir = path.join(app.getPath('userData'), 'data');
const capturesDir = path.join(app.getPath('pictures'), 'AS Game Hub Captures');
const dataFile = path.join(dataDir, 'library.json');

function ensureData() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(capturesDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({ games: [], settings: { accent: 'blue', compact: false } }, null, 2), 'utf8');
  }
}

function readData() {
  ensureData();
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch { return { games: [], settings: { accent: 'blue', compact: false } }; }
}

function writeData(data) {
  ensureData();
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#050b17',
    title: 'AS Game Hub',
    icon: path.join(__dirname, 'assets', 'logo.webp'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');
}

function ps(script) {
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`,
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => resolve(err ? '' : stdout.trim()));
  });
}

async function scanSteam() {
  const games = [];
  const roots = [];
  const steamReg = await ps(`(Get-ItemProperty -Path 'HKCU:\\Software\\Valve\\Steam' -ErrorAction SilentlyContinue).SteamPath`);
  if (steamReg) roots.push(steamReg.replace(/\\/g, '/'));
  roots.push('C:/Program Files (x86)/Steam', 'C:/Program Files/Steam');
  const uniqueRoots = [...new Set(roots.filter(Boolean))];

  for (const root of uniqueRoots) {
    const lf = path.join(root, 'steamapps', 'libraryfolders.vdf');
    if (!fs.existsSync(lf)) continue;
    const text = fs.readFileSync(lf, 'utf8');
    const paths = [...text.matchAll(/"path"\s+"([^"]+)"/g)].map(m => m[1].replace(/\\\\/g,'/'));
    const libs = [...new Set([root, ...paths])];
    for (const lib of libs) {
      const steamapps = path.join(lib, 'steamapps');
      if (!fs.existsSync(steamapps)) continue;
      for (const f of fs.readdirSync(steamapps)) {
        if (!/^appmanifest_\d+\.acf$/i.test(f)) continue;
        const t = fs.readFileSync(path.join(steamapps, f), 'utf8');
        const name = (t.match(/"name"\s+"([^"]+)"/) || [,'Steam Game'])[1];
        const appid = (t.match(/"appid"\s+"(\d+)"/) || [,''])[1];
        const installdir = (t.match(/"installdir"\s+"([^"]+)"/) || [,''])[1];
        const installPath = installdir ? path.join(steamapps, 'common', installdir) : '';
        games.push({ id: `steam-${appid}`, name, platform:'Steam', appid, installPath, icon: null });
      }
    }
  }
  return games;
}

async function scanEpic() {
  const games = [];
  const programData = process.env.ProgramData || 'C:/ProgramData';
  const manifestsDir = path.join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  if (!fs.existsSync(manifestsDir)) return games;
  for (const f of fs.readdirSync(manifestsDir)) {
    if (!f.endsWith('.item')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(manifestsDir, f), 'utf8'));
      if (!j.DisplayName) continue;
      games.push({
        id: `epic-${j.AppName || f}`,
        name: j.DisplayName,
        platform:'Epic Games',
        installPath: j.InstallLocation || '',
        launchExecutable: j.LaunchExecutable || '',
        launchCommand: j.LaunchCommand || '',
        epicAppName: j.AppName || '',
        icon: null
      });
    } catch {}
  }
  return games;
}

async function scanXbox() {
  // Microsoft Store / Xbox games are packaged apps. Get-StartApps exposes their
  // launch IDs even when the executable lives inside the protected WindowsApps folder.
  const games = [];
  const raw = await ps(`Get-StartApps | Where-Object { $_.AppID -match '!' } | Select-Object Name,AppID | ConvertTo-Json -Compress`);
  if (!raw) return games;
  try {
    const items = JSON.parse(raw);
    const list = Array.isArray(items) ? items : [items];
    const ignore = /^(Xbox|Xbox Accessories|Xbox Game Bar|Microsoft Store|Microsoft 365|Photos|Mail|Calendar|Settings|Calculator|Clock|Camera|Clipchamp|Paint|Notepad|Snipping Tool|Spotify|Discord|Teams|WhatsApp)$/i;
    for (const item of list) {
      if (!item?.Name || !item?.AppID || ignore.test(item.Name)) continue;
      // Most Store/Xbox games expose a package-style AppID. Keep likely game entries,
      // while allowing any Store app to be manually retained after the first scan.
      if (!/Xbox|Game|Edition|Simulator|Racing|Football|FIFA|Forza|Halo|Minecraft|Gears|Flight|WWE|Call of Duty|Age of Empires|Sea of Thieves|Grounded|State of Decay|Killer Instinct|Ori|Psychonauts|Microsoft\.GamingApp/i.test(item.Name)) continue;
      games.push({
        id: `xbox-${item.AppID}`,
        name: item.Name,
        platform: 'Xbox / Microsoft Store',
        appId: item.AppID,
        installPath: '',
        launchType: 'appx',
        icon: null
      });
    }
  } catch {}
  return games;
}

async function scanStartMenuGames() {
  // Generic fallback for launchers that do not publish a public manifest.
  // We inspect Start Menu shortcuts and classify obvious game/launcher entries.
  const games = [];
  const roots = [
    path.join(process.env.ProgramData || 'C:/ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.USERPROFILE || '', 'Desktop'),
    path.join(process.env.PUBLIC || 'C:/Users/Public', 'Desktop')
  ].filter(Boolean);
  const gameWords = /game|gaming|launcher|battle\.net|blizzard|ubisoft|ea app|ea desktop|gog|riot|rockstar|minecraft|valorant|league of legends|fortnite|destiny|overwatch|diablo|warcraft|assassin|far cry|rainbow six|elden ring|red dead|grand theft auto|call of duty|apex|pubg|steam|epic games|xbox/i;
  const platformFor = name => {
    if (/battle\.net|blizzard/i.test(name)) return 'Battle.net';
    if (/ubisoft/i.test(name)) return 'Ubisoft Connect';
    if (/ea/i.test(name)) return 'EA app';
    if (/gog/i.test(name)) return 'GOG Galaxy';
    if (/riot/i.test(name)) return 'Riot Client';
    if (/rockstar/i.test(name)) return 'Rockstar Games';
    if (/minecraft/i.test(name)) return 'Xbox / Microsoft Store';
    return 'Other / Windows';
  };
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(full); continue; }
      if (!/\.lnk$/i.test(ent.name)) continue;
      const display = ent.name.replace(/\.lnk$/i, '');
      if (!gameWords.test(display)) continue;
      games.push({
        id: `shortcut-${full.toLowerCase()}`,
        name: display,
        platform: platformFor(display),
        shortcutPath: full,
        launchType: 'shortcut',
        icon: null
      });
    }
  };
  roots.forEach(walk);
  return games;
}

async function scanOtherLaunchers() {
  // A lightweight registry scan catches installed game launchers and many
  // standalone games that register themselves in Windows.
  const games = [];
  const raw = await ps(`Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and ($_.DisplayName -match 'Ubisoft|EA app|EA Desktop|Battle.net|GOG Galaxy|Rockstar Games|Riot Client|VALORANT|League of Legends|Minecraft Launcher') } | Select-Object DisplayName,InstallLocation,DisplayIcon,UninstallString | ConvertTo-Json -Compress`);
  if (!raw) return games;
  try {
    const items = JSON.parse(raw);
    const list = Array.isArray(items) ? items : [items];
    for (const item of list) {
      const name = String(item.DisplayName || '').trim();
      if (!name) continue;
      let platform = 'Other';
      if (/ubisoft/i.test(name)) platform = 'Ubisoft Connect';
      else if (/ea/i.test(name)) platform = 'EA app';
      else if (/battle\.net/i.test(name)) platform = 'Battle.net';
      else if (/gog/i.test(name)) platform = 'GOG Galaxy';
      else if (/riot|valorant|league/i.test(name)) platform = 'Riot Client';
      else if (/rockstar/i.test(name)) platform = 'Rockstar Games';
      else if (/minecraft/i.test(name)) platform = 'Xbox / Microsoft Store';
      games.push({ id: `registry-${name.toLowerCase()}`, name, platform, installPath: item.InstallLocation || '', launchType: 'registry', icon: null });
    }
  } catch {}
  return games;
}

async function scanGames() {
  const [steam, epic, xbox, shortcuts, other] = await Promise.all([scanSteam(), scanEpic(), scanXbox(), scanStartMenuGames(), scanOtherLaunchers()]);
  const discovered = [...steam, ...epic, ...xbox, ...shortcuts, ...other];
  const data = readData();
  const old = new Map(data.games.map(g => [g.id, g]));
  for (const g of discovered) {
    const prev = old.get(g.id);
    old.set(g.id, {
      ...g,
      totalSeconds: prev?.totalSeconds || 0,
      lastPlayed: prev?.lastPlayed || null,
      playCount: prev?.playCount || 0,
      favorite: prev?.favorite || false
    });
  }
  data.games = [...old.values()];
  writeData(data);
  return data.games;
}

function safeName(name) {
  return String(name).replace(/[<>:"/\\\\|?*]/g, '_').slice(0, 80);
}

ipcMain.handle('get-data', () => readData());
ipcMain.handle('scan-games', () => scanGames());
ipcMain.handle('save-data', (_, data) => writeData(data));
ipcMain.handle('open-folder', (_, p) => shell.openPath(p || app.getPath('documents')));
ipcMain.handle('open-url', (_, url) => shell.openExternal(url));

ipcMain.handle('pick-game', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'إضافة لعبة إلى AS Game Hub',
    properties: ['openFile'],
    filters: [
      { name: 'Windows Games / Apps', extensions: ['exe', 'lnk', 'url'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  const selected = result.filePaths[0];
  const ext = path.extname(selected).toLowerCase();
  const name = path.basename(selected, path.extname(selected));
  const data = readData();
  const game = {
    id: `manual-${selected.toLowerCase()}`,
    name,
    platform: 'Other / Windows',
    installPath: ext === '.exe' ? path.dirname(selected) : '',
    launchExecutable: ext === '.exe' ? path.basename(selected) : '',
    shortcutPath: ext === '.lnk' || ext === '.url' ? selected : '',
    launchType: ext === '.exe' ? 'exe' : 'shortcut',
    totalSeconds: 0,
    lastPlayed: null,
    playCount: 0,
    favorite: false,
    icon: null
  };
  const existing = data.games.findIndex(g => g.id === game.id);
  if (existing >= 0) data.games[existing] = { ...data.games[existing], ...game };
  else data.games.push(game);
  writeData(data);
  return { ok: true, game, games: data.games };
});

ipcMain.handle('launch-game', async (_, game) => {
  try {
    // Microsoft Store / Xbox packaged games
    if (game.launchType === 'appx' && game.appId) {
      await runDetached('explorer.exe', [`shell:AppsFolder\\${game.appId}`]);
      return { ok: true, mode: 'appx' };
    }

    // Windows shortcuts (.lnk / .url)
    if (game.launchType === 'shortcut' && game.shortcutPath) {
      const result = await shell.openPath(game.shortcutPath);
      if (result) throw new Error(result);
      return { ok: true, mode: 'shortcut' };
    }

    // Steam: launch the actual AppID, regardless of where the library is installed.
    if (game.platform === 'Steam' && game.appid) {
      await openProtocol(`steam://rungameid/${game.appid}`);
      return { ok: true, mode: 'steam' };
    }

    // Epic Games: always ask the Epic Games Launcher to start the game.
    // Directly running FortniteClient-Win64-Shipping.exe usually fails because
    // Epic authentication / anti-cheat setup must happen first.
    if (game.platform === 'Epic Games') {
      const appName = String(game.epicAppName || '').trim();
      if (appName) {
        const protocol = `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch&silent=true`;

        // First try Electron's native external-protocol handling.
        try {
          await shell.openExternal(protocol);
          return { ok: true, mode: 'epic-protocol' };
        } catch {}

        // Fallback for Windows installations where the protocol is registered
        // but Explorer is the component that handles it.
        try {
          await openProtocol(protocol);
          return { ok: true, mode: 'epic-protocol-explorer' };
        } catch {}
      }

      // Final fallback: locate EpicGamesLauncher.exe and open it.
      const epicCandidates = [
        path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'),
        path.join(process.env.ProgramFiles || 'C:/Program Files', 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Epic Games', 'Epic Games Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe')
      ];
      const launcher = epicCandidates.find(fs.existsSync);
      if (launcher) {
        try {
          await runDetached(launcher, [], path.dirname(launcher));
          // Give the launcher a moment to register/restore its protocol, then
          // ask it to launch the requested game.
          if (appName) {
            await new Promise(r => setTimeout(r, 1200));
            try { await shell.openExternal(`com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch&silent=true`); } catch {}
          }
          return { ok: true, mode: 'epic-launcher-fallback' };
        } catch {}
      }

      if (game.launchCommand) {
        exec(game.launchCommand, { windowsHide: true });
        return { ok: true, mode: 'command' };
      }
    }

    // Some launchers provide a direct command/protocol in their manifest.
    if (game.launchCommand) {
      const command = String(game.launchCommand).trim();
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(command)) {
        await openProtocol(command);
      } else {
        exec(command, { windowsHide: true });
      }
      return { ok: true, mode: 'command' };
    }

    // Direct executable supplied by the game manifest.
    if (game.installPath) {
      let exe = game.launchExecutable ? path.join(game.installPath, game.launchExecutable) : null;
      if (exe && fs.existsSync(exe)) {
        await runDetached(exe, [], game.installPath);
        return { ok: true, mode: 'exe' };
      }

      // If a launcher only gave us its install folder, look one level deep for an EXE.
      if (fs.existsSync(game.installPath)) {
        const candidates = [];
        const walk = (dir, depth) => {
          if (depth > 2 || candidates.length >= 20) return;
          let entries = [];
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
          for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) walk(full, depth + 1);
            else if (/\.exe$/i.test(ent.name) && !/(unins|uninstall|crash|updater|launcher)/i.test(ent.name)) candidates.push(full);
          }
        };
        walk(game.installPath, 0);
        if (candidates.length) {
          candidates.sort((a,b) => fs.statSync(b).size - fs.statSync(a).size);
          exe = candidates[0];
          await runDetached(exe, [], path.dirname(exe));
          return { ok: true, mode: 'exe-search' };
        }
      }

      const result = await shell.openPath(game.installPath);
      if (result) throw new Error(result);
      return { ok: true, mode: 'folder' };
    }

    // Last resort: ask Windows to open the game by name if it is registered.
    if (game.name) {
      exec(`start "" "${String(game.name).replace(/"/g, '')}"`, { windowsHide: true });
      return { ok: true, mode: 'windows-search' };
    }

    return { ok: false, error: 'لا يوجد مسار تشغيل معروف لهذه اللعبة.' };
  } catch (e) {
    return { ok:false, error: e.message || 'تعذر تشغيل اللعبة.' };
  }
});

ipcMain.handle('capture-screen', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    if (!sources.length) return { ok:false, error:'لم يتم العثور على الشاشة.' };
    const png = sources[0].thumbnail.toPNG();
    const filename = `AS-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
    const out = path.join(capturesDir, filename);
    fs.writeFileSync(out, png);
    return { ok:true, path:out };
  } catch(e) { return { ok:false, error:e.message }; }
});

ipcMain.handle('get-capture-folder', () => capturesDir);

app.whenReady().then(() => {
  ensureData();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
