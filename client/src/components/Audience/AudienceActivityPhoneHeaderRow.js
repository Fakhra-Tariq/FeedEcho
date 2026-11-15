import React from 'react';
import './audienceActivityPhoneHeader.css';

/**
 * Phone (<768px) activity chrome: logo | title | name/avatar.
 * Equal 1fr side columns keep the title on the screen midline.
 */
export default function AudienceActivityPhoneHeaderRow({
  left,
  center,
  right,
  rightHasAddon = false,
  variant = null,
}) {
  const variantClass =
    variant === 'quiz' ? ' audience-activity-phone-header--quiz' : '';
  return (
    <div
      className={`audience-activity-phone-header md:!hidden${variantClass}`}
      data-audience-phone-header="true"
    >
      <div className="audience-activity-phone-header__left">{left}</div>
      <div className="audience-activity-phone-header__center">{center}</div>
      <div
        className={
          rightHasAddon
            ? 'audience-activity-phone-header__right audience-activity-phone-header__right--addon'
            : 'audience-activity-phone-header__right'
        }
      >
        {right}
      </div>
    </div>
  );
}
