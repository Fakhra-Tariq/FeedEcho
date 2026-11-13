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
    <SurfaceCard className="flex flex-col items-center text-center min-w-0">
      <div
        aria-hidden="true"
        className="flex items-center justify-center shrink-0 rounded-full bg-[#F1E4EC] text-[#6B3A5C] font-medium text-[18px] w-[52px] h-[52px] sm:w-16 sm:h-16 mb-4 ring-2 ring-white shadow-[0_0_0_3px_#E3D3DD]"
      >
        {initials}
      </div>
      <h3 className="text-[14px] sm:text-base font-medium text-text leading-snug break-words w-full">
        {member.name}
      </h3>
      <p className="text-[13px] font-medium text-primary mt-1 leading-snug break-words w-full">
        {member.role}
      </p>
      {member.bio ? (
        <p className="mt-3 text-[13px] text-text-light leading-relaxed line-clamp-3 w-full">
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
              className="text-primary hover:text-primary/80 transition-colors"
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
              className="text-primary hover:text-primary/80 transition-colors"
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
    <div className={marketingSectionClass}>
      <Reveal className="text-center mb-10 sm:mb-12 max-w-3xl mx-auto">
        <h2
          id="meet-the-team-heading"
          className="text-[clamp(1.5rem,4vw+0.5rem,2.25rem)] font-bold text-text tracking-tight leading-tight mb-4"
        >
          Meet the
          <span className="text-primary"> Team</span>
        </h2>
        <p className="text-base sm:text-lg md:text-xl text-text-light leading-relaxed">
          The people behind FeedEcho
        </p>
      </Reveal>

      <RevealStagger
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
        itemClassName="h-full min-w-0"
      >
        {TEAM.map((member) => (
          <TeamMemberCard key={member.name} member={member} />
        ))}
      </RevealStagger>

      <p className="mt-10 sm:mt-12 pt-8 border-t border-neutral-200/60 text-center text-sm sm:text-base text-text-light leading-relaxed max-w-2xl mx-auto">
        Supervised by{' '}
        <span className="font-medium text-text">{SUPERVISOR.name}</span>
        {' · '}
        {SUPERVISOR.university}
      </p>
    </div>
  );
}
