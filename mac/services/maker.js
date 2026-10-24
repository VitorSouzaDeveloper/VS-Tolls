const fs = require('fs');
const { execSync } = require('child_process');

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (err) {
    return '';
  }
}

function scanSerialPorts() {
  const ports = [];

  try {
    const devFiles = fs.readdirSync('/dev');
    const serialFiles = devFiles.filter(f => f.startsWith('cu.') || f.startsWith('tty.'));

    for (const f of serialFiles) {
      // Filter out standard bluetooth and debug ports from priority view
      const isUsb = f.includes('usb') || f.includes('SLAB') || f.includes('wch') || f.includes('Arduino') || f.includes('modem');
      const fullPath = `/dev/${f}`;

      let chip = 'Porta Serial Padrão';
      let desc = 'Dispositivo de comunicação serial do sistema.';

      if (f.toLowerCase().includes('wch') || f.toLowerCase().includes('ch34')) {
        chip = 'WCH CH340 / CH341';
        desc = 'Conversor USB-Serial popular em clones Arduino Nano, Uno e placas NodeMCU / ESP8266.';
      } else if (f.toLowerCase().includes('slab') || f.toLowerCase().includes('cp210')) {
        chip = 'Silicon Labs CP2102 / CP2104';
        desc = 'Conversor de alta velocidade muito utilizado em placas ESP32 e módulos industriais.';
      } else if (f.toLowerCase().includes('ftdi') || f.toLowerCase().includes('usbserial')) {
        chip = 'FTDI FT232R / FT232H';
        desc = 'Chip serial FTDI oficial de alta confiabilidade.';
      } else if (f.toLowerCase().includes('usbmodem') || f.toLowerCase().includes('arduino')) {
        chip = 'Arduino CDC (Nativo)';
        desc = 'Arduino com chip USB nativo (Uno R3/R4, Leonardo, Mega 2560 ou Raspberry Pi Pico).';
      } else if (f.toLowerCase().includes('bluetooth')) {
        chip = 'Bluetooth Serial';
        desc = 'Porta serial de dispositivo emparelhado por Bluetooth.';
      }

      // Check if port is locked by another process
      const lockCheck = runCmd(`lsof "${fullPath}" 2>/dev/null`);
      const isLocked = lockCheck.length > 0;
      let lockedBy = '';
      if (isLocked) {
        const lines = lockCheck.split('\n');
        if (lines.length > 1) {
          const parts = lines[1].trim().split(/\s+/);
          lockedBy = `${parts[0]} (PID ${parts[1]})`;
        }
      }

      ports.push({
        name: f,
        path: fullPath,
        chip,
        description: desc,
        isUsb,
        isLocked,
        lockedBy
      });
    }
  } catch (err) {
    console.error('Error scanning serial ports:', err);
  }

  // Sort USB / Arduino ports to the top
  ports.sort((a, b) => (b.isUsb ? 1 : 0) - (a.isUsb ? 1 : 0));

  return ports;
}

function releaseLockedPort(portPath) {
  try {
    const lockCheck = runCmd(`lsof -t "${portPath}" 2>/dev/null`);
    if (lockCheck) {
      const pids = lockCheck.split('\n').filter(Boolean);
      for (const pid of pids) {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
      return { success: true, message: `Porta ${portPath} liberada com sucesso (processos finalizados).` };
    }
    return { success: true, message: 'A porta já se encontra livre.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

const DRIVER_INFO = [
  {
    chip: 'CH340 / CH341 (WCH)',
    status: 'Driver nativo no macOS 12+ (AppleUSBCH34x).',
    recommendation: 'Placas com CH340 funcionam nativamente na maioria das versões do macOS. Se a porta não aparecer, baixe o instalador oficial assinado da WCH.',
    officialUrl: 'https://www.wch-ic.com/downloads/CH341SER_MAC_ZIP.html'
  },
  {
    chip: 'CP2102 / CP210x (Silicon Labs)',
    status: 'Compatível via DriverKit / VCP Driver.',
    recommendation: 'Para ESP32 e NodeMCU com CP210x, o macOS suporta via Silicon Labs VCP Driver assinado para Apple Silicon.',
    officialUrl: 'https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers'
  },
  {
    chip: 'FTDI (FT232R / FT2232H)',
    status: 'Suporte nativo pelo driver AppleUSBFTDI.',
    recommendation: 'O macOS reconhece dispositivos FTDI genuínos automaticamente sem necessidade de instalar drivers externos.',
    officialUrl: 'https://ftdichip.com/drivers/vcp-drivers/'
  },
  {
    chip: 'Arduino Oficial (Uno R3/R4, Leonardo, Mega)',
    status: '100% Plug-and-Play (Protocolo USB CDC-ACM).',
    recommendation: 'Funciona nativamente em qualquer Mac sem nenhum driver adicional. Basta conectar e selecionar no Arduino IDE.',
    officialUrl: 'https://www.arduino.cc/en/software'
  }
];

module.exports = {
  scanSerialPorts,
  releaseLockedPort,
  DRIVER_INFO
};
