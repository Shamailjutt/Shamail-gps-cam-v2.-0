# Gps cam by shamail — Native Android Application (Kotlin + CameraX)

Complete native Android GPS Map Camera application built in **Kotlin** using **Jetpack CameraX**, **Google Play Services FusedLocationProviderClient** (with offline hardware `LocationManager.GPS_PROVIDER` fallback), **Android Geocoder**, and **AndroidX ExifInterface**.

## Key Features
- **Native CameraX Engine**: Full-screen live `PreviewView`, Front & Rear camera switching, Flash `AUTO / ON / OFF` hardware control, tap-to-focus metering, and full-sensor high-resolution JPEG capture.
- **Automatic GPS & Reverse Geocoding**: Retrieves latitude, longitude, GPS accuracy in meters (`±m`), street/area address, city, district, province, and country. Works offline for camera capture and raw GPS satellite coordinates.
- **Dedicated Date & Time Stamp Editor**:
  - Automatic current device clock (`AUTO_DEVICE`)
  - Actual GPS satellite capture timestamp (`GPS_FIX`)
  - Manual Date Picker, Manual Time Picker, and direct editable `YYYY-MM-DD` / `HH:MM:SS` fields (`MANUAL`)
  - 12-hour and 24-hour formats + Reset to Current Device Time
  - **Provenance Labeling**: Manually edited timestamps are explicitly labeled as `[Edited]` in settings, preview, and EXIF metadata (`TAG_USER_COMMENT` / `TAG_IMAGE_DESCRIPTION`) so they are never confused with verified capture times.
- **Custom SHAMAIL PERA Watermark**:
  - Compact translucent dark-navy/black watermark permanently rendered onto captured photographs.
  - Configurable Organization Heading (default: `SHAMAIL PERA`), optional custom uploaded logo (or default gold compass crest), Small / Medium / Large size, background opacity slider (`30%–95%`), font scale (`80%–135%`), Bottom-Left / Bottom-Center / Bottom-Right alignment, and individual field toggles.
- **Direct MediaStore Gallery (`Pictures/GpsCamByShamail`)**:
  - Saves watermarked photos directly into `Pictures/GpsCamByShamail` at selectable JPEG quality (`70%–100%`, default `95%`).
  - Built-in Gallery & Full-Screen Viewer supporting native Android Share sheet and photo deletion.

## Building in Android Studio
1. Open **Android Studio (Koala / Ladybug or newer)** and select **Open** -> choose this `android-project` folder.
2. Ensure **JDK 17** is selected in *Settings -> Build, Execution, Deployment -> Build Tools -> Gradle*.
3. Allow Gradle sync to finish (`compileSdk = 34`, `minSdk = 24`, `targetSdk = 34`).
4. Run on any physical Android device (`Shift + F10`) or build an APK via:
   ```bash
   ./gradlew assembleDebug
   ./gradlew assembleRelease
   ```

## Signing a Release APK with Custom Credentials
To sign `assembleRelease` with your own production keystore, create `keystore.properties` in the root of `android-project/`:
```properties
storeFile=your-release-key.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=YOUR_KEY_ALIAS
keyPassword=YOUR_KEY_PASSWORD
```
Then run `./gradlew assembleRelease`. Output APK: `app/build/outputs/apk/release/app-release.apk`.

## Installing on an Android Smartphone
1. Transfer `GpsCamByShamail-v1.0.0.apk` to your Android phone (or download directly via browser).
2. Tap the `.apk` file in your **Files** or **Downloads** app.
3. If prompted, enable **Allow from this source** ("Install unknown apps") for your browser or file manager.
4. Tap **Install**, then **Open**.
5. Grant **Camera** ("While using the app") and **Precise Location** permissions when prompted.
