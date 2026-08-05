import { Navigate } from 'react-router-dom';

/** Thin entry point — all join logic lives in AudienceSpaceRacePage. */
export default function AudienceSpaceRaceJoin() {
  return <Navigate to="/space-race" replace />;
}
