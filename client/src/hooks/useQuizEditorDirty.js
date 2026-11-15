import { useEffect, useMemo } from 'react';
import { serializeQuizEditorSnapshot } from '../utils/quizEditorSnapshot';

/**
 * Compare current form values to the last saved snapshot.
 * @returns {'create' | 'saved' | 'dirty'}
 */
export default function useQuizEditorDirty({ title, questions, quizType, persistedId, snapshot }) {
  const current = useMemo(
    () => serializeQuizEditorSnapshot({ title, questions, quizType }),
    [title, questions, quizType]
  );

  const dirty = Boolean(persistedId) && snapshot != null && current !== snapshot;
  const mode = !persistedId ? 'create' : dirty ? 'dirty' : 'saved';

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return { mode, dirty, current };
}
