import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { off, onValue, ref as dbRef } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

const TeacherRealtimeSyncContext = createContext(0);

/**
 * Bumps a revision counter when core RTDB trees change so teacher UI can refetch
 * or merge API data without full page reload. Listeners are scoped to teachers only.
 */
export function TeacherRealtimeSyncProvider({ children }) {
  const { user, userProfile } = useAuth();
  const uid = userProfile?.uid || user?.uid;
  const isTeacher = userProfile?.role === 'teacher';
  const [revision, setRevision] = useState(0);
  const debounceRef = useRef(null);

  const bump = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setRevision((r) => r + 1);
      debounceRef.current = null;
    }, 450);
  }, []);

  useEffect(() => {
    if (!uid || !isTeacher) return undefined;

    // activeSession/singleton is handled by TeacherDataContext — omit to avoid duplicate revision bumps
    const paths = ['quizzes', 'exit_tickets', 'spaceRaces', 'chat_sessions'];
    const unsubs = paths.map((p) => {
      const r = dbRef(db, p);
      return onValue(
        r,
        () => bump(),
        () => {
          /* permission or network; ignore */
        }
      );
    });

    return () => {
      unsubs.forEach((unsub, i) => {
        try {
          unsub();
        } catch {
          off(dbRef(db, paths[i]));
        }
      });
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [uid, isTeacher, bump]);

  return (
    <TeacherRealtimeSyncContext.Provider value={revision}>{children}</TeacherRealtimeSyncContext.Provider>
  );
}

export function useTeacherRealtimeRevision() {
  return useContext(TeacherRealtimeSyncContext);
}
