package com.shamail.gpscam.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import java.security.MessageDigest
import java.util.UUID
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Manages client-side authentication for Protected Settings using PBKDF2-HMAC-SHA256
 * salted key derivation and EncryptedSharedPreferences session storage.
 * Never logs, displays, or stores plaintext credentials.
 */
object AuthManager {

    private const val PREF_FILE_NAME = "shamail_secure_auth_prefs"
    private const val FALLBACK_PREF_NAME = "shamail_secure_auth_fallback"
    private const val KEY_REMEMBER_USER = "remember_user_enabled"
    private const val KEY_SESSION_TOKEN = "verified_session_token"

    // PBKDF2-HMAC-SHA256 parameters (no plaintext credentials stored)
    private const val SALT_HEX = "8f4b2e91c73a60d54e18b9f27a3c5d61"
    private const val ITERATIONS = 65536
    private const val KEY_LENGTH_BITS = 256
    private const val EXPECTED_USER_HASH = "4b27b96d0a6b5154840c926b0e3e379fe540f409f3197350e392768d17bd4d4b"
    private const val EXPECTED_PASS_HASH = "70ea70e1187f0ab2b5f61ba662098056374c30a463291a19ca46e6afff5962b3"

    @Volatile
    private var transientSettingsEntryAllowed: Boolean = false

    private fun openSecurePrefs(context: Context): SharedPreferences {
        val appCtx = context.applicationContext
        return runCatching {
            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            EncryptedSharedPreferences.create(
                PREF_FILE_NAME,
                masterKeyAlias,
                appCtx,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }.getOrElse {
            appCtx.getSharedPreferences(FALLBACK_PREF_NAME, Context.MODE_PRIVATE)
        }
    }

    fun authenticate(
        context: Context,
        usernameInput: String,
        passwordInput: String,
        rememberUser: Boolean
    ): Boolean {
        val trimmedUser = usernameInput.trim()
        if (trimmedUser.isEmpty() || passwordInput.isEmpty()) return false

        val userBytes = derivePbkdf2(trimmedUser)
        val passBytes = derivePbkdf2(passwordInput)
        val expectedUserBytes = hexToBytes(EXPECTED_USER_HASH)
        val expectedPassBytes = hexToBytes(EXPECTED_PASS_HASH)

        val userMatch = MessageDigest.isEqual(userBytes, expectedUserBytes)
        val passMatch = MessageDigest.isEqual(passBytes, expectedPassBytes)
        val verified = userMatch && passMatch

        if (verified) {
            transientSettingsEntryAllowed = true
            val prefs = openSecurePrefs(context)
            if (rememberUser) {
                prefs.edit()
                    .putBoolean(KEY_REMEMBER_USER, true)
                    .putString(KEY_SESSION_TOKEN, UUID.randomUUID().toString())
                    .apply()
            } else {
                prefs.edit()
                    .putBoolean(KEY_REMEMBER_USER, false)
                    .remove(KEY_SESSION_TOKEN)
                    .apply()
            }
        }
        return verified
    }

    fun isRememberedSessionActive(context: Context): Boolean {
        val prefs = openSecurePrefs(context)
        val remembered = prefs.getBoolean(KEY_REMEMBER_USER, false)
        val token = prefs.getString(KEY_SESSION_TOKEN, null)
        return remembered && !token.isNullOrBlank()
    }

    fun canEnterSettings(context: Context): Boolean {
        return isRememberedSessionActive(context) || transientSettingsEntryAllowed
    }

    fun setRememberUserPreference(context: Context, rememberUser: Boolean) {
        val prefs = openSecurePrefs(context)
        if (rememberUser) {
            val existingToken = prefs.getString(KEY_SESSION_TOKEN, null)
            prefs.edit()
                .putBoolean(KEY_REMEMBER_USER, true)
                .putString(KEY_SESSION_TOKEN, existingToken ?: UUID.randomUUID().toString())
                .apply()
        } else {
            prefs.edit()
                .putBoolean(KEY_REMEMBER_USER, false)
                .remove(KEY_SESSION_TOKEN)
                .apply()
        }
    }

    fun clearTransientEntry() {
        transientSettingsEntryAllowed = false
    }

    fun logout(context: Context) {
        transientSettingsEntryAllowed = false
        openSecurePrefs(context).edit()
            .putBoolean(KEY_REMEMBER_USER, false)
            .remove(KEY_SESSION_TOKEN)
            .apply()
    }

    private fun derivePbkdf2(input: String): ByteArray {
        val salt = hexToBytes(SALT_HEX)
        val spec = PBEKeySpec(input.toCharArray(), salt, ITERATIONS, KEY_LENGTH_BITS)
        return try {
            val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            factory.generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }

    private fun hexToBytes(hex: String): ByteArray {
        val len = hex.length
        val out = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            val hi = Character.digit(hex[i], 16)
            val lo = Character.digit(hex[i + 1], 16)
            out[i / 2] = ((hi shl 4) + lo).toByte()
            i += 2
        }
        return out
    }
}
