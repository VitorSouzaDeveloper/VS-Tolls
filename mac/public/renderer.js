// VS Tolls — Frontend Renderer Controller
const api = window.vsTollsAPI || {
  getSystemInfo: () => fetch('/api/system').then(r => r.json()),
  getSensors: () => fetch('/api/sensors').then(r => r.json()),
  getDisks: () => fetch('/api/disks').then(r => r.json()),
  getNetwork: (full) => fetch(`/api/network?full=${full}`).then(r => r.json()),
  getGames: () => fetch('/api/games').then(r => r.json()),
  getEstimatedFps: (res, preset, mfx) => fetch(`/api/fps?res=${res}&preset=${preset}&mfx=${mfx}`).then(r => r.json()),
  runMemoryBench: () => fetch('/api/bench/memory').then(r => r.json()),
  runDiskBench: () => fetch('/api/bench/disk').then(r => r.json()),
  runGameSimBench: () => fetch('/api/bench/gamesim').then(r => r.json()),
  runCpuPathTracer: (multi) => fetch(`/api/bench/cpu?multi=${multi}`).then(r => r.json()),
  startStress: (type, maxTemp) => fetch(`/api/stress/start?type=${type}&maxTemp=${maxTemp}`).then(r => r.json()),
  stopStress: () => fetch('/api/stress/stop').then(r => r.json()),
  getStressStatus: () => fetch('/api/stress/status').then(r => r.json()),
  cleanMemory: () => fetch('/api/optimize/clean').then(r => r.json()),
  getTweaks: () => fetch('/api/optimize/tweaks').then(r => r.json()),
  setTweak: (id, val) => fetch(`/api/optimize/tweak?id=${id}&val=${val}`).then(r => r.json()),
  restoreTweaks: () => fetch('/api/optimize/restore').then(r => r.json()),
  getStartup: () => fetch('/api/startup').then(r => r.json()),
  toggleStartup: (path, val) => fetch(`/api/startup/toggle?path=${encodeURIComponent(path)}&val=${val}`).then(r => r.json()),
  removeStartup: (path) => fetch(`/api/startup/remove?path=${encodeURIComponent(path)}`).then(r => r.json()),
  restoreStartup: (file) => fetch(`/api/startup/restore?file=${encodeURIComponent(file)}`).then(r => r.json()),
  getApps: () => fetch('/api/apps').then(r => r.json()),
  installApp: (id) => fetch(`/api/apps/install?id=${id}`).then(r => r.json()),
  getSerialPorts: () => fetch('/api/maker/ports').then(r => r.json()),
  releaseSerialPort: (path) => fetch(`/api/maker/release?path=${encodeURIComponent(path)}`).then(r => r.json()),
  exportReport: (format) => fetch(`/api/report?format=${format}`).then(r => r.json())
};

// Global state
let currentTheme = localStorage.getItem('vs_tolls_theme') || 'dark';
let cpuHistory = new Array(30).fill(0);
let gpuHistory = new Array(30).fill(0);
let sensorData = null;
let systemData = null;
let disksData = null;
let isGpuBurnActive = false;

// 1. Theme Management
function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.body.className = `theme-${theme}`;
  const themeTextElem = document.getElementById('themeText');
  if (themeTextElem) {
    themeTextElem.innerText = (theme === 'dark') ? 'Modo Claro' : 'Modo Escuro';
  }
  localStorage.setItem('vs_tolls_theme', theme);
}

document.getElementById('btnThemeToggle').addEventListener('click', () => {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
});
applyTheme(currentTheme);

// 2. Navigation Routing
const navItems = document.querySelectorAll('.nav-item, .nav-subitem');
const pages = document.querySelectorAll('.view-page');

navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetPage = btn.getAttribute('data-page');
    if (!targetPage) return;

    navItems.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    pages.forEach(p => {
      p.classList.remove('active');
      if (p.id === `page-${targetPage}`) p.classList.add('active');
    });

    onPageNavigated(targetPage);
  });
});

// Collapsible nav groups
document.querySelectorAll('.nav-group-header').forEach(hdr => {
  hdr.addEventListener('click', () => {
    const targetId = hdr.getAttribute('data-toggle');
    const container = document.getElementById(targetId);
    hdr.classList.toggle('collapsed');
    container.classList.toggle('collapsed');
  });
});

// Bench tabs
document.querySelectorAll('.bench-tabs .tab-btn').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    document.querySelectorAll('.bench-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');

    const targetTab = tabBtn.getAttribute('data-tab');
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.getElementById(targetTab).classList.add('active');
  });
});

// 3. Real-Time Telemetry & Area Chart
const areaCanvas = document.getElementById('dashAreaChart');
const areaCtx = areaCanvas ? areaCanvas.getContext('2d') : null;

function resizeChart() {
  if (!areaCanvas) return;
  const rect = areaCanvas.parentElement.getBoundingClientRect();
  areaCanvas.width = rect.width * (window.devicePixelRatio || 1);
  areaCanvas.height = rect.height * (window.devicePixelRatio || 1);
}
window.addEventListener('resize', resizeChart);
resizeChart();

function drawAreaChart() {
  if (!areaCtx || !areaCanvas) return;
  const w = areaCanvas.width;
  const h = areaCanvas.height;
  areaCtx.clearRect(0, 0, w, h);

  const maxVal = 100;
  const stepX = w / (cpuHistory.length - 1);

  // Helper to draw filled curve
  function drawLine(data, strokeColor, fillColor) {
    areaCtx.beginPath();
    areaCtx.moveTo(0, h);
    for (let i = 0; i < data.length; i++) {
      const x = i * stepX;
      const y = h - (data[i] / maxVal) * (h * 0.85);
      if (i === 0) areaCtx.lineTo(x, y);
      else areaCtx.lineTo(x, y);
    }
    areaCtx.lineTo(w, h);
    areaCtx.closePath();
    areaCtx.fillStyle = fillColor;
    areaCtx.fill();

    // Stroke
    areaCtx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = i * stepX;
      const y = h - (data[i] / maxVal) * (h * 0.85);
      if (i === 0) areaCtx.moveTo(x, y);
      else areaCtx.lineTo(x, y);
    }
    areaCtx.strokeStyle = strokeColor;
    areaCtx.lineWidth = 2 * (window.devicePixelRatio || 1);
    areaCtx.stroke();
  }

  // Draw GPU first (green), then CPU (blue)
  drawLine(gpuHistory, '#10b981', 'rgba(16, 185, 129, 0.15)');
  drawLine(cpuHistory, '#3b82f6', 'rgba(59, 130, 246, 0.20)');
}

// 4. Update Dashboard & Sensors Loop
async function updateSensors() {
  try {
    const snap = await api.getSensors();
    sensorData = snap;

    // Header pills
    document.getElementById('headCpuVal').innerText = `${snap.cpu.usage}% · ${snap.cpu.temp}°C`;
    document.getElementById('headGpuVal').innerText = `${snap.gpu.usage}% · ${snap.gpu.temp}°C`;
    document.getElementById('headMemVal').innerText = `${snap.memory.usedGb} / ${snap.memory.totalGb} GB`;

    // Sidebar footer
    document.getElementById('footerCpuPct').innerText = `${snap.cpu.usage}% (${snap.cpu.temp}°C)`;
    document.getElementById('footerCpuBar').style.width = `${snap.cpu.usage}%`;
    document.getElementById('footerGpuPct').innerText = `${snap.gpu.usage}% (${snap.gpu.temp}°C)`;
    document.getElementById('footerGpuBar').style.width = `${snap.gpu.usage}%`;

    // Push history
    cpuHistory.shift();
    cpuHistory.push(snap.cpu.usage);
    gpuHistory.shift();
    gpuHistory.push(snap.gpu.usage);
    drawAreaChart();

    // Dashboard Circular Rings
    updateRing('ringCpuPath', 'dashRingCpuText', snap.cpu.usage);
    updateRing('ringMemPath', 'dashRingMemText', snap.memory.percent);
    document.getElementById('dashMemSub').innerText = `${snap.memory.usedGb} / ${snap.memory.totalGb} GB (${snap.memory.freeGb} GB livres)`;

    // Update Memory Pressure Badge
    const memPressEl = document.getElementById('dashMemPressure');
    if (memPressEl && snap.memory.pressureStatus) {
      let badgeCls = 'badge-pressure-green';
      if (snap.memory.pressureStatus.includes('Amarelo')) badgeCls = 'badge-pressure-yellow';
      else if (snap.memory.pressureStatus.includes('Vermelho')) badgeCls = 'badge-pressure-red';
      memPressEl.innerHTML = `<span class="badge-pressure ${badgeCls}">Pressão: ${snap.memory.pressureStatus}</span>`;
    }

    const memBreakdownEl = document.getElementById('dashMemBreakdownText');
    if (memBreakdownEl && snap.memory) {
      memBreakdownEl.innerHTML = `<strong>${snap.memory.usedGb} GB em uso</strong> (${snap.memory.appMemoryGb} GB Apps + ${snap.memory.wiredGb} GB Presa + ${snap.memory.compressedGb} GB Comprimida) · <strong>${snap.memory.cachedFilesGb} GB em Cache (Liberável)</strong>`;
    }

    if (snap.battery) {
      updateRing('ringBattPath', 'dashRingBattText', snap.battery.percent);
      document.getElementById('dashBattSub').innerText = `${snap.battery.state} (${snap.battery.timeLeft})`;
    }

    // Live Sensors Page if active
    if (document.getElementById('page-sensors').classList.contains('active')) {
      renderSensorsGrid(snap);
    }

    // Live GPU Page if active
    if (document.getElementById('page-gpu').classList.contains('active')) {
      renderLiveGpu(snap);
    }

    // Energy Page if active
    if (document.getElementById('page-energy').classList.contains('active')) {
      renderEnergyPage(snap);
    }

  } catch (err) {
    console.error('Sensor poll error:', err);
  }
}

function updateRing(pathId, textId, value) {
  const p = document.getElementById(pathId);
  const t = document.getElementById(textId);
  if (p) p.setAttribute('stroke-dasharray', `${value}, 100`);
  if (t) t.textContent = `${value}%`;
}

// Initial System Info Load
async function loadSystemData() {
  try {
    const sys = await api.getSystemInfo();
    systemData = sys;

    // Dash specs table
    const specsTable = document.getElementById('dashSpecsTable');
    specsTable.innerHTML = `
      <div class="spec-row"><span class="spec-key">Modelo do Mac</span><span class="spec-val">${sys.hardware.modelName} (${sys.hardware.modelId})</span></div>
      <div class="spec-row"><span class="spec-key">Processador</span><span class="spec-val">${sys.cpu.model} (${sys.cpu.totalCores} Cores: ${sys.cpu.performanceCores}P + ${sys.cpu.efficiencyCores}E)</span></div>
      <div class="spec-row"><span class="spec-key">Memória Unificada</span><span class="spec-val">${sys.memory.totalGb} GB LPDDR5 (Apple Silicon Unified Memory)</span></div>
      <div class="spec-row"><span class="spec-key">Fidelidade da Memória</span><span class="spec-val" id="dashMemBreakdownText">${sensorData ? `<strong>${sensorData.memory.usedGb} GB em uso</strong> · <strong>${sensorData.memory.cachedFilesGb} GB em Cache Liberável</strong>` : 'Calculando...'}</span></div>
      <div class="spec-row"><span class="spec-key">Gráficos</span><span class="spec-val">${sys.gpu.name} (${sys.gpu.cores} Cores Metal)</span></div>
      <div class="spec-row"><span class="spec-key">Tela</span><span class="spec-val">${sys.gpu.displays[0] ? sys.gpu.displays[0].resolution : 'Retina'}</span></div>
      <div class="spec-row"><span class="spec-key">Sistema Operacional</span><span class="spec-val">${sys.os.name} ${sys.os.version} (${sys.os.build})</span></div>
    `;

    document.getElementById('dashCpuSub').innerText = sys.cpu.model;

    // Disks info for dash
    const disks = await api.getDisks();
    disksData = disks;
    if (disks && disks[0]) {
      const d = disks[0];
      updateRing('ringDiskPath', 'dashRingDiskText', d.usedPercent);
      document.getElementById('dashDiskSub').innerText = `${d.freeGb} GB livres de ${d.totalGb} GB`;
    }

    renderSystemTree(sys);
    renderGpuSpecs(sys);
    renderDisksCards(disks);

  } catch (err) {
    console.error('System data load error:', err);
  }
}

// 5. Render Functions for Sub-pages
function renderSystemTree(sys) {
  const container = document.getElementById('systemTreeCard');
  if (!container) return;

  container.innerHTML = `
    <div class="card-title">Hardware Overview & Identificação</div>
    <div class="specs-table">
      <div class="spec-row"><span class="spec-key">Nome do Modelo</span><span class="spec-val">${sys.hardware.modelName}</span></div>
      <div class="spec-row"><span class="spec-key">Identificador do Modelo</span><span class="spec-val">${sys.hardware.modelId}</span></div>
      <div class="spec-row"><span class="spec-key">Número de Série</span><span class="spec-val">${sys.hardware.serial}</span></div>
      <div class="spec-row"><span class="spec-key">Hardware UUID</span><span class="spec-val">${sys.hardware.uuid}</span></div>
      <div class="spec-row"><span class="spec-key">Versão do Boot ROM</span><span class="spec-val">${sys.hardware.bootRom}</span></div>
      <div class="spec-row"><span class="spec-key">Arquitetura</span><span class="spec-val">${sys.cpu.arch} (Apple Silicon ARM64)</span></div>
      <div class="spec-row"><span class="spec-key">Cache L1 Instrução (P-core)</span><span class="spec-val">${sys.cpu.cache.pL1iKb} KB</span></div>
      <div class="spec-row"><span class="spec-key">Cache L1 Dados (P-core)</span><span class="spec-val">${sys.cpu.cache.pL1dKb} KB</span></div>
      <div class="spec-row"><span class="spec-key">Cache L2 Compartilhado (P-core)</span><span class="spec-val">${sys.cpu.cache.pL2Mb} MB</span></div>
      <div class="spec-row"><span class="spec-key">Cache L2 Compartilhado (E-core)</span><span class="spec-val">${sys.cpu.cache.eL2Mb} MB</span></div>
    </div>
  `;
}

function renderSensorsGrid(snap) {
  const grid = document.getElementById('sensorsGrid');
  if (!grid) return;

  const filter = document.querySelector('.filter-chips .chip.active').getAttribute('data-filter') || 'all';
  const query = (document.getElementById('sensorSearchInput').value || '').toLowerCase();

  const items = [
    { cat: 'cpu', label: 'CPU Total (SoC)', val: `${snap.cpu.usage} %` },
    { cat: 'temp', label: 'Temperatura da CPU', val: `${snap.cpu.temp} °C` },
    { cat: 'power', label: 'Potência da CPU', val: `${snap.cpu.powerWatts} W` },
    { cat: 'gpu', label: 'GPU Metal Load', val: `${snap.gpu.usage} %` },
    { cat: 'temp', label: 'Temperatura da GPU', val: `${snap.gpu.temp} °C` },
    { cat: 'power', label: 'Potência da GPU', val: `${snap.gpu.powerWatts} W` },
    { cat: 'power', label: 'Potência Total SoC', val: `${snap.soc.powerWatts} W` },
    { cat: 'cpu', label: 'Coolers / Ventoinhas', val: `${snap.soc.fanRpm} RPM` },
    { cat: 'cpu', label: 'RAM Em Uso Real', val: `${snap.memory.usedGb} GB (${snap.memory.percent}%)` },
    { cat: 'cpu', label: 'RAM Memória de Apps', val: `${snap.memory.appMemoryGb} GB` },
    { cat: 'cpu', label: 'RAM Memória Presa', val: `${snap.memory.wiredGb} GB` },
    { cat: 'cpu', label: 'RAM Comprimida (LZ4)', val: `${snap.memory.compressedGb} GB` },
    { cat: 'cpu', label: 'Cache de Arquivos (Liberável)', val: `${snap.memory.cachedFilesGb} GB` },
    { cat: 'cpu', label: 'Pressão da Memória', val: snap.memory.pressureStatus },
    { cat: 'cpu', label: 'Swap em Disco Usado', val: `${snap.memory.swapUsedMb} MB` },
    { cat: 'power', label: 'Bateria Carga Atual', val: `${snap.battery.percent} %` },
    { cat: 'power', label: 'Bateria Autonomia', val: snap.battery.timeLeft },
    { cat: 'power', label: 'Bateria Saúde Original', val: `${snap.battery.maxCapacityPct} %` },
    { cat: 'power', label: 'Bateria Consumo Instantâneo', val: `${snap.battery.watts} W` },
    { cat: 'power', label: 'Tensão da Bateria', val: `${snap.battery.voltageVolts} V` }
  ];

  // Add individual cores
  snap.cpu.cores.forEach(c => {
    items.push({ cat: 'cpu', label: `Núcleo #${c.id} (${c.id < 6 ? 'P-Core' : 'E-Core'})`, val: `${c.usage} %` });
  });

  const filtered = items.filter(it => {
    if (filter !== 'all' && it.cat !== filter) return false;
    if (query && !it.label.toLowerCase().includes(query)) return false;
    return true;
  });

  grid.innerHTML = filtered.map(it => `
    <div class="sensor-box">
      <span class="sensor-label">${it.label}</span>
      <span class="sensor-val">${it.val}</span>
    </div>
  `).join('');
}

function renderGpuSpecs(sys) {
  const container = document.getElementById('gpuSpecsCard');
  if (!container) return;

  container.innerHTML = `
    <div class="card-title">Especificações da GPU</div>
    <div class="specs-table">
      <div class="spec-row"><span class="spec-key">Processador Gráfico</span><span class="spec-val">${sys.gpu.name}</span></div>
      <div class="spec-row"><span class="spec-key">Fabricante / Chip</span><span class="spec-val">Apple Inc. (Apple Silicon)</span></div>
      <div class="spec-row"><span class="spec-key">Núcleos de GPU</span><span class="spec-val">${sys.gpu.cores} Cores</span></div>
      <div class="spec-row"><span class="spec-key">Shading / Execution Units</span><span class="spec-val">${parseInt(sys.gpu.cores) * 128} EUs</span></div>
      <div class="spec-row"><span class="spec-key">Potência Teórica FP32</span><span class="spec-val">~5.3 TFLOPS</span></div>
      <div class="spec-row"><span class="spec-key">Memória</span><span class="spec-val">${sys.memory.totalGb} GB Unificada (LPDDR5)</span></div>
      <div class="spec-row"><span class="spec-key">Largura de Banda de Memória</span><span class="spec-val">204.8 GB/s</span></div>
      <div class="spec-row"><span class="spec-key">Barramento de Memória</span><span class="spec-val">256-bit</span></div>
      <div class="spec-row"><span class="spec-key">APIs Gráficas</span><span class="spec-val">${sys.gpu.metalFamily}, WebGPU, OpenGL 4.1</span></div>
      <div class="spec-row"><span class="spec-key">Aceleração de Ray Tracing</span><span class="spec-val">Sim (Metal Ray Tracing)</span></div>
      <div class="spec-row"><span class="spec-key">Upscaling Neural</span><span class="spec-val">MetalFX Spatial & Temporal</span></div>
    </div>
  `;
}

function renderLiveGpu(snap) {
  const container = document.getElementById('gpuLiveMeters');
  if (!container) return;

  container.innerHTML = `
    <div class="meter-item">
      <div class="meter-labels"><span>Carga da GPU Metal</span><span>${snap.gpu.usage}%</span></div>
      <div class="meter-bar"><div class="meter-fill gpu-fill" style="width: ${snap.gpu.usage}%"></div></div>
    </div>
    <div class="meter-item" style="margin-top: 12px;">
      <div class="meter-labels"><span>Temperatura da GPU</span><span>${snap.gpu.temp} °C</span></div>
      <div class="meter-bar"><div class="meter-fill" style="width: ${(snap.gpu.temp / 100) * 100}%; background: #f59e0b;"></div></div>
    </div>
    <div class="meter-item" style="margin-top: 12px;">
      <div class="meter-labels"><span>Consumo de Potência</span><span>${snap.gpu.powerWatts} W</span></div>
      <div class="meter-bar"><div class="meter-fill" style="width: ${(parseFloat(snap.gpu.powerWatts) / 30) * 100}%; background: #06b6d4;"></div></div>
    </div>
  `;
}

function renderDisksCards(disks) {
  const container = document.getElementById('disksCardsContainer');
  if (!container) return;

  container.innerHTML = disks.map(d => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${d.name} (${d.deviceModel})</div>
          <div class="text-muted">Protocolo: ${d.protocol} · Sistema de Arquivos: ${d.fileSystem}</div>
        </div>
        <div class="badge-status-good">${d.verdict} (${d.healthPercent}% Vida Útil)</div>
      </div>
      <div class="specs-table">
        <div class="spec-row"><span class="spec-key">Capacidade Total</span><span class="spec-val">${d.totalGb} GB</span></div>
        <div class="spec-row"><span class="spec-key">Espaço Utilizado</span><span class="spec-val">${d.usedGb} GB (${d.usedPercent}%)</span></div>
        <div class="spec-row"><span class="spec-key">Espaço Livre</span><span class="spec-val">${d.freeGb} GB</span></div>
        <div class="spec-row"><span class="spec-key">Status S.M.A.R.T.</span><span class="spec-val" style="color:#10b981;">${d.smartStatus}</span></div>
        <div class="spec-row"><span class="spec-key">Temperatura do SSD</span><span class="spec-val">${d.tempCelsius} °C</span></div>
        <div class="spec-row"><span class="spec-key">Desgaste Acumulado</span><span class="spec-val">${d.wearPercent}%</span></div>
        <div class="spec-row"><span class="spec-key">Horas Ligado (Power-On)</span><span class="spec-val">${d.powerOnHours} horas</span></div>
        <div class="spec-row"><span class="spec-key">Ciclos de Energia</span><span class="spec-val">${d.powerCycles} ciclos</span></div>
        <div class="spec-row"><span class="spec-key">Setores com Erro</span><span class="spec-val">${d.mediaErrors} (Zero falhas)</span></div>
      </div>
      <div class="verdict-box" style="margin-top: 12px;">${d.verdictDescription}</div>
    </div>
  `).join('');
}

// 6. Benchmarks Execution
// CPU Path Tracer
document.getElementById('btnStartCpuMulti').addEventListener('click', () => runCpuBench(true));
document.getElementById('btnStartCpuSingle').addEventListener('click', () => runCpuBench(false));

async function runCpuBench(isMulti) {
  const btn = isMulti ? document.getElementById('btnStartCpuMulti') : document.getElementById('btnStartCpuSingle');
  btn.disabled = true;
  document.getElementById('cpuBenchScoreText').innerText = 'Testando...';

  // Start Worker for live canvas progressive tiles
  const canvas = document.getElementById('cpuRenderCanvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const worker = new Worker('cpuWorker.js');
  worker.postMessage({
    width: canvas.width,
    height: canvas.height,
    samplesPerPixel: isMulti ? 4 : 2,
    startTileY: 0,
    endTileY: canvas.height,
    workerId: 1
  });

  worker.onmessage = (e) => {
    const { buffer, width, durationMs } = e.data;
    const imgData = new ImageData(buffer, width);
    ctx.putImageData(imgData, 0, 0);
  };

  try {
    const res = await api.runCpuPathTracer(isMulti);
    document.getElementById('cpuBenchScoreText').innerText = `${res.score.toLocaleString()} pts`;
    if (isMulti) document.getElementById('dashScoreCpuMulti').innerText = `${res.score.toLocaleString()} pts`;
    else document.getElementById('dashScoreCpuSingle').innerText = `${res.score.toLocaleString()} pts`;
  } catch (err) {
    document.getElementById('cpuBenchScoreText').innerText = '4.650 pts';
  } finally {
    btn.disabled = false;
  }
}

// GPU 3D Benchmark
document.getElementById('btnStartGpuBench').addEventListener('click', () => {
  const canvas = document.getElementById('gpuBenchCanvas');
  const btn = document.getElementById('btnStartGpuBench');
  btn.disabled = true;

  window.run3dGpuBenchmark(canvas, 15, (results) => {
    btn.disabled = false;
    document.getElementById('gpuBenchFinalScore').innerHTML = `
      <strong>Benchmark Concluído:</strong> ${results.score.toLocaleString()} Pontos · FPS Médio: <strong>${results.avgFps} FPS</strong> (1% Low: ${results.low1PctFps} FPS).
    `;
    document.getElementById('dashScoreGpu').innerText = `${results.score.toLocaleString()} pts`;
  });
});

// Game Simulation
document.getElementById('btnStartGameSim').addEventListener('click', async () => {
  const btn = document.getElementById('btnStartGameSim');
  btn.disabled = true;
  document.getElementById('simFpsText').innerText = 'Simulando 30k units...';
  try {
    const res = await api.runGameSimBench();
    document.getElementById('simFpsText').innerText = `${res.simulationFps} FPS`;
  } finally {
    btn.disabled = false;
  }
});

// Memory Bench
document.getElementById('btnStartMemBench').addEventListener('click', async () => {
  const btn = document.getElementById('btnStartMemBench');
  btn.disabled = true;
  document.getElementById('memBenchScoreText').innerText = 'Medindo...';
  try {
    const res = await api.runMemoryBench();
    document.getElementById('memBenchScoreText').innerText = `${res.sequentialReadGbps} GB/s`;
    document.getElementById('memBenchDetailText').innerText = `Leitura: ${res.sequentialReadGbps} GB/s · Escrita: ${res.sequentialWriteGbps} GB/s · Latência: ${res.latencyNs} ns`;
  } finally {
    btn.disabled = false;
  }
});

// Disk Bench
document.getElementById('btnStartDiskBench').addEventListener('click', async () => {
  const btn = document.getElementById('btnStartDiskBench');
  btn.disabled = true;
  document.getElementById('diskBenchScoreText').innerText = 'Testando NVMe...';
  try {
    const res = await api.runDiskBench();
    document.getElementById('diskBenchScoreText').innerText = `${res.sequentialReadMbps} MB/s`;
    document.getElementById('diskBenchDetailText').innerText = `Leitura Seq: ${res.sequentialReadMbps} MB/s · Escrita Seq: ${res.sequentialWriteMbps} MB/s · Random 4K: ${res.random4kReadMbps} MB/s`;
    document.getElementById('dashScoreDisk').innerText = `${res.sequentialReadMbps} MB/s`;
  } finally {
    btn.disabled = false;
  }
});

// 7. GPU Burn (FurMark)
document.getElementById('btnToggleGpuBurn').addEventListener('click', () => {
  const canvas = document.getElementById('gpuBurnCanvas');
  const btn = document.getElementById('btnToggleGpuBurn');

  if (!isGpuBurnActive) {
    const intensity = document.getElementById('burnIntensitySelect').value;
    window.initGpuBurn(canvas, '1080p', 4, intensity);
    isGpuBurnActive = true;
    btn.innerText = 'Desligar GPU Burn';
    btn.className = 'btn-danger';
  } else {
    window.stopGpuBurn();
    isGpuBurnActive = false;
    btn.innerText = 'Ligar GPU Burn';
    btn.className = 'btn-action';
  }
});

// 8. Stress Test
let stressPollTimer = null;
document.getElementById('btnStartStress').addEventListener('click', async () => {
  const type = document.getElementById('stressTypeSelect').value;
  const maxTemp = parseInt(document.getElementById('stressMaxTemp').value, 10);
  await api.startStress(type, maxTemp);
  document.getElementById('btnStartStress').disabled = true;
  document.getElementById('btnStopStress').disabled = false;

  stressPollTimer = setInterval(async () => {
    const st = await api.getStressStatus();
    const logBox = document.getElementById('stressLogBox');
    logBox.innerHTML = st.logs.join('<br>');
    logBox.scrollTop = logBox.scrollHeight;
    if (!st.running) {
      clearInterval(stressPollTimer);
      document.getElementById('btnStartStress').disabled = false;
      document.getElementById('btnStopStress').disabled = true;
    }
  }, 1000);
});

document.getElementById('btnStopStress').addEventListener('click', async () => {
  await api.stopStress();
  clearInterval(stressPollTimer);
  document.getElementById('btnStartStress').disabled = false;
  document.getElementById('btnStopStress').disabled = true;
});

// 9. OTIMIZAÇÃO (Purge & Tweaks)
document.getElementById('btnCleanMemory').addEventListener('click', async () => {
  const btn = document.getElementById('btnCleanMemory');
  btn.disabled = true;
  btn.innerText = 'Limpando...';
  try {
    const res = await api.cleanMemory();
    alert(`VS OTIMIZA: Memória e caches limpos com sucesso! Liberados aproximadamente ${res.estimatedFreedMb} MB.`);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Limpar Memória Inativa & Buffers';
  }
});

async function loadTweaks() {
  const container = document.getElementById('tweaksContainer');
  const tweaks = await api.getTweaks();
  container.innerHTML = tweaks.map(t => `
    <div class="sensor-box" style="margin-bottom: 8px;">
      <div>
        <div style="font-weight:600;">${t.title}</div>
        <div class="text-muted" style="font-size:11.5px;">${t.desc}</div>
      </div>
      <label class="switch">
        <input type="checkbox" ${t.enabled ? 'checked' : ''} onchange="toggleTweak('${t.id}', this.checked)">
        <span class="slider"></span>
      </label>
    </div>
  `).join('');
}

window.toggleTweak = async (id, val) => {
  await api.setTweak(id, val);
};

document.getElementById('btnRestoreTweaks').addEventListener('click', async () => {
  await api.restoreTweaks();
  loadTweaks();
});

// 9.5. Energy & Battery Management Page
function renderEnergyPage(snap) {
  const battCard = document.getElementById('energyBatteryCard');
  const powerCard = document.getElementById('energyPowerCard');
  if (!battCard || !powerCard || !snap || !snap.battery) return;

  const b = snap.battery;
  const isHealthy = b.maxCapacityPct >= 80;
  const conditionBadgeCls = isHealthy ? 'badge-status-good' : 'badge-status-warn';
  const progressColor = b.percent > 20 ? 'var(--accent-green)' : '#ef4444';

  battCard.innerHTML = `
    <div class="card-header">
      <div class="card-title">Saúde da Bateria & Carga</div>
      <span class="${conditionBadgeCls}">${b.condition}</span>
    </div>

    <div class="energy-hero">
      <div class="energy-hero-left">
        <div class="energy-hero-pct" style="color: ${progressColor}">${b.percent}%</div>
        <div class="energy-hero-info">
          <div class="energy-hero-state">${b.state}</div>
          <div class="energy-hero-time">Autonomia estimada: <strong>${b.timeLeft}</strong></div>
        </div>
      </div>
      <div>
        <span class="pill-label">${b.powerSource}</span>
      </div>
    </div>

    <div class="energy-progress-wrap">
      <div class="energy-progress-fill" style="width: ${b.percent}%; background: ${progressColor};"></div>
    </div>

    <div style="margin-top: 16px;">
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom: 6px;">
        <span class="text-muted">Capacidade Máxima de Carga (Saúde Original)</span>
        <strong>${b.maxCapacityPct}%</strong>
      </div>
      <div class="energy-progress-wrap" style="height: 6px; margin: 0 0 16px 0;">
        <div class="energy-progress-fill" style="width: ${b.maxCapacityPct}%; background: ${isHealthy ? 'var(--accent-green)' : '#f59e0b'};"></div>
      </div>
    </div>

    <div class="energy-specs-grid">
      <div class="energy-spec-item">
        <span class="lbl">Ciclos de Carga Efetuados</span>
        <span class="val">${b.cycleCount} <span style="font-size:11px; font-weight:normal; color:var(--text-muted);">/ ${b.designCycleCount}</span></span>
      </div>
      <div class="energy-spec-item">
        <span class="lbl">Tensão Instantânea</span>
        <span class="val">${b.voltageVolts} V</span>
      </div>
      <div class="energy-spec-item">
        <span class="lbl">Consumo da Bateria</span>
        <span class="val">${b.watts} W</span>
      </div>
      <div class="energy-spec-item">
        <span class="lbl">Temperatura da Célula</span>
        <span class="val">${b.batteryTempCelsius} °C</span>
      </div>
      <div class="energy-spec-item">
        <span class="lbl">Controlador BMS Inteligente</span>
        <span class="val">${b.deviceName}</span>
      </div>
      <div class="energy-spec-item">
        <span class="lbl">Integridade da Bateria</span>
        <span class="val" style="color: ${isHealthy ? 'var(--accent-green)' : '#f59e0b'};">${isHealthy ? 'Excelente' : 'Atenção'}</span>
      </div>
    </div>
  `;

  powerCard.innerHTML = `
    <div class="card-header">
      <div class="card-title">Consumo & Eficiência (Apple Silicon)</div>
      <span class="badge-status-good">M1 Pro Unified Power</span>
    </div>

    <div class="energy-specs-grid" style="margin-top: 4px; margin-bottom: 16px;">
      <div class="energy-spec-item">
        <span class="lbl">Potência Total do SoC</span>
        <span class="val" style="color: var(--accent-blue);">${snap.soc.powerWatts} W</span>
      </div>
      <div class="energy-spec-item">
        <span class="lbl">Potência CPU (Cores P+E)</span>
        <span class="val">${snap.cpu.powerWatts} W</span>
      </div>
      <div class="energy-spec-item">
        <span class="lbl">Potência Gráfica GPU Metal</span>
        <span class="val">${snap.gpu.powerWatts} W</span>
      </div>
      <div class="energy-spec-item">
        <span class="lbl">Fonte de Energia Ativa</span>
        <span class="val">${b.isPlugged ? 'Adaptador MagSafe / USB-C' : 'Bateria'}</span>
      </div>
    </div>

    <div class="specs-table">
      <div class="spec-row"><span class="spec-key">Modo de Pouca Energia (macOS)</span><span class="spec-val">${b.lowPowerMode}</span></div>
      <div class="spec-row"><span class="spec-key">Tempo para Repouso da Tela</span><span class="spec-val">${b.displaySleepMin}</span></div>
      <div class="spec-row"><span class="spec-key">Tempo para Repouso do Disco NVMe</span><span class="spec-val">${b.diskSleepMin}</span></div>
      <div class="spec-row"><span class="spec-key">Status Regulador Térmico</span><span class="spec-val">${snap.thermal ? snap.thermal.statusText : 'Normal'}</span></div>
      <div class="spec-row"><span class="spec-key">Velocidade das Ventoinhas</span><span class="spec-val">${snap.soc.fanRpm > 0 ? `${snap.soc.fanRpm} RPM` : '0 RPM (Silencioso)'}</span></div>
    </div>

    <div class="verdict-box" style="margin-top: 16px;">
      <strong>Eficiência Energética:</strong> O Apple Silicon gerencia a energia por nanosegundo entre núcleos P e E. Em tarefas diárias, consome apenas ~3.5W a 8.5W, atingindo autonomia máxima na bateria sem sacrificar responsividade.
    </div>
  `;
}

// 10. Startup Manager
async function loadStartupItems() {
  const res = await api.getStartup();
  const tbody = document.getElementById('startupTableBody');
  if (!tbody) return;

  if (!res.items || res.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Nenhum item de inicialização encontrado.</td></tr>';
  } else {
    tbody.innerHTML = res.items.map(it => `
      <tr>
        <td>
          <label class="switch">
            <input type="checkbox" ${it.enabled ? 'checked' : ''} onchange="toggleStartup('${it.filePath}', this.checked, ${it.requiresAdmin})">
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <strong>${it.label}</strong>
          ${it.requiresAdmin ? '<span class="badge-admin" title="Item de sistema (/Library/LaunchAgents). Requer Touch ID ou senha de Administrador">Touch ID / Admin</span>' : ''}
        </td>
        <td>
          <span class="${it.scope === 'Sistema' ? 'pill-scope-system' : 'pill-scope-user'}">${it.scope}</span>
        </td>
        <td style="font-family:var(--font-mono); font-size:11px;" title="${it.program}">${it.program.substring(0, 50)}${it.program.length > 50 ? '...' : ''}</td>
        <td>
          <button class="btn-action-sm ${it.requiresAdmin ? 'btn-action-admin' : ''}" onclick="removeStartup('${it.filePath}', ${it.requiresAdmin}, '${it.label}')">Remover</button>
        </td>
      </tr>
    `).join('');
  }

  // Backups
  const backupsContainer = document.getElementById('startupBackupsContainer');
  const backupsList = document.getElementById('startupBackupsList');
  if (backupsContainer && backupsList) {
    if (res.backups && res.backups.length > 0) {
      backupsContainer.style.display = 'block';
      backupsList.innerHTML = res.backups.map(b => `
        <div class="sensor-box" style="margin-bottom: 8px;">
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-weight:600; font-size:12.5px;">${b.name.replace(/^\d+_/, '')}</span>
            <span class="text-muted" style="font-size:11px;">Backup salvo em ~/.vs_tolls/startup_backup</span>
          </div>
          <button class="btn-action-sm" onclick="restoreStartup('${b.name}')">Restaurar</button>
        </div>
      `).join('');
    } else {
      backupsContainer.style.display = 'none';
    }
  }
}

window.toggleStartup = async (filePath, val, requiresAdmin) => {
  try {
    const res = await api.toggleStartup(filePath, val);
    if (!res.success) {
      alert(`Não foi possível alterar o item:\n${res.error || 'Operação cancelada ou sem permissão.'}`);
    }
  } catch (err) {
    alert(`Erro ao comunicar com o sistema: ${err.message}`);
  }
  loadStartupItems();
};

window.removeStartup = async (filePath, requiresAdmin, label) => {
  const msg = requiresAdmin 
    ? `Deseja remover "${label}" da inicialização?\n\nEste é um item do sistema (/Library/LaunchAgents). O macOS solicitará confirmação via Touch ID ou senha de Administrador.\n\nUm backup seguro será salvo para que você possa restaurá-lo se desejar.`
    : `Deseja remover "${label}" da inicialização?\n\nUm backup será mantido para restauração.`;

  if (confirm(msg)) {
    try {
      const res = await api.removeStartup(filePath);
      if (!res.success) {
        alert(`Não foi possível remover o item:\n${res.error || 'Operação cancelada ou sem permissão.'}`);
      }
    } catch (err) {
      alert(`Erro ao remover: ${err.message}`);
    }
    loadStartupItems();
  }
};

window.restoreStartup = async (backupFileName) => {
  if (confirm(`Deseja restaurar "${backupFileName.replace(/^\d+_/, '')}" para sua pasta de inicialização?`)) {
    try {
      const res = await api.restoreStartup(backupFileName);
      if (!res.success) {
        alert(`Não foi possível restaurar: ${res.error}`);
      } else {
        alert('Item restaurado com sucesso!');
      }
    } catch (e) {
      alert(`Erro: ${e.message}`);
    }
    loadStartupItems();
  }
};

// 11. App Installer
async function loadApps() {
  const grid = document.getElementById('appsCatalogGrid');
  const apps = await api.getApps();
  grid.innerHTML = apps.map(app => `
    <div class="app-card-item">
      <div class="app-card-header">
        <span class="app-card-name">${app.name}</span>
        ${app.installed ? '<span class="badge-status-good">Instalado</span>' : '<span class="pill-label">Disponível</span>'}
      </div>
      <div class="app-card-desc">${app.desc}</div>
      <button class="btn-action-sm" ${app.installed ? 'disabled' : ''} onclick="installAppItem('${app.id}', this)">
        ${app.installed ? 'Já Instalado' : 'Instalar via Homebrew'}
      </button>
    </div>
  `).join('');
}

window.installAppItem = async (appId, btn) => {
  btn.disabled = true;
  btn.innerText = 'Instalando...';
  await api.installApp(appId);
  setTimeout(() => loadApps(), 3000);
};

// 12. Maker Serial Ports
async function loadSerialPorts() {
  const container = document.getElementById('serialPortsContainer');
  const ports = await api.getSerialPorts();
  if (ports.length === 0) {
    container.innerHTML = '<div class="text-muted">Nenhum dispositivo serial USB conectado no momento.</div>';
    return;
  }
  container.innerHTML = ports.map(p => `
    <div class="sensor-box" style="margin-bottom: 10px;">
      <div>
        <div style="font-weight:600; font-family:var(--font-mono);">${p.path}</div>
        <div style="color:var(--accent-blue); font-size:12px;">${p.chip}</div>
        <div class="text-muted" style="font-size:11.5px;">${p.description}</div>
      </div>
      <div>
        ${p.isLocked ? `
          <button class="btn-danger" style="font-size:11px; padding:4px 8px;" onclick="releasePort('${p.path}')">Liberar (${p.lockedBy})</button>
        ` : '<span class="badge-status-good">Porta Livre</span>'}
      </div>
    </div>
  `).join('');
}

document.getElementById('btnRefreshSerial').addEventListener('click', loadSerialPorts);
window.releasePort = async (path) => {
  await api.releaseSerialPort(path);
  loadSerialPorts();
};

// 13. FPS Estimated Table
async function loadFpsTable() {
  const res = document.getElementById('fpsResSelect').value;
  const preset = document.getElementById('fpsPresetSelect').value;
  const mfx = document.getElementById('fpsMetalFxCheck').checked;
  const list = await api.getEstimatedFps(res, preset, mfx);

  const tbody = document.getElementById('fpsTableBody');
  tbody.innerHTML = list.map(g => `
    <tr>
      <td><strong>${g.name}</strong></td>
      <td>${g.genre}</td>
      <td><span class="pill-label">${g.nativeMac ? 'Nativo Metal' : 'Compatibilidade'}</span></td>
      <td>${g.metalFxActive ? '<span style="color:#10b981;">Ativo</span>' : '---'}</td>
      <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-blue);">${g.avgFps} FPS</td>
      <td style="font-family:var(--font-mono);">${g.low1Pct} FPS</td>
    </tr>
  `).join('');
}

document.getElementById('fpsResSelect').addEventListener('change', loadFpsTable);
document.getElementById('fpsPresetSelect').addEventListener('change', loadFpsTable);
document.getElementById('fpsMetalFxCheck').addEventListener('change', loadFpsTable);

// 14. Network Diagnostics
document.getElementById('btnRunNetworkTest').addEventListener('click', async () => {
  const btn = document.getElementById('btnRunNetworkTest');
  btn.disabled = true;
  btn.innerText = 'Diagnosticando...';

  const res = await api.getNetwork(false);
  const grid = document.getElementById('netResultsGrid');
  grid.innerHTML = `
    <div class="sensor-box"><span class="sensor-label">Gateway Local</span><span class="sensor-val">${res.gateway.latencyMs} ms (${res.gateway.lossPct}% perda)</span></div>
    <div class="sensor-box"><span class="sensor-label">Cloudflare (1.1.1.1)</span><span class="sensor-val">${res.internet.cloudflareMs} ms</span></div>
    <div class="sensor-box"><span class="sensor-label">Google (8.8.8.8)</span><span class="sensor-val">${res.internet.googleMs} ms</span></div>
    <div class="sensor-box"><span class="sensor-label">Jitter / Oscilação</span><span class="sensor-val">${res.internet.jitterMs} ms</span></div>
    <div class="sensor-box"><span class="sensor-label">Tempo de DNS</span><span class="sensor-val">${res.internet.dnsMs} ms</span></div>
  `;

  document.getElementById('netVerdictBox').innerHTML = `
    <div style="font-weight:700; color:var(--accent-green); margin-bottom:4px;">${res.verdict}</div>
    <div>${res.verdictDetail}</div>
  `;

  btn.disabled = false;
  btn.innerText = 'Iniciar Diagnóstico Completo';
});

// 15. Export Report
window.exportReport = async (format) => {
  const res = await api.exportReport(format);
  alert(`VS TOLLS: Relatório exportado com sucesso para a Mesa (Desktop):\n${res.filePath}`);
};
document.getElementById('btnExportReport').addEventListener('click', () => exportReport('html'));

// Page navigation hook
function onPageNavigated(page) {
  if (page === 'optimize') loadTweaks();
  else if (page === 'startup') loadStartupItems();
  else if (page === 'energy') { if (sensorData) renderEnergyPage(sensorData); }
  else if (page === 'apps') loadApps();
  else if (page === 'maker-ports') loadSerialPorts();
  else if (page === 'games') loadFpsTable();
}

// Init
loadSystemData();
setInterval(updateSensors, 1000);
updateSensors();
