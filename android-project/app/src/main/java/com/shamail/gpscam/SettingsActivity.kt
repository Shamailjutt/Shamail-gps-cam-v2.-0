package com.shamail.gpscam

import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.shamail.gpscam.data.AppPreferences
import com.shamail.gpscam.data.AuthManager
import com.shamail.gpscam.data.CoordFormat
import com.shamail.gpscam.data.GpsSnapshot
import com.shamail.gpscam.data.ResolutionPreset
import com.shamail.gpscam.data.TimestampMode
import com.shamail.gpscam.data.WatermarkConfig
import com.shamail.gpscam.data.WatermarkPosition
import com.shamail.gpscam.data.WatermarkSize
import com.shamail.gpscam.data.WatermarkStyle
import com.shamail.gpscam.data.WatermarkTextColor
import com.shamail.gpscam.databinding.ActivitySettingsBinding
import com.shamail.gpscam.ui.DateTimeEditorSheet
import com.shamail.gpscam.watermark.WatermarkRenderer

class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private lateinit var prefs: AppPreferences
    private var config = WatermarkConfig()
    private var logoBitmap: Bitmap? = null

    private val dateFormats = listOf(
        "dd MMM yyyy",
        "yyyy-MM-dd",
        "dd/MM/yyyy",
        "EEE, dd MMM yyyy"
    )

    private val resolutionLabels = listOf(
        "Maximum Sensor Resolution (Recommended)",
        "Full HD (1920 × 1080)",
        "HD Compact (1280 × 720)"
    )

    private val samplePreviewGps = GpsSnapshot(
        hasFix = true,
        latitude = 31.520370,
        longitude = 74.358749,
        accuracyMeters = 3.8f,
        altitudeMeters = 217.0,
        gpsTimestampMillis = System.currentTimeMillis(),
        city = "Lahore",
        district = "Lahore District",
        province = "Punjab",
        country = "Pakistan",
        streetAddress = "Main Boulevard Gulberg, Lahore, Punjab, Pakistan"
    )

    private val pickLogoLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            val savedPath = prefs.importCustomLogo(uri)
            if (savedPath != null) {
                config = config.copy(customLogoPath = savedPath, showLogo = true)
                binding.cbFieldLogo.isChecked = true
                prefs.saveConfig(config)
                reloadLogoAndPreview()
                Toast.makeText(this, "Organization logo updated", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Could not decode selected logo image", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!AuthManager.canEnterSettings(this)) {
            startActivity(Intent(this, SettingsLoginActivity::class.java))
            finish()
            return
        }

        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = AppPreferences(this)
        config = prefs.loadConfig()

        setupSpinners()
        populateFormFromConfig()
        bindFormListeners()
        reloadLogoAndPreview()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isFinishing) {
            AuthManager.clearTransientEntry()
        }
    }

    private fun setupSpinners() {
        val dateAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, dateFormats)
        binding.spinnerDateFormat.adapter = dateAdapter

        val resAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, resolutionLabels)
        binding.spinnerResolution.adapter = resAdapter
    }

    private fun populateFormFromConfig() {
        binding.switchRememberUser.isChecked = AuthManager.isRememberedSessionActive(this)

        binding.switchShowWatermark.isChecked = config.showWatermark
        binding.switchAutoLocation.isChecked = config.autoLocationEnabled
        binding.switchMapThumbnail.isChecked = config.showMapThumbnail
        binding.switchPostCaptureReview.isChecked = config.openEditorAfterCapture

        when (config.defaultFlashMode) {
            1 -> binding.rbFlashOn.isChecked = true
            2 -> binding.rbFlashOff.isChecked = true
            else -> binding.rbFlashAuto.isChecked = true
        }

        if (config.defaultLensFacing == 0) {
            binding.rbLensFront.isChecked = true
        } else {
            binding.rbLensBack.isChecked = true
        }

        binding.etOrgName.setText(config.organizationName)

        val dateIdx = dateFormats.indexOf(config.dateFormatPattern).coerceAtLeast(0)
        binding.spinnerDateFormat.setSelection(dateIdx)
        binding.switchSettings24Hour.isChecked = config.is24HourFormat
        refreshTimestampStatusLabel()

        when (config.watermarkStyle) {
            WatermarkStyle.CLASSIC_CARD -> binding.rbStyleClassic.isChecked = true
            WatermarkStyle.COMPACT_STRIP -> binding.rbStyleCompact.isChecked = true
            WatermarkStyle.MODERN_BANNER -> binding.rbStyleBanner.isChecked = true
        }

        when (config.textColor) {
            WatermarkTextColor.WHITE -> binding.rbColorWhite.isChecked = true
            WatermarkTextColor.IVORY -> binding.rbColorIvory.isChecked = true
            WatermarkTextColor.GOLD -> binding.rbColorGold.isChecked = true
        }

        when (config.watermarkSize) {
            WatermarkSize.SMALL -> binding.rbSizeSmall.isChecked = true
            WatermarkSize.MEDIUM -> binding.rbSizeMedium.isChecked = true
            WatermarkSize.LARGE -> binding.rbSizeLarge.isChecked = true
        }

        when (config.watermarkPosition) {
            WatermarkPosition.BOTTOM_LEFT -> binding.rbPosLeft.isChecked = true
            WatermarkPosition.BOTTOM_CENTER -> binding.rbPosCenter.isChecked = true
            WatermarkPosition.BOTTOM_RIGHT -> binding.rbPosRight.isChecked = true
        }

        val snappedOpacity = ((config.watermarkOpacity / 5) * 5).coerceIn(30, 95)
        binding.sliderOpacity.value = snappedOpacity.toFloat()
        binding.tvOpacityVal.text = "${config.watermarkOpacity}%"

        val snappedFont = (((config.fontScale * 100f).toInt() / 5) * 5).coerceIn(80, 135)
        binding.sliderFontSize.value = snappedFont.toFloat()
        binding.tvFontSizeVal.text = "$snappedFont%"

        binding.cbFieldOrg.isChecked = config.showOrgHeading
        binding.cbFieldLocation.isChecked = config.showLocationTitle
        binding.cbFieldAddress.isChecked = config.showFullAddress
        binding.cbFieldCoords.isChecked = config.showCoordinates
        binding.cbFieldDateTime.isChecked = config.showDateTime
        binding.cbFieldAccuracy.isChecked = config.showAccuracy
        binding.cbFieldLogo.isChecked = config.showLogo

        when (config.coordFormat) {
            CoordFormat.DECIMAL -> binding.rbCoordDecimal.isChecked = true
            CoordFormat.DMS -> binding.rbCoordDms.isChecked = true
        }

        val resIdx = when (config.resolutionPreset) {
            ResolutionPreset.MAX -> 0
            ResolutionPreset.FHD -> 1
            ResolutionPreset.HD -> 2
        }
        binding.spinnerResolution.setSelection(resIdx)

        val snappedQuality = ((config.jpegQuality / 5) * 5).coerceIn(70, 100)
        binding.sliderQuality.value = snappedQuality.toFloat()
        binding.tvQualityVal.text = if (snappedQuality >= 95) "$snappedQuality% (Original High Quality)" else "$snappedQuality%"
    }

    private fun bindFormListeners() {
        binding.btnBackSettings.setOnClickListener {
            prefs.saveConfig(config)
            finish()
        }

        binding.btnSaveSettings.setOnClickListener {
            prefs.saveConfig(config)
            Toast.makeText(this, "Settings saved", Toast.LENGTH_SHORT).show()
            finish()
        }

        binding.switchRememberUser.setOnCheckedChangeListener { _, isChecked ->
            AuthManager.setRememberUserPreference(this, isChecked)
        }

        binding.btnLogoutSettings.setOnClickListener {
            prefs.saveConfig(config)
            AuthManager.logout(this)
            Toast.makeText(this, "Signed out of Protected Settings", Toast.LENGTH_SHORT).show()
            finish()
        }

        binding.switchShowWatermark.setOnCheckedChangeListener { _, isChecked ->
            config = config.copy(showWatermark = isChecked)
            refreshPreview()
        }

        binding.switchAutoLocation.setOnCheckedChangeListener { _, isChecked ->
            config = config.copy(autoLocationEnabled = isChecked)
        }

        binding.switchMapThumbnail.setOnCheckedChangeListener { _, isChecked ->
            config = config.copy(showMapThumbnail = isChecked)
            refreshPreview()
        }

        binding.switchPostCaptureReview.setOnCheckedChangeListener { _, isChecked ->
            config = config.copy(openEditorAfterCapture = isChecked)
        }

        binding.rgDefaultFlash.setOnCheckedChangeListener { _, checkedId ->
            val mode = when (checkedId) {
                R.id.rbFlashOn -> 1
                R.id.rbFlashOff -> 2
                else -> 0
            }
            config = config.copy(defaultFlashMode = mode)
        }

        binding.rgDefaultLens.setOnCheckedChangeListener { _, checkedId ->
            val lens = if (checkedId == R.id.rbLensFront) 0 else 1
            config = config.copy(defaultLensFacing = lens)
        }

        binding.etOrgName.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                config = config.copy(organizationName = s?.toString()?.ifBlank { "SHAMAIL PERA" } ?: "SHAMAIL PERA")
                refreshPreview()
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        binding.btnUploadLogo.setOnClickListener {
            pickLogoLauncher.launch("image/*")
        }

        binding.btnResetLogo.setOnClickListener {
            prefs.clearCustomLogo()
            config = config.copy(customLogoPath = null, showLogo = true)
            binding.cbFieldLogo.isChecked = true
            reloadLogoAndPreview()
            Toast.makeText(this, "Restored default SHAMAIL PERA crest", Toast.LENGTH_SHORT).show()
        }

        binding.btnOpenDateTimeEditor.setOnClickListener {
            prefs.saveConfig(config)
            val sheet = DateTimeEditorSheet(samplePreviewGps) { updated ->
                config = updated
                binding.switchSettings24Hour.isChecked = config.is24HourFormat
                refreshTimestampStatusLabel()
                refreshPreview()
            }
            sheet.show(supportFragmentManager, "SettingsDateTimeEditor")
        }

        binding.spinnerDateFormat.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                config = config.copy(dateFormatPattern = dateFormats[position])
                refreshPreview()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        binding.switchSettings24Hour.setOnCheckedChangeListener { _, isChecked ->
            config = config.copy(is24HourFormat = isChecked)
            refreshPreview()
        }

        binding.rgWatermarkStyle.setOnCheckedChangeListener { _, checkedId ->
            val style = when (checkedId) {
                R.id.rbStyleCompact -> WatermarkStyle.COMPACT_STRIP
                R.id.rbStyleBanner -> WatermarkStyle.MODERN_BANNER
                else -> WatermarkStyle.CLASSIC_CARD
            }
            config = config.copy(watermarkStyle = style)
            refreshPreview()
        }

        binding.rgWatermarkTextColor.setOnCheckedChangeListener { _, checkedId ->
            val col = when (checkedId) {
                R.id.rbColorIvory -> WatermarkTextColor.IVORY
                R.id.rbColorGold -> WatermarkTextColor.GOLD
                else -> WatermarkTextColor.WHITE
            }
            config = config.copy(textColor = col)
            refreshPreview()
        }

        binding.rgWatermarkSize.setOnCheckedChangeListener { _, checkedId ->
            val sz = when (checkedId) {
                R.id.rbSizeSmall -> WatermarkSize.SMALL
                R.id.rbSizeLarge -> WatermarkSize.LARGE
                else -> WatermarkSize.MEDIUM
            }
            config = config.copy(watermarkSize = sz)
            refreshPreview()
        }

        binding.rgWatermarkPos.setOnCheckedChangeListener { _, checkedId ->
            val pos = when (checkedId) {
                R.id.rbPosLeft -> WatermarkPosition.BOTTOM_LEFT
                R.id.rbPosRight -> WatermarkPosition.BOTTOM_RIGHT
                else -> WatermarkPosition.BOTTOM_CENTER
            }
            config = config.copy(watermarkPosition = pos)
            refreshPreview()
        }

        binding.sliderOpacity.addOnChangeListener { _, value, _ ->
            val op = value.toInt()
            binding.tvOpacityVal.text = "$op%"
            config = config.copy(watermarkOpacity = op)
            refreshPreview()
        }

        binding.sliderFontSize.addOnChangeListener { _, value, _ ->
            val pct = value.toInt()
            binding.tvFontSizeVal.text = "$pct%"
            config = config.copy(fontScale = pct / 100f)
            refreshPreview()
        }

        binding.cbFieldOrg.setOnCheckedChangeListener { _, c ->
            config = config.copy(showOrgHeading = c)
            refreshPreview()
        }
        binding.cbFieldLocation.setOnCheckedChangeListener { _, c ->
            config = config.copy(showLocationTitle = c)
            refreshPreview()
        }
        binding.cbFieldAddress.setOnCheckedChangeListener { _, c ->
            config = config.copy(showFullAddress = c)
            refreshPreview()
        }
        binding.cbFieldCoords.setOnCheckedChangeListener { _, c ->
            config = config.copy(showCoordinates = c)
            refreshPreview()
        }
        binding.cbFieldDateTime.setOnCheckedChangeListener { _, c ->
            config = config.copy(showDateTime = c)
            refreshPreview()
        }
        binding.cbFieldAccuracy.setOnCheckedChangeListener { _, c ->
            config = config.copy(showAccuracy = c)
            refreshPreview()
        }
        binding.cbFieldLogo.setOnCheckedChangeListener { _, c ->
            config = config.copy(showLogo = c)
            reloadLogoAndPreview()
        }

        binding.rgCoordFormat.setOnCheckedChangeListener { _, checkedId ->
            val fmt = if (checkedId == R.id.rbCoordDms) CoordFormat.DMS else CoordFormat.DECIMAL
            config = config.copy(coordFormat = fmt)
            refreshPreview()
        }

        binding.spinnerResolution.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val res = when (position) {
                    1 -> ResolutionPreset.FHD
                    2 -> ResolutionPreset.HD
                    else -> ResolutionPreset.MAX
                }
                config = config.copy(resolutionPreset = res)
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        binding.sliderQuality.addOnChangeListener { _, value, _ ->
            val q = value.toInt()
            binding.tvQualityVal.text = if (q >= 95) "$q% (Original High Quality)" else "$q%"
            config = config.copy(jpegQuality = q)
        }

        binding.btnOpenGalleryFromSettings.setOnClickListener {
            prefs.saveConfig(config)
            startActivity(Intent(this, GalleryActivity::class.java))
        }

        binding.btnOpenGalleryGpsFromSettings.setOnClickListener {
            prefs.saveConfig(config)
            startActivity(Intent(this, GalleryGpsEditorActivity::class.java))
        }
    }

    private fun refreshTimestampStatusLabel() {
        binding.tvCurrentTimestampStatus.text = when (config.timestampMode) {
            TimestampMode.MANUAL -> "Source: Custom Selected Date & Time (Clean watermark)"
            TimestampMode.GPS_FIX -> "Source: GPS Satellite Fix Timestamp"
            TimestampMode.AUTO_DEVICE -> "Source: Automatic Device Clock"
        }
    }

    private fun reloadLogoAndPreview() {
        logoBitmap = WatermarkRenderer.loadLogoBitmap(this, config)
        if (logoBitmap != null) {
            binding.ivLogoPreview.setImageBitmap(logoBitmap)
        } else {
            binding.ivLogoPreview.setImageResource(R.drawable.default_org_logo)
        }
        refreshPreview()
    }

    private fun refreshPreview() {
        binding.settingsWatermarkPreview.updateState(
            newConfig = config,
            newGps = samplePreviewGps,
            newLogo = logoBitmap,
            currentMillis = System.currentTimeMillis()
        )
    }
}
