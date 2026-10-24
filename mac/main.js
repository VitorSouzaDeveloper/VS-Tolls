const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createServer } = require('./server');

const { getSystemInfo } = require('./services/systemInfo');
const { getSensorSnapshot } = require('./services/sensors');
const { getDisksHealth } = require('./services/disks');
const { runNetworkDiagnostics } = require('./services/network');
const { getInstalledMacGames, calculateEstimatedFps, analyzeBottleneck, launchGame } = require('./services/gameLibrary');
const { runMemoryBench, runDiskBench, runGameSimBench, runCpuPathTracerPass } = require('./services/benchmarks');
const { stressManager } = require('./services/stressTest');
const { getRunningSafeProcesses, closeProcess, cleanMemoryAndCaches, getTweaksStatus, setTweak, restoreAllDefaults } = require('./services/optimizer');
const { getStartupItems, toggleStartupItem, removeStartupItem } = require('./services/startupManager');
const { getInstalledStatus, installApp } = require('./services/appInstaller');
const { scanSerialPorts, releaseLockedPort } = require('./services/maker');
const { exportReportToFile } = require('./services/reportBuilder');
const { getAutoStartStatus, setAutoStart } = require('./services/autostart');

let mainWindow = null;
let widgetWindow = null;
let localServer = null;

function createMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1120,
    minHeight: 660,
    title: 'VS Tolls',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#0c0d10',
    icon: path.join(__dirname, 'assets', 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createWidgetWindow(pinToDesktop = false) {
  if (widgetWindow) {
    widgetWindow.show();
    widgetWindow.focus();
    return widgetWindow;
  }

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  const widgetWidth = 330;
  const widgetHeight = 220;
  const x = Math.max(20, screenWidth - widgetWidth - 24);
  const y = 48;

  widgetWindow = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: true,
    alwaysOnTop: !pinToDesktop,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  widgetWindow.loadFile(path.join(__dirname, 'public', 'widget.html'));

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });

  return widgetWindow;
}

// Register IPC handlers
ipcMain.handle('get-system-info', () => getSystemInfo());
ipcMain.handle('get-sensors', () => getSensorSnapshot());
ipcMain.handle('get-disks', () => getDisksHealth());
ipcMain.handle('get-network', (e, full) => runNetworkDiagnostics(full));
ipcMain.handle('get-games', () => getInstalledMacGames());
ipcMain.handle('get-estimated-fps', (e, res, preset, mfx) => calculateEstimatedFps('Apple M1 Pro', res, preset, mfx));
ipcMain.handle('run-memory-bench', () => runMemoryBench());
ipcMain.handle('run-disk-bench', () => runDiskBench(128));
ipcMain.handle('run-game-sim-bench', () => runGameSimBench(2000));
ipcMain.handle('run-cpu-path-tracer', (e, multi) => runCpuPathTracerPass(multi, 2500));
ipcMain.handle('start-stress', (e, type, maxTemp) => stressManager.start(type, maxTemp, 300));
ipcMain.handle('stop-stress', () => stressManager.stop());
ipcMain.handle('get-stress-status', () => stressManager.getStatus());
ipcMain.handle('clean-memory', () => cleanMemoryAndCaches());
ipcMain.handle('get-tweaks', () => getTweaksStatus());
ipcMain.handle('set-tweak', (e, id, val) => setTweak(id, val));
ipcMain.handle('restore-tweaks', () => restoreAllDefaults());
ipcMain.handle('get-startup', () => getStartupItems());
ipcMain.handle('toggle-startup', (e, p, val) => toggleStartupItem(p, val));
ipcMain.handle('remove-startup', (e, p) => removeStartupItem(p));
ipcMain.handle('get-apps', () => getInstalledStatus());
ipcMain.handle('install-app', (e, id) => new Promise((resolve) => {
  installApp(id, null, (err, success) => resolve({ success: !err && success, error: err ? err.message : null }));
}));
ipcMain.handle('get-serial-ports', () => scanSerialPorts());
ipcMain.handle('release-serial-port', (e, p) => releaseLockedPort(p));
ipcMain.handle('export-report', (e, format) => exportReportToFile(format));

// Widget & AutoStart IPCs
ipcMain.handle('open-widget', () => {
  createWidgetWindow();
  return { success: true };
});
ipcMain.handle('close-widget', () => {
  if (widgetWindow) widgetWindow.close();
  return { success: true };
});
ipcMain.handle('toggle-widget-pin', (e, pinned) => {
  if (!widgetWindow) return { success: false };
  widgetWindow.setAlwaysOnTop(!pinned);
  return { success: true, pinned };
});
ipcMain.handle('open-main', () => {
  createMainWindow();
  return { success: true };
});
ipcMain.handle('get-autostart-status', () => getAutoStartStatus());
ipcMain.handle('set-autostart', (e, enable, widgetOnly) => setAutoStart(enable, widgetOnly));

app.whenReady().then(() => {
  // Start local fallback server on port 3000
  try {
    localServer = createServer(3000);
    localServer.server.on('error', (err) => {
      console.log(`[VS Tolls] Porta 3000 ocupada (${err.code}). Continuando em modo nativo via IPC.`);
    });
    localServer.listen(() => {
      console.log('VS Tolls local API server running on port 3000');
    });
  } catch (err) {
    console.log('[VS Tolls] Servidor local não iniciado. Operando em modo nativo via IPC.');
  }

  const isWidgetOnly = process.argv.includes('--widget-only');
  if (isWidgetOnly) {
    createWidgetWindow(true);
  } else {
    createMainWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
