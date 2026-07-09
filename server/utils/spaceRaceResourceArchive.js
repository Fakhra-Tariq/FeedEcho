const { db } = require('../config/firebase');

const ARCHIVE_TYPES = new Set(['link', 'image', 'file']);

const sharedResourcesRef = (raceId) => db.ref(`space_race_shared_resources/${raceId}`);
const studentHistoryRef = (studentKey) => db.ref(`space_race_student_history/${studentKey}`);
const raceParticipantsRef = (id) => db.ref(`space_race_participants/${id}`);

const normalizeStudentKey = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[.#$[\]/]/g, '_');

const getStudentIdentifiers = (query = {}) => {
  const raw = [query.name, query.email, query.username];
  if (query.aliases) {
    raw.push(...String(query.aliases).split(','));
  }
  return [...new Set(raw.filter(Boolean).map((s) => String(s).toLowerCase().trim()))];
};

const matchesStudent = (recordName, identifiers) => {
  if (!identifiers.length) return false;
  const n = String(recordName || '').toLowerCase().trim();
  if (!n) return false;
  return identifiers.some((id) => n === id || n.includes(id) || id.includes(n));
};

const getSessionDate = (race = {}) =>
  race.startedAt || race.createdAt || new Date().toISOString();

const getQuizName = (race = {}) =>
  race.title || race.quiz?.title || 'Space Race';

async function archiveSharedResource(race, raceId, message) {
  if (!ARCHIVE_TYPES.has(message.type)) return null;

  const record = {
    id: message.id,
    raceId,
    quizId: race.quizId || race.quiz?.id || null,
    quizName: getQuizName(race),
    sessionDate: getSessionDate(race),
    teamId: Number(message.teamId),
    participantId: message.participantId,
    senderName: message.senderName,
    type: message.type,
    url: message.url || '',
    fileName: message.fileName || '',
    linkTitle: message.linkTitle || '',
    text: message.text || '',
    sharedAt: message.timestamp,
    chatMessageId: message.id,
  };

  await sharedResourcesRef(raceId).child(message.id).set(record);
  return record;
}

async function saveStudentParticipation({ raceId, teamId, participantId, studentName, race, studentUid, studentEmail }) {
  const trimmedName = String(studentName || '').trim();
  if (!trimmedName || !raceId) return;

  const entry = {
    raceId,
    teamId: Number(teamId),
    participantId,
    studentName: trimmedName,
    quizName: getQuizName(race),
    sessionDate: getSessionDate(race),
    joinedAt: new Date().toISOString(),
    ...(studentUid ? { studentUid: String(studentUid).trim() } : {}),
    ...(studentEmail ? { studentEmail: String(studentEmail).toLowerCase().trim() } : {}),
  };

  const key = normalizeStudentKey(trimmedName);
  if (key) {
    await studentHistoryRef(key).child(raceId).set(entry);
  }
  if (studentUid) {
    await studentHistoryRef(`uid:${String(studentUid).trim()}`).child(raceId).set(entry);
  }
}

async function loadHistoryFromParticipants(identifiers) {
  const snap = await db.ref('space_race_participants').get();
  if (!snap.exists()) return [];

  const rows = [];
  const tree = snap.val() || {};

  await Promise.all(
    Object.entries(tree).map(async ([raceId, participants]) => {
      if (!participants || typeof participants !== 'object') return;

      let matched = null;
      Object.entries(participants).forEach(([participantId, p]) => {
        if (!p || typeof p !== 'object') return;
        if (!matchesStudent(p.name, identifiers)) return;
        if (!matched || String(p.joinedAt || '') > String(matched.joinedAt || '')) {
          matched = { ...p, raceId, participantId };
        }
      });

      if (!matched) return;

      const raceSnap = await db.ref(`spaceRaces/${raceId}`).get();
      const race = raceSnap.exists() ? raceSnap.val() : {};

      rows.push({
        raceId,
        teamId: matched.teamId,
        participantId: matched.participantId,
        quizName: getQuizName(race) || 'Space Race',
        sessionDate: getSessionDate(race) || matched.joinedAt,
        joinedAt: matched.joinedAt,
      });
    })
  );

  return rows;
}

async function loadHistoryFromIndex(identifiers) {
  const rows = [];
  const seen = new Set();

  await Promise.all(
    identifiers.map(async (identifier) => {
      const key = normalizeStudentKey(identifier);
      if (!key) return;

      const snap = await studentHistoryRef(key).get();
      if (!snap.exists()) return;

      Object.entries(snap.val() || {}).forEach(([raceId, entry]) => {
        if (!entry || seen.has(raceId)) return;
        seen.add(raceId);
        rows.push({
          raceId,
          teamId: entry.teamId,
          participantId: entry.participantId,
          quizName: entry.quizName || 'Space Race',
          sessionDate: entry.sessionDate || entry.joinedAt,
          joinedAt: entry.joinedAt,
        });
      });
    })
  );

  return rows;
}

async function getStudentHistory(query = {}) {
  const identifiers = getStudentIdentifiers(query);
  if (!identifiers.length) {
    return [];
  }

  const [fromParticipants, fromIndex] = await Promise.all([
    loadHistoryFromParticipants(identifiers),
    loadHistoryFromIndex(identifiers),
  ]);

  const byRaceId = new Map();
  [...fromParticipants, ...fromIndex].forEach((row) => {
    const existing = byRaceId.get(row.raceId);
    if (!existing || String(row.joinedAt || '') > String(existing.joinedAt || '')) {
      byRaceId.set(row.raceId, row);
    }
  });

  return Array.from(byRaceId.values()).sort((a, b) =>
    String(b.sessionDate || b.joinedAt || '').localeCompare(String(a.sessionDate || a.joinedAt || ''))
  );
}

async function verifyStudentTeamAccess(raceId, teamId, query = {}) {
  const identifiers = getStudentIdentifiers(query);
  if (!identifiers.length) return false;

  const participantsSnap = await raceParticipantsRef(raceId).get();
  if (participantsSnap.exists()) {
    const participants = participantsSnap.val() || {};
    const hasMatch = Object.values(participants).some(
      (p) =>
        p &&
        matchesStudent(p.name, identifiers) &&
        String(p.teamId) === String(teamId)
    );
    if (hasMatch) return true;
  }

  const indexMatches = await loadHistoryFromIndex(identifiers);
  return indexMatches.some(
    (row) => row.raceId === raceId && String(row.teamId) === String(teamId)
  );
}

async function getSharedResources(raceId, teamId, query = {}) {
  const allowed = await verifyStudentTeamAccess(raceId, teamId, query);
  if (!allowed) {
    return { forbidden: true, resources: [] };
  }

  const snap = await sharedResourcesRef(raceId).get();
  if (!snap.exists()) return { forbidden: false, resources: [] };

  const resources = Object.values(snap.val() || {})
    .filter((r) => r && String(r.teamId) === String(teamId))
    .sort((a, b) => String(a.sharedAt || '').localeCompare(String(b.sharedAt || '')));

  return { forbidden: false, resources };
}

module.exports = {
  archiveSharedResource,
  saveStudentParticipation,
  getStudentHistory,
  getSharedResources,
  getStudentIdentifiers,
};
