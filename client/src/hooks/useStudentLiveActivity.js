import { useCallback, useEffect, useState } from 'react';
import { studentsAPI } from '../services/api';
import { getStudentQueryParams } from '../utils/studentSession';

/**
 * Loads student activity from the API and refreshes on focus / visibility.
 */
export function useStudentLiveActivity(student, limit = 50) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(async () => {
    if (!student) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await studentsAPI.getActivity({
        ...getStudentQueryParams(student),
        limit,
      });
      setItems(response.data?.data || []);
    } catch (error) {
      console.error('Failed to load student activity:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [student, limit]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (!student) return undefined;

    const onFocus = () => loadActivity();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadActivity();
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
