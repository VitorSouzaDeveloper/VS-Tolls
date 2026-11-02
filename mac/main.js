const { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
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
const { transferService } = require('./services/transferService');

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

// VS Drop — File Transfer Mac <-> Mobile (iPhone / Android) IPCs
ipcMain.handle('transfer-get-status', () => transferService.getStatus(3000));
ipcMain.handle('transfer-select-files', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return [];
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar Arquivos para Enviar ao Celular',
    properties: ['openFile', 'multiSelections']
  });
  if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
    return transferService.addOutgoingFilesFromPaths(res.filePaths);
  }
  return [];
});
ipcMain.handle('transfer-select-folder', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolher Pasta para Salvar Arquivos Recebidos (VS Drop)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
    return transferService.setDestinationFolder(res.filePaths[0]);
  }
  return { success: false, canceled: true };
});
ipcMain.handle('transfer-open-folder', (e, folderPath) => {
  const target = folderPath || transferService.getDestinationFolder();
  if (fs.existsSync(target)) {
    shell.openPath(target);
    return { success: true };
  }
  return { success: false, error: 'Pasta não encontrada' };
});
ipcMain.handle('transfer-show-item', (e, itemPath) => {
  if (itemPath && fs.existsSync(itemPath)) {
    shell.showItemInFolder(itemPath);
    return { success: true };
  }
  return { success: false, error: 'Arquivo não encontrado no disco' };
});
ipcMain.handle('transfer-open-file', (e, itemPath) => {
  if (itemPath && fs.existsSync(itemPath)) {
    shell.openPath(itemPath);
    return { success: true };
  }
  return { success: false, error: 'Arquivo não encontrado' };
});
ipcMain.handle('transfer-add-files', (e, filePaths) => transferService.addOutgoingFilesFromPaths(filePaths));
ipcMain.handle('transfer-remove-outgoing', (e, id) => transferService.removeOutgoingFile(id));
ipcMain.handle('transfer-clear-outgoing', () => transferService.clearOutgoingFiles());
ipcMain.handle('transfer-clear-received', () => transferService.clearReceivedFiles());
ipcMain.handle('transfer-send-text', (e, text) => transferService.sendTextMessage(text, 'MacBook'));
ipcMain.handle('transfer-set-folder', (e, p) => transferService.setDestinationFolder(p));
ipcMain.handle('transfer-get-peers', () => ({
  peers: transferService.getDiscoveredPeers(),
  visibility: transferService.visibility
}));
ipcMain.handle('transfer-set-visibility', (e, mode) => transferService.setVisibility(mode));
ipcMain.handle('transfer-pair-device', (e, id, paired) => transferService.pairDevice(id, paired));
ipcMain.handle('transfer-send-to-peer', async (e, peerId) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolher Arquivos para Enviar ao Dispositivo',
    properties: ['openFile', 'multiSelections']
  });
  if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
    const results = [];
    for (const fp of res.filePaths) {
      results.push(await transferService.sendFileToPeer(peerId, fp));
    }
    return { success: true, count: results.length, results };
  }
  return { success: false, canceled: true };
});

// Forward file received events and display system notifications
transferService.on('file_received', (file) => {
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: 'VS Drop — Arquivo Recebido',
        body: `${file.name} recebido de ${file.sender} e salvo na pasta VS-Drop!`
      }).show();
    }
  } catch (err) {}
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('transfer-file-received', file);
    } catch (e) {}
  }
});

transferService.on('text_received', (msg) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('transfer-text-received', msg);
    } catch (e) {}
  }
});

transferService.on('peers_updated', (peers) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('transfer-peers-updated', { peers, visibility: transferService.visibility });
    } catch (e) {}
  }
});

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
