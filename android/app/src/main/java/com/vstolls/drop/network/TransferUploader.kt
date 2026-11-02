package com.vstolls.drop.network

import android.content.Context
import android.net.Uri
import com.vstolls.drop.model.DevicePeer
import com.vstolls.drop.util.FileUtils
import com.vstolls.drop.util.PreferencesManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class TransferUploader(private val context: Context) {

    private val prefs = PreferencesManager(context)

    suspend fun uploadFile(
        peer: DevicePeer,
        uri: Uri,
        onProgress: (sent: Long, total: Long, speed: Long) -> Unit
    ): Result<String> = withContext(Dispatchers.IO) {
        val fileName = FileUtils.getFileName(context, uri)
        val fileSize = FileUtils.getFileSize(context, uri)
        val mimeType = FileUtils.getMimeType(context, uri)

        val encodedName = URLEncoder.encode(fileName, "UTF-8")
        val targetUrl = "http://${peer.ip}:${peer.port}/api/transfer/upload?filename=$encodedName&filesize=$fileSize"

        var connection: HttpURLConnection? = null
        try {
            val url = URL(targetUrl)
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                doInput = true
                useCaches = false
                connectTimeout = 10000
                readTimeout = 30000
                setFixedLengthStreamingMode(fileSize)
                setRequestProperty("Content-Type", mimeType)
                setRequestProperty("X-File-Name", encodedName)
                setRequestProperty("User-Agent", "VS-Drop-Android (${prefs.deviceName})")
            }

            val inputStream = context.contentResolver.openInputStream(uri)
                ?: return@withContext Result.failure(Exception("Não foi possível abrir o arquivo"))

            val outputStream = connection.outputStream
            val buffer = ByteArray(64 * 1024) // 64KB chunks
            var bytesRead: Int
            var totalSent: Long = 0
            var lastTime = System.currentTimeMillis()
            var lastSent: Long = 0

            inputStream.use { input ->
                outputStream.use { output ->
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalSent += bytesRead

                        val now = System.currentTimeMillis()
                        if (now - lastTime >= 200) {
                            val elapsedSec = Math.max(0.1, (now - lastTime) / 1000.0)
                            val speed = ((totalSent - lastSent) / elapsedSec).toLong()
                            lastTime = now
                            lastSent = totalSent

                            withContext(Dispatchers.Main) {
                                onProgress(totalSent, fileSize, speed)
                            }
                        }
                    }
                    output.flush()
                }
            }

            val responseCode = connection.responseCode
            if (responseCode in 200..299) {
                withContext(Dispatchers.Main) {
                    onProgress(fileSize, fileSize, 0)
                }
                Result.success(fileName)
            } else {
                val errorMsg = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "HTTP $responseCode"
                Result.failure(Exception("Falha no envio: $errorMsg"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        } finally {
            connection?.disconnect()
        }
    }

    suspend fun sendText(peer: DevicePeer, text: String): Result<Boolean> = withContext(Dispatchers.IO) {
        val targetUrl = "http://${peer.ip}:${peer.port}/api/transfer/text"
        var connection: HttpURLConnection? = null
        try {
            val url = URL(targetUrl)
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                doInput = true
                connectTimeout = 5000
                readTimeout = 10000
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            }

            val json = JSONObject().apply {
                put("text", text)
                put("from", prefs.deviceName)
            }

            OutputStreamWriter(connection.outputStream, "UTF-8").use {
                it.write(json.toString())
                it.flush()
            }

            val code = connection.responseCode
            if (code in 200..299) {
                Result.success(true)
            } else {
                Result.failure(Exception("HTTP $code"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        } finally {
            connection?.disconnect()
        }
    }
}

