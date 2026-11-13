import React from 'react';
import { Check } from 'lucide-react';
import { getPasswordRuleStatus } from '../../utils/emailAuth';

const RULES = [
  { key: 'minLength', label: 'At least 8 characters' },
  { key: 'uppercase', label: 'One uppercase letter' },
  { key: 'lowercase', label: 'One lowercase letter' },
  { key: 'special', label: 'One special character' },
];

export default function PasswordRulesChecklist({ password }) {
  const status = getPasswordRuleStatus(password);

  return (
    <ul className="mt-2 space-y-1" aria-live="polite" aria-label="Password requirements">
      {RULES.map((rule) => {
        const met = status[rule.key];
        return (
          <li
            key={rule.key}
            className={`flex items-center gap-2 text-xs sm:text-sm break-words ${
              met ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            <span
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                met ? 'bg-emerald-100' : 'bg-gray-100'
              }`}
              aria-hidden="true"
            >
              {met ? <Check className="h-3 w-3" /> : null}
            </span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
