import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const SOURCE_FILES_TO_EXPOSE = [
  { label: 'MainActivity.kt', relPath: 'app/src/main/java/com/shamail/gpscam/MainActivity.kt', category: 'CameraX & Main Screen' },
  { label: 'GalleryGpsEditorActivity.kt', relPath: 'app/src/main/java/com/shamail/gpscam/GalleryGpsEditorActivity.kt', category: 'Gallery GPS Camera' },
  { label: 'LocationMapPickerActivity.kt', relPath: 'app/src/main/java/com/shamail/gpscam/LocationMapPickerActivity.kt', category: 'Google Maps Picker' },
  { label: 'SettingsLoginActivity.kt', relPath: 'app/src/main/java/com/shamail/gpscam/SettingsLoginActivity.kt', category: 'Security & Settings' },
  { label: 'SettingsActivity.kt', relPath: 'app/src/main/java/com/shamail/gpscam/SettingsActivity.kt', category: 'Security & Settings' },
  { label: 'AuthManager.kt', relPath: 'app/src/main/java/com/shamail/gpscam/data/AuthManager.kt', category: 'Security & Settings' },
  { label: 'SavedLocationDb.kt', relPath: 'app/src/main/java/com/shamail/gpscam/data/SavedLocationDb.kt', category: 'Saved Locations Room DB' },
  { label: 'SequentialDateTimePicker.kt', relPath: 'app/src/main/java/com/shamail/gpscam/ui/SequentialDateTimePicker.kt', category: 'Sequential Date & Time' },
  { label: 'DateTimeEditorSheet.kt', relPath: 'app/src/main/java/com/shamail/gpscam/ui/DateTimeEditorSheet.kt', category: 'Sequential Date & Time' },
  { label: 'PostCaptureEditActivity.kt', relPath: 'app/src/main/java/com/shamail/gpscam/PostCaptureEditActivity.kt', category: 'Post-Capture Editor' },
  { label: 'WatermarkRenderer.kt', relPath: 'app/src/main/java/com/shamail/gpscam/watermark/WatermarkRenderer.kt', category: 'Watermark Engine' },
  { label: 'WatermarkPreviewView.kt', relPath: 'app/src/main/java/com/shamail/gpscam/watermark/WatermarkPreviewView.kt', category: 'Watermark Engine' },
  { label: 'PhotoStorageManager.kt', relPath: 'app/src/main/java/com/shamail/gpscam/storage/PhotoStorageManager.kt', category: 'MediaStore & EXIF' },
  { label: 'Models.kt', relPath: 'app/src/main/java/com/shamail/gpscam/data/Models.kt', category: 'Data & Config' },
  { label: 'AppPreferences.kt', relPath: 'app/src/main/java/com/shamail/gpscam/data/AppPreferences.kt', category: 'Data & Config' },
  { label: 'LocationHelper.kt', relPath: 'app/src/main/java/com/shamail/gpscam/location/LocationHelper.kt', category: 'GPS & Geocoder' },
  { label: 'GalleryActivity.kt', relPath: 'app/src/main/java/com/shamail/gpscam/GalleryActivity.kt', category: 'Activities' },
  { label: 'PhotoDetailActivity.kt', relPath: 'app/src/main/java/com/shamail/gpscam/PhotoDetailActivity.kt', category: 'Activities' },
  { label: 'AndroidManifest.xml', relPath: 'app/src/main/AndroidManifest.xml', category: 'Gradle & Manifest' },
  { label: 'app/build.gradle.kts', relPath: 'app/build.gradle.kts', category: 'Gradle & Manifest' },
  { label: 'activity_main.xml', relPath: 'app/src/main/res/layout/activity_main.xml', category: 'XML Layouts' },
  { label: 'activity_gallery_gps_editor.xml', relPath: 'app/src/main/res/layout/activity_gallery_gps_editor.xml', category: 'XML Layouts' },
  { label: 'activity_location_map_picker.xml', relPath: 'app/src/main/res/layout/activity_location_map_picker.xml', category: 'XML Layouts' },
  { label: 'activity_settings_login.xml', relPath: 'app/src/main/res/layout/activity_settings_login.xml', category: 'XML Layouts' },
  { label: 'activity_settings.xml', relPath: 'app/src/main/res/layout/activity_settings.xml', category: 'XML Layouts' },
  { label: 'activity_post_capture_edit.xml', relPath: 'app/src/main/res/layout/activity_post_capture_edit.xml', category: 'XML Layouts' },
  { label: 'sheet_date_time_editor.xml', relPath: 'app/src/main/res/layout/sheet_date_time_editor.xml', category: 'XML Layouts' },
];

function computeSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Serve compiled APK and build outputs directly from /build-outputs with Android installer MIME headers
  app.get('/build-outputs/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename);
    const buildOutputsDir = path.join(__dirname, 'build-outputs');
    const targetPath = path.join(buildOutputsDir, safeName);

    if (!fs.existsSync(targetPath)) {
      res.status(404).json({ error: `Build output ${safeName} is not generated yet.` });
      return;
    }

    if (safeName.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    } else if (safeName.endsWith('.zip')) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    }

    res.sendFile(targetPath);
  });

  // Alias /downloads/:filename to /build-outputs for convenience
  app.get('/downloads/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename);
    const buildOutputsDir = path.join(__dirname, 'build-outputs');
    const directCandidate = path.join(buildOutputsDir, safeName);
    const fallbackDebugApk = path.join(buildOutputsDir, 'app-debug.apk');

    const chosen = fs.existsSync(directCandidate)
      ? directCandidate
      : safeName.endsWith('.apk') && fs.existsSync(fallbackDebugApk)
        ? fallbackDebugApk
        : null;

    if (!chosen) {
      res.status(404).json({ error: 'Requested APK artifact not found.' });
      return;
    }

    if (chosen.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(chosen)}"`);
    } else if (chosen.endsWith('.zip')) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(chosen)}"`);
    }

    res.sendFile(chosen);
  });

  // Dynamic APK manifest endpoint reading /build-outputs/app-debug.apk
  app.get('/api/apk-manifest', (_req, res) => {
    const debugApkPath = path.join(__dirname, 'build-outputs', 'app-debug.apk');
    const zipPath = path.join(__dirname, 'build-outputs', 'GpsCamByShamail-AndroidStudio-Project.zip');

    if (!fs.existsSync(debugApkPath)) {
      res.json({ ready: false });
      return;
    }

    try {
      const apkStat = fs.statSync(debugApkPath);
      const apkSha = computeSha256(debugApkPath);

      const hasZip = fs.existsSync(zipPath);
      const zipStat = hasZip ? fs.statSync(zipPath) : null;
      const zipSha = hasZip ? computeSha256(zipPath) : '';

      res.json({
        ready: true,
        manifest: {
          appName: 'Gps cam by shamail',
          packageName: 'com.shamail.gpscam',
          versionName: '2.0.0',
          versionCode: 3,
          minSdk: 24,
          targetSdk: 34,
          compileSdk: 34,
          builtAt: apkStat.mtime.toISOString(),
          releaseApk: {
            fileName: 'app-debug.apk',
            url: '/build-outputs/app-debug.apk',
            sizeBytes: apkStat.size,
            sha256: apkSha,
            signed: true,
            signatureSchemes: ['Android Debug Keystore (v1 + v2)'],
          },
          debugApk: {
            fileName: 'app-debug.apk',
            url: '/build-outputs/app-debug.apk',
            sizeBytes: apkStat.size,
            sha256: apkSha,
          },
          sourceZip: {
            fileName: 'GpsCamByShamail-AndroidStudio-Project.zip',
            url: hasZip ? '/build-outputs/GpsCamByShamail-AndroidStudio-Project.zip' : '',
            sizeBytes: zipStat ? zipStat.size : 0,
            sha256: zipSha,
          },
        },
      });
    } catch {
      res.json({ ready: false });
    }
  });

  // Native Android Studio Kotlin source files explorer endpoint
  app.get('/api/android-source', (_req, res) => {
    const androidRoot = path.join(__dirname, 'android-project');
    const files = SOURCE_FILES_TO_EXPOSE.map((item) => {
      const abs = path.join(androidRoot, item.relPath);
      const content = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
      return {
        label: item.label,
        relPath: `android-project/${item.relPath}`,
        category: item.category,
        content,
      };
    }).filter((f) => f.content.length > 0);

    res.json({ files });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gps cam by shamail server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
