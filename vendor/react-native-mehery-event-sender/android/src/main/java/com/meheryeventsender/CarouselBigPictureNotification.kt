package com.meheryeventsender

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * BigPictureStyle carousel with Prev/Next notification actions and SharedPreferences state
 * (ported from notification_carousel_rnd reference).
 */
object CarouselBigPictureNotification {

    const val CHANNEL_ID = "carousel_channel"
    private const val PREFS_NAME = "carousel_prefs"
    private const val TAG = "CarouselBigPicture"
    private const val CONNECT_TIMEOUT_MS = 15000
    private const val READ_TIMEOUT_MS = 15000
    private const val IMAGE_DOWNLOAD_RETRIES = 3
    private const val MAX_NOTIFICATION_BITMAP_EDGE_PX = 1200

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Carousel Notifications",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Image carousel notifications"
        }
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    fun show(
        context: Context,
        notificationId: Int,
        images: List<String>,
        index: Int,
        title: String,
        body: String,
        ctaData: Map<String, String>?
    ) {
        if (images.isEmpty()) return
        val appContext = context.applicationContext
        ensureChannel(appContext)
        val safeIndex = index.coerceIn(0, images.size - 1)
        Thread {
            val cachedPaths = cacheAllImages(appContext, notificationId, images)
            if (cachedPaths.isEmpty()) {
                Log.e(TAG, "No carousel images could be cached for id=$notificationId")
                return@Thread
            }
            saveState(
                appContext,
                notificationId,
                images,
                cachedPaths,
                safeIndex,
                title,
                body,
                ctaData,
                sync = true
            )
            postNotification(
                appContext,
                notificationId,
                cachedPaths,
                safeIndex,
                images.size,
                title,
                body,
                ctaData
            )
        }.start()
    }

    fun handleReceiverAction(context: Context, notificationId: Int, forward: Boolean) {
        val appContext = context.applicationContext
        val state = loadState(appContext, notificationId)
        if (state == null) {
            Log.e(TAG, "No carousel state for notificationId=$notificationId")
            return
        }
        val total = state.cachedPaths.size
        if (total == 0) return

        val newIndex = if (forward) {
            (state.index + 1) % total
        } else {
            (state.index - 1 + total) % total
        }

        Log.d(TAG, "Carousel action forward=$forward id=$notificationId index $state.index -> $newIndex")

        saveState(
            appContext,
            notificationId,
            state.imageUrls,
            state.cachedPaths,
            newIndex,
            state.title,
            state.body,
            state.ctaData,
            sync = true
        )

        Thread {
            postNotification(
                appContext,
                notificationId,
                state.cachedPaths,
                newIndex,
                total,
                state.title,
                state.body,
                state.ctaData
            )
        }.start()
    }

    private data class CarouselState(
        val imageUrls: List<String>,
        val cachedPaths: List<String>,
        val index: Int,
        val title: String,
        val body: String,
        val ctaData: Map<String, String>?
    )

    private fun prefsKey(prefix: String, notificationId: Int) = "${prefix}_$notificationId"

    private fun cacheDir(context: Context, notificationId: Int): File {
        val dir = File(context.cacheDir, "carousel_$notificationId")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /** Download every slide up front so Prev/Next never hit the network from a BroadcastReceiver. */
    private fun cacheAllImages(
        context: Context,
        notificationId: Int,
        urls: List<String>
    ): List<String> {
        val dir = cacheDir(context, notificationId)
        val paths = mutableListOf<String>()
        urls.forEachIndexed { index, url ->
            val file = File(dir, "slide_$index.jpg")
            if (!file.exists() || file.length() == 0L) {
                val bitmap = downloadImageWithRetries(url) ?: run {
                    Log.w(TAG, "Cache miss for slide $index url=$url")
                    return@forEachIndexed
                }
                try {
                    FileOutputStream(file).use { out ->
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 92, out)
                    }
                } finally {
                    if (!bitmap.isRecycled) bitmap.recycle()
                }
            }
            if (file.exists() && file.length() > 0L) {
                paths.add(file.absolutePath)
            }
        }
        return paths
    }

    private fun saveState(
        context: Context,
        notificationId: Int,
        imageUrls: List<String>,
        cachedPaths: List<String>,
        index: Int,
        title: String,
        body: String,
        ctaData: Map<String, String>?,
        sync: Boolean
    ) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val editor = prefs.edit()
            .putString(prefsKey("images", notificationId), JSONArray(imageUrls).toString())
            .putString(prefsKey("paths", notificationId), JSONArray(cachedPaths).toString())
            .putInt(prefsKey("index", notificationId), index)
            .putString(prefsKey("title", notificationId), title)
            .putString(prefsKey("body", notificationId), body)

        if (ctaData != null && ctaData.isNotEmpty()) {
            val json = JSONObject()
            for ((k, v) in ctaData) {
                json.put(k, v)
            }
            editor.putString(prefsKey("cta", notificationId), json.toString())
        } else {
            editor.remove(prefsKey("cta", notificationId))
        }

        if (sync) {
            editor.commit()
        } else {
            editor.apply()
        }
    }

    private fun loadState(context: Context, notificationId: Int): CarouselState? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val imagesJson = prefs.getString(prefsKey("images", notificationId), null) ?: return null
        val pathsJson = prefs.getString(prefsKey("paths", notificationId), null)

        val imageUrls = parseJsonStringArray(imagesJson)
        val cachedPaths = if (!pathsJson.isNullOrBlank()) {
            parseJsonStringArray(pathsJson)
        } else {
            emptyList()
        }

        if (imageUrls.isEmpty() && cachedPaths.isEmpty()) return null

        val ctaRaw = prefs.getString(prefsKey("cta", notificationId), null)
        val ctaData = if (ctaRaw.isNullOrBlank()) {
            null
        } else {
            try {
                val obj = JSONObject(ctaRaw)
                val map = mutableMapOf<String, String>()
                val keys = obj.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    map[key] = obj.optString(key, "")
                }
                map
            } catch (_: Exception) {
                null
            }
        }

        return CarouselState(
            imageUrls = imageUrls,
            cachedPaths = cachedPaths,
            index = prefs.getInt(prefsKey("index", notificationId), 0),
            title = prefs.getString(prefsKey("title", notificationId), "") ?: "",
            body = prefs.getString(prefsKey("body", notificationId), "") ?: "",
            ctaData = ctaData
        )
    }

    private fun parseJsonStringArray(json: String): List<String> {
        val arr = JSONArray(json)
        val list = mutableListOf<String>()
        for (i in 0 until arr.length()) {
            val value = arr.optString(i, "").trim()
            if (value.isNotEmpty()) list.add(value)
        }
        return list
    }

    private fun loadBitmapForSlide(cachedPaths: List<String>, index: Int): Bitmap? {
        if (index !in cachedPaths.indices) return null
        val path = cachedPaths[index]
        return try {
            val file = File(path)
            if (!file.exists()) return null
            BitmapFactory.decodeFile(path)?.let { limitBitmapSizeForNotification(it) }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode cached slide at $path", e)
            null
        }
    }

    private fun postNotification(
        context: Context,
        notificationId: Int,
        cachedPaths: List<String>,
        index: Int,
        total: Int,
        title: String,
        body: String,
        ctaData: Map<String, String>?
    ) {
        val bitmap = loadBitmapForSlide(cachedPaths, index)
        if (bitmap == null) {
            Log.e(TAG, "No bitmap for carousel index=$index id=$notificationId")
            return
        }

        try {
            val prevIntent = Intent(context, CarouselReceiver::class.java).apply {
                action = CarouselReceiver.ACTION_PREV
                putExtra(CarouselReceiver.EXTRA_NOTIFICATION_ID, notificationId)
                data = carouselActionUri(notificationId, "prev", index)
            }
            val nextIntent = Intent(context, CarouselReceiver::class.java).apply {
                action = CarouselReceiver.ACTION_NEXT
                putExtra(CarouselReceiver.EXTRA_NOTIFICATION_ID, notificationId)
                data = carouselActionUri(notificationId, "next", index)
            }

            val prevPending = PendingIntent.getBroadcast(
                context,
                pendingRequestCode(notificationId, "prev"),
                prevIntent,
                pendingIntentFlags()
            )

            val nextPending = PendingIntent.getBroadcast(
                context,
                pendingRequestCode(notificationId, "next"),
                nextIntent,
                pendingIntentFlags()
            )

            val displayTitle = if (total > 1) {
                "$title  (${index + 1}/$total)"
            } else {
                title
            }

            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(resolveSmallIcon(context))
                .setContentTitle(displayTitle)
                .setContentText(body)
                .setLargeIcon(bitmap)
                .setStyle(
                    NotificationCompat.BigPictureStyle()
                        .bigPicture(bitmap)
                        .bigLargeIcon(null as Bitmap?)
                )
                .addAction(0, "◀ Prev", prevPending)
                .addAction(0, "Next ▶", nextPending)
                .setOnlyAlertOnce(true)
                .setAutoCancel(false)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)

            val openPayload = ctaData ?: emptyMap()
            builder.setContentIntent(
                NotificationCtaUtils.buildOpenPendingIntent(context, openPayload)
            )

            // Android allows 3 notification actions; Prev/Next use two slots.
            if (ctaData != null) {
                NotificationCtaUtils.appendCtaActions(
                    context,
                    builder,
                    openPayload,
                    maxActions = 1
                )
            }

            val nm = NotificationManagerCompat.from(context)
            if (!nm.areNotificationsEnabled()) {
                Log.e(TAG, "Notifications disabled in system settings for this app")
                return
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                Log.e(TAG, "POST_NOTIFICATIONS not granted")
                return
            }
            nm.notify(notificationId, builder.build())
            Log.d(TAG, "Carousel notification posted id=$notificationId index=$index/$total")
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException posting carousel", e)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to post carousel notification: ${e.message}", e)
        }
    }

    private fun carouselActionUri(notificationId: Int, action: String, index: Int): Uri {
        return Uri.parse("mehery://carousel/$notificationId/$action/$index")
    }

    private fun pendingRequestCode(notificationId: Int, action: String): Int {
        return (notificationId.toString() + action).hashCode()
    }

    private fun pendingIntentFlags(): Int {
        return PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    }

    private fun resolveSmallIcon(context: Context): Int {
        val hostIcon = context.resources.getIdentifier(
            "ic_launcher",
            "mipmap",
            context.packageName
        )
        if (hostIcon != 0) return hostIcon
        return android.R.drawable.ic_menu_gallery
    }

    private fun downloadImageWithRetries(urlString: String): Bitmap? {
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
        return bmp?.let { limitBitmapSizeForNotification(it) }
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
            conn.inputStream.use { input ->
                BufferedInputStream(input).use { buffered ->
                    BitmapFactory.decodeStream(buffered)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Image download failed for $urlString", e)
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
        val scaled = Bitmap.createScaledBitmap(src, w, h, true)
        if (scaled !== src) {
            src.recycle()
        }
        return scaled
    }

    private fun sanitizeImageUrl(urlString: String): String {
        val trimmed = urlString.trim()
        return if (trimmed.startsWith("@")) trimmed.substring(1) else trimmed
    }
}
