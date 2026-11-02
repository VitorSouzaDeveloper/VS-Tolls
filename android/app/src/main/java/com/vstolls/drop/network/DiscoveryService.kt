package com.vstolls.drop.network

import android.content.Context
import android.net.wifi.WifiManager
import com.vstolls.drop.model.DevicePeer
import com.vstolls.drop.model.VisibilityMode
import com.vstolls.drop.util.DeviceUtils
import com.vstolls.drop.util.PreferencesManager
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.*
import java.util.concurrent.ConcurrentHashMap

class DiscoveryService(private val context: Context) {

    private val prefs = PreferencesManager(context)
    private var socket: DatagramSocket? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private var isRunning = false
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val discoveredPeersMap = ConcurrentHashMap<String, DevicePeer>()
    var onPeersUpdated: ((List<DevicePeer>) -> Unit)? = null

    companion object {
        const val DISCOVERY_PORT = 8765
        const val PROTOCOL_TAG = "vs-drop"
    }

    fun start() {
        if (isRunning) return
        isRunning = true

        try {
            val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifi?.createMulticastLock("vs_drop_multicast_lock")?.apply {
                setReferenceCounted(true)
                acquire()
            }
        } catch (e: Exception) {}

        scope.launch {
            listenLoop()
        }

        scope.launch {
            broadcastLoop()
        }

        scope.launch {
            sweepLoop()
        }

        scope.launch {
            pruneLoop()
        }

        // Trigger immediate HTTP sweep for instant detection
        triggerSubnetSweep()
    }

    fun stop() {
        isRunning = false
        try {
            socket?.close()
            socket = null
        } catch (e: Exception) {}
        try {
            if (multicastLock?.isHeld == true) {
                multicastLock?.release()
            }
        } catch (e: Exception) {}
        scope.cancel()
    }

    fun triggerPing() {
        scope.launch {
            sendBeacon(type = "ping")
            probeSubnetHttp()
        }
    }

    fun triggerSubnetSweep() {
        scope.launch {
            probeSubnetHttp()
        }
    }

    private suspend fun listenLoop() = withContext(Dispatchers.IO) {
        try {
            // Must instantiate with null and set reuseAddress before binding
            socket = DatagramSocket(null).apply {
                reuseAddress = true
                broadcast = true
                bind(InetSocketAddress(DISCOVERY_PORT))
            }

            val buffer = ByteArray(4096)
            while (isRunning && socket?.isClosed == false) {
                try {
                    val packet = DatagramPacket(buffer, buffer.size)
                    socket?.receive(packet)
                    val raw = String(packet.data, 0, packet.length)
                    handleIncomingPacket(raw, packet.address.hostAddress ?: "")
                } catch (e: Exception) {
                    if (!isRunning) break
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun handleIncomingPacket(raw: String, senderIp: String) {
        try {
            val json = JSONObject(raw)
            if (json.optString("protocol") != PROTOCOL_TAG) return

            val id = json.optString("id")
            if (id == prefs.deviceId || id.isEmpty()) return // Ignore own beacon

            val visibility = prefs.visibilityMode
            if (visibility == VisibilityMode.HIDDEN) return // In hidden mode, ignore

            val isPaired = prefs.isDevicePaired(id)
            if (visibility == VisibilityMode.PAIRED_ONLY && !isPaired) {
                return // Ignore unpaired devices when in paired-only mode
            }

            val peer = DevicePeer(
                id = id,
                name = json.optString("name", "Dispositivo"),
                platform = json.optString("platform", "mac"),
                ip = if (senderIp.isNotEmpty()) senderIp else json.optString("ip", "127.0.0.1"),
                port = json.optInt("port", 3000),
                visibility = json.optString("visibility", "everyone"),
                lastSeen = System.currentTimeMillis(),
                isPaired = isPaired
            )

            discoveredPeersMap[id] = peer
            notifyPeersChanged()

            // If it's a ping or beacon, reply with a pong unicast
            val type = json.optString("type")
            if (type == "ping" || type == "beacon") {
                scope.launch {
                    sendPong(peer.ip, DISCOVERY_PORT)
                }
            }
        } catch (e: Exception) {}
    }

    private suspend fun broadcastLoop() = withContext(Dispatchers.IO) {
        while (isRunning) {
            if (prefs.visibilityMode != VisibilityMode.HIDDEN) {
                sendBeacon(type = "beacon")
            }
            delay(3000)
        }
    }

    private suspend fun sweepLoop() = withContext(Dispatchers.IO) {
        while (isRunning) {
            delay(10000)
            if (prefs.visibilityMode != VisibilityMode.HIDDEN) {
                probeSubnetHttp()
            }
        }
    }

    private suspend fun pruneLoop() = withContext(Dispatchers.IO) {
        while (isRunning) {
            delay(5000)
            val now = System.currentTimeMillis()
            var changed = false
            val it = discoveredPeersMap.entries.iterator()
            while (it.hasNext()) {
                val entry = it.next()
                if (now - entry.value.lastSeen > 15000) {
                    it.remove()
                    changed = true
                }
            }
            if (changed) {
                notifyPeersChanged()
            }
        }
    }

    private fun getAllBroadcastAddresses(): List<InetAddress> {
        val list = mutableListOf<InetAddress>()
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                for (interfaceAddress in iface.interfaceAddresses) {
                    val broadcast = interfaceAddress.broadcast
                    if (broadcast != null) {
                        list.add(broadcast)
                    }
                }
            }
        } catch (e: Exception) {}
        try {
            list.add(InetAddress.getByName("255.255.255.255"))
        } catch (e: Exception) {}
        return list.distinct()
    }

    private fun sendBeacon(type: String) {
        try {
            val localIp = DeviceUtils.getLocalIpAddress(context)
            val json = JSONObject().apply {
                put("protocol", PROTOCOL_TAG)
                put("type", type)
                put("id", prefs.deviceId)
                put("name", prefs.deviceName)
                put("platform", "android")
                put("ip", localIp)
                put("port", 8766)
                put("visibility", prefs.visibilityMode.key)
            }

            val data = json.toString().toByteArray()
            val broadcastTargets = getAllBroadcastAddresses()

            val s = DatagramSocket().apply { broadcast = true }
            for (target in broadcastTargets) {
                try {
                    val packet = DatagramPacket(data, data.size, target, DISCOVERY_PORT)
                    s.send(packet)
                } catch (e: Exception) {}
            }
            s.close()
        } catch (e: Exception) {}
    }

    private fun sendPong(targetIp: String, port: Int) {
        try {
            val localIp = DeviceUtils.getLocalIpAddress(context)
            val json = JSONObject().apply {
                put("protocol", PROTOCOL_TAG)
                put("type", "pong")
                put("id", prefs.deviceId)
                put("name", prefs.deviceName)
                put("platform", "android")
                put("ip", localIp)
                put("port", 8766)
                put("visibility", prefs.visibilityMode.key)
            }

            val data = json.toString().toByteArray()
            val addr = InetAddress.getByName(targetIp)
            val packet = DatagramPacket(data, data.size, addr, port)

            val s = DatagramSocket()
            s.send(packet)
            s.close()
        } catch (e: Exception) {}
    }

    // Active Turbo Scan (Coroutines): Bypasses Wi-Fi router AP Isolation / UDP filtering
    suspend fun probeSubnetHttp() = withContext(Dispatchers.IO) {
        val localIp = DeviceUtils.getLocalIpAddress(context)
        if (localIp == "127.0.0.1" || !localIp.contains(".")) return@withContext

        val prefix = localIp.substringBeforeLast(".")
        val currentHost = localIp.substringAfterLast(".").toIntOrNull() ?: -1

        coroutineScope {
            for (host in 1..254) {
                if (host == currentHost) continue
                launch {
                    try {
                        val targetIp = "$prefix.$host"
                        val url = URL("http://$targetIp:3000/api/transfer/status")
                        val conn = (url.openConnection() as HttpURLConnection).apply {
                            connectTimeout = 300
                            readTimeout = 400
                            useCaches = false
                        }
                        if (conn.responseCode == 200) {
                            val response = conn.inputStream.bufferedReader().use { it.readText() }
                            val json = JSONObject(response)
                            val discoveredMacIp = json.optString("primaryIp", targetIp)
                            val macPort = json.optInt("port", 3000)

                            val peer = DevicePeer(
                                id = "mac_$discoveredMacIp",
                                name = "MacBook / Mac",
                                platform = "mac",
                                ip = discoveredMacIp,
                                port = macPort,
                                visibility = json.optString("visibility", "everyone"),
                                lastSeen = System.currentTimeMillis(),
                                isPaired = prefs.isDevicePaired("mac_$discoveredMacIp")
                            )
                            discoveredPeersMap[peer.id] = peer
                            notifyPeersChanged()

                            // Immediately register back to Mac so Mac adds Android to its radar too
                            registerToMacHttp(discoveredMacIp, macPort)
                        }
                        conn.disconnect()
                    } catch (e: Exception) {}
                }
            }
        }
    }

    fun registerToMacHttp(macIp: String, macPort: Int) {
        scope.launch(Dispatchers.IO) {
            try {
                val url = URL("http://$macIp:$macPort/api/transfer/peers/register")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = 1500
                    readTimeout = 2000
                    setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                }
                val localIp = DeviceUtils.getLocalIpAddress(context)
                val json = JSONObject().apply {
                    put("id", prefs.deviceId)
                    put("name", prefs.deviceName)
                    put("platform", "android")
                    put("ip", localIp)
                    put("port", 8766)
                    put("visibility", prefs.visibilityMode.key)
                }
                OutputStreamWriter(conn.outputStream, "UTF-8").use {
                    it.write(json.toString())
                    it.flush()
                }
                if (conn.responseCode == 200) {
                    val resp = conn.inputStream.bufferedReader().use { it.readText() }
                    val respJson = JSONObject(resp)
                    val macInfo = respJson.optJSONObject("macPeer")
                    if (macInfo != null) {
                        val macId = macInfo.optString("id", "mac_$macIp")
                        val peer = DevicePeer(
                            id = macId,
                            name = macInfo.optString("name", "MacBook"),
                            platform = "mac",
                            ip = macInfo.optString("ip", macIp),
                            port = macInfo.optInt("port", macPort),
                            visibility = macInfo.optString("visibility", "everyone"),
                            lastSeen = System.currentTimeMillis(),
                            isPaired = prefs.isDevicePaired(macId)
                        )
                        discoveredPeersMap[macId] = peer
                        notifyPeersChanged()
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {}
        }
    }

    private fun notifyPeersChanged() {
        val list = discoveredPeersMap.values.toList().sortedByDescending { it.isPaired }
        CoroutineScope(Dispatchers.Main).launch {
            onPeersUpdated?.invoke(list)
        }
    }
}
