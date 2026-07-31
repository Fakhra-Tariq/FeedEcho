const PARTICIPANT_KEY = 'spaceRaceParticipant';

/** Normalize team IDs so dashboard + public join always store a number (or null). */
export function normalizeTeamId(teamId) {
  if (teamId === undefined || teamId === null || teamId === '') return null;
  const n = Number(teamId);
  return Number.isFinite(n) ? n : null;
}

export function saveSpaceRaceParticipant(participant) {
  if (!participant?.id) return;
  const normalized = {
    ...participant,
    teamId: normalizeTeamId(participant.teamId),
  };
  const payload = JSON.stringify(normalized);
  sessionStorage.setItem(PARTICIPANT_KEY, payload);
  // Keep localStorage in sync so both join entry points read the same participant
  localStorage.setItem(PARTICIPANT_KEY, payload);
}

export function loadSpaceRaceParticipant(expectedRaceId = null) {
  const raw =
    sessionStorage.getItem(PARTICIPANT_KEY) || localStorage.getItem(PARTICIPANT_KEY);
  if (!raw) return null;

  try {
    const participant = JSON.parse(raw);
    if (
      expectedRaceId &&
      participant?.raceId &&
      String(participant.raceId) !== String(expectedRaceId)
    ) {
      return null;
    }
    if (participant) {
      participant.teamId = normalizeTeamId(participant.teamId);
    }
    return participant;
  } catch {
    return null;
  }
}

export function clearSpaceRaceParticipant() {
  sessionStorage.removeItem(PARTICIPANT_KEY);
  localStorage.removeItem(PARTICIPANT_KEY);
}
