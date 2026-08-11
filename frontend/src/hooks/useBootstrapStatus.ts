import { useCallback, useEffect, useState } from 'react';
import { getBootstrapStatus } from '../services/bootstrap';

/**
 * Whether the first ADMIN has been created. Fetched once and cached at module
 * level so the login page, signup page and navigation all agree without
 * hammering the API.
 */
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

async function fetchInitialized(): Promise<boolean> {
  try {
    const status = await getBootstrapStatus();
    cached = status.initialized;
  } catch {
    // Backend unreachable — be conservative: assume already initialized so we
    // never accidentally expose the admin bootstrap flow.
    cached = true;
  }
  return cached;
}

function load(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  if (!inflight) inflight = fetchInitialized().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function useBootstrapStatus(): { initialized: boolean | null; refresh: () => Promise<void> } {
  const [initialized, setInitialized] = useState<boolean | null>(cached);

  useEffect(() => {
    let mounted = true;
    void load().then((value) => {
      if (mounted) setInitialized(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    cached = null;
    const value = await load();
    setInitialized(value);
  }, []);

  return { initialized, refresh };
}

/** Test-only: clears the module-level cache between tests. */
export function __resetBootstrapStatusCache(): void {
  cached = null;
  inflight = null;
}
