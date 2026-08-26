package com.meheryeventsender

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class CarouselReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_NEXT = "com.meheryeventsender.CAROUSEL_NEXT"
        const val ACTION_PREV = "com.meheryeventsender.CAROUSEL_PREV"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
        private const val TAG = "CarouselReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val pendingResult = goAsync()
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, Int.MIN_VALUE)
        if (notificationId == Int.MIN_VALUE) {
            Log.w(TAG, "Missing notification_id extra (action=${intent.action})")
            pendingResult.finish()
            return
        }

        Log.d(TAG, "onReceive action=${intent.action} notificationId=$notificationId")

        Thread {
            try {
                when (intent.action) {
                    ACTION_NEXT ->
                        CarouselBigPictureNotification.handleReceiverAction(
                            context,
                            notificationId,
                            forward = true
                        )
                    ACTION_PREV ->
                        CarouselBigPictureNotification.handleReceiverAction(
                            context,
                            notificationId,
                            forward = false
                        )
                    else -> Log.w(TAG, "Unknown action: ${intent.action}")
                }
            } finally {
                pendingResult.finish()
            }
        }.start()
    }
}
