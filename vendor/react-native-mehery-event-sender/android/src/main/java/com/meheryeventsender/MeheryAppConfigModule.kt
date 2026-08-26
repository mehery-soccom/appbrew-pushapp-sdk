package com.meheryeventsender

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

class MeheryAppConfigModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MeheryAppConfig"

    private data class CredentialKeys(
        val appIdName: String,
        val appKeyName: String,
        val fallbackAppIdName: String? = null,
        val fallbackAppKeyName: String? = null,
        val environment: String
    )

    private fun readStringResource(name: String): String? {
        val packageName = reactContext.packageName
        val resId = reactContext.resources.getIdentifier(name, "string", packageName)
        if (resId == 0) return null
        return reactContext.getString(resId).trim().takeIf { it.isNotEmpty() }
    }

    private fun resolveCredentials(keys: CredentialKeys, promise: Promise) {
        try {
            var appId = readStringResource(keys.appIdName)
            var appKey = readStringResource(keys.appKeyName)

            if (appId == null && keys.fallbackAppIdName != null) {
                appId = readStringResource(keys.fallbackAppIdName)
            }
            if (appKey == null && keys.fallbackAppKeyName != null) {
                appKey = readStringResource(keys.fallbackAppKeyName)
            }

            if (appId == null) {
                promise.reject(
                    "ERR_MEHERY_APP_ID",
                    "${keys.appIdName} is missing or empty in strings.xml"
                )
                return
            }

            if (appKey == null) {
                promise.reject(
                    "ERR_MEHERY_APP_KEY",
                    "${keys.appKeyName} is missing or empty in strings.xml"
                )
                return
            }

            val result = WritableNativeMap()
            result.putString("xApiId", appId)
            result.putString("xApiKey", appKey)
            result.putString("environment", keys.environment)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_MEHERY_APP_CONFIG", e.message, e)
        }
    }

    @ReactMethod
    fun getCredentials(promise: Promise) {
        resolveCredentials(
            CredentialKeys(
                appIdName = "mehery_prod_app_id",
                appKeyName = "mehery_prod_app_key",
                fallbackAppIdName = "mehery_app_id",
                fallbackAppKeyName = "mehery_app_secret_key",
                environment = "production"
            ),
            promise
        )
    }

    @ReactMethod
    fun getCredentialsForEnvironment(environment: String, promise: Promise) {
        when (environment.trim().lowercase()) {
            "sandbox" -> resolveCredentials(
                CredentialKeys(
                    appIdName = "mehery_sandbox_app_id",
                    appKeyName = "mehery_sandbox_app_key",
                    environment = "sandbox"
                ),
                promise
            )
            "development" -> resolveCredentials(
                CredentialKeys(
                    appIdName = "mehery_dev_app_id",
                    appKeyName = "mehery_dev_app_key",
                    environment = "development"
                ),
                promise
            )
            else -> resolveCredentials(
                CredentialKeys(
                    appIdName = "mehery_prod_app_id",
                    appKeyName = "mehery_prod_app_key",
                    fallbackAppIdName = "mehery_app_id",
                    fallbackAppKeyName = "mehery_app_secret_key",
                    environment = "production"
                ),
                promise
            )
        }
    }
}
