package com.shamail.gpscam.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.shamail.gpscam.data.GpsSnapshot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.abs

class LocationHelper(
    private val context: Context,
    private val scope: CoroutineScope,
    private val onUpdate: (GpsSnapshot) -> Unit
) {
    private val fusedClient = LocationServices.getFusedLocationProviderClient(context)
    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    private var currentSnapshot = GpsSnapshot()
    private var lastGeocodedLat = Double.NaN
    private var lastGeocodedLon = Double.NaN
    private var geocodeJob: Job? = null
    private var isTracking = false

    private val fusedCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val loc = result.lastLocation ?: return
            handleNewLocation(loc)
        }
    }

    private val gpsHardwareListener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            handleNewLocation(location)
        }
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
    }

    @SuppressLint("MissingPermission")
    fun startUpdates() {
        if (isTracking) return
        isTracking = true

        // 1. Seed immediately from last known location if available
        try {
            fusedClient.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) handleNewLocation(loc)
            }
            val lastGps = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            if (lastGps != null) handleNewLocation(lastGps)
        } catch (_: Exception) {
        }

        // 2. High-accuracy Fused Location Provider stream
        try {
            val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 2000L)
                .setMinUpdateIntervalMillis(1000L)
                .setWaitForAccurateLocation(false)
                .build()
            fusedClient.requestLocationUpdates(request, fusedCallback, Looper.getMainLooper())
        } catch (_: Exception) {
        }

        // 3. Direct hardware GPS fallback so offline field capture always works
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    2000L,
                    1f,
                    gpsHardwareListener,
                    Looper.getMainLooper()
                )
            }
        } catch (_: Exception) {
        }
    }

    fun stopUpdates() {
        if (!isTracking) return
        isTracking = false
        try {
            fusedClient.removeLocationUpdates(fusedCallback)
        } catch (_: Exception) {
        }
        try {
            locationManager.removeUpdates(gpsHardwareListener)
        } catch (_: Exception) {
        }
        geocodeJob?.cancel()
    }

    private fun handleNewLocation(location: Location) {
        // Prefer more recent or markedly more accurate fixes
        currentSnapshot = currentSnapshot.copy(
            hasFix = true,
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyMeters = location.accuracy,
            altitudeMeters = location.altitude,
            gpsTimestampMillis = location.time
        )
        onUpdate(currentSnapshot)

        val movedEnough = lastGeocodedLat.isNaN() ||
            abs(location.latitude - lastGeocodedLat) > 0.00025 ||
            abs(location.longitude - lastGeocodedLon) > 0.00025

        if (movedEnough || (currentSnapshot.streetAddress.isBlank() && !currentSnapshot.isOfflineAddress)) {
            reverseGeocode(location.latitude, location.longitude)
        }
    }

    private fun reverseGeocode(lat: Double, lon: Double) {
        if (!Geocoder.isPresent()) {
            currentSnapshot = currentSnapshot.copy(isOfflineAddress = true)
            onUpdate(currentSnapshot)
            return
        }

        geocodeJob?.cancel()
        geocodeJob = scope.launch(Dispatchers.IO) {
            try {
                val geocoder = Geocoder(context, Locale.getDefault())
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    geocoder.getFromLocation(lat, lon, 1, object : Geocoder.GeocodeListener {
                        override fun onGeocode(addresses: MutableList<Address>) {
                            applyAddressResult(lat, lon, addresses.firstOrNull())
                        }

                        override fun onError(errorMessage: String?) {
                            markGeocodeOffline()
                        }
                    })
                } else {
                    @Suppress("DEPRECATION")
                    val results = geocoder.getFromLocation(lat, lon, 1)
                    applyAddressResult(lat, lon, results?.firstOrNull())
                }
            } catch (_: Exception) {
                markGeocodeOffline()
            }
        }
    }

    private fun applyAddressResult(lat: Double, lon: Double, address: Address?) {
        if (address == null) {
            markGeocodeOffline()
            return
        }
        lastGeocodedLat = lat
        lastGeocodedLon = lon

        val city = address.locality ?: address.subLocality ?: ""
        val district = address.subAdminArea ?: ""
        val province = address.adminArea ?: ""
        val country = address.countryName ?: ""
        val fullLine = address.getAddressLine(0) ?: buildFallbackAddress(address)

        scope.launch(Dispatchers.Main) {
            currentSnapshot = currentSnapshot.copy(
                city = city,
                district = district,
                province = province,
                country = country,
                streetAddress = fullLine,
                isOfflineAddress = false
            )
            onUpdate(currentSnapshot)
        }
    }

    private fun markGeocodeOffline() {
        scope.launch(Dispatchers.Main) {
            if (currentSnapshot.streetAddress.isBlank()) {
                currentSnapshot = currentSnapshot.copy(isOfflineAddress = true)
                onUpdate(currentSnapshot)
            }
        }
    }

    private fun buildFallbackAddress(a: Address): String {
        return listOfNotNull(a.featureName, a.thoroughfare, a.subLocality, a.locality, a.adminArea, a.countryName)
            .distinct()
            .joinToString(", ")
    }
}
