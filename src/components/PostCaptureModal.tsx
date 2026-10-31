import { useEffect, useState } from 'react';
import {
  Bookmark,
  Calendar,
  Check,
  Clock,
  Download,
  MapPin,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  CapturedPhoto,
  GpsData,
  SavedLocationBookmark,
  TimestampMode,
  WatermarkSettings,
} from '../types';
import {
  buildLocationHeadline,
  composeWatermarkedPhoto,
  formatWatermarkCoordinates,
  loadImageElement,
  resolveTimestampMillis,
} from '../utils/watermarkCanvas';
import { bookmarkToGpsData, listSavedLocations } from '../utils/savedLocations';
import { SequentialDateTimeModal } from './SequentialDateTimeModal';

export interface PostCaptureModalProps {
  rawBaseDataUrl: string;
  initialSettings: WatermarkSettings;
  initialGps: GpsData;
  captureMillis: number;
  defaultLogoUrl: string;
  existingPhoto?: CapturedPhoto | null;
  onCancel: () => void;
  onSave: (
    photoRecord: CapturedPhoto,
    updatedSettings: WatermarkSettings,
    updatedGps: GpsData,
    alsoDownload: boolean
  ) => Promise<void> | void;
}

export function PostCaptureModal({
  rawBaseDataUrl,
  initialSettings,
  initialGps,
  captureMillis,
  defaultLogoUrl,
  existingPhoto = null,
  onCancel,
  onSave,
}: PostCaptureModalProps) {
  const startingGps = existingPhoto?.gpsSnapshot || initialGps;
  const startingEffectiveMs = resolveTimestampMillis(initialSettings, startingGps, captureMillis);

  const [draftSettings, setDraftSettings] = useState<WatermarkSettings>(() => ({
    ...initialSettings,
    manualTimestampMillis:
      initialSettings.timestampMode === TimestampMode.Manual
        ? initialSettings.manualTimestampMillis
        : startingEffectiveMs,
  }));

  const [draftGps, setDraftGps] = useState<GpsData>(() => ({
    ...startingGps,
    hasFix: true,
  }));

  const [pickerStep, setPickerStep] = useState<'calendar' | 'clock' | null>(null);
  const [savedLocations] = useState<SavedLocationBookmark[]>(() => listSavedLocations());
  const [showBookmarksDropdown, setShowBookmarksDropdown] = useState(false);

  const [headlineInput, setHeadlineInput] = useState<string>(() =>
    buildLocationHeadline(startingGps)
  );
  const [addressInput, setAddressInput] = useState<string>(() => startingGps.streetAddress || '');
  const [latInput, setLatInput] = useState<string>(() => startingGps.latitude.toFixed(6));
  const [lonInput, setLonInput] = useState<string>(() => startingGps.longitude.toFixed(6));

  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);
  const [previewResult, setPreviewResult] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    timestampText: string;
  } | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    loadImageElement(rawBaseDataUrl).then((img) => {
      if (active && img) setBaseImg(img);
    });
    return () => {
      active = false;
    };
  }, [rawBaseDataUrl]);

  useEffect(() => {
    if (!baseImg) return;
    let active = true;
    composeWatermarkedPhoto({
      sourceElement: baseImg,
      isMirroredFrontCamera: false,
      settings: draftSettings,
      gps: draftGps,
      defaultLogoUrl,
      captureMillis,
    })
      .then((res) => {
        if (active) setPreviewResult(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [baseImg, draftSettings, draftGps, defaultLogoUrl, captureMillis]);

  const handleResetToCurrent = () => {
    const now = Date.now();
    setDraftSettings((prev) => ({
      ...prev,
      timestampMode: TimestampMode.AutoDevice,
      manualTimestampMillis: now,
    }));
  };

  const handleHeadlineChange = (value: string) => {
    setHeadlineInput(value);
    setDraftGps((prev) => ({
      ...prev,
      hasFix: true,
      city: value,
      district: '',
      province: '',
      country: '',
    }));
  };

  const handleAddressChange = (value: string) => {
    setAddressInput(value);
    setDraftGps((prev) => ({
      ...prev,
      hasFix: true,
      streetAddress: value,
      isOfflineAddress: false,
    }));
  };

  const handleCoordsChange = (nextLatStr: string, nextLonStr: string) => {
    setLatInput(nextLatStr);
    setLonInput(nextLonStr);
    const parsedLat = Number(nextLatStr);
    const parsedLon = Number(nextLonStr);
    if (!Number.isNaN(parsedLat) && !Number.isNaN(parsedLon)) {
      setDraftGps((prev) => ({
        ...prev,
        hasFix: true,
        latitude: Math.max(-90, Math.min(90, parsedLat)),
        longitude: Math.max(-180, Math.min(180, parsedLon)),
      }));
    }
  };

  const handleCommitSave = async (alsoDownload: boolean) => {
    if (saving || !baseImg) return;
    setSaving(true);
    try {
      const rendered =
        previewResult ||
        (await composeWatermarkedPhoto({
          sourceElement: baseImg,
          isMirroredFrontCamera: false,
          settings: draftSettings,
          gps: draftGps,
          defaultLogoUrl,
          captureMillis,
        }));

      const d = new Date(captureMillis);
      const stampId = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
        d.getDate()
      ).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(
        d.getMinutes()
      ).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;

      const photoRecord: CapturedPhoto = {
        id: existingPhoto ? existingPhoto.id : `photo_${captureMillis}`,
        fileName: existingPhoto ? existingPhoto.fileName : `SHAMAIL_GPS_${stampId}.jpg`,
        dataUrl: rendered.dataUrl,
        rawBaseDataUrl,
        gpsSnapshot: draftGps,
        width: rendered.width,
        height: rendered.height,
        capturedDeviceMillis: captureMillis,
        displayedTimestampText: rendered.timestampText,
        isEditedTimestamp: draftSettings.timestampMode === TimestampMode.Manual,
        timestampMode: draftSettings.timestampMode,
        organizationName: draftSettings.organizationName || 'SHAMAIL PERA',
        locationHeadline: buildLocationHeadline(draftGps),
        coordinatesText: formatWatermarkCoordinates(draftSettings, draftGps),
        accuracyMeters: draftGps.accuracyMeters,
      };

      await onSave(photoRecord, draftSettings, draftGps, alsoDownload);
    } finally {
      setSaving(false);
    }
  };

  const effectiveMs = resolveTimestampMillis(draftSettings, draftGps, captureMillis);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#0D0F14] border border-[#2B3142] rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden my-auto shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[#2B3142] bg-[#14171F]">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={draftSettings.customLogoDataUrl || defaultLogoUrl}
              alt="SHAMAIL PERA Emblem"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-amber-500/80 bg-[#07080B] shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                {existingPhoto
                  ? 'Customize Saved GPS Photo'
                  : 'Review & Customize GPS Photo Before Saving'}
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Editor Source: {draftGps.sourceLabel} · Clean SHAMAIL PERA watermark preview
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Close editor"
            className="min-h-[40px] min-w-[40px] rounded-xl border border-[#2B3142] hover:bg-[#1B1F2B] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Two-Column Workspace */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Live Watermarked Photo Preview */}
            <div className="lg:col-span-7 space-y-3">
              <div className="rounded-xl overflow-hidden bg-[#07080B] border border-[#2B3142] flex items-center justify-center">
                <img
                  src={previewResult ? previewResult.dataUrl : rawBaseDataUrl}
                  alt="Watermarked GPS photo preview"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-[56vh] object-contain"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 px-1">
                <span>
                  Watermark Timestamp:{' '}
                  <strong className="font-mono tabular-nums text-amber-300 font-medium">
                    {previewResult?.timestampText || 'Rendering...'}
                  </strong>
                </span>
                {previewResult && (
                  <span className="font-mono tabular-nums">
                    {previewResult.width} × {previewResult.height}px
                  </span>
                )}
              </div>
            </div>

            {/* Right: Sequential Date/Time + GPS Location Controls */}
            <div className="lg:col-span-5 space-y-5">
              {/* Section 1: Sequential Date & Time Stamp */}
              <div className="bg-[#14171F] border border-[#2B3142] rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-amber-400">
                    01. Date &amp; Time (Calendar &rarr; Clock)
                  </h3>
                  <button
                    type="button"
                    onClick={handleResetToCurrent}
                    className="inline-flex items-center gap-1.5 px-2.5 min-h-[34px] rounded-lg border border-[#2B3142] hover:bg-[#1B1F2B] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    Reset Now
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        timestampMode: TimestampMode.AutoDevice,
                      }))
                    }
                    className={`min-h-[36px] px-2 rounded-lg text-xs font-medium transition-colors truncate cursor-pointer ${
                      draftSettings.timestampMode === TimestampMode.AutoDevice
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Capture Time
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        timestampMode: TimestampMode.GpsFix,
                      }))
                    }
                    className={`min-h-[36px] px-2 rounded-lg text-xs font-medium transition-colors truncate cursor-pointer ${
                      draftSettings.timestampMode === TimestampMode.GpsFix
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    GPS Time
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerStep('calendar')}
                    className={`min-h-[36px] px-2 rounded-lg text-xs font-medium transition-colors truncate cursor-pointer ${
                      draftSettings.timestampMode === TimestampMode.Manual
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Custom Pick
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPickerStep('calendar')}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Pick Date &amp; Time
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerStep('clock')}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 rounded-xl bg-[#1B1F2B] border border-[#2B3142] text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Clock Only
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-300">Clock Format</span>
                  <div className="flex items-center gap-1 p-1 bg-[#0D0F14] rounded-lg border border-[#2B3142]">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSettings((prev) => ({ ...prev, is24HourFormat: false }))
                      }
                      className={`px-3 min-h-[30px] rounded-md text-xs font-medium cursor-pointer ${
                        !draftSettings.is24HourFormat
                          ? 'bg-[#1B1F2B] text-amber-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      12-Hour
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSettings((prev) => ({ ...prev, is24HourFormat: true }))
                      }
                      className={`px-3 min-h-[30px] rounded-md text-xs font-medium cursor-pointer ${
                        draftSettings.is24HourFormat
                          ? 'bg-[#1B1F2B] text-amber-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      24-Hour
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 2: GPS Location & Saved Bookmarks */}
              <div className="bg-[#14171F] border border-[#2B3142] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    02. GPS Location &amp; Address
                  </h3>
                  {savedLocations.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowBookmarksDropdown((v) => !v)}
                      className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-lg border border-amber-500/50 text-amber-300 text-xs font-semibold cursor-pointer"
                    >
                      <Bookmark className="w-3 h-3" />
                      Saved ({savedLocations.length})
                    </button>
                  )}
                </div>

                {showBookmarksDropdown && savedLocations.length > 0 && (
                  <div className="p-2 rounded-xl bg-[#0D0F14] border border-[#2B3142] max-h-36 overflow-y-auto space-y-1">
                    {savedLocations.map((bm) => (
                      <button
                        key={bm.id}
                        type="button"
                        onClick={() => {
                          setDraftGps(bookmarkToGpsData(bm));
                          setHeadlineInput(bm.locationTitle);
                          setAddressInput(bm.fullAddress);
                          setLatInput(bm.latitude.toFixed(6));
                          setLonInput(bm.longitude.toFixed(6));
                          setShowBookmarksDropdown(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#1B1F2B] text-xs text-slate-200 cursor-pointer"
                      >
                        <span className="font-semibold text-amber-300">{bm.label}</span> —{' '}
                        {bm.locationTitle}
                      </button>
                    ))}
                  </div>
                )}

                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">Location Title (City / Area)</span>
                  <input
                    type="text"
                    value={headlineInput}
                    onChange={(e) => handleHeadlineChange(e.target.value)}
                    placeholder="Lahore, Punjab, Pakistan"
                    className="w-full min-h-[40px] px-3 rounded-lg bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">Full Street / Area Address</span>
                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    placeholder="Main Boulevard Gulberg III, Lahore"
                    className="w-full min-h-[40px] px-3 rounded-lg bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-300">Latitude</span>
                    <input
                      type="number"
                      step="0.000001"
                      value={latInput}
                      onChange={(e) => handleCoordsChange(e.target.value, lonInput)}
                      className="w-full min-h-[40px] px-3 rounded-lg bg-[#0D0F14] border border-[#2B3142] text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-300">Longitude</span>
                    <input
                      type="number"
                      step="0.000001"
                      value={lonInput}
                      onChange={(e) => handleCoordsChange(latInput, e.target.value)}
                      className="w-full min-h-[40px] px-3 rounded-lg bg-[#0D0F14] border border-[#2B3142] text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-[#2B3142] bg-[#14171F]">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 min-h-[44px] rounded-xl border border-[#2B3142] hover:bg-[#1B1F2B] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            {existingPhoto ? 'Cancel' : 'Retake Photo'}
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleCommitSave(false)}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl border border-amber-500/60 hover:bg-amber-500/15 text-amber-300 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              Save to Gallery
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleCommitSave(true)}
              className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Save &amp; Download JPEG
            </button>
          </div>
        </div>
      </div>

      {pickerStep && (
        <SequentialDateTimeModal
          initialMillis={effectiveMs}
          is24HourFormat={draftSettings.is24HourFormat}
          dateFormatPattern={draftSettings.dateFormatPattern}
          initialStep={pickerStep}
          onCancel={() => setPickerStep(null)}
          onConfirm={(confirmedMillis) => {
            setPickerStep(null);
            setDraftSettings((prev) => ({
              ...prev,
              timestampMode: TimestampMode.Manual,
              manualTimestampMillis: confirmedMillis,
            }));
          }}
        />
      )}
    </div>
  );
}
