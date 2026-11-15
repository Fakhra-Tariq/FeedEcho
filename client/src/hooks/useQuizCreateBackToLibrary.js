import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const QUIZ_LIBRARY_PATH = '/host/library';
const LIBRARY_PATH = QUIZ_LIBRARY_PATH;

/** Replace the editor with Library so Back does not return to a stale form. */
export function useGoToQuizLibrary() {
  const navigate = useNavigate();
  return useCallback(() => {
    navigate(QUIZ_LIBRARY_PATH, { replace: true });
  }, [navigate]);
}

/**
 * Browser Back from a quiz creation page always lands on Library.
 * Does not push an extra entry when history already has a previous page.
 */
export default function useQuizCreateBackToLibrary() {
  const navigate = useNavigate();

  useEffect(() => {
    const historyIdx = window.history.state?.idx;
    if (historyIdx === 0) {
      const current = `${window.location.pathname}${window.location.search}`;
      const state = window.history.state || {};
      window.history.replaceState({ ...state, idx: 0 }, '', LIBRARY_PATH);
      window.history.pushState({ ...state, idx: 1 }, '', current);
    }

    const onPopState = () => {
      if (window.location.pathname.startsWith('/create/')) return;
      navigate(LIBRARY_PATH, { replace: true });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigate]);
}
