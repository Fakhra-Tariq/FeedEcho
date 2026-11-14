const { db } = require('../config/firebase');

const ARCHIVE_TYPES = new Set(['link', 'image', 'file']);

const sharedResourcesRef = (raceId) => db.ref(`space_race_shared_resources/${raceId}`);
const studentHistoryRef = (studentKey) => db.ref(`space_race_student_history/${studentKey}`);
const raceParticipantsRef = (id) => db.ref(`space_race_participants/${id}`);
const teamChatMessagesRef = (raceId, teamId) =>
  db.ref(`space_race_team_messages/${raceId}/team_${teamId}`);

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

const getSessionDate = (race = {}) => race.startedAt || race.createdAt || null;

const getQuizName = (race = {}) =>
  race.title || race.quiz?.title || 'Space Race';

function buildResourceRecord(race, raceId, message, teamIdFallback) {
  const teamId = message.teamId != null && message.teamId !== '' ? message.teamId : teamIdFallback;
  return {
    id: message.id,
    raceId,
    quizId: race?.quizId || race?.quiz?.id || null,
    quizName: race ? getQuizName(race) : '',
    sessionDate: (race ? getSessionDate(race) : null) || message.timestamp || null,
    teamId: Number(teamId),
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
}

function resourceDedupeKey(resource) {
  if (resource?.id) return `id:${resource.id}`;
  if (resource?.chatMessageId) return `id:${resource.chatMessageId}`;
  return [
    'mix',
    resource?.url || '',
    resource?.fileName || '',
    resource?.senderName || '',
    resource?.sharedAt || '',
  ].join('|');
}

async function archiveSharedResource(race, raceId, message) {
  if (!ARCHIVE_TYPES.has(message.type)) return null;

  const record = buildResourceRecord(race, raceId, message);
  await sharedResourcesRef(raceId).child(message.id).set(record);
  return record;
}

async function saveStudentParticipation({ raceId, teamId, participantId, studentName, race, studentUid, studentEmail }) {
  const trimmedName = String(studentName || '').trim();
  if (!trimmedName || !raceId) return;

  const joinedAt = new Date().toISOString();
  const entry = {
    raceId,
    teamId: Number(teamId),
    participantId,
    studentName: trimmedName,
    quizName: getQuizName(race),
    // Prefer the student's join/attempt time for history display; race start is secondary.
    sessionDate: getSessionDate(race) || joinedAt,
    joinedAt,
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

async function loadHistoryFromParticipants(identifiers, studentUid = '') {
  const snap = await db.ref('space_race_participants').get();
  if (!snap.exists()) return [];

  const uid = studentUid ? String(studentUid).trim() : '';
  const rows = [];
  const tree = snap.val() || {};

  await Promise.all(
    Object.entries(tree).map(async ([raceId, participants]) => {
      if (!participants || typeof participants !== 'object') return;

      let matched = null;
      Object.entries(participants).forEach(([participantId, p]) => {
        if (!p || typeof p !== 'object') return;
        if (uid) {
          if (!p.studentUid || String(p.studentUid).trim() !== uid) return;
        } else if (!matchesStudent(p.name, identifiers)) {
          return;
        }
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
      const raw = String(identifier || '').trim();
      // uid: keys are stored with the raw Firebase uid (case-sensitive); do not normalize.
      const key = raw.startsWith('uid:') ? raw : normalizeStudentKey(identifier);
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
  const studentUid = query.uid ? String(query.uid).trim() : '';
  const identifiers = getStudentIdentifiers(query);

  // Logged-in: uid index + participants with matching studentUid only (exclude guest name keys).
  if (studentUid) {
    const [fromParticipants, fromIndex] = await Promise.all([
      loadHistoryFromParticipants([], studentUid),
      loadHistoryFromIndex([`uid:${studentUid}`]),
    ]);

    const byRaceId = new Map();
    [...fromParticipants, ...fromIndex].forEach((row) => {
      const existing = byRaceId.get(row.raceId);
      if (!existing || String(row.joinedAt || '') > String(existing.joinedAt || '')) {
        byRaceId.set(row.raceId, row);
      }
    });

    return Array.from(byRaceId.values()).sort((a, b) =>
      String(b.joinedAt || b.sessionDate || '').localeCompare(String(a.joinedAt || a.sessionDate || ''))
    );
  }

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
    String(b.joinedAt || b.sessionDate || '').localeCompare(String(a.joinedAt || a.sessionDate || ''))
  );
}

function participantMatchesQuery(participant, query = {}) {
  if (!participant) return false;
  const studentUid = query.uid ? String(query.uid).trim() : '';
  const studentEmail = query.email ? String(query.email).toLowerCase().trim() : '';
  if (studentUid && participant.studentUid && String(participant.studentUid).trim() === studentUid) {
    return true;
  }
  if (
    studentEmail &&
    participant.studentEmail &&
    String(participant.studentEmail).toLowerCase().trim() === studentEmail
  ) {
    return true;
  }
  return matchesStudent(participant.name, getStudentIdentifiers(query));
}

async function verifyStudentTeamAccess(raceId, teamId, query = {}) {
  const studentUid = query.uid ? String(query.uid).trim() : '';
  const identifiers = getStudentIdentifiers(query);
  if (!studentUid && !identifiers.length) return false;

  const participantsSnap = await raceParticipantsRef(raceId).get();
  if (participantsSnap.exists()) {
    const participants = participantsSnap.val() || {};
    const hasMatch = Object.values(participants).some(
      (p) => p && String(p.teamId) === String(teamId) && participantMatchesQuery(p, query)
    );
    if (hasMatch) return true;
  }

  const indexKeys = [
    ...(studentUid ? [`uid:${studentUid}`] : []),
    ...identifiers,
  ];
  const indexMatches = await loadHistoryFromIndex(indexKeys);
  return indexMatches.some(
    (row) => row.raceId === raceId && String(row.teamId) === String(teamId)
  );
}

async function getSharedResources(raceId, teamId, query = {}) {
  const allowed = await verifyStudentTeamAccess(raceId, teamId, query);
  if (!allowed) {
    return { forbidden: true, resources: [] };
  }

  const [archiveSnap, chatSnap] = await Promise.all([
    sharedResourcesRef(raceId).get(),
    teamChatMessagesRef(raceId, teamId).get(),
  ]);

  const byKey = new Map();
  const addResource = (resource) => {
    if (!resource || !ARCHIVE_TYPES.has(resource.type)) return;
    if (resource.teamId != null && String(resource.teamId) !== String(teamId)) return;
    const key = resourceDedupeKey(resource);
    if (!byKey.has(key)) byKey.set(key, resource);
  };

  Object.values(archiveSnap.exists() ? archiveSnap.val() || {} : {}).forEach(addResource);

  Object.values(chatSnap.exists() ? chatSnap.val() || {} : {}).forEach((message) => {
    if (!message || !ARCHIVE_TYPES.has(message.type)) return;
    addResource(buildResourceRecord(null, raceId, message, teamId));
  });

  const resources = Array.from(byKey.values()).sort((a, b) =>
    String(a.sharedAt || '').localeCompare(String(b.sharedAt || ''))
  );

  return { forbidden: false, resources };
}

module.exports = {
  archiveSharedResource,
  saveStudentParticipation,
  getStudentHistory,
  getSharedResources,
  getStudentIdentifiers,
};
