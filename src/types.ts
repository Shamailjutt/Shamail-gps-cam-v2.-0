export enum TimestampMode {
  AutoDevice = 'AUTO_DEVICE',
  GpsFix = 'GPS_FIX',
  Manual = 'MANUAL',
}

export enum LocationSource {
  LiveGps = 'LIVE_GPS',
  SavedLocation = 'SAVED_LOCATION',
  ManualMap = 'MANUAL_MAP',
}

export enum WatermarkSize {
  Small = 'SMALL',
  Medium = 'MEDIUM',
  Large = 'LARGE',
}

export enum WatermarkPosition {
  BottomLeft = 'BOTTOM_LEFT',
  BottomCenter = 'BOTTOM_CENTER',
  BottomRight = 'BOTTOM_RIGHT',
}

export enum WatermarkStyle {
  ClassicCard = 'CLASSIC_CARD',
  CompactStrip = 'COMPACT_STRIP',
  ModernBanner = 'MODERN_BANNER',
}

export enum WatermarkTextColor {
  White = 'WHITE',
  Ivory = 'IVORY',
  Gold = 'GOLD',
}

export enum CoordFormat {
  Decimal = 'DECIMAL',
  Dms = 'DMS',
}

export enum ResolutionPreset {
  Max = 'MAX',
  Fhd = 'FHD',
  Hd = 'HD',
}

export enum FlashMode {
  Auto = 'AUTO',
  On = 'ON',
  Off = 'OFF',
}

export interface GpsData {
  hasFix: boolean;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  gpsTimestampMillis: number;
  city: string;
  district: string;
  province: string;
  country: string;
  streetAddress: string;
  isOfflineAddress: boolean;
  sourceLabel: string;
  locationSource?: LocationSource;
}

export interface SavedLocationBookmark {
  id: string;
  label: string;
  locationTitle: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  createdAtMillis: number;
}

export interface WatermarkSettings {
  organizationName: string;
  customLogoDataUrl: string | null;
  timestampMode: TimestampMode;
  manualTimestampMillis: number;
  is24HourFormat: boolean;
  dateFormatPattern: 'dd MMM yyyy' | 'yyyy-MM-dd' | 'dd/MM/yyyy' | 'EEE, dd MMM yyyy';
  showWatermark: boolean;
  watermarkSize: WatermarkSize;
  watermarkOpacity: number;
  fontScale: number;
  watermarkPosition: WatermarkPosition;
  watermarkStyle: WatermarkStyle;
  textColor: WatermarkTextColor;
  showOrgHeading: boolean;
  showLocationTitle: boolean;
  showFullAddress: boolean;
  showCoordinates: boolean;
  showDateTime: boolean;
  showAccuracy: boolean;
  showLogo: boolean;
  showMapThumbnail: boolean;
  coordFormat: CoordFormat;
  resolutionPreset: ResolutionPreset;
  jpegQuality: number;
  defaultFlashMode: FlashMode;
  defaultLensFacing: 'environment' | 'user';
  autoLocationEnabled: boolean;
  openEditorAfterCapture: boolean;
}

export interface CapturedPhoto {
  id: string;
  fileName: string;
  dataUrl: string;
  rawBaseDataUrl?: string;
  gpsSnapshot?: GpsData;
  width: number;
  height: number;
  capturedDeviceMillis: number;
  displayedTimestampText: string;
  isEditedTimestamp: boolean;
  timestampMode: TimestampMode;
  organizationName: string;
  locationHeadline: string;
  coordinatesText: string;
  accuracyMeters: number;
  isGalleryExport?: boolean;
}

export interface ApkArtifactEntry {
  fileName: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  signed?: boolean;
  signatureSchemes?: string[];
}

export interface ApkBuildManifest {
  appName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  targetSdk: number;
  compileSdk: number;
  builtAt: string;
  releaseApk: ApkArtifactEntry;
  debugApk: ApkArtifactEntry;
  sourceZip: ApkArtifactEntry;
}

export interface AndroidSourceFile {
  label: string;
  relPath: string;
  category: string;
  content: string;
}
