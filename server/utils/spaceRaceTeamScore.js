const { db } = require('../config/firebase');

/** Normalize question ids so q0 / q-0 / "0" compare as the same team answer. */
const normalizeSpaceRaceQuestionKey = (questionId, questionIndex = null) => {
  if (questionId !== undefined && questionId !== null && String(questionId).trim() !== '') {
    const raw = String(questionId).trim();
    const qMatch = raw.match(/^q-?(\d+)$/i);
    if (qMatch) return `q${qMatch[1]}`;
    if (/^\d+$/.test(raw)) return `q${raw}`;
    return raw;
  }
  if (Number.isInteger(questionIndex)) return `q${questionIndex}`;
  return '';
};

const answersIncludeQuestion = (answers, questionId, questionIndex = null) => {
  const target = normalizeSpaceRaceQuestionKey(questionId, questionIndex);
  if (!target || !Array.isArray(answers)) return false;
  return answers.some((a) => {
    if (!a) return false;
    const key = normalizeSpaceRaceQuestionKey(a.questionId, a.questionIndex);
    return key === target;
  });
};

/** Team score out of 100: each correct answer is worth (100 / N), rounded. */
const calculateTeamScoreFromAnswers = (answers, totalQuestions) => {
  const n = Number(totalQuestions) || 0;
  if (n <= 0) return { score: 0, correctCount: 0, pointsPerQuestion: 0 };

  const pointsPerQuestion = 100 / n;
  const seen = new Set();
  let correctCount = 0;

  (Array.isArray(answers) ? answers : []).forEach((ans) => {
    if (!ans) return;
    const key = normalizeSpaceRaceQuestionKey(ans.questionId, ans.questionIndex);
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (ans.isCorrect === true) correctCount += 1;
  });

  return {
    score: Math.round(correctCount * pointsPerQuestion),
    correctCount,
    pointsPerQuestion,
  };
};

const getTeamScoreValue = (rawValue) => {
  if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : 0;
  return Number(rawValue?.score ?? 0) || 0;
};

/** Canonical per-question answers from the team's shared lock nodes. */
const answersFromTeamSelection = (selectionVal) => {
  const answers = [];
  if (!selectionVal || typeof selectionVal !== 'object') return answers;

  Object.entries(selectionVal).forEach(([nodeKey, nodeVal]) => {
    if (!nodeVal || !String(nodeKey).startsWith('question_')) return;
    if (nodeVal.submitted !== true && nodeVal.submitted !== 'true') return;

    const questionId = String(nodeKey).slice('question_'.length);
    answers.push({
      questionId,
      answer: nodeVal.selectedOption ?? nodeVal.answer ?? null,
      isCorrect: nodeVal.isCorrect === true,
      points: Number(nodeVal.points) || 0,
      submittedAt: nodeVal.submittedAt || null,
      submittedBy: nodeVal.submittedBy || null,
      submittedByName: nodeVal.submittedByName || null,
    });
  });

  return answers;
};

const mergeParticipantTeamAnswers = (allParticipants, teamId) => {
  const merged = new Map();
  Object.values(allParticipants || {}).forEach((p) => {
    if (!p || String(p.teamId) !== String(teamId)) return;
    (Array.isArray(p.answers) ? p.answers : []).forEach((ans) => {
      const key = normalizeSpaceRaceQuestionKey(ans?.questionId, ans?.questionIndex);
      if (key && !merged.has(key)) merged.set(key, ans);
    });
  });
  return Array.from(merged.values());
};

/**
 * Authoritative team score: submitted lock nodes first, then merged member answers.
 * Score is calculated once per team from those shared answers.
 */
const getSharedTeamScoreState = async (raceId, teamId, totalQuestions, allParticipants = null) => {
  const selSnap = await db.ref(`space_race_team_selection/${raceId}/team_${teamId}`).get();
  let answers = answersFromTeamSelection(selSnap.val());

  if (answers.length === 0 && allParticipants) {
    answers = mergeParticipantTeamAnswers(allParticipants, teamId);
  }

  return {
    ...calculateTeamScoreFromAnswers(answers, totalQuestions),
    answers,
  };
};

const sanitizeTeamAnswerForMember = (ans, pid) => {
  const row = {
    questionId: ans.questionId,
    answer: ans.answer ?? ans.selectedOption ?? null,
    isCorrect: ans.isCorrect === true,
    points: Number(ans.points) || 0,
    awardedByTeammate:
      ans.submittedBy != null && String(ans.submittedBy) !== ''
        ? String(ans.submittedBy) !== String(pid)
        : true,
  };
  if (ans.submittedAt) row.submittedAt = ans.submittedAt;
  if (ans.submittedBy) row.submittedBy = ans.submittedBy;
  if (ans.submittedByName) row.submittedByName = ans.submittedByName;
  if (Number.isInteger(ans.questionIndex)) row.questionIndex = ans.questionIndex;
  return row;
};

/** RTDB updates that write the same team score + answers to every current member. */
const buildSharedTeamScoreUpdates = ({
  raceId,
  teamId,
  allParticipants,
  score,
  answers,
  lastUpdatedBy = null,
  markCompletedPid = null,
  extraTeamScoreFields = null,
}) => {
  const now = new Date().toISOString();
  const updates = {};

  Object.entries(allParticipants || {}).forEach(([pid, pData]) => {
    if (!pData || String(pData.teamId) !== String(teamId)) return;
    updates[`space_race_participants/${raceId}/${pid}/score`] = score;
    updates[`space_race_participants/${raceId}/${pid}/answers`] = (Array.isArray(answers) ? answers : []).map(
      (ans) => sanitizeTeamAnswerForMember(ans, pid)
    );
    if (markCompletedPid && String(pid) === String(markCompletedPid)) {
      updates[`space_race_participants/${raceId}/${pid}/completedAt`] = now;
    }
  });

  updates[`space_race_team_scores/${raceId}/team_${teamId}`] = {
    score,
    lastUpdatedAt: now,
    ...(lastUpdatedBy ? { lastUpdatedBy } : {}),
    ...(extraTeamScoreFields && typeof extraTeamScoreFields === 'object' ? extraTeamScoreFields : {}),
  };

  return updates;
};

const isTeamQuizTimerExpired = async (raceId, teamId) => {
  if (raceId == null || teamId == null || teamId === '') {
    return { expired: false, timer: null };
  }
  const snap = await db.ref(`space_race_team_timers/${raceId}/team_${teamId}`).get();
  if (!snap.exists()) return { expired: false, timer: null };
  const timer = snap.val() || {};
  if (!timer.endTime) return { expired: false, timer };
  const endMs = new Date(timer.endTime).getTime();
  if (!Number.isFinite(endMs)) return { expired: false, timer };
  return { expired: endMs <= Date.now(), timer };
};

module.exports = {
  normalizeSpaceRaceQuestionKey,
  answersIncludeQuestion,
  calculateTeamScoreFromAnswers,
  getTeamScoreValue,
  answersFromTeamSelection,
  mergeParticipantTeamAnswers,
  getSharedTeamScoreState,
  buildSharedTeamScoreUpdates,
  isTeamQuizTimerExpired,
};
