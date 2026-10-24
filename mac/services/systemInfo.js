const { execSync, exec } = require('child_process');
const os = require('os');

function runCmd(cmd, timeout = 3000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (err) {
    return '';
  }
}

function runCmdJson(cmd, timeout = 4000) {
  try {
    const raw = runCmd(cmd, timeout);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function getSystemInfo() {
  const cpus = os.cpus();
  const cpuModel = runCmd('sysctl -n machdep.cpu.brand_string') || (cpus[0] ? cpus[0].model : 'Apple Silicon');
  const arch = os.arch();
  const totalMemBytes = os.totalmem();
  const totalMemGb = (totalMemBytes / (1024 * 1024 * 1024)).toFixed(1);
  const freeMemBytes = os.freemem();
  const freeMemGb = (freeMemBytes / (1024 * 1024 * 1024)).toFixed(1);
  
  // OS Details
  const osType = runCmd('sw_vers -productName') || 'macOS';
  const osVer = runCmd('sw_vers -productVersion') || os.release();
  const osBuild = runCmd('sw_vers -buildVersion') || '';
  const kernelVer = os.release();
  const hostname = os.hostname();
  const uptimeSeconds = os.uptime();

  // Hardware Overview via system_profiler
  const hwJson = runCmdJson('system_profiler -json SPHardwareDataType');
  const hwObj = (hwJson && hwJson.SPHardwareDataType && hwJson.SPHardwareDataType[0]) ? hwJson.SPHardwareDataType[0] : {};

  const modelName = hwObj.machine_name || 'MacBook Pro';
  const modelId = hwObj.machine_model || 'Apple Mac';
  const modelNumber = hwObj.model_number || '';
  const serial = hwObj.serial_number || 'N/A';
  const hardwareUuid = hwObj.platform_UUID || '';
  const bootRom = hwObj.boot_rom_version || '';
  const chipType = hwObj.chip_type || cpuModel;

  // Performance vs Efficiency cores
  const pCores = parseInt(runCmd('sysctl -n hw.perflevel0.physicalcpu') || '0', 10);
  const eCores = parseInt(runCmd('sysctl -n hw.perflevel1.physicalcpu') || '0', 10);
  const totalPhysicalCores = parseInt(runCmd('sysctl -n hw.physicalcpu') || `${cpus.length}`, 10);
  const totalLogicalCores = parseInt(runCmd('sysctl -n hw.logicalcpu') || `${cpus.length}`, 10);

  // Cache sizes
  const pL1i = parseInt(runCmd('sysctl -n hw.perflevel0.l1icachesize') || '0', 10);
  const pL1d = parseInt(runCmd('sysctl -n hw.perflevel0.l1dcachesize') || '0', 10);
  const pL2 = parseInt(runCmd('sysctl -n hw.perflevel0.l2cachesize') || '0', 10);
  const eL2 = parseInt(runCmd('sysctl -n hw.perflevel1.l2cachesize') || '0', 10);

  // Displays & GPU via system_profiler
  const dispJson = runCmdJson('system_profiler -json SPDisplaysDataType');
  const gpus = (dispJson && dispJson.SPDisplaysDataType) ? dispJson.SPDisplaysDataType : [];
  const primaryGpu = gpus[0] || {};
  const gpuName = primaryGpu._name || primaryGpu.sppci_model || 'Apple M-Series GPU';
  const gpuCores = primaryGpu.sppci_cores || (chipType.includes('Max') ? '32' : chipType.includes('Pro') ? '14' : '8');
  const metalSupport = primaryGpu.spdisplays_mtlgpufamilysupport ? primaryGpu.spdisplays_mtlgpufamilysupport.replace('spdisplays_', '').toUpperCase() : 'Metal 4';
  
  let displaysList = [];
  if (primaryGpu.spdisplays_ndrvs) {
    displaysList = primaryGpu.spdisplays_ndrvs.map(d => ({
      name: d._name || 'Tela Integrada',
      resolution: d._spdisplays_resolution || d._spdisplays_pixels || 'Retina',
      pixels: d._spdisplays_pixels || '',
      type: d.spdisplays_display_type ? d.spdisplays_display_type.replace('spdisplays_', '') : 'Liquid Retina XDR',
      main: d.spdisplays_main === 'spdisplays_yes'
    }));
  }

  // Storage summary
  const storageJson = runCmdJson('system_profiler -json SPStorageDataType');
  const storageList = (storageJson && storageJson.SPStorageDataType) ? storageJson.SPStorageDataType.map(s => ({
    name: s._name || 'Macintosh HD',
    fileSystem: s.file_system || 'APFS',
    mountPoint: s.mount_point || '/',
    totalBytes: s.size_in_bytes || 0,
    freeBytes: s.free_space_in_bytes || 0,
    smartStatus: (s.physical_drive && s.physical_drive.smart_status) ? s.physical_drive.smart_status : 'Verified',
    device: (s.physical_drive && s.physical_drive.device_name) ? s.physical_drive.device_name : 'Apple SSD'
  })) : [];

  return {
    os: {
      name: osType,
      version: osVer,
      build: osBuild,
      kernel: kernelVer,
      hostname,
      uptime: uptimeSeconds,
      platform: os.platform(),
      arch
    },
    hardware: {
      modelName,
      modelId,
      modelNumber,
      serial,
      uuid: hardwareUuid,
      bootRom,
      chipType
    },
    cpu: {
      model: chipType || cpuModel,
      brand: cpuModel,
      totalCores: totalPhysicalCores,
      logicalCores: totalLogicalCores,
      performanceCores: pCores,
      efficiencyCores: eCores,
      arch,
      cache: {
        pL1iKb: pL1i ? pL1i / 1024 : 192,
        pL1dKb: pL1d ? pL1d / 1024 : 128,
        pL2Mb: pL2 ? (pL2 / (1024 * 1024)).toFixed(0) : '12',
        eL2Mb: eL2 ? (eL2 / (1024 * 1024)).toFixed(0) : '4'
      }
    },
    memory: {
      totalBytes: totalMemBytes,
      totalGb: totalMemGb,
      freeGb: freeMemGb,
      type: arch === 'arm64' ? 'LPDDR5 Unified Memory' : 'DDR4',
      unified: arch === 'arm64'
    },
    gpu: {
      name: gpuName,
      cores: gpuCores,
      metalFamily: metalSupport,
      displays: displaysList
    },
    storage: storageList
  };
}

module.exports = {
  getSystemInfo
};
