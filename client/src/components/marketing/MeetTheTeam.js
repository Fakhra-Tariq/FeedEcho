import React from 'react';
import { Github, Linkedin } from 'lucide-react';
import { Reveal, RevealStagger } from '../Reveal';
import { SurfaceCard, marketingSectionClass } from './SurfaceCard';

const TEAM = [
  { name: 'Fakhra Tariq', role: 'Co-founder' },
  { name: 'Hafiza Urooj Fatima', role: 'Co-founder' },
  { name: 'Khansa M. Yahya', role: 'Co-founder' },
  { name: 'Sundus Nadeem', role: 'Co-founder' },
];

const SUPERVISOR = {
  name: 'Ms Surayya Obaid',
  university: 'Jinnah University For Women',
};

export function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function TeamMemberCard({ member }) {
  const initials = (member.initials || getInitials(member.name)).trim();
  const hasLinks = Boolean(member.linkedin || member.github);

  return (
    <SurfaceCard className="meet-the-team-card flex h-full flex-col items-center text-center min-w-0 p-3.5 sm:p-6 lg:p-8">
      <div
        aria-hidden="true"
        className="flex items-center justify-center shrink-0 rounded-full bg-[#F1E4EC] text-[#6B3A5C] font-medium mb-4 ring-2 ring-white shadow-[0_0_0_3px_#E3D3DD] w-[3.25rem] h-[3.25rem] text-base sm:w-[3.75rem] sm:h-[3.75rem] lg:w-16 lg:h-16 lg:text-[18px]"
      >
        {initials}
      </div>
      <h3 className="w-full text-[0.875rem] sm:text-[0.9375rem] lg:text-base font-medium text-text leading-snug [overflow-wrap:anywhere]">
        {member.name}
      </h3>
      <p className="mt-1 w-full text-[0.75rem] sm:text-[0.8125rem] lg:text-[13px] font-medium leading-snug text-[#6B3A5C] lg:text-primary [overflow-wrap:anywhere]">
        {member.role}
      </p>
      {member.bio ? (
        <p className="mt-3 w-full text-[0.8125rem] text-text-light leading-relaxed [overflow-wrap:anywhere]">
          {member.bio}
        </p>
      ) : null}
      {hasLinks ? (
        <div className="mt-3 flex items-center justify-center gap-3">
          {member.linkedin ? (
            <a
              href={member.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${member.name} on LinkedIn`}
              className="text-primary transition-colors [@media(hover:hover)]:hover:text-primary/80 motion-reduce:transition-none"
            >
              <Linkedin className="w-4 h-4" aria-hidden="true" />
            </a>
          ) : null}
          {member.github ? (
            <a
              href={member.github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${member.name} on GitHub`}
              className="text-primary transition-colors [@media(hover:hover)]:hover:text-primary/80 motion-reduce:transition-none"
            >
              <Github className="w-4 h-4" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ) : null}
    </SurfaceCard>
  );
}

export default function MeetTheTeam() {
  return (
    <div className={`${marketingSectionClass} meet-the-team min-w-0 max-w-full`}>
      <Reveal className="text-center mb-10 sm:mb-12 max-w-3xl mx-auto min-w-0">
        <h2
          id="meet-the-team-heading"
          className="text-[clamp(1.5rem,4vw+0.5rem,2.25rem)] font-bold text-text tracking-tight leading-tight mb-4 [overflow-wrap:anywhere]"
        >
          Meet the
          <span className="text-primary"> Team</span>
        </h2>
        <p className="text-base sm:text-lg md:text-xl text-text-light leading-relaxed [overflow-wrap:anywhere]">
          The people behind FeedEcho
        </p>
      </Reveal>

      <RevealStagger
        className="grid items-stretch min-w-0 max-w-[720px] mx-auto lg:max-w-none grid-cols-2 max-[339px]:grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-5 lg:gap-6 [@media(max-height:499px)_and_(min-width:680px)]:grid-cols-4"
        itemClassName="h-full min-w-0"
      >
        {TEAM.map((member) => (
          <TeamMemberCard key={member.name} member={member} />
        ))}
      </RevealStagger>

      <p className="mt-10 sm:mt-12 pt-8 pb-1 border-t border-neutral-200/60 text-center text-[0.8125rem] sm:text-sm lg:text-base text-text-light leading-relaxed max-w-2xl mx-auto [overflow-wrap:anywhere]">
        Supervised by{' '}
        <span className="font-medium text-text">{SUPERVISOR.name}</span>
        {' · '}
        {SUPERVISOR.university}
      </p>
    </div>
  );
}
