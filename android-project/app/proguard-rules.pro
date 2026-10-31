# Keep CameraX and Location classes safe if shrinking is enabled
-keep class androidx.camera.** { *; }
-keep class com.google.android.gms.location.** { *; }
-dontwarn androidx.camera.core.impl.**
