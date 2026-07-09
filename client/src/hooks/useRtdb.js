import { useEffect, useMemo, useRef, useState } from 'react';
import { off, onValue, ref as dbRef } from 'firebase/database';
import { db } from '../firebase';

/** Stable empty list — avoids new array references on every render when using useRtdbList */
export const RTDB_EMPTY_LIST = Object.freeze([]);

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
      return undefined;
    }

    setLoading(true);
    setError(null);

    console.log('🔗 Setting up Firebase listener for path:', path);

    const r = dbRef(db, path);
    const unsub = onValue(
      r,
      (snap) => {
        if (!alive.current) return;
        const next = snap.exists() ? snap.val() : null;
        console.log('📥 Firebase value received:', { path, exists: snap.exists(), value: next });
        setValue((prev) => {
          if (prev === next) return prev;
          if (
            prev != null &&
            next != null &&
            typeof prev === 'object' &&
            typeof next === 'object'
          ) {
            try {
              if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
            } catch {
              // non-serializable snapshot; accept update
            }
          }
          return next;
        });
        setLoading(false);
      },
      (err) => {
        if (!alive.current) return;
        console.error('❌ Firebase listener error:', { path, error: err });
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      console.log('🔌 Cleaning up Firebase listener for path:', path);
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
