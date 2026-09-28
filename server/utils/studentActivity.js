const { db } = require('../config/firebase');
const { getStudentIdentifiers } = require('./spaceRaceResourceArchive');

const quizSubmissionsRef = () => db.ref('quiz_submissions');
const spaceParticipantsRef = () => db.ref('space_race_participants');
const exitResponsesRef = () => db.ref('exit_responses');
const quizzesRef = () => db.ref('quizzes');
const spaceRacesRef = () => db.ref('spaceRaces');

const matchesStudent = (recordName, identifiers) => {
  if (!identifiers.length) return false;
  const n = String(recordName || '').toLowerCase().trim();
  if (!n) return false;
  return identifiers.some((id) => n === id || n.includes(id) || id.includes(n));
};

const matchesStudentRecord = (record, query = {}) => {
  const studentUid = query.uid ? String(query.uid).trim() : '';
  const studentEmail = query.email ? String(query.email).toLowerCase().trim() : '';
  const profileName = query.name ? String(query.name).toLowerCase().trim() : '';

  if (record?.studentUid && studentUid) {
    return String(record.studentUid).trim() === studentUid;
  }
  if (record?.studentEmail && studentEmail) {
    return String(record.studentEmail).toLowerCase().trim() === studentEmail;
  }

  if (studentUid || studentEmail) {
    const recordName = String(record?.studentName || record?.name || '').toLowerCase().trim();
    if (!record?.studentUid && !record?.studentEmail && profileName && recordName === profileName) {
      return true;
    }
    return false;
  }

  const identifiers = getStudentIdentifiers(query);
  return matchesStudent(record?.studentName || record?.name, identifiers);
};

/** Quiz submissions: uid/email first; fall back to name for legacy guest rows. */
const matchesQuizSubmissionRecord = (record, query = {}) => {
  const studentUid = query.uid ? String(query.uid).trim() : '';
  const studentEmail = query.email ? String(query.email).toLowerCase().trim() : '';
  const profileName = query.name ? String(query.name).toLowerCase().trim() : '';

  if (record?.studentUid && studentUid) {
    return String(record.studentUid).trim() === studentUid;
  }
  if (record?.studentEmail && studentEmail) {
    return String(record.studentEmail).toLowerCase().trim() === studentEmail;
  }

  const recordName = String(record?.studentName || record?.name || '').toLowerCase().trim();
  const hasStoredIdentity = Boolean(record?.studentUid || record?.studentEmail);

  if (studentUid || studentEmail) {
    if (!hasStoredIdentity) {
      if (profileName && recordName && recordName === profileName) return true;
      const identifiers = getStudentIdentifiers(query);
      if (recordName && matchesStudent(recordName, identifiers)) return true;
    }
    return false;
  }

  const identifiers = getStudentIdentifiers(query);
  return matchesStudent(recordName, identifiers);
};

const normalizeQuestionsArray = (questions) => {
  if (Array.isArray(questions)) return questions;
  if (questions && typeof questions === 'object') {
    return Object.keys(questions)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => questions[k])
      .filter(Boolean);
  }
  return [];
};

const formatActivityDate = (iso) => {
  if (!iso) return { date: '—', time: '—', sortKey: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '—', sortKey: '' };
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    shortDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    sortKey: d.toISOString(),
  };
};

const quizAttemptTimeKey = (quizId, submittedAt) => {
  if (!quizId || !submittedAt) return '';
  const t = new Date(submittedAt).getTime();
  if (Number.isNaN(t)) return '';
  return `quiz-${quizId}-at-${Math.floor(t / 1000)}`;
};

const quizRowRichness = (row) => {
  let score = 0;
  const questions = normalizeQuestionsArray(row?.questions);
  if (
    questions.some(
      (q) =>
        q?.questionText &&
        String(q.questionText).trim() &&
        !/^Question \d+$/i.test(String(q.questionText).trim())
    )
  ) {
    score += 20;
  } else if (questions.length) {
    score += 5;
  }
  if (row?.answers && Object.keys(row.answers).length) score += 3;
  if (row?.timeTaken != null) score += 2;
  if (row?.participantId) score += 1;
  return score;
};

const quizAttemptCollapseKey = (row) => {
  if (row?.quizId && row?.participantId) return `quiz-${row.quizId}-p-${row.participantId}`;
  return quizAttemptTimeKey(row.quizId, row.submittedAt) || row.id || '';
};

const collapseQuizRows = (rows, getSubmittedAt) => {
  const map = new Map();
  rows.forEach((row) => {
    const collapseKey =
      quizAttemptCollapseKey(row) ||
      quizAttemptTimeKey(row.quizId, getSubmittedAt(row)) ||
      (row.quizId && row.participantId ? `quiz-${row.quizId}-p-${row.participantId}` : row.id);

    if (!map.has(collapseKey)) {
      map.set(collapseKey, row);
      return;
    }

    const existing = map.get(collapseKey);
    map.set(
      collapseKey,
      quizRowRichness(row) >= quizRowRichness(existing) ? { ...existing, ...row } : { ...row, ...existing }
    );
  });
  return Array.from(map.values());
};

const historyStudentKey = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[.#$[\]/]/g, '_');

const toQuizActivity = (quizId, participantId, sub) => {
  const when = formatActivityDate(sub.submittedAt);
  const percentage = Number(sub.percentage ?? 0);
  const totalQuestions = Number(sub.totalQuestions ?? 0);
  const correctAnswers =
    sub.correctAnswers != null
      ? Number(sub.correctAnswers)
      : totalQuestions > 0
      ? Math.round((percentage / 100) * totalQuestions)
      : 0;

  return {
    id: `quiz-${quizId}-${participantId}`,
    type: 'quiz',
    quizId,
    participantId,
    submittedAt: sub.submittedAt || null,
    title: sub.quizTitle || 'Quiz',
    subtitle: `${percentage}% score`,
    score: `${percentage}%`,
    correctAnswers,
    totalQuestions,
    percentage,
    timeTaken: sub.timeTaken ?? null,
    answers: sub.answers || {},
    quizType: sub.quizType || '',
    questions: normalizeQuestionsArray(sub.questions),
    date: when.date,
    time: when.time,
    shortDate: when.shortDate,
    sortKey: when.sortKey,
  };
};

async function loadIndexedQuizActivities(studentUid) {
  if (!studentUid) return null;
  const snap = await db.ref(`quiz_submissions_by_student/${studentUid}`).get();
  if (!snap.exists()) return null;

  const rows = [];
  Object.entries(snap.val() || {}).forEach(([quizId, participants]) => {
    if (!participants || typeof participants !== 'object') return;
    Object.entries(participants).forEach(([participantId, sub]) => {
      if (!sub || typeof sub !== 'object') return;
      rows.push(toQuizActivity(quizId, participantId, sub));
    });
  });
  return rows;
}

async function loadIndexedRaceActivities(studentUid, identifiers) {
  const keys = [];
  if (studentUid) keys.push(`uid:${studentUid}`);
  identifiers.forEach((id) => {
    const key = historyStudentKey(id);
    if (key) keys.push(key);
  });
  if (!keys.length) return null;

  const snaps = await Promise.all(
    [...new Set(keys)].map((key) =>
      db.ref(`space_race_student_history/${key}`).get().catch(() => null)
    )
  );

  const byRace = new Map();
  snaps.forEach((snap) => {
    if (!snap || !snap.exists()) return;
    Object.entries(snap.val() || {}).forEach(([raceId, entry]) => {
      if (!entry || typeof entry !== 'object') return;
      const prev = byRace.get(raceId);
      if (!prev || String(entry.joinedAt || '') > String(prev.joinedAt || '')) {
        byRace.set(raceId, { ...entry, raceId });
      }
    });
  });

  if (byRace.size === 0) return null;

  return Array.from(byRace.values()).map((matched) => {
    const when = formatActivityDate(matched.joinedAt || matched.sessionDate);
    return {
      id: `race-${matched.raceId}-${matched.participantId || 'join'}`,
      type: 'spaceRace',
      raceId: matched.raceId,
      sessionDate: matched.sessionDate || null,
      joinedAt: matched.joinedAt || null,
      title: matched.quizName || matched.raceTitle || 'Space Race',
      subtitle: `Team ${matched.teamId ?? '—'}`,
      rank: matched.teamId ? `Team ${matched.teamId}` : 'Joined',
      date: when.date,
      time: when.time,
      shortDate: when.shortDate,
      sortKey: when.sortKey,
    };
  });
}

async function getStudentActivity(query = {}, limit = 20) {
  const identifiers = getStudentIdentifiers(query);
  const studentUid = query.uid ? String(query.uid).trim() : '';
  if (!identifiers.length && !studentUid) return [];

  const includeDetails = String(query.details || '') === '1' || Number(limit) > 20;

  const [indexedQuizzes, indexedRaces, exitSnap] = await Promise.all([
    loadIndexedQuizActivities(studentUid),
    loadIndexedRaceActivities(studentUid, identifiers),
    exitResponsesRef().get(),
  ]);

  const [quizScanSnap, raceScanSnap] = await Promise.all([
    indexedQuizzes || (!studentUid && !includeDetails)
      ? Promise.resolve(null)
      : quizSubmissionsRef().get(),
    indexedRaces ? Promise.resolve(null) : spaceParticipantsRef().get(),
  ]);

  const activities = [];

  if (indexedQuizzes) {
    activities.push(...indexedQuizzes);
  } else if (quizScanSnap && quizScanSnap.exists()) {
    Object.entries(quizScanSnap.val() || {}).forEach(([quizId, participants]) => {
      if (!participants || typeof participants !== 'object') return;
      Object.entries(participants).forEach(([participantId, sub]) => {
        if (!sub || typeof sub !== 'object') return;
        if (!matchesQuizSubmissionRecord(sub, query)) return;
        const row = toQuizActivity(quizId, participantId, sub);
        if (!includeDetails) {
          row.questions = [];
          row.answers = {};
        }
        activities.push(row);
      });
    });
  }

  if (indexedRaces) {
    activities.push(...indexedRaces);
  } else if (raceScanSnap && raceScanSnap.exists()) {
    Object.entries(raceScanSnap.val() || {}).forEach(([raceId, participants]) => {
      if (!participants || typeof participants !== 'object') return;

      let matched = null;
      Object.entries(participants).forEach(([participantId, p]) => {
        if (!p || typeof p !== 'object') return;
        if (!matchesStudentRecord(p, query)) return;
        if (!matched || String(p.joinedAt || '') > String(matched.joinedAt || '')) {
          matched = { ...p, participantId };
        }
      });

      if (!matched) return;

      const when = formatActivityDate(matched.joinedAt);
      activities.push({
        id: `race-${raceId}-${matched.participantId}`,
        type: 'spaceRace',
        raceId,
        sessionDate: null,
        joinedAt: matched.joinedAt || null,
        title: matched.raceTitle || matched.quizName || 'Space Race',
        subtitle: `Team ${matched.teamId ?? '—'}`,
        rank: matched.teamId ? `Team ${matched.teamId}` : 'Joined',
        date: when.date,
        time: when.time,
        shortDate: when.shortDate,
        sortKey: when.sortKey,
      });
    });
  }

  if (exitSnap.exists()) {
    Object.entries(exitSnap.val() || {}).forEach(([ticketId, responses]) => {
      if (!responses || typeof responses !== 'object') return;
      Object.entries(responses).forEach(([responseId, resp]) => {
        if (!resp || typeof resp !== 'object') return;
        if (!matchesStudentRecord(resp, query)) return;

        const submittedAt = resp.submittedAt || resp.createdAt || null;
        const when = formatActivityDate(submittedAt);
        activities.push({
          id: `exit-${ticketId}-${responseId}`,
          type: 'exitTicket',
          ticketId,
          title: resp.ticketTitle || 'Exit Ticket',
          subtitle: 'Submitted exit ticket',
          submittedAt,
          date: when.date,
          time: when.time,
          shortDate: when.shortDate,
          sortKey: when.sortKey,
        });
      });
    });
  }

  const quizActivities = collapseQuizRows(
    activities.filter((item) => item.type === 'quiz'),
    (item) => item.submittedAt || item.sortKey
  );
  const otherActivities = activities.filter((item) => item.type !== 'quiz');

  return [...quizActivities, ...otherActivities]
    .sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)))
    .slice(0, limit);
}

const toQuizHistoryRow = (quizId, participantId, sub) => {
  const totalQuestions = Number(sub.totalQuestions ?? 0);
  const percentage = Number(sub.percentage ?? 0);
  const correctAnswers =
    sub.correctAnswers != null
      ? Number(sub.correctAnswers)
      : totalQuestions > 0
      ? Math.round((percentage / 100) * totalQuestions)
      : 0;

  return {
    id: `${quizId}-${participantId}-${sub.submittedAt || ''}`,
    quizId,
    participantId,
    name: sub.quizTitle || sub.title || 'Quiz',
    quizTitle: sub.quizTitle || sub.title || 'Quiz',
    quizType: sub.quizType || '',
    studentName: sub.studentName || '',
    sessionCode: sub.sessionCode || '',
    status: percentage >= 60 ? 'Passed' : 'Failed',
    submittedAt: sub.submittedAt || null,
    timeTaken: sub.timeTaken ?? null,
    score: correctAnswers,
    correctAnswers,
    totalQuestions,
    percentage,
    points: Number(sub.score ?? 0),
    answers: sub.answers || {},
    questions: normalizeQuestionsArray(sub.questions),
    source: 'server',
  };
};

async function getStudentQuizHistory(query = {}, limit = 100) {
  const identifiers = getStudentIdentifiers(query);
  const studentUid = query.uid ? String(query.uid).trim() : '';
  if (!identifiers.length && !studentUid) return [];

  const indexed = await loadIndexedQuizActivities(studentUid);
  if (indexed && indexed.length) {
    const rows = indexed.map((item) =>
      toQuizHistoryRow(item.quizId, item.participantId, item)
    );
    return collapseQuizRows(rows, (row) => row.submittedAt)
      .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
      .slice(0, limit);
  }

  const submissionsSnap = await quizSubmissionsRef().get();
  const rows = [];
  const quizIdsNeedingMeta = new Set();

  if (submissionsSnap.exists()) {
    Object.entries(submissionsSnap.val() || {}).forEach(([quizId, participants]) => {
      if (!participants || typeof participants !== 'object') return;
      Object.entries(participants).forEach(([participantId, sub]) => {
        if (!sub || typeof sub !== 'object') return;
        if (!matchesQuizSubmissionRecord(sub, query)) return;

        const hasSubmissionQuestions = normalizeQuestionsArray(sub.questions).length > 0;
        if (!sub.quizTitle || !hasSubmissionQuestions) {
          quizIdsNeedingMeta.add(quizId);
        }

        rows.push({
          ...toQuizHistoryRow(quizId, participantId, sub),
          _quizIdForMeta: quizId,
        });
      });
    });
  }

  const quizMeta = {};
  await Promise.all(
    Array.from(quizIdsNeedingMeta).map(async (quizId) => {
      const snap = await quizzesRef().child(quizId).get();
      if (snap.exists()) quizMeta[quizId] = snap.val() || {};
    })
  );

  rows.forEach((row) => {
    const quiz = quizMeta[row._quizIdForMeta] || {};
    if (!row.quizTitle || row.quizTitle === 'Quiz') {
      row.name = quiz.title || row.name;
      row.quizTitle = quiz.title || row.quizTitle;
    }
    if (!row.quizType) row.quizType = quiz.type || '';
    if (!row.totalQuestions) row.totalQuestions = Number(quiz.questions?.length ?? 0);
    if (!row.questions?.length) {
      row.questions = normalizeQuestionsArray(quiz.questions);
    }
    delete row._quizIdForMeta;
  });

  return collapseQuizRows(rows, (row) => row.submittedAt)
    .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
    .slice(0, limit);
}

module.exports = {
  getStudentActivity,
  getStudentQuizHistory,
};
