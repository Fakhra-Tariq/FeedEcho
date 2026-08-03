import { useEffect, useMemo, useRef, useState } from 'react';
import { off, onValue, ref as dbRef } from 'firebase/database';
import { db } from '../firebase';

/** Stable empty list — avoids new array references on every render when using useRtdbList */
export const RTDB_EMPTY_LIST = Object.freeze([]);

const isDev = process.env.NODE_ENV === 'development';

const snapshotsEqual = (prev, next) => {
  if (prev === next) return true;
  if (prev == null || next == null) return false;
  if (typeof prev !== 'object' || typeof next !== 'object') return false;
  try {
    return JSON.stringify(prev) === JSON.stringify(next);
  } catch {
    return false;
  }
};

export function useRtdbValue(path, { enabled = true } = {}) {
  const [value, setValue] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled && path));
  const [error, setError] = useState(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false);
      setValue(null);
      return undefined;
    }

    // Clear stale value immediately when path changes so listeners never show old question state
    setValue(null);
    setLoading(true);
    setError(null);

    const r = dbRef(db, path);
    const unsub = onValue(
      r,
      (snap) => {
        if (!alive.current) return;
        const next = snap.exists() ? snap.val() : null;
        setValue((prev) => (snapshotsEqual(prev, next) ? prev : next));
        setLoading(false);
      },
      (err) => {
        if (!alive.current) return;
        if (isDev) console.error('Firebase listener error:', { path, error: err });
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      try {
        unsub();
      } catch {
        off(r);
      }
    };
  }, [enabled, path]);

  return { value, loading, error };
}

export function useRtdbList(
  path,
  {
    enabled = true,
    sort,
    filter,
    map,
    empty = RTDB_EMPTY_LIST,
  } = {}
) {
  const { value, loading, error } = useRtdbValue(path, { enabled });

  // Keep latest transform fns without re-running useMemo when inline callbacks change identity
  const filterRef = useRef(filter);
  const sortRef = useRef(sort);
  const mapRef = useRef(map);
  filterRef.current = filter;
  sortRef.current = sort;
  mapRef.current = map;

  const list = useMemo(() => {
    if (!value) return empty;
    const entries = typeof value === 'object' ? Object.entries(value) : [];
    let items = entries.map(([id, v]) => ({ ...(v || {}), id }));
    if (typeof filterRef.current === 'function') items = items.filter(filterRef.current);
    if (typeof sortRef.current === 'function') items = items.slice().sort(sortRef.current);
    if (typeof mapRef.current === 'function') items = items.map(mapRef.current);
    return items;
  }, [value, empty]);

  return { list, loading, error };
}
