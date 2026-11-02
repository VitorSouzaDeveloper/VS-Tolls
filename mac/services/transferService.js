const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const dgram = require('dgram');
const QRCode = require('qrcode');
const ws = require('ws');
const { EventEmitter } = require('events');

class TransferService extends EventEmitter {
  constructor() {
    super();
    this.destinationFolder = path.join(os.homedir(), 'Downloads', 'VS-Drop');
    this.ensureDestinationFolder();

    this.deviceId = 'mac_' + (os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '') || 'vstolls') + '_' + Math.random().toString(36).substring(2, 6);
    this.deviceName = os.hostname().replace(/\.local$/i, '') || 'MacBook Pro';
    this.visibility = 'everyone'; // 'everyone' | 'paired' | 'hidden'
    this.pairedDeviceIds = new Set();
    this.discoveredPeers = new Map(); // id -> { id, name, platform, ip, port, lastSeen, isPaired }
    this.udpSocket = null;
    this.discoveryPort = 8765;
    this.discoveryInterval = null;
    this.pruneInterval = null;

    this.outgoingFiles = new Map(); // id -> { id, name, size, path, addedAt, mimeType, downloadCount }
    this.receivedFiles = []; // array of { id, name, size, path, receivedAt, sender }
    this.recentTexts = []; // array of { id, text, from, timestamp }
    this.connectedClients = new Map(); // ws -> { id, role, deviceName, ip, connectedAt }

    this.wss = null;
    this.currentPort = 3000;
  }

  ensureDestinationFolder() {
    try {
      if (!fs.existsSync(this.destinationFolder)) {
        fs.mkdirSync(this.destinationFolder, { recursive: true });
      }
    } catch (err) {
      console.error('[VS Drop] Erro ao criar pasta de destino:', err.message);
    }
  }

  setDestinationFolder(newPath) {
    if (!newPath || typeof newPath !== 'string') return { success: false, error: 'Caminho inválido' };
    try {
      if (!fs.existsSync(newPath)) {
        fs.mkdirSync(newPath, { recursive: true });
      }
      this.destinationFolder = newPath;
      this.broadcast({
        type: 'folder_updated',
        destinationFolder: this.destinationFolder
      });
      return { success: true, destinationFolder: this.destinationFolder };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getDestinationFolder() {
    return this.destinationFolder;
  }

  getLanAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    let primaryIp = null;

    // Prioritize en0 (common default Wi-Fi on macOS)
    if (interfaces['en0']) {
      for (const iface of interfaces['en0']) {
        if (iface.family === 'IPv4' && !iface.internal) {
          primaryIp = iface.address;
          addresses.push({ iface: 'en0', address: iface.address });
        }
      }
    }

    for (const [name, ifaceList] of Object.entries(interfaces)) {
      if (name === 'en0') continue;
      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({ iface: name, address: iface.address });
          if (!primaryIp) {
            primaryIp = iface.address;
          }
        }
      }
    }

    if (!primaryIp) primaryIp = '127.0.0.1';

    return {
      primaryIp,
      addresses
    };
  }

  getUrl(port = this.currentPort) {
    const { primaryIp } = this.getLanAddresses();
    return `http://${primaryIp}:${port}/drop`;
  }

  async getQrCodeDataUrl(url) {
    try {
      return await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 2,
        scale: 7,
        color: {
          dark: '#0c0d10',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error('[VS Drop] Erro ao gerar QRCode:', err);
      return '';
    }
  }

  getMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const map = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.heic': 'image/heic',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.m4v': 'video/x-m4v',
      '.mkv': 'video/x-matroska',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.dmg': 'application/x-apple-diskimage',
      '.pkg': 'application/octet-stream',
      '.ipa': 'application/octet-stream',
      '.apk': 'application/vnd.android.package-archive',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json'
    };
    return map[ext] || 'application/octet-stream';
  }

  parseDeviceName(userAgent) {
    if (!userAgent) return 'Dispositivo Móvel';
    const ua = userAgent.toLowerCase();
    if (ua.includes('iphone')) return 'iPhone (iOS)';
    if (ua.includes('ipad')) return 'iPad (iPadOS)';
    if (ua.includes('android')) {
      if (ua.includes('samsung')) return 'Samsung Galaxy (Android)';
      if (ua.includes('pixel')) return 'Google Pixel (Android)';
      if (ua.includes('xiaomi') || ua.includes('redmi')) return 'Xiaomi (Android)';
      if (ua.includes('motorola') || ua.includes('moto')) return 'Motorola (Android)';
      return 'Android Smartphone';
    }
    if (ua.includes('macintosh') || ua.includes('mac os')) return 'MacBook / Mac';
    if (ua.includes('windows')) return 'PC Windows';
    if (ua.includes('linux')) return 'Linux';
    return 'Navegador Web';
  }

  // --- Outgoing Management (Mac -> Mobile) ---

  addOutgoingFileFromPath(filePath) {
    try {
      if (!fs.existsSync(filePath)) return { success: false, error: 'Arquivo não encontrado no disco' };
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        return { success: false, error: 'Por favor, selecione arquivos individuais ou comprima a pasta em .zip' };
      }

      const id = 'f_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      const name = path.basename(filePath);
      const item = {
        id,
        name,
        size: stats.size,
        path: filePath,
        mimeType: this.getMimeType(name),
        addedAt: Date.now(),
        downloadCount: 0
      };

      this.outgoingFiles.set(id, item);
      this.broadcastOutgoingFiles();
      return { success: true, file: this.serializeOutgoingFile(item) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  addOutgoingFilesFromPaths(paths) {
    const results = [];
    if (Array.isArray(paths)) {
      for (const p of paths) {
        results.push(this.addOutgoingFileFromPath(p));
      }
    }
    return results;
  }

  removeOutgoingFile(id) {
    const deleted = this.outgoingFiles.delete(id);
    if (deleted) {
      this.broadcastOutgoingFiles();
    }
    return { success: deleted };
  }

  clearOutgoingFiles() {
    this.outgoingFiles.clear();
    this.broadcastOutgoingFiles();
    return { success: true };
  }

  serializeOutgoingFile(item) {
    return {
      id: item.id,
      name: item.name,
      size: item.size,
      mimeType: item.mimeType,
      addedAt: item.addedAt,
      downloadCount: item.downloadCount
    };
  }

  getOutgoingFilesSummary() {
    const list = [];
    for (const item of this.outgoingFiles.values()) {
      list.push(this.serializeOutgoingFile(item));
    }
    return list;
  }

  broadcastOutgoingFiles() {
    this.broadcast({
      type: 'outgoing_files_updated',
      files: this.getOutgoingFilesSummary()
    });
  }

  handleDownload(req, res, fileId) {
    const file = this.outgoingFiles.get(fileId);
    if (!file || !fs.existsSync(file.path)) {
      res.status(404).send('Arquivo não encontrado ou removido.');
      return;
    }

    file.downloadCount++;
    this.broadcastOutgoingFiles();

    const fileNameEncoded = encodeURIComponent(file.name);
    res.setHeader('Content-Disposition', `attachment; filename="${fileNameEncoded}"; filename*=UTF-8''${fileNameEncoded}`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', file.size);

    const stream = fs.createReadStream(file.path);
    let bytesSent = 0;
    let lastBroadcast = 0;
    const startTime = Date.now();

    stream.on('data', (chunk) => {
      bytesSent += chunk.length;
      const now = Date.now();
      if (now - lastBroadcast > 200) {
        lastBroadcast = now;
        const elapsedSec = Math.max(0.1, (now - startTime) / 1000);
        const speed = bytesSent / elapsedSec; // bytes/sec
        const percent = Math.min(100, Math.round((bytesSent / file.size) * 100));

        this.broadcast({
          type: 'download_progress',
          fileId: file.id,
          fileName: file.name,
          bytesSent,
          totalBytes: file.size,
          speed,
          percent
        });
      }
    });

    stream.on('end', () => {
      this.broadcast({
        type: 'download_completed',
        fileId: file.id,
        fileName: file.name,
        totalBytes: file.size
      });
    });

    stream.on('error', (err) => {
      console.error('[VS Drop] Erro no stream de download:', err);
      if (!res.headersSent) res.status(500).send('Erro na leitura do arquivo.');
    });

    stream.pipe(res);
  }

  // --- Incoming Uploads (Mobile -> Mac) ---

  handleIncomingUpload(req, res) {
    const rawFileName = req.query.filename || req.headers['x-file-name'] || ('arquivo_' + Date.now());
    let cleanName = 'arquivo';
    try {
      cleanName = path.basename(decodeURIComponent(rawFileName));
    } catch (e) {
      cleanName = path.basename(rawFileName);
    }
    if (!cleanName || cleanName === '.' || cleanName === '..') cleanName = 'arquivo_' + Date.now();

    this.ensureDestinationFolder();

    // Generate unique filename to avoid overwrites
    let finalName = cleanName;
    let targetPath = path.join(this.destinationFolder, finalName);
    const ext = path.extname(cleanName);
    const base = path.basename(cleanName, ext);
    let count = 1;
    while (fs.existsSync(targetPath)) {
      finalName = `${base} (${count})${ext}`;
      targetPath = path.join(this.destinationFolder, finalName);
      count++;
    }

    const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const totalBytes = parseInt(req.headers['content-length'] || req.query.filesize || 0, 10);
    const clientUa = req.headers['user-agent'] || '';
    const sender = this.parseDeviceName(clientUa);

    const writeStream = fs.createWriteStream(targetPath);
    let receivedBytes = 0;
    let lastBroadcast = 0;
    const startTime = Date.now();

    this.broadcast({
      type: 'upload_started',
      id: uploadId,
      filename: finalName,
      totalBytes,
      sender
    });

    req.on('data', (chunk) => {
      receivedBytes += chunk.length;
      const now = Date.now();
      if (now - lastBroadcast > 150) {
        lastBroadcast = now;
        const elapsedSec = Math.max(0.1, (now - startTime) / 1000);
        const speed = receivedBytes / elapsedSec; // bytes/sec
        const percent = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0;

        this.broadcast({
          type: 'upload_progress',
          id: uploadId,
          filename: finalName,
          receivedBytes,
          totalBytes,
          speed,
          percent,
          sender
        });
      }
    });

    req.on('aborted', () => {
      writeStream.destroy();
      try {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      } catch (e) {}
      this.broadcast({
        type: 'upload_aborted',
        id: uploadId,
        filename: finalName
      });
    });

    writeStream.on('error', (err) => {
      console.error('[VS Drop] Erro ao gravar upload:', err);
      try {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      } catch (e) {}
      this.broadcast({
        type: 'upload_error',
        id: uploadId,
        filename: finalName,
        error: err.message
      });
      if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
    });

    writeStream.on('finish', () => {
      const fileRecord = {
        id: uploadId,
        name: finalName,
        size: receivedBytes,
        path: targetPath,
        receivedAt: Date.now(),
        sender
      };

      // Ensure no duplicate file record in receivedFiles
      const isDuplicate = this.receivedFiles.some(f => f.id === uploadId || (f.path === targetPath && Math.abs(f.receivedAt - fileRecord.receivedAt) < 3000));
      if (!isDuplicate) {
        this.receivedFiles.unshift(fileRecord);
        if (this.receivedFiles.length > 50) this.receivedFiles.pop();
      }

      this.broadcast({
        type: 'upload_completed',
        file: fileRecord
      });

      this.emit('file_received', fileRecord);

      res.json({
        success: true,
        file: fileRecord
      });
    });

    req.pipe(writeStream);
  }

  getReceivedFiles() {
    return this.receivedFiles;
  }

  clearReceivedFiles() {
    this.receivedFiles = [];
    this.broadcast({
      type: 'received_files_cleared'
    });
    return { success: true };
  }

  // --- Text & Clipboard Sharing ---

  sendTextMessage(text, fromDevice = 'Mac') {
    if (!text || typeof text !== 'string') return null;
    const cleanText = text.trim();
    if (!cleanText) return null;

    // Debounce: ignore exact duplicate text within 2 seconds
    const latest = this.recentTexts[0];
    if (latest && latest.text === cleanText && (Date.now() - latest.timestamp) < 2000) {
      return latest;
    }

    const msg = {
      id: 'txt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      text: cleanText,
      from: fromDevice,
      timestamp: Date.now()
    };
    this.recentTexts.unshift(msg);
    if (this.recentTexts.length > 50) this.recentTexts.pop();

    this.broadcast({
      type: 'text_shared',
      message: msg
    });

    this.emit('text_received', msg);
    return msg;
  }

  getRecentTexts() {
    return this.recentTexts;
  }

  // --- WebSocket & Real-Time Sync ---

  attachWebSocketServer(httpServer) {
    if (this.wss) return;

    this.wss = new ws.WebSocketServer({ server: httpServer, path: '/ws/transfer' });

    this.wss.on('connection', (socket, req) => {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const role = parsedUrl.searchParams.get('role') || 'mobile';
      const userAgent = req.headers['user-agent'] || parsedUrl.searchParams.get('ua') || '';
      const deviceName = parsedUrl.searchParams.get('device') || this.parseDeviceName(userAgent);
      const ip = req.socket.remoteAddress ? req.socket.remoteAddress.replace(/^.*:/, '') : 'desconhecido';
      const clientId = 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      const clientInfo = {
        id: clientId,
        role,
        deviceName,
        ip,
        connectedAt: Date.now()
      };

      this.connectedClients.set(socket, clientInfo);

      // Send initial status to the connected client
      socket.send(JSON.stringify({
        type: 'init_status',
        clientInfo,
        destinationFolder: this.destinationFolder,
        outgoingFiles: this.getOutgoingFilesSummary(),
        receivedFiles: this.receivedFiles,
        recentTexts: this.recentTexts,
        devices: this.getConnectedDevices(),
        visibility: this.visibility,
        discoveredPeers: this.getDiscoveredPeers()
      }));

      // Notify all about updated device list
      this.broadcastDeviceList();

      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          } else if (msg.type === 'send_text') {
            this.sendTextMessage(msg.text, clientInfo.deviceName);
          } else if (msg.type === 'remove_outgoing') {
            this.removeOutgoingFile(msg.fileId);
          }
        } catch (err) {
          console.error('[VS Drop] Erro ao processar mensagem WS:', err.message);
        }
      });

      socket.on('close', () => {
        this.connectedClients.delete(socket);
        this.broadcastDeviceList();
      });

      socket.on('error', () => {
        this.connectedClients.delete(socket);
        this.broadcastDeviceList();
      });
    });
  }

  getConnectedDevices() {
    const list = [];
    for (const info of this.connectedClients.values()) {
      list.push(info);
    }
    return list;
  }

  broadcastDeviceList() {
    this.broadcast({
      type: 'devices_updated',
      devices: this.getConnectedDevices()
    });
  }

  broadcast(payload) {
    if (!this.wss) return;
    const msg = JSON.stringify(payload);
    for (const [socket] of this.connectedClients.entries()) {
      if (socket.readyState === ws.WebSocket.OPEN) {
        try {
          socket.send(msg);
        } catch (e) {}
      }
    }
  }

  // --- UDP Radar & Peer Discovery (AirDrop Style) ---

  initDiscoveryService(port = 8765) {
    if (this.udpSocket) return;
    this.discoveryPort = port;

    try {
      this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.udpSocket.on('error', (err) => {
        console.warn('[VS Drop] Erro no socket UDP de descoberta:', err.message);
      });

      this.udpSocket.on('message', (msgBuf, rinfo) => {
        try {
          const raw = msgBuf.toString();
          const data = JSON.parse(raw);
          if (!data || data.protocol !== 'vs-drop') return;
          if (data.id === this.deviceId) return; // Ignore our own beacon

          // Check our visibility
          if (this.visibility === 'hidden') return;
          const isPaired = this.pairedDeviceIds.has(data.id);
          if (this.visibility === 'paired' && !isPaired) {
            // In paired-only mode, ignore unknown devices
            return;
          }

          const peerInfo = {
            id: data.id,
            name: data.name || 'Dispositivo Desconhecido',
            platform: data.platform || 'android',
            ip: rinfo.address,
            port: data.port || 8766,
            visibility: data.visibility || 'everyone',
            lastSeen: Date.now(),
            isPaired
          };

          const isNew = !this.discoveredPeers.has(data.id);
          this.discoveredPeers.set(data.id, peerInfo);

          if (isNew) {
            this.broadcastPeersList();
            this.emit('peer_discovered', peerInfo);
          }

          // If it was a ping or beacon, reply with a unicast pong so peer learns about us immediately
          if (data.type === 'ping' || data.type === 'beacon') {
            this.sendPongTo(rinfo.address, data.port || rinfo.port);
          }
        } catch (e) {}
      });

      this.udpSocket.bind(this.discoveryPort, () => {
        try {
          this.udpSocket.setBroadcast(true);
          console.log(`[VS Drop] Radar UDP ativo na porta ${this.discoveryPort}`);
          this.broadcastBeacon();
        } catch (e) {
          console.warn('[VS Drop] Não foi possível ativar broadcast UDP:', e.message);
        }
      });

      // Broadcast periodic beacon every 3s
      if (this.discoveryInterval) clearInterval(this.discoveryInterval);
      this.discoveryInterval = setInterval(() => {
        if (this.visibility !== 'hidden') {
          this.broadcastBeacon();
        }
      }, 3000);

      // Prune inactive peers every 5s
      if (this.pruneInterval) clearInterval(this.pruneInterval);
      this.pruneInterval = setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [id, peer] of this.discoveredPeers.entries()) {
          if (now - peer.lastSeen > 10000) {
            this.discoveredPeers.delete(id);
            changed = true;
          }
        }
        if (changed) {
          this.broadcastPeersList();
        }
      }, 5000);
    } catch (err) {
      console.warn('[VS Drop] Falha ao iniciar descoberta UDP:', err.message);
    }
  }

  broadcastBeacon() {
    if (!this.udpSocket || this.visibility === 'hidden') return;
    const { primaryIp } = this.getLanAddresses();
    const packet = JSON.stringify({
      protocol: 'vs-drop',
      type: 'beacon',
      id: this.deviceId,
      name: this.deviceName,
      platform: 'mac',
      ip: primaryIp,
      port: this.currentPort,
      visibility: this.visibility
    });
    const buf = Buffer.from(packet);

    try {
      this.udpSocket.send(buf, 0, buf.length, this.discoveryPort, '255.255.255.255');
    } catch (e) {}
  }

  sendPongTo(ip, port) {
    if (!this.udpSocket || this.visibility === 'hidden') return;
    const { primaryIp } = this.getLanAddresses();
    const packet = JSON.stringify({
      protocol: 'vs-drop',
      type: 'pong',
      id: this.deviceId,
      name: this.deviceName,
      platform: 'mac',
      ip: primaryIp,
      port: this.currentPort,
      visibility: this.visibility
    });
    const buf = Buffer.from(packet);

    try {
      this.udpSocket.send(buf, 0, buf.length, port, ip);
    } catch (e) {}
  }

  broadcastPeersList() {
    this.broadcast({
      type: 'peers_updated',
      peers: this.getDiscoveredPeers(),
      visibility: this.visibility
    });
    this.emit('peers_updated', this.getDiscoveredPeers());
  }

  getDiscoveredPeers() {
    const list = [];
    for (const p of this.discoveredPeers.values()) {
      list.push(p);
    }
    return list;
  }

  setVisibility(mode) {
    if (!['everyone', 'paired', 'hidden'].includes(mode)) mode = 'everyone';
    this.visibility = mode;
    this.broadcastPeersList();
    return this.visibility;
  }

  pairDevice(peerId, pair = true) {
    if (!peerId) return false;
    if (pair) {
      this.pairedDeviceIds.add(peerId);
    } else {
      this.pairedDeviceIds.delete(peerId);
    }
    const peer = this.discoveredPeers.get(peerId);
    if (peer) {
      peer.isPaired = pair;
    }
    this.broadcastPeersList();
    return pair;
  }

  async sendFileToPeer(peerId, filePath) {
    const peer = this.discoveredPeers.get(peerId);
    if (!peer) return { success: false, error: 'Dispositivo não encontrado ou offline' };
    if (!fs.existsSync(filePath)) return { success: false, error: 'Arquivo local não encontrado' };

    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const targetUrl = `http://${peer.ip}:${peer.port}/upload?filename=${encodeURIComponent(fileName)}&filesize=${stats.size}`;

    return new Promise((resolve) => {
      const parsed = new URL(targetUrl);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stats.size,
          'X-File-Name': encodeURIComponent(fileName),
          'User-Agent': `VS-Drop-Mac (${this.deviceName})`
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, fileName, peerName: peer.name });
          } else {
            resolve({ success: false, error: `Erro HTTP ${res.statusCode}: ${body}` });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(req);
    });
  }

  // --- Snapshot Status ---

  async getStatus(port = this.currentPort) {
    this.currentPort = port;
    const { primaryIp, addresses } = this.getLanAddresses();
    const url = `http://${primaryIp}:${port}/drop`;
    const qrCode = await this.getQrCodeDataUrl(url);

    return {
      primaryIp,
      port,
      url,
      addresses,
      qrCode,
      destinationFolder: this.destinationFolder,
      connectedDevices: this.getConnectedDevices(),
      outgoingFiles: this.getOutgoingFilesSummary(),
      receivedFiles: this.receivedFiles,
      recentTexts: this.recentTexts,
      visibility: this.visibility,
      discoveredPeers: this.getDiscoveredPeers()
    };
  }
}

const transferService = new TransferService();

module.exports = {
  transferService
};

