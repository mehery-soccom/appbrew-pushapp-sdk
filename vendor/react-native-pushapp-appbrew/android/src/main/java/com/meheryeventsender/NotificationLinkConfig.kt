package com.meheryeventsender

/** Optional https host → app scheme rewrite for notification URL taps (Android native path). */
object NotificationLinkConfig {
    @Volatile
    var httpsHost: String = ""

    @Volatile
    var appScheme: String = ""

    fun toInAppDeepLink(url: String): String {
        val normalized = NotificationPushTrack.normalizeTargetUrl(url)
        val host = httpsHost.trim()
        val scheme = appScheme.trim()
        if (host.isEmpty() || scheme.isEmpty()) return normalized

        val prefix = "https://$host/"
        val hostOnly = "https://$host"
        if (!normalized.startsWith(prefix) && normalized != hostOnly) {
            return normalized
        }

        val path = if (normalized.startsWith(prefix)) {
            normalized.removePrefix(prefix).trimStart('/')
        } else {
            ""
        }
        return if (path.isEmpty()) "$scheme://" else "$scheme://$path"
    }
}
