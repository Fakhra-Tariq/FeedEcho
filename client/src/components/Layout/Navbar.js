import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  BookOpen,
  User,
  LogOut,
  Menu,
  X,
  GraduationCap,
  Users,
  Settings,
  ChevronDown,
  Mail,
} from 'lucide-react';

const Navbar = () => {
  const { user, userProfile, activePortal, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsProfileDropdownOpen(false);
  }, [location]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const getDashboardLink = () => {
    // Prefer active portal (tab session) over profile.role — same email can be both roles
    if (activePortal === 'student') return '/audience/home';
    if (activePortal === 'teacher') return '/host/explore';
    if (!userProfile) return '/host/explore';
    switch (userProfile.role) {
      case 'teacher':
        return '/host/explore';
      case 'admin':
        return '/host/explore';
      default:
        return '/audience/home';
    }
  };

  const navLinks = [
    { name: 'Home', href: '/', icon: BookOpen },
    { name: 'About Us', href: '/about', icon: GraduationCap },
    { name: 'Contact Us', href: '/contact', icon: Mail },
  ];

  if (userProfile) {
    navLinks.push({ name: 'Dashboard', href: getDashboardLink(), icon: Users });
  }

  return (
    <nav className="bg-background/80 backdrop-blur-md shadow-soft sticky top-0 z-50 border-b border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo — unchanged */}
          <Link to="/" className="flex items-center space-x-2">
            <img
              src="/FeedEcho-logo.png.png"
              alt="FeedEcho"
              className="h-32 w-auto object-contain mix-blend-mode: multiply"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.href;

              return (
                <Link
                  key={link.name}
                  to={link.href}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-neutral-600 hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{link.name}</span>
                </Link>
              );
            })}
          </div>

          {/* User Menu — Login button removed; profile only when logged in */}
          <div className="hidden md:flex items-center space-x-4">
            {user && userProfile ? (
              <div className="relative">
                <button
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-neutral-100 transition-colors"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {userProfile.firstName?.charAt(0) ||
                        userProfile.displayName?.charAt(0) ||
                        'U'}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-neutral-700">
                    {userProfile.firstName || userProfile.displayName}
                  </span>
                  <ChevronDown className="w-4 h-4 text-neutral-500" />
                </button>

                {isProfileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-soft-lg border border-neutral-200 py-2">
                    <Link
                      to="/profile"
                      className="flex items-center space-x-2 px-4 py-2 text-text hover:bg-primary/5 hover:text-primary transition-colors"
                    >
                      <User className="w-4 h-4" />
                      <span>Profile</span>
                    </Link>
                    <Link
                      to="/settings"
                      className="flex items-center space-x-2 px-4 py-2 text-text hover:bg-primary/5 hover:text-primary transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </Link>
                    <div className="border-t border-neutral-200 my-2"></div>
                    <button
                      onClick={handleLogout}
                      className="flex items-center space-x-2 px-4 py-2 text-error-600 hover:bg-error-50 transition-colors w-full text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            {isMenuOpen ? (
              <X className="w-6 h-6 text-neutral-600" />
            ) : (
              <Menu className="w-6 h-6 text-neutral-600" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-neutral-200">
            <div className="flex flex-col space-y-2">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.href;

                return (
                  <Link
                    key={link.name}
                    to={link.href}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-secondary-100 text-secondary-600'
                        : 'text-neutral-600 hover:text-secondary-600 hover:bg-secondary-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{link.name}</span>
                  </Link>
                );
              })}

              {user && userProfile ? (
                <>
                  <div className="border-t border-neutral-200 my-2"></div>
                  <Link
                    to="/profile"
                    className="flex items-center space-x-2 px-3 py-2 text-text hover:text-secondary-600 hover:bg-secondary-100 rounded-lg transition-colors"
                  >
                    <User className="w-4 h-4" />
                    <span>Profile</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-2 px-3 py-2 text-error-600 hover:bg-error-50 rounded-lg transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
