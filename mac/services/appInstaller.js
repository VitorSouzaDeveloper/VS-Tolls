const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const APPS_CATALOG = [
  { id: 'steam', name: 'Steam', cask: 'steam', appPath: '/Applications/Steam.app', desc: 'Plataforma oficial de jogos para Mac' },
  { id: 'google-chrome', name: 'Google Chrome', cask: 'google-chrome', appPath: '/Applications/Google Chrome.app', desc: 'Navegador web rápido e sincronizado' },
  { id: 'discord', name: 'Discord', cask: 'discord', appPath: '/Applications/Discord.app', desc: 'Comunicação e chat de voz para gamers e criadores' },
  { id: 'vlc', name: 'VLC Media Player', cask: 'vlc', appPath: '/Applications/VLC.app', desc: 'Reprodutor de áudio e vídeo universal sem codecs extras' },
  { id: 'visual-studio-code', name: 'Visual Studio Code', cask: 'visual-studio-code', appPath: '/Applications/Visual Studio Code.app', desc: 'Editor de código moderno da Microsoft' },
  { id: 'keka', name: 'Keka (7-Zip / RAR para Mac)', cask: 'keka', appPath: '/Applications/Keka.app', desc: 'Compressor e extrator rápido de arquivos 7Z, RAR, ZIP' },
  { id: 'shottr', name: 'Shottr (Captura / Lightshot)', cask: 'shottr', appPath: '/Applications/Shottr.app', desc: 'Captura de tela ultraleve com anotações e medições' },
  { id: 'spotify', name: 'Spotify', cask: 'spotify', appPath: '/Applications/Spotify.app', desc: 'Streaming de música e podcasts' },
  { id: 'obs', name: 'OBS Studio', cask: 'obs', appPath: '/Applications/OBS.app', desc: 'Gravação de tela e streaming ao vivo' },
  { id: 'blender', name: 'Blender', cask: 'blender', appPath: '/Applications/Blender.app', desc: 'Criação e modelagem 3D otimizada para Apple Silicon' }
];

function getInstalledStatus() {
  return APPS_CATALOG.map(app => {
    const installed = fs.existsSync(app.appPath);
    return {
      ...app,
      installed
    };
  });
}

function installApp(appId, onData, onDone) {
  const app = APPS_CATALOG.find(a => a.id === appId);
  if (!app) {
    if (onDone) onDone(new Error('App não encontrado no catálogo'));
    return;
  }

  const brewPath = fs.existsSync('/opt/homebrew/bin/brew') ? '/opt/homebrew/bin/brew' : 'brew';
  const child = spawn(brewPath, ['install', '--cask', app.cask], {
    env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` }
  });

  child.stdout.on('data', (d) => {
    if (onData) onData(d.toString());
  });

  child.stderr.on('data', (d) => {
    if (onData) onData(d.toString());
  });

  child.on('close', (code) => {
    if (onDone) onDone(null, code === 0);
  });
}

module.exports = {
  APPS_CATALOG,
  getInstalledStatus,
  installApp
};
