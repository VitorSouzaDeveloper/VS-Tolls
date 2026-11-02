package com.vstolls.drop.model

data class DevicePeer(
    val id: String,
    val name: String,
    val platform: String = "mac",
    val ip: String,
    val port: Int = 3000,
    val visibility: String = "everyone",
    var lastSeen: Long = System.currentTimeMillis(),
    var isPaired: Boolean = false
) {
    val isMac: Boolean
        get() = platform.lowercase().contains("mac")

    val isAndroid: Boolean
        get() = platform.lowercase().contains("android")
}

