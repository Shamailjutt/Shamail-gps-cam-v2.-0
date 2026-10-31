package com.shamail.gpscam.data

import android.net.Uri
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

enum class TimestampMode {
    AUTO_DEVICE,
    GPS_FIX,
    MANUAL
}

enum class LocationSource {
    LIVE_GPS,
    SAVED_LOCATION,
    MANUAL_MAP
}

enum class WatermarkSize(val widthFraction: Float) {
    SMALL(0.70f),
    MEDIUM(0.88f),
    LARGE(0.96f)
}

enum class WatermarkPosition {
    BOTTOM_LEFT,
    BOTTOM_CENTER,
    BOTTOM_RIGHT
}

enum class WatermarkStyle {
    CLASSIC_CARD,
    COMPACT_STRIP,
    MODERN_BANNER
}

enum class WatermarkTextColor(val hex: String) {
    WHITE("#FFFFFF"),
    IVORY("#FEF3C7"),
    GOLD("#FDE68A")
}

enum class CoordFormat {
    DECIMAL,
    DMS
}

enum class ResolutionPreset(val maxLongEdge: Int) {
    MAX(0),
    FHD(1920),
    HD(1280)
}

data class GpsSnapshot(
    val hasFix: Boolean = false,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val accuracyMeters: Float = 0f,
    val altitudeMeters: Double = 0.0,
    val gpsTimestampMillis: Long = 0L,
    val city: String = "",
    val district: String = "",
    val province: String = "",
    val country: String = "",
    val streetAddress: String = "",
    val isOfflineAddress: Boolean = false,
    val locationSource: LocationSource = LocationSource.LIVE_GPS
) {
    fun buildLocationHeadline(): String {
        if (!hasFix) return "Waiting for GPS Satellite Fix..."
        val parts = linkedSetOf<String>()
        if (city.isNotBlank()) parts.add(city.trim())
        if (district.isNotBlank() && !district.equals(city, ignoreCase = true)) {
            parts.add(district.trim())
        }
        if (province.isNotBlank()) parts.add(province.trim())
        if (country.isNotBlank()) parts.add(country.trim())
        return if (parts.isNotEmpty()) {
            parts.joinToString(", ")
        } else {
            String.format(Locale.US, "GPS %.5f°, %.5f°", latitude, longitude)
        }
    }

    fun buildFullAddressLine(): String {
        if (!hasFix) return "Ensure clear sky view or enable High Accuracy Location"
        if (streetAddress.isNotBlank()) return streetAddress.trim()
        return if (isOfflineAddress) {
            "Offline GPS Coordinates Active"
        } else {
            String.format(Locale.US, "%.6f°, %.6f°", latitude, longitude)
        }
    }
}

data class WatermarkConfig(
    val organizationName: String = "SHAMAIL PERA",
    val customLogoPath: String? = null,
    val timestampMode: TimestampMode = TimestampMode.AUTO_DEVICE,
    val manualTimestampMillis: Long = System.currentTimeMillis(),
    val is24HourFormat: Boolean = false,
    val dateFormatPattern: String = "dd MMM yyyy",
    val showWatermark: Boolean = true,
    val watermarkSize: WatermarkSize = WatermarkSize.MEDIUM,
    val watermarkOpacity: Int = 78,
    val fontScale: Float = 1.0f,
    val watermarkPosition: WatermarkPosition = WatermarkPosition.BOTTOM_CENTER,
    val watermarkStyle: WatermarkStyle = WatermarkStyle.CLASSIC_CARD,
    val textColor: WatermarkTextColor = WatermarkTextColor.WHITE,
    val showOrgHeading: Boolean = true,
    val showLocationTitle: Boolean = true,
    val showFullAddress: Boolean = true,
    val showCoordinates: Boolean = true,
    val showDateTime: Boolean = true,
    val showAccuracy: Boolean = true,
    val showLogo: Boolean = true,
    val showMapThumbnail: Boolean = false,
    val coordFormat: CoordFormat = CoordFormat.DECIMAL,
    val resolutionPreset: ResolutionPreset = ResolutionPreset.MAX,
    val jpegQuality: Int = 95,
    val defaultFlashMode: Int = 0,
    val defaultLensFacing: Int = 1,
    val autoLocationEnabled: Boolean = true,
    val openEditorAfterCapture: Boolean = true
) {
    fun resolveTimestampMillis(gps: GpsSnapshot, nowMillis: Long = System.currentTimeMillis()): Long {
        return when (timestampMode) {
            TimestampMode.AUTO_DEVICE -> nowMillis
            TimestampMode.GPS_FIX -> if (gps.hasFix && gps.gpsTimestampMillis > 0L) gps.gpsTimestampMillis else nowMillis
            TimestampMode.MANUAL -> manualTimestampMillis
        }
    }

    fun isCustomTimestamp(): Boolean = timestampMode == TimestampMode.MANUAL

    fun formatTimestamp(gps: GpsSnapshot, nowMillis: Long = System.currentTimeMillis()): String {
        val targetMillis = resolveTimestampMillis(gps, nowMillis)
        val timePattern = if (is24HourFormat) "HH:mm:ss" else "hh:mm:ss a"
        val fullPattern = "$dateFormatPattern, $timePattern"
        return try {
            SimpleDateFormat(fullPattern, Locale.US).format(Date(targetMillis))
        } catch (_: Exception) {
            SimpleDateFormat("dd MMM yyyy, hh:mm:ss a", Locale.US).format(Date(targetMillis))
        }
    }

    fun formatCoordinates(gps: GpsSnapshot): String {
        if (!gps.hasFix) return "Lat: --.------°   Lon: --.------°"
        return when (coordFormat) {
            CoordFormat.DECIMAL -> {
                val latHemi = if (gps.latitude >= 0) "N" else "S"
                val lonHemi = if (gps.longitude >= 0) "E" else "W"
                String.format(
                    Locale.US,
                    "Lat %.6f° %s, Lon %.6f° %s",
                    abs(gps.latitude),
                    latHemi,
                    abs(gps.longitude),
                    lonHemi
                )
            }
            CoordFormat.DMS -> {
                val latDms = toDms(gps.latitude, isLatitude = true)
                val lonDms = toDms(gps.longitude, isLatitude = false)
                "Lat $latDms, Lon $lonDms"
            }
        }
    }

    private fun toDms(coord: Double, isLatitude: Boolean): String {
        val hemisphere = if (isLatitude) {
            if (coord >= 0) "N" else "S"
        } else {
            if (coord >= 0) "E" else "W"
        }
        val absolute = abs(coord)
        val degrees = absolute.toInt()
        val minutesFull = (absolute - degrees) * 60.0
        val minutes = minutesFull.toInt()
        val seconds = (minutesFull - minutes) * 60.0
        return String.format(Locale.US, "%d°%02d'%04.1f\"%s", degrees, minutes, seconds, hemisphere)
    }
}

data class SavedPhotoItem(
    val uri: Uri,
    val displayName: String,
    val dateAddedSeconds: Long,
    val filePath: String?,
    val timestampProvenance: String
)
