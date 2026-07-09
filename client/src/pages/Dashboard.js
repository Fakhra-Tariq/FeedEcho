import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  BookOpen, 
  Users, 
  TrendingUp, 
  Clock, 
  Award,
  Play,
  Calendar,
  BarChart3,
  Plus,
  Eye
} from 'lucide-react';
import { ClipLoader } from 'react-spinners';

const Dashboard = () => {
  const { userProfile, loading } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [enrolledActivities, setEnrolledActivities] = useState([]);
  const [createdActivities, setCreatedActivities] = useState([]);

  useEffect(() => {
    if (userProfile) {
      fetchDashboardData();
    }
  }, [userProfile]);

  const fetchDashboardData = async () => {
    try {
      // This would be replaced with actual API calls
      // For now, we'll use mock data
      const mockStats = userProfile.role === 'teacher' ? {
        totalQuizzes: 12,
        totalStudents: 156,
        totalSessions: 45,
        avgScore: 78
      } : userProfile.role === 'admin' ? {
        totalUsers: 10500,
        totalQuizzes: 1200,
        totalSessions: 4500,
        activeUsers: 3200
      } : {
        enrolledQuizzes: 8,
        completedQuizzes: 3,
        totalHours: 24,
        certificates: 3
      };

      const mockActivity = [
        { type: 'quiz_completed', title: 'Introduction to React Quiz', time: '2 hours ago' },
        { type: 'assignment_submitted', title: 'JavaScript Fundamentals', time: '5 hours ago' },
        { type: 'session_joined', title: 'Advanced CSS Session', time: '1 day ago' }
      ];

      const mockActivities = [
        {
          id: 1,
          title: 'Introduction to React Quiz',
          instructor: 'John Doe',
          progress: 75,
          thumbnail: 'https://via.placeholder.com/300x200?text=React',
          nextLesson: 'Hooks Deep Dive'
        },
        {
          id: 2,
          title: 'JavaScript Fundamentals',
          instructor: 'Jane Smith',
          progress: 100,
          thumbnail: 'https://via.placeholder.com/300x200?text=JavaScript',
          nextLesson: 'Quiz Completed'
        }
      ];

      setStats(mockStats);
      setRecentActivity(mockActivity);
      setEnrolledActivities(mockActivities);
      
      if (userProfile.role === 'teacher') {
        setCreatedActivities([
          {
            id: 1,
            title: 'Web Development Quiz',
            students: 45,
            sessions: 12,
            avgScore: 85
          },
          {
            id: 2,
            title: 'React Advanced Patterns',
            students: 23,
            sessions: 8,
            avgScore: 79
          }
        ]);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ClipLoader color="#8E7CC3" size={50} />
      </div>
    );
  }

  const renderStudentDashboard = () => (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.enrolledQuizzes || 0}</span>
          </div>
          <p className="text-text-light">Enrolled Quizzes</p>
        </div>

        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Award className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.completedQuizzes || 0}</span>
          </div>
          <p className="text-text-light">Completed Quizzes</p>
        </div>

        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-secondary" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.totalHours || 0}</span>
          </div>
          <p className="text-text-light">Learning Hours</p>
        </div>

        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
              <Award className="w-6 h-6 text-secondary" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.certificates || 0}</span>
          </div>
          <p className="text-text-light">Certificates</p>
        </div>
      </div>

      {/* Continue Learning */}
      <div className="bg-white rounded-xl shadow-soft p-6">
        <h3 className="text-xl font-semibold text-text mb-6">Continue Learning</h3>
        <div className="grid md:grid-cols-2 gap-6">
          {enrolledActivities.map((activity) => (
            <div key={activity.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex space-x-4">
                <img src={activity.thumbnail} alt={activity.title} className="w-24 h-16 object-cover rounded-lg" />
                <div className="flex-1">
                  <h4 className="font-semibold text-text">{activity.title}</h4>
                  <p className="text-sm text-text-light mb-2">by {activity.instructor}</p>
                  <div className="mb-2">
                    <div className="flex justify-between text-sm text-text-light mb-1">
                      <span>Progress</span>
                      <span>{activity.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${activity.progress}%` }}
                      ></div>
                    </div>
                  </div>
                  <p className="text-sm text-text-light">Next: {activity.nextLesson}</p>
                </div>
                <button className="self-center">
                  <Play className="w-8 h-8 text-primary hover:text-primary/80" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-soft p-6">
        <h3 className="text-xl font-semibold text-text mb-6">Recent Activity</h3>
        <div className="space-y-4">
          {recentActivity.map((activity, index) => (
            <div key={index} className="flex items-center space-x-4 p-3 hover:bg-gray-50 rounded-lg">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-text">{activity.title}</p>
                <p className="text-sm text-text-light">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderTeacherDashboard = () => (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.totalQuizzes || 0}</span>
          </div>
          <p className="text-text-light">Total Quizzes</p>
        </div>

        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.totalStudents || 0}</span>
          </div>
          <p className="text-text-light">Total Students</p>
        </div>

        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-secondary" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.totalSessions || 0}</span>
          </div>
          <p className="text-text-light">Total Sessions</p>
        </div>

        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
              <Award className="w-6 h-6 text-secondary" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.avgScore || 0}</span>
          </div>
          <p className="text-text-light">Average Score</p>
        </div>
      </div>

      {/* My Activities */}
      <div className="bg-white rounded-xl shadow-soft p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-text">My Quizzes & Sessions</h3>
          <button className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
            <span>Create Quiz</span>
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {createdActivities.map((activity) => (
            <div key={activity.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <h4 className="font-semibold text-text mb-3">{activity.title}</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-text-light">Students</p>
                  <p className="font-semibold">{activity.students}</p>
                </div>
                <div>
                  <p className="text-text-light">Sessions</p>
                  <p className="font-semibold">{activity.sessions}</p>
                </div>
                <div>
                  <p className="text-text-light">Avg Score</p>
                  <p className="font-semibold">{activity.avgScore}%</p>
                </div>
              </div>
              <div className="flex space-x-2 mt-4">
                <button className="flex-1 px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors text-sm">
                  <Eye className="w-4 h-4 inline mr-1" />
                  View
                </button>
                <button className="flex-1 px-3 py-2 bg-secondary/10 text-secondary rounded-lg hover:bg-secondary/20 transition-colors text-sm">
                  <BarChart3 className="w-4 h-4 inline mr-1" />
                  Analytics
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAdminDashboard = () => (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.totalUsers || 0}</span>
          </div>
          <p className="text-text-light">Total Users</p>
        </div>

        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.totalQuizzes || 0}</span>
          </div>
          <p className="text-text-light">Total Quizzes</p>
        </div>

        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-secondary" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.totalSessions || 0}</span>
          </div>
          <p className="text-text-light">Total Sessions</p>
        </div>

        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-secondary" />
            </div>
            <span className="text-2xl font-bold text-text">{stats?.activeUsers || 0}</span>
          </div>
          <p className="text-text-light">Active Users</p>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-white rounded-xl shadow-soft p-6">
        <h3 className="text-xl font-semibold text-text mb-6">Admin Actions</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
            <Users className="w-8 h-8 text-primary mb-2" />
            <h4 className="font-semibold text-text">Manage Users</h4>
            <p className="text-sm text-text-light">View and manage all users</p>
          </button>
          <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
            <BookOpen className="w-8 h-8 text-primary mb-2" />
            <h4 className="font-semibold text-text">Manage Quizzes</h4>
            <p className="text-sm text-text-light">Review and moderate quizzes</p>
          </button>
          <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
            <BarChart3 className="w-8 h-8 text-primary mb-2" />
            <h4 className="font-semibold text-text">Analytics</h4>
            <p className="text-sm text-text-light">View platform analytics</p>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text mb-2">
            Welcome back, {userProfile?.firstName || userProfile?.displayName}!
          </h1>
          <p className="text-text-light">
            {userProfile?.role === 'teacher' 
              ? 'Manage your quizzes and track student progress'
              : userProfile?.role === 'admin'
              ? 'Manage platform and view analytics'
              : 'Continue your learning journey'
            }
          </p>
        </div>

        {/* Dashboard Content */}
        {userProfile?.role === 'teacher' && renderTeacherDashboard()}
        {userProfile?.role === 'admin' && renderAdminDashboard()}
        {userProfile?.role === 'student' && renderStudentDashboard()}
      </div>
    </div>
  );
};

export default Dashboard;
