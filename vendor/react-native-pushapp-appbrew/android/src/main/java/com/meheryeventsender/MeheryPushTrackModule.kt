package com.meheryeventsender

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** RN bridge: cache API base URL for [NotificationCtaUtils.trackBaseUrl] when FCM has no host. */
class MeheryPushTrackModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MeheryPushTrack"

    @ReactMethod
    fun setApiBaseUrl(url: String) {
        MeheryPushTrackPrefs.setApiBaseUrl(reactContext, url)
    }

    @ReactMethod
    fun setNotificationLinkRewrite(httpsHost: String, appScheme: String) {
        NotificationLinkConfig.httpsHost = httpsHost
        NotificationLinkConfig.appScheme = appScheme
    }
}
