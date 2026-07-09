import { useEffect, useMemo, useState } from 'react';
import { off, onValue, ref as dbRef } from 'firebase/database';
import { db } from '../firebase';

/**
 * Real-time listeners for quiz_submissions/{quizId} and optionally quiz_participants/{quizId}.
 * Firebase rules allow reads at the per-quiz path only (not the root tree).
 */
export function useQuizSubmissionListeners(quizIds, { listenParticipants = false } = {}) {
  const [submissionsByQuizId, setSubmissionsByQuizId] = useState({});
  const [participantsByQuizId, setParticipantsByQuizId] = useState({});
  const [loading, setLoading] = useState(false);

  const stableIds = useMemo(() => {
    const ids = [...new Set((quizIds || []).filter(Boolean))];
    ids.sort();
    return ids;
  }, [quizIds]);

  const idsKey = stableIds.join(',');

  useEffect(() => {
    if (!idsKey) {
      setSubmissionsByQuizId({});
      setParticipantsByQuizId({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const subsAcc = {};
    const partsAcc = {};
    const unsubs = [];

    stableIds.forEach((quizId) => {
      const subRef = dbRef(db, `quiz_submissions/${quizId}`);
      const unsubSub = onValue(
        subRef,
        (snap) => {
          subsAcc[quizId] = snap.exists() ? snap.val() || {} : {};
          setSubmissionsByQuizId({ ...subsAcc });
          setLoading(false);
        },
        () => {
          subsAcc[quizId] = {};
          setSubmissionsByQuizId({ ...subsAcc });
          setLoading(false);
        }
      );
      unsubs.push(() => {
        try {
          unsubSub();
        } catch {
          off(subRef);
        }
      });

      if (listenParticipants) {
        const partRef = dbRef(db, `quiz_participants/${quizId}`);
        const unsubPart = onValue(
          partRef,
          (snap) => {
            partsAcc[quizId] = snap.exists() ? snap.val() || {} : {};
            setParticipantsByQuizId({ ...partsAcc });
          },
          () => {
            partsAcc[quizId] = {};
            setParticipantsByQuizId({ ...partsAcc });
          }
        );
        unsubs.push(() => {
          try {
            unsubPart();
          } catch {
            off(partRef);
          }
        });
      }
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [idsKey, listenParticipants, stableIds]);

  return { submissionsByQuizId, participantsByQuizId, loading };
}
