package com.vstolls.drop

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.vstolls.drop.network.TransferReceiverServer

class App : Application() {

    lateinit var receiverServer: TransferReceiverServer
        private set

    companion object {
        const val CHANNEL_TRANSFERS = "vs_drop_transfers"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()

        // Start local receiver server on port 8766
        receiverServer = TransferReceiverServer(this).apply {
            start()
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_TRANSFERS,
                "Transferências VS Drop",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notificações de envio e recebimento de arquivos"
                enableVibration(true)
            }

            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }
}

