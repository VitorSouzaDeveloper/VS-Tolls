package com.vstolls.drop.network

import android.content.Context
import android.media.MediaScannerConnection
import android.os.Environment
import com.vstolls.drop.util.PreferencesManager
import kotlinx.coroutines.*
import java.io.*
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder

class TransferReceiverServer(private val context: Context) {

    private val prefs = PreferencesManager(context)
    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    var onFileReceived: ((fileName: String, size: Long, file: File) -> Unit)? = null
    var onTextReceived: ((text: String, from: String) -> Unit)? = null

    companion object {
        const val SERVER_PORT = 8766
    }

    fun start() {
        if (isRunning) return
        isRunning = true

        scope.launch {
            try {
                serverSocket = ServerSocket(SERVER_PORT).apply {
                    reuseAddress = true
                }

                while (isRunning && serverSocket?.isClosed == false) {
                    try {
                        val client = serverSocket?.accept() ?: break
                        scope.launch {
                            handleClient(client)
                        }
                    } catch (e: Exception) {
                        if (!isRunning) break
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun stop() {
        isRunning = false
        try {
            serverSocket?.close()
            serverSocket = null
        } catch (e: Exception) {}
        scope.cancel()
    }

    private suspend fun handleClient(socket: Socket) = withContext(Dispatchers.IO) {
        try {
            val input = BufferedInputStream(socket.getInputStream())
            val output = BufferedOutputStream(socket.getOutputStream())

            // Read HTTP request line and headers
            val reader = BufferedReader(InputStreamReader(input))
            val requestLine = reader.readLine() ?: return@withContext
            val parts = requestLine.split(" ")
            if (parts.size < 2) return@withContext
            val method = parts[0]
            val fullPath = parts[1]

            val headers = mutableMapOf<String, String>()
            var headerLine: String?
            while (reader.readLine().also { headerLine = it } != null) {
                if (headerLine.isNullOrEmpty()) break
                val colonIdx = headerLine!!.indexOf(':')
                if (colonIdx != -1) {
                    val key = headerLine!!.substring(0, colonIdx).trim().lowercase()
                    val value = headerLine!!.substring(colonIdx + 1).trim()
                    headers[key] = value
                }
            }

            if (fullPath.startsWith("/upload") && method.equals("POST", ignoreCase = true)) {
                handleFileUpload(fullPath, headers, input, output)
            } else if (fullPath.startsWith("/text") && method.equals("POST", ignoreCase = true)) {
                handleTextReceive(headers, reader, output)
            } else {
                // Return 200 OK status
                val response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"status\":\"online\",\"device\":\"${prefs.deviceName}\"}"
                output.write(response.toByteArray())
                output.flush()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            try { socket.close() } catch (e: Exception) {}
        }
    }

    private fun handleFileUpload(
        path: String,
        headers: Map<String, String>,
        input: InputStream,
        output: OutputStream
    ) {
        var rawName = headers["x-file-name"]
        if (rawName == null && path.contains("filename=")) {
            val query = path.substringAfter("?")
            for (param in query.split("&")) {
                val kv = param.split("=")
                if (kv.size == 2 && kv[0] == "filename") {
                    rawName = URLDecoder.decode(kv[1], "UTF-8")
                    break
                }
            }
        }

        val fileName = rawName ?: ("recebido_" + System.currentTimeMillis())
        val contentLength = headers["content-length"]?.toLongOrNull() ?: -1L

        val dropDir = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            "VS-Drop"
        ).apply { if (!exists()) mkdirs() }

        var targetFile = File(dropDir, fileName)
        var count = 1
        val dotIdx = fileName.lastIndexOf('.')
        val baseName = if (dotIdx != -1) fileName.substring(0, dotIdx) else fileName
        val ext = if (dotIdx != -1) fileName.substring(dotIdx) else ""

        while (targetFile.exists()) {
            targetFile = File(dropDir, "$baseName ($count)$ext")
            count++
        }

        val fileOut = FileOutputStream(targetFile)
        val buffer = ByteArray(64 * 1024)
        var totalRead: Long = 0
        var bytesRead: Int

        try {
            if (contentLength > 0) {
                var remaining = contentLength
                while (remaining > 0) {
                    val toRead = Math.min(buffer.size.toLong(), remaining).toInt()
                    bytesRead = input.read(buffer, 0, toRead)
                    if (bytesRead == -1) break
                    fileOut.write(buffer, 0, bytesRead)
                    totalRead += bytesRead
                    remaining -= bytesRead
                }
            } else {
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    fileOut.write(buffer, 0, bytesRead)
                    totalRead += bytesRead
                }
            }
            fileOut.flush()
        } finally {
            fileOut.close()
        }

        // Scan media so it shows in Gallery
        MediaScannerConnection.scanFile(
            context,
            arrayOf(targetFile.absolutePath),
            null,
            null
        )

        val successJson = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"success\":true,\"name\":\"${targetFile.name}\",\"size\":$totalRead}"
        output.write(successJson.toByteArray())
        output.flush()

        CoroutineScope(Dispatchers.Main).launch {
            onFileReceived?.invoke(targetFile.name, totalRead, targetFile)
        }
    }

    private fun handleTextReceive(
        headers: Map<String, String>,
        reader: BufferedReader,
        output: OutputStream
    ) {
        val contentLength = headers["content-length"]?.toIntOrNull() ?: 0
        val bodyChars = CharArray(contentLength)
        reader.read(bodyChars, 0, contentLength)
        val body = String(bodyChars)

        var text = body
        var from = "MacBook"
        try {
            val json = org.json.JSONObject(body)
            text = json.optString("text", body)
            from = json.optString("from", "MacBook")
        } catch (e: Exception) {}

        val response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"success\":true}"
        output.write(response.toByteArray())
        output.flush()

        CoroutineScope(Dispatchers.Main).launch {
            onTextReceived?.invoke(text, from)
        }
    }
}

