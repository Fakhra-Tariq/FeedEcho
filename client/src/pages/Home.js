import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  BookOpen, 
  GraduationCap, 
  Users, 
  Award, 
  Play, 
  Star,
  ArrowRight,
  CheckCircle,
  TrendingUp
} from 'lucide-react';

const Home = () => {
  const { userProfile } = useAuth();

  const featureColorClasses = {
    primary: { bg: 'bg-[#6D415F]/10', text: 'text-[#6D415F]' },
    secondary: { bg: 'bg-secondary/10', text: 'text-secondary' },
    accent: { bg: 'bg-secondary', text: 'text-white' },
    success: { bg: 'bg-green-100', text: 'text-green-600' }
  };

  const features = [
    {
      icon: BookOpen,
      title: 'Live Quizzes & Space Race',
      description: 'Run real-time quizzes and competitive Space Race-style activities that energize the room.',
      color: 'primary'
    },
    {
      icon: Users,
      title: 'Anonymous Questions',
      description: 'Students can ask questions anonymously during class to participate without fear.',
      color: 'secondary'
    },
    {
      icon: Award,
      title: 'Exit Tickets',
      description: 'Wrap up with quick exit tickets to check understanding and guide the next lesson.',
      color: 'accent'
    },
    {
      icon: TrendingUp,
      title: 'Participation Insights',
      description: 'See engagement at a glance to support better pacing and student outcomes.',
      color: 'success'
    }
  ];

  const stats = [
    { label: 'Classroom Sessions', value: '10,000+', icon: Users },
    { label: 'Teachers Supported', value: '500+', icon: GraduationCap },
    { label: 'Live Activities', value: '1,000+', icon: BookOpen },
    { label: 'Participation Boost', value: '95%', icon: Award }
  ];

  const testimonials = [
    {
      name: 'Sarah Afridi',
      role: 'Student',
      content: 'FeedEcho makes it easy to ask questions anonymously. I participate more, even when I feel shy in class.',
      rating: 5,
      avatar: 'SA'
    },
    {
      name: 'Dr. Saif Khan',
      role: 'Instructor',
      content: 'I use FeedEcho for quick checks, exit tickets, and Space Race. Engagement is higher and I get instant feedback.',
      rating: 5,
      avatar: 'SK'
    },
    {
      name: 'Farah Naz',
      role: 'Student',
      content: 'The quizzes feel like a game, and the anonymous questions help our whole class learn without pressure.',
      rating: 5,
      avatar: 'FN'
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-background overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
                        <h1 className="text-4xl md:text-6xl font-bold text-text mb-6">
              Learn Without
              <span className="text-[#6D415F]">
                {' '}Limits
              </span>
            </h1>
            <p className="text-xl text-text-light mb-8 max-w-3xl mx-auto">
              Real-time classroom engagement tools for teachers and students — anonymous questions, live quizzes, exit tickets, and Space Race-style learning.
            </p>
            
            {!userProfile ? (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/student/join"
                  className="px-8 py-4 bg-[#6D415F] text-white rounded-lg font-medium hover:bg-[#6D415F]/90 transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  <span>Join Session</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/student/auth"
                  className="px-8 py-4 bg-white text-[#6D415F] border-2 border-[#6D415F] rounded-lg font-medium hover:bg-[#6D415F]/10 transition-colors flex items-center justify-center space-x-2"
                >
                  <span>Student Login</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/teacher/signin"
                  className="px-8 py-4 bg-white text-[#6D415F] border-2 border-[#6D415F] rounded-lg font-medium hover:bg-[#6D415F]/10 transition-colors flex items-center justify-center space-x-2"
                >
                  <ArrowRight className="w-5 h-5" />
                  <span>Teacher Login</span>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/dashboard"
                  className="px-8 py-4 bg-secondary text-white rounded-lg font-medium hover:opacity-90 transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/about"
                  className="px-8 py-4 bg-white text-[#6D415F] border-2 border-[#6D415F] rounded-lg font-medium hover:bg-[#6D415F]/10 transition-colors flex items-center justify-center space-x-2"
                >
                  <BookOpen className="w-5 h-5" />
                  <span>About FeedEcho</span>
                </Link>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} className="text-center">
                  <div className="w-12 h-12 bg-[#6D415F]/10 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-6 h-6 text-[#6D415F]" />
                  </div>
                  <div className="text-2xl font-bold text-text mb-1">{stat.value}</div>
                  <div className="text-sm text-text-light">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-text mb-4">
              Why Choose FeedEcho?
            </h2>
            <p className="text-xl text-text-light max-w-3xl mx-auto">
              Designed to increase participation, reduce anxiety, and improve teacher–student productivity.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              const color = featureColorClasses[feature.color] || featureColorClasses.primary;
              return (
                <div key={index} className="group">
                  <div className={`w-16 h-16 ${color.bg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200`}>
                    <Icon className={`w-8 h-8 ${color.text}`} />
                  </div>
                  <h3 className="text-xl font-semibold text-text mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-text-light">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-text mb-4">
              How It Works
            </h2>
            <p className="text-xl text-text-light">
              Get started in three simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: 1,
                title: 'Start a Session',
                description: 'Teachers launch a session for quizzes, exit tickets, and live interaction.',
                icon: Users
              },
              {
                step: 2,
                title: 'Students Join with Code',
                description: 'Students join with a code and can ask questions anonymously during class.',
                icon: BookOpen
              },
              {
                step: 3,
                title: 'Engage & Reflect',
                description: 'Run Space Race-style activities, live quizzes, and exit tickets for instant insights.',
                icon: TrendingUp
              }
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={index} className="relative">
                  <div className="bg-white rounded-2xl p-8 shadow-soft-lg h-full">
                    <div className="w-12 h-12 bg-[#6D415F]/10 rounded-full flex items-center justify-center mb-6">
                      <span className="text-xl font-bold text-[#6D415F]">{item.step}</span>
                    </div>
                    <Icon className="w-8 h-8 text-[#6D415F] mb-4" />
                    <h3 className="text-xl font-semibold text-text mb-3">
                      {item.title}
                    </h3>
                    <p className="text-text-light">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-text mb-4">
              What Our Users Say
            </h2>
            <p className="text-xl text-text-light">
              Join thousands of satisfied learners and instructors
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-white rounded-2xl p-8">
                <div className="flex items-center mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-secondary fill-current" />
                  ))}
                </div>
                <p className="text-text-light mb-6 italic">
                  "{testimonial.content}"
                </p>
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-[#6D415F] rounded-full flex items-center justify-center mr-4">
                    <span className="text-white font-semibold">{testimonial.avatar}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-text">{testimonial.name}</p>
                    <p className="text-sm text-text-light">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
