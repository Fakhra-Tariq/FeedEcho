import { useCallback, useEffect, useState } from 'react';
import { studentsAPI } from '../services/api';
import { getStudentQueryParams } from '../utils/audienceSession';

const activityCacheKey = (student, limit) => {
  const id = student?.uid || student?.email || student?.name || 'anon';
  return `feedecho_stu_activity_${id}_${limit}`;
};

const readActivityCache = (student, limit) => {
  try {
    const raw = sessionStorage.getItem(activityCacheKey(student, limit));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed.items : null;
  } catch {
    return null;
  }
};

const writeActivityCache = (student, limit, items) => {
  try {
    sessionStorage.setItem(
      activityCacheKey(student, limit),
      JSON.stringify({ t: Date.now(), items })
    );
  } catch {
    // ignore quota
  }
};

/**
 * Loads student activity from the API and refreshes on focus / visibility.
 */
export function useAudienceLiveActivity(student, limit = 50) {
  const [items, setItems] = useState(() => (student ? readActivityCache(student, limit) || [] : []));
  const [loading, setLoading] = useState(() => {
    if (!student) return false;
    return !readActivityCache(student, limit);
  });

  const loadActivity = useCallback(async (opts = {}) => {
    const silent = opts?.silent === true;
    if (!student) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (!silent) {
      const cached = readActivityCache(student, limit);
      if (cached) {
        setItems(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    try {
      const response = await studentsAPI.getActivity({
        ...getStudentQueryParams(student),
        limit,
      });
      const next = response.data?.data || [];
      setItems(next);
      writeActivityCache(student, limit, next);
    } catch (error) {
      console.error('Failed to load student activity:', error);
      if (!silent && !readActivityCache(student, limit)) setItems([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [student, limit]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (!student) return undefined;

    const onFocus = () => loadActivity({ silent: true });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadActivity({ silent: true });
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [student, loadActivity]);

  return { items, loading, reload: loadActivity };
}
