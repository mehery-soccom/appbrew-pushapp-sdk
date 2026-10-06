package com.meheryeventsender

import org.json.JSONArray
import org.json.JSONObject

object NotificationPayloadUtils {
    const val MAX_CAROUSEL_IMAGES = 4
    private val singleImageKeys = listOf("image", "imageUrl", "image_url")
    private val listImageKeys = listOf(
        "imageUrls",
        "image_urls",
        "carousel_images",
        "images",
        "media-url"
    )
    private val customTemplateKeys = listOf(
        "tapText",
        "titleColorHex",
        "messageColorHex",
        "tapTextColorHex",
        "backgroundColorHex",
        "bg_color_gradient",
        "bg_color_gradient_dir",
        "align",
        "progressPercent",
        "progressColorHex"
    )

    /**
     * Picks a single image URL from [image], [imageUrl], [image_url].
     * If more than one is set (e.g. bulk sends a placeholder in [image] and the real URL in [image_url]),
     * the first value that looks like an http(s) URL wins; otherwise the first non-empty in key order.
     */
    fun resolveSingleImageUrl(data: Map<String, String>): String {
        val ordered = singleImageKeys.mapNotNull { key ->
            data[key]?.trim()?.takeIf { it.isNotEmpty() }
        }
        if (ordered.isEmpty()) return ""
        return ordered.firstOrNull { looksLikeHttpImageUrl(it) } ?: ordered.first()
    }

    private fun looksLikeHttpImageUrl(s: String): Boolean {
        val t = s.trim()
        if (t.isEmpty()) return false
        val u = if (t.startsWith("@")) t.substring(1).trim() else t
        return u.startsWith("http://", ignoreCase = true) ||
            u.startsWith("https://", ignoreCase = true)
    }

    fun extractImageList(data: Map<String, String>): List<String> {
        val candidates = mutableListOf<List<String>>()
        for (map in mapsToScanForImages(data)) {
            for (key in listImageKeys) {
                val parsed = parseJsonArray(map[key])
                if (parsed.isNotEmpty()) {
                    candidates.add(parsed)
                }
            }
            val indexed = extractIndexedImageList(map)
            if (indexed.isNotEmpty()) {
                candidates.add(indexed)
            }
        }

        val longest = candidates.maxByOrNull { it.size }.orEmpty()
        if (longest.size >= 2) {
            return longest.distinct()
        }

        val unique = linkedSetOf<String>()
        candidates.forEach { unique.addAll(it) }
        val single = resolveSingleImageUrl(data)
        if (single.isNotEmpty()) unique.add(single)
        return unique.toList()
    }

    /**
     * PushApp / FCM often nests carousel URLs in `style` or `templateData` (same as CTA URLs).
     * Scan those blobs without letting a single `image` / `fcm_options` hero replace a 2+ list.
     */
    private fun mapsToScanForImages(data: Map<String, String>): List<Map<String, String>> {
        val maps = mutableListOf(data)
        jsonObjectAsStringMap(data["style"])?.let { maps.add(it) }
        jsonObjectAsStringMap(data["templateData"])?.let { td ->
            maps.add(td)
            jsonObjectAsStringMap(td["style"])?.let { maps.add(it) }
        }
        jsonObjectAsStringMap(data["template"])?.let { tmpl ->
            maps.add(tmpl)
            jsonObjectAsStringMap(tmpl["style"])?.let { maps.add(it) }
            jsonObjectAsStringMap(tmpl["data"])?.let { maps.add(it) }
        }
        return maps
    }

    private fun jsonObjectAsStringMap(raw: String?): Map<String, String>? {
        val input = raw?.trim().orEmpty()
        if (input.isEmpty() || !input.startsWith("{")) return null
        return try {
            jsonObjectToStringMap(JSONObject(input))
        } catch (_: Exception) {
            null
        }
    }

    private fun jsonObjectToStringMap(obj: JSONObject): Map<String, String> {
        val out = mutableMapOf<String, String>()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            if (k.isBlank()) continue
            val v = obj.opt(k) ?: continue
            val asString = when (v) {
                is String -> v.trim()
                is JSONArray -> v.toString()
                is JSONObject -> v.toString()
                else -> v.toString().trim()
            }
            if (asString.isNotEmpty()) out[k] = asString
        }
        return out
    }

    /** Match JS: skip a missing `image1`, then stop at the first later gap. */
    private fun extractIndexedImageList(data: Map<String, String>): List<String> {
        val indexed = mutableListOf<String>()
        for (index in 1..20) {
            val key = "image$index"
            val value = data[key]?.trim()
            if (value.isNullOrEmpty()) {
                if (index == 1) continue
                break
            }
            indexed.add(value)
        }
        return indexed
    }

    fun hasAnyImage(data: Map<String, String>): Boolean {
        if (resolveSingleImageUrl(data).isNotEmpty()) return true
        if (extractImageList(data).isNotEmpty()) return true
        return false
    }

    fun extractLimitedImageList(data: Map<String, String>): List<String> {
        return extractImageList(data).take(MAX_CAROUSEL_IMAGES)
    }

    /**
     * FCM `data` is all strings. [PushUtil.mapToActivityData] sends [progressPercent] as a string;
     * the server may use **0…1** (e.g. `0.35`) or **0…100** (e.g. `35`) from `style.progress_percent`.
     * Returns a 0…1 fraction and 0…100 for [android.widget.RemoteViews.setProgressBar].
     */
    /** FCM uses camelCase; ad-hoc / tests may send snake_case. */
    fun progressPercentRawFromData(data: Map<String, String>): String? {
        val a = data["progressPercent"]?.trim()
        if (!a.isNullOrEmpty()) return a
        val b = data["progress_percent"]?.trim()
        if (!b.isNullOrEmpty()) return b
        return null
    }

    fun parseProgressPercentString(raw: String?): Pair<Double, Int> {
        val v = raw?.trim()?.toDoubleOrNull() ?: 0.0
        val fraction = if (v > 1.0) {
            (v / 100.0).coerceIn(0.0, 1.0)
        } else {
            v.coerceIn(0.0, 1.0)
        }
        val intForBar = (fraction * 100).toInt().coerceIn(0, 100)
        return Pair(fraction, intForBar)
    }

    /** Show indeterminate/full progress chrome whenever the server included an explicit key (even `"0"`). */
    fun shouldShowLiveActivityProgressBar(data: Map<String, String>): Boolean {
        if (data.containsKey("progressPercent") || data.containsKey("progress_percent")) return true
        val (_, intBar) = parseProgressPercentString(progressPercentRawFromData(data))
        return intBar > 0
    }

    /**
     * Live notification layout uses one hero image; multiple URLs would switch to carousel and **drop** the progress bar.
     */
    fun resolveLiveActivityHeroImageUrl(data: Map<String, String>): String {
        val single = resolveSingleImageUrl(data)
        if (single.isNotEmpty()) return single
        return extractLimitedImageList(data).firstOrNull() ?: ""
    }

    fun shouldUseBigPictureStyle(data: Map<String, String>): Boolean {
        if (extractImageList(data).isNotEmpty()) return false
        if (resolveSingleImageUrl(data).isEmpty()) return false

        for (key in customTemplateKeys) {
            if (!data[key].isNullOrBlank()) return false
        }
        return true
    }

    private fun parseJsonArray(raw: String?): List<String> {
        val input = raw?.trim()
        if (input.isNullOrEmpty()) return emptyList()
        return try {
            val array = JSONArray(input)
            val out = mutableListOf<String>()
            for (i in 0 until array.length()) {
                val value = array.optString(i).trim()
                if (value.isNotEmpty()) {
                    out.add(value)
                }
            }
            out
        } catch (_: Exception) {
            input
                .split(",")
                .map { it.trim().trim('"', '\'') }
                .filter { it.isNotEmpty() }
        }
    }

    /**
     * Many backends send a stringified JSON object under `data`, `payload`, or `extras`.
     * FCM [RemoteMessage.getData] is flat [String,String]; merge those keys so native code
     * can read `api_base_url`, `t`, `cta_buttons`, etc. for [NotificationCtaUtils.trackBaseUrl].
     * If still missing, [MeheryPushTrackPrefs] (filled from JS [initSdk]) supplies the host.
     */
    fun mergeEmbeddedJsonObjectStringsInto(data: MutableMap<String, String>) {
        val blobKeys = listOf("data", "payload", "extras", "custom", "mehery_data")
        for (blobKey in blobKeys) {
            val raw = data[blobKey]?.trim().orEmpty()
            if (raw.isEmpty() || !raw.startsWith("{")) continue
            try {
                val obj = JSONObject(raw)
                val it = obj.keys()
                while (it.hasNext()) {
                    val k = it.next()
                    if (k.isBlank()) continue
                    val v = obj.opt(k) ?: continue
                    val asString = when (v) {
                        is String -> v.trim()
                        else -> v.toString().trim()
                    }
                    if (asString.isEmpty()) continue
                    // Prefer nested JSON values for known server-wrapped payloads (do not let
                    // the outer blob key block real keys like `data` used for click routing).
                    data[k] = asString
                }
            } catch (_: Exception) {
                // ignore malformed blob
            }
        }
    }
}
