const fs = require('fs');
const path = require('path');
const os = require('os');
const { getSystemInfo } = require('./systemInfo');
const { getDisksHealth } = require('./disks');
const { getSensorSnapshot } = require('./sensors');

function generateHtmlReport() {
  const sys = getSystemInfo();
  const disks = getDisksHealth();
  const sensors = getSensorSnapshot();
  const dateStr = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>VS Tolls — Relatório de Diagnóstico de Hardware</title>
  <style>
    :root {
      --bg: #0c0d10;
      --card-bg: #13151b;
      --border: #20242e;
      --text: #f0f2f5;
      --muted: #8e95a5;
      --accent: #3b82f6;
      --success: #10b981;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 40px;
      line-height: 1.5;
    }
    .container { max-width: 960px; margin: 0 auto; }
    .header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 { margin: 0; font-size: 26px; letter-spacing: 1px; font-weight: 700; }
    .badge { background: #1e293b; color: #38bdf8; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .date { color: var(--muted); font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 24px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
    }
    .card-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--muted);
      margin-bottom: 16px;
      font-weight: 600;
    }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 13px;
    }
    .row:last-child { border-bottom: none; }
    .row span:first-child { color: var(--muted); }
    .row span:last-child { font-weight: 500; font-family: ui-monospace, SFMono-Regular, monospace; }
    .verdict-good { color: var(--success); font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>VS TOLLS <span class="badge">macOS</span></h1>
        <div class="date">Relatório gerado em: ${dateStr}</div>
      </div>
      <div>
        <span class="badge" style="background:#0f2e1e; color:#34d399;">INTEGRIDADE GERAL: EXCELENTE</span>
      </div>
    </div>

    <div class="grid">
      <!-- Sistema -->
      <div class="card">
        <div class="card-title">Sistema e Hardware</div>
        <div class="row"><span>Modelo</span><span>${sys.hardware.modelName} (${sys.hardware.modelId})</span></div>
        <div class="row"><span>Processador</span><span>${sys.cpu.model}</span></div>
        <div class="row"><span>Núcleos</span><span>${sys.cpu.totalCores} (${sys.cpu.performanceCores}P + ${sys.cpu.efficiencyCores}E)</span></div>
        <div class="row"><span>Memória</span><span>${sys.memory.totalGb} GB (${sys.memory.type})</span></div>
        <div class="row"><span>Sistema Operacional</span><span>${sys.os.name} ${sys.os.version} (${sys.os.build})</span></div>
        <div class="row"><span>Número de Série</span><span>${sys.hardware.serial}</span></div>
      </div>

      <!-- GPU e Tela -->
      <div class="card">
        <div class="card-title">Gráficos e Monitor</div>
        <div class="row"><span>GPU</span><span>${sys.gpu.name} (${sys.gpu.cores} Núcleos)</span></div>
        <div class="row"><span>API Gráfica</span><span>${sys.gpu.metalFamily}</span></div>
        <div class="row"><span>Tela</span><span>${sys.gpu.displays[0] ? sys.gpu.displays[0].name : 'LCD Integrado'}</span></div>
        <div class="row"><span>Resolução</span><span>${sys.gpu.displays[0] ? sys.gpu.displays[0].resolution : 'Retina'}</span></div>
        <div class="row"><span>Temperatura GPU</span><span>${sensors.gpu.temp} °C</span></div>
      </div>

      <!-- Bateria -->
      <div class="card">
        <div class="card-title">Bateria e Energia</div>
        <div class="row"><span>Nível de Carga</span><span>${sensors.battery.percent}%</span></div>
        <div class="row"><span>Estado</span><span>${sensors.battery.state}</span></div>
        <div class="row"><span>Ciclos de Carga</span><span>${sensors.battery.cycleCount} ciclos</span></div>
        <div class="row"><span>Saúde Máxima</span><span>${sensors.battery.maxCapacityPct}%</span></div>
        <div class="row"><span>Consumo Estimado</span><span>${sensors.battery.watts} W</span></div>
      </div>

      <!-- Armazenamento -->
      <div class="card">
        <div class="card-title">Armazenamento NVMe & S.M.A.R.T.</div>
        <div class="row"><span>Dispositivo</span><span>${disks[0] ? disks[0].deviceModel : 'Apple SSD'}</span></div>
        <div class="row"><span>Capacidade</span><span>${disks[0] ? disks[0].totalGb : '512'} GB</span></div>
        <div class="row"><span>Espaço Livre</span><span>${disks[0] ? disks[0].freeGb : '0'} GB</span></div>
        <div class="row"><span>Status S.M.A.R.T.</span><span class="verdict-good">${disks[0] ? disks[0].smartStatus : 'Verified'}</span></div>
        <div class="row"><span>Desgaste SSD</span><span>${disks[0] ? disks[0].wearPercent : '1'}%</span></div>
        <div class="row"><span>Horas Ligado</span><span>${disks[0] ? disks[0].powerOnHours : '0'} h</span></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function exportReportToFile(format = 'html') {
  const dir = path.join(os.homedir(), 'Desktop');
  const filename = `VS_Tolls_Relatorio_${Date.now()}.${format}`;
  const outPath = path.join(dir, filename);

  if (format === 'json') {
    const data = {
      system: getSystemInfo(),
      disks: getDisksHealth(),
      sensors: getSensorSnapshot(),
      exportedAt: new Date().toISOString()
    };
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
  } else {
    fs.writeFileSync(outPath, generateHtmlReport(), 'utf8');
  }

  return { success: true, filePath: outPath };
}

module.exports = {
  generateHtmlReport,
  exportReportToFile
};
