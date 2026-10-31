package com.shamail.gpscam

import android.content.Intent
import android.location.Address
import android.location.Geocoder
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.MapsApiSettings
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.SupportMapFragment
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.shamail.gpscam.data.SavedLocationDatabase
import com.shamail.gpscam.data.SavedLocationEntity
import com.shamail.gpscam.databinding.ActivityLocationMapPickerBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

class LocationMapPickerActivity : AppCompatActivity(), OnMapReadyCallback {

    private lateinit var binding: ActivityLocationMapPickerBinding
    private var googleMap: GoogleMap? = null
    private var activeMarker: Marker? = null

    private var selectedLat: Double = 31.520370
    private var selectedLon: Double = 74.358749
    private var savedAsBookmark: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        MapsApiSettings.addInternalUsageAttributionId(
            applicationContext,
            "gmp_mcp_codeassist_v1_aistudio"
        )

        binding = ActivityLocationMapPickerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        selectedLat = intent.getDoubleExtra("initial_lat", 31.520370).takeIf { it != 0.0 } ?: 31.520370
        selectedLon = intent.getDoubleExtra("initial_lon", 74.358749).takeIf { it != 0.0 } ?: 74.358749
        val initTitle = intent.getStringExtra("initial_title").orEmpty()
        val initAddress = intent.getStringExtra("initial_address").orEmpty()

        binding.etSelectedLat.setText(String.format(Locale.US, "%.6f", selectedLat))
        binding.etSelectedLon.setText(String.format(Locale.US, "%.6f", selectedLon))
        binding.etSelectedLocationTitle.setText(initTitle)
        binding.etSelectedFullAddress.setText(initAddress)

        val hasMapsApiKey = BuildConfig.MAPS_API_KEY.isNotBlank()
        if (hasMapsApiKey) {
            binding.cardMapWrapper.visibility = View.VISIBLE
            binding.cardMapsKeyNotice.visibility = View.GONE
            val existingFragment = supportFragmentManager.findFragmentById(R.id.mapContainerFrame) as? SupportMapFragment
            val mapFragment = existingFragment ?: SupportMapFragment.newInstance().also { frag ->
                supportFragmentManager.beginTransaction()
                    .replace(R.id.mapContainerFrame, frag)
                    .commitNow()
            }
            mapFragment.getMapAsync(this)
        } else {
            binding.cardMapWrapper.visibility = View.GONE
            binding.cardMapsKeyNotice.visibility = View.VISIBLE
            binding.tvMapTapHint.text = "Search any place above or enter GPS coordinates below:"
        }

        if (initTitle.isBlank() && initAddress.isBlank()) {
            reverseGeocodePoint(selectedLat, selectedLon)
        }

        bindControls()
    }

    override fun onMapReady(map: GoogleMap) {
        googleMap = map
        map.uiSettings.apply {
            isZoomControlsEnabled = true
            isCompassEnabled = true
            isMapToolbarEnabled = false
        }

        val startPoint = LatLng(selectedLat, selectedLon)
        placeOrMovePin(startPoint, animateCamera = false, zoom = 15f)

        map.setOnMapClickListener { clickedLatLng ->
            selectedLat = clickedLatLng.latitude
            selectedLon = clickedLatLng.longitude
            binding.etSelectedLat.setText(String.format(Locale.US, "%.6f", selectedLat))
            binding.etSelectedLon.setText(String.format(Locale.US, "%.6f", selectedLon))
            placeOrMovePin(clickedLatLng, animateCamera = true, zoom = map.cameraPosition.zoom.coerceAtLeast(14f))
            reverseGeocodePoint(selectedLat, selectedLon)
        }
    }

    private fun placeOrMovePin(point: LatLng, animateCamera: Boolean, zoom: Float) {
        val map = googleMap ?: return
        if (activeMarker == null) {
            activeMarker = map.addMarker(
                MarkerOptions()
                    .position(point)
                    .title("Selected GPS Pin")
                    .icon(BitmapDescriptorFactory.defaultMarker(42f))
            )
        } else {
            activeMarker?.position = point
        }

        val cameraUpdate = CameraUpdateFactory.newLatLngZoom(point, zoom)
        if (animateCamera) {
            map.animateCamera(cameraUpdate)
        } else {
            map.moveCamera(cameraUpdate)
        }
    }

    private fun bindControls() {
        binding.btnBackMapPicker.setOnClickListener {
            setResult(RESULT_CANCELED)
            finish()
        }

        binding.btnMapSearch.setOnClickListener {
            performPlaceSearch()
        }

        binding.etMapSearch.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                performPlaceSearch()
                true
            } else {
                false
            }
        }

        binding.btnLookupTypedCoords.setOnClickListener {
            val lat = binding.etSelectedLat.text?.toString()?.trim()?.toDoubleOrNull()
            val lon = binding.etSelectedLon.text?.toString()?.trim()?.toDoubleOrNull()
            if (lat == null || lon == null || lat !in -90.0..90.0 || lon !in -180.0..180.0) {
                Toast.makeText(this, "Enter valid Latitude (-90..90) and Longitude (-180..180)", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            selectedLat = lat
            selectedLon = lon
            placeOrMovePin(LatLng(lat, lon), animateCamera = true, zoom = 15f)
            reverseGeocodePoint(lat, lon)
        }

        binding.btnSaveBookmarkFromMap.setOnClickListener {
            promptSaveLocationToDb()
        }

        binding.btnConfirmMapLocation.setOnClickListener {
            val lat = binding.etSelectedLat.text?.toString()?.trim()?.toDoubleOrNull() ?: selectedLat
            val lon = binding.etSelectedLon.text?.toString()?.trim()?.toDoubleOrNull() ?: selectedLon
            val title = binding.etSelectedLocationTitle.text?.toString()?.trim().orEmpty()
                .ifBlank { String.format(Locale.US, "GPS %.5f°, %.5f°", lat, lon) }
            val address = binding.etSelectedFullAddress.text?.toString()?.trim().orEmpty()
                .ifBlank { String.format(Locale.US, "%.6f°, %.6f°", lat, lon) }

            val result = Intent().apply {
                putExtra("picked_title", title)
                putExtra("picked_address", address)
                putExtra("picked_lat", lat.coerceIn(-90.0, 90.0))
                putExtra("picked_lon", lon.coerceIn(-180.0, 180.0))
                putExtra("picked_was_saved_bookmark", savedAsBookmark)
            }
            setResult(RESULT_OK, result)
            finish()
        }
    }

    private fun performPlaceSearch() {
        val query = binding.etMapSearch.text?.toString()?.trim().orEmpty()
        if (query.isEmpty()) {
            Toast.makeText(this, "Enter a city, street, or place name to search", Toast.LENGTH_SHORT).show()
            return
        }
        if (!Geocoder.isPresent()) {
            Toast.makeText(this, "Geocoder service unavailable on this device", Toast.LENGTH_SHORT).show()
            return
        }

        lifecycleScope.launch(Dispatchers.IO) {
            val found: Address? = try {
                val geocoder = Geocoder(this@LocationMapPickerActivity, Locale.getDefault())
                @Suppress("DEPRECATION")
                geocoder.getFromLocationName(query, 1)?.firstOrNull()
            } catch (_: Exception) {
                null
            }

            withContext(Dispatchers.Main) {
                if (found != null) {
                    selectedLat = found.latitude
                    selectedLon = found.longitude
                    binding.etSelectedLat.setText(String.format(Locale.US, "%.6f", selectedLat))
                    binding.etSelectedLon.setText(String.format(Locale.US, "%.6f", selectedLon))
                    applyDecodedAddress(found)
                    placeOrMovePin(LatLng(selectedLat, selectedLon), animateCamera = true, zoom = 15.5f)
                } else {
                    Toast.makeText(
                        this@LocationMapPickerActivity,
                        "No matching place found. Try adding city or country name.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    private fun reverseGeocodePoint(lat: Double, lon: Double) {
        if (!Geocoder.isPresent()) return
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val geocoder = Geocoder(this@LocationMapPickerActivity, Locale.getDefault())
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    geocoder.getFromLocation(lat, lon, 1, object : Geocoder.GeocodeListener {
                        override fun onGeocode(addresses: MutableList<Address>) {
                            val first = addresses.firstOrNull() ?: return
                            runOnUiThread { applyDecodedAddress(first) }
                        }
                        override fun onError(errorMessage: String?) {}
                    })
                } else {
                    @Suppress("DEPRECATION")
                    val first = geocoder.getFromLocation(lat, lon, 1)?.firstOrNull()
                    if (first != null) {
                        withContext(Dispatchers.Main) { applyDecodedAddress(first) }
                    }
                }
            } catch (_: Exception) {
            }
        }
    }

    private fun applyDecodedAddress(address: Address) {
        val parts = linkedSetOf<String>()
        listOfNotNull(address.locality, address.subAdminArea, address.adminArea, address.countryName)
            .filter { it.isNotBlank() }
            .forEach { parts.add(it.trim()) }
        val headline = if (parts.isNotEmpty()) {
            parts.joinToString(", ")
        } else {
            address.featureName ?: String.format(Locale.US, "GPS %.5f°, %.5f°", selectedLat, selectedLon)
        }
        val fullLine = address.getAddressLine(0)
            ?: listOfNotNull(address.featureName, address.thoroughfare, address.subLocality, headline)
                .distinct()
                .joinToString(", ")

        binding.etSelectedLocationTitle.setText(headline)
        binding.etSelectedFullAddress.setText(fullLine)
    }

    private fun promptSaveLocationToDb() {
        val lat = binding.etSelectedLat.text?.toString()?.trim()?.toDoubleOrNull() ?: selectedLat
        val lon = binding.etSelectedLon.text?.toString()?.trim()?.toDoubleOrNull() ?: selectedLon
        val title = binding.etSelectedLocationTitle.text?.toString()?.trim().orEmpty()
            .ifBlank { String.format(Locale.US, "GPS %.5f°, %.5f°", lat, lon) }
        val address = binding.etSelectedFullAddress.text?.toString()?.trim().orEmpty()
            .ifBlank { title }

        val input = EditText(this).apply {
            setText(title)
            hint = "Saved Location Name (e.g. Site Office)"
            setPadding(42, 32, 42, 32)
        }

        MaterialAlertDialogBuilder(this)
            .setTitle("Save GPS Location")
            .setMessage("Enter a bookmark name to save this location for reuse:")
            .setView(input)
            .setPositiveButton("Save") { _, _ ->
                val label = input.text?.toString()?.trim().orEmpty().ifBlank { title }
                lifecycleScope.launch(Dispatchers.IO) {
                    val dao = SavedLocationDatabase.getInstance(this@LocationMapPickerActivity).savedLocationDao()
                    dao.insert(
                        SavedLocationEntity(
                            label = label,
                            locationTitle = title,
                            fullAddress = address,
                            latitude = lat.coerceIn(-90.0, 90.0),
                            longitude = lon.coerceIn(-180.0, 180.0)
                        )
                    )
                    withContext(Dispatchers.Main) {
                        savedAsBookmark = true
                        Toast.makeText(
                            this@LocationMapPickerActivity,
                            "Saved \"$label\" to Saved Locations",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
