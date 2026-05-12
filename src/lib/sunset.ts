// Sunrise / sunset calculator for Manila (Philippines, UTC+8). Used by
// the optional "Sunset" theme mode in `ThemeContext` — the SPA flips
// itself between light (after sunrise) and dark (after sunset) without
// the visitor having to touch a toggle. Manila's daylight band is the
// only one we care about, so we hard-code the lat/lng instead of
// pulling in a full astronomy library.
//
// The math is the classic NOAA approximation:
//   solar declination  =  23.45° · sin( 2π · (284 + day-of-year) / 365 )
//   hour angle (rad)   =  acos( -tan(lat) · tan(decl) )
// which gives the half-day length in hours when divided by 15°. Solar
// noon is fixed at 12:00 local + a longitude correction. Accurate to
// within a couple of minutes, which is plenty for "should we be in
// light mode right now?".
//
// Returns the next dark→light and light→dark boundaries (Date objects)
// PLUS the current resolved theme. Callers schedule a `setTimeout`
// against the next boundary to re-check.

const MANILA_LAT_DEG = 14.5995;
const MANILA_LON_DEG = 120.9842;
const MANILA_TZ_OFFSET_MIN = 8 * 60; // PHT, no DST

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

// Day of year (1–366), based on the UTC timestamp of the given Date.
// Computed in UTC so server-rendered values (if we ever do SSR) match
// browser values regardless of the visitor's local TZ.
function dayOfYearUtc(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86400000) + 1;
}

interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

/** Sunrise + sunset Date objects for the given calendar day in Manila. */
export function manilaSunTimes(reference: Date = new Date()): SunTimes {
  const day = dayOfYearUtc(reference);
  // Solar declination, degrees → radians.
  const declDeg = 23.45 * Math.sin(toRad((360 / 365) * (284 + day)));
  const decl = toRad(declDeg);
  const lat = toRad(MANILA_LAT_DEG);

  // Hour angle of sunrise / sunset (radians). Clamp acos arg so polar
  // night / midnight sun doesn't NaN — irrelevant for Manila but cheap.
  const cosH = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl)));
  const halfDayHours = toDeg(Math.acos(cosH)) / 15;

  // Local-clock sunrise / sunset minutes from midnight. Manila is +8,
  // longitude ~120.98° — the standard-meridian correction is
  // (120 - 120.98) × 4 ≈ -3.9 min, so solar noon lands at ~11:56 PHT.
  const lonCorrectionMin = (MANILA_LON_DEG - 120) * 4;
  const solarNoonMin = 12 * 60 - lonCorrectionMin;
  const sunriseMin = solarNoonMin - halfDayHours * 60;
  const sunsetMin = solarNoonMin + halfDayHours * 60;

  // Build Date objects pinned to Manila wall-clock time. We work in
  // UTC: PHT midnight is the previous UTC day at 16:00.
  const base = new Date(reference);
  base.setUTCHours(0, 0, 0, 0);
  const manilaMidnightUtc = base.getTime() - MANILA_TZ_OFFSET_MIN * 60000;

  return {
    sunrise: new Date(manilaMidnightUtc + sunriseMin * 60000),
    sunset: new Date(manilaMidnightUtc + sunsetMin * 60000),
  };
}

/**
 * Returns whether it is currently "day" (between sunrise and sunset)
 * in Manila, plus the next boundary at which this answer will flip.
 * Callers schedule a re-check at `nextBoundary` and re-render.
 */
export function manilaIsDaytime(reference: Date = new Date()): {
  isDay: boolean;
  nextBoundary: Date;
} {
  const today = manilaSunTimes(reference);
  if (reference < today.sunrise) {
    // Pre-dawn → still night → flip at today's sunrise.
    return { isDay: false, nextBoundary: today.sunrise };
  }
  if (reference < today.sunset) {
    // Daylight → flip at today's sunset.
    return { isDay: true, nextBoundary: today.sunset };
  }
  // Past today's sunset → night until tomorrow's sunrise.
  const tomorrow = new Date(reference.getTime() + 86400000);
  return { isDay: false, nextBoundary: manilaSunTimes(tomorrow).sunrise };
}
