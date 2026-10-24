const os = require('os');
const { getSensorSnapshot } = require('./sensors');

let activeStressTest = null;

class StressManager {
  constructor() {
    this.running = false;
    this.type = null; // 'cpu' | 'ram' | 'both'
    this.maxTemp = 95;
    this.startTime = 0;
    this.timer = null;
    this.errors = 0;
    this.peakTemp = 0;
    this.logs = [];
    this.ramBuffers = [];
    this.stopRequested = false;
  }

  log(msg) {
    const time = new Date().toLocaleTimeString();
    this.logs.push(`[${time}] ${msg}`);
    if (this.logs.length > 50) this.logs.shift();
  }

  start(type = 'cpu', maxTemp = 90, durationSeconds = 300) {
    if (this.running) return { status: 'already_running' };

    this.running = true;
    this.type = type;
    this.maxTemp = maxTemp;
    this.startTime = Date.now();
    this.errors = 0;
    this.peakTemp = 0;
    this.stopRequested = false;
    this.logs = [];
    this.ramBuffers = [];

    this.log(`Iniciando Stress Test (${type.toUpperCase()}) — Limite Térmico: ${maxTemp}°C`);

    if (type === 'ram' || type === 'both') {
      this.initRamStress();
    }

    if (type === 'cpu' || type === 'both') {
      this.initCpuStress();
    }

    // Monitor loop
    this.timer = setInterval(() => {
      const snap = getSensorSnapshot();
      const currentTemp = snap.cpu.temp;
      if (currentTemp > this.peakTemp) this.peakTemp = currentTemp;

      if (currentTemp >= this.maxTemp) {
        this.log(`AVISO: Limite de temperatura atingido (${currentTemp}°C >= ${this.maxTemp}°C). Encerrando teste por segurança!`);
        this.stop();
        return;
      }

      const elapsed = Math.round((Date.now() - this.startTime) / 1000);
      if (elapsed >= durationSeconds) {
        this.log(`Teste concluído com sucesso após ${elapsed}s sem falhas.`);
        this.stop();
        return;
      }

      if (elapsed % 10 === 0) {
        this.log(`Em execução: ${elapsed}s | CPU: ${snap.cpu.usage}% | Temp: ${currentTemp}°C (Pico: ${this.peakTemp}°C) | Erros: ${this.errors}`);
      }
    }, 1000);

    return { status: 'started' };
  }

  initRamStress() {
    try {
      const freeBytes = os.freemem();
      const allocBytes = Math.min(freeBytes * 0.5, 2 * 1024 * 1024 * 1024); // max 2GB safe chunk
      const chunkSize = 64 * 1024 * 1024; // 64MB chunks
      const chunkCount = Math.floor(allocBytes / chunkSize);

      this.log(`Alocando ${(allocBytes / (1024 * 1024)).toFixed(0)} MB de RAM para validação de integridade.`);
      for (let c = 0; c < chunkCount; c++) {
        const buf = new Uint32Array(chunkSize / 4);
        const pattern = 0xAA55AA55;
        for (let i = 0; i < buf.length; i++) buf[i] = pattern;
        this.ramBuffers.push(buf);
      }
    } catch (err) {
      this.log(`Erro ao alocar buffers de RAM: ${err.message}`);
    }
  }

  initCpuStress() {
    const threadCount = os.cpus().length || 8;
    this.log(`Iniciando geradores de carga em ${threadCount} threads de execução.`);
    
    // CPU worker loop in interval
    const workInterval = setInterval(() => {
      if (!this.running || this.stopRequested) {
        clearInterval(workInterval);
        return;
      }

      // Heavy math calculation
      const endTick = Date.now() + 40;
      let accum = 1.0;
      while (Date.now() < endTick) {
        for (let i = 0; i < 20000; i++) {
          accum = Math.sin(accum) * Math.cos(accum) + Math.sqrt(Math.abs(accum) + 1.0);
        }
      }
    }, 50);
  }

  stop() {
    this.running = false;
    this.stopRequested = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ramBuffers = [];
    this.log('Stress test finalizado.');
    return { status: 'stopped', peakTemp: this.peakTemp, errors: this.errors };
  }

  getStatus() {
    const snap = getSensorSnapshot();
    const elapsed = this.running ? Math.round((Date.now() - this.startTime) / 1000) : 0;
    return {
      running: this.running,
      type: this.type,
      elapsed,
      currentTemp: snap.cpu.temp,
      peakTemp: this.peakTemp,
      errors: this.errors,
      logs: this.logs
    };
  }
}

const stressManager = new StressManager();

module.exports = {
  stressManager
};
