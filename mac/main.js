const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
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
const activeWidgets = {};
let isWidgetsFloating = false; // Default: Pinned to Desktop (Wallpaper level)
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

function createWidgetWindow(type = 'overview', pinToDesktop = true) {
  if (activeWidgets[type] && !activeWidgets[type].isDestroyed()) {
    activeWidgets[type].show();
    activeWidgets[type].focus();
    return activeWidgets[type];
  }

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  let widgetWidth = 330;
  let widgetHeight = 220;
  let x = Math.max(20, screenWidth - widgetWidth - 24);
  let y = 48;

  if (type === 'bar') {
    widgetWidth = 340;
    widgetHeight = 52;
    x = Math.max(20, screenWidth - widgetWidth - 24);
    y = 48;
  } else if (type === 'battery') {
    widgetWidth = 210;
    widgetHeight = 195;
    x = Math.max(20, screenWidth - widgetWidth - 24);
    y = activeWidgets['overview'] ? 280 : 48;
  } else if (type === 'memory') {
    widgetWidth = 230;
    widgetHeight = 195;
    x = Math.max(20, screenWidth - widgetWidth - 24);
    y = activeWidgets['overview'] ? 280 : 48;
  }

  const shouldBeOnTop = !pinToDesktop || isWidgetsFloating;

  const win = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: true,
    alwaysOnTop: shouldBeOnTop,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.loadFile(path.join(__dirname, 'public', 'widget.html'), { query: { type } });

  win.on('closed', () => {
    delete activeWidgets[type];
    notifyWidgetStateChange();
  });

  activeWidgets[type] = win;
  notifyWidgetStateChange();
  return win;
}

function closeWidgetWindow(type = 'overview') {
  if (activeWidgets[type] && !activeWidgets[type].isDestroyed()) {
    activeWidgets[type].close();
    delete activeWidgets[type];
    notifyWidgetStateChange();
    return { success: true, type };
  }
  return { success: false, type };
}

function toggleWidgetsFloating(forceState = null) {
  isWidgetsFloating = forceState !== null ? forceState : !isWidgetsFloating;
  for (const [type, win] of Object.entries(activeWidgets)) {
    if (win && !win.isDestroyed()) {
      if (isWidgetsFloating) {
        win.setAlwaysOnTop(true, 'floating', 1);
        win.moveTop();
      } else {
        win.setAlwaysOnTop(false);
      }
      try {
        win.webContents.send('widget-floating-change', { isFloating: isWidgetsFloating, type });
      } catch (e) {}
    }
  }
  notifyWidgetStateChange();
  return isWidgetsFloating;
}

function notifyWidgetStateChange() {
  const status = getWidgetsStatus();
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('widgets-status-update', status);
    } catch (e) {}
  }
}

function getWidgetsStatus() {
  return {
    isFloating: isWidgetsFloating,
    active: {
      overview: !!(activeWidgets['overview'] && !activeWidgets['overview'].isDestroyed()),
      bar: !!(activeWidgets['bar'] && !activeWidgets['bar'].isDestroyed()),
      battery: !!(activeWidgets['battery'] && !activeWidgets['battery'].isDestroyed()),
      memory: !!(activeWidgets['memory'] && !activeWidgets['memory'].isDestroyed())
    }
  };
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

// Multi-Widget & Floating IPCs
ipcMain.handle('open-widget', (e, type) => {
  createWidgetWindow(type || 'overview', !isWidgetsFloating);
  return { success: true, type: type || 'overview' };
});
ipcMain.handle('close-widget', (e, type) => {
  return closeWidgetWindow(type || 'overview');
});
ipcMain.handle('toggle-widget-floating', () => {
  const floating = toggleWidgetsFloating();
  return { success: true, isFloating: floating };
});
ipcMain.handle('toggle-widget-pin', (e, pinned, type = 'overview') => {
  const win = activeWidgets[type];
  if (!win || win.isDestroyed()) return { success: false };
  win.setAlwaysOnTop(!pinned);
  return { success: true, pinned, type };
});
ipcMain.handle('get-widgets-status', () => getWidgetsStatus());
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

  // Register Global Shortcut: Shift+\ (and Shift+Backslash) to toggle Floating on top vs Desktop
  const onShortcutTriggered = () => {
    const hasAnyWidget = Object.values(activeWidgets).some(w => w && !w.isDestroyed());
    if (!hasAnyWidget) {
      // If none is open, open overview widget in floating mode
      isWidgetsFloating = true;
      createWidgetWindow('overview', false);
    } else {
      toggleWidgetsFloating();
    }
  };

  try {
    globalShortcut.register('Shift+\\', onShortcutTriggered);
    globalShortcut.register('Shift+Backslash', onShortcutTriggered);
    globalShortcut.register('CommandOrControl+Shift+\\', onShortcutTriggered);
  } catch (err) {
    console.warn('Global shortcut registration note:', err.message);
  }

  const isWidgetOnly = process.argv.includes('--widget-only');
  if (isWidgetOnly) {
    createWidgetWindow('overview', true);
  } else {
    createMainWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
