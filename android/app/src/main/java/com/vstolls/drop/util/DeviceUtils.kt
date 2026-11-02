package com.vstolls.drop.util

import android.content.Context
import android.net.wifi.WifiManager
import java.net.InetAddress
import java.net.NetworkInterface
import java.nio.ByteBuffer
import java.nio.ByteOrder

object DeviceUtils {

    fun getLocalIpAddress(context: Context): String {
        try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            if (wifiManager != null) {
                val ipInt = wifiManager.connectionInfo.ipAddress
                if (ipInt != 0) {
                    return InetAddress.getByAddress(
                        ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(ipInt).array()
                    ).hostAddress ?: "127.0.0.1"
                }
            }
        } catch (e: Exception) {}

        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val addrs = iface.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (!addr.isLoopbackAddress && addr.address.size == 4) {
                        return addr.hostAddress ?: "127.0.0.1"
                    }
                }
            }
        } catch (e: Exception) {}

        return "127.0.0.1"
    }
}

