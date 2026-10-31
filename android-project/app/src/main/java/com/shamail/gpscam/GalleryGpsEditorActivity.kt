package com.shamail.gpscam

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.Toast
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.shamail.gpscam.data.AppPreferences
import com.shamail.gpscam.data.GpsSnapshot
import com.shamail.gpscam.data.LocationSource
import com.shamail.gpscam.data.ResolutionPreset
import com.shamail.gpscam.data.SavedLocationDatabase
import com.shamail.gpscam.data.SavedLocationEntity
import com.shamail.gpscam.data.TimestampMode
import com.shamail.gpscam.data.WatermarkConfig
import com.shamail.gpscam.data.WatermarkPosition
import com.shamail.gpscam.data.WatermarkSize
import com.shamail.gpscam.data.WatermarkStyle
import com.shamail.gpscam.data.WatermarkTextColor
import com.shamail.gpscam.databinding.ActivityGalleryGpsEditorBinding
import com.shamail.gpscam.storage.PhotoStorageManager
import com.shamail.gpscam.ui.SequentialDateTimePicker
import com.shamail.gpscam.watermark.WatermarkRenderer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

class GalleryGpsEditorActivity : AppCompatActivity() {

    private lateinit var binding: ActivityGalleryGpsEditorBinding
    private lateinit var prefs: AppPreferences

    private var workingConfig = WatermarkConfig()
    private var workingGps = GpsSnapshot(
        hasFix = true,
        latitude = 31.520370,
        longitude = 74.358749,
        accuracyMeters = 0f,
        gpsTimestampMillis = System.currentTimeMillis(),
        city = "Lahore, Punjab, Pakistan",
        streetAddress = "Main Boulevard Gulberg III, Lahore, Punjab, Pakistan",
        isOfflineAddress = false,
        locationSource = LocationSource.MANUAL_MAP
    )

    private var selectedSourceUri: Uri? = null
    private var previewBaseBitmap: Bitmap? = null
    private var currentRenderedPreview: Bitmap? = null
    private var logoBitmap: Bitmap? = null
    private var previewRenderJob: Job? = null
    private var isSaving = false

    private val pickVisualMediaLauncher = registerForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            loadSelectedGalleryUri(uri)
        }
    }

    private val legacyGetContentLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            loadSelectedGalleryUri(uri)
        }
    }

    private val logoPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            lifecycleScope.launch(Dispatchers.IO) {
                val importedPath = prefs.importCustomLogo(uri)
                withContext(Dispatchers.Main) {
                    if (importedPath != null) {
                        workingConfig = workingConfig.copy(customLogoPath = importedPath, showLogo = true)
                        logoBitmap = WatermarkRenderer.loadLogoBitmap(this@GalleryGpsEditorActivity, workingConfig)
                        logoBitmap?.let { binding.ivGalleryOrgLogo.setImageBitmap(it) }
                        renderLiveWatermarkedPreview()
                    } else {
                        Toast.makeText(this@GalleryGpsEditorActivity, "Unable to decode logo image", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

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

            workingGps = GpsSnapshot(
                hasFix = true,
                latitude = lat,
                longitude = lon,
                accuracyMeters = 0f,
                gpsTimestampMillis = System.currentTimeMillis(),
                city = title,
                streetAddress = address,
                isOfflineAddress = false,
                locationSource = if (wasBookmark) LocationSource.SAVED_LOCATION else LocationSource.MANUAL_MAP
            )
            populateLocationInputsFromGps()
            renderLiveWatermarkedPreview()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityGalleryGpsEditorBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = AppPreferences(this)
        val savedCfg = prefs.loadConfig()
        val now = System.currentTimeMillis()
        workingConfig = savedCfg.copy(
            showWatermark = true,
            showAccuracy = false,
            manualTimestampMillis = if (savedCfg.timestampMode == TimestampMode.MANUAL) {
                savedCfg.manualTimestampMillis
            } else {
                now
            }
        )

        if (intent.getBooleanExtra("gps_has_fix", false)) {
            workingGps = GpsSnapshot(
                hasFix = true,
                latitude = intent.getDoubleExtra("gps_lat", 31.520370),
                longitude = intent.getDoubleExtra("gps_lon", 74.358749),
                accuracyMeters = 0f,
                gpsTimestampMillis = now,
                city = intent.getStringExtra("gps_city").orEmpty().ifBlank { "Lahore, Punjab, Pakistan" },
                district = intent.getStringExtra("gps_district").orEmpty(),
                province = intent.getStringExtra("gps_province").orEmpty(),
                country = intent.getStringExtra("gps_country").orEmpty(),
                streetAddress = intent.getStringExtra("gps_street").orEmpty(),
                isOfflineAddress = false,
                locationSource = LocationSource.LIVE_GPS
            )
        }

        logoBitmap = WatermarkRenderer.loadLogoBitmap(this, workingConfig)
        logoBitmap?.let { binding.ivGalleryOrgLogo.setImageBitmap(it) }

        populateInitialControls()
        bindUiListeners()

        // Launch photo picker right away so user can select their existing gallery photo
        openPhotoPicker()
    }

    private fun openPhotoPicker() {
        runCatching {
            pickVisualMediaLauncher.launch(
                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
            )
        }.onFailure {
            legacyGetContentLauncher.launch("image/*")
        }
    }

    private fun loadSelectedGalleryUri(uri: Uri) {
        selectedSourceUri = uri
        lifecycleScope.launch(Dispatchers.IO) {
            // Decode a responsive preview bitmap (<= 1440px) without ever modifying the source URI
            val decoded = PhotoStorageManager.decodeGalleryUriBitmap(
                context = this@GalleryGpsEditorActivity,
                sourceUri = uri,
                preset = ResolutionPreset.FHD
            )
            withContext(Dispatchers.Main) {
                if (decoded != null) {
                    val prev = previewBaseBitmap
                    previewBaseBitmap = decoded
                    if (prev != null && prev != decoded && !prev.isRecycled) {
                        prev.recycle()
                    }
                    binding.emptyGalleryPrompt.visibility = View.GONE
                    renderLiveWatermarkedPreview()
                } else {
                    Toast.makeText(
                        this@GalleryGpsEditorActivity,
                        "Could not read selected gallery image",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    private fun populateInitialControls() {
        populateLocationInputsFromGps()
        updateTimestampReadout()

        binding.switchGallery24Hour.isChecked = workingConfig.is24HourFormat
        binding.etGalleryOrgName.setText(workingConfig.organizationName)

        when (workingConfig.watermarkStyle) {
            WatermarkStyle.CLASSIC_CARD -> binding.rbGalleryStyleClassic.isChecked = true
            WatermarkStyle.COMPACT_STRIP -> binding.rbGalleryStyleCompact.isChecked = true
            WatermarkStyle.MODERN_BANNER -> binding.rbGalleryStyleBanner.isChecked = true
        }

        when (workingConfig.watermarkPosition) {
            WatermarkPosition.BOTTOM_LEFT -> binding.rbGalleryPosLeft.isChecked = true
            WatermarkPosition.BOTTOM_CENTER -> binding.rbGalleryPosCenter.isChecked = true
            WatermarkPosition.BOTTOM_RIGHT -> binding.rbGalleryPosRight.isChecked = true
        }

        when (workingConfig.watermarkSize) {
            WatermarkSize.SMALL -> binding.rbGallerySizeSmall.isChecked = true
            WatermarkSize.MEDIUM -> binding.rbGallerySizeMedium.isChecked = true
            WatermarkSize.LARGE -> binding.rbGallerySizeLarge.isChecked = true
        }

        when (workingConfig.textColor) {
            WatermarkTextColor.WHITE -> binding.rbGalleryColorWhite.isChecked = true
            WatermarkTextColor.IVORY -> binding.rbGalleryColorIvory.isChecked = true
            WatermarkTextColor.GOLD -> binding.rbGalleryColorGold.isChecked = true
        }

        val clampedOpacity = ((workingConfig.watermarkOpacity / 5) * 5).coerceIn(30, 95)
        binding.sliderGalleryOpacity.value = clampedOpacity.toFloat()
        binding.tvGalleryOpacityLabel.text = "Watermark Opacity: $clampedOpacity%"

        val clampedFont = (((workingConfig.fontScale * 100f).toInt() / 5) * 5).coerceIn(80, 135)
        binding.sliderGalleryFontScale.value = clampedFont.toFloat()
        binding.tvGalleryFontLabel.text = "Font Scale: $clampedFont%"

        binding.switchGalleryShowWatermark.isChecked = workingConfig.showWatermark
        binding.switchGalleryShowMapThumb.isChecked = workingConfig.showMapThumbnail
        binding.switchGalleryShowCoords.isChecked = workingConfig.showCoordinates
        binding.switchGalleryShowDateTime.isChecked = workingConfig.showDateTime
        binding.switchGalleryShowAccuracy.isChecked = workingConfig.showAccuracy
    }

    private fun populateLocationInputsFromGps() {
        binding.etGalleryLocationTitle.setText(workingGps.buildLocationHeadline())
        binding.etGalleryFullAddress.setText(workingGps.streetAddress)
        binding.etGalleryLat.setText(String.format(Locale.US, "%.6f", workingGps.latitude))
        binding.etGalleryLon.setText(String.format(Locale.US, "%.6f", workingGps.longitude))
        binding.tvGalleryLocationSourceBadge.text = when (workingGps.locationSource) {
            LocationSource.SAVED_LOCATION -> "Editor Source: Saved Location"
            LocationSource.MANUAL_MAP -> "Editor Source: Selected Map Location"
            LocationSource.LIVE_GPS -> "Editor Source: Live Device GPS"
        }
    }

    private fun updateTimestampReadout() {
        val formatted = workingConfig.formatTimestamp(workingGps, System.currentTimeMillis())
        binding.tvGalleryTimestampReadout.text = "Watermark Timestamp: $formatted"
    }

    private fun bindUiListeners() {
        binding.btnBackGalleryGps.setOnClickListener { finish() }
        binding.btnPickGalleryPhoto.setOnClickListener { openPhotoPicker() }
        binding.btnPickPhotoPrompt.setOnClickListener { openPhotoPicker() }
        binding.btnChangeGalleryPhotoBottom.setOnClickListener { openPhotoPicker() }

        binding.btnSaveGalleryGpsTop.setOnClickListener { exportWatermarkedGalleryPhoto() }
        binding.btnSaveGalleryGpsBottom.setOnClickListener { exportWatermarkedGalleryPhoto() }

        binding.btnOpenSavedLocations.setOnClickListener {
            showSavedLocationsDialog()
        }

        binding.btnOpenMapPicker.setOnClickListener {
            applyTypedLocationInputs()
            val intent = Intent(this, LocationMapPickerActivity::class.java).apply {
                putExtra("initial_lat", workingGps.latitude)
                putExtra("initial_lon", workingGps.longitude)
                putExtra("initial_title", workingGps.buildLocationHeadline())
                putExtra("initial_address", workingGps.streetAddress)
            }
            mapPickerLauncher.launch(intent)
        }

        binding.btnApplyGalleryLocation.setOnClickListener {
            applyTypedLocationInputs()
            renderLiveWatermarkedPreview()
            Toast.makeText(this, "Location updated on watermark preview", Toast.LENGTH_SHORT).show()
        }

        binding.btnSaveCurrentBookmark.setOnClickListener {
            applyTypedLocationInputs()
            promptSaveCurrentLocationToDb()
        }

        binding.btnGallerySequentialDateTime.setOnClickListener {
            val baseMs = workingConfig.resolveTimestampMillis(workingGps, System.currentTimeMillis())
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
                updateTimestampReadout()
                renderLiveWatermarkedPreview()
            }
        }

        binding.btnGalleryPickTimeOnly.setOnClickListener {
            val baseMs = workingConfig.resolveTimestampMillis(workingGps, System.currentTimeMillis())
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
                updateTimestampReadout()
                renderLiveWatermarkedPreview()
            }
        }

        binding.btnGalleryResetNow.setOnClickListener {
            val now = System.currentTimeMillis()
            workingConfig = workingConfig.copy(
                timestampMode = TimestampMode.AUTO_DEVICE,
                manualTimestampMillis = now
            )
            updateTimestampReadout()
            renderLiveWatermarkedPreview()
        }

        binding.switchGallery24Hour.setOnCheckedChangeListener { _, isChecked ->
            workingConfig = workingConfig.copy(is24HourFormat = isChecked)
            updateTimestampReadout()
            renderLiveWatermarkedPreview()
        }

        binding.etGalleryOrgName.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val org = s?.toString()?.trim().orEmpty().ifBlank { "SHAMAIL PERA" }
                workingConfig = workingConfig.copy(organizationName = org)
                renderLiveWatermarkedPreview()
            }
        })

        binding.btnGalleryUploadLogo.setOnClickListener {
            logoPickerLauncher.launch("image/*")
        }

        binding.btnGalleryResetLogo.setOnClickListener {
            prefs.clearCustomLogo()
            workingConfig = workingConfig.copy(customLogoPath = null, showLogo = true)
            logoBitmap = WatermarkRenderer.loadLogoBitmap(this, workingConfig)
            logoBitmap?.let { binding.ivGalleryOrgLogo.setImageBitmap(it) }
            renderLiveWatermarkedPreview()
        }

        binding.rgGalleryStyle.setOnCheckedChangeListener { _, checkedId ->
            val style = when (checkedId) {
                R.id.rbGalleryStyleCompact -> WatermarkStyle.COMPACT_STRIP
                R.id.rbGalleryStyleBanner -> WatermarkStyle.MODERN_BANNER
                else -> WatermarkStyle.CLASSIC_CARD
            }
            workingConfig = workingConfig.copy(watermarkStyle = style)
            renderLiveWatermarkedPreview()
        }

        binding.rgGalleryPos.setOnCheckedChangeListener { _, checkedId ->
            val pos = when (checkedId) {
                R.id.rbGalleryPosLeft -> WatermarkPosition.BOTTOM_LEFT
                R.id.rbGalleryPosRight -> WatermarkPosition.BOTTOM_RIGHT
                else -> WatermarkPosition.BOTTOM_CENTER
            }
            workingConfig = workingConfig.copy(watermarkPosition = pos)
            renderLiveWatermarkedPreview()
        }

        binding.rgGallerySize.setOnCheckedChangeListener { _, checkedId ->
            val sz = when (checkedId) {
                R.id.rbGallerySizeSmall -> WatermarkSize.SMALL
                R.id.rbGallerySizeLarge -> WatermarkSize.LARGE
                else -> WatermarkSize.MEDIUM
            }
            workingConfig = workingConfig.copy(watermarkSize = sz)
            renderLiveWatermarkedPreview()
        }

        binding.rgGalleryColor.setOnCheckedChangeListener { _, checkedId ->
            val col = when (checkedId) {
                R.id.rbGalleryColorIvory -> WatermarkTextColor.IVORY
                R.id.rbGalleryColorGold -> WatermarkTextColor.GOLD
                else -> WatermarkTextColor.WHITE
            }
            workingConfig = workingConfig.copy(textColor = col)
            renderLiveWatermarkedPreview()
        }

        binding.sliderGalleryOpacity.addOnChangeListener { _, value, _ ->
            val pct = value.toInt().coerceIn(30, 95)
            binding.tvGalleryOpacityLabel.text = "Watermark Opacity: $pct%"
            workingConfig = workingConfig.copy(watermarkOpacity = pct)
            renderLiveWatermarkedPreview()
        }

        binding.sliderGalleryFontScale.addOnChangeListener { _, value, _ ->
            val pct = value.toInt().coerceIn(80, 135)
            binding.tvGalleryFontLabel.text = "Font Scale: $pct%"
            workingConfig = workingConfig.copy(fontScale = pct / 100f)
            renderLiveWatermarkedPreview()
        }

        binding.switchGalleryShowWatermark.setOnCheckedChangeListener { _, checked ->
            workingConfig = workingConfig.copy(showWatermark = checked)
            renderLiveWatermarkedPreview()
        }
        binding.switchGalleryShowMapThumb.setOnCheckedChangeListener { _, checked ->
            workingConfig = workingConfig.copy(showMapThumbnail = checked)
            renderLiveWatermarkedPreview()
        }
        binding.switchGalleryShowCoords.setOnCheckedChangeListener { _, checked ->
            workingConfig = workingConfig.copy(showCoordinates = checked)
            renderLiveWatermarkedPreview()
        }
        binding.switchGalleryShowDateTime.setOnCheckedChangeListener { _, checked ->
            workingConfig = workingConfig.copy(showDateTime = checked)
            renderLiveWatermarkedPreview()
        }
        binding.switchGalleryShowAccuracy.setOnCheckedChangeListener { _, checked ->
            workingConfig = workingConfig.copy(showAccuracy = checked)
            renderLiveWatermarkedPreview()
        }
    }

    private fun applyTypedLocationInputs() {
        val headline = binding.etGalleryLocationTitle.text?.toString()?.trim().orEmpty()
        val address = binding.etGalleryFullAddress.text?.toString()?.trim().orEmpty()
        val lat = binding.etGalleryLat.text?.toString()?.trim()?.toDoubleOrNull()
        val lon = binding.etGalleryLon.text?.toString()?.trim()?.toDoubleOrNull()

        workingGps = workingGps.copy(
            hasFix = true,
            latitude = (lat ?: workingGps.latitude).coerceIn(-90.0, 90.0),
            longitude = (lon ?: workingGps.longitude).coerceIn(-180.0, 180.0),
            city = headline.ifBlank { workingGps.city },
            district = "",
            province = "",
            country = "",
            streetAddress = address,
            isOfflineAddress = false
        )
    }

    private fun showSavedLocationsDialog() {
        lifecycleScope.launch(Dispatchers.IO) {
            val dao = SavedLocationDatabase.getInstance(this@GalleryGpsEditorActivity).savedLocationDao()
            val allItems = dao.getAll().toMutableList()
            withContext(Dispatchers.Main) {
                if (allItems.isEmpty()) {
                    MaterialAlertDialogBuilder(this@GalleryGpsEditorActivity)
                        .setTitle("No Saved Locations Yet")
                        .setMessage("Save any location using \"Save Bookmark\" or from the Google Map Picker to reuse it anytime with one tap.")
                        .setPositiveButton("Open Map Picker") { _, _ ->
                            binding.btnOpenMapPicker.performClick()
                        }
                        .setNegativeButton("Close", null)
                        .show()
                    return@withContext
                }

                val container = LinearLayout(this@GalleryGpsEditorActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(36, 20, 36, 8)
                }

                val searchBox = EditText(this@GalleryGpsEditorActivity).apply {
                    hint = "Search saved locations..."
                    setSingleLine(true)
                }

                val listView = ListView(this@GalleryGpsEditorActivity)
                val visibleItems = allItems.toMutableList()
                val adapter = ArrayAdapter(
                    this@GalleryGpsEditorActivity,
                    android.R.layout.simple_list_item_1,
                    visibleItems.map { formatSavedItemRow(it) }.toMutableList()
                )
                listView.adapter = adapter

                container.addView(searchBox)
                container.addView(listView)

                val dialog = MaterialAlertDialogBuilder(this@GalleryGpsEditorActivity)
                    .setTitle("Saved GPS Locations (Tap to Apply, Hold to Edit)")
                    .setView(container)
                    .setNegativeButton("Close", null)
                    .create()

                searchBox.addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                    override fun afterTextChanged(s: Editable?) {
                        val q = s?.toString()?.trim().orEmpty().lowercase(Locale.US)
                        visibleItems.clear()
                        if (q.isEmpty()) {
                            visibleItems.addAll(allItems)
                        } else {
                            visibleItems.addAll(
                                allItems.filter {
                                    it.label.lowercase(Locale.US).contains(q) ||
                                        it.locationTitle.lowercase(Locale.US).contains(q) ||
                                        it.fullAddress.lowercase(Locale.US).contains(q)
                                }
                            )
                        }
                        adapter.clear()
                        adapter.addAll(visibleItems.map { formatSavedItemRow(it) })
                        adapter.notifyDataSetChanged()
                    }
                })

                listView.setOnItemClickListener { _, _, position, _ ->
                    val chosen = visibleItems.getOrNull(position) ?: return@setOnItemClickListener
                    workingGps = chosen.toGpsSnapshot()
                    populateLocationInputsFromGps()
                    renderLiveWatermarkedPreview()
                    Toast.makeText(
                        this@GalleryGpsEditorActivity,
                        "Applied saved location: ${chosen.label}",
                        Toast.LENGTH_SHORT
                    ).show()
                    dialog.dismiss()
                }

                listView.setOnItemLongClickListener { _, _, position, _ ->
                    val target = visibleItems.getOrNull(position) ?: return@setOnItemLongClickListener true
                    dialog.dismiss()
                    showSavedLocationManageMenu(target)
                    true
                }

                dialog.show()
            }
        }
    }

    private fun formatSavedItemRow(entity: SavedLocationEntity): String {
        return "${entity.label}\n${entity.locationTitle} (${String.format(Locale.US, "%.5f, %.5f", entity.latitude, entity.longitude)})"
    }

    private fun showSavedLocationManageMenu(entity: SavedLocationEntity) {
        val options = arrayOf("Apply Location", "Rename Bookmark", "Delete Bookmark")
        MaterialAlertDialogBuilder(this)
            .setTitle(entity.label)
            .setItems(options) { _, which ->
                when (which) {
                    0 -> {
                        workingGps = entity.toGpsSnapshot()
                        populateLocationInputsFromGps()
                        renderLiveWatermarkedPreview()
                    }
                    1 -> {
                        val input = EditText(this).apply {
                            setText(entity.label)
                            setPadding(42, 32, 42, 32)
                        }
                        MaterialAlertDialogBuilder(this)
                            .setTitle("Rename Saved Location")
                            .setView(input)
                            .setPositiveButton("Rename") { _, _ ->
                                val nextLabel = input.text?.toString()?.trim().orEmpty().ifBlank { entity.label }
                                lifecycleScope.launch(Dispatchers.IO) {
                                    SavedLocationDatabase.getInstance(this@GalleryGpsEditorActivity)
                                        .savedLocationDao()
                                        .rename(entity.id, nextLabel)
                                    withContext(Dispatchers.Main) {
                                        Toast.makeText(this@GalleryGpsEditorActivity, "Bookmark renamed", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            }
                            .setNegativeButton("Cancel", null)
                            .show()
                    }
                    2 -> {
                        lifecycleScope.launch(Dispatchers.IO) {
                            SavedLocationDatabase.getInstance(this@GalleryGpsEditorActivity)
                                .savedLocationDao()
                                .deleteById(entity.id)
                            withContext(Dispatchers.Main) {
                                Toast.makeText(this@GalleryGpsEditorActivity, "Bookmark deleted", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                }
            }
            .show()
    }

    private fun promptSaveCurrentLocationToDb() {
        val title = workingGps.buildLocationHeadline()
        val address = workingGps.streetAddress.ifBlank { title }
        val input = EditText(this).apply {
            setText(title)
            hint = "Bookmark Name (e.g. Head Office)"
            setPadding(42, 32, 42, 32)
        }

        MaterialAlertDialogBuilder(this)
            .setTitle("Save Location Bookmark")
            .setMessage("Save this GPS location so you can apply it to any gallery photo in one tap:")
            .setView(input)
            .setPositiveButton("Save") { _, _ ->
                val label = input.text?.toString()?.trim().orEmpty().ifBlank { title }
                lifecycleScope.launch(Dispatchers.IO) {
                    SavedLocationDatabase.getInstance(this@GalleryGpsEditorActivity)
                        .savedLocationDao()
                        .insert(
                            SavedLocationEntity(
                                label = label,
                                locationTitle = title,
                                fullAddress = address,
                                latitude = workingGps.latitude,
                                longitude = workingGps.longitude
                            )
                        )
                    withContext(Dispatchers.Main) {
                        workingGps = workingGps.copy(locationSource = LocationSource.SAVED_LOCATION)
                        populateLocationInputsFromGps()
                        Toast.makeText(
                            this@GalleryGpsEditorActivity,
                            "Saved \"$label\" to Saved Locations",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun renderLiveWatermarkedPreview() {
        val base = previewBaseBitmap ?: return
        val cfgSnap = workingConfig.copy()
        val gpsSnap = workingGps.copy()
        val logoSnap = logoBitmap
        val nowMs = System.currentTimeMillis()

        previewRenderJob?.cancel()
        previewRenderJob = lifecycleScope.launch(Dispatchers.Default) {
            val rendered = WatermarkRenderer.renderOntoBitmap(
                source = base,
                config = cfgSnap,
                gps = gpsSnap,
                logoBitmap = logoSnap,
                captureMillis = nowMs
            )
            withContext(Dispatchers.Main) {
                val old = currentRenderedPreview
                currentRenderedPreview = rendered
                binding.ivGalleryWatermarkedPreview.setImageBitmap(rendered)
                if (old != null && old != base && !old.isRecycled) {
                    old.recycle()
                }
            }
        }
    }

    private fun exportWatermarkedGalleryPhoto() {
        if (isSaving) return
        val sourceUri = selectedSourceUri
        if (sourceUri == null) {
            Toast.makeText(this, "Please select a photo from your gallery first", Toast.LENGTH_SHORT).show()
            openPhotoPicker()
            return
        }

        applyTypedLocationInputs()
        isSaving = true
        binding.btnSaveGalleryGpsTop.isEnabled = false
        binding.btnSaveGalleryGpsBottom.isEnabled = false

        val exportCfg = workingConfig.copy()
        val exportGps = workingGps.copy()
        val exportMillis = System.currentTimeMillis()

        lifecycleScope.launch(Dispatchers.IO) {
            val fullResBitmap = PhotoStorageManager.decodeGalleryUriBitmap(
                context = this@GalleryGpsEditorActivity,
                sourceUri = sourceUri,
                preset = exportCfg.resolutionPreset
            )
            val savedUri = if (fullResBitmap != null) {
                val uri = PhotoStorageManager.processAndSaveWatermarkedPhoto(
                    context = this@GalleryGpsEditorActivity,
                    sourceBitmap = fullResBitmap,
                    config = exportCfg,
                    gps = exportGps,
                    captureDeviceMillis = exportMillis,
                    isGalleryImport = true
                )
                fullResBitmap.recycle()
                uri
            } else {
                null
            }

            withContext(Dispatchers.Main) {
                isSaving = false
                binding.btnSaveGalleryGpsTop.isEnabled = true
                binding.btnSaveGalleryGpsBottom.isEnabled = true

                if (savedUri != null) {
                    Toast.makeText(
                        this@GalleryGpsEditorActivity,
                        "Saved new GPS photo to ${PhotoStorageManager.RELATIVE_PICTURES_PATH}",
                        Toast.LENGTH_LONG
                    ).show()
                    setResult(RESULT_OK)
                    finish()
                } else {
                    Toast.makeText(
                        this@GalleryGpsEditorActivity,
                        "Failed to export watermarked gallery photo",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        previewRenderJob?.cancel()
        previewBaseBitmap?.let { if (!it.isRecycled) it.recycle() }
    }
}
