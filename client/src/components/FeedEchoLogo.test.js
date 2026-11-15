import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FeedEchoLogo, { FEED_ECHO_LOGO_SRC } from './FeedEchoLogo';

describe('FeedEchoLogo', () => {
  it('uses the shared Home image and phone clip classes', () => {
    render(<FeedEchoLogo />);
    const logo = screen.getByAltText('FeedEcho');
    expect(logo.getAttribute('src')).toBe(FEED_ECHO_LOGO_SRC);
    expect(logo.className).toMatch(/max-md:!h-\[var\(--logo-height-phone\)\]/);
    expect(logo.closest('.feed-echo-logo-clip')).toBeTruthy();
    expect(logo.closest('.feed-echo-logo-clip').className).toMatch(
      /max-md:h-\[var\(--logo-clip-height-phone\)\]/
    );
  });

  it('wraps in a home link when `to` is set', () => {
    render(
      <MemoryRouter>
        <FeedEchoLogo to="/" />
      </MemoryRouter>
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe('/');
  });
});
