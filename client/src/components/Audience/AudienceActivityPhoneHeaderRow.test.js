import { render } from '@testing-library/react';
import AudienceActivityPhoneHeaderRow from './AudienceActivityPhoneHeaderRow';

describe('AudienceActivityPhoneHeaderRow', () => {
  it('uses the shared phone header class (logo | title | name grid, hidden from md up)', () => {
    const { container } = render(
      <AudienceActivityPhoneHeaderRow
        left={<span>L</span>}
        center={<h1>Title</h1>}
        right={<span>R</span>}
      />
    );
    const row = container.querySelector('[data-audience-phone-header="true"]');
    expect(row).toBeTruthy();
    expect(row.className).toMatch(/audience-activity-phone-header/);
    expect(row.className).toMatch(/md:hidden/);
    expect(row.children).toHaveLength(3);
    expect(row.children[0].className).toMatch(/__left/);
    expect(row.children[1].className).toMatch(/__center/);
    expect(row.children[2].className).toMatch(/__right/);
  });
});
