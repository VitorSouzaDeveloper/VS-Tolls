package com.vstolls.drop

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.LayoutInflater
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.vstolls.drop.databinding.ActivityShareBinding
import com.vstolls.drop.databinding.ItemDevicePeerBinding
import com.vstolls.drop.model.DevicePeer
import com.vstolls.drop.network.DiscoveryService
import com.vstolls.drop.network.TransferUploader
import com.vstolls.drop.util.FileUtils
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class ShareActivity : AppCompatActivity() {

    private lateinit var binding: ActivityShareBinding
    private lateinit var discoveryService: DiscoveryService
    private lateinit var uploader: TransferUploader

    private val filesToSend = mutableListOf<Uri>()
    private var sharedText: String? = null
    private var isTransferring = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityShareBinding.inflate(layoutInflater)
        setContentView(binding.root)

        uploader = TransferUploader(this)
        discoveryService = DiscoveryService(this)

        handleIncomingShareIntent(intent)
        setupUI()
        startDiscovery()
    }

    private fun handleIncomingShareIntent(intent: Intent?) {
        if (intent == null) {
            finish()
            return
        }

        when (intent.action) {
            Intent.ACTION_SEND -> {
                val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_STREAM)
                }

                if (uri != null) {
                    filesToSend.add(uri)
                } else {
                    sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                }
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val uris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                }
                if (uris != null) {
                    filesToSend.addAll(uris)
                }
            }
        }

        if (filesToSend.isEmpty() && sharedText.isNullOrEmpty()) {
            Toast.makeText(this, "Nenhum arquivo ou texto recebido para envio", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    private fun setupUI() {
        if (filesToSend.isNotEmpty()) {
            var totalBytes: Long = 0
            for (u in filesToSend) {
                totalBytes += FileUtils.getFileSize(this, u)
            }
            val count = filesToSend.size
            binding.textShareItemsSummary.text = "$count arquivo${if (count > 1) "s" else ""} (${FileUtils.formatBytes(totalBytes)})"
        } else if (!sharedText.isNullOrEmpty()) {
            binding.textShareItemsSummary.text = "Texto / Link"
        }

        binding.btnShareScanQr.setOnClickListener {
            val i = Intent(this, QrScanActivity::class.java)
            startActivity(i)
        }
    }

    private fun startDiscovery() {
        discoveryService.onPeersUpdated = { peers ->
            renderPeers(peers)
        }
        discoveryService.start()
        discoveryService.triggerPing()
    }

    private fun renderPeers(peers: List<DevicePeer>) {
        if (isTransferring) return
        val container = binding.layoutSharePeersList

        if (peers.isEmpty()) {
            binding.textShareSearching.visibility = View.VISIBLE
            binding.textShareSearching.text = "📡 Rastreando Mac na rede local...\nCertifique-se de que o VS Tolls esteja aberto no Mac."
            container.removeAllViews()
            container.addView(binding.textShareSearching)
            return
        }

        binding.textShareSearching.visibility = View.GONE
        container.removeAllViews()

        for (peer in peers) {
            val peerBinding = ItemDevicePeerBinding.inflate(layoutInflater, container, false)
            peerBinding.textDeviceIcon.text = if (peer.isMac) "💻" else "📱"
            peerBinding.textDeviceName.text = peer.name
            peerBinding.textDeviceDetails.text = "${peer.ip} · ${if (peer.isMac) "MacBook / Mac" else "Android"}${if (peer.isPaired) " · ⭐ Pareado" else ""}"

            peerBinding.btnSendToDevice.setOnClickListener {
                startTransferToPeer(peer)
            }

            container.addView(peerBinding.root)
        }
    }

    private fun startTransferToPeer(peer: DevicePeer) {
        if (isTransferring) return
        isTransferring = true

        binding.layoutTransferProgress.visibility = View.VISIBLE
        binding.textProgressFileName.text = "Conectando a ${peer.name}..."
        binding.progressBar.progress = 0
        binding.textProgressPercent.text = "0%"

        lifecycleScope.launch {
            if (filesToSend.isNotEmpty()) {
                var totalSuccess = 0
                for ((index, uri) in filesToSend.withIndex()) {
                    val name = FileUtils.getFileName(this@ShareActivity, uri)
                    binding.textProgressFileName.text = "[${index + 1}/${filesToSend.size}] $name"

                    val result = uploader.uploadFile(peer, uri) { sent, total, speed ->
                        val pct = if (total > 0) ((sent.toDouble() / total.toDouble()) * 100).toInt() else 0
                        binding.progressBar.progress = pct
                        binding.textProgressPercent.text = "$pct%"
                        binding.textProgressSpeed.text = "${FileUtils.formatBytes(speed)}/s · ${FileUtils.formatBytes(sent)} / ${FileUtils.formatBytes(total)}"
                    }

                    if (result.isSuccess) {
                        totalSuccess++
                    } else {
                        Toast.makeText(this@ShareActivity, "Erro ao enviar: ${result.exceptionOrNull()?.message}", Toast.LENGTH_LONG).show()
                    }
                }

                if (totalSuccess > 0) {
                    triggerVibration()
                    Toast.makeText(this@ShareActivity, "✅ $totalSuccess arquivo(s) enviados com sucesso para ${peer.name}!", Toast.LENGTH_SHORT).show()
                    delay(1200)
                    finish()
                } else {
                    isTransferring = false
                    binding.layoutTransferProgress.visibility = View.GONE
                }
            } else if (!sharedText.isNullOrEmpty()) {
                binding.textProgressFileName.text = "Enviando texto para ${peer.name}..."
                val res = uploader.sendText(peer, sharedText!!)
                if (res.isSuccess) {
                    triggerVibration()
                    Toast.makeText(this@ShareActivity, "✅ Texto enviado para ${peer.name}!", Toast.LENGTH_SHORT).show()
                    delay(800)
                    finish()
                } else {
                    Toast.makeText(this@ShareActivity, "Erro ao enviar texto", Toast.LENGTH_SHORT).show()
                    isTransferring = false
                    binding.layoutTransferProgress.visibility = View.GONE
                }
            }
        }
    }

    private fun triggerVibration() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                vibrator?.vibrate(120)
            }
        } catch (e: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        discoveryService.stop()
    }
}

