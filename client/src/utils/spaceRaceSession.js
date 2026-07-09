const PARTICIPANT_KEY = 'spaceRaceParticipant';

export function saveSpaceRaceParticipant(participant) {
  if (!participant?.id) return;
  const payload = JSON.stringify(participant);
  sessionStorage.setItem(PARTICIPANT_KEY, payload);
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
    return participant;
  } catch {
    return null;
  }
}

export function clearSpaceRaceParticipant() {
  sessionStorage.removeItem(PARTICIPANT_KEY);
  localStorage.removeItem(PARTICIPANT_KEY);
}
