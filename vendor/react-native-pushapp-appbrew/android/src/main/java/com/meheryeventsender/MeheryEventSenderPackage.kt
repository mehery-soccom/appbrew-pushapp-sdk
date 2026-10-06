package com.meheryeventsender

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager


class MeheryEventSenderPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
      return listOf(
            LiveActivityModule(reactContext),
            MeheryPushTrackModule(reactContext),
            MeheryAppConfigModule(reactContext)
      )
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(MeheryEventSenderViewManager())
  }
}
