/** Same logged-in signal as GuestProgressLoginBanner (`getStoredAudienceSession`). */
export function getAudiencePostActivityHomeLabel(storedSession, authLoading) {
  if (storedSession) return 'Back to Dashboard';
  if (authLoading) return null;
  return 'Back to Join Session';
}
