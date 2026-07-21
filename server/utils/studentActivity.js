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

async function getStudentActivity(query = {}, limit = 20) {
  const identifiers = getStudentIdentifiers(query);
  const studentUid = query.uid ? String(query.uid).trim() : '';
  if (!identifiers.length && !studentUid) return [];

  const [submissionsSnap, participantsSnap, exitSnap] = await Promise.all([
    quizSubmissionsRef().get(),
    spaceParticipantsRef().get(),
    exitResponsesRef().get(),
  ]);

  const activities = [];
  const quizIdsNeedingMeta = new Set();
  const raceIdsNeedingMeta = new Set();

  if (submissionsSnap.exists()) {
    Object.entries(submissionsSnap.val() || {}).forEach(([quizId, participants]) => {
      if (!participants || typeof participants !== 'object') return;
      Object.entries(participants).forEach(([participantId, sub]) => {
        if (!sub || typeof sub !== 'object') return;
        if (!matchesQuizSubmissionRecord(sub, query)) return;

        const when = formatActivityDate(sub.submittedAt);
        const percentage = Number(sub.percentage ?? 0);
        const totalQuestions = Number(sub.totalQuestions ?? 0);
        const correctAnswers =
          sub.correctAnswers != null
            ? Number(sub.correctAnswers)
            : totalQuestions > 0
            ? Math.round((percentage / 100) * totalQuestions)
            : 0;

        const hasSubmissionQuestions = normalizeQuestionsArray(sub.questions).length > 0;
        if (!sub.quizTitle || !hasSubmissionQuestions) {
          quizIdsNeedingMeta.add(quizId);
        }

        activities.push({
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
          _quizIdForMeta: quizId,
        });
      });
    });
  }

  if (participantsSnap.exists()) {
    Object.entries(participantsSnap.val() || {}).forEach(([raceId, participants]) => {
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
      raceIdsNeedingMeta.add(raceId);

      const when = formatActivityDate(matched.joinedAt);
      activities.push({
        id: `race-${raceId}-${matched.participantId}`,
        type: 'spaceRace',
        title: matched.raceTitle || 'Space Race',
        subtitle: `Team ${matched.teamId ?? '—'}`,
        rank: matched.teamId ? `Team ${matched.teamId}` : 'Joined',
        date: when.date,
        time: when.time,
        shortDate: when.shortDate,
        sortKey: when.sortKey,
        _raceIdForMeta: raceId,
      });
    });
  }

  const quizMeta = {};
  const raceMeta = {};
  await Promise.all([
    ...Array.from(quizIdsNeedingMeta).map(async (quizId) => {
      const snap = await quizzesRef().child(quizId).get();
      if (snap.exists()) quizMeta[quizId] = snap.val() || {};
    }),
    ...Array.from(raceIdsNeedingMeta).map(async (raceId) => {
      const snap = await spaceRacesRef().child(raceId).get();
      if (snap.exists()) raceMeta[raceId] = snap.val() || {};
    }),
  ]);

  activities.forEach((item) => {
    if (item.type === 'quiz' && item._quizIdForMeta) {
      const quiz = quizMeta[item._quizIdForMeta] || {};
      if (!item.title || item.title === 'Quiz') {
        item.title = quiz.title || item.title;
      }
      if (!item.quizType) item.quizType = quiz.type || '';
      if (!item.questions?.length) {
        item.questions = normalizeQuestionsArray(quiz.questions);
      }
      delete item._quizIdForMeta;
    }
    if (item.type === 'spaceRace' && item._raceIdForMeta) {
      const race = raceMeta[item._raceIdForMeta] || {};
      if (!item.title || item.title === 'Space Race') {
        item.title = race.title || race.quiz?.title || item.title;
      }
      delete item._raceIdForMeta;
    }
  });

  if (exitSnap.exists()) {
    Object.entries(exitSnap.val() || {}).forEach(([ticketId, responses]) => {
      if (!responses || typeof responses !== 'object') return;
      Object.entries(responses).forEach(([responseId, resp]) => {
        if (!resp || typeof resp !== 'object') return;
        if (!matchesStudentRecord(resp, query)) return;

        const when = formatActivityDate(resp.submittedAt || resp.createdAt);
        activities.push({
          id: `exit-${ticketId}-${responseId}`,
          type: 'exitTicket',
          title: resp.ticketTitle || 'Exit Ticket',
          subtitle: 'Submitted exit ticket',
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

async function getStudentQuizHistory(query = {}, limit = 100) {
  const identifiers = getStudentIdentifiers(query);
  const studentUid = query.uid ? String(query.uid).trim() : '';
  if (!identifiers.length && !studentUid) return [];

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

        const totalQuestions = Number(sub.totalQuestions ?? 0);
        const percentage = Number(sub.percentage ?? 0);
        const correctAnswers =
          sub.correctAnswers != null
            ? Number(sub.correctAnswers)
            : totalQuestions > 0
            ? Math.round((percentage / 100) * totalQuestions)
            : 0;

        rows.push({
          id: `${quizId}-${participantId}-${sub.submittedAt || ''}`,
          quizId,
          participantId,
          name: sub.quizTitle || 'Quiz',
          quizTitle: sub.quizTitle || 'Quiz',
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
