package com.shamail.gpscam.storage

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import com.shamail.gpscam.data.GpsSnapshot
import com.shamail.gpscam.data.LocationSource
import com.shamail.gpscam.data.ResolutionPreset
import com.shamail.gpscam.data.SavedPhotoItem
import com.shamail.gpscam.data.TimestampMode
import com.shamail.gpscam.data.WatermarkConfig
import com.shamail.gpscam.watermark.WatermarkRenderer
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

object PhotoStorageManager {

    const val SUBFOLDER_NAME = "GpsCamByShamail"
    const val RELATIVE_PICTURES_PATH = "Pictures/GpsCamByShamail"

    /**
     * Safely decodes an existing gallery image URI in read-only mode (never modifying the original
     * gallery file), respecting EXIF orientation and applying safe upper dimension bounds.
     */
    fun decodeGalleryUriBitmap(
        context: Context,
        sourceUri: Uri,
        preset: ResolutionPreset
    ): Bitmap? {
        return try {
            val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(sourceUri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, boundsOpts)
            }
            if (boundsOpts.outWidth <= 0 || boundsOpts.outHeight <= 0) return null

            val targetMax = if (preset.maxLongEdge > 0) preset.maxLongEdge else 3840
            val rawLong = max(boundsOpts.outWidth, boundsOpts.outHeight)
            var sampleSize = 1
            while (rawLong / sampleSize > targetMax * 2) {
                sampleSize *= 2
            }

            val decodeOpts = BitmapFactory.Options().apply { inSampleSize = sampleSize }
            val raw = context.contentResolver.openInputStream(sourceUri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, decodeOpts)
            } ?: return null

            val orientation = runCatching {
                context.contentResolver.openInputStream(sourceUri)?.use { stream ->
                    ExifInterface(stream).getAttributeInt(
                        ExifInterface.TAG_ORIENTATION,
                        ExifInterface.ORIENTATION_NORMAL
                    )
                }
            }.getOrNull() ?: ExifInterface.ORIENTATION_NORMAL

            val matrix = Matrix()
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
                ExifInterface.ORIENTATION_TRANSPOSE -> {
                    matrix.postRotate(90f)
                    matrix.preScale(-1f, 1f)
                }
                ExifInterface.ORIENTATION_TRANSVERSE -> {
                    matrix.postRotate(270f)
                    matrix.preScale(-1f, 1f)
                }
            }

            val oriented = if (!matrix.isIdentity) {
                val rotated = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
                if (rotated != raw) raw.recycle()
                rotated
            } else {
                raw
            }

            val currentLong = max(oriented.width, oriented.height)
            if (currentLong <= targetMax) return oriented

            val scale = targetMax.toFloat() / currentLong.toFloat()
            val targetW = (oriented.width * scale).toInt().coerceAtLeast(1)
            val targetH = (oriented.height * scale).toInt().coerceAtLeast(1)
            val resized = Bitmap.createScaledBitmap(oriented, targetW, targetH, true)
            if (resized != oriented) oriented.recycle()
            resized
        } catch (_: Exception) {
            null
        }
    }

    fun decodeAndOrientTempCapture(
        tempFile: File,
        isFrontCamera: Boolean,
        preset: ResolutionPreset
    ): Bitmap? {
        val raw = BitmapFactory.decodeFile(tempFile.absolutePath) ?: return null
        val exif = runCatching { ExifInterface(tempFile.absolutePath) }.getOrNull()
        val orientation = exif?.getAttributeInt(
            ExifInterface.TAG_ORIENTATION,
            ExifInterface.ORIENTATION_NORMAL
        ) ?: ExifInterface.ORIENTATION_NORMAL

        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.postRotate(90f)
                matrix.preScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.postRotate(270f)
                matrix.preScale(-1f, 1f)
            }
        }
        if (isFrontCamera &&
            orientation != ExifInterface.ORIENTATION_FLIP_HORIZONTAL &&
            orientation != ExifInterface.ORIENTATION_TRANSPOSE &&
            orientation != ExifInterface.ORIENTATION_TRANSVERSE
        ) {
            matrix.postScale(-1f, 1f)
        }

        val oriented = if (!matrix.isIdentity) {
            val rotated = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
            if (rotated != raw) raw.recycle()
            rotated
        } else {
            raw
        }

        val maxEdge = preset.maxLongEdge
        if (maxEdge <= 0) return oriented

        val currentLongEdge = max(oriented.width, oriented.height)
        if (currentLongEdge <= maxEdge) return oriented

        val scale = maxEdge.toFloat() / currentLongEdge.toFloat()
        val targetW = (oriented.width * scale).toInt().coerceAtLeast(1)
        val targetH = (oriented.height * scale).toInt().coerceAtLeast(1)
        val resized = Bitmap.createScaledBitmap(oriented, targetW, targetH, true)
        if (resized != oriented) oriented.recycle()
        return resized
    }

    fun processAndSaveWatermarkedPhoto(
        context: Context,
        sourceBitmap: Bitmap,
        config: WatermarkConfig,
        gps: GpsSnapshot,
        captureDeviceMillis: Long = System.currentTimeMillis(),
        isGalleryImport: Boolean = false
    ): Uri? {
        val logoBitmap = WatermarkRenderer.loadLogoBitmap(context, config)
        val watermarked = WatermarkRenderer.renderOntoBitmap(
            source = sourceBitmap,
            config = config,
            gps = gps,
            logoBitmap = logoBitmap,
            captureMillis = captureDeviceMillis
        )

        val fileStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date(captureDeviceMillis))
        val fileName = if (isGalleryImport) {
            "SHAMAIL_GALLERY_GPS_$fileStamp.jpg"
        } else {
            "SHAMAIL_GPS_$fileStamp.jpg"
        }
        val quality = config.jpegQuality.coerceIn(70, 100)

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveViaMediaStoreQ(
                context,
                watermarked,
                fileName,
                quality,
                config,
                gps,
                captureDeviceMillis,
                isGalleryImport
            )
        } else {
            saveViaLegacyPublicPictures(
                context,
                watermarked,
                fileName,
                quality,
                config,
                gps,
                captureDeviceMillis,
                isGalleryImport
            )
        }
    }

    private fun saveViaMediaStoreQ(
        context: Context,
        bitmap: Bitmap,
        fileName: String,
        quality: Int,
        config: WatermarkConfig,
        gps: GpsSnapshot,
        captureDeviceMillis: Long,
        isGalleryImport: Boolean
    ): Uri? {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$SUBFOLDER_NAME")
            put(MediaStore.Images.Media.DATE_ADDED, captureDeviceMillis / 1000L)
            put(MediaStore.Images.Media.DATE_TAKEN, captureDeviceMillis)
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }

        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return null
        return try {
            resolver.openOutputStream(uri)?.use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            }
            resolver.openFileDescriptor(uri, "rw")?.use { pfd ->
                val exif = ExifInterface(pfd.fileDescriptor)
                applyExifMetadata(exif, config, gps, captureDeviceMillis, isGalleryImport)
                exif.saveAttributes()
            }
            val doneValues = ContentValues().apply {
                put(MediaStore.Images.Media.IS_PENDING, 0)
            }
            resolver.update(uri, doneValues, null, null)
            uri
        } catch (_: Exception) {
            runCatching { resolver.delete(uri, null, null) }
            null
        }
    }

    private fun saveViaLegacyPublicPictures(
        context: Context,
        bitmap: Bitmap,
        fileName: String,
        quality: Int,
        config: WatermarkConfig,
        gps: GpsSnapshot,
        captureDeviceMillis: Long,
        isGalleryImport: Boolean
    ): Uri? {
        return try {
            @Suppress("DEPRECATION")
            val picturesRoot = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
            val targetDir = File(picturesRoot, SUBFOLDER_NAME)
            if (!targetDir.exists()) targetDir.mkdirs()

            val outFile = File(targetDir, fileName)
            FileOutputStream(outFile).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            }

            val exif = ExifInterface(outFile.absolutePath)
            applyExifMetadata(exif, config, gps, captureDeviceMillis, isGalleryImport)
            exif.saveAttributes()

            MediaScannerConnection.scanFile(
                context,
                arrayOf(outFile.absolutePath),
                arrayOf("image/jpeg"),
                null
            )

            FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                outFile
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun applyExifMetadata(
        exif: ExifInterface,
        config: WatermarkConfig,
        gps: GpsSnapshot,
        captureDeviceMillis: Long,
        isGalleryImport: Boolean
    ) {
        val exifDateFmt = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US)
        val displayedMillis = config.resolveTimestampMillis(gps, captureDeviceMillis)
        // Keep original file export/capture timestamp strictly separate from custom display time
        exif.setAttribute(ExifInterface.TAG_DATETIME, exifDateFmt.format(Date(captureDeviceMillis)))
        if (!isGalleryImport && config.timestampMode != TimestampMode.MANUAL) {
            exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, exifDateFmt.format(Date(displayedMillis)))
        }
        exif.setAttribute(ExifInterface.TAG_SOFTWARE, "Gps cam by shamail v2.0.0")
        exif.setAttribute(ExifInterface.TAG_ARTIST, config.organizationName)

        // Only write raw EXIF GPS coordinates when captured from verified Live Device GPS
        if (!isGalleryImport && gps.hasFix && gps.locationSource == LocationSource.LIVE_GPS) {
            exif.setLatLong(gps.latitude, gps.longitude)
            exif.setAttribute(
                ExifInterface.TAG_GPS_PROCESSING_METHOD,
                if (gps.isOfflineAddress) "GPS_OFFLINE" else "FUSED_GPS"
            )
        }

        val sourceTag = when {
            isGalleryImport -> "GALLERY_GPS_EXPORT (LocationSource=${gps.locationSource.name})"
            config.timestampMode == TimestampMode.MANUAL -> "CUSTOM_DISPLAY_TIME (Displayed=${exifDateFmt.format(Date(displayedMillis))}, FileCapture=${exifDateFmt.format(Date(captureDeviceMillis))})"
            config.timestampMode == TimestampMode.GPS_FIX -> "VERIFIED_GPS_TIME (${exifDateFmt.format(Date(displayedMillis))})"
            else -> "VERIFIED_DEVICE_TIME (${exifDateFmt.format(Date(displayedMillis))})"
        }
        exif.setAttribute(ExifInterface.TAG_USER_COMMENT, sourceTag)
        exif.setAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION, "${config.organizationName} | $sourceTag")
    }

    fun listSavedPhotos(context: Context): List<SavedPhotoItem> {
        val items = mutableListOf<SavedPhotoItem>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val projection = arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.RELATIVE_PATH
            )
            val selection = "${MediaStore.Images.Media.RELATIVE_PATH} LIKE ?"
            val selectionArgs = arrayOf("%$SUBFOLDER_NAME%")
            val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"

            runCatching {
                context.contentResolver.query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    projection,
                    selection,
                    selectionArgs,
                    sortOrder
                )?.use { cursor ->
                    val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                    val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
                    val dateCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)

                    while (cursor.moveToNext()) {
                        val id = cursor.getLong(idCol)
                        val name = cursor.getString(nameCol) ?: "SHAMAIL_GPS.jpg"
                        val dateSec = cursor.getLong(dateCol)
                        val contentUri = ContentUris.withAppendedId(
                            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                            id
                        )
                        val provenance = readProvenanceBadge(context, contentUri, null)
                        items.add(
                            SavedPhotoItem(
                                uri = contentUri,
                                displayName = name,
                                dateAddedSeconds = dateSec,
                                filePath = null,
                                timestampProvenance = provenance
                            )
                        )
                    }
                }
            }
        } else {
            @Suppress("DEPRECATION")
            val dir = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                SUBFOLDER_NAME
            )
            if (dir.exists()) {
                dir.listFiles { f -> f.isFile && (f.name.endsWith(".jpg", true) || f.name.endsWith(".jpeg", true)) }
                    ?.sortedByDescending { it.lastModified() }
                    ?.forEach { file ->
                        val uri = FileProvider.getUriForFile(
                            context,
                            "${context.packageName}.fileprovider",
                            file
                        )
                        val provenance = readProvenanceBadge(context, uri, file)
                        items.add(
                            SavedPhotoItem(
                                uri = uri,
                                displayName = file.name,
                                dateAddedSeconds = file.lastModified() / 1000L,
                                filePath = file.absolutePath,
                                timestampProvenance = provenance
                            )
                        )
                    }
            }
        }
        return items
    }

    fun readProvenanceBadge(context: Context, uri: Uri, file: File?): String {
        return try {
            val exif = if (file != null && file.exists()) {
                ExifInterface(file.absolutePath)
            } else {
                context.contentResolver.openInputStream(uri)?.use { ExifInterface(it) }
            }
            val comment = exif?.getAttribute(ExifInterface.TAG_USER_COMMENT)
                ?: exif?.getAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION)
                ?: ""
            when {
                comment.contains("GALLERY_GPS_EXPORT", ignoreCase = true) -> "Gallery GPS Camera Export"
                comment.contains("CUSTOM_DISPLAY_TIME", ignoreCase = true) ||
                    comment.contains("MANUAL_EDITED", ignoreCase = true) -> "Custom Display Timestamp"
                comment.contains("VERIFIED_GPS", ignoreCase = true) -> "Verified GPS Time"
                else -> "Verified Capture Time"
            }
        } catch (_: Exception) {
            "Saved in $RELATIVE_PICTURES_PATH"
        }
    }

    fun deletePhoto(context: Context, uri: Uri, filePath: String?): Boolean {
        return try {
            if (!filePath.isNullOrBlank()) {
                val f = File(filePath)
                if (f.exists() && f.delete()) return true
            }
            context.contentResolver.delete(uri, null, null) > 0
        } catch (_: Exception) {
            false
        }
    }
}
