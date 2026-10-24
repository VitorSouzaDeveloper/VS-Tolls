const fs = require('fs');
const path = require('path');
const os = require('os');

const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, 'com.vstolls.launcher.plist');
const RUN_SCRIPT_PATH = path.join(__dirname, '..', '..', 'run-mac.sh');

function getAppTarget() {
  // Check if running from packaged .app
  if (process.execPath && process.execPath.includes('.app')) {
    return { isApp: true, exec: process.execPath };
  }
  // Check if VS Tolls is installed in /Applications
  const installedApp = '/Applications/VS Tolls.app/Contents/MacOS/VS Tolls';
  if (fs.existsSync(installedApp)) {
    return { isApp: true, exec: installedApp };
  }
  // Otherwise dev script
  return { isApp: false, exec: RUN_SCRIPT_PATH };
}

function getAutoStartStatus() {
  try {
    const exists = fs.existsSync(PLIST_PATH);
    let widgetOnly = true;
    if (exists) {
      const content = fs.readFileSync(PLIST_PATH, 'utf8');
      widgetOnly = content.includes('--widget');
    }
    return {
      enabled: exists,
      widgetOnly,
      plistPath: PLIST_PATH
    };
  } catch (err) {
    return { enabled: false, widgetOnly: true, error: err.message };
  }
}

function setAutoStart(enable, widgetOnly = true) {
  try {
    if (!enable) {
      if (fs.existsSync(PLIST_PATH)) {
        fs.unlinkSync(PLIST_PATH);
      }
      return { success: true, enabled: false };
    }

    if (!fs.existsSync(LAUNCH_AGENTS_DIR)) {
      fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
    }

    const target = getAppTarget();
    let programArgsXml = '';
    if (target.isApp) {
      const arg = widgetOnly ? '<string>--widget-only</string>' : '';
      programArgsXml = `    <string>${target.exec}</string>\n    ${arg}`;
    } else {
      const arg = widgetOnly ? '<string>--widget</string>' : '';
      programArgsXml = `    <string>/bin/bash</string>\n    <string>${target.exec}</string>\n    ${arg}`;
    }

    const plistXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vstolls.launcher</string>
  <key>ProgramArguments</key>
  <array>
${programArgsXml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/vs_tolls_autostart.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/vs_tolls_autostart_err.log</string>
</dict>
</plist>
`;

    fs.writeFileSync(PLIST_PATH, plistXml, 'utf8');
    return { success: true, enabled: true, widgetOnly };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  getAutoStartStatus,
  setAutoStart,
  PLIST_PATH
};
