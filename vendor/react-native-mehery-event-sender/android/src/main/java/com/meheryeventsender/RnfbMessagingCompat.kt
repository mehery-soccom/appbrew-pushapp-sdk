package com.meheryeventsender

import android.util.Log
import java.lang.reflect.Method

/**
 * Forwards Firebase Messaging callbacks to React Native Firebase's event emitter when that
 * library is present at runtime. Uses reflection so this module compiles standalone (AAR) without
 * a Gradle project dependency on @react-native-firebase/messaging.
 *
 * Mirrors [io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService].
 */
internal object RnfbMessagingCompat {
    private const val TAG = "RnfbMessagingCompat"

    private val emitterClass: Class<*>? = runCatching {
        Class.forName("io.invertase.firebase.common.ReactNativeFirebaseEventEmitter")
    }.getOrNull()

    private val serializerClass: Class<*>? = runCatching {
        Class.forName("io.invertase.firebase.messaging.ReactNativeFirebaseMessagingSerializer")
    }.getOrNull()

    private val nativeEventClass: Class<*>? = runCatching {
        Class.forName("io.invertase.firebase.interfaces.NativeEvent")
    }.getOrNull()

    private val sendEventMethod: Method? = run {
        val ec = emitterClass ?: return@run null
        val nec = nativeEventClass ?: return@run null
        runCatching { ec.getMethod("sendEvent", nec) }.getOrNull()
    }

    private fun sendEvent(event: Any?) {
        if (event == null || emitterClass == null || sendEventMethod == null) return
        try {
            val emitter = emitterClass.getMethod("getSharedInstance").invoke(null)
            sendEventMethod.invoke(emitter, event)
        } catch (e: Exception) {
            Log.w(TAG, "RNFB sendEvent failed", e)
        }
    }

    fun emitNewToken(token: String) {
        val sc = serializerClass ?: return
        try {
            val m = sc.getMethod("newTokenToTokenEvent", String::class.java)
            sendEvent(m.invoke(null, token))
        } catch (e: Exception) {
            Log.w(TAG, "emitNewToken", e)
        }
    }

    fun emitMessagesDeleted() {
        val sc = serializerClass ?: return
        try {
            val m = sc.getMethod("messagesDeletedToEvent")
            sendEvent(m.invoke(null))
        } catch (e: Exception) {
            Log.w(TAG, "emitMessagesDeleted", e)
        }
    }

    fun emitMessageSent(messageId: String) {
        val sc = serializerClass ?: return
        try {
            val m = sc.getMethod("messageSentToEvent", String::class.java)
            sendEvent(m.invoke(null, messageId))
        } catch (e: Exception) {
            Log.w(TAG, "emitMessageSent", e)
        }
    }

    fun emitMessageSendError(messageId: String, error: Exception) {
        val sc = serializerClass ?: return
        try {
            val m = sc.getMethod(
                "messageSendErrorToEvent",
                String::class.java,
                Exception::class.java
            )
            sendEvent(m.invoke(null, messageId, error))
        } catch (e: Exception) {
            Log.w(TAG, "emitMessageSendError", e)
        }
    }
}
