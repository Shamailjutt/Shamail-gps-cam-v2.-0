import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  Map,
  MapMouseEvent,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Bookmark,
  Calendar,
  Check,
  Clock,
  Download,
  Edit3,
  ImagePlus,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  CapturedPhoto,
  GpsData,
  LocationSource,
  SavedLocationBookmark,
  TimestampMode,
  WatermarkPosition,
  WatermarkSettings,
  WatermarkSize,
  WatermarkStyle,
  WatermarkTextColor,
} from '../types';
import {
  buildLocationHeadline,
  composeWatermarkedPhoto,
  formatWatermarkCoordinates,
  loadImageElement,
  resolveTimestampMillis,
} from '../utils/watermarkCanvas';
import {
  addSavedLocation,
  bookmarkToGpsData,
  deleteSavedLocation,
  listSavedLocations,
  renameSavedLocation,
} from '../utils/savedLocations';
import { SequentialDateTimeModal } from './SequentialDateTimeModal';

interface GalleryGpsCameraModalProps {
  initialSettings: WatermarkSettings;
  initialGps: GpsData;
  defaultLogoUrl: string;
  hasMapsApiKey: boolean;
  onCancel: () => void;
  onSaveExport: (photoRecord: CapturedPhoto, alsoDownload: boolean) => Promise<void> | void;
}

interface MapsLatLngLike {
  lat: () => number;
  lng: () => number;
}

type PlacesSessionTokenLike = object;

interface PlacePredictionOption {
  placeId: string;
  mainText: string;
  secondaryText: string;
  toPlace: () => {
    fetchFields: (opts: { fields: string[] }) => Promise<{
      place: {
        displayName?: string | null;
        formattedAddress?: string | null;
        location?: MapsLatLngLike | null;
      };
    }>;
  };
}

export function GalleryGpsCameraModal({
  initialSettings,
  initialGps,
  defaultLogoUrl,
  hasMapsApiKey,
  onCancel,
  onSaveExport,
}: GalleryGpsCameraModalProps) {
  const [sourcePhotoUrl, setSourcePhotoUrl] = useState<string | null>(null);
  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);
  const [renderedPreview, setRenderedPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    timestampText: string;
  } | null>(null);

  const [draftSettings, setDraftSettings] = useState<WatermarkSettings>(() => ({
    ...initialSettings,
    showWatermark: true,
    showAccuracy: false,
    manualTimestampMillis:
      initialSettings.timestampMode === TimestampMode.Manual
        ? initialSettings.manualTimestampMillis
        : Date.now(),
  }));

  const [draftGps, setDraftGps] = useState<GpsData>(() => ({
    ...initialGps,
    hasFix: true,
    accuracyMeters: 0,
    locationSource: LocationSource.ManualMap,
    sourceLabel: 'Selected Map Location',
  }));

  const [locationTab, setLocationTab] = useState<'map' | 'saved'>('map');
  const [savedLocations, setSavedLocations] = useState<SavedLocationBookmark[]>(() =>
    listSavedLocations()
  );
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [newBookmarkLabel, setNewBookmarkLabel] = useState('');
  const [bookmarkFeedback, setBookmarkFeedback] = useState<string | null>(null);

  const [headlineInput, setHeadlineInput] = useState(() => buildLocationHeadline(initialGps));
  const [addressInput, setAddressInput] = useState(() => initialGps.streetAddress || '');
  const [latInput, setLatInput] = useState(() => initialGps.latitude.toFixed(6));
  const [lonInput, setLonInput] = useState(() => initialGps.longitude.toFixed(6));

  const [placeQuery, setPlaceQuery] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<PlacePredictionOption[]>([]);
  const [pickerStep, setPickerStep] = useState<'calendar' | 'clock' | null>(null);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const map = useMap('gallery-gps-map');
  const placesLib = useMapsLibrary('places');
  const geocodingLib = useMapsLibrary('geocoding');
  const sessionTokenRef = useRef<PlacesSessionTokenLike | null>(null);

  // Load selected gallery photo in read-only mode
  const handleSelectGalleryFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourcePhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!sourcePhotoUrl) {
      setBaseImg(null);
      setRenderedPreview(null);
      return;
    }
    let active = true;
    loadImageElement(sourcePhotoUrl).then((img) => {
      if (active) setBaseImg(img);
    });
    return () => {
      active = false;
    };
  }, [sourcePhotoUrl]);

  // Live watermark composition
  useEffect(() => {
    if (!baseImg) return;
    let active = true;
    composeWatermarkedPhoto({
      sourceElement: baseImg,
      isMirroredFrontCamera: false,
      settings: draftSettings,
      gps: draftGps,
      defaultLogoUrl,
      captureMillis: Date.now(),
    })
      .then((res) => {
        if (active) setRenderedPreview(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [baseImg, draftSettings, draftGps, defaultLogoUrl]);

  // Reverse geocode clicked map coordinates via Google Maps Geocoder
  const reverseGeocodeMapPin = useCallback(
    (lat: number, lng: number) => {
      if (!geocodingLib) return;
      const geocoder = new geocodingLib.Geocoder();
      geocoder.geocode(
        { location: { lat, lng } },
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
          const locality =
            findComp('locality') ||
            findComp('sublocality') ||
            findComp('administrative_area_level_2');
          const admin1 = findComp('administrative_area_level_1');
          const country = findComp('country');
          const titleParts = [locality, admin1, country].filter(Boolean);
          const nextHeadline =
            titleParts.length > 0
              ? titleParts.join(', ')
              : `GPS ${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
          const nextAddress = first.formatted_address || nextHeadline;

          setHeadlineInput(nextHeadline);
          setAddressInput(nextAddress);
          setDraftGps((prev) => ({
            ...prev,
            hasFix: true,
            latitude: lat,
            longitude: lng,
            city: nextHeadline,
            district: '',
            province: '',
            country: '',
            streetAddress: nextAddress,
            isOfflineAddress: false,
            locationSource: LocationSource.ManualMap,
            sourceLabel: 'Selected Map Location',
          }));
        }
      });
    },
    [geocodingLib]
  );

  const handleMapClick = (ev: MapMouseEvent) => {
    const latLng = ev.detail.latLng;
    if (!latLng) return;
    const { lat, lng } = latLng;
    setLatInput(lat.toFixed(6));
    setLonInput(lng.toFixed(6));
    setDraftGps((prev) => ({
      ...prev,
      hasFix: true,
      latitude: lat,
      longitude: lng,
      locationSource: LocationSource.ManualMap,
      sourceLabel: 'Selected Map Location',
    }));
    reverseGeocodeMapPin(lat, lng);
  };

  // Places API (New) AutocompleteSuggestion search
  useEffect(() => {
    if (!placesLib || !placeQuery.trim()) {
      setPlaceSuggestions([]);
      return;
    }

    const placesAny = placesLib as unknown as {
      AutocompleteSessionToken: new () => PlacesSessionTokenLike;
      AutocompleteSuggestion?: {
        fetchAutocompleteSuggestions: (req: {
          input: string;
          sessionToken?: PlacesSessionTokenLike;
        }) => Promise<{
          suggestions: Array<{
            placePrediction?: {
              placeId: string;
              mainText?: { text: string };
              secondaryText?: { text: string };
              text?: { text: string };
              toPlace: PlacePredictionOption['toPlace'];
            };
          }>;
        }>;
      };
    };

    if (!placesAny.AutocompleteSuggestion) return;

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesAny.AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await placesAny.AutocompleteSuggestion!.fetchAutocompleteSuggestions({
          input: placeQuery.trim(),
          sessionToken: sessionTokenRef.current || undefined,
        });
        if (cancelled) return;
        const mapped: PlacePredictionOption[] = [];
        for (const s of res.suggestions || []) {
          const pred = s.placePrediction;
          if (pred) {
            mapped.push({
              placeId: pred.placeId,
              mainText: pred.mainText?.text || pred.text?.text || '',
              secondaryText: pred.secondaryText?.text || '',
              toPlace: pred.toPlace.bind(pred),
            });
          }
        }
        setPlaceSuggestions(mapped.slice(0, 5));
      } catch {
        if (!cancelled) setPlaceSuggestions([]);
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, placeQuery]);

  const handleSelectPlacePrediction = async (option: PlacePredictionOption) => {
    try {
      const placeObj = option.toPlace();
      const { place } = await placeObj.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });
      sessionTokenRef.current = null;
      setPlaceSuggestions([]);
      setPlaceQuery(place.displayName || option.mainText);

      if (place.location) {
        const lat = place.location.lat();
        const lng = place.location.lng();
        const title = place.displayName || option.mainText;
        const addr = place.formattedAddress || `${title}, ${option.secondaryText}`;

        setLatInput(lat.toFixed(6));
        setLonInput(lng.toFixed(6));
        setHeadlineInput(title);
        setAddressInput(addr);
        setDraftGps({
          hasFix: true,
          latitude: lat,
          longitude: lng,
          accuracyMeters: 0,
          gpsTimestampMillis: Date.now(),
          city: title,
          district: '',
          province: '',
          country: '',
          streetAddress: addr,
          isOfflineAddress: false,
          sourceLabel: 'Selected Map Location',
          locationSource: LocationSource.ManualMap,
        });
        if (map) {
          map.panTo({ lat, lng });
          map.setZoom(16);
        }
      }
    } catch {
      setPlaceSuggestions([]);
    }
  };

  const handleSaveCurrentBookmark = () => {
    const label = newBookmarkLabel.trim() || headlineInput.trim() || 'Saved Location';
    const created = addSavedLocation({
      label,
      locationTitle: headlineInput,
      fullAddress: addressInput,
      latitude: draftGps.latitude,
      longitude: draftGps.longitude,
    });
    setSavedLocations(listSavedLocations());
    setNewBookmarkLabel('');
    setDraftGps((prev) => ({
      ...prev,
      locationSource: LocationSource.SavedLocation,
      sourceLabel: `Saved Location: ${created.label}`,
    }));
    setBookmarkFeedback(`Saved "${created.label}" to Saved Locations`);
    window.setTimeout(() => setBookmarkFeedback(null), 3000);
  };

  const handleApplySavedBookmark = (bookmark: SavedLocationBookmark) => {
    const nextGps = bookmarkToGpsData(bookmark);
    setDraftGps(nextGps);
    setHeadlineInput(bookmark.locationTitle);
    setAddressInput(bookmark.fullAddress);
    setLatInput(bookmark.latitude.toFixed(6));
    setLonInput(bookmark.longitude.toFixed(6));
    if (map) {
      map.panTo({ lat: bookmark.latitude, lng: bookmark.longitude });
      map.setZoom(15);
    }
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraftSettings((prev) => ({
          ...prev,
          customLogoDataUrl: reader.result as string,
          showLogo: true,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleExportNewPhoto = async (alsoDownload: boolean) => {
    if (!baseImg || saving) return;
    setSaving(true);
    try {
      const exportMoment = Date.now();
      const composed =
        renderedPreview ||
        (await composeWatermarkedPhoto({
          sourceElement: baseImg,
          isMirroredFrontCamera: false,
          settings: draftSettings,
          gps: draftGps,
          defaultLogoUrl,
          captureMillis: exportMoment,
        }));

      const d = new Date(exportMoment);
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
        d.getDate()
      ).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(
        d.getMinutes()
      ).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;

      const record: CapturedPhoto = {
        id: `gallery_gps_${exportMoment}`,
        fileName: `SHAMAIL_GALLERY_GPS_${stamp}.jpg`,
        dataUrl: composed.dataUrl,
        rawBaseDataUrl: sourcePhotoUrl || undefined,
        gpsSnapshot: draftGps,
        width: composed.width,
        height: composed.height,
        capturedDeviceMillis: exportMoment,
        displayedTimestampText: composed.timestampText,
        isEditedTimestamp: draftSettings.timestampMode === TimestampMode.Manual,
        timestampMode: draftSettings.timestampMode,
        organizationName: draftSettings.organizationName || 'SHAMAIL PERA',
        locationHeadline: buildLocationHeadline(draftGps),
        coordinatesText: formatWatermarkCoordinates(draftSettings, draftGps),
        accuracyMeters: draftGps.accuracyMeters,
        isGalleryExport: true,
      };

      await onSaveExport(record, alsoDownload);
    } finally {
      setSaving(false);
    }
  };

  const filteredBookmarks = savedLocations.filter((b) => {
    const q = savedSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      b.label.toLowerCase().includes(q) ||
      b.locationTitle.toLowerCase().includes(q) ||
      b.fullAddress.toLowerCase().includes(q)
    );
  });

  const effectiveMs = resolveTimestampMillis(draftSettings, draftGps, Date.now());

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto">
      <div className="bg-[#0D0F14] border border-[#2B3142] rounded-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden my-auto shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-[#14171F] border-b border-[#2B3142]">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={draftSettings.customLogoDataUrl || defaultLogoUrl}
              alt="SHAMAIL PERA Emblem"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-amber-500/80 bg-[#07080B] shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-amber-400 truncate">
                Gallery GPS Camera — Stamp Existing Gallery Photo
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Editor Source: {draftGps.sourceLabel} · Original photo is never modified
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleSelectGalleryFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl border border-amber-500/60 hover:bg-amber-500/15 text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              {sourcePhotoUrl ? 'Change Photo' : 'Pick Gallery Photo'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close Gallery GPS Camera"
              className="w-9 h-9 rounded-xl border border-[#2B3142] hover:bg-[#1B1F2B] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Two-Column Workspace */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Live Watermarked Gallery Photo Preview + Watermark Style Controls */}
            <div className="lg:col-span-6 space-y-4">
              {sourcePhotoUrl ? (
                <div className="rounded-2xl overflow-hidden bg-[#07080B] border border-[#2B3142] flex items-center justify-center min-h-[280px]">
                  <img
                    src={renderedPreview ? renderedPreview.dataUrl : sourcePhotoUrl}
                    alt="Gallery photo with live SHAMAIL PERA GPS watermark"
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[52vh] object-contain"
                  />
                </div>
              ) : (
                <div className="rounded-2xl bg-[#14171F] border border-dashed border-amber-500/50 p-10 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
                    <ImagePlus className="w-7 h-7 text-amber-400" />
                  </div>
                  <div className="space-y-1 max-w-sm mx-auto">
                    <h3 className="text-base font-bold text-slate-100">
                      Select Any Photo From Your Gallery
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Pick any existing photo, assign a Saved Location or drop a pin on Google Maps,
                      set Date &amp; Time, and export a new high-resolution GPS-stamped copy.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <ImagePlus className="w-4 h-4" />
                    Choose Photo from Device
                  </button>
                </div>
              )}

              {/* Branding & Watermark Appearance Card */}
              <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Branding &amp; Watermark Styling
                  </h3>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <span>Show Watermark</span>
                    <input
                      type="checkbox"
                      checked={draftSettings.showWatermark}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          showWatermark: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-300">Organization Name</span>
                    <input
                      type="text"
                      value={draftSettings.organizationName}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          organizationName: e.target.value,
                        }))
                      }
                      placeholder="SHAMAIL PERA"
                      className="w-full min-h-[40px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </label>

                  <div className="flex items-center gap-2">
                    <label className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-[#1B1F2B] hover:bg-[#232938] border border-[#2B3142] text-xs font-medium text-slate-200 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    {draftSettings.customLogoDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftSettings((prev) => ({ ...prev, customLogoDataUrl: null }))
                        }
                        className="min-h-[40px] px-3 rounded-xl border border-[#2B3142] text-xs text-slate-300 hover:text-white cursor-pointer"
                      >
                        Default
                      </button>
                    )}
                  </div>
                </div>

                {/* Layout Style & Text Color */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                  {[
                    { id: WatermarkStyle.ClassicCard, label: 'Classic' },
                    { id: WatermarkStyle.CompactStrip, label: 'Compact' },
                    { id: WatermarkStyle.ModernBanner, label: 'Banner' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setDraftSettings((prev) => ({ ...prev, watermarkStyle: s.id }))
                      }
                      className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        draftSettings.watermarkStyle === s.id
                          ? 'bg-amber-500 text-neutral-950 font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                    {[
                      { id: WatermarkPosition.BottomLeft, label: 'L' },
                      { id: WatermarkPosition.BottomCenter, label: 'C' },
                      { id: WatermarkPosition.BottomRight, label: 'R' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setDraftSettings((prev) => ({ ...prev, watermarkPosition: p.id }))
                        }
                        className={`min-h-[32px] rounded-lg text-xs font-medium cursor-pointer ${
                          draftSettings.watermarkPosition === p.id
                            ? 'bg-amber-500 text-neutral-950 font-bold'
                            : 'text-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                    {[
                      { id: WatermarkTextColor.White, label: 'White' },
                      { id: WatermarkTextColor.Ivory, label: 'Ivory' },
                      { id: WatermarkTextColor.Gold, label: 'Gold' },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setDraftSettings((prev) => ({ ...prev, textColor: c.id }))
                        }
                        className={`min-h-[32px] rounded-lg text-xs font-medium cursor-pointer ${
                          draftSettings.textColor === c.id
                            ? 'bg-amber-500 text-neutral-950 font-bold'
                            : 'text-slate-300'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Opacity</span>
                      <span className="font-mono text-amber-400">
                        {draftSettings.watermarkOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={95}
                      step={5}
                      value={draftSettings.watermarkOpacity}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          watermarkOpacity: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Font Scale</span>
                      <span className="font-mono text-amber-400">
                        {Math.round(draftSettings.fontScale * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={80}
                      max={135}
                      step={5}
                      value={Math.round(draftSettings.fontScale * 100)}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          fontScale: Number(e.target.value) / 100,
                        }))
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-300">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftSettings.showMapThumbnail}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          showMapThumbnail: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    />
                    <span>Map Thumbnail</span>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftSettings.showCoordinates}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          showCoordinates: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    />
                    <span>Lat / Lon</span>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftSettings.showDateTime}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          showDateTime: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    />
                    <span>Date &amp; Time</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column: Location Selection (Interactive Google Map + Saved Locations) + Sequential Date & Time */}
            <div className="lg:col-span-6 space-y-4">
              {/* Location Mode Switcher: New Location (Map) vs Saved Locations */}
              <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-4 space-y-4">
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                  <button
                    type="button"
                    onClick={() => setLocationTab('map')}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      locationTab === 'map'
                        ? 'bg-amber-500 text-neutral-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    New Location (Google Map)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationTab('saved')}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      locationTab === 'saved'
                        ? 'bg-amber-500 text-neutral-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    Saved Locations ({savedLocations.length})
                  </button>
                </div>

                {locationTab === 'map' ? (
                  <div className="space-y-3">
                    {/* Place Search Bar */}
                    {hasMapsApiKey && (
                      <div className="relative">
                        <div className="relative flex items-center">
                          <Search className="w-4 h-4 text-amber-400 absolute left-3 pointer-events-none" />
                          <input
                            type="text"
                            value={placeQuery}
                            onChange={(e) => setPlaceQuery(e.target.value)}
                            placeholder="Search city, street, landmark, or address..."
                            className="w-full min-h-[42px] pl-9 pr-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        {placeSuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-[#14171F] border border-[#2B3142] rounded-xl shadow-xl divide-y divide-[#2B3142] overflow-hidden">
                            {placeSuggestions.map((item) => (
                              <button
                                key={item.placeId}
                                type="button"
                                onClick={() => handleSelectPlacePrediction(item)}
                                className="w-full text-left px-3.5 py-2.5 hover:bg-[#1B1F2B] transition-colors cursor-pointer"
                              >
                                <p className="text-xs font-semibold text-slate-100 truncate">
                                  {item.mainText}
                                </p>
                                {item.secondaryText && (
                                  <p className="text-[11px] text-slate-400 truncate">
                                    {item.secondaryText}
                                  </p>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Interactive Google Map Container */}
                    {hasMapsApiKey ? (
                      <div className="h-[260px] w-full rounded-xl overflow-hidden border border-[#2B3142] bg-[#07080B]">
                        <Map
                          id="gallery-gps-map"
                          mapId="DEMO_MAP_ID"
                          defaultCenter={{ lat: draftGps.latitude, lng: draftGps.longitude }}
                          defaultZoom={15}
                          gestureHandling="greedy"
                          disableDefaultUI={false}
                          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                          onClick={handleMapClick}
                          className="w-full h-full"
                        >
                          <AdvancedMarker
                            position={{ lat: draftGps.latitude, lng: draftGps.longitude }}
                          />
                        </Map>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-400">
                        Configure <span className="font-mono text-amber-300">VITE_GOOGLE_MAPS_API_KEY</span>{' '}
                        to enable interactive map tiles, or enter coordinates and address below.
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400">
                      Tap anywhere on the map to drop a GPS pin and resolve street address
                      automatically.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative flex items-center">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                      <input
                        type="text"
                        value={savedSearchQuery}
                        onChange={(e) => setSavedSearchQuery(e.target.value)}
                        placeholder="Search saved location bookmarks..."
                        className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {filteredBookmarks.length === 0 ? (
                      <div className="p-5 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-center text-xs text-slate-400">
                        No saved locations yet. Save your active location below for instant 1-tap
                        reuse.
                      </div>
                    ) : (
                      <div className="max-h-[230px] overflow-y-auto space-y-2 pr-1">
                        {filteredBookmarks.map((b) => (
                          <div
                            key={b.id}
                            className="p-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] space-y-2"
                          >
                            {renamingId === b.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={renameDraft}
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  className="flex-1 min-h-[34px] px-2.5 rounded-lg bg-[#14171F] border border-amber-500 text-xs text-slate-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSavedLocations(renameSavedLocation(b.id, renameDraft));
                                    setRenamingId(null);
                                  }}
                                  className="px-2.5 min-h-[34px] rounded-lg bg-amber-500 text-neutral-950 text-xs font-bold cursor-pointer"
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleApplySavedBookmark(b)}
                                  className="text-left flex-1 min-w-0 cursor-pointer"
                                >
                                  <p className="text-xs font-bold text-amber-300 truncate">
                                    {b.label}
                                  </p>
                                  <p className="text-[11px] text-slate-300 truncate">
                                    {b.locationTitle}
                                  </p>
                                  <p className="text-[10px] font-mono text-slate-500">
                                    {b.latitude.toFixed(5)}°, {b.longitude.toFixed(5)}°
                                  </p>
                                </button>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleApplySavedBookmark(b)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-[11px] font-bold cursor-pointer"
                                  >
                                    Apply
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Rename ${b.label}`}
                                    onClick={() => {
                                      setRenamingId(b.id);
                                      setRenameDraft(b.label);
                                    }}
                                    className="p-1.5 rounded-lg border border-[#2B3142] text-slate-300 hover:text-white cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${b.label}`}
                                    onClick={() => setSavedLocations(deleteSavedLocation(b.id))}
                                    className="p-1.5 rounded-lg border border-[#2B3142] text-red-400 hover:bg-red-500/10 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Editable Location Details + Save Bookmark */}
                <div className="space-y-2.5 pt-2 border-t border-[#2B3142]">
                  <input
                    type="text"
                    value={headlineInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setHeadlineInput(val);
                      setDraftGps((prev) => ({
                        ...prev,
                        hasFix: true,
                        city: val,
                        district: '',
                        province: '',
                        country: '',
                      }));
                    }}
                    placeholder="Location Title (e.g. Lahore, Punjab, Pakistan)"
                    className="w-full min-h-[38px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />

                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAddressInput(val);
                      setDraftGps((prev) => ({
                        ...prev,
                        hasFix: true,
                        streetAddress: val,
                        isOfflineAddress: false,
                      }));
                    }}
                    placeholder="Full Street / Area Address"
                    className="w-full min-h-[38px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />

                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="number"
                      step="0.000001"
                      value={latInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLatInput(v);
                        const num = Number(v);
                        if (!Number.isNaN(num)) {
                          setDraftGps((prev) => ({
                            ...prev,
                            latitude: Math.max(-90, Math.min(90, num)),
                          }));
                        }
                      }}
                      placeholder="Latitude"
                      className="w-full min-h-[38px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="number"
                      step="0.000001"
                      value={lonInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLonInput(v);
                        const num = Number(v);
                        if (!Number.isNaN(num)) {
                          setDraftGps((prev) => ({
                            ...prev,
                            longitude: Math.max(-180, Math.min(180, num)),
                          }));
                        }
                      }}
                      placeholder="Longitude"
                      className="w-full min-h-[38px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newBookmarkLabel}
                      onChange={(e) => setNewBookmarkLabel(e.target.value)}
                      placeholder="Bookmark name (e.g. Site Office)"
                      className="flex-1 min-h-[38px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCurrentBookmark}
                      className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-xl border border-amber-500/60 hover:bg-amber-500/15 text-amber-300 text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Save Location
                    </button>
                  </div>
                  {bookmarkFeedback && (
                    <p className="text-[11px] text-emerald-400">{bookmarkFeedback}</p>
                  )}
                </div>
              </div>

              {/* Sequential Date & Time Picker Card */}
              <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Date &amp; Time (Calendar &rarr; Clock &rarr; Confirm)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        timestampMode: TimestampMode.AutoDevice,
                        manualTimestampMillis: Date.now(),
                      }))
                    }
                    className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-400" />
                    Now
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerStep('calendar')}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Pick Date &amp; Time
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerStep('clock')}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 rounded-xl bg-[#1B1F2B] border border-[#2B3142] text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Clock
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        is24HourFormat: !prev.is24HourFormat,
                      }))
                    }
                    className="min-h-[42px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs font-mono text-amber-300 cursor-pointer"
                  >
                    {draftSettings.is24HourFormat ? '24H' : '12H AM/PM'}
                  </button>
                </div>

                <p className="text-xs font-mono text-slate-300">
                  Stamp: <span className="text-amber-300">{renderedPreview?.timestampText}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer Export Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-[#14171F] border-t border-[#2B3142]">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 min-h-[44px] rounded-xl border border-[#2B3142] hover:bg-[#1B1F2B] text-xs font-medium text-slate-300 cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={!baseImg || saving}
              onClick={() => handleExportNewPhoto(false)}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl border border-amber-500/60 hover:bg-amber-500/15 text-amber-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              Save to App Gallery
            </button>
            <button
              type="button"
              disabled={!baseImg || saving}
              onClick={() => handleExportNewPhoto(true)}
              className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              Save &amp; Download New Photo
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
