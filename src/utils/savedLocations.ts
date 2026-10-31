import { GpsData, LocationSource, SavedLocationBookmark } from '../types';

const SAVED_LOCATIONS_KEY = 'shamail_saved_locations_v2';

export function listSavedLocations(): SavedLocationBookmark[] {
  try {
    const raw = localStorage.getItem(SAVED_LOCATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedLocationBookmark =>
          item &&
          typeof item.id === 'string' &&
          typeof item.label === 'string' &&
          typeof item.latitude === 'number' &&
          typeof item.longitude === 'number'
      )
      .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
  } catch {
    return [];
  }
}

function persistSavedLocations(items: SavedLocationBookmark[]): void {
  try {
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota issues
  }
}

export function addSavedLocation(params: {
  label: string;
  locationTitle: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
}): SavedLocationBookmark {
  const existing = listSavedLocations();
  const created: SavedLocationBookmark = {
    id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: params.label.trim() || params.locationTitle.trim() || 'Saved GPS Location',
    locationTitle:
      params.locationTitle.trim() ||
      `GPS ${params.latitude.toFixed(5)}°, ${params.longitude.toFixed(5)}°`,
    fullAddress:
      params.fullAddress.trim() ||
      `${params.latitude.toFixed(6)}°, ${params.longitude.toFixed(6)}°`,
    latitude: Math.max(-90, Math.min(90, params.latitude)),
    longitude: Math.max(-180, Math.min(180, params.longitude)),
    createdAtMillis: Date.now(),
  };
  persistSavedLocations([created, ...existing]);
  return created;
}

export function renameSavedLocation(id: string, newLabel: string): SavedLocationBookmark[] {
  const trimmed = newLabel.trim();
  const next = listSavedLocations().map((item) =>
    item.id === id && trimmed ? { ...item, label: trimmed } : item
  );
  persistSavedLocations(next);
  return next;
}

export function deleteSavedLocation(id: string): SavedLocationBookmark[] {
  const next = listSavedLocations().filter((item) => item.id !== id);
  persistSavedLocations(next);
  return next;
}

export function bookmarkToGpsData(bookmark: SavedLocationBookmark): GpsData {
  return {
    hasFix: true,
    latitude: bookmark.latitude,
    longitude: bookmark.longitude,
    accuracyMeters: 0,
    gpsTimestampMillis: Date.now(),
    city: bookmark.locationTitle,
    district: '',
    province: '',
    country: '',
    streetAddress: bookmark.fullAddress,
    isOfflineAddress: false,
    sourceLabel: `Saved Location: ${bookmark.label}`,
    locationSource: LocationSource.SavedLocation,
  };
}
