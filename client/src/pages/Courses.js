import React from 'react';
import { Reveal, RevealStagger } from '../components/Reveal';
import {
  SurfaceCard,
  SurfaceCardIcon,
  marketingHeroClass,
  marketingSectionClass,
  marketingSectionBottomClass,
} from '../components/marketing/SurfaceCard';
import { MarketingHeroBackdrop } from '../components/marketing/MarketingHeroBackdrop';
import {
  MessageCircle,
  ClipboardCheck,
  Zap,
  Trophy,
  Shield,
  Users,
  GraduationCap,
  Briefcase,
  Mic2,
} from 'lucide-react';

const About = () => {
  const highlights = [
    {
      title: 'Anonymous Questions',
      description:
        'Participants can ask questions anonymously during session, helping shy or introverted learners participate confidently.',
      icon: MessageCircle,
    },
    {
      title: 'Exit Tickets',
      description:
        'Collect quick reflections at the end of session to check understanding and plan the next lesson with clarity.',
      icon: ClipboardCheck,
    },
    {
      title: 'Live Quizzes',
      description:
        'Run real-time quizzes to measure comprehension instantly and keep momentum high throughout the lesson.',
      icon: Zap,
    },
    {
      title: 'Space Race Engagement',
      description:
        'Turn practice into a fun competition with improve focus and participation.',
      icon: Trophy,
    },
  ];

  const audiences = [
    {
      title: 'Educators',
      description:
        'University lecturers and teachers who want to measure comprehension in real time without disrupting the flow of class.',
      icon: GraduationCap,
    },
    {
      title: 'Corporate Trainers',
      description:
        'Workshop facilitators and L&D teams who need live engagement data from participants during training sessions.',
      icon: Briefcase,
    },
    {
      title: 'Speakers and Hosts',
      description:
        'Seminar hosts, webinar presenters, and panel moderators who want an audience that participates, not just listens.',
      icon: Mic2,
    },
  ];

  const principles = [
    {
      title: 'Safe by Design',
      description:
        'Every interaction is designed to reduce pressure. Anonymous features mean honest responses — especially for audiences who hesitate to speak up in group settings.',
      icon: Shield,
    },
    {
      title: 'Speaker-Audience Productivity',
      description:
        'Less guesswork for the speaker, more clarity for the audience. FeedEcho turns one-way sessions into live two-way conversations.',
      icon: Users,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden">
        <MarketingHeroBackdrop />
        <div className={marketingHeroClass}>
          <Reveal immediate className="relative z-10 text-center max-w-3xl mx-auto">
            <div className="marketing-hero-copy-panel">
              <h1 className="text-4xl md:text-5xl font-bold text-text tracking-tight leading-tight mb-5">
                About
                <span className="text-primary">
                  {' '}
                  FeedEcho
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-text leading-relaxed mb-8">
                FeedEcho was built around one observation — the gap between what a
                speaker intends and what an audience understands is invisible in real
                time. We built a platform to close that gap, live, during the session,
                not after. Hosts get a clear signal of who is following along, and
                participants get simple ways to speak up without interrupting the flow.
                The goal is the same in every room: fewer assumptions, more shared
                understanding, while the conversation is still happening.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a href="#built-for-engagement" className="btn-marketing-secondary">
                  See How It Works
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section
        id="built-for-engagement"
        className="relative bg-white/40 border-y border-neutral-200/60 scroll-mt-20"
      >
        <div className={marketingSectionClass}>
          <Reveal className="text-center mb-10 sm:mb-12 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-text tracking-tight leading-tight mb-4">
              Built for Engagement
            </h2>
            <p className="text-lg sm:text-xl text-text-light leading-relaxed">
              Every feature is designed around one goal — making sure no participant
              is left behind, whether they are in a lecture hall, a Zoom call, or a
              boardroom.
            </p>
          </Reveal>

          <RevealStagger
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
            itemClassName="h-full"
          >
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <SurfaceCard key={item.title}>
                  <SurfaceCardIcon className="w-14 h-14 mb-5">
                    <Icon className="w-7 h-7" />
                  </SurfaceCardIcon>
                  <h3 className="text-lg font-semibold text-text mb-2 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-sm sm:text-base text-text-light leading-relaxed">
                    {item.description}
                  </p>
                </SurfaceCard>
              );
            })}
          </RevealStagger>
        </div>
      </section>

      <section className="relative">
        <div className={marketingSectionClass}>
          <Reveal className="text-center mb-10 sm:mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-text tracking-tight leading-tight mb-4">
              Who Uses FeedEcho?
            </h2>
          </Reveal>
          <RevealStagger
            className="grid md:grid-cols-3 gap-4 sm:gap-6"
            itemClassName="h-full"
          >
            {audiences.map((item) => {
              const Icon = item.icon;
              return (
                <SurfaceCard key={item.title}>
                  <SurfaceCardIcon className="w-12 h-12 mb-5">
                    <Icon className="w-6 h-6" />
                  </SurfaceCardIcon>
                  <h3 className="text-xl sm:text-2xl font-semibold text-text mb-3 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-text-light leading-relaxed">{item.description}</p>
                </SurfaceCard>
              );
            })}
          </RevealStagger>
        </div>
      </section>

      <section className="relative">
        <div className={marketingSectionBottomClass}>
          <RevealStagger
            className="grid md:grid-cols-2 gap-4 sm:gap-6"
            itemClassName="h-full"
          >
            {principles.map((item) => {
              const Icon = item.icon;
              return (
                <SurfaceCard key={item.title}>
                  <SurfaceCardIcon className="w-12 h-12 mb-5">
                    <Icon className="w-6 h-6" />
                  </SurfaceCardIcon>
                  <h3 className="text-xl sm:text-2xl font-semibold text-text mb-3 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-text-light leading-relaxed">{item.description}</p>
                </SurfaceCard>
              );
            })}
          </RevealStagger>
        </div>
      </section>
    </div>
  );
};

export default About;
