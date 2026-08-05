import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Reveal, RevealStagger } from '../components/Reveal';
import {
  SurfaceCard,
  SurfaceCardIcon,
  marketingHeroClass,
  marketingSectionClass,
  marketingSectionBottomClass,
} from '../components/marketing/SurfaceCard';
import {
  BookOpen,
  Users,
  Award,
  ArrowRight,
  TrendingUp,
  Zap,
  Sparkles,
  Rocket,
  MessageCircle,
} from 'lucide-react';

const Home = () => {
  const { userProfile, activePortal } = useAuth();
  // Portal is set at login (host vs audience); do not infer from email/profile.role
  const isAudienceSession = activePortal === 'student';
  const isHostSession = activePortal === 'teacher';
  const isLoggedIn = Boolean(userProfile) && (isAudienceSession || isHostSession);

  const features = [
    {
      icon: BookOpen,
      title: 'Live Quizzes & Space Race',
      description:
        'Run real-time quizzes and competitive Space Race-style activities that energize the room.',
    },
    {
      icon: Users,
      title: 'Anonymous Questions',
      description:
        'Participants can ask questions anonymously during session to participate without fear.',
    },
    {
      icon: Award,
      title: 'Exit Tickets',
      description:
        'Wrap up with quick exit tickets to check understanding and guide the next lesson.',
    },
    {
      icon: TrendingUp,
      title: 'Participation Insights',
      description:
        'See engagement at a glance to support better pacing and student outcomes.',
    },
  ];

  const highlights = [
    {
      icon: Zap,
      title: 'Real-Time Quizzes',
      description: 'Live questions, instant results',
    },
    {
      icon: Sparkles,
      title: 'AI Generation',
      description: 'Auto-create questions from any topic',
    },
    {
      icon: Rocket,
      title: 'Space Race',
      description: 'Team-based gamified competition',
    },
    {
      icon: MessageCircle,
      title: 'Anonymous Feedback',
      description: 'Exit tickets and live chat',
    },
  ];

  const howItWorks = [
    {
      step: 1,
      title: 'Host Creates a Session',
      description:
        'Sign in, create a session, and share a unique 6-character code with your audience.',
      icon: Users,
    },
    {
      step: 2,
      title: 'Audience Joins Instantly',
      description:
        'Participants enter the code on any device. No app download, no account needed.',
      icon: BookOpen,
    },
    {
      step: 3,
      title: 'Engage and Get Insights',
      description:
        'Run quizzes, Space Race, or open anonymous chat — results appear live on your dashboard.',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* 1. Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-transparent to-transparent"
          aria-hidden
        />
        <div className={marketingHeroClass}>
          <Reveal immediate className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-text tracking-tight leading-tight mb-5">
              Close the Gap.
              <span className="text-primary">{' '}In Real Time.</span>
            </h1>
            <p className="text-lg sm:text-xl text-text-light leading-relaxed mb-8 max-w-3xl mx-auto">
              FeedEcho is a live engagement platform for speakers and audiences —
              in classrooms, seminars, webinars, and corporate training sessions.
            </p>

            {!isLoggedIn ? (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/join" className="btn-marketing-primary">
                  <span>Join a Session</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link to="/host/signin" className="btn-marketing-secondary">
                  <span>Host Login</span>
                </Link>
              </div>
            ) : isAudienceSession ? (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/audience/home" className="btn-marketing-primary">
                  <span>Go to Dashboard</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link to="/about" className="btn-marketing-secondary">
                  <BookOpen className="w-5 h-5" />
                  <span>About FeedEcho</span>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/host/explore" className="btn-marketing-primary">
                  <span>Go to Explore</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link to="/about" className="btn-marketing-secondary">
                  <BookOpen className="w-5 h-5" />
                  <span>About FeedEcho</span>
                </Link>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* 2. Feature icon row #1 */}
      <section className="relative">
        <div className={marketingSectionBottomClass}>
          <RevealStagger
            className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6"
            itemClassName="h-full"
          >
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <SurfaceCard key={item.title} className="text-center">
                  <SurfaceCardIcon className="w-12 h-12 mx-auto mb-4">
                    <Icon className="w-6 h-6" />
                  </SurfaceCardIcon>
                  <h3 className="text-base sm:text-lg font-semibold text-text mb-1.5 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-sm text-text-light leading-relaxed">{item.description}</p>
                </SurfaceCard>
              );
            })}
          </RevealStagger>
        </div>
      </section>

      {/* 3–4. Built for Every Room + feature cards */}
      <section className="relative bg-white/40 border-y border-neutral-200/60">
        <div className={marketingSectionClass}>
          <Reveal className="text-center mb-10 sm:mb-12 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-text tracking-tight leading-tight mb-4">
              Built for Every Room. Not Just Classrooms.
            </h2>
            <p className="text-lg sm:text-xl text-text-light leading-relaxed">
              Whether you are teaching a university lecture, running a corporate
              workshop, or hosting a webinar — FeedEcho gives every participant a
              voice.
            </p>
          </Reveal>

          <RevealStagger
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
            itemClassName="h-full"
          >
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <SurfaceCard key={feature.title}>
                  <SurfaceCardIcon className="w-14 h-14 mb-5">
                    <Icon className="w-7 h-7" />
                  </SurfaceCardIcon>
                  <h3 className="text-lg font-semibold text-text mb-2 leading-snug">
                    {feature.title}
                  </h3>
                  <p className="text-sm sm:text-base text-text-light leading-relaxed">
                    {feature.description}
                  </p>
                </SurfaceCard>
              );
            })}
          </RevealStagger>
        </div>
      </section>

      {/* 5. How It Works */}
      <section className="relative">
        <div className={marketingSectionClass}>
          <Reveal className="text-center mb-10 sm:mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-text tracking-tight leading-tight mb-4">
              How It Works
            </h2>
            <p className="text-lg sm:text-xl text-text-light leading-relaxed">
              Get started in three simple steps
            </p>
          </Reveal>

          <RevealStagger
            className="grid md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8"
            itemClassName="h-full"
          >
            {howItWorks.map((item) => {
              const Icon = item.icon;
              return (
                <SurfaceCard key={item.step} className="text-center sm:text-left">
                  <div className="flex flex-col items-center sm:items-start">
                    <div
                      className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center mb-4 shadow-sm transition-transform duration-200 ease-out group-hover:scale-110"
                      aria-hidden
                    >
                      <span className="text-lg font-bold leading-none">{item.step}</span>
                    </div>
                    <SurfaceCardIcon className="w-12 h-12 mb-5">
                      <Icon className="w-6 h-6" />
                    </SurfaceCardIcon>
                  </div>
                  <h3 className="text-xl font-semibold text-text mb-3 leading-snug">
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

export default Home;
