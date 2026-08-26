package com.meheryeventsender

import android.content.Context

/**
 * Persists the push track API base URL from JS [initSdk] so background notification CTAs can POST
 * to …/v1/notification/push/track when FCM [data] omits [api_base_url] / [track_base_url].
 */
object MeheryPushTrackPrefs {
    private const val PREFS = "mehery_event_sender_push_track"
    private const val KEY_API_BASE = "cached_api_base_url"

    fun getApiBaseUrl(context: Context): String {
        val app = context.applicationContext
        return app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_API_BASE, "").orEmpty().trim()
    }

    fun setApiBaseUrl(context: Context, url: String) {
        val trimmed = url.trim()
        val app = context.applicationContext
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_API_BASE, trimmed)
            .apply()
    }
}
