package com.meheryeventsender

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * Parses CTA payloads (aligned with iOS: cta_buttons JSON, title1/url1, etc.) and
 * attaches [NotificationCompat.Builder.addAction] targets.
 */
object NotificationCtaUtils {

    private const val MAX_ANDROID_ACTIONS = 3

    data class CtaSpec(val label: String, val url: String, val trackId: String)

    fun trackBaseUrl(context: Context, data: Map<String, String>): String {
        val keys = listOf(
            "track_base_url",
            "api_base_url",
            "apiBaseUrl",
            "base_url",
            "push_api_url",
            "pushapp_api_url",
            "mehery_api_base_url"
        )
        for (k in keys) {
            val v = data[k]?.trim().orEmpty()
            if (v.isNotEmpty()) return v
        }
        val cached = MeheryPushTrackPrefs.getApiBaseUrl(context)
        if (cached.isNotEmpty()) return cached
        return ""
    }

    /** Click JWT for POST …/push/track body field `t` (FCM data keys). */
    fun trackClickToken(data: Map<String, String>): String {
        val keys = listOf("t", "click_token", "clickToken", "track_token", "trackToken")
        for (k in keys) {
            val v = data[k]?.trim().orEmpty()
            if (v.isNotEmpty()) return v
        }
        return ""
    }

    /** Body-tap destination when FCM data includes `notification_url` / `notificationUrl`. */
    fun resolveNotificationUrl(data: Map<String, String>): String {
        notificationUrlFromFlatMap(data)?.let { return it }

        val styleRaw = data["style"]?.trim().orEmpty()
        if (styleRaw.startsWith("{")) {
            try {
                notificationUrlFromJsonObject(JSONObject(styleRaw))?.let { return it }
            } catch (_: Exception) {
                // ignore malformed style blob
            }
        }

        val templateDataRaw = data["templateData"]?.trim().orEmpty()
        if (templateDataRaw.startsWith("{")) {
            try {
                val obj = JSONObject(templateDataRaw)
                notificationUrlFromJsonObject(obj)?.let { return it }
                val style = obj.optJSONObject("style")
                if (style != null) {
                    notificationUrlFromJsonObject(style)?.let { return it }
                }
            } catch (_: Exception) {
                // ignore malformed templateData blob
            }
        }

        val templateRaw = data["template"]?.trim().orEmpty()
        if (templateRaw.startsWith("{")) {
            try {
                val tmpl = JSONObject(templateRaw)
                val dataObj = tmpl.optJSONObject("data")
                if (dataObj != null) {
                    notificationUrlFromJsonObject(dataObj)?.let { return it }
                }
                val style = tmpl.optJSONObject("style")
                if (style != null) {
                    notificationUrlFromJsonObject(style)?.let { return it }
                }
            } catch (_: Exception) {
                // ignore malformed template blob
            }
        }

        return ""
    }

    private fun notificationUrlFromFlatMap(data: Map<String, String>): String? {
        for (k in listOf("notification_url", "notificationUrl")) {
            val raw = data[k]?.trim().orEmpty()
            if (raw.isNotEmpty()) return NotificationPushTrack.normalizeTargetUrl(raw)
        }
        return null
    }

    private fun notificationUrlFromJsonObject(obj: JSONObject): String? {
        for (k in listOf("notification_url", "notificationUrl")) {
            val raw = obj.optString(k).trim()
            if (raw.isNotEmpty()) return NotificationPushTrack.normalizeTargetUrl(raw)
        }
        return null
    }

    fun extractCtaSpecs(data: Map<String, String>): List<CtaSpec> {
        val fromJson = parseCtaButtons(data["cta_buttons"])
        if (fromJson.isNotEmpty()) return fromJson

        val legacy = mutableListOf<CtaSpec>()
        fun addPair(titleKey: String, urlKey: String, defaultLabel: String) {
            val url = data[urlKey]?.trim().orEmpty()
            if (url.isEmpty()) return
            val label = data[titleKey]?.trim().orEmpty().ifBlank { defaultLabel }
            legacy.add(CtaSpec(label, url, label))
        }
        addPair("title1", "url1", "Open")
        addPair("title2", "url2", "View")
        addPair("title3", "url3", "More")
        addPair("button1_title", "button1_url", "Open")
        addPair("button2_title", "button2_url", "View")
        addPair("button3_title", "button3_url", "More")
        addPair("cta1_title", "cta1_url", "Open")
        addPair("cta2_title", "cta2_url", "View")
        addPair("cta3_title", "cta3_url", "More")
        return legacy
    }

    private fun parseCtaButtons(raw: String?): List<CtaSpec> {
        val input = raw?.trim().orEmpty()
        if (input.isEmpty()) return emptyList()
        return try {
            when (val root = org.json.JSONTokener(input).nextValue()) {
                is JSONArray -> parseCtaButtonArray(root)
                is JSONObject -> {
                    val nested = root.optJSONArray("buttons")
                        ?: root.optJSONArray("items")
                        ?: root.optJSONArray("ctas")
                    if (nested != null) parseCtaButtonArray(nested) else emptyList()
                }
                else -> emptyList()
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun parseCtaButtonArray(arr: JSONArray): List<CtaSpec> {
        val out = mutableListOf<CtaSpec>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val label = listOf("button_text", "title", "label", "text", "name", "buttonTitle")
                .firstNotNullOfOrNull { k -> o.optString(k).trim().takeIf { it.isNotEmpty() } }
                ?: continue
            val url = listOf(
                "url",
                "link",
                "href",
                "deepLink",
                "deeplink",
                "targetUrl",
                "target_url",
                "action_url",
                "cta_url"
            )
                .firstNotNullOfOrNull { k -> o.optString(k).trim().takeIf { it.isNotEmpty() } }
                ?: continue
            val trackId = listOf("button_id", "id", "ctaId", "cta_id", "actionId", "action_id", "value")
                .firstNotNullOfOrNull { k -> o.optString(k).trim().takeIf { it.isNotEmpty() } }
                ?: ""
            out.add(CtaSpec(label, url, trackId))
        }
        return out
    }

    fun appendCtaActions(
        context: Context,
        builder: NotificationCompat.Builder,
        data: Map<String, String>,
        maxActions: Int = MAX_ANDROID_ACTIONS
    ) {
        val specs = extractCtaSpecs(data).take(maxActions.coerceIn(0, MAX_ANDROID_ACTIONS))
        val actionIcons = intArrayOf(
            android.R.drawable.ic_menu_view,
            android.R.drawable.ic_menu_send,
            android.R.drawable.ic_menu_info_details
        )
        for ((index, spec) in specs.withIndex()) {
            val iconRes = actionIcons.getOrElse(index) { android.R.drawable.ic_menu_view }
            builder.addAction(
                NotificationCompat.Action.Builder(
                    IconCompat.createWithResource(context, iconRes),
                    spec.label,
                    createUrlPendingIntent(context, data, spec)
                ).build()
            )
        }
    }

    private fun buildActionReceiverIntent(
        context: Context,
        data: Map<String, String>,
        eventName: String,
        targetUrl: String? = null,
        ctaLabel: String? = null,
        buttonId: String? = null
    ): Intent {
        return Intent(context, NotificationActionReceiver::class.java).apply {
            putExtra(NotificationActionReceiver.EXTRA_ACTION_TYPE, eventName)
            putExtra(NotificationActionReceiver.EXTRA_TARGET_URL, targetUrl.orEmpty())
            putExtra(NotificationActionReceiver.EXTRA_TRACK_BASE_URL, trackBaseUrl(context, data))
            val messageId = data["messageId"].orEmpty().ifBlank { data["message_id"].orEmpty() }
            val filterId = data["filterId"].orEmpty().ifBlank { data["filter_id"].orEmpty() }
            val notifId = data["notification_id"].orEmpty().ifBlank {
                data["notificationId"].orEmpty()
            }
            putExtra(NotificationActionReceiver.EXTRA_MESSAGE_ID, messageId)
            putExtra(NotificationActionReceiver.EXTRA_FILTER_ID, filterId)
            putExtra(
                NotificationActionReceiver.EXTRA_NOTIFICATION_ID,
                notifId
            )
            putExtra(NotificationActionReceiver.EXTRA_CTA_LABEL, ctaLabel.orEmpty())
            putExtra(NotificationActionReceiver.EXTRA_CTA_ID, buttonId.orEmpty())
            putExtra(NotificationActionReceiver.EXTRA_TRACK_TOKEN, trackClickToken(data))
        }
    }

    private fun createUrlPendingIntent(
        context: Context,
        data: Map<String, String>,
        spec: CtaSpec
    ): PendingIntent {
        // Use activity PendingIntent so opening URLs works on Android 12+ (no notification trampolines).
        val intent = Intent(context, NotificationCtaUrlActivity::class.java).apply {
            putExtra(NotificationActionReceiver.EXTRA_ACTION_TYPE, "cta")
            putExtra(NotificationActionReceiver.EXTRA_TARGET_URL, spec.url)
            putExtra(NotificationActionReceiver.EXTRA_TRACK_BASE_URL, trackBaseUrl(context, data))
            val messageId = data["messageId"].orEmpty().ifBlank { data["message_id"].orEmpty() }
            val filterId = data["filterId"].orEmpty().ifBlank { data["filter_id"].orEmpty() }
            val notifId = data["notification_id"].orEmpty().ifBlank {
                data["notificationId"].orEmpty()
            }
            putExtra(NotificationActionReceiver.EXTRA_MESSAGE_ID, messageId)
            putExtra(NotificationActionReceiver.EXTRA_FILTER_ID, filterId)
            putExtra(NotificationActionReceiver.EXTRA_NOTIFICATION_ID, notifId)
            putExtra(NotificationActionReceiver.EXTRA_CTA_LABEL, spec.label)
            putExtra(NotificationActionReceiver.EXTRA_CTA_ID, spec.trackId)
            putExtra(NotificationActionReceiver.EXTRA_TRACK_TOKEN, trackClickToken(data))
        }
        val stableNotifId = data["notification_id"].orEmpty().ifBlank { data["notificationId"].orEmpty() }
        return PendingIntent.getActivity(
            context,
            (stableNotifId + "|" + spec.trackId + "|" + spec.url).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    fun buildOpenPendingIntent(context: Context, data: Map<String, String>): PendingIntent {
        val notificationUrl = resolveNotificationUrl(data)
        val stableNotifId = data["notification_id"].orEmpty().ifBlank {
            data["notificationId"].orEmpty()
        }
        val requestKey = stableNotifId.ifBlank {
            System.currentTimeMillis().toString()
        }

        if (notificationUrl.isNotEmpty()) {
            val intent = Intent(context, NotificationCtaUrlActivity::class.java).apply {
                putExtra(NotificationActionReceiver.EXTRA_ACTION_TYPE, "opened")
                putExtra(NotificationActionReceiver.EXTRA_TARGET_URL, notificationUrl)
                putExtra(
                    NotificationActionReceiver.EXTRA_TRACK_BASE_URL,
                    trackBaseUrl(context, data)
                )
                val messageId =
                    data["messageId"].orEmpty().ifBlank { data["message_id"].orEmpty() }
                val filterId =
                    data["filterId"].orEmpty().ifBlank { data["filter_id"].orEmpty() }
                putExtra(NotificationActionReceiver.EXTRA_MESSAGE_ID, messageId)
                putExtra(NotificationActionReceiver.EXTRA_FILTER_ID, filterId)
                putExtra(NotificationActionReceiver.EXTRA_NOTIFICATION_ID, stableNotifId)
                putExtra(NotificationActionReceiver.EXTRA_CTA_LABEL, "")
                putExtra(NotificationActionReceiver.EXTRA_CTA_ID, "")
                putExtra(
                    NotificationActionReceiver.EXTRA_TRACK_TOKEN,
                    trackClickToken(data)
                )
            }
            return PendingIntent.getActivity(
                context,
                ("open_url_" + requestKey + "|" + notificationUrl).hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val intent = buildActionReceiverIntent(
            context = context,
            data = data,
            eventName = "opened",
            targetUrl = null,
            ctaLabel = null,
            buttonId = null
        )
        return PendingIntent.getBroadcast(
            context,
            ("open_" + requestKey).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
