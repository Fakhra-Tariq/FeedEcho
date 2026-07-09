import React from 'react';
import { Link } from 'react-router-dom';
import {
  MessageCircle,
  ClipboardCheck,
  Zap,
  Trophy,
  Shield,
  Users,
  ArrowRight
} from 'lucide-react';

const About = () => {
  const highlights = [
    {
      title: 'Anonymous Questions',
      description:
        'Students can ask questions anonymously during class, helping shy or introverted learners participate confidently.',
      icon: MessageCircle,
      color: { bg: 'bg-primary/10', text: 'text-primary' }
    },
    {
      title: 'Exit Tickets',
      description:
        'Collect quick reflections at the end of class to check understanding and plan the next lesson with clarity.',
      icon: ClipboardCheck,
      color: { bg: 'bg-secondary/10', text: 'text-secondary' }
    },
    {
      title: 'Live Quizzes',
      description:
        'Run real-time quizzes to measure comprehension instantly and keep momentum high throughout the lesson.',
      icon: Zap,
      color: { bg: 'bg-primary/10', text: 'text-primary' }
    },
    {
      title: 'Space Race Engagement',
      description:
        'Turn practice into a fun competition with improve focus and participation.',
      icon: Trophy,
      color: { bg: 'bg-secondary/10', text: 'text-secondary' }
    }
  ];

  const principles = [
    {
      title: 'Safe by Design',
      description:
        'A supportive environment that reduces anxiety and encourages participation without fear of judgement.',
      icon: Shield
    },
    {
      title: 'Teacher–Student Productivity',
      description:
        'Less guesswork, more insight — teachers get instant feedback, students get clearer support in real time.',
      icon: Users
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <section className="relative bg-background overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-text mb-6">
              About
              <span className="text-primary">
                {' '}
                FeedEcho
              </span>
            </h1>
            <p className="text-xl text-text-light mb-8 max-w-3xl mx-auto">
              FeedEcho is a real-time classroom interaction tool designed to increase participation and improve teacher–student productivity.
              It creates a safe, anonymous space where every student can engage — especially those who prefer not to speak up in front of the whole class.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/join"
                className="px-8 py-4 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-all duration-200 inline-flex items-center justify-center"
              >
                Join Session
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link
                to="/teacher/signin"
                className="px-8 py-4 bg-white text-primary border-2 border-primary rounded-lg font-medium hover:bg-primary/10 transition-colors inline-flex items-center justify-center"
              >
                Teacher Login
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-text mb-4">
              Built for Engagement
            </h2>
            <p className="text-xl text-text-light max-w-3xl mx-auto">
              Everything is focused on participation, understanding, and classroom momentum — without course-selling or marketplace noise.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="group">
                  <div
                    className={`w-16 h-16 ${item.color.bg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200`}
                  >
                    <Icon className={`w-8 h-8 ${item.color.text}`} />
                  </div>
                  <h3 className="text-xl font-semibold text-text mb-3">{item.title}</h3>
                  <p className="text-text-light">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            {principles.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-white rounded-2xl p-8 shadow-soft-lg">
                  <Icon className="w-10 h-10 text-primary mb-4" />
                  <h3 className="text-2xl font-semibold text-text mb-3">{item.title}</h3>
                  <p className="text-text-light">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
