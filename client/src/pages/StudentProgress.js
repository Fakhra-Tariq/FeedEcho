import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Home,
  TrendingUp,
  Pencil,
  Clock,
  Award,
  Rocket,
  FileText,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Bot,
  User,
  LogOut,
  ArrowRight,
} from 'lucide-react';
import { useRtdbValue } from '../hooks/useRtdb';
import { useQuizSubmissionListeners } from '../hooks/useQuizSubmissionListeners';
import { studentsAPI } from '../services/api';
import { getStoredStudentSession, getStudentQueryParams } from '../utils/studentSession';
import { matchesStudentRecord } from '../utils/studentIdentifiers';
import {
  reviewQuestionAnswer,
  normalizeQuestionsForScoring,
  extractSubmissionAnswer,
  calculateQuizScore,
} from '../utils/scoringUtils';
import { useStudentLiveActivity } from '../hooks/useStudentLiveActivity';
import { useClickOutside } from '../hooks/useClickOutside';
import { useAuth } from '../contexts/AuthContext';
import StudentAvatar from '../components/StudentAvatar';
import {
  collapseQuizAttemptRows,
  getAttemptKey,
  getQuizActivityDedupeKey,
  getQuizAttemptCollapseKey,
} from '../utils/studentQuizAttempts';

const PASS_THRESHOLD = 60;
const LIKERT_SCORES = {
  'strongly agree': 5,
  agree: 4,
  neutral: 3,
  disagree: 2,
  'strongly disagree': 1,
};
const CONFUSED_PATTERNS = ['confused', 'disagree', 'strongly disagree', 'not sure', "don't understand", 'unclear'];

const formatDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
};

const getActivityDedupeKey = (item) => getQuizActivityDedupeKey(item);

const activityRichnessScore = (item) => {
  if (!item) return 0;
  let score = 0;
  const questions = normalizeQuestionsList(item.questions);
  if (
    questions.some(
      (q) =>
        q?.questionText &&
        q.questionText.trim() &&
        !/^Question \d+$/i.test(String(q.questionText).trim())
    )
  ) {
    score += 20;
  } else if (questions.length) {
    score += 5;
  }
  if (item.timeTaken != null) score += 3;
  if (item.answers && Object.keys(item.answers).length) score += 2;
  return score;
};

const mergeActivityItems = (existing, incoming) => {
  const base = activityRichnessScore(incoming) >= activityRichnessScore(existing) ? incoming : existing;
  const other = base === incoming ? existing : incoming;
  return { ...other, ...base, id: getActivityDedupeKey(base) || getActivityDedupeKey(other) };
};

const extractStudentAnswer = extractSubmissionAnswer;

const formatAnswerDisplay = (value) => {
  if (value == null || value === '') return '—';
  if (value === true) return 'True';
  if (value === false) return 'False';
  const text = String(value).trim();
  if (text.toLowerCase() === 'true') return 'True';
  if (text.toLowerCase() === 'false') return 'False';
  return text;
};

const formatDuration = (seconds) => {
  if (seconds == null || seconds === '' || Number.isNaN(Number(seconds))) return '—';
  const total = Math.max(0, Math.round(Number(seconds)));
  if (total === 0) return '0s';
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
};

const normalizeQuestionsList = (questions) => {
  if (Array.isArray(questions)) return questions;
  if (questions && typeof questions === 'object') {
    return Object.keys(questions)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => questions[k])
      .filter(Boolean);
  }
  return [];
};

const flattenQuizSubmissionsFromMap = (submissionsByQuizId, student) => {
  if (!submissionsByQuizId || typeof submissionsByQuizId !== 'object' || !student) return [];
  const rows = [];
  Object.entries(submissionsByQuizId).forEach(([quizId, participants]) => {
    if (!participants || typeof participants !== 'object') return;
    Object.entries(participants).forEach(([participantId, sub]) => {
      if (!sub || typeof sub !== 'object') return;
      if (!matchesStudentRecord(sub, student, { allowLegacyNameMatch: true })) return;
      rows.push({
        ...sub,
        rowId: `fb-${quizId}-${participantId}-${sub.submittedAt || ''}`,
        quizId,
        participantId: sub.participantId || participantId,
        correctAnswers:
          sub.correctAnswers != null
            ? Number(sub.correctAnswers)
            : sub.totalQuestions && sub.percentage != null
            ? Math.round((Number(sub.percentage) / 100) * Number(sub.totalQuestions))
            : Number(sub.score ?? 0),
        source: 'firebase',
      });
    });
  });
  return rows;
};

const flattenSpaceRaceParticipations = (tree, student) => {
  if (!tree || typeof tree !== 'object' || !student) return [];
  const rows = [];
  Object.entries(tree).forEach(([raceId, participants]) => {
    if (!participants || typeof participants !== 'object') return;
    Object.entries(participants).forEach(([participantId, p]) => {
      if (!p || typeof p !== 'object') return;
      if (!matchesStudentRecord(p, student, { allowLegacyNameMatch: true })) return;
      rows.push({ ...p, raceId, participantId });
    });
  });
  return rows;
};

const flattenExitResponses = (tree, student) => {
  if (!tree || typeof tree !== 'object' || !student) return [];
  const rows = [];
  Object.entries(tree).forEach(([ticketId, responses]) => {
    if (!responses || typeof responses !== 'object') return;
    Object.entries(responses).forEach(([responseId, resp]) => {
      if (!resp || typeof resp !== 'object') return;
      if (!matchesStudentRecord(resp, student, { allowLegacyNameMatch: true })) return;
      rows.push({ ...resp, ticketId, responseId });
    });
  });
  return rows;
};

const getCorrectAnswerText = (question, quizType) => {
  if (!question) return '—';
  const type = (quizType || question.type || '').toLowerCase();
  if (type.includes('multiple')) {
    const opt = question.options?.find((o) => o?.isCorrect);
    if (opt) return typeof opt === 'string' ? opt : opt.text;
    const idx = question.options?.findIndex((o) => o?.isCorrect);
    if (idx >= 0 && question.options[idx]) {
      const o = question.options[idx];
      return typeof o === 'string' ? o : o.text;
    }
  }
  if (type.includes('true')) {
    const ca = question.correctAnswer;
    if (ca === true || String(ca).toLowerCase() === 'true') return 'True';
    if (ca === false || String(ca).toLowerCase() === 'false') return 'False';
    return ca ?? '—';
  }
  return question.sampleAnswer || question.correctAnswer || '—';
};

const likertToScore = (answer) => {
  const key = String(answer || '').toLowerCase().trim();
  return LIKERT_SCORES[key] ?? null;
};

const isConfusedAnswer = (answer) => {
  const a = String(answer || '').toLowerCase();
  return CONFUSED_PATTERNS.some((p) => a.includes(p));
};

const ScoreTrendChart = ({ data, rangeDays }) => {
  const width = 600;
  const height = 220;
  const pad = { top: 20, right: 20, bottom: 36, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (!data.length) {
    return (
      <p className="text-sm text-gray-600 text-center py-12">No quiz scores in this period yet.</p>
    );
  }

  const points = data.map((d, i) => ({
    x: pad.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
    y: pad.top + innerH - (d.avgScore / 100) * innerH,
    label: d.label,
    value: d.avgScore,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label={`Score trend last ${rangeDays} days`}>
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = pad.top + innerH - (tick / 100) * innerH;
        return (
          <g key={tick}>
            <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-[10px]">
              {tick}%
            </text>
          </g>
        );
      })}
      <path d={linePath} fill="none" stroke="#6D415F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#6D415F" />
          <text x={p.x} y={height - 10} textAnchor="middle" className="fill-gray-600 text-[9px]">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

export default function StudentProgress() {
  const navigate = useNavigate();
  const { studentLogout } = useAuth();
  const [student, setStudent] = useState(null);
  const [userName, setUserName] = useState('');
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [chartRange, setChartRange] = useState(7);
  const [localSubmissions, setLocalSubmissions] = useState([]);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const profileDropdownRef = useRef(null);
  const closeProfileDropdown = useCallback(() => {
    setShowProfileDropdown(false);
  }, []);
  useClickOutside(profileDropdownRef, closeProfileDropdown, showProfileDropdown);
  const [showChatbot, setShowChatbot] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      text: "Hi Student! I'm your AI Study Assistant. I can help you with practice questions, explain topics you missed, or help you prepare for quizzes. What would you like to work on today?",
      sender: 'ai',
      timestamp: '10:30 AM'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const { items: activityHistory } = useStudentLiveActivity(student, 200);
  const [hiddenActivityIds, setHiddenActivityIds] = useState([]);
  const [viewModal, setViewModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [serverQuizRows, setServerQuizRows] = useState([]);
  const [loadingServerQuizRows, setLoadingServerQuizRows] = useState(true);

  const { value: quizzesTree } = useRtdbValue('quizzes');
  const { value: spaceParticipantsTree } = useRtdbValue('space_race_participants');
  const { value: spaceRacesTree } = useRtdbValue('spaceRaces');
  const { value: exitResponsesTree } = useRtdbValue('exit_responses');
  const { value: exitQuestionsTree } = useRtdbValue('exit_questions');

  const trackedQuizIds = useMemo(() => {
    const ids = new Set();
    serverQuizRows.forEach((row) => row.quizId && ids.add(row.quizId));
    localSubmissions.forEach((row) => row.quizId && ids.add(row.quizId));
    return [...ids];
  }, [serverQuizRows, localSubmissions]);

  const { submissionsByQuizId } = useQuizSubmissionListeners(trackedQuizIds);

  const refreshLocalSubmissions = useCallback(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('quizSubmissions') || '[]');
      setLocalSubmissions(Array.isArray(raw) ? raw : []);
    } catch {
      setLocalSubmissions([]);
    }
  }, []);

  useEffect(() => {
    const loggedInStudent = getStoredStudentSession();
    if (!loggedInStudent) {
      navigate('/student/auth');
      return;
    }
    setStudent(loggedInStudent);
    setUserName(loggedInStudent.name || localStorage.getItem('feedecho_name') || 'Student');
    refreshLocalSubmissions();
  }, [navigate, refreshLocalSubmissions]);

  useEffect(() => {
    if (!student) {
      setServerQuizRows([]);
      setLoadingServerQuizRows(false);
      return;
    }

    let cancelled = false;
    setLoadingServerQuizRows(true);
    studentsAPI
      .getQuizHistory({ ...getStudentQueryParams(student), limit: 200 })
      .then((response) => {
        if (!cancelled) {
          setServerQuizRows(Array.isArray(response.data?.data) ? response.data.data : []);
        }
      })
      .catch(() => {
        if (!cancelled) setServerQuizRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingServerQuizRows(false);
      });

    return () => {
      cancelled = true;
    };
  }, [student]);

  useEffect(() => {
    if (!student || !Object.keys(submissionsByQuizId).length) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      studentsAPI
        .getQuizHistory({ ...getStudentQueryParams(student), limit: 200 })
        .then((response) => {
          if (!cancelled) {
            setServerQuizRows(Array.isArray(response.data?.data) ? response.data.data : []);
          }
        })
        .catch(() => {});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [student, submissionsByQuizId]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'quizSubmissions') refreshLocalSubmissions();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshLocalSubmissions]);

  const firebaseQuizRows = useMemo(
    () => flattenQuizSubmissionsFromMap(submissionsByQuizId, student),
    [submissionsByQuizId, student]
  );

  const localQuizRows = useMemo(() => {
    return localSubmissions
      .filter((s) => matchesStudentRecord(s, student, { allowLegacyNameMatch: true }))
      .map((s, idx) => {
        const totalQuestions = s.totalQuestions ?? 0;
        const percentage = s.percentage ?? (totalQuestions ? Math.round((s.score / totalQuestions) * 100) : 0);
        const correctAnswers =
          totalQuestions && percentage != null
            ? Math.round((percentage / 100) * totalQuestions)
            : Number(s.score ?? 0);
        return {
          ...s,
          rowId: `local-${idx}-${s.submittedAt || idx}`,
          quizId: s.quizId,
          correctAnswers,
          source: 'local',
          percentage,
          score: correctAnswers,
          totalQuestions,
        };
      });
  }, [localSubmissions, student]);

  const apiQuizRows = useMemo(
    () =>
      serverQuizRows.map((row) => ({
        ...row,
        rowId: `api-${row.quizId}-${row.participantId}-${row.submittedAt || ''}`,
        quizTitle: row.quizTitle || row.name,
        source: row.source || 'server',
      })),
    [serverQuizRows]
  );

  const allQuizAttempts = useMemo(() => {
    return collapseQuizAttemptRows([...firebaseQuizRows, ...localQuizRows, ...apiQuizRows]).sort(
      (a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)
    );
  }, [firebaseQuizRows, localQuizRows, apiQuizRows]);

  const buildQuizActivityItem = useCallback(
    (row) => {
      const submittedAt = row.submittedAt;
      const dt = formatDateTime(submittedAt);
      const [date, time] = dt === '—' ? ['—', '—'] : dt.split(' · ');
      const percentage = Number(row.percentage ?? 0);
      return {
        id: getQuizActivityDedupeKey({
          type: 'quiz',
          quizId: row.quizId,
          participantId: row.participantId,
          submittedAt: row.submittedAt,
        }),
        type: 'quiz',
        quizId: row.quizId,
        participantId: row.participantId,
        title: row.quizTitle || quizzesTree?.[row.quizId]?.title || 'Quiz',
        score: `${percentage}%`,
        subtitle: `${percentage}% score`,
        percentage,
        correctAnswers: row.correctAnswers,
        totalQuestions: row.totalQuestions,
        timeTaken: row.timeTaken,
        answers: row.answers || {},
        quizType: row.quizType || quizzesTree?.[row.quizId]?.type || '',
        questions: normalizeQuestionsList(row.questions || quizzesTree?.[row.quizId]?.questions),
        submittedAt,
        date,
        time,
        sortKey: submittedAt || '',
      };
    },
    [quizzesTree]
  );

  const clientActivityHistory = useMemo(() => {
    if (!student) return [];

    const items = allQuizAttempts.map((row) => buildQuizActivityItem(row));

    const latestRaceById = new Map();
    flattenSpaceRaceParticipations(spaceParticipantsTree, student).forEach((p) => {
      const race = spaceRacesTree?.[p.raceId] || {};
      const title = race.title || race.quiz?.title || 'Space Race';
      const when = formatDateTime(p.joinedAt);
      const [date, time] = when === '—' ? ['—', '—'] : when.split(' · ');
      const teamLabel = p.teamId ? `Team ${p.teamId}` : 'Joined';
      const scorePts = Number(p.score);
      const raceItem = {
        id: `race-${p.raceId}`,
        type: 'spaceRace',
        raceId: p.raceId,
        participantId: p.participantId,
        title,
        rank: teamLabel,
        subtitle: teamLabel,
        score: Number.isFinite(scorePts) && scorePts > 0 ? `${scorePts} pts` : null,
        teamId: p.teamId,
        date,
        time,
        sortKey: p.joinedAt || '',
      };
      const existing = latestRaceById.get(p.raceId);
      if (!existing || String(raceItem.sortKey).localeCompare(String(existing.sortKey)) > 0) {
        latestRaceById.set(p.raceId, raceItem);
      }
    });
    latestRaceById.forEach((raceItem) => items.push(raceItem));

    flattenExitResponses(exitResponsesTree, student).forEach((resp) => {
      const when = formatDateTime(resp.submittedAt || resp.createdAt);
      const [date, time] = when === '—' ? ['—', '—'] : when.split(' · ');
      items.push({
        id: `exit-${resp.ticketId}-${resp.responseId}`,
        type: 'exitTicket',
        title: resp.ticketTitle || 'Exit Ticket',
        subtitle: 'Submitted exit ticket',
        date,
        time,
        sortKey: resp.submittedAt || resp.createdAt || '',
      });
    });

    return items.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));
  }, [
    student,
    allQuizAttempts,
    buildQuizActivityItem,
    spaceParticipantsTree,
    spaceRacesTree,
    exitResponsesTree,
  ]);

  const mergedActivityHistory = useMemo(() => {
    const map = new Map();
    const addItem = (item) => {
      if (!item) return;
      const key = getActivityDedupeKey(item) || item.id;
      if (!key) return;
      const normalized = { ...item, id: key };
      if (!map.has(key)) {
        map.set(key, normalized);
        return;
      }
      map.set(key, mergeActivityItems(map.get(key), normalized));
    };

    clientActivityHistory.forEach(addItem);
    activityHistory.forEach(addItem);

    return Array.from(map.values()).sort((a, b) =>
      String(b.sortKey || '').localeCompare(String(a.sortKey || ''))
    );
  }, [activityHistory, clientActivityHistory]);

  const visibleActivityHistory = useMemo(
    () => mergedActivityHistory.filter((item) => !hiddenActivityIds.includes(item.id)),
    [mergedActivityHistory, hiddenActivityIds]
  );

  const summary = useMemo(() => {
    const total = allQuizAttempts.length;
    const avgScore =
      total > 0
        ? Math.round(allQuizAttempts.reduce((sum, q) => sum + (q.percentage ?? 0), 0) / total)
        : 0;
    const totalTimeSeconds = allQuizAttempts.reduce((sum, q) => sum + (Number(q.timeTaken) || 0), 0);

    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const thisWeek = allQuizAttempts.filter((q) => now - new Date(q.submittedAt || 0).getTime() <= weekMs);
    const lastWeek = allQuizAttempts.filter((q) => {
      const t = now - new Date(q.submittedAt || 0).getTime();
      return t > weekMs && t <= weekMs * 2;
    });
    const avgThisWeek =
      thisWeek.length > 0
        ? thisWeek.reduce((s, q) => s + (q.percentage ?? 0), 0) / thisWeek.length
        : null;
    const avgLastWeek =
      lastWeek.length > 0
        ? lastWeek.reduce((s, q) => s + (q.percentage ?? 0), 0) / lastWeek.length
        : null;

    let improvementLabel = 'No comparison yet';
    let improvementPositive = true;
    if (avgThisWeek != null && avgLastWeek != null) {
      if (avgThisWeek >= avgLastWeek) {
        improvementLabel = 'Better than last week';
        improvementPositive = true;
      } else {
        improvementLabel = 'Lower than last week';
        improvementPositive = false;
      }
    } else if (avgThisWeek != null && thisWeek.length > 0) {
      improvementLabel = 'Better than last week';
      improvementPositive = true;
    }

    return {
      total,
      avgScore,
      totalTimeSeconds,
      improvementLabel,
      improvementPositive,
    };
  }, [allQuizAttempts]);

  const spaceRaceStats = useMemo(() => {
    const participations = flattenSpaceRaceParticipations(spaceParticipantsTree, student);
    const racesJoined = participations.length;
    let wins = 0;
    let losses = 0;
    let bestScore = 0;

    participations.forEach((p) => {
      const score = Number(p.score) || 0;
      if (score > bestScore) bestScore = score;

      if (!spaceParticipantsTree?.[p.raceId]) return;
      const allInRace = Object.values(spaceParticipantsTree[p.raceId] || {});
      const teamScores = {};
      allInRace.forEach((member) => {
        const tid = member.teamId ?? 1;
        teamScores[tid] = (teamScores[tid] || 0) + (Number(member.score) || 0);
      });
      const maxTeamScore = Math.max(...Object.values(teamScores), 0);
      const myTeamScore = teamScores[p.teamId ?? 1] ?? 0;
      if (myTeamScore >= maxTeamScore && maxTeamScore > 0) wins += 1;
      else if (maxTeamScore > 0) losses += 1;
    });

    return { racesJoined, wins, losses, bestScore };
  }, [spaceParticipantsTree, student]);

  const exitTicketSummary = useMemo(() => {
    const responses = flattenExitResponses(exitResponsesTree, student);
    const likertScores = [];
    const confusedTopics = [];

    responses.forEach((resp) => {
      const questionsRaw = exitQuestionsTree?.[resp.ticketId];
      const questions = questionsRaw
        ? Object.keys(questionsRaw)
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => questionsRaw[k])
        : [];

      (resp.answers || []).forEach((ans) => {
        const idx = ans.questionIndex ?? 0;
        const question = questions[idx];
        const answerText = ans.answer ?? '';
        const prompt = question?.prompt || question?.questionText || `Question ${idx + 1}`;

        const likert = likertToScore(answerText);
        if (likert != null) likertScores.push(likert);

        if (isConfusedAnswer(answerText)) {
          confusedTopics.push(prompt);
        }
      });
    });

    const avgUnderstanding =
      likertScores.length > 0
        ? (likertScores.reduce((a, b) => a + b, 0) / likertScores.length).toFixed(1)
        : '—';

    return {
      totalSubmitted: responses.length,
      avgUnderstanding,
      confusedTopics: [...new Set(confusedTopics)],
    };
  }, [exitResponsesTree, exitQuestionsTree, student]);

  const chartData = useMemo(() => {
    const days = chartRange;
    const now = new Date();
    const buckets = [];

    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);

      const inDay = allQuizAttempts.filter((q) => {
        const t = new Date(q.submittedAt || 0);
        return t >= d && t < next;
      });

      const avgScore =
        inDay.length > 0
          ? Math.round(inDay.reduce((s, q) => s + (q.percentage ?? 0), 0) / inDay.length)
          : null;

      buckets.push({
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        avgScore: avgScore ?? 0,
        hasData: inDay.length > 0,
      });
    }

    return buckets.filter((b) => b.hasData);
  }, [allQuizAttempts, chartRange]);

  const getQuizQuestions = useCallback(
    (quizId, fallbackQuestions, quizType = '') => {
      const hasRealText = (list) =>
        list.some(
          (q) =>
            (q?.questionText || q?.text || q?.prompt) &&
            !/^Question \d+$/i.test(String(q?.questionText || q?.text || q?.prompt).trim())
        );

      const fromSubmission = normalizeQuestionsList(fallbackQuestions);
      const fromTree = normalizeQuestionsList(quizzesTree?.[quizId]?.questions);
      const resolvedType = quizType || quizzesTree?.[quizId]?.type || '';
      const chosen = hasRealText(fromSubmission)
        ? fromSubmission
        : fromTree.length
        ? fromTree
        : fromSubmission;
      return normalizeQuestionsForScoring(chosen, resolvedType);
    },
    [quizzesTree]
  );

  const resolveQuizDetail = useCallback(
    (item) => {
      if (!item || item.type !== 'quiz') return null;
      const fromAttempts = allQuizAttempts.find(
        (a) =>
          (item.quizId &&
            a.quizId === item.quizId &&
            getQuizAttemptCollapseKey(a) === getQuizAttemptCollapseKey(item)) ||
          (item.quizId &&
            a.quizId === item.quizId &&
            item.participantId &&
            a.participantId === item.participantId) ||
          getAttemptKey(a) === getAttemptKey(item)
      );
      const base = fromAttempts || item;
      const quizId = base.quizId || item.quizId;
      const quizMeta = quizzesTree?.[quizId] || {};
      const quizType = base.quizType || item.quizType || quizMeta.type || '';
      const questions = getQuizQuestions(quizId, base.questions || item.questions, quizType);
      const answers = base.answers || item.answers || {};
      const recomputedScore =
        questions.length > 0
          ? calculateQuizScore(questions, answers, quizType)
          : null;
      return {
        ...base,
        quizId,
        title: base.quizTitle || base.title || item.title,
        quizType,
        timeTaken: base.timeTaken ?? item.timeTaken ?? null,
        totalQuestions:
          recomputedScore?.totalQuestions ??
          base.totalQuestions ??
          item.totalQuestions ??
          questions.length ??
          quizMeta.questions?.length ??
          0,
        correctAnswers:
          recomputedScore?.correctAnswers ??
          base.correctAnswers ??
          item.correctAnswers ??
          base.score ??
          0,
        percentage:
          recomputedScore?.percentage ??
          base.percentage ??
          item.percentage ??
          0,
        answers,
        submittedAt: base.submittedAt || item.sortKey || item.submittedAt,
        date: base.date || item.date,
        time: base.time || item.time,
        questions,
      };
    },
    [allQuizAttempts, getQuizQuestions, quizzesTree]
  );

  const handleSendMessage = () => {
    if (chatInput.trim() === '') return;
    
    const newUserMessage = {
      id: Date.now(),
      text: chatInput,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    };
    
    setChatMessages(prev => [...prev, newUserMessage]);
    setChatInput('');
    
    setTimeout(() => {
      const aiResponse = {
        id: Date.now() + 1,
        text: "Thank you for your question! I'm here to help you with your studies. Let me assist you with that topic.",
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, aiResponse]);
    }, 1000);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const handleLogout = async () => {
    await studentLogout();
    navigate('/student/auth');
  };

  const isLoading = loadingServerQuizRows && allQuizAttempts.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <img 
                src="/FeedEcho-logo.png.png" 
                alt="FeedEcho" 
                className="h-32 w-auto object-contain mix-blend-mode: multiply"
              />
            </div>

            {/* Center Navigation */}
            <div className="hidden md:flex items-center space-x-6">
              <a href="/student/home" className="flex items-center space-x-2 text-gray-700 hover:text-primary transition-colors">
                <Home className="w-4 h-4" />
                <span className="font-medium">Home</span>
              </a>
              <a href="/student/progress" className="flex items-center space-x-2 text-primary font-medium">
                <TrendingUp className="w-4 h-4" />
                <span className="font-medium">Progress</span>
              </a>
            </div>

            {/* Right Side Icons */}
            <div className="flex items-center space-x-3">
              {/* Chatbot Icon */}
              <button 
                onClick={() => setShowChatbot(!showChatbot)}
                className="p-2 rounded-lg text-gray-600 hover:text-primary transition-colors"
              >
                <Bot className="w-5 h-5" />
              </button>
              
              {/* Profile Dropdown */}
              <div className="relative" ref={profileDropdownRef}>
                <button
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <StudentAvatar name={userName || 'Student'} />
                  <span className="font-medium text-text">{userName || 'Student'}</span>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
                
                {/* Profile Dropdown */}
                {showProfileDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-3 border-b border-gray-200">
                      <p className="font-medium text-text">{userName || 'Student'}</p>
                      <p className="text-sm text-gray-600">student@example.com</p>
                    </div>
                    <div className="py-2">
                      <Link to="/student/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4" />
                          <span>Profile</span>
                        </div>
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100"
                      >
                        <div className="flex items-center space-x-2">
                          <LogOut className="w-4 h-4" />
                          <span>Logout</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mx-auto p-6 max-w-7xl">
        <div className="relative bg-gradient-to-r from-primary to-primary/90 text-white rounded-xl shadow-lg p-8 mb-6 overflow-hidden">
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-l from-black/20 to-transparent" />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Your Progress</h1>
              <p className="text-white/90">
                Track quizzes, space races, and exit tickets — updated live.
              </p>
            </div>
            <TrendingUp className="w-14 h-14 text-white/80 hidden sm:block" />
          </div>
        </div>

        {/* Activity History Section */}
        <div className="mt-6">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-4" style={{ fontSize: '12px', letterSpacing: '0.08em' }}>Activity history</p>
          
          {visibleActivityHistory.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No activity recorded yet.</p>
          ) : (
            <div className="space-y-3" style={{ marginTop: '12px' }}>
              {visibleActivityHistory.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl p-[14px_18px] border border-gray-200 flex items-center justify-between"
                  style={{ borderRadius: '12px', padding: '14px 18px', border: '0.5px solid #e0e0e0', boxShadow: 'none', marginBottom: '12px' }}
                >
                  <div className="flex-1">
                    <p className="font-medium mb-1" style={{ color: '#1a1a1a' }}>{item.title}</p>
                    <p className="text-sm text-gray-600 mb-1">{item.date} · {item.time}</p>
                    <p className="text-sm text-gray-600 mb-2">
                      {item.score
                        ? `Score: ${item.score}`
                        : item.rank
                        ? `Rank: ${item.rank}`
                        : item.subtitle || ''}
                    </p>
                    <div
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                      style={{
                        backgroundColor:
                          item.type === 'quiz'
                            ? '#ede9fc'
                            : item.type === 'exitTicket'
                            ? '#fef3c7'
                            : '#e1f5ee',
                        color:
                          item.type === 'quiz'
                            ? '#5340b0'
                            : item.type === 'exitTicket'
                            ? '#92400e'
                            : '#0f6e56',
                        borderRadius: '20px',
                        fontSize: '11px'
                      }}
                    >
                      {item.type === 'quiz' ? (
                        <Pencil className="w-3 h-3" />
                      ) : item.type === 'exitTicket' ? (
                        <FileText className="w-3 h-3" />
                      ) : (
                        <Rocket className="w-3 h-3" />
                      )}
                      <span>
                        {item.type === 'quiz'
                          ? 'Quiz'
                          : item.type === 'exitTicket'
                          ? 'Exit Ticket'
                          : 'Space Race'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4" style={{ gap: '8px' }}>
                    <button
                      onClick={() => {
                        if (item.type === 'quiz') {
                          setViewModal({ type: 'quiz', data: resolveQuizDetail(item) || item });
                        } else if (item.type === 'spaceRace') {
                          setViewModal({ type: 'spaceRace', data: item });
                        } else {
                          setViewModal({ type: item.type, data: item });
                        }
                      }}
                      className="px-[14px] py-[6px] rounded-lg text-sm font-medium text-white transition-colors"
                      style={{ backgroundColor: '#7c3f5e', borderRadius: '8px', padding: '6px 14px' }}
                    >
                      View
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(item.id)}
                      className="px-[14px] py-[6px] rounded-lg text-sm font-medium border transition-colors"
                      style={{ borderColor: '#c0392b', color: '#c0392b', backgroundColor: 'transparent', borderRadius: '8px', padding: '6px 14px', borderWidth: '0.5px' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* View Modal */}
        {viewModal && (
          <div
            onClick={() => setViewModal(null)}
            onKeyDown={(e) => e.key === 'Escape' && setViewModal(null)}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            style={{ animation: 'fadeIn 150ms ease-in' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full mx-4 border border-gray-200"
              style={{ borderRadius: '16px', padding: '24px', maxWidth: '520px' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold" style={{ color: '#7c3f5e' }}>
                  {viewModal.type === 'quiz' ? 'Quiz Details' : 'Space Race Details'}
                </h3>
                <button
                  onClick={() => setViewModal(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3">
                <p className="font-medium" style={{ color: '#1a1a1a' }}>
                  {viewModal.data.title || viewModal.data.quizTitle}
                </p>
                <p className="text-sm text-gray-600">
                  Date: {viewModal.data.date || formatDateTime(viewModal.data.submittedAt).split(' · ')[0]}
                </p>
                <p className="text-sm text-gray-600">
                  Time: {viewModal.data.time || formatDateTime(viewModal.data.submittedAt).split(' · ')[1]}
                </p>
                {viewModal.type === 'quiz' && (
                  <>
                    <p className="text-sm text-gray-600">
                      Score: {viewModal.data.percentage ?? 0}%
                    </p>
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium mb-2" style={{ color: '#7c3f5e' }}>
                        Total questions: {viewModal.data.totalQuestions ?? viewModal.data.questions?.length ?? 0}
                      </p>
                      <p className="text-sm text-gray-600">
                        Correct answers: {viewModal.data.correctAnswers ?? viewModal.data.score ?? 0}
                      </p>
                      <p className="text-sm text-gray-600">
                        Time taken: {formatDuration(viewModal.data.timeTaken)}
                      </p>
                    </div>
                    <div className="border-t border-gray-200 my-4" />
                    <p className="text-sm font-medium mb-3" style={{ color: '#7c3f5e' }}>
                      Question breakdown:
                    </p>
                    <div className="space-y-3 text-sm max-h-64 overflow-y-auto">
                      {(viewModal.data.questions?.length
                        ? viewModal.data.questions
                        : Object.keys(viewModal.data.answers || {}).map((k, i) => ({
                            id: k,
                            questionText: `Question ${i + 1}`,
                          }))
                      ).map((question, index) => {
                        const studentAnswerRaw = extractStudentAnswer(
                          viewModal.data.answers,
                          index,
                          question
                        );
                        const studentAnswer = formatAnswerDisplay(studentAnswerRaw);
                        const questionType = question.type || viewModal.data.quizType;
                        const totalQs =
                          viewModal.data.totalQuestions || viewModal.data.questions?.length || 0;
                        const { isCorrect } = reviewQuestionAnswer(
                          question,
                          studentAnswerRaw,
                          questionType,
                          totalQs
                        );
                        return (
                          <div key={question.id || index} className="flex flex-col gap-1">
                            <p className="font-medium">
                              Q{index + 1}: {question.questionText || question.text || question.prompt || 'Question'}
                            </p>
                            <p className="flex items-center gap-2 text-gray-600">
                              {isCorrect ? (
                                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                              ) : (
                                <X className="w-4 h-4 text-red-600 flex-shrink-0" />
                              )}
                              <span>{studentAnswer}</span>
                            </p>
                          </div>
                        );
                      })}
                      {(!viewModal.data.questions?.length && !Object.keys(viewModal.data.answers || {}).length) && (
                        <p className="text-gray-500">No question details available for this attempt.</p>
                      )}
                    </div>
                  </>
                )}
                {viewModal.type === 'spaceRace' && (
                  <>
                    <p className="text-sm text-gray-600">Team: {viewModal.data.rank || viewModal.data.subtitle}</p>
                    {viewModal.data.score ? (
                      <p className="text-sm text-gray-600">Score: {viewModal.data.score}</p>
                    ) : null}
                    <p className="text-sm text-gray-600">Joined: {viewModal.data.date} · {viewModal.data.time}</p>
                  </>
                )}
                {viewModal.type === 'exitTicket' && (
                  <>
                    <p className="text-sm text-gray-600">{viewModal.data.subtitle || 'Exit ticket submitted'}</p>
                    <p className="text-sm text-gray-600">Submitted: {viewModal.data.date} · {viewModal.data.time}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div
            onClick={() => setDeleteConfirm(null)}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4 border border-gray-200"
            >
              <h3 className="text-lg font-bold mb-2" style={{ color: '#1a1a1a' }}>Delete Entry?</h3>
              <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this entry?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setHiddenActivityIds((prev) => [...prev, deleteConfirm]);
                    setDeleteConfirm(null);
                  }}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: '#c0392b' }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Study Assistant Panel */}
      {showChatbot && (
        <div className="w-[380px] flex-shrink-0 h-screen flex flex-col overflow-hidden bg-white shadow-2xl border-l border-gray-200 fixed right-0 top-0 z-50">
          {/* Header */}
          <div className="bg-primary p-4 text-white flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">AI Study Assistant</h3>
                  <p className="text-white/80 text-sm">Ask me anything about your studies</p>
                </div>
              </div>
              <button
                onClick={() => setShowChatbot(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Chat Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-gray-50">
            <div className="space-y-4">
              {chatMessages.map((message) => (
                <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.sender === 'user' 
                      ? 'bg-primary text-white' 
                      : 'bg-white text-gray-800 border border-gray-200'
                  }`}>
                    <p className="text-sm">{message.text}</p>
                    <p className={`text-xs mt-1 ${
                      message.sender === 'user' ? 'text-primary-100' : 'text-gray-500'
                    }`}>{message.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Input Area */}
          <div className="p-4 bg-white border-t border-gray-200 flex-shrink-0">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Type your question here..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button 
                onClick={handleSendMessage}
                className="w-12 h-12 bg-primary rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors"
              >
                <ArrowRight className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
