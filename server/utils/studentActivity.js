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

  const [submissionsSnap, participantsSnap, exitSnap, quizzesSnap, racesSnap] = await Promise.all([
    quizSubmissionsRef().get(),
    spaceParticipantsRef().get(),
    exitResponsesRef().get(),
    quizzesRef().get(),
    spaceRacesRef().get(),
  ]);

  const quizzes = quizzesSnap.exists() ? quizzesSnap.val() || {} : {};
  const races = racesSnap.exists() ? racesSnap.val() || {} : {};
  const activities = [];

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
        activities.push({
          id: `quiz-${quizId}-${participantId}`,
          type: 'quiz',
          quizId,
          participantId,
          submittedAt: sub.submittedAt || null,
          title: sub.quizTitle || quizzes[quizId]?.title || 'Quiz',
          subtitle: `${percentage}% score`,
          score: `${percentage}%`,
          correctAnswers,
          totalQuestions,
          percentage,
          timeTaken: sub.timeTaken ?? null,
          answers: sub.answers || {},
          quizType: sub.quizType || quizzes[quizId]?.type || '',
          questions: normalizeQuestionsArray(sub.questions || quizzes[quizId]?.questions),
          date: when.date,
          time: when.time,
          shortDate: when.shortDate,
          sortKey: when.sortKey,
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

      const race = races[raceId] || {};
      const when = formatActivityDate(matched.joinedAt || race.startedAt || race.createdAt);
      activities.push({
        id: `race-${raceId}-${matched.participantId}`,
        type: 'spaceRace',
        title: race.title || race.quiz?.title || 'Space Race',
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

  const [submissionsSnap, quizzesSnap] = await Promise.all([
    quizSubmissionsRef().get(),
    quizzesRef().get(),
  ]);

  const quizzes = quizzesSnap.exists() ? quizzesSnap.val() || {} : {};
  const rows = [];

  if (submissionsSnap.exists()) {
    Object.entries(submissionsSnap.val() || {}).forEach(([quizId, participants]) => {
      if (!participants || typeof participants !== 'object') return;
      Object.entries(participants).forEach(([participantId, sub]) => {
        if (!sub || typeof sub !== 'object') return;
        if (!matchesQuizSubmissionRecord(sub, query)) return;

        const quiz = quizzes[quizId] || {};
        const totalQuestions = Number(sub.totalQuestions ?? quiz.questions?.length ?? 0);
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
          name: sub.quizTitle || quiz.title || 'Quiz',
          quizTitle: sub.quizTitle || quiz.title || 'Quiz',
          quizType: sub.quizType || quiz.type || '',
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
          questions: normalizeQuestionsArray(sub.questions || quiz.questions),
          source: 'server',
        });
      });
    });
  }

  return collapseQuizRows(rows, (row) => row.submittedAt)
    .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
    .slice(0, limit);
}

module.exports = {
  getStudentActivity,
  getStudentQuizHistory,
};
