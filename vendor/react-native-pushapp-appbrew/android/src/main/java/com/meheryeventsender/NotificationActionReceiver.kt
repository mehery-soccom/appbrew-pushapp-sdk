package com.meheryeventsender

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val actionType = intent.getStringExtra(EXTRA_ACTION_TYPE).orEmpty()
        val targetUrl = intent.getStringExtra(EXTRA_TARGET_URL).orEmpty()
        Log.i(
            TAG,
            "notification intent: actionType=$actionType targetUrl=$targetUrl " +
                "extras=${intent.extras?.keySet()?.joinToString()}"
        )
        val trackBaseUrl = intent.getStringExtra(EXTRA_TRACK_BASE_URL).orEmpty()
        val messageId = intent.getStringExtra(EXTRA_MESSAGE_ID).orEmpty()
        val filterId = intent.getStringExtra(EXTRA_FILTER_ID).orEmpty()
        val notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID).orEmpty()
        val ctaLabel = intent.getStringExtra(EXTRA_CTA_LABEL).orEmpty()
        val buttonId = intent.getStringExtra(EXTRA_CTA_ID).orEmpty()
        val trackToken = intent.getStringExtra(EXTRA_TRACK_TOKEN).orEmpty()

        if (trackBaseUrl.isNotBlank()) {
            NotificationPushTrack.sendPushTrackEvent(
                trackBaseUrl,
                actionType,
                messageId,
                filterId,
                notificationId,
                ctaLabel,
                trackToken,
                buttonId
            )
        } else if (actionType == "cta" || ctaLabel.isNotBlank() || buttonId.isNotBlank() || trackToken.isNotBlank()) {
            Log.w(
                TAG,
                "Push track skipped: empty api_base_url/track_base_url. " +
                    "actionType=$actionType ctaLabel=$ctaLabel buttonId=$buttonId hasToken=${trackToken.isNotBlank()}"
            )
        }

        // Legacy: older PendingIntents may still target this receiver for CTAs.
        // Prefer [NotificationCtaUrlActivity] (see [NotificationCtaUtils.createUrlPendingIntent]).
        if (targetUrl.isNotBlank()) {
            try {
                val normalizedUrl = NotificationLinkConfig.toInAppDeepLink(targetUrl)
                val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse(normalizedUrl)).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                if (openIntent.resolveActivity(context.packageManager) != null) {
                    context.startActivity(openIntent)
                } else {
                    Log.w(TAG, "No activity found for CTA url: $normalizedUrl")
                    openApp(context)
                }
            } catch (err: Exception) {
                Log.w(TAG, "Unable to open CTA url: $targetUrl", err)
                openApp(context)
            }
            return
        }

        openApp(context)
    }

    companion object {
        private const val TAG = "NotificationActionRcvr"
        const val EXTRA_ACTION_TYPE = "extra_action_type"
        const val EXTRA_TARGET_URL = "extra_target_url"
        const val EXTRA_TRACK_BASE_URL = "extra_track_base_url"
        const val EXTRA_MESSAGE_ID = "extra_message_id"
        const val EXTRA_FILTER_ID = "extra_filter_id"
        const val EXTRA_NOTIFICATION_ID = "extra_notification_id"
        const val EXTRA_CTA_ID = "extra_cta_id"
        const val EXTRA_CTA_LABEL = "extra_cta_label"
        const val EXTRA_TRACK_TOKEN = "extra_track_token"
    }

    private fun openApp(context: Context) {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            context.startActivity(launchIntent)
        }
    }
}
