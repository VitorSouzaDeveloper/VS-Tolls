const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const USER_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const SYSTEM_AGENTS_DIR = '/Library/LaunchAgents';
const BACKUP_DIR = path.join(os.homedir(), '.vs_tolls', 'startup_backup');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function runAdminShell(cmd) {
  const escaped = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `do shell script "${escaped}" with administrator privileges`;
  execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { stdio: 'ignore' });
}

function parsePlist(filePath) {
  try {
    const raw = execSync(`/usr/bin/plutil -convert json -o - "${filePath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 1500
    });
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function getStartupItems() {
  ensureBackupDir();
  const items = [];

  const dirs = [
    { dir: USER_AGENTS_DIR, scope: 'Usuário' },
    { dir: SYSTEM_AGENTS_DIR, scope: 'Sistema' }
  ];

  for (const { dir, scope } of dirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.plist') && !file.endsWith('.plist.disabled')) continue;

        const fullPath = path.join(dir, file);
        const isDisabledByExt = file.endsWith('.disabled');
        const parsed = parsePlist(fullPath);

        const label = (parsed && parsed.Label) ? parsed.Label : file.replace('.plist', '').replace('.disabled', '');
        let prog = '';
        if (parsed) {
          if (parsed.Program) prog = parsed.Program;
          else if (parsed.ProgramArguments && parsed.ProgramArguments.length > 0) prog = parsed.ProgramArguments[0];
        }

        const enabled = !isDisabledByExt && !(parsed && parsed.Disabled === true);
        const isSystem = (scope === 'Sistema');

        items.push({
          id: label,
          fileName: file,
          filePath: fullPath,
          label,
          program: prog || 'Agente de Inicialização',
          scope,
          enabled,
          canModify: true,
          requiresAdmin: isSystem && (process.getuid() !== 0)
        });
      }
    } catch (err) {
      console.error(`Error reading ${dir}:`, err.message);
    }
  }

  // Also check backups available to restore
  const backups = [];
  try {
    const backupFiles = fs.readdirSync(BACKUP_DIR);
    for (const b of backupFiles) {
      if (b.endsWith('.plist')) {
        backups.push({
          name: b,
          path: path.join(BACKUP_DIR, b)
        });
      }
    }
  } catch (e) {}

  return { items, backups };
}

function toggleStartupItem(filePath, enable) {
  try {
    const isCurrentlyDisabled = filePath.endsWith('.disabled');
    const newPath = enable ? filePath.replace('.disabled', '') : `${filePath}.disabled`;

    if (enable === !isCurrentlyDisabled) {
      return { success: true, newPath: filePath };
    }

    if (filePath.startsWith(SYSTEM_AGENTS_DIR)) {
      runAdminShell(`mv "${filePath}" "${newPath}"`);
      return { success: true, newPath };
    }

    fs.renameSync(filePath, newPath);
    return { success: true, newPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function removeStartupItem(filePath) {
  ensureBackupDir();
  try {
    const isSystem = filePath.startsWith(SYSTEM_AGENTS_DIR);
    const fileName = path.basename(filePath);
    const prefix = isSystem ? 'system_' : 'user_';
    const backupPath = path.join(BACKUP_DIR, `${Date.now()}_${prefix}${fileName}`);
    
    // Copy to backup
    fs.copyFileSync(filePath, backupPath);

    if (isSystem) {
      runAdminShell(`rm "${filePath}"`);
      return { success: true, backupPath };
    }

    fs.unlinkSync(filePath);
    return { success: true, backupPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function restoreStartupItem(backupFileName) {
  try {
    const backupPath = path.join(BACKUP_DIR, backupFileName);
    if (!fs.existsSync(backupPath)) return { success: false, error: 'Arquivo de backup não encontrado' };

    const nameWithoutTimestamp = backupFileName.replace(/^\d+_/, '');
    const isSystem = nameWithoutTimestamp.startsWith('system_');
    const originalName = nameWithoutTimestamp.replace(/^(system_|user_)/, '');

    const targetDir = isSystem ? SYSTEM_AGENTS_DIR : USER_AGENTS_DIR;
    const targetPath = path.join(targetDir, originalName);

    if (isSystem) {
      runAdminShell(`cp "${backupPath}" "${targetPath}" && rm "${backupPath}"`);
      return { success: true, restoredPath: targetPath };
    }

    fs.copyFileSync(backupPath, targetPath);
    fs.unlinkSync(backupPath);
    return { success: true, restoredPath: targetPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  getStartupItems,
  toggleStartupItem,
  removeStartupItem,
  restoreStartupItem
};
