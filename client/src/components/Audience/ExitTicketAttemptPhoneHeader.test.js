import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExitTicketAttemptPhoneHeader, {
  isLoggedInAudienceUser,
} from './ExitTicketAttemptPhoneHeader';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: { uid: 'u1', email: 'a@b.com', name: 'Binte Yahya' },
    audienceLogout: jest.fn(),
  }),
}));

jest.mock('../../utils/audienceSession', () => ({
  getStoredAudienceSession: () => ({ uid: 'u1', email: 'a@b.com', name: 'Binte Yahya' }),
}));

describe('isLoggedInAudienceUser', () => {
  it('detects logged-in students by uid+email', () => {
    expect(isLoggedInAudienceUser({ uid: 'x', email: 'a@b.com' }, null)).toBe(true);
    expect(isLoggedInAudienceUser(null, { uid: 'x', email: 'a@b.com' })).toBe(true);
  });

  it('treats name-only joiners as guests', () => {
    expect(isLoggedInAudienceUser(null, null)).toBe(false);
    expect(isLoggedInAudienceUser({}, { name: 'Khansa' })).toBe(false);
  });
});

describe('ExitTicketAttemptPhoneHeader', () => {
  it('shows logo, title, and guest name without a back control', () => {
    render(
      <ExitTicketAttemptPhoneHeader
        title="Demo Feedback With A Very Long Title"
        participantName="Khansa With A Very Long Guest Name"
        isLoggedIn={false}
      />
    );
    expect(screen.getByAltText('FeedEcho')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Demo Feedback/ })).toBeTruthy();
    expect(screen.getByText(/Khansa/)).toBeTruthy();
    expect(screen.queryByText('Exit Ticket')).toBeNull();
    expect(screen.queryByLabelText('Leave')).toBeNull();
  });

  it('shows the account menu avatar for a logged-in student', () => {
    render(
      <MemoryRouter>
        <ExitTicketAttemptPhoneHeader
          title="Demo Feedback"
          participantName="Binte Yahya"
          isLoggedIn
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Account menu')).toBeTruthy();
    expect(screen.queryByText('Binte Yahya')).toBeNull();
  });
});
