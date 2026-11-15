import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const QUIZ_LIBRARY_PATH = '/host/library';

/** Replace the editor with Library so Back does not return to a stale form. */
export function useGoToQuizLibrary() {
  const navigate = useNavigate();
  return useCallback(() => {
    navigate(QUIZ_LIBRARY_PATH, { replace: true });
  }, [navigate]);
}

/**
 * After a successful Save (mode === 'saved' only), browser / gesture Back
 * replace-navigates to Quiz Library so the editor is not left in history.
 * Save itself must not navigate. Unsaved / dirty Back is unchanged.
 *
 * @param {boolean} saved  true when useQuizEditorDirty mode is 'saved'
 */
export default function useQuizCreateBackToLibrary(saved) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!saved) return undefined;

    window.history.pushState({ feedechoQuizEditorSaved: true }, '');
    let consumedByBack = false;

    const onPopState = () => {
      consumedByBack = true;
      navigate(QUIZ_LIBRARY_PATH, { replace: true });
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Drop the sentinel so Save-then-edit (dirty) Back still uses normal history.
      if (!consumedByBack && window.history.state?.feedechoQuizEditorSaved) {
        window.history.back();
      }
    };
  }, [saved, navigate]);
}
