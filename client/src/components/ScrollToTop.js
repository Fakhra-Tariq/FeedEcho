import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const shouldSkipInnerScroller = (el) => {
  if (!el) return true;
  if (el.classList.contains('chat-messages-scroll')) return true;
  if (el.closest('.chat-messages-scroll')) return true;
  if (el.closest('[role="dialog"]')) return true;
  if (el.closest('.fixed.inset-0')) return true;
  return false;
};

const resetWindowAndPageScroll = () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  document.querySelectorAll('main, [data-page-scroll]').forEach((el) => {
    if (!shouldSkipInnerScroller(el)) el.scrollTop = 0;
  });

  document.querySelectorAll('.overflow-y-auto, .overflow-y-scroll, .overflow-auto').forEach((el) => {
    if (!shouldSkipInnerScroller(el)) el.scrollTop = 0;
  });
};

/**
 * Resets window (and page-level overflow containers) to the top on pathname
 * changes. Query-string-only updates, hash/anchor links, chat message lists,
 * and browser Back/Forward (POP) are left alone.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (hash) return;
    if (navigationType === 'POP') return;

    resetWindowAndPageScroll();
    requestAnimationFrame(resetWindowAndPageScroll);
  }, [pathname, hash, navigationType]);

  return null;
}
