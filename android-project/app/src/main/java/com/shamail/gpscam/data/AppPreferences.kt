package com.shamail.gpscam.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File
import java.io.FileOutputStream

class AppPreferences(private val context: Context) {

    private val prefs = context.getSharedPreferences("gps_cam_shamail_prefs", Context.MODE_PRIVATE)

    fun loadConfig(): WatermarkConfig {
        val modeStr = prefs.getString("timestamp_mode", TimestampMode.AUTO_DEVICE.name)
            ?: TimestampMode.AUTO_DEVICE.name
        val sizeStr = prefs.getString("watermark_size", WatermarkSize.MEDIUM.name)
            ?: WatermarkSize.MEDIUM.name
        val posStr = prefs.getString("watermark_pos", WatermarkPosition.BOTTOM_CENTER.name)
            ?: WatermarkPosition.BOTTOM_CENTER.name
        val styleStr = prefs.getString("watermark_style", WatermarkStyle.CLASSIC_CARD.name)
            ?: WatermarkStyle.CLASSIC_CARD.name
        val colorStr = prefs.getString("watermark_text_color", WatermarkTextColor.WHITE.name)
            ?: WatermarkTextColor.WHITE.name
        val coordStr = prefs.getString("coord_format", CoordFormat.DECIMAL.name)
            ?: CoordFormat.DECIMAL.name
        val resStr = prefs.getString("resolution_preset", ResolutionPreset.MAX.name)
            ?: ResolutionPreset.MAX.name

        return WatermarkConfig(
            organizationName = prefs.getString("org_name", "SHAMAIL PERA")?.ifBlank { "SHAMAIL PERA" }
                ?: "SHAMAIL PERA",
            customLogoPath = prefs.getString("custom_logo_path", null),
            timestampMode = runCatching { TimestampMode.valueOf(modeStr) }.getOrDefault(TimestampMode.AUTO_DEVICE),
            manualTimestampMillis = prefs.getLong("manual_timestamp_ms", System.currentTimeMillis()),
            is24HourFormat = prefs.getBoolean("is_24_hour", false),
            dateFormatPattern = prefs.getString("date_format_pattern", "dd MMM yyyy") ?: "dd MMM yyyy",
            showWatermark = prefs.getBoolean("show_watermark", true),
            watermarkSize = runCatching { WatermarkSize.valueOf(sizeStr) }.getOrDefault(WatermarkSize.MEDIUM),
            watermarkOpacity = prefs.getInt("watermark_opacity", 78).coerceIn(30, 95),
            fontScale = prefs.getFloat("font_scale", 1.0f).coerceIn(0.8f, 1.35f),
            watermarkPosition = runCatching { WatermarkPosition.valueOf(posStr) }.getOrDefault(WatermarkPosition.BOTTOM_CENTER),
            watermarkStyle = runCatching { WatermarkStyle.valueOf(styleStr) }.getOrDefault(WatermarkStyle.CLASSIC_CARD),
            textColor = runCatching { WatermarkTextColor.valueOf(colorStr) }.getOrDefault(WatermarkTextColor.WHITE),
            showOrgHeading = prefs.getBoolean("show_org_heading", true),
            showLocationTitle = prefs.getBoolean("show_location_title", true),
            showFullAddress = prefs.getBoolean("show_full_address", true),
            showCoordinates = prefs.getBoolean("show_coordinates", true),
            showDateTime = prefs.getBoolean("show_date_time", true),
            showAccuracy = prefs.getBoolean("show_accuracy", true),
            showLogo = prefs.getBoolean("show_logo", true),
            showMapThumbnail = prefs.getBoolean("show_map_thumbnail", false),
            coordFormat = runCatching { CoordFormat.valueOf(coordStr) }.getOrDefault(CoordFormat.DECIMAL),
            resolutionPreset = runCatching { ResolutionPreset.valueOf(resStr) }.getOrDefault(ResolutionPreset.MAX),
            jpegQuality = prefs.getInt("jpeg_quality", 95).coerceIn(70, 100),
            defaultFlashMode = prefs.getInt("default_flash_mode", 0).coerceIn(0, 2),
            defaultLensFacing = prefs.getInt("default_lens_facing", 1).coerceIn(0, 1),
            autoLocationEnabled = prefs.getBoolean("auto_location_enabled", true),
            openEditorAfterCapture = prefs.getBoolean("open_editor_after_capture", true)
        )
    }

    fun saveConfig(config: WatermarkConfig) {
        prefs.edit()
            .putString("org_name", config.organizationName.ifBlank { "SHAMAIL PERA" })
            .putString("custom_logo_path", config.customLogoPath)
            .putString("timestamp_mode", config.timestampMode.name)
            .putLong("manual_timestamp_ms", config.manualTimestampMillis)
            .putBoolean("is_24_hour", config.is24HourFormat)
            .putString("date_format_pattern", config.dateFormatPattern)
            .putBoolean("show_watermark", config.showWatermark)
            .putString("watermark_size", config.watermarkSize.name)
            .putInt("watermark_opacity", config.watermarkOpacity)
            .putFloat("font_scale", config.fontScale)
            .putString("watermark_pos", config.watermarkPosition.name)
            .putString("watermark_style", config.watermarkStyle.name)
            .putString("watermark_text_color", config.textColor.name)
            .putBoolean("show_org_heading", config.showOrgHeading)
            .putBoolean("show_location_title", config.showLocationTitle)
            .putBoolean("show_full_address", config.showFullAddress)
            .putBoolean("show_coordinates", config.showCoordinates)
            .putBoolean("show_date_time", config.showDateTime)
            .putBoolean("show_accuracy", config.showAccuracy)
            .putBoolean("show_logo", config.showLogo)
            .putBoolean("show_map_thumbnail", config.showMapThumbnail)
            .putString("coord_format", config.coordFormat.name)
            .putString("resolution_preset", config.resolutionPreset.name)
            .putInt("jpeg_quality", config.jpegQuality)
            .putInt("default_flash_mode", config.defaultFlashMode)
            .putInt("default_lens_facing", config.defaultLensFacing)
            .putBoolean("auto_location_enabled", config.autoLocationEnabled)
            .putBoolean("open_editor_after_capture", config.openEditorAfterCapture)
            .apply()
    }

    fun importCustomLogo(uri: Uri): String? {
        return try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                val decoded = BitmapFactory.decodeStream(input) ?: return null
                val maxDim = 320
                val ratio = minOf(maxDim.toFloat() / decoded.width, maxDim.toFloat() / decoded.height, 1f)
                val scaled = if (ratio < 1f) {
                    Bitmap.createScaledBitmap(
                        decoded,
                        (decoded.width * ratio).toInt().coerceAtLeast(1),
                        (decoded.height * ratio).toInt().coerceAtLeast(1),
                        true
                    )
                } else {
                    decoded
                }
                val outFile = File(context.filesDir, "custom_org_logo.png")
                FileOutputStream(outFile).use { out ->
                    scaled.compress(Bitmap.CompressFormat.PNG, 100, out)
                }
                outFile.absolutePath
            }
        } catch (_: Exception) {
            null
        }
    }

    fun clearCustomLogo() {
        val outFile = File(context.filesDir, "custom_org_logo.png")
        if (outFile.exists()) outFile.delete()
        prefs.edit().remove("custom_logo_path").apply()
    }
}
