const MIN_TEAMS = 2;
const MAX_TEAMS = 10;

const teamCountRangeError = `Number of teams must be between ${MIN_TEAMS} and ${MAX_TEAMS}.`;

const isAllowedTeamCount = (value) => {
  const count = Number(value);
  return Number.isInteger(count) && count >= MIN_TEAMS && count <= MAX_TEAMS;
};

const teamCountChoices = () => {
  const choices = [];
  for (let count = MIN_TEAMS; count <= MAX_TEAMS; count += 1) {
    choices.push(count);
  }
  return choices;
};

module.exports = {
  MIN_TEAMS,
  MAX_TEAMS,
  teamCountRangeError,
  isAllowedTeamCount,
  teamCountChoices,
};
