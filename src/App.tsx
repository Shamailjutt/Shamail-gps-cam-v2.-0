import { useCallback, useEffect, useRef, useState } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Camera,
  CalendarClock,
  Download,
  ImagePlus,
  Images,
  Lock,
  MapPin,
  RefreshCw,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Smartphone,
  SwitchCamera,
  X,
  Zap,
  ZapOff,
} from 'lucide-react';
import fieldSitePreviewUrl from './assets/images/field_site_preview_1793353895010.jpg';
import {
  CapturedPhoto,
  CoordFormat,
  FlashMode,
  GpsData,
  LocationSource,
  ResolutionPreset,
  TimestampMode,
  WatermarkPosition,
  WatermarkSettings,
  WatermarkSize,
  WatermarkStyle,
  WatermarkTextColor,
} from './types';
import {
  buildLocationHeadline,
  captureRawBasePhoto,
  composeWatermarkedPhoto,
  formatWatermarkCoordinates,
} from './utils/watermarkCanvas';
import {
  deleteCapturedPhoto,
  listCapturedPhotos,
  saveCapturedPhoto,
  triggerPhotoDownload,
} from './utils/photoDb';
import {
  isRememberedSettingsSessionActive,
  logoutSettingsSession,
  saveRememberedSession,
} from './utils/auth';
import { WatermarkOverlayPreview } from './components/WatermarkOverlayPreview';
import { DateTimeEditorPanel } from './components/DateTimeEditorPanel';
import { GalleryView } from './components/GalleryView';
import { SettingsView } from './components/SettingsView';
import { SettingsLoginGate } from './components/SettingsLoginGate';
import { ApkReleasePortal } from './components/ApkReleasePortal';
import { PostCaptureModal } from './components/PostCaptureModal';
import { GalleryGpsCameraModal } from './components/GalleryGpsCameraModal';
import { SequentialDateTimeModal } from './components/SequentialDateTimeModal';

const defaultEmblemUrl = '/assets/aistudio/file_00000000b43482118e46f28b241df8ff_da246cf0.png';
const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';

type AppTab = 'camera' | 'gallery' | 'settings' | 'apk';

const STORAGE_SETTINGS_KEY = 'gps_cam_shamail_web_settings_v2';

const DEFAULT_SETTINGS: WatermarkSettings = {
  organizationName: 'SHAMAIL PERA',
  customLogoDataUrl: null,
  timestampMode: TimestampMode.AutoDevice,
  manualTimestampMillis: Date.now(),
  is24HourFormat: false,
  dateFormatPattern: 'dd MMM yyyy',
  showWatermark: true,
  watermarkSize: WatermarkSize.Medium,
  watermarkOpacity: 78,
  fontScale: 1.0,
  watermarkPosition: WatermarkPosition.BottomCenter,
  watermarkStyle: WatermarkStyle.ClassicCard,
  textColor: WatermarkTextColor.White,
  showOrgHeading: true,
  showLocationTitle: true,
  showFullAddress: true,
  showCoordinates: true,
  showDateTime: true,
  showAccuracy: true,
  showLogo: true,
  showMapThumbnail: false,
  coordFormat: CoordFormat.Decimal,
  resolutionPreset: ResolutionPreset.Max,
  jpegQuality: 95,
  defaultFlashMode: FlashMode.Auto,
  defaultLensFacing: 'environment',
  autoLocationEnabled: true,
  openEditorAfterCapture: true,
};

const INITIAL_FALLBACK_GPS: GpsData = {
  hasFix: true,
  latitude: 31.52037,
  longitude: 74.358749,
  accuracyMeters: 3.8,
  gpsTimestampMillis: Date.now(),
  city: 'Lahore',
  district: 'Lahore District',
  province: 'Punjab',
  country: 'Pakistan',
  streetAddress: 'Main Boulevard Gulberg III, Lahore, Punjab, Pakistan',
  isOfflineAddress: false,
  sourceLabel: 'Default Field Reference',
  locationSource: LocationSource.LiveGps,
};

function loadInitialSettings(): WatermarkSettings {
  try {
    const raw =
      localStorage.getItem(STORAGE_SETTINGS_KEY) ||
      localStorage.getItem('gps_cam_shamail_web_settings_v1');
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WatermarkSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      manualTimestampMillis:
        typeof parsed.manualTimestampMillis === 'number'
          ? parsed.manualTimestampMillis
          : Date.now(),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function GpsCameraWorkspace() {
  const [activeTab, setActiveTab] = useState<AppTab>('camera');
  const [settings, setSettings] = useState<WatermarkSettings>(loadInitialSettings);
  const [gps, setGps] = useState<GpsData>(INITIAL_FALLBACK_GPS);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string>('Acquiring device GPS...');
  const [nowMillis, setNowMillis] = useState<number>(() => Date.now());

  const [settingsUnlocked, setSettingsUnlocked] = useState<boolean>(() =>
    isRememberedSettingsSessionActive()
  );
  const [rememberUserEnabled, setRememberUserEnabled] = useState<boolean>(() =>
    isRememberedSettingsSessionActive()
  );

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    () => loadInitialSettings().defaultLensFacing
  );
  const [flashMode, setFlashMode] = useState<FlashMode>(
    () => loadInitialSettings().defaultFlashMode
  );
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shutterFlash, setShutterFlash] = useState<boolean>(false);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [captureNotice, setCaptureNotice] = useState<CapturedPhoto | null>(null);

  const [showSequentialDateModal, setShowSequentialDateModal] = useState<boolean>(false);
  const [showGalleryGpsModal, setShowGalleryGpsModal] = useState<boolean>(false);
  const [pendingCapture, setPendingCapture] = useState<{
    rawBaseDataUrl: string;
    captureMillis: number;
    existingPhoto: CapturedPhoto | null;
  } | null>(null);

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackImgRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastGeocodeRef = useRef<string>('');
  const geocodingLib = useMapsLibrary('geocoding');

  // Tier 2 Google Maps Demo Key Quota Exceeded event listener
  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Re-lock transient settings session when leaving Settings tab if Remember User is off
  const handleSelectTab = (nextTab: AppTab) => {
    if (activeTab === 'settings' && nextTab !== 'settings' && !isRememberedSettingsSessionActive()) {
      setSettingsUnlocked(false);
    }
    setActiveTab(nextTab);
  };

  const updateSettings = useCallback((next: WatermarkSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota issues
    }
  }, []);

  const refreshGallery = useCallback(async () => {
    try {
      const saved = await listCapturedPhotos();
      setPhotos(saved);
    } catch {
      // Ignore IndexedDB restriction
    }
  }, []);

  useEffect(() => {
    refreshGallery();
  }, [refreshGallery]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMillis(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Reverse geocode live coordinates strictly via Google Maps Geocoder (GMP ToS compliant)
  const reverseGeocodeCoords = useCallback(
    (lat: number, lon: number) => {
      if (!geocodingLib) return;
      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (lastGeocodeRef.current === key) return;
      lastGeocodeRef.current = key;

      const geocoder = new geocodingLib.Geocoder();
      geocoder.geocode(
        { location: { lat, lng: lon } },
        (
          results: Array<{
            formatted_address?: string;
            address_components?: Array<{ long_name: string; types: string[] }>;
          }> | null,
          status: string
        ) => {
          if (status === 'OK' && results && results[0]) {
            const first = results[0];
            const comps = first.address_components || [];
            const findComp = (type: string) =>
              comps.find((c: { long_name: string; types: string[] }) => c.types.includes(type))
                ?.long_name || '';
          const city =
            findComp('locality') ||
            findComp('sublocality') ||
            findComp('administrative_area_level_2');
          const district = findComp('administrative_area_level_2');
          const province = findComp('administrative_area_level_1');
          const country = findComp('country');

          setGps((prev) => ({
            ...prev,
            city: city || prev.city,
            district: district || prev.district,
            province: province || prev.province,
            country: country || prev.country,
            streetAddress: first.formatted_address || prev.streetAddress,
            isOfflineAddress: false,
          }));
        } else {
          setGps((prev) => ({
            ...prev,
            isOfflineAddress: true,
          }));
        }
      });
    },
    [geocodingLib]
  );

  const requestLiveGps = useCallback(() => {
    if (!settings.autoLocationEnabled) {
      setGpsStatusMsg('Auto GPS Paused · Custom Location Ready');
      return;
    }
    if (!('geolocation' in navigator)) {
      setGpsStatusMsg('Geolocation unavailable · Field coordinates active');
      return;
    }
    setGpsStatusMsg('Locking GPS satellites...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGps({
          hasFix: true,
          latitude,
          longitude,
          accuracyMeters: accuracy || 4.5,
          gpsTimestampMillis: pos.timestamp || Date.now(),
          city: '',
          district: '',
          province: '',
          country: '',
          streetAddress: '',
          isOfflineAddress: false,
          sourceLabel: 'Live Device GPS',
          locationSource: LocationSource.LiveGps,
        });
        setGpsStatusMsg(`GPS Locked (±${(accuracy || 4.5).toFixed(1)} m)`);
        reverseGeocodeCoords(latitude, longitude);
      },
      () => {
        setGpsStatusMsg('GPS permission off · Field reference coordinates active');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, [settings.autoLocationEnabled, reverseGeocodeCoords]);

  useEffect(() => {
    if (!settings.autoLocationEnabled) {
      setGpsStatusMsg('Auto GPS Paused · Custom Location Ready');
      return;
    }
    requestLiveGps();
    if (!('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGps((prev) => ({
          ...prev,
          hasFix: true,
          latitude,
          longitude,
          accuracyMeters: accuracy || prev.accuracyMeters,
          gpsTimestampMillis: pos.timestamp || Date.now(),
          sourceLabel: 'Live Device GPS',
          locationSource: LocationSource.LiveGps,
        }));
        setGpsStatusMsg(`GPS Locked (±${(accuracy || 4.2).toFixed(1)} m)`);
        reverseGeocodeCoords(latitude, longitude);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [settings.autoLocationEnabled, requestLiveGps, reverseGeocodeCoords]);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startHardwareCamera = useCallback(
    async (requestedFacing: 'environment' | 'user') => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Hardware camera API unavailable; showing high-res field viewfinder.');
        setCameraActive(false);
        return;
      }
      stopCameraStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: requestedFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);
        setCameraError(null);
      } catch {
        setCameraActive(false);
        setCameraError('Camera permission off or no webcam connected · Field scene ready');
      }
    },
    [stopCameraStream]
  );

  useEffect(() => {
    if (activeTab === 'camera') {
      startHardwareCamera(facingMode);
    } else {
      stopCameraStream();
    }
    return () => stopCameraStream();
  }, [activeTab, facingMode, startHardwareCamera, stopCameraStream]);

  const cycleFlash = async () => {
    const next =
      flashMode === FlashMode.Auto
        ? FlashMode.On
        : flashMode === FlashMode.On
          ? FlashMode.Off
          : FlashMode.Auto;
    setFlashMode(next);

    const videoTrack = streamRef.current?.getVideoTracks()?.[0];
    if (videoTrack) {
      try {
        const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & {
          torch?: boolean;
        };
        if (capabilities.torch) {
          await videoTrack.applyConstraints({
            advanced: [{ torch: next === FlashMode.On } as MediaTrackConstraintSet],
          });
        }
      } catch {
        // Ignore unsupported torch constraint
      }
    }
  };

  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleCapturePhoto = async () => {
    if (capturing) return;
    const sourceEl =
      cameraActive && videoRef.current && videoRef.current.readyState >= 2
        ? videoRef.current
        : fallbackImgRef.current;
    if (!sourceEl) return;

    setCapturing(true);
    setShutterFlash(true);
    window.setTimeout(() => setShutterFlash(false), 180);

    try {
      const captureMoment = Date.now();
      const isMirrored = cameraActive && facingMode === 'user';

      if (settings.openEditorAfterCapture) {
        const raw = captureRawBasePhoto({
          sourceElement: sourceEl,
          isMirroredFrontCamera: isMirrored,
          resolutionPreset: settings.resolutionPreset,
          jpegQuality: settings.jpegQuality,
        });
        setPendingCapture({
          rawBaseDataUrl: raw.rawBaseDataUrl,
          captureMillis: captureMoment,
          existingPhoto: null,
        });
      } else {
        const raw = captureRawBasePhoto({
          sourceElement: sourceEl,
          isMirroredFrontCamera: isMirrored,
          resolutionPreset: settings.resolutionPreset,
          jpegQuality: settings.jpegQuality,
        });
        const composed = await composeWatermarkedPhoto({
          sourceElement: sourceEl,
          isMirroredFrontCamera: isMirrored,
          settings,
          gps,
          defaultLogoUrl: defaultEmblemUrl,
          captureMillis: captureMoment,
        });
        const d = new Date(captureMoment);
        const stampId = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
          d.getDate()
        ).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(
          d.getMinutes()
        ).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;

        const record: CapturedPhoto = {
          id: `photo_${captureMoment}`,
          fileName: `SHAMAIL_GPS_${stampId}.jpg`,
          dataUrl: composed.dataUrl,
          rawBaseDataUrl: raw.rawBaseDataUrl,
          gpsSnapshot: gps,
          width: composed.width,
          height: composed.height,
          capturedDeviceMillis: captureMoment,
          displayedTimestampText: composed.timestampText,
          isEditedTimestamp: settings.timestampMode === TimestampMode.Manual,
          timestampMode: settings.timestampMode,
          organizationName: settings.organizationName || 'SHAMAIL PERA',
          locationHeadline: buildLocationHeadline(gps),
          coordinatesText: formatWatermarkCoordinates(settings, gps),
          accuracyMeters: gps.accuracyMeters,
        };
        await saveCapturedPhoto(record);
        await refreshGallery();
        setCaptureNotice(record);
      }
    } finally {
      setCapturing(false);
    }
  };

  const handleOpenPhotoEditor = (photo: CapturedPhoto) => {
    setPendingCapture({
      rawBaseDataUrl: photo.rawBaseDataUrl || photo.dataUrl,
      captureMillis: photo.capturedDeviceMillis,
      existingPhoto: photo,
    });
  };

  const handleSaveEditedCapture = async (
    photoRecord: CapturedPhoto,
    updatedSettings: WatermarkSettings,
    updatedGps: GpsData,
    alsoDownload: boolean
  ) => {
    updateSettings(updatedSettings);
    setGps(updatedGps);
    await saveCapturedPhoto(photoRecord);
    await refreshGallery();
    setCaptureNotice(photoRecord);
    setPendingCapture(null);
    if (alsoDownload) {
      triggerPhotoDownload(photoRecord);
    }
  };

  const handleSaveGalleryGpsExport = async (
    photoRecord: CapturedPhoto,
    alsoDownload: boolean
  ) => {
    await saveCapturedPhoto(photoRecord);
    await refreshGallery();
    setCaptureNotice(photoRecord);
    setShowGalleryGpsModal(false);
    if (alsoDownload) {
      triggerPhotoDownload(photoRecord);
    }
  };

  const handleDeletePhoto = async (id: string) => {
    await deleteCapturedPhoto(id);
    if (captureNotice?.id === id) setCaptureNotice(null);
    await refreshGallery();
  };

  const latestPhoto = photos[0] || null;

  return (
    <div className="min-h-screen bg-[#07080B] text-slate-100 flex flex-col pb-16 md:pb-0">
      {/* Tier 2 Sticky Dismissible Google Maps Demo Key Quota Banner */}
      {quotaExceeded && (
        <div className="sticky top-0 z-50 bg-amber-950/95 border-b border-amber-500/50 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              The shared Google Maps Demo Key quota has been temporarily reached. Saved Locations
              and coordinate inputs remain active, or configure your own Google Cloud Maps API key
              for uninterrupted map tiles.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setQuotaExceeded(false)}
            aria-label="Dismiss quota notice"
            className="p-1 rounded-lg hover:bg-amber-900/50 text-amber-300 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3-Zone Top Navigation Bar */}
      <header className="flex items-center justify-between gap-6 px-5 lg:px-8 py-3.5 border-b border-[#2B3142] bg-[#0D0F14] sticky top-0 z-30">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleSelectTab('camera')}
          className="flex items-center gap-2.5 text-left shrink-0 cursor-pointer focus:outline-none"
        >
          <img
            src={settings.customLogoDataUrl || defaultEmblemUrl}
            alt="SHAMAIL PERA Emblem"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-full object-cover border border-amber-500/80 bg-[#07080B]"
          />
          <div>
            <span className="text-base font-bold tracking-tight text-amber-400 block leading-none">
              Gps cam by shamail
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              SHAMAIL PERA · v2.0.0
            </span>
          </div>
        </button>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          <button
            type="button"
            onClick={() => handleSelectTab('camera')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'camera'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Camera
          </button>
          <button
            type="button"
            onClick={() => setShowGalleryGpsModal(true)}
            className="whitespace-nowrap shrink-0 text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
          >
            Gallery GPS Camera
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('gallery')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'gallery'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Gallery ({photos.length})
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('settings')}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {!settingsUnlocked && <Lock className="w-3.5 h-3.5 text-amber-400" />}
            Settings
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('apk')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'apk'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Android APK &amp; Source
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowGalleryGpsModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Gallery GPS
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'camera' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left / Primary Column: Live GPS Camera Viewfinder & Charcoal/Gold Shutter Deck */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-[#0D0F14] border border-[#2B3142] rounded-2xl overflow-hidden shadow-2xl">
                {/* Camera Top Control Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#14171F] border-b border-[#2B3142]">
                  <div className="min-w-0 flex items-center gap-2.5 text-xs">
                    <img
                      src={settings.customLogoDataUrl || defaultEmblemUrl}
                      alt="SHAMAIL PERA Logo"
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover border border-amber-500/80 bg-[#07080B] shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-slate-100 font-semibold truncate">{gpsStatusMsg}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {buildLocationHeadline(gps)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={cycleFlash}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs font-medium text-slate-200 hover:border-amber-500/60 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {flashMode === FlashMode.Off ? (
                        <ZapOff className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      {flashMode}
                    </button>

                    <button
                      type="button"
                      onClick={requestLiveGps}
                      title="Refresh GPS satellite lock"
                      className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs font-medium text-slate-200 hover:border-amber-500/60 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                      Sync GPS
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectTab('settings')}
                      title="Protected Settings"
                      className="inline-flex items-center justify-center w-10 h-[38px] rounded-xl bg-[#0D0F14] border border-[#2B3142] text-amber-400 hover:border-amber-500/60 transition-colors cursor-pointer"
                    >
                      <SettingsIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Full-Bleed Camera Preview Frame + Quick One-Hand Toolbar + Live Watermark */}
                <div className="relative aspect-[4/3] sm:aspect-video bg-[#07080B] overflow-hidden select-none">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${
                      cameraActive ? 'block' : 'hidden'
                    } ${facingMode === 'user' ? '-scale-x-100' : ''}`}
                  />

                  <img
                    ref={fallbackImgRef}
                    src={fieldSitePreviewUrl}
                    alt="Field inspection camera scene"
                    referrerPolicy="no-referrer"
                    className={`w-full h-full object-cover ${cameraActive ? 'hidden' : 'block'}`}
                  />

                  {/* Shutter Flash Feedback */}
                  <div
                    className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 ${
                      shutterFlash ? 'opacity-80' : 'opacity-0'
                    }`}
                  />

                  {!cameraActive && cameraError && (
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur-sm border border-[#2B3142] text-[11px] text-slate-300">
                      <span className="truncate">{cameraError}</span>
                      <button
                        type="button"
                        onClick={() => startHardwareCamera(facingMode)}
                        className="text-amber-400 font-semibold hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Retry Camera
                      </button>
                    </div>
                  )}

                  {/* Quick One-Hand Toolbar: Gallery GPS Camera + Date & Time + Live Watermark */}
                  <div className="absolute bottom-2 left-2 right-2 space-y-2">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowGalleryGpsModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-black/85 backdrop-blur-sm border border-amber-500/80 text-xs font-bold text-amber-300 hover:bg-neutral-900 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-amber-400" />
                        Gallery GPS Camera
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowSequentialDateModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        Date &amp; Time
                      </button>
                    </div>

                    <WatermarkOverlayPreview
                      settings={settings}
                      gps={gps}
                      defaultLogoUrl={defaultEmblemUrl}
                      nowMillis={nowMillis}
                      onClick={() => setShowSequentialDateModal(true)}
                    />
                  </div>
                </div>

                {/* Bottom Deep Charcoal Camera Deck with Gold Shutter Button */}
                <div className="px-6 py-4 bg-[#0D0F14] border-t border-[#2B3142] flex items-center justify-between">
                  {/* Left: Gallery Thumbnail */}
                  <button
                    type="button"
                    onClick={() => handleSelectTab('gallery')}
                    className="relative w-14 h-14 rounded-xl bg-[#14171F] border border-amber-500/60 overflow-hidden flex items-center justify-center hover:border-amber-400 transition-colors cursor-pointer"
                    title="Open Captured Photo Gallery"
                  >
                    {latestPhoto ? (
                      <img
                        src={latestPhoto.dataUrl}
                        alt="Latest captured GPS photo"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Images className="w-5 h-5 text-slate-400" />
                    )}
                    <span className="absolute bottom-0 right-0 px-1.5 py-0.5 bg-black/85 text-[10px] font-mono tabular-nums font-bold text-amber-400 rounded-tl-md">
                      {photos.length}
                    </span>
                  </button>

                  {/* Center: Gold Camera Shutter Button */}
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    disabled={capturing}
                    aria-label="Capture GPS watermarked photo"
                    className="w-[74px] h-[74px] rounded-full border-[3px] border-amber-400 p-1.5 flex items-center justify-center active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
                  >
                    <span className="w-full h-full rounded-full bg-amber-500 hover:bg-amber-400 transition-colors flex items-center justify-center">
                      <Camera className="w-6 h-6 text-neutral-950" />
                    </span>
                  </button>

                  {/* Right: Switch Front / Rear Camera */}
                  <button
                    type="button"
                    onClick={handleSwitchCamera}
                    title="Switch Front / Rear Camera"
                    className="w-14 h-14 rounded-xl bg-[#14171F] border border-[#2B3142] hover:border-amber-500/60 flex items-center justify-center text-amber-400 transition-colors cursor-pointer"
                  >
                    <SwitchCamera className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Latest Saved Photo Strip */}
              {captureNotice && (
                <div className="bg-[#14171F] border border-[#2B3142] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 text-xs">
                    <span className="text-emerald-400 font-semibold">Saved New JPEG</span>
                    <span className="mx-2 text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-slate-200">{captureNotice.fileName}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenPhotoEditor(captureNotice)}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg border border-amber-500/60 hover:bg-amber-500/15 text-amber-300 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      Customize
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerPhotoDownload(captureNotice)}
                      className="px-3 min-h-[36px] rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Download JPEG
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Gallery GPS Camera Feature Card + Sequential Date/Time + Quick Watermark Controls */}
            <div className="lg:col-span-5 space-y-5">
              {/* Major Feature Card: Gallery GPS Camera */}
              <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
                      SHAMAIL PERA · New Feature
                    </span>
                    <h2 className="text-sm font-bold text-slate-100 mt-0.5">
                      Gallery Photo GPS Camera
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Select any photo from your gallery, apply a <strong>Saved Location</strong> or
                      drop a pin on <strong>Google Maps</strong>, customize Date &amp; Time, and
                      save a new watermarked JPEG.
                    </p>
                  </div>
                  <ImagePlus className="w-5 h-5 text-amber-400 shrink-0" />
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowGalleryGpsModal(true)}
                    className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <ImagePlus className="w-4 h-4" />
                    Open Gallery GPS Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('apk')}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[42px] rounded-xl border border-[#2B3142] hover:bg-[#1B1F2B] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    v2.0.0 Android Source
                  </button>
                </div>
              </div>

              {/* Dedicated Sequential Date & Time Panel */}
              <DateTimeEditorPanel
                settings={settings}
                gps={gps}
                nowMillis={nowMillis}
                onChange={updateSettings}
              />

              {/* Quick Watermark Style & Layout Card */}
              <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                    Quick Watermark Layout
                  </h2>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('settings')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:underline whitespace-nowrap cursor-pointer"
                  >
                    {!settingsUnlocked && <Lock className="w-3 h-3" />}
                    Protected Settings &rarr;
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                  {[
                    { id: WatermarkStyle.ClassicCard, label: 'Classic' },
                    { id: WatermarkStyle.CompactStrip, label: 'Compact' },
                    { id: WatermarkStyle.ModernBanner, label: 'Banner' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateSettings({ ...settings, watermarkStyle: opt.id })}
                      className={`min-h-[36px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        settings.watermarkStyle === opt.id
                          ? 'bg-amber-500 text-neutral-950 font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Opacity</span>
                      <span className="font-mono tabular-nums text-amber-400">
                        {settings.watermarkOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={95}
                      step={5}
                      value={settings.watermarkOpacity}
                      onChange={(e) =>
                        updateSettings({ ...settings, watermarkOpacity: Number(e.target.value) })
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Font Size</span>
                      <span className="font-mono tabular-nums text-amber-400">
                        {Math.round(settings.fontScale * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={80}
                      max={135}
                      step={5}
                      value={Math.round(settings.fontScale * 100)}
                      onChange={(e) =>
                        updateSettings({ ...settings, fontScale: Number(e.target.value) / 100 })
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'gallery' && (
          <GalleryView
            photos={photos}
            onDelete={handleDeletePhoto}
            onEditPhoto={handleOpenPhotoEditor}
            onOpenGalleryGps={() => setShowGalleryGpsModal(true)}
            onReturnToCamera={() => handleSelectTab('camera')}
          />
        )}

        {activeTab === 'settings' &&
          (settingsUnlocked ? (
            <SettingsView
              settings={settings}
              gps={gps}
              defaultLogoUrl={defaultEmblemUrl}
              nowMillis={nowMillis}
              rememberUserEnabled={rememberUserEnabled}
              onToggleRememberUser={(enabled) => {
                setRememberUserEnabled(enabled);
                saveRememberedSession(enabled);
              }}
              onLogout={() => {
                logoutSettingsSession();
                setRememberUserEnabled(false);
                setSettingsUnlocked(false);
                setActiveTab('camera');
              }}
              onOpenGalleryGps={() => setShowGalleryGpsModal(true)}
              onChange={updateSettings}
            />
          ) : (
            <SettingsLoginGate
              defaultLogoUrl={defaultEmblemUrl}
              onAuthenticated={(remember) => {
                setRememberUserEnabled(remember);
                setSettingsUnlocked(true);
              }}
              onCancel={() => handleSelectTab('camera')}
            />
          ))}

        {activeTab === 'apk' && <ApkReleasePortal />}
      </main>

      {/* Post-Capture Review & Customize Modal */}
      {pendingCapture && (
        <PostCaptureModal
          rawBaseDataUrl={pendingCapture.rawBaseDataUrl}
          initialSettings={settings}
          initialGps={gps}
          captureMillis={pendingCapture.captureMillis}
          defaultLogoUrl={defaultEmblemUrl}
          existingPhoto={pendingCapture.existingPhoto}
          onCancel={() => setPendingCapture(null)}
          onSave={handleSaveEditedCapture}
        />
      )}

      {/* Gallery GPS Camera Modal */}
      {showGalleryGpsModal && (
        <GalleryGpsCameraModal
          initialSettings={settings}
          initialGps={gps}
          defaultLogoUrl={defaultEmblemUrl}
          hasMapsApiKey={Boolean(MAPS_API_KEY)}
          onCancel={() => setShowGalleryGpsModal(false)}
          onSaveExport={handleSaveGalleryGpsExport}
        />
      )}

      {/* Sequential Calendar -> Clock -> Confirm Modal from Camera Screen */}
      {showSequentialDateModal && (
        <SequentialDateTimeModal
          initialMillis={
            settings.timestampMode === TimestampMode.Manual
              ? settings.manualTimestampMillis
              : nowMillis
          }
          is24HourFormat={settings.is24HourFormat}
          dateFormatPattern={settings.dateFormatPattern}
          initialStep="calendar"
          onCancel={() => setShowSequentialDateModal(false)}
          onConfirm={(confirmedMillis) => {
            setShowSequentialDateModal(false);
            updateSettings({
              ...settings,
              timestampMode: TimestampMode.Manual,
              manualTimestampMillis: confirmedMillis,
            });
          }}
        />
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0D0F14]/95 backdrop-blur-md border-t border-[#2B3142] grid grid-cols-5 h-16">
        <button
          type="button"
          onClick={() => handleSelectTab('camera')}
          className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
            activeTab === 'camera' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Camera</span>
        </button>
        <button
          type="button"
          onClick={() => setShowGalleryGpsModal(true)}
          className="flex flex-col items-center justify-center min-h-[44px] text-amber-300 cursor-pointer"
        >
          <ImagePlus className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-1">Gallery GPS</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab('gallery')}
          className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
            activeTab === 'gallery' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <Images className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Gallery</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab('settings')}
          className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
            activeTab === 'settings' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <SettingsIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Settings</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab('apk')}
          className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
            activeTab === 'apk' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <Smartphone className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">APK</span>
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <APIProvider apiKey={MAPS_API_KEY}>
      <GpsCameraWorkspace />
    </APIProvider>
  );
}
