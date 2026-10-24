const express = require('express');
const path = require('path');
const http = require('http');

const { getSystemInfo } = require('./services/systemInfo');
const { getSensorSnapshot } = require('./services/sensors');
const { getDisksHealth } = require('./services/disks');
const { runNetworkDiagnostics } = require('./services/network');
const { getInstalledMacGames, calculateEstimatedFps, analyzeBottleneck, launchGame } = require('./services/gameLibrary');
const { runMemoryBench, runDiskBench, runGameSimBench, runCpuPathTracerPass } = require('./services/benchmarks');
const { stressManager } = require('./services/stressTest');
const { getRunningSafeProcesses, closeProcess, cleanMemoryAndCaches, getTweaksStatus, setTweak, restoreAllDefaults } = require('./services/optimizer');
const { getStartupItems, toggleStartupItem, removeStartupItem, restoreStartupItem } = require('./services/startupManager');
const { getInstalledStatus, installApp } = require('./services/appInstaller');
const { scanSerialPorts, releaseLockedPort } = require('./services/maker');
const { exportReportToFile } = require('./services/reportBuilder');
const { getAutoStartStatus, setAutoStart } = require('./services/autostart');

function createServer(port = 3000) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/assets', express.static(path.join(__dirname, 'assets')));
  app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'assets', 'app.ico')));

  // API Endpoints
  app.get('/api/system', (req, res) => res.json(getSystemInfo()));
  app.get('/api/sensors', (req, res) => res.json(getSensorSnapshot()));
  app.get('/api/disks', (req, res) => res.json(getDisksHealth()));
  app.get('/api/network', async (req, res) => {
    const full = req.query.full === 'true';
    const data = await runNetworkDiagnostics(full);
    res.json(data);
  });
  app.get('/api/games', (req, res) => res.json(getInstalledMacGames()));
  app.get('/api/fps', (req, res) => {
    const { res: resolution = '1080p', preset = 'Alta', mfx = 'true' } = req.query;
    res.json(calculateEstimatedFps('Apple M1 Pro', resolution, preset, mfx === 'true'));
  });

  // Benchmarks
  app.get('/api/bench/memory', (req, res) => res.json(runMemoryBench()));
  app.get('/api/bench/disk', (req, res) => res.json(runDiskBench(128)));
  app.get('/api/bench/gamesim', (req, res) => res.json(runGameSimBench(2000)));
  app.get('/api/bench/cpu', (req, res) => {
    const isMulti = req.query.multi !== 'false';
    res.json(runCpuPathTracerPass(isMulti, 2500));
  });

  // Stress Test
  app.get('/api/stress/start', (req, res) => {
    const { type = 'cpu', maxTemp = 90 } = req.query;
    res.json(stressManager.start(type, parseInt(maxTemp, 10), 300));
  });
  app.get('/api/stress/stop', (req, res) => res.json(stressManager.stop()));
  app.get('/api/stress/status', (req, res) => res.json(stressManager.getStatus()));

  // Optimizer & Tweaks
  app.get('/api/optimize/clean', (req, res) => res.json(cleanMemoryAndCaches()));
  app.get('/api/optimize/tweaks', (req, res) => res.json(getTweaksStatus()));
  app.get('/api/optimize/tweak', (req, res) => {
    const { id, val } = req.query;
    res.json(setTweak(id, val === 'true'));
  });
  app.get('/api/optimize/restore', (req, res) => res.json(restoreAllDefaults()));

  // Startup Manager
  app.get('/api/startup', (req, res) => res.json(getStartupItems()));
  app.get('/api/startup/toggle', (req, res) => {
    const { path: p, val } = req.query;
    res.json(toggleStartupItem(p, val === 'true'));
  });
  app.get('/api/startup/remove', (req, res) => {
    const { path: p } = req.query;
    res.json(removeStartupItem(p));
  });
  app.get('/api/startup/restore', (req, res) => {
    const { file: f } = req.query;
    res.json(restoreStartupItem(f));
  });

  // Autostart (Start at Login)
  app.get('/api/autostart/status', (req, res) => res.json(getAutoStartStatus()));
  app.get('/api/autostart/toggle', (req, res) => {
    const { enable, widgetOnly } = req.query;
    res.json(setAutoStart(enable === 'true', widgetOnly === 'true'));
  });

  // Desktop Widgets
  app.get('/api/widget/status', (req, res) => res.json({
    available: true,
    isFloating: false,
    active: { overview: true, bar: false, battery: false, memory: false },
    path: '/widget.html'
  }));
  app.get('/api/widget/open', (req, res) => res.json({ success: true, type: req.query.type || 'overview' }));
  app.get('/api/widget/close', (req, res) => res.json({ success: true, type: req.query.type || 'overview' }));
  app.get('/api/widget/floating', (req, res) => res.json({ success: true, isFloating: true }));

  // Apps Installer
  app.get('/api/apps', (req, res) => res.json(getInstalledStatus()));
  app.get('/api/apps/install', (req, res) => {
    const { id } = req.query;
    installApp(id, null, (err, success) => {
      res.json({ success: !err && success, error: err ? err.message : null });
    });
  });

  // Maker Serial
  app.get('/api/maker/ports', (req, res) => res.json(scanSerialPorts()));
  app.get('/api/maker/release', (req, res) => {
    const { path: p } = req.query;
    res.json(releaseLockedPort(p));
  });

  // Report
  app.get('/api/report', (req, res) => {
    const format = req.query.format || 'html';
    res.json(exportReportToFile(format));
  });

  const server = http.createServer(app);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[VS Tolls] A porta ${port} já está em uso (servidor já ativo ou outra aplicação). O app continuará normalmente.`);
    } else {
      console.error('[VS Tolls] Erro no servidor HTTP:', err.message);
    }
  });

  return {
    server,
    listen: (cb) => {
      try {
        server.listen(port, cb);
      } catch (err) {
        console.warn(`[VS Tolls] Não foi possível abrir porta ${port}:`, err.message);
      }
    }
  };
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const s = createServer(PORT);
  s.listen(() => {
    console.log(`\n==============================================`);
    console.log(`🚀 VS TOLLS (macOS Edition) está em execução!`);
    console.log(`📡 Acesse no seu navegador: http://localhost:${PORT}`);
    console.log(`==============================================\n`);
  });
}

module.exports = {
  createServer
};
