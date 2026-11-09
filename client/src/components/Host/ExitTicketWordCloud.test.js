import { ExitTicketPresentButton } from './ExitTicketWordCloud';

describe('ExitTicketWordCloud', () => {
  it('loads with wordcloud2 and exports the header button', () => {
    expect(typeof ExitTicketPresentButton).toBe('function');
  });
});
