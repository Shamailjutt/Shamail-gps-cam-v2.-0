import { useEffect, useState } from 'react';
import {
  Download,
  FileArchive,
  Check,
  Copy,
  Smartphone,
  ShieldCheck,
  Code2,
} from 'lucide-react';
import { AndroidSourceFile, ApkBuildManifest } from '../types';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '-- MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

export function ApkReleasePortal() {
  const [manifest, setManifest] = useState<ApkBuildManifest | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(true);
  const [sourceFiles, setSourceFiles] = useState<AndroidSourceFile[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/apk-manifest')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ready && data.manifest) {
          setManifest(data.manifest);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingManifest(false));

    fetch('/api/android-source')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.files)) {
          setSourceFiles(data.files);
        }
      })
      .catch(() => {});
  }, []);

  const currentFile = sourceFiles[selectedFileIndex] || null;

  const handleCopyCode = () => {
    if (!currentFile) return;
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Primary Deliverable Section: Native Android v2.0.0 Professional Upgrade */}
      <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <img
            src="/assets/aistudio/file_00000000b43482118e46f28b241df8ff_da246cf0.png"
            alt="Gps cam by shamail PERA SHAMAIL GPS App Icon"
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-full object-cover border-2 border-amber-500/80 bg-[#07080B] shrink-0"
          />
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-400 font-mono tabular-nums">
              <span>Native Kotlin + CameraX + Room + Maps SDK · v2.0.0</span>
              <span aria-hidden="true">·</span>
              <span>com.shamail.gpscam</span>
              <span aria-hidden="true">·</span>
              <span>Shamailjutt/Gps-cam-by-shamail</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-100 tracking-tight">
              Gps cam by shamail — Professional Upgrade (v2.0.0)
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Upgraded native Android project in{' '}
              <span className="font-mono text-amber-300">android-project/</span> featuring the
              deep charcoal <strong>SHAMAIL PERA</strong> dark theme, PBKDF2-protected Settings
              login, <strong>Gallery GPS Camera</strong> with Saved Locations (Room DB) &amp;
              Google Maps Picker, and sequential Calendar &rarr; Clock &rarr; Confirm timestamp
              selection.
            </p>
          </div>
        </div>

        {loadingManifest ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-36 rounded-xl bg-[#0D0F14] border border-[#2B3142] animate-pulse" />
            <div className="h-36 rounded-xl bg-[#0D0F14] border border-[#2B3142] animate-pulse" />
          </div>
        ) : manifest ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            <div className="bg-[#0D0F14] border border-[#2B3142] rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    Workspace Debug APK Artifact
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatBytes(manifest.debugApk.sizeBytes)}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-100 font-mono">
                  build-outputs/{manifest.debugApk.fileName}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Push to GitHub repository{' '}
                  <span className="font-mono text-amber-300">Shamailjutt/Gps-cam-by-shamail</span>{' '}
                  to compile the upgraded v2.0.0 APK automatically via GitHub Actions{' '}
                  <span className="font-mono text-slate-300">:app:assembleDebug</span>.
                </p>
                <p className="text-[11px] font-mono tabular-nums text-slate-500 break-all">
                  SHA-256: {manifest.debugApk.sha256}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <a
                  href="/build-outputs/app-debug.apk"
                  download="app-debug.apk"
                  className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  Download Current APK
                </a>
              </div>
            </div>

            <div className="bg-[#0D0F14] border border-[#2B3142] rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                    <FileArchive className="w-4 h-4" />
                    Android Studio Project Directory
                  </span>
                  <span className="font-mono tabular-nums">Gradle 8.7 · SDK 34</span>
                </div>
                <h2 className="text-base font-bold text-slate-100 font-mono">
                  android-project/
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Includes <span className="font-mono text-slate-200">GalleryGpsEditorActivity</span>,{' '}
                  <span className="font-mono text-slate-200">LocationMapPickerActivity</span>,{' '}
                  <span className="font-mono text-slate-200">SettingsLoginActivity</span>,{' '}
                  <span className="font-mono text-slate-200">AuthManager</span>, and{' '}
                  <span className="font-mono text-slate-200">SequentialDateTimePicker</span>.
                </p>
              </div>

              {manifest.sourceZip.url ? (
                <div className="pt-1">
                  <a
                    href={manifest.sourceZip.url}
                    download={manifest.sourceZip.fileName}
                    className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl border border-amber-500/60 hover:bg-amber-500/10 text-amber-300 text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <FileArchive className="w-4 h-4" />
                    Download Android Studio Project (.zip)
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-300">
            Sync this project with GitHub (<span className="font-mono text-amber-300">Shamailjutt/Gps-cam-by-shamail</span>)
            to trigger the automated <span className="font-mono">.github/workflows/android-apk.yml</span> build and download <span className="font-mono text-amber-300">app-debug.apk</span> directly on your Android phone.
          </div>
        )}
      </div>

      {/* GitHub Actions Mobile Build Guide + Google Maps Secret Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-bold text-slate-100">
              Building &amp; Downloading APK on Your Android Phone
            </h2>
          </div>

          <ol className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <li>
              <strong className="text-slate-100 font-semibold">01. Push / Sync to GitHub:</strong>{' '}
              Export or sync this workspace to{' '}
              <span className="font-mono text-amber-300">Shamailjutt/Gps-cam-by-shamail</span>.
            </li>
            <li>
              <strong className="text-slate-100 font-semibold">
                02. Optional Maps Key Secret:
              </strong>{' '}
              In GitHub &rarr; <span className="text-slate-100">Settings &rarr; Secrets and variables &rarr; Actions</span>,
              add repository secret <span className="font-mono text-amber-300">MAPS_API_KEY</span>{' '}
              for interactive Google Maps tiles inside the APK (Geocoder place search &amp; Saved Locations work even without a key).
            </li>
            <li>
              <strong className="text-slate-100 font-semibold">
                03. Download Artifact from Actions:
              </strong>{' '}
              Open the <span className="text-slate-100">Actions</span> tab on GitHub Mobile /
              Chrome, select the latest <span className="text-amber-300">Build Android Debug APK</span>{' '}
              run, and download <span className="font-mono">GpsCamByShamail-debug-apk</span>.
            </li>
            <li>
              <strong className="text-slate-100 font-semibold">
                04. Install &amp; Capture:
              </strong>{' '}
              Extract and tap <span className="font-mono text-amber-300">app-debug.apk</span> to
              install the upgraded v2.0.0 app.
            </li>
          </ol>
        </section>

        <section className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-bold text-slate-100">
              Local Android Studio Configuration
            </h2>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            When building locally in Android Studio, add your Google Maps SDK for Android key in{' '}
            <span className="font-mono text-amber-300">android-project/local.properties</span>{' '}
            (gitignored so keys are never committed):
          </p>

          <pre className="p-3.5 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs font-mono text-slate-200 overflow-x-auto">
{`MAPS_API_KEY=YOUR_RESTRICTED_ANDROID_MAPS_KEY`}
          </pre>

          <p className="text-xs text-slate-400 leading-relaxed">
            Restrict the Android key in Google Cloud Console by package name{' '}
            <span className="font-mono text-slate-200">com.shamail.gpscam</span> and your signing
            certificate SHA-1 fingerprint.
          </p>
        </section>
      </div>

      {/* Interactive Native Android Source Code Inspector */}
      {sourceFiles.length > 0 && (
        <section className="bg-[#14171F] border border-[#2B3142] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#2B3142] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Upgraded Native Android Source Explorer (v2.0.0)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect all Kotlin &amp; XML files inside android-project/
              </p>
            </div>
            {currentFile && (
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-lg border border-[#2B3142] hover:bg-[#1B1F2B] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    Copy File
                  </>
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-[#2B3142] bg-[#0D0F14] p-2 max-h-[520px] overflow-y-auto space-y-1">
              {sourceFiles.map((file, idx) => (
                <button
                  key={file.relPath}
                  type="button"
                  onClick={() => setSelectedFileIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    idx === selectedFileIndex
                      ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                      : 'text-slate-300 hover:bg-[#1B1F2B]'
                  }`}
                >
                  <div className="font-mono truncate">{file.label}</div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">{file.category}</div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-9 bg-[#07080B] flex flex-col max-h-[520px]">
              {currentFile && (
                <>
                  <div className="px-4 py-2 border-b border-[#2B3142] text-[11px] font-mono text-slate-400 truncate">
                    {currentFile.relPath}
                  </div>
                  <pre className="p-4 text-xs font-mono text-slate-200 overflow-auto flex-1 leading-relaxed">
                    <code>{currentFile.content}</code>
                  </pre>
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
