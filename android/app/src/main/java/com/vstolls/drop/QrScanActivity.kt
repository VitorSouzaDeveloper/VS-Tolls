package com.vstolls.drop

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.vstolls.drop.databinding.ActivityQrScanBinding
import com.vstolls.drop.model.DevicePeer

class QrScanActivity : AppCompatActivity() {

    private lateinit var binding: ActivityQrScanBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityQrScanBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbarQr.setNavigationOnClickListener {
            finish()
        }

        binding.btnConnectManualIp.setOnClickListener {
            val ip = binding.editManualIp.text.toString().trim()
                .replace("http://", "")
                .replace("/drop", "")
                .replace(":3000", "")

            if (ip.isEmpty() || !ip.contains(".")) {
                Toast.makeText(this, "Insira um IP válido (ex: 192.168.3.10)", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            Toast.makeText(this, "Conectado ao Mac em $ip:3000", Toast.LENGTH_SHORT).show()
            finish()
        }
    }
}

