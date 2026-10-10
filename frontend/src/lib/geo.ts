/**
 * Client-side locale detection helpers used to prefill address forms.
 *
 * The country is resolved from the device timezone first (the most reliable
 * signal available without a network request) and falls back to the browser
 * locale. Nothing here sends data anywhere; it only reads local device settings.
 */

import { getCountriesForTimezone } from 'countries-and-timezones';



/** A country option as used by address selects. */
export type GeoOption = { code: string; name: string };

/** Best-effort ISO country code from the device timezone, e.g. `Asia/Kolkata` → `IN`. */
export const detectCountryCode = (): string | null => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return null;
    const [match] = getCountriesForTimezone(timezone);
    return match?.id ?? null;
  } catch {
    return null;
  }
};

/** Fallback: country from the browser locale, e.g. `en-IN` → `IN`. */
export const detectCountryCodeFromLocale = (): string | null => {
  try {
    const region = new Intl.Locale(navigator.language).region;
    return region ?? null;
  } catch {
    // Older engines: parse the trailing region from a tag like `en-IN`.
    const match = /^[a-z]{2,3}-([A-Z]{2})$/.exec(navigator.language);
    return match?.[1] ?? null;
  }
};

/** Resolves the most likely device country: timezone first, then locale. */
export const detectDeviceCountry = (): { code: string; name: string } | null => {
  const code = detectCountryCode() ?? detectCountryCodeFromLocale();
  if (!code) return null;
  try {
    // Region names come from the browser's own display names.
    const name = new Intl.DisplayNames([navigator.language], { type: 'region' }).of(code);
    if (!name) return null;
    return { code, name };
  } catch {
    return null;
  }
};

/**
 * One or two letter region hint from the locale, e.g. `en-IN` → `IN` used to
 * pick a default state when the country list contains multiple matches. This
 * is intentionally weak — the state select always shows the full list.
 */
export const detectRegionHint = (): string | null => {
  try {
    return new Intl.Locale(navigator.language).region ?? null;
  } catch {
    return null;
  }
};

/* ------------------------------------------------- device location helpers */

export interface DevicePosition {
  coords: { latitude: number; longitude: number };
}

export interface ReverseGeocodeResult {
  postalCode?: string;
  city?: string;
  state?: string;
  countryName?: string;
}

const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const readJson = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const data: unknown = await response.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/**
 * Requests the device position. The browser shows its own permission prompt;
 * the rejection messages are written for a non-technical user.
 */
export const requestDevicePosition = (): Promise<DevicePosition> =>
  new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Your browser does not support location services. Please type the address manually.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ coords: { latitude: position.coords.latitude, longitude: position.coords.longitude } }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('Location permission was denied. Allow it in your browser or type the address manually.'));
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error('Your location is unavailable right now. Please type the address manually.'));
        } else {
          reject(new Error('Getting your location took too long. Please try again or type the address manually.'));
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5 * 60_000 },
    );
  });

/**
 * Reverse geocodes coordinates into address parts using free, key-less,
 * CORS-enabled services. BigDataCloud's client endpoint is first (built for
 * browser use); OpenStreetMap Nominatim is the fallback.
 */
export const reverseGeocode = async (latitude: number, longitude: number): Promise<ReverseGeocodeResult> => {
  const bigData = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
  ).catch(() => null);
  if (bigData?.ok) {
    const data = await readJson(bigData);
    const result = {
      postalCode: asText(data.postcode),
      city: asText(data.city) ?? asText(data.locality),
      state: asText(data.principalSubdivision),
      countryName: asText(data.countryName),
    };
    if (result.postalCode || result.city || result.state) return result;
  }

  const nominatim = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
  ).catch(() => null);
  if (nominatim?.ok) {
    const data = await readJson(nominatim);
    const address = (data.address && typeof data.address === 'object' ? data.address : {}) as Record<string, unknown>;
    const result = {
      postalCode: asText(address.postcode),
      city: asText(address.city) ?? asText(address.town) ?? asText(address.village) ?? asText(address.suburb),
      state: asText(address.state),
      countryName: asText(address.country),
    };
    if (result.postalCode || result.city || result.state) return result;
  }

  throw new Error('We could not read an address from your location. Please enter it manually.');
};

/* ------------------------------------------------------ city autocomplete */

export interface CitySuggestion {
  name: string;
  /** Human-readable context shown under the city, e.g. `Maharashtra, India`. */
  context: string;
  /** Postal code reported for the place, when the geocoder provides one. */
  postalCode?: string;
}

interface NominatimSearchItem {
  name?: unknown;
  address?: unknown;
  display_name?: unknown;
}

const readAddressDict = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/**
 * City suggestions for the address form, backed by OpenStreetMap Nominatim
 * (free, key-less). The query combines the typed prefix with the selected
 * state and country so results are locally relevant, not global.
 */
export const fetchCitySuggestions = async (
  query: string,
  context: { state?: string; countryName?: string; countryCode?: string },
): Promise<CitySuggestion[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const parts = [trimmed, context.state, context.countryName].filter(Boolean);
  const params = new URLSearchParams({
    q: parts.join(', '),
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    // Encourage locality-level results rather than streets or buildings.
    featureType: 'city',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`).catch(() => null);
  if (!response?.ok) return [];

  const data: unknown = await response.json().catch(() => null);
  if (!Array.isArray(data)) return [];

  const suggestions: CitySuggestion[] = [];
  const seen = new Set<string>();
  for (const raw of data) {
    const item = readAddressDict(raw as NominatimSearchItem);
    const address = readAddressDict(item.address);
    const name =
      asText(address.city) ?? asText(address.town) ?? asText(address.village) ?? asText(item.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const itemState = asText(address.state);
    const itemCountry = asText(address.country);
    suggestions.push({
      name,
      context: [itemState ?? context.state, itemCountry ?? context.countryName].filter(Boolean).join(', '),
      postalCode: asText(address.postcode),
    });
  }
  return suggestions.slice(0, 6);
};

