package com.vstolls.drop.util

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.text.DecimalFormat

object FileUtils {

    fun formatBytes(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB", "TB")
        val digitGroups = (Math.log10(bytes.toDouble()) / Math.log10(1024.0)).toInt()
        val format = DecimalFormat("#,##0.#")
        return format.format(bytes / Math.pow(1024.0, digitGroups.toDouble())) + " " + units[digitGroups]
    }

    fun getFileName(context: Context, uri: Uri): String {
        var name: String? = null
        if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
            val cursor = context.contentResolver.query(uri, null, null, null, null)
            cursor?.use {
                if (it.moveToFirst()) {
                    val idx = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx != -1) {
                        name = it.getString(idx)
                    }
                }
            }
        }
        if (name == null) {
            name = uri.path
            val cut = name?.lastIndexOf('/') ?: -1
            if (cut != -1) {
                name = name?.substring(cut + 1)
            }
        }
        return name ?: ("arquivo_" + System.currentTimeMillis())
    }

    fun getFileSize(context: Context, uri: Uri): Long {
        if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
            val cursor = context.contentResolver.query(uri, null, null, null, null)
            cursor?.use {
                if (it.moveToFirst()) {
                    val idx = it.getColumnIndex(OpenableColumns.SIZE)
                    if (idx != -1) {
                        return it.getLong(idx)
                    }
                }
            }
        }
        try {
            val pfd = context.contentResolver.openFileDescriptor(uri, "r")
            pfd?.use {
                return it.statSize
            }
        } catch (e: Exception) {}
        return 0L
    }

    fun getMimeType(context: Context, uri: Uri): String {
        return context.contentResolver.getType(uri) ?: "application/octet-stream"
    }
}

