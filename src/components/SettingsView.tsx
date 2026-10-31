import { ChangeEvent } from 'react';
import {
  Camera,
  FolderOpen,
  ImagePlus,
  Lock,
  LogOut,
  MapPin,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import {
  CoordFormat,
  FlashMode,
  GpsData,
  ResolutionPreset,
  WatermarkPosition,
  WatermarkSettings,
  WatermarkSize,
  WatermarkStyle,
  WatermarkTextColor,
} from '../types';
import { WatermarkOverlayPreview } from './WatermarkOverlayPreview';
import { DateTimeEditorPanel } from './DateTimeEditorPanel';

interface SettingsViewProps {
  settings: WatermarkSettings;
  gps: GpsData;
  defaultLogoUrl: string;
  nowMillis: number;
  rememberUserEnabled: boolean;
  onToggleRememberUser: (enabled: boolean) => void;
  onLogout: () => void;
  onOpenGalleryGps: () => void;
  onChange: (next: WatermarkSettings) => void;
}

export function SettingsView({
  settings,
  gps,
  defaultLogoUrl,
  nowMillis,
  rememberUserEnabled,
  onToggleRememberUser,
  onLogout,
  onOpenGalleryGps,
  onChange,
}: SettingsViewProps) {
  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange({
          ...settings,
          customLogoDataUrl: reader.result,
          showLogo: true,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-7">
      {/* Header Bar with Logout */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2B3142] pb-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            Authenticated Administrator Session
          </span>
          <h1 className="text-xl font-bold text-slate-100 mt-0.5">
            Professional Camera &amp; Watermark Settings
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure security, CameraX defaults, GPS coordinates, sequential timestamps, SHAMAIL
            PERA watermark styling, and storage.
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-300 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Logout Settings
        </button>
      </div>

      {/* Live Watermark Preview Card */}
      <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-amber-400">Live Watermark Preview</span>
          <span className="text-slate-400 font-mono tabular-nums">
            Style: {settings.watermarkStyle} · Opacity {settings.watermarkOpacity}% · Font{' '}
            {Math.round(settings.fontScale * 100)}%
          </span>
        </div>
        <div className="bg-[#07080B] border border-[#2B3142] rounded-xl p-3">
          {settings.showWatermark ? (
            <WatermarkOverlayPreview
              settings={settings}
              gps={gps}
              defaultLogoUrl={defaultLogoUrl}
              nowMillis={nowMillis}
            />
          ) : (
            <p className="text-xs text-slate-400 text-center py-4">
              Watermark overlay is currently turned OFF. Enable &ldquo;Show Watermark&rdquo; below
              to preview.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Categories A, B, C, F */}
        <div className="space-y-6">
          {/* Category A: Account & Security */}
          <section className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-slate-100">A. Account &amp; Security</h2>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0D0F14] border border-[#2B3142] flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-200">Protected Settings Access</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Session verified via PBKDF2-HMAC-SHA256 key derivation
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
                Unlocked
              </span>
            </div>

            <label className="flex items-center justify-between py-1 min-h-[42px] cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-200 block">Remember User</span>
                <span className="text-[11px] text-slate-400">
                  Keep Settings unlocked without re-entering credentials
                </span>
              </div>
              <input
                type="checkbox"
                checked={rememberUserEnabled}
                onChange={(e) => onToggleRememberUser(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </label>

            <button
              type="button"
              onClick={onLogout}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[42px] rounded-xl border border-[#2B3142] hover:border-red-500/50 hover:bg-red-500/10 text-xs font-semibold text-red-300 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out &amp; Lock Settings Now
            </button>
          </section>

          {/* Category B: Camera Settings */}
          <section className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-slate-100">B. Camera Settings</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="text-xs text-slate-300 block">Default Camera Lens</span>
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                  {(
                    [
                      { id: 'environment', label: 'Rear' },
                      { id: 'user', label: 'Front' },
                    ] as const
                  ).map((lens) => (
                    <button
                      key={lens.id}
                      type="button"
                      onClick={() => onChange({ ...settings, defaultLensFacing: lens.id })}
                      className={`min-h-[36px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        settings.defaultLensFacing === lens.id
                          ? 'bg-amber-500 text-neutral-950 font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {lens.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs text-slate-300 block">Default Flash Mode</span>
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                  {[FlashMode.Auto, FlashMode.On, FlashMode.Off].map((fm) => (
                    <button
                      key={fm}
                      type="button"
                      onClick={() => onChange({ ...settings, defaultFlashMode: fm })}
                      className={`min-h-[36px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        settings.defaultFlashMode === fm
                          ? 'bg-amber-500 text-neutral-950 font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {fm}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs text-slate-300">Photo Capture Resolution</span>
              <select
                value={settings.resolutionPreset}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    resolutionPreset: e.target.value as ResolutionPreset,
                  })
                }
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value={ResolutionPreset.Max}>
                  Maximum Sensor Resolution (Preserve Full Original)
                </option>
                <option value={ResolutionPreset.Fhd}>Full HD (1920 × 1080)</option>
                <option value={ResolutionPreset.Hd}>HD Compact (1280 × 720)</option>
              </select>
            </label>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">JPEG Output Quality</span>
                <span className="font-mono tabular-nums text-amber-400">
                  {settings.jpegQuality}%
                </span>
              </div>
              <input
                type="range"
                min={70}
                max={100}
                step={5}
                value={settings.jpegQuality}
                onChange={(e) => onChange({ ...settings, jpegQuality: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </section>

          {/* Category C: GPS & Location */}
          <section className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-slate-100">C. GPS &amp; Location</h2>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-slate-300 block">GPS Coordinate Display Format</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                <button
                  type="button"
                  onClick={() => onChange({ ...settings, coordFormat: CoordFormat.Decimal })}
                  className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    settings.coordFormat === CoordFormat.Decimal
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Decimal Degrees
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...settings, coordFormat: CoordFormat.Dms })}
                  className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    settings.coordFormat === CoordFormat.Dms
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  DMS (° &apos; &quot;)
                </button>
              </div>
            </div>

            <div className="divide-y divide-[#2B3142]">
              <label className="flex items-center justify-between py-2.5 min-h-[42px] cursor-pointer">
                <span className="text-xs text-slate-200">Automatic Live GPS Location Updates</span>
                <input
                  type="checkbox"
                  checked={settings.autoLocationEnabled}
                  onChange={(e) =>
                    onChange({ ...settings, autoLocationEnabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between py-2.5 min-h-[42px] cursor-pointer">
                <span className="text-xs text-slate-200">Display GPS Accuracy (± Meters)</span>
                <input
                  type="checkbox"
                  checked={settings.showAccuracy}
                  onChange={(e) => onChange({ ...settings, showAccuracy: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between py-2.5 min-h-[42px] cursor-pointer">
                <span className="text-xs text-slate-200">
                  Show Tactical GPS Map Thumbnail on Watermark
                </span>
                <input
                  type="checkbox"
                  checked={settings.showMapThumbnail}
                  onChange={(e) => onChange({ ...settings, showMapThumbnail: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </label>
            </div>
          </section>

          {/* Category F: Gallery & Storage */}
          <section className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-slate-100">F. Gallery &amp; Storage</h2>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs space-y-1">
              <span className="text-slate-400 block">Android Output Directory</span>
              <span className="font-mono text-amber-300 font-semibold">
                Pictures/GpsCamByShamail
              </span>
              <p className="text-[11px] text-slate-500 pt-0.5">
                Original gallery photos are never overwritten; stamped photos save as new JPEGs.
              </p>
            </div>

            <label className="flex items-center justify-between py-1 min-h-[42px] cursor-pointer">
              <div>
                <span className="text-xs text-slate-200 block">
                  Open Review &amp; Customize Screen After Capture
                </span>
                <span className="text-[11px] text-slate-400">
                  When off, shutter saves immediately using active GPS &amp; timestamp settings
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.openEditorAfterCapture}
                onChange={(e) =>
                  onChange({ ...settings, openEditorAfterCapture: e.target.checked })
                }
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </label>

            <button
              type="button"
              onClick={onOpenGalleryGps}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-[#1B1F2B] hover:bg-[#242938] border border-amber-500/50 text-amber-300 text-xs font-bold transition-colors cursor-pointer"
            >
              <ImagePlus className="w-4 h-4 text-amber-400" />
              Open Gallery GPS Camera
            </button>
          </section>
        </div>

        {/* Right Column: Categories D (Date & Time) & E (Watermark Customization) */}
        <div className="space-y-6">
          {/* Category D: Date & Time */}
          <div className="space-y-3">
            <DateTimeEditorPanel
              settings={settings}
              gps={gps}
              nowMillis={nowMillis}
              onChange={onChange}
            />

            <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-300">
                  D. Date Display Pattern on Watermark
                </span>
                <select
                  value={settings.dateFormatPattern}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      dateFormatPattern: e.target.value as WatermarkSettings['dateFormatPattern'],
                    })
                  }
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="dd MMM yyyy">31 Oct 2026 (dd MMM yyyy)</option>
                  <option value="yyyy-MM-dd">2026-10-31 (ISO yyyy-MM-dd)</option>
                  <option value="dd/MM/yyyy">31/10/2026 (dd/MM/yyyy)</option>
                  <option value="EEE, dd MMM yyyy">Sat, 31 Oct 2026 (EEE, dd MMM yyyy)</option>
                </select>
              </label>
            </div>
          </div>

          {/* Category E: Watermark Customization */}
          <section className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-slate-100">E. Watermark Customization</h2>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <span>Show Watermark</span>
                <input
                  type="checkbox"
                  checked={settings.showWatermark}
                  onChange={(e) => onChange({ ...settings, showWatermark: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </label>
            </div>

            {/* Organization Name & Emblem */}
            <label className="block space-y-1.5">
              <span className="text-xs text-slate-300">
                Organization Name (Default: SHAMAIL PERA)
              </span>
              <input
                type="text"
                value={settings.organizationName}
                onChange={(e) => onChange({ ...settings, organizationName: e.target.value })}
                placeholder="SHAMAIL PERA"
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-sm font-semibold text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <img
                src={settings.customLogoDataUrl || defaultLogoUrl}
                alt="SHAMAIL PERA Organization Emblem"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full object-cover border border-amber-500/80 bg-[#07080B]"
              />
              <label className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Upload Logo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              {settings.customLogoDataUrl && (
                <button
                  type="button"
                  onClick={() => onChange({ ...settings, customLogoDataUrl: null })}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl border border-[#2B3142] text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Default Emblem
                </button>
              )}
            </div>

            {/* Watermark Layout Style */}
            <div className="space-y-1.5">
              <span className="text-xs text-slate-300 block">Watermark Layout Style</span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                {[
                  { id: WatermarkStyle.ClassicCard, label: 'Classic Card' },
                  { id: WatermarkStyle.CompactStrip, label: 'Compact Strip' },
                  { id: WatermarkStyle.ModernBanner, label: 'Modern Banner' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ ...settings, watermarkStyle: opt.id })}
                    className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors px-2 truncate cursor-pointer ${
                      settings.watermarkStyle === opt.id
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Color */}
            <div className="space-y-1.5">
              <span className="text-xs text-slate-300 block">Primary Watermark Text Color</span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                {[
                  { id: WatermarkTextColor.White, label: 'Pure White' },
                  { id: WatermarkTextColor.Ivory, label: 'Warm Ivory' },
                  { id: WatermarkTextColor.Gold, label: 'Champagne Gold' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ ...settings, textColor: opt.id })}
                    className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors px-2 truncate cursor-pointer ${
                      settings.textColor === opt.id
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Size & Bottom Position */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="text-xs text-slate-300 block">Card Width</span>
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                  {[
                    { id: WatermarkSize.Small, label: 'Small' },
                    { id: WatermarkSize.Medium, label: 'Medium' },
                    { id: WatermarkSize.Large, label: 'Large' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChange({ ...settings, watermarkSize: opt.id })}
                      className={`min-h-[36px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        settings.watermarkSize === opt.id
                          ? 'bg-amber-500 text-neutral-950 font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs text-slate-300 block">Bottom Alignment</span>
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                  {[
                    { id: WatermarkPosition.BottomLeft, label: 'Left' },
                    { id: WatermarkPosition.BottomCenter, label: 'Center' },
                    { id: WatermarkPosition.BottomRight, label: 'Right' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChange({ ...settings, watermarkPosition: opt.id })}
                      className={`min-h-[36px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        settings.watermarkPosition === opt.id
                          ? 'bg-amber-500 text-neutral-950 font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Opacity & Font Scale Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Card Opacity</span>
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
                    onChange({ ...settings, watermarkOpacity: Number(e.target.value) })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Font Size</span>
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
                    onChange({ ...settings, fontScale: Number(e.target.value) / 100 })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Individual Field Visibility Switches */}
            <div className="divide-y divide-[#2B3142] pt-1">
              {(
                [
                  ['showOrgHeading', 'Organization Heading (SHAMAIL PERA)'],
                  ['showLocationTitle', 'Location Title (City, Province, Country)'],
                  ['showFullAddress', 'Full Street / Area Address'],
                  ['showCoordinates', 'Latitude & Longitude Coordinates'],
                  ['showDateTime', 'Date & Time Stamp'],
                  ['showLogo', 'Circular Organization Emblem'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between py-2.5 min-h-[42px] cursor-pointer"
                >
                  <span className="text-xs text-slate-200">{label}</span>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(e) => onChange({ ...settings, [key]: e.target.checked })}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
