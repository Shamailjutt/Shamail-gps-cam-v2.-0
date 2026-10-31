package com.shamail.gpscam

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.shamail.gpscam.data.AppPreferences
import com.shamail.gpscam.data.GpsSnapshot
import com.shamail.gpscam.data.LocationSource
import com.shamail.gpscam.data.SavedLocationDatabase
import com.shamail.gpscam.data.TimestampMode
import com.shamail.gpscam.data.WatermarkConfig
import com.shamail.gpscam.databinding.ActivityPostCaptureEditBinding
import com.shamail.gpscam.storage.PhotoStorageManager
import com.shamail.gpscam.ui.SequentialDateTimePicker
import com.shamail.gpscam.watermark.WatermarkRenderer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

class PostCaptureEditActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPostCaptureEditBinding
    private lateinit var prefs: AppPreferences

    private var workingConfig = WatermarkConfig()
    private var workingGps = GpsSnapshot()
    private var captureMomentMillis: Long = System.currentTimeMillis()

    private var sourceTempFile: File? = null
    private var previewBaseBitmap: Bitmap? = null
    private var currentPreviewWatermarked: Bitmap? = null
    private var logoBitmap: Bitmap? = null
    private var isSaving = false

    private val isoDateFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }
    private val isoTimeFmt = SimpleDateFormat("HH:mm:ss", Locale.US).apply { isLenient = false }

    private val mapPickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK && result.data != null) {
            val data = result.data ?: return@registerForActivityResult
            val title = data.getStringExtra("picked_title").orEmpty()
            val address = data.getStringExtra("picked_address").orEmpty()
            val lat = data.getDoubleExtra("picked_lat", workingGps.latitude)
            val lon = data.getDoubleExtra("picked_lon", workingGps.longitude)
            val wasBookmark = data.getBooleanExtra("picked_was_saved_bookmark", false)

            workingGps = workingGps.copy(
                hasFix = true,
                latitude = lat,
                longitude = lon,
                accuracyMeters = 0f,
                city = title,
                district = "",
                province = "",
                country = "",
                streetAddress = address,
                isOfflineAddress = false,
                locationSource = if (wasBookmark) LocationSource.SAVED_LOCATION else LocationSource.MANUAL_MAP
            )
            binding.etPostLocationTitle.setText(title)
            binding.etPostStreetAddress.setText(address)
            binding.etPostLat.setText(String.format(Locale.US, "%.6f", lat))
            binding.etPostLon.setText(String.format(Locale.US, "%.6f", lon))
            updateLocationSourceLabel()
            renderWatermarkedPreview()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPostCaptureEditBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = AppPreferences(this)
        workingConfig = prefs.loadConfig()

        val tempPath = intent.getStringExtra("temp_photo_path")
        if (tempPath.isNullOrBlank()) {
            finish()
            return
        }
        val f = File(tempPath)
        if (!f.exists()) {
            finish()
            return
        }
        sourceTempFile = f

        captureMomentMillis = intent.getLongExtra("capture_millis", System.currentTimeMillis())
        workingGps = GpsSnapshot(
            hasFix = intent.getBooleanExtra("gps_has_fix", false),
            latitude = intent.getDoubleExtra("gps_lat", 0.0),
            longitude = intent.getDoubleExtra("gps_lon", 0.0),
            accuracyMeters = intent.getFloatExtra("gps_acc", 0f),
            gpsTimestampMillis = intent.getLongExtra("gps_time", captureMomentMillis),
            city = intent.getStringExtra("gps_city").orEmpty(),
            district = intent.getStringExtra("gps_district").orEmpty(),
            province = intent.getStringExtra("gps_province").orEmpty(),
            country = intent.getStringExtra("gps_country").orEmpty(),
            streetAddress = intent.getStringExtra("gps_street").orEmpty(),
            isOfflineAddress = intent.getBooleanExtra("gps_offline", false)
        )

        val initialMillis = workingConfig.resolveTimestampMillis(workingGps, captureMomentMillis)
        workingConfig = workingConfig.copy(manualTimestampMillis = initialMillis)

        logoBitmap = WatermarkRenderer.loadLogoBitmap(this, workingConfig)
        populateInitialFields(initialMillis)
        bindActions()
        loadPreviewBitmapAsync()
    }

    private fun populateInitialFields(initialMillis: Long) {
        syncDateAndTimeInputs(initialMillis)
        binding.switchPost24Hour.isChecked = workingConfig.is24HourFormat
        binding.etPostLocationTitle.setText(
            if (workingGps.hasFix) workingGps.buildLocationHeadline() else ""
        )
        binding.etPostStreetAddress.setText(workingGps.streetAddress)
        if (workingGps.hasFix) {
            binding.etPostLat.setText(String.format(Locale.US, "%.6f", workingGps.latitude))
            binding.etPostLon.setText(String.format(Locale.US, "%.6f", workingGps.longitude))
        }
        updateLocationSourceLabel()
    }

    private fun updateLocationSourceLabel() {
        binding.tvPostLocationSource.text = when (workingGps.locationSource) {
            LocationSource.SAVED_LOCATION -> "Editor Source: Saved Location"
            LocationSource.MANUAL_MAP -> "Editor Source: Selected Map Location"
            LocationSource.LIVE_GPS -> "Editor Source: Live Device GPS"
        }
    }

    private fun bindActions() {
        binding.btnRetakeTop.setOnClickListener { discardAndFinish() }
        binding.btnPostRetake.setOnClickListener { discardAndFinish() }

        binding.btnSaveTop.setOnClickListener { saveFinalWatermarkedPhoto() }
        binding.btnPostSaveBottom.setOnClickListener { saveFinalWatermarkedPhoto() }

        binding.btnPostPickDate.setOnClickListener {
            val baseMs = workingConfig.resolveTimestampMillis(workingGps, captureMomentMillis)
            SequentialDateTimePicker.launch(
                activity = this,
                initialMillis = baseMs,
                is24HourFormat = workingConfig.is24HourFormat,
                dateFormatPattern = workingConfig.dateFormatPattern
            ) { confirmedMillis ->
                workingConfig = workingConfig.copy(
                    timestampMode = TimestampMode.MANUAL,
                    manualTimestampMillis = confirmedMillis
                )
                syncDateAndTimeInputs(confirmedMillis)
                renderWatermarkedPreview()
            }
        }

        binding.btnPostPickTime.setOnClickListener {
            val baseMs = workingConfig.resolveTimestampMillis(workingGps, captureMomentMillis)
            SequentialDateTimePicker.launchTimeOnlyWithConfirm(
                activity = this,
                initialMillis = baseMs,
                is24HourFormat = workingConfig.is24HourFormat,
                dateFormatPattern = workingConfig.dateFormatPattern
            ) { confirmedMillis ->
                workingConfig = workingConfig.copy(
                    timestampMode = TimestampMode.MANUAL,
                    manualTimestampMillis = confirmedMillis
                )
                syncDateAndTimeInputs(confirmedMillis)
                renderWatermarkedPreview()
            }
        }

        binding.btnPostResetTime.setOnClickListener {
            val now = System.currentTimeMillis()
            workingConfig = workingConfig.copy(
                timestampMode = TimestampMode.AUTO_DEVICE,
                manualTimestampMillis = now
            )
            captureMomentMillis = now
            syncDateAndTimeInputs(now)
            renderWatermarkedPreview()
            Toast.makeText(this, "Reset to current date & time", Toast.LENGTH_SHORT).show()
        }

        binding.btnPostApplyTyped.setOnClickListener {
            val parsed = parseTypedDateTime()
            if (parsed == null) {
                Toast.makeText(this, "Use YYYY-MM-DD and HH:MM:SS format", Toast.LENGTH_SHORT).show()
            } else {
                workingConfig = workingConfig.copy(
                    timestampMode = TimestampMode.MANUAL,
                    manualTimestampMillis = parsed
                )
                syncDateAndTimeInputs(parsed)
                renderWatermarkedPreview()
                Toast.makeText(this, "Updated date & time on photo", Toast.LENGTH_SHORT).show()
            }
        }

        binding.switchPost24Hour.setOnCheckedChangeListener { _, isChecked ->
            workingConfig = workingConfig.copy(is24HourFormat = isChecked)
            renderWatermarkedPreview()
        }

        binding.btnPostSavedLocations.setOnClickListener {
            lifecycleScope.launch(Dispatchers.IO) {
                val items = SavedLocationDatabase.getInstance(this@PostCaptureEditActivity)
                    .savedLocationDao()
                    .getAll()
                withContext(Dispatchers.Main) {
                    if (items.isEmpty()) {
                        Toast.makeText(
                            this@PostCaptureEditActivity,
                            "No saved locations yet. Use Select on Map to save bookmarks.",
                            Toast.LENGTH_SHORT
                        ).show()
                        return@withContext
                    }
                    val labels = items.map { "${it.label} — ${it.locationTitle}" }.toTypedArray()
                    MaterialAlertDialogBuilder(this@PostCaptureEditActivity)
                        .setTitle("Select Saved Location")
                        .setItems(labels) { _, which ->
                            val picked = items[which]
                            workingGps = picked.toGpsSnapshot()
                            binding.etPostLocationTitle.setText(picked.locationTitle)
                            binding.etPostStreetAddress.setText(picked.fullAddress)
                            binding.etPostLat.setText(String.format(Locale.US, "%.6f", picked.latitude))
                            binding.etPostLon.setText(String.format(Locale.US, "%.6f", picked.longitude))
                            updateLocationSourceLabel()
                            renderWatermarkedPreview()
                        }
                        .setNegativeButton("Cancel", null)
                        .show()
                }
            }
        }

        binding.btnPostPickOnMap.setOnClickListener {
            applyEditedLocationFields()
            val intent = Intent(this, LocationMapPickerActivity::class.java).apply {
                putExtra("initial_lat", workingGps.latitude)
                putExtra("initial_lon", workingGps.longitude)
                putExtra("initial_title", workingGps.buildLocationHeadline())
                putExtra("initial_address", workingGps.streetAddress)
            }
            mapPickerLauncher.launch(intent)
        }

        binding.btnPostUpdateLocation.setOnClickListener {
            applyEditedLocationFields()
            renderWatermarkedPreview()
            Toast.makeText(this, "Location updated on watermark", Toast.LENGTH_SHORT).show()
        }
    }

    private fun applyEditedLocationFields() {
        val headline = binding.etPostLocationTitle.text?.toString()?.trim().orEmpty()
        val street = binding.etPostStreetAddress.text?.toString()?.trim().orEmpty()
        val latVal = binding.etPostLat.text?.toString()?.trim()?.toDoubleOrNull()
        val lonVal = binding.etPostLon.text?.toString()?.trim()?.toDoubleOrNull()

        val hasCoords = latVal != null && lonVal != null
        workingGps = workingGps.copy(
            hasFix = workingGps.hasFix || hasCoords || headline.isNotEmpty() || street.isNotEmpty(),
            latitude = latVal ?: workingGps.latitude,
            longitude = lonVal ?: workingGps.longitude,
            city = if (headline.isNotEmpty()) headline else workingGps.city,
            district = if (headline.isNotEmpty()) "" else workingGps.district,
            province = if (headline.isNotEmpty()) "" else workingGps.province,
            country = if (headline.isNotEmpty()) "" else workingGps.country,
            streetAddress = street
        )
    }

    private fun parseTypedDateTime(): Long? {
        val dStr = binding.etPostDate.text?.toString()?.trim().orEmpty()
        var tStr = binding.etPostTime.text?.toString()?.trim().orEmpty()
        if (dStr.isEmpty() || tStr.isEmpty()) return null
        if (tStr.count { it == ':' } == 1) tStr = "$tStr:00"
        return runCatching {
            SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).apply { isLenient = false }
                .parse("$dStr $tStr")?.time
        }.getOrNull()
    }

    private fun syncDateAndTimeInputs(ms: Long) {
        val dt = Date(ms)
        binding.etPostDate.setText(isoDateFmt.format(dt))
        binding.etPostTime.setText(isoTimeFmt.format(dt))
    }

    private fun loadPreviewBitmapAsync() {
        val file = sourceTempFile ?: return
        lifecycleScope.launch(Dispatchers.IO) {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, bounds)
            val longEdge = max(bounds.outWidth, bounds.outHeight)
            var sample = 1
            while (longEdge / sample > 1280) {
                sample *= 2
            }
            val decoded = BitmapFactory.decodeFile(
                file.absolutePath,
                BitmapFactory.Options().apply { inSampleSize = sample }
            )
            previewBaseBitmap = decoded
            withContext(Dispatchers.Main) {
                renderWatermarkedPreview()
            }
        }
    }

    private fun renderWatermarkedPreview() {
        val base = previewBaseBitmap ?: return
        val stampStr = workingConfig.formatTimestamp(workingGps, captureMomentMillis)
        binding.tvPostTimestampStatus.text = "Stamp on Photo: $stampStr"

        lifecycleScope.launch(Dispatchers.Default) {
            val rendered = WatermarkRenderer.renderOntoBitmap(
                source = base,
                config = workingConfig,
                gps = workingGps,
                logoBitmap = logoBitmap,
                captureMillis = captureMomentMillis
            )
            withContext(Dispatchers.Main) {
                val old = currentPreviewWatermarked
                currentPreviewWatermarked = rendered
                binding.ivCapturedPreview.setImageBitmap(rendered)
                if (old != null && old != base && !old.isRecycled) {
                    old.recycle()
                }
            }
        }
    }

    private fun saveFinalWatermarkedPhoto() {
        if (isSaving) return
        val file = sourceTempFile ?: return
        isSaving = true
        binding.btnSaveTop.isEnabled = false
        binding.btnPostSaveBottom.isEnabled = false

        // Apply any typed changes in the date/time or location fields before saving
        parseTypedDateTime()?.let { typedMs ->
            val currentResolved = workingConfig.resolveTimestampMillis(workingGps, captureMomentMillis)
            if (kotlin.math.abs(typedMs - currentResolved) > 1500L) {
                workingConfig = workingConfig.copy(
                    timestampMode = TimestampMode.MANUAL,
                    manualTimestampMillis = typedMs
                )
            }
        }
        applyEditedLocationFields()

        val finalConfig = workingConfig.copy()
        val finalGps = workingGps.copy()

        lifecycleScope.launch(Dispatchers.IO) {
            val fullResBitmap = BitmapFactory.decodeFile(file.absolutePath)
            val savedUri = if (fullResBitmap != null) {
                val uri = PhotoStorageManager.processAndSaveWatermarkedPhoto(
                    context = this@PostCaptureEditActivity,
                    sourceBitmap = fullResBitmap,
                    config = finalConfig,
                    gps = finalGps,
                    captureDeviceMillis = captureMomentMillis
                )
                fullResBitmap.recycle()
                uri
            } else {
                null
            }
            if (file.exists()) file.delete()

            withContext(Dispatchers.Main) {
                isSaving = false
                if (savedUri != null) {
                    Toast.makeText(
                        this@PostCaptureEditActivity,
                        "Saved watermarked photo to ${PhotoStorageManager.RELATIVE_PICTURES_PATH}",
                        Toast.LENGTH_SHORT
                    ).show()
                    setResult(RESULT_OK)
                    finish()
                } else {
                    binding.btnSaveTop.isEnabled = true
                    binding.btnPostSaveBottom.isEnabled = true
                    Toast.makeText(
                        this@PostCaptureEditActivity,
                        "Failed to save watermarked photo",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    private fun discardAndFinish() {
        sourceTempFile?.let { if (it.exists()) it.delete() }
        setResult(RESULT_CANCELED)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        previewBaseBitmap?.let { if (!it.isRecycled) it.recycle() }
    }
}
