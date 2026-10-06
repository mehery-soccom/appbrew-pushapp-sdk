package com.meheryeventsender

import android.app.PendingIntent
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL
import android.app.NotificationManager
import android.graphics.drawable.GradientDrawable
import com.meheryeventsender.R
import android.view.View
import android.util.Log
import java.io.BufferedInputStream


class CustomNotificationService(private val context: Context) {

    companion object {
        private const val TAG = "CustomNotificationSvc"
        private const val CONNECT_TIMEOUT_MS = 15000
        private const val READ_TIMEOUT_MS = 15000
        private const val IMAGE_DOWNLOAD_RETRIES = 3
        private const val MAX_NOTIFICATION_BITMAP_EDGE_PX = 1200
    }


    // ========================================================================================
    //  CREATE NOTIFICATION
    // ========================================================================================
    fun createCustomNotification(
    channelId: String,
    title: String,
    message: String,
    tapText: String,
    titleColor: String,
    messageColor: String,
    tapTextColor: String,
    progressColor: String,            // ✅ KEPT
    backgroundColor: String,
    imageUrl: String,
    bg_color_gradient: String,
    bg_color_gradient_dir: String,
    align: String,
    notificationId: Int,
    imageUrls: List<String> = emptyList(),
    showProgress: Boolean = false,
    progress: Int = 0,
    isRichMedia: Boolean = false,
    ctaData: Map<String, String>? = null

): NotificationCompat.Builder {

    val layoutRes = if (isRichMedia) {
        R.layout.rich_media_notification_layout
    } else {
        R.layout.custom_notification_layout
    }
    
    val customView = RemoteViews(context.packageName, layoutRes)
    
        // Background
        try {
            if (bg_color_gradient.isNotEmpty() && bg_color_gradient_dir.isNotEmpty()) {
                val startColor = Color.parseColor(backgroundColor)
                val endColor = Color.parseColor(bg_color_gradient)
                val isHorizontal = bg_color_gradient_dir.equals("horizontal", true)
                customView.setImageViewBitmap(R.id.root_background, createGradientBitmap(startColor, endColor, isHorizontal))
            } else {
                customView.setImageViewBitmap(R.id.root_background, createSolidColorBitmap(Color.parseColor(backgroundColor)))
            }
        } catch (_: Exception) {}

        // Text
        customView.setTextViewText(R.id.title, title)
        customView.setTextViewText(R.id.message, message)
        customView.setTextViewText(R.id.tap_text, tapText)

        try {
            customView.setTextColor(R.id.title, Color.parseColor(titleColor))
            customView.setTextColor(R.id.message, Color.parseColor(messageColor))
            customView.setTextColor(R.id.tap_text, Color.parseColor(tapTextColor))
        } catch (_: Exception) {}

        if (!isRichMedia) {
            if (showProgress) {
                customView.setViewVisibility(R.id.progress_bar, View.VISIBLE)
                customView.setProgressBar(R.id.progress_bar, 100, progress, false)
                try {
                    val color = Color.parseColor(progressColor)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        customView.setColorStateList(
                            R.id.progress_bar,
                            "setProgressTintList",
                            ColorStateList.valueOf(color)
                        )
                    }
                } catch (_: Exception) {}
            } else {
                customView.setViewVisibility(R.id.progress_bar, View.GONE)
            }
        }
        
                customView.setImageViewResource(R.id.icon, R.mipmap.ic_launcher)

        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pendingIntent = PendingIntent.getActivity(
            context, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setCustomContentView(customView)
            .setCustomBigContentView(customView)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(false)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        if (imageUrl.isNotEmpty()) {
            downloadImage(imageUrl) { bitmap ->
                if (bitmap != null) {
                    if (isRichMedia) {
                        customView.setImageViewBitmap(R.id.richImage, bitmap)
                    } else {
                        customView.setImageViewBitmap(R.id.icon, bitmap)
                    }
                    val manager =
                        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    manager.notify(notificationId, builder.build())
                    Log.i(
                        TAG,
                        "Custom notification: bitmap loaded, posted notificationId=$notificationId " +
                            "richMedia=$isRichMedia"
                    )
                }
            }
        }

        return builder
    }

    fun downloadImage(urlString: String, onResult: (Bitmap?) -> Unit) {
        Thread {
            var bmp: Bitmap? = null
            for (attempt in 1..IMAGE_DOWNLOAD_RETRIES) {
                bmp = downloadImageSyncOnce(urlString)
                if (bmp != null) break
                if (attempt < IMAGE_DOWNLOAD_RETRIES) {
                    try {
                        Thread.sleep(400L * attempt)
                    } catch (_: InterruptedException) {
                        break
                    }
                }
            }
            if (bmp != null) {
                val limited = limitBitmapSizeForNotification(bmp!!)
                if (limited !== bmp) {
                    bmp!!.recycle()
                }
                bmp = limited
            }
            val out = bmp
            Handler(Looper.getMainLooper()).post { onResult(out) }
        }.start()
    }

    private fun downloadImageSyncOnce(urlString: String): Bitmap? {
        var conn: HttpURLConnection? = null
        return try {
            val cleanedUrl = sanitizeImageUrl(urlString)
            val url = URL(cleanedUrl)
            conn = url.openConnection() as HttpURLConnection
            conn.doInput = true
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.instanceFollowRedirects = true
            conn.connect()
            val decoded = conn.inputStream.use { input ->
                BufferedInputStream(input).use { buffered ->
                    BitmapFactory.decodeStream(buffered)
                }
            }
            if (decoded == null) {
                Log.w(TAG, "Bitmap decode failed for $cleanedUrl")
            }
            decoded
        } catch (e: Exception) {
            Log.e(TAG, "Single image download failed for $urlString", e)
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun limitBitmapSizeForNotification(src: Bitmap): Bitmap {
        val max = MAX_NOTIFICATION_BITMAP_EDGE_PX
        if (src.width <= max && src.height <= max) return src
        val scale = minOf(max.toFloat() / src.width, max.toFloat() / src.height)
        val w = (src.width * scale).toInt().coerceAtLeast(1)
        val h = (src.height * scale).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(src, w, h, true)
    }

    private fun sanitizeImageUrl(urlString: String): String {
        val trimmed = urlString.trim()
        return if (trimmed.startsWith("@")) trimmed.substring(1) else trimmed
    }


    fun createGradientBitmap(startColor: Int, endColor: Int, isHorizontal: Boolean): Bitmap {
        val gradient = GradientDrawable(
            if (isHorizontal) GradientDrawable.Orientation.LEFT_RIGHT
            else GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(startColor, endColor)
        )

        val bmp = Bitmap.createBitmap(1080, 350, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        gradient.setBounds(0, 0, 1080, 350)
        gradient.draw(canvas)
        return bmp
    }

    fun createSolidColorBitmap(color: Int): Bitmap {
        val bmp = Bitmap.createBitmap(1080, 350, Bitmap.Config.ARGB_8888)
        bmp.eraseColor(color)
        return bmp
    }

}
