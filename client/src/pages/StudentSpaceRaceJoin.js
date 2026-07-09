import { Navigate } from 'react-router-dom';

/** Thin entry point — all join logic lives in StudentSpaceRacePage. */
export default function StudentSpaceRaceJoin() {
  return <Navigate to="/space-race" replace />;
}
