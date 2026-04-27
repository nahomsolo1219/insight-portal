'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type GeolocationStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'low_accuracy'
  | 'denied'
  | 'unavailable'
  | 'error';

export interface GeolocationCoords {
  lat: number;
  lng: number;
  /** Reading accuracy in meters reported by the browser. */
  accuracy: number;
}

export interface GeolocationState {
  status: GeolocationStatus;
  coords: GeolocationCoords | null;
  error: string | null;
  /**
   * Re-request a position fix. In browsers where the user has hard-denied
   * permission, this will fail instantly with the same `denied` status —
   * there is no programmatic way to re-prompt; the user has to clear the
   * permission via browser settings.
   */
  retry: () => void;
}

/** Anything beyond ~100m on a residential photo isn't useful for the office. */
const ACCURACY_THRESHOLD_METERS = 100;

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  // Accept a recent fix from a previous request on the same page (e.g. if
  // the user retries within 60s of the initial prompt).
  maximumAge: 60_000,
};

/**
 * Single-fix geolocation hook. Fires once on mount, exposes a `retry()` for
 * the UI to call after a permission denial or timeout. Deliberately not
 * `watchPosition` — battery cost is real and the upload screen only needs
 * one coordinate per batch.
 *
 * Status semantics:
 *  - `idle`: pre-mount placeholder (only visible if SSR somehow renders us).
 *  - `requesting`: permission prompt is up or position is being acquired.
 *  - `granted`: fix acquired with accuracy ≤ 100m. Use coords.
 *  - `low_accuracy`: fix acquired but accuracy > 100m. coords are populated
 *      so the UI can hint at the value, but the upload form treats this as
 *      "do not send coords" — a misleading pin is worse than no pin.
 *  - `denied`: permission blocked at the browser level.
 *  - `unavailable`: device has no GPS / Geolocation API missing.
 *  - `error`: timeout or other unexpected failure.
 *
 * SSR safety: the hook starts in `idle` and the request only fires inside
 * `useEffect`, so it won't crash during the server render of a client
 * component shell.
 */
export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [coords, setCoords] = useState<GeolocationCoords | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tracks whether the component is still mounted so async callbacks don't
  // set state on an unmounted instance after the user navigates away.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setError('Geolocation is not available in this browser.');
      setCoords(null);
      return;
    }

    setStatus('requesting');
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!aliveRef.current) return;
        const { latitude, longitude, accuracy } = position.coords;
        const next: GeolocationCoords = {
          lat: latitude,
          lng: longitude,
          accuracy,
        };
        setCoords(next);
        setStatus(accuracy <= ACCURACY_THRESHOLD_METERS ? 'granted' : 'low_accuracy');
      },
      (err) => {
        if (!aliveRef.current) return;
        setCoords(null);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setStatus('denied');
            setError('Location permission denied.');
            break;
          case err.POSITION_UNAVAILABLE:
            setStatus('unavailable');
            setError('Location unavailable on this device.');
            break;
          case err.TIMEOUT:
            setStatus('error');
            setError('Location request timed out.');
            break;
          default:
            setStatus('error');
            setError(err.message || 'Failed to read location.');
        }
      },
      POSITION_OPTIONS,
    );
  }, []);

  // Fire once on mount. `request` is stable (empty deps) so this doesn't
  // re-fire on re-renders.
  useEffect(() => {
    request();
  }, [request]);

  return { status, coords, error, retry: request };
}
