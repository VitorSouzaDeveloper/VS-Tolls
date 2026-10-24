const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const POPULAR_GAMES_CATALOG = [
  { id: 'cs2', name: 'Counter-Strike 2', baseFps1080p: 135, genre: 'FPS Tático', nativeMac: false, metalFx: true },
  { id: 'cyberpunk2077', name: 'Cyberpunk 2077 (Metal / CrossOver)', baseFps1080p: 52, genre: 'RPG / Ação', nativeMac: false, metalFx: true },
  { id: 'bg3', name: "Baldur's Gate 3 (Nativo Metal)", baseFps1080p: 68, genre: 'RPG', nativeMac: true, metalFx: true },
  { id: 're4remake', name: 'Resident Evil 4 Remake (Nativo Metal)', baseFps1080p: 62, genre: 'Terror / Ação', nativeMac: true, metalFx: true },
  { id: 'deathstranding', name: "Death Stranding: Director's Cut", baseFps1080p: 74, genre: 'Aventura', nativeMac: true, metalFx: true },
  { id: 'gtav', name: 'Grand Theft Auto V', baseFps1080p: 85, genre: 'Mundo Aberto', nativeMac: false, metalFx: false },
  { id: 'hades2', name: 'Hades II (Nativo Metal)', baseFps1080p: 120, genre: 'Roguelike', nativeMac: true, metalFx: false },
  { id: 'liesofp', name: 'Lies of P (Nativo Metal)', baseFps1080p: 65, genre: 'Souls-like', nativeMac: true, metalFx: true },
  { id: 'metroexodus', name: 'Metro Exodus (Nativo Metal)', baseFps1080p: 58, genre: 'FPS Pós-Apocalíptico', nativeMac: true, metalFx: false },
  { id: 'tombraider', name: 'Shadow of the Tomb Raider', baseFps1080p: 72, genre: 'Aventura / Ação', nativeMac: true, metalFx: false },
  { id: 'minecraft', name: 'Minecraft (Nativo Apple Silicon)', baseFps1080p: 140, genre: 'Sandbox', nativeMac: true, metalFx: false },
  { id: 'dota2', name: 'Dota 2 (Vulkan / Metal)', baseFps1080p: 110, genre: 'MOBA', nativeMac: true, metalFx: false },
  { id: 'worldofwarcraft', name: 'World of Warcraft (Nativo Metal)', baseFps1080p: 95, genre: 'MMORPG', nativeMac: true, metalFx: true },
  { id: 'nomanssky', name: "No Man's Sky (Nativo Metal)", baseFps1080p: 60, genre: 'Exploração Espacial', nativeMac: true, metalFx: true },
  { id: 'subnautica', name: 'Subnautica', baseFps1080p: 82, genre: 'Sobrevivência', nativeMac: true, metalFx: false },
  { id: 'witcher3', name: 'The Witcher 3: Wild Hunt', baseFps1080p: 55, genre: 'RPG', nativeMac: false, metalFx: false }
];

function getInstalledMacGames() {
  const games = [];

  // Check /Applications for games
  const appsDir = '/Applications';
  try {
    const apps = fs.readdirSync(appsDir);
    for (const app of apps) {
      if (app.endsWith('.app')) {
        const lower = app.toLowerCase();
        if (lower.includes('game') || lower.includes('steam') || lower.includes('baldurs') || 
            lower.includes('resident') || lower.includes('hades') || lower.includes('crossover') ||
            lower.includes('whisky') || lower.includes('artix') || lower.includes('tomb') ||
            lower.includes('minecraft') || lower.includes('wow') || lower.includes('blizzard')) {
          games.push({
            id: app.replace('.app', ''),
            name: app.replace('.app', ''),
            path: path.join(appsDir, app),
            source: 'Aplicações Mac',
            isNative: true,
            icon: 'gamepad'
          });
        }
      }
    }
  } catch (e) {}

  // Check Steam libraries on Mac
  const steamAppsDir = path.join(os.homedir(), 'Library', 'Application Support', 'Steam', 'steamapps', 'common');
  if (fs.existsSync(steamAppsDir)) {
    try {
      const dirs = fs.readdirSync(steamAppsDir);
      for (const d of dirs) {
        games.push({
          id: `steam_${d}`,
          name: d,
          path: path.join(steamAppsDir, d),
          source: 'Steam (macOS)',
          isNative: true,
          icon: 'steam'
        });
      }
    } catch (e) {}
  }

  return games;
}

function calculateEstimatedFps(gpuModel = 'Apple M1 Pro', resolution = '1080p', preset = 'Alta', metalFx = true) {
  // Scaling factors based on GPU
  let gpuMultiplier = 1.0;
  if (gpuModel.includes('M1 Max') || gpuModel.includes('M2 Max')) gpuMultiplier = 1.85;
  else if (gpuModel.includes('M3 Max') || gpuModel.includes('M4 Max')) gpuMultiplier = 2.4;
  else if (gpuModel.includes('M3 Pro') || gpuModel.includes('M2 Pro')) gpuMultiplier = 1.25;
  else if (gpuModel.includes('M1 Pro')) gpuMultiplier = 1.0;
  else if (gpuModel.includes('M1') || gpuModel.includes('M2') || gpuModel.includes('M3')) gpuMultiplier = 0.65;
  else if (gpuModel.includes('Radeon')) gpuMultiplier = 1.1;

  // Resolution factors
  let resMultiplier = 1.0;
  if (resolution === '1440p') resMultiplier = 0.68;
  else if (resolution === '4K') resMultiplier = 0.38;

  // Preset factors
  let presetMultiplier = 1.0;
  if (preset === 'Baixa') presetMultiplier = 1.35;
  else if (preset === 'Média') presetMultiplier = 1.15;
  else if (preset === 'Ultra') presetMultiplier = 0.82;

  // Upscaling factor (MetalFX / FSR)
  const upscalingMultiplier = metalFx ? 1.32 : 1.0;

  return POPULAR_GAMES_CATALOG.map(game => {
    const rawFps = game.baseFps1080p * gpuMultiplier * resMultiplier * presetMultiplier * (game.metalFx ? upscalingMultiplier : 1.0);
    const avgFps = Math.max(20, Math.round(rawFps));
    const low1Pct = Math.max(14, Math.round(avgFps * 0.72));

    return {
      id: game.id,
      name: game.name,
      genre: game.genre,
      nativeMac: game.nativeMac,
      avgFps,
      low1Pct,
      resolution,
      preset,
      metalFxActive: game.metalFx && metalFx
    };
  });
}

function analyzeBottleneck(cpuLoad, gpuLoad, memPressure, isThrottled) {
  let bottleneck = 'EQUILIBRADO';
  let cpuLimitPct = 48;
  let gpuLimitPct = 52;
  let verdict = 'Excelente equilíbrio entre CPU e GPU. O sistema distribui as cargas de computação e gráficos com folga.';
  let recommendations = [
    'A arquitetura de Memória Unificada do Apple Silicon elimina o gargalo tradicional de transferência PCIe.',
    'Mantenha a ventilação desobstruída para garantir 100% de sustentação em sessões longas de jogos.'
  ];

  if (isThrottled) {
    bottleneck = 'LIMITADOR TÉRMICO';
    verdict = 'O sistema ativou o limitador térmico (Thermal Throttling) para reduzir o calor. A performance pode cair até estabilizar.';
    recommendations.unshift('Use uma base refrigerada ou eleve a traseira do MacBook para aumentar o fluxo de ar nos dutos laterais.');
  } else if (gpuLoad > 92 && cpuLoad < 50) {
    bottleneck = 'LIMITADO POR GPU';
    gpuLimitPct = 82;
    cpuLimitPct = 18;
    verdict = 'A GPU está operando no limite enquanto a CPU possui capacidade ociosa.';
    recommendations.push('Ative o MetalFX Upscaling ou reduza a resolução interna/sombras para ganhar mais FPS.');
  } else if (cpuLoad > 85 && gpuLoad < 60) {
    bottleneck = 'LIMITADO POR CPU';
    cpuLimitPct = 78;
    gpuLimitPct = 22;
    verdict = 'A CPU está sendo exigida ao máximo por cálculos de física, IA ou emulação de instruções x86_64.';
    recommendations.push('Dê preferência a versões nativas para Apple Silicon (ARM64) em vez de jogos rodando via Rosetta 2.');
  }

  return {
    verdictType: bottleneck,
    cpuLimitPct,
    gpuLimitPct,
    verdict,
    recommendations
  };
}

function launchGame(gamePath) {
  try {
    spawn('open', [gamePath], { detached: true, stdio: 'ignore' }).unref();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  POPULAR_GAMES_CATALOG,
  getInstalledMacGames,
  calculateEstimatedFps,
  analyzeBottleneck,
  launchGame
};
