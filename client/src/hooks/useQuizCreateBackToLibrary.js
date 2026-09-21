import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const LIBRARY_PATH = '/host/library';

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
