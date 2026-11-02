package com.vstolls.drop.model

data class TransferItem(
    val id: String,
    val name: String,
    val size: Long,
    val mimeType: String,
    val isOutgoing: Boolean,
    val peerName: String,
    val timestamp: Long = System.currentTimeMillis(),
    val localPath: String? = null
)

