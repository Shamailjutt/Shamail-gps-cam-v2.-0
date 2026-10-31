package com.shamail.gpscam

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.MotionEvent
import android.view.SoundEffectConstants
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.shamail.gpscam.data.AppPreferences
import com.shamail.gpscam.data.AuthManager
import com.shamail.gpscam.data.GpsSnapshot
import com.shamail.gpscam.data.WatermarkConfig
import com.shamail.gpscam.databinding.ActivityMainBinding
import com.shamail.gpscam.location.LocationHelper
import com.shamail.gpscam.storage.PhotoStorageManager
import com.shamail.gpscam.ui.DateTimeEditorSheet
import com.shamail.gpscam.watermark.WatermarkRenderer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.Locale
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: AppPreferences
    private lateinit var locationHelper: LocationHelper

    private var watermarkConfig = WatermarkConfig()
    private var gpsSnapshot = GpsSnapshot()
    private var cachedLogoBitmap: Bitmap? = null

    private var cameraProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private var activeCamera: Camera? = null
    private var lensFacing: Int = CameraSelector.LENS_FACING_BACK
    private var flashMode: Int = ImageCapture.FLASH_MODE_AUTO
    private var isCapturingPhoto = false

    private val clockHandler = Handler(Looper.getMainLooper())
    private val clockTicker = object : Runnable {
        override fun run() {
            refreshWatermarkAndHeader()
            clockHandler.postDelayed(this, 1000L)
        }
    }

    private val postCaptureEditLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        refreshGalleryBadge()
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val hasCam = grants[Manifest.permission.CAMERA] == true || hasCameraPermission()
        if (hasCam) {
            binding.permissionOverlay.visibility = View.GONE
            startCamera()
            if (hasLocationPermission()) {
                locationHelper.startUpdates()
            } else {
                binding.tvGpsStatus.text = "GPS permission off · Camera ready"
            }
            refreshGalleryBadge()
        } else {
            showPermissionOverlay(permanentlyDenied = !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA))
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = AppPreferences(this)
        val initialCfg = prefs.loadConfig()
        watermarkConfig = initialCfg
        lensFacing = if (initialCfg.defaultLensFacing == 0) {
            CameraSelector.LENS_FACING_FRONT
        } else {
            CameraSelector.LENS_FACING_BACK
        }
        flashMode = when (initialCfg.defaultFlashMode) {
            1 -> ImageCapture.FLASH_MODE_ON
            2 -> ImageCapture.FLASH_MODE_OFF
            else -> ImageCapture.FLASH_MODE_AUTO
        }

        locationHelper = LocationHelper(this, lifecycleScope) { updatedGps ->
            gpsSnapshot = updatedGps
            refreshWatermarkAndHeader()
        }

        setupInteractiveControls()
        reloadSettingsAndAssets()
        checkAndRequestRuntimePermissions()
    }

    override fun onResume() {
        super.onResume()
        reloadSettingsAndAssets()
        clockHandler.post(clockTicker)
        if (hasCameraPermission()) {
            binding.permissionOverlay.visibility = View.GONE
            startCamera()
        }
        if (hasLocationPermission() && watermarkConfig.autoLocationEnabled) {
            locationHelper.startUpdates()
        } else {
            locationHelper.stopUpdates()
        }
        refreshGalleryBadge()
    }

    override fun onPause() {
        super.onPause()
        clockHandler.removeCallbacks(clockTicker)
        locationHelper.stopUpdates()
    }

    private fun setupInteractiveControls() {
        binding.btnFlash.setOnClickListener {
            cycleFlashMode()
        }

        binding.btnGalleryGps.setOnClickListener {
            val galleryGpsIntent = Intent(this, GalleryGpsEditorActivity::class.java).apply {
                putExtra("gps_has_fix", gpsSnapshot.hasFix)
                putExtra("gps_lat", gpsSnapshot.latitude)
                putExtra("gps_lon", gpsSnapshot.longitude)
                putExtra("gps_city", gpsSnapshot.city)
                putExtra("gps_district", gpsSnapshot.district)
                putExtra("gps_province", gpsSnapshot.province)
                putExtra("gps_country", gpsSnapshot.country)
                putExtra("gps_street", gpsSnapshot.streetAddress)
            }
            postCaptureEditLauncher.launch(galleryGpsIntent)
        }

        binding.btnTimestampMode.setOnClickListener {
            openDateTimeEditor()
        }

        binding.watermarkPreview.setOnClickListener {
            openDateTimeEditor()
        }

        binding.btnSettings.setOnClickListener {
            if (AuthManager.isRememberedSessionActive(this)) {
                startActivity(Intent(this, SettingsActivity::class.java))
            } else {
                startActivity(Intent(this, SettingsLoginActivity::class.java))
            }
        }

        binding.btnGallery.setOnClickListener {
            startActivity(Intent(this, GalleryActivity::class.java))
        }

        binding.btnSwitchCamera.setOnClickListener {
            switchFrontRearCamera()
        }

        binding.btnCapture.setOnClickListener {
            it.playSoundEffect(SoundEffectConstants.CLICK)
            captureAndOpenPostCaptureEditor()
        }

        binding.viewFinder.setOnTouchListener { view, event ->
            if (event.action == MotionEvent.ACTION_UP) {
                view.performClick()
                val factory = binding.viewFinder.meteringPointFactory
                val point = factory.createPoint(event.x, event.y)
                val action = FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
                    .setAutoCancelDuration(3, TimeUnit.SECONDS)
                    .build()
                activeCamera?.cameraControl?.startFocusAndMetering(action)
            }
            true
        }

        binding.btnGrantPermissions.setOnClickListener {
            if (!hasCameraPermission() && !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", packageName, null)
                }
                startActivity(intent)
            } else {
                requestRequiredPermissions()
            }
        }
    }

    private fun reloadSettingsAndAssets() {
        watermarkConfig = prefs.loadConfig()
        cachedLogoBitmap = WatermarkRenderer.loadLogoBitmap(this, watermarkConfig)
        if (cachedLogoBitmap != null) {
            binding.ivHeaderLogo.setImageBitmap(cachedLogoBitmap)
        }
        updateTimestampButtonBadge()
        refreshWatermarkAndHeader()
    }

    private fun updateTimestampButtonBadge() {
        binding.btnTimestampMode.text = "Date & Time"
    }

    private fun refreshWatermarkAndHeader() {
        binding.watermarkPreview.updateState(
            newConfig = watermarkConfig,
            newGps = gpsSnapshot,
            newLogo = cachedLogoBitmap,
            currentMillis = System.currentTimeMillis()
        )

        binding.tvGpsStatus.text = when {
            !watermarkConfig.autoLocationEnabled -> "Auto GPS Paused · Custom Location Ready"
            !hasLocationPermission() -> "Location permission off · Offline camera ready"
            gpsSnapshot.hasFix -> {
                val acc = String.format(Locale.US, "±%.1f m", gpsSnapshot.accuracyMeters)
                val modeTag = if (gpsSnapshot.isOfflineAddress) "Offline GPS" else "GPS Locked"
                "$modeTag ($acc) · ${gpsSnapshot.buildLocationHeadline()}"
            }
            else -> "Searching GPS satellites... (Camera ready)"
        }
    }

    private fun openDateTimeEditor() {
        val sheet = DateTimeEditorSheet(gpsSnapshot) { updated ->
            watermarkConfig = updated
            updateTimestampButtonBadge()
            refreshWatermarkAndHeader()
        }
        sheet.show(supportFragmentManager, "DateTimeEditorSheet")
    }

    private fun checkAndRequestRuntimePermissions() {
        if (hasCameraPermission() && hasLocationPermission()) {
            binding.permissionOverlay.visibility = View.GONE
            startCamera()
            locationHelper.startUpdates()
            refreshGalleryBadge()
        } else {
            requestRequiredPermissions()
        }
    }

    private fun requestRequiredPermissions() {
        val required = mutableListOf(
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            required.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            required.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            required.add(Manifest.permission.READ_MEDIA_IMAGES)
        }
        permissionLauncher.launch(required.toTypedArray())
    }

    private fun showPermissionOverlay(permanentlyDenied: Boolean) {
        binding.permissionOverlay.visibility = View.VISIBLE
        binding.btnGrantPermissions.text = if (permanentlyDenied) {
            "Open App Settings"
        } else {
            "Grant Camera & GPS Permissions"
        }
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            try {
                val provider = cameraProviderFuture.get()
                cameraProvider = provider
                bindCameraUseCases(provider)
            } catch (e: Exception) {
                Toast.makeText(
                    this,
                    "Camera initialization error: ${e.localizedMessage ?: "Unavailable"}",
                    Toast.LENGTH_LONG
                ).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun bindCameraUseCases(provider: ProcessCameraProvider) {
        val preview = Preview.Builder()
            .build()
            .also {
                it.setSurfaceProvider(binding.viewFinder.surfaceProvider)
            }

        val captureBuilder = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            .setFlashMode(flashMode)
            .setJpegQuality(watermarkConfig.jpegQuality.coerceIn(70, 100))

        imageCapture = captureBuilder.build()

        val requestedSelector = CameraSelector.Builder()
            .requireLensFacing(lensFacing)
            .build()

        val selectorToUse = if (runCatching { provider.hasCamera(requestedSelector) }.getOrDefault(false)) {
            requestedSelector
        } else {
            CameraSelector.DEFAULT_BACK_CAMERA
        }

        try {
            provider.unbindAll()
            activeCamera = provider.bindToLifecycle(
                this,
                selectorToUse,
                preview,
                imageCapture
            )
            syncFlashUiWithHardware()
        } catch (e: Exception) {
            Toast.makeText(
                this,
                "Unable to bind camera sensor: ${e.localizedMessage ?: "Error"}",
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    private fun switchFrontRearCamera() {
        val provider = cameraProvider ?: return
        val nextFacing = if (lensFacing == CameraSelector.LENS_FACING_BACK) {
            CameraSelector.LENS_FACING_FRONT
        } else {
            CameraSelector.LENS_FACING_BACK
        }
        val testSelector = CameraSelector.Builder().requireLensFacing(nextFacing).build()
        if (runCatching { provider.hasCamera(testSelector) }.getOrDefault(false)) {
            lensFacing = nextFacing
            bindCameraUseCases(provider)
        } else {
            Toast.makeText(this, "Requested camera lens not available on this device", Toast.LENGTH_SHORT).show()
        }
    }

    private fun cycleFlashMode() {
        val hasFlash = activeCamera?.cameraInfo?.hasFlashUnit() == true
        if (!hasFlash) {
            flashMode = ImageCapture.FLASH_MODE_OFF
            syncFlashUiWithHardware()
            Toast.makeText(this, "Flash not supported on active camera lens", Toast.LENGTH_SHORT).show()
            return
        }

        flashMode = when (flashMode) {
            ImageCapture.FLASH_MODE_AUTO -> ImageCapture.FLASH_MODE_ON
            ImageCapture.FLASH_MODE_ON -> ImageCapture.FLASH_MODE_OFF
            else -> ImageCapture.FLASH_MODE_AUTO
        }
        imageCapture?.flashMode = flashMode
        syncFlashUiWithHardware()
    }

    private fun syncFlashUiWithHardware() {
        val hasFlash = activeCamera?.cameraInfo?.hasFlashUnit() == true
        if (!hasFlash) {
            binding.btnFlash.text = "OFF"
            binding.btnFlash.setIconResource(R.drawable.ic_flash_off)
            binding.btnFlash.alpha = 0.6f
            return
        }
        binding.btnFlash.alpha = 1.0f
        when (flashMode) {
            ImageCapture.FLASH_MODE_ON -> {
                binding.btnFlash.text = "ON"
                binding.btnFlash.setIconResource(R.drawable.ic_flash_on)
            }
            ImageCapture.FLASH_MODE_OFF -> {
                binding.btnFlash.text = "OFF"
                binding.btnFlash.setIconResource(R.drawable.ic_flash_off)
            }
            else -> {
                binding.btnFlash.text = "AUTO"
                binding.btnFlash.setIconResource(R.drawable.ic_flash_auto)
            }
        }
    }

    private fun captureAndOpenPostCaptureEditor() {
        val capture = imageCapture ?: run {
            Toast.makeText(this, "Camera is not ready yet", Toast.LENGTH_SHORT).show()
            return
        }
        if (isCapturingPhoto) return
        isCapturingPhoto = true
        binding.btnCapture.isEnabled = false

        binding.shutterFlashOverlay.alpha = 0.85f
        binding.shutterFlashOverlay.animate()
            .alpha(0f)
            .setDuration(180L)
            .start()

        val captureMomentMillis = System.currentTimeMillis()
        val capturedConfig = watermarkConfig.copy()
        val capturedGps = gpsSnapshot.copy()
        val isFront = lensFacing == CameraSelector.LENS_FACING_FRONT

        val rawTempFile = File(cacheDir, "raw_capture_$captureMomentMillis.jpg")
        val outputOptions = ImageCapture.OutputFileOptions.Builder(rawTempFile).build()

        capture.takePicture(
            outputOptions,
            ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                    lifecycleScope.launch(Dispatchers.IO) {
                        var orientedReadyFile: File? = null
                        var directSavedUri: Uri? = null
                        try {
                            val oriented = PhotoStorageManager.decodeAndOrientTempCapture(
                                tempFile = rawTempFile,
                                isFrontCamera = isFront,
                                preset = capturedConfig.resolutionPreset
                            )
                            if (oriented != null) {
                                if (capturedConfig.openEditorAfterCapture) {
                                    val postFile = File(cacheDir, "post_edit_$captureMomentMillis.jpg")
                                    FileOutputStream(postFile).use { out ->
                                        oriented.compress(
                                            Bitmap.CompressFormat.JPEG,
                                            capturedConfig.jpegQuality.coerceIn(85, 100),
                                            out
                                        )
                                    }
                                    orientedReadyFile = postFile
                                } else {
                                    directSavedUri = PhotoStorageManager.processAndSaveWatermarkedPhoto(
                                        context = this@MainActivity,
                                        sourceBitmap = oriented,
                                        config = capturedConfig,
                                        gps = capturedGps,
                                        captureDeviceMillis = captureMomentMillis
                                    )
                                }
                                oriented.recycle()
                            }
                        } finally {
                            if (rawTempFile.exists()) rawTempFile.delete()
                        }

                        withContext(Dispatchers.Main) {
                            isCapturingPhoto = false
                            binding.btnCapture.isEnabled = true

                            if (capturedConfig.openEditorAfterCapture && orientedReadyFile != null && orientedReadyFile.exists()) {
                                val editIntent = Intent(this@MainActivity, PostCaptureEditActivity::class.java).apply {
                                    putExtra("temp_photo_path", orientedReadyFile.absolutePath)
                                    putExtra("capture_millis", captureMomentMillis)
                                    putExtra("gps_has_fix", capturedGps.hasFix)
                                    putExtra("gps_lat", capturedGps.latitude)
                                    putExtra("gps_lon", capturedGps.longitude)
                                    putExtra("gps_acc", capturedGps.accuracyMeters)
                                    putExtra("gps_time", capturedGps.gpsTimestampMillis)
                                    putExtra("gps_city", capturedGps.city)
                                    putExtra("gps_district", capturedGps.district)
                                    putExtra("gps_province", capturedGps.province)
                                    putExtra("gps_country", capturedGps.country)
                                    putExtra("gps_street", capturedGps.streetAddress)
                                    putExtra("gps_offline", capturedGps.isOfflineAddress)
                                }
                                postCaptureEditLauncher.launch(editIntent)
                            } else if (!capturedConfig.openEditorAfterCapture && directSavedUri != null) {
                                Toast.makeText(
                                    this@MainActivity,
                                    "Saved GPS photo to ${PhotoStorageManager.RELATIVE_PICTURES_PATH}",
                                    Toast.LENGTH_SHORT
                                ).show()
                                refreshGalleryBadge()
                            } else {
                                Toast.makeText(
                                    this@MainActivity,
                                    "Failed to process captured image",
                                    Toast.LENGTH_LONG
                                ).show()
                            }
                        }
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    if (rawTempFile.exists()) rawTempFile.delete()
                    isCapturingPhoto = false
                    binding.btnCapture.isEnabled = true
                    Toast.makeText(
                        this@MainActivity,
                        "Capture error: ${exception.localizedMessage ?: "Camera failure"}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        )
    }

    private fun refreshGalleryBadge() {
        lifecycleScope.launch(Dispatchers.IO) {
            val savedList = PhotoStorageManager.listSavedPhotos(this@MainActivity)
            val latest = savedList.firstOrNull()
            withContext(Dispatchers.Main) {
                binding.tvPhotoCount.text = savedList.size.toString()
                if (latest != null) {
                    binding.ivGalleryThumb.setImageURI(latest.uri)
                } else {
                    binding.ivGalleryThumb.setImageDrawable(null)
                }
            }
        }
    }
}
