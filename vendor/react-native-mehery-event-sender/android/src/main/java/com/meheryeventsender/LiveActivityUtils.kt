package com.meheryeventsender

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import android.app.NotificationChannel


object LiveActivityUtils {

    fun handleLiveActivityNotification(context: Context, data: Map<String, String>) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channelId = "live_activity_channel"
                val channelName = "Live Activity Notifications"
                val channel = NotificationChannel(
                    channelId,
                    channelName,
                    NotificationManager.IMPORTANCE_HIGH
                )
                notificationManager.createNotificationChannel(channel)
            }

            val customService = CustomNotificationService(context)

            val notificationId = (data["activity_id"] ?: "activity_${System.currentTimeMillis()}").hashCode()

            val (_, progressInt) = NotificationPayloadUtils.parseProgressPercentString(
                NotificationPayloadUtils.progressPercentRawFromData(data)
            )
            val showProgress = NotificationPayloadUtils.shouldShowLiveActivityProgressBar(data)
            val heroImage = NotificationPayloadUtils.resolveLiveActivityHeroImageUrl(data)

            val notification = customService.createCustomNotification(
                channelId = "live_activity_channel",
                title = data["message1"] ?: "",
                message = data["message2"] ?: "",
                tapText = data["message3"] ?: "",
                progress = progressInt,
                titleColor = data["message1FontColorHex"] ?: "#FF0000",
                messageColor = data["message2FontColorHex"] ?: "#000000",
                tapTextColor = data["message3FontColorHex"] ?: "#CCCCCC",
                progressColor = data["progressColorHex"] ?: "#00FF00",
                backgroundColor = data["backgroundColorHex"] ?: "#FFFFFF",
                imageUrl = heroImage,
                bg_color_gradient = data["bg_color_gradient"] ?: "",
                bg_color_gradient_dir = data["bg_color_gradient_dir"] ?: "",
                align = data["align"] ?: "",
                notificationId = notificationId,
                imageUrls = emptyList(),
                showProgress = showProgress,
                ctaData = data
            )

            notification.setContentIntent(NotificationCtaUtils.buildOpenPendingIntent(context, data))
            NotificationCtaUtils.appendCtaActions(context, notification, data)

            Log.d("LiveActivityUtils", "Notifying with ID: $notificationId")
            notificationManager.notify(notificationId, notification.build())

        } catch (e: Exception) {
            Log.e("LiveActivityUtils", "Live activity error: ${e.message}", e)
        }
    }

    fun handleCarouselNotification(context: Context, data: Map<String, String>) {
        try {
            val imageList = NotificationPayloadUtils.extractLimitedImageList(data)
            if (imageList.size < 2) {
                Log.w("LiveActivityUtils", "Carousel requires at least 2 images")
                return
            }

            val notificationId =
                (data["notification_id"] ?: "carousel_${System.currentTimeMillis()}").hashCode()

            val title = data["title"]?.trim().orEmpty()
            val body = data["body"] ?: data["message"] ?: ""
            val startIndex = data["index"]?.toIntOrNull()?.coerceIn(0, imageList.size - 1) ?: 0

            CarouselBigPictureNotification.show(
                context = context,
                notificationId = notificationId,
                images = imageList,
                index = startIndex,
                title = title,
                body = body,
                ctaData = data
            )
        } catch (e: Exception) {
            Log.e("LiveActivityUtils", "Carousel notification error: ${e.message}", e)
        }
    }
}