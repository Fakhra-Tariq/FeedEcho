import { getAudiencePostActivityHomeLabel } from './audiencePostActivityHomeLabel';

describe('getAudiencePostActivityHomeLabel', () => {
  it('uses the dashboard label when a stored audience session exists', () => {
    expect(getAudiencePostActivityHomeLabel({ uid: 'u1' }, true)).toBe('Back to Dashboard');
    expect(getAudiencePostActivityHomeLabel({ uid: 'u1' }, false)).toBe('Back to Dashboard');
  });

  it('does not show the guest label while auth is still loading', () => {
    expect(getAudiencePostActivityHomeLabel(null, true)).toBeNull();
  });

  it('uses Join Session after auth has loaded with no session', () => {
    expect(getAudiencePostActivityHomeLabel(null, false)).toBe('Back to Join Session');
  });
});
