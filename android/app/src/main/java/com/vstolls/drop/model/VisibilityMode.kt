package com.vstolls.drop.model

enum class VisibilityMode(val key: String) {
    EVERYONE("everyone"),
    PAIRED_ONLY("paired"),
    HIDDEN("hidden");

    companion object {
        fun fromKey(key: String): VisibilityMode {
            return entries.find { it.key.equals(key, ignoreCase = true) } ?: EVERYONE
        }
    }
}

