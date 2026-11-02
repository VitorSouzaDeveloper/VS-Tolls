package com.vstolls.drop.util

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import com.vstolls.drop.model.VisibilityMode
import java.util.UUID

class PreferencesManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("vs_drop_prefs", Context.MODE_PRIVATE)

    var deviceId: String
        get() {
            var id = prefs.getString("device_id", null)
            if (id == null) {
                id = "android_" + UUID.randomUUID().toString().substring(0, 8)
                prefs.edit().putString("device_id", id).apply()
            }
            return id
        }
        set(value) = prefs.edit().putString("device_id", value).apply()

    var deviceName: String
        get() {
            val defaultName = "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"
            return prefs.getString("device_name", defaultName) ?: defaultName
        }
        set(value) = prefs.edit().putString("device_name", value).apply()

    var visibilityMode: VisibilityMode
        get() {
            val key = prefs.getString("visibility_mode", VisibilityMode.EVERYONE.key)
                ?: VisibilityMode.EVERYONE.key
            return VisibilityMode.fromKey(key)
        }
        set(value) = prefs.edit().putString("visibility_mode", value.key).apply()

    fun isDevicePaired(peerId: String): Boolean {
        val paired = prefs.getStringSet("paired_devices", emptySet()) ?: emptySet()
        return paired.contains(peerId)
    }

    fun setDevicePaired(peerId: String, paired: Boolean) {
        val set = prefs.getStringSet("paired_devices", emptySet())?.toMutableSet() ?: mutableSetOf()
        if (paired) {
            set.add(peerId)
        } else {
            set.remove(peerId)
        }
        prefs.edit().putStringSet("paired_devices", set).apply()
    }
}

