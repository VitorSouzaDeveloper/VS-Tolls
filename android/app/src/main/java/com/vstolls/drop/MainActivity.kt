package com.vstolls.drop

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.vstolls.drop.databinding.ActivityMainBinding
import com.vstolls.drop.databinding.ItemDevicePeerBinding
import com.vstolls.drop.model.DevicePeer
import com.vstolls.drop.model.VisibilityMode
import com.vstolls.drop.network.DiscoveryService
import com.vstolls.drop.network.TransferUploader
import com.vstolls.drop.util.FileUtils
import com.vstolls.drop.util.PreferencesManager
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager
    private lateinit var discoveryService: DiscoveryService
    private lateinit var uploader: TransferUploader

    private var activePeers: List<DevicePeer> = emptyList()

    private val filePickerLauncher = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        if (uris.isNotEmpty()) {
            promptSendFilesToDevice(uris)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = PreferencesManager(this)
        uploader = TransferUploader(this)
        discoveryService = DiscoveryService(this)

        setupVisibilityControls()
        setupActionButtons()
        setupReceiverHooks()
        startDiscovery()
    }

    private fun setupVisibilityControls() {
        when (prefs.visibilityMode) {
            VisibilityMode.EVERYONE -> binding.btnVisibilityEveryone.isChecked = true
            VisibilityMode.PAIRED_ONLY -> binding.btnVisibilityPaired.isChecked = true
            VisibilityMode.HIDDEN -> binding.btnVisibilityHidden.isChecked = true
        }

        binding.toggleGroupVisibility.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (!isChecked) return@addOnButtonCheckedListener
            when (checkedId) {
                R.id.btnVisibilityEveryone -> {
                    prefs.visibilityMode = VisibilityMode.EVERYONE
                    Toast.makeText(this, "🟢 Visível para todos na rede", Toast.LENGTH_SHORT).show()
                }
                R.id.btnVisibilityPaired -> {
                    prefs.visibilityMode = VisibilityMode.PAIRED_ONLY
                    Toast.makeText(this, "🟡 Visível apenas para dispositivos pareados", Toast.LENGTH_SHORT).show()
                }
                R.id.btnVisibilityHidden -> {
                    prefs.visibilityMode = VisibilityMode.HIDDEN
                    Toast.makeText(this, "🔴 Modo invisível ativado", Toast.LENGTH_SHORT).show()
                }
            }
            discoveryService.triggerPing()
        }
    }

    private fun setupActionButtons() {
        binding.btnPickAndSend.setOnClickListener {
            filePickerLauncher.launch("*/*")
        }

        binding.btnScanQr.setOnClickListener {
            startActivity(Intent(this, QrScanActivity::class.java))
        }

        binding.btnSendText.setOnClickListener {
            val text = binding.editTextShare.text.toString().trim()
            if (text.isEmpty()) {
                Toast.makeText(this, "Digite um texto para enviar", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (activePeers.isEmpty()) {
                Toast.makeText(this, "Nenhum dispositivo encontrado no radar", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val target = activePeers.firstOrNull { it.isMac } ?: activePeers.first()
            binding.btnSendText.isEnabled = false
            lifecycleScope.launch {
                val res = uploader.sendText(target, text)
                binding.btnSendText.isEnabled = true
                if (res.isSuccess) {
                    binding.editTextShare.text?.clear()
                    triggerVibration()
                    Toast.makeText(this@MainActivity, "✅ Texto enviado para ${target.name}!", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this@MainActivity, "Erro ao enviar texto", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun startDiscovery() {
        discoveryService.onPeersUpdated = { peers ->
            activePeers = peers
            renderPeers(peers)
        }
        discoveryService.start()
        discoveryService.triggerPing()
    }

    private fun renderPeers(peers: List<DevicePeer>) {
        val container = binding.layoutPeersContainer
        binding.textRadarCount.text = "${peers.size} encontrado${if (peers.size != 1) "s" else ""}"

        if (peers.isEmpty()) {
            binding.textRadarEmpty.visibility = View.VISIBLE
            container.removeAllViews()
            container.addView(binding.textRadarEmpty)
            return
        }

        binding.textRadarEmpty.visibility = View.GONE
        container.removeAllViews()

        for (peer in peers) {
            val peerBinding = ItemDevicePeerBinding.inflate(layoutInflater, container, false)
            peerBinding.textDeviceIcon.text = if (peer.isMac) "💻" else "📱"
            peerBinding.textDeviceName.text = peer.name
            peerBinding.textDeviceDetails.text = "${peer.ip} · ${if (peer.isMac) "MacBook / Mac" else "Android"}${if (peer.isPaired) " · ⭐ Pareado" else ""}"

            peerBinding.btnSendToDevice.setOnClickListener {
                filePickerLauncher.launch("*/*")
            }

            container.addView(peerBinding.root)
        }
    }

    private fun promptSendFilesToDevice(uris: List<Uri>) {
        if (activePeers.isEmpty()) {
            Toast.makeText(this, "Nenhum dispositivo no radar. Aguarde a descoberta do Mac.", Toast.LENGTH_LONG).show()
            return
        }

        val peerNames = activePeers.map { "${it.name} (${it.ip})" }.toTypedArray()

        MaterialAlertDialogBuilder(this)
            .setTitle("Enviar para qual dispositivo?")
            .setItems(peerNames) { _, which ->
                val chosenPeer = activePeers[which]
                sendUrisToPeer(chosenPeer, uris)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun sendUrisToPeer(peer: DevicePeer, uris: List<Uri>) {
        lifecycleScope.launch {
            Toast.makeText(this@MainActivity, "Iniciando envio para ${peer.name}...", Toast.LENGTH_SHORT).show()
            var count = 0
            for (uri in uris) {
                val res = uploader.uploadFile(peer, uri) { _, _, _ -> }
                if (res.isSuccess) count++
            }
            if (count > 0) {
                triggerVibration()
                Toast.makeText(this@MainActivity, "✅ $count arquivo(s) enviados para ${peer.name}!", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun setupReceiverHooks() {
        val app = application as? App ?: return
        app.receiverServer.onFileReceived = { fileName, size, _ ->
            triggerVibration()
            Toast.makeText(this, "📥 Recebido do Mac: $fileName (${FileUtils.formatBytes(size)})", Toast.LENGTH_LONG).show()
        }
        app.receiverServer.onTextReceived = { text, from ->
            triggerVibration()
            Toast.makeText(this, "📝 Texto recebido de $from: $text", Toast.LENGTH_LONG).show()
        }
    }

    private fun triggerVibration() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(100, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                vibrator?.vibrate(100)
            }
        } catch (e: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        discoveryService.stop()
    }
}

