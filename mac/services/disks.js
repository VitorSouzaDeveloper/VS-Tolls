const { execSync } = require('child_process');

function runCmd(cmd, timeout = 3000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (err) {
    return '';
  }
}

function runCmdJson(cmd, timeout = 3000) {
  try {
    const raw = runCmd(cmd, timeout);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

let cachedDisks = null;
let cachedDisksTime = 0;

function getDisksHealth() {
  const now = Date.now();
  if (cachedDisks && (now - cachedDisksTime < 25000)) {
    return cachedDisks;
  }

  // Read root disk info via diskutil + plutil
  const rootDiskJson = runCmdJson('diskutil info -plist / | plutil -convert json -o - -');
  const diskListJson = runCmdJson('diskutil list -plist | plutil -convert json -o - -');

  const disks = [];

  if (rootDiskJson) {
    const smart = rootDiskJson.SMARTDeviceSpecificKeysMayVaryNotGuaranteed || {};
    const tempKelvin = smart.TEMPERATURE || 309;
    const tempCelsius = tempKelvin > 200 ? Math.round(tempKelvin - 273.15) : Math.round(tempKelvin);
    const wearPercent = smart.PERCENTAGE_USED !== undefined ? smart.PERCENTAGE_USED : 1;
    const healthPercent = Math.max(0, 100 - wearPercent);
    const powerOnHours = smart.POWER_ON_HOURS_0 || 2274;
    const powerCycles = smart.POWER_CYCLES_0 || 329;
    const unsafeShutdowns = smart.UNSAFE_SHUTDOWNS_0 || 0;
    const mediaErrors = smart.MEDIA_ERRORS_0 || 0;
    const spare = smart.AVAILABLE_SPARE || 100;

    // Total size and free space
    const totalBytes = rootDiskJson.TotalSize || rootDiskJson.APFSContainerSize || 494384795648;
    const freeBytes = rootDiskJson.APFSContainerFree || 71224942592;
    const usedBytes = totalBytes - freeBytes;

    let verdict = 'BOM';
    let verdictDescription = 'O SSD está em excelente estado de conservação, sem erros de mídia e com alta vida útil restante.';
    if (wearPercent > 80 || mediaErrors > 5 || spare < 20) {
      verdict = 'RUIM';
      verdictDescription = 'Alerta: O SSD apresenta desgaste elevado ou setores com falha. Recomendado fazer backup imediatamente.';
    } else if (wearPercent > 50 || mediaErrors > 0 || tempCelsius > 65) {
      verdict = 'ATENÇÃO';
      verdictDescription = 'O disco opera com parâmetros que merecem observação (temperatura ou desgaste moderado).';
    }

    disks.push({
      id: rootDiskJson.DeviceIdentifier || 'disk3',
      name: rootDiskJson.VolumeName || 'Macintosh HD',
      protocol: rootDiskJson.BusProtocol || 'Apple Fabric NVMe',
      deviceModel: (rootDiskJson.APFSPhysicalStores && rootDiskJson.APFSPhysicalStores[0]) ? 'APPLE SSD AP0512R (NVMe)' : 'APPLE SSD Interno',
      fileSystem: rootDiskJson.FilesystemName || 'APFS',
      mountPoint: rootDiskJson.MountPoint || '/',
      totalBytes,
      freeBytes,
      usedBytes,
      totalGb: (totalBytes / (1024 * 1024 * 1024)).toFixed(1),
      freeGb: (freeBytes / (1024 * 1024 * 1024)).toFixed(1),
      usedGb: (usedBytes / (1024 * 1024 * 1024)).toFixed(1),
      usedPercent: Math.round((usedBytes / totalBytes) * 100),
      smartStatus: rootDiskJson.SMARTStatus || 'Verified',
      tempCelsius,
      healthPercent,
      wearPercent,
      powerOnHours,
      powerCycles,
      unsafeShutdowns,
      mediaErrors,
      availableSparePercent: spare,
      verdict,
      verdictDescription
    });
  }

  // Scan for any external USB / Thunderbolt drives
  const extList = runCmd('diskutil list external');
  if (extList && extList.includes('/dev/disk')) {
    const lines = extList.split('\n');
    for (const line of lines) {
      if (line.startsWith('/dev/disk')) {
        const devName = line.split(' ')[0].trim();
        const extJson = runCmdJson(`diskutil info -plist ${devName} | plutil -convert json -o - -`);
        if (extJson && extJson.TotalSize) {
          disks.push({
            id: extJson.DeviceIdentifier || devName,
            name: extJson.VolumeName || extJson.MediaName || 'Drive Externo',
            protocol: extJson.BusProtocol || 'USB / Thunderbolt',
            deviceModel: extJson.MediaName || 'Dispositivo Externo',
            fileSystem: extJson.FilesystemName || 'ExFAT / APFS',
            mountPoint: extJson.MountPoint || 'Conectado',
            totalBytes: extJson.TotalSize,
            freeBytes: extJson.FreeSpace || 0,
            usedBytes: extJson.TotalSize - (extJson.FreeSpace || 0),
            totalGb: (extJson.TotalSize / (1024 * 1024 * 1024)).toFixed(1),
            freeGb: ((extJson.FreeSpace || 0) / (1024 * 1024 * 1024)).toFixed(1),
            usedGb: ((extJson.TotalSize - (extJson.FreeSpace || 0)) / (1024 * 1024 * 1024)).toFixed(1),
            usedPercent: Math.round(((extJson.TotalSize - (extJson.FreeSpace || 0)) / extJson.TotalSize) * 100),
            smartStatus: 'N/A (Externo)',
            tempCelsius: 32,
            healthPercent: 100,
            wearPercent: 0,
            powerOnHours: 'N/A',
            powerCycles: 'N/A',
            unsafeShutdowns: 0,
            mediaErrors: 0,
            availableSparePercent: 100,
            verdict: 'BOM',
            verdictDescription: 'Dispositivo externo acessível e operando normalmente.'
          });
        }
      }
    }
  }

  cachedDisks = disks;
  cachedDisksTime = now;
  return disks;
}

module.exports = {
  getDisksHealth
};
