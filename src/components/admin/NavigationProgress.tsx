'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Thin gold bar across the top of the viewport that flashes whenever the
 * URL changes. Tracks both pathname and search params — the property
 * switcher on client detail pages navigates via `?property=xxx`, which
 * doesn't change the pathname, so `useSearchParams` is needed too.
 *
 * Caveat: this reacts to URL *commit*, not initiation, so the flash sits
 * just after navigation completes rather than during it. Paired with the
 * route-level `loading.tsx` the skeleton covers the true in-flight window
 * and this bar caps the transition.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${pathname}?${searchParams?.toString() ?? ''}`;

  // Derive "showing" from the URL commit. Comparing with the previous
  // render's key inside the render body is React's sanctioned pattern for
  // reacting to prop changes without a useEffect + setState (which the
  // react-hooks/set-state-in-effect rule rejects).
  const [prevKey, setPrevKey] = useState(key);
  const [showing, setShowing] = useState(false);

  if (key !== prevKey) {
    setPrevKey(key);
    setShowing(true);
  }

  useEffect(() => {
    if (!showing) return;
    const timer = setTimeout(() => setShowing(false), 300);
    return () => clearTimeout(timer);
  }, [showing]);

  if (!showing) return null;

  return (
    <div
      className="bg-brand-gold-400 fixed top-0 right-0 left-0 z-[300] h-0.5 animate-pulse"
      aria-hidden
    />
  );
}
