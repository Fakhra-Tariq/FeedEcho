import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** Scroll Home / About / Contact to the top on navbar-style navigation only. */
export function useMarketingPageScrollToTop() {
  const { hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (hash) return;
    if (navigationType === 'POP') return;

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
  }, [hash, navigationType]);
}
