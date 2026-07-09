import React, { useCallback, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useClickOutside } from '../../hooks/useClickOutside';

const navItems = [
  { label: 'Explore', to: '/teacher/explore' },
  { label: 'Sessions', to: '/sessions' },
  { label: 'Quiz', to: '/teacher/launch' },
  { label: 'Library', to: '/teacher/library' },
  { label: 'Space Race', to: '/teacher/space-race' },
  { label: 'Exit Ticket', to: '/teacher/exit-tickets' },
  { label: 'Reports', to: '/teacher/reports' },
];

/** Shared horizontal layout with navbar — keeps logo and page content left-aligned */
const TEACHER_PAGE_GUTTER = 'max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8';

const TeacherLayout = () => {
  const navigate = useNavigate();
  const { logout, userProfile } = useAuth();
  const [isProfileOpen, setProfileOpen] = useState(false);
  const profileDropdownRef = useRef(null);

  const closeProfileDropdown = useCallback(() => {
    setProfileOpen(false);
  }, []);

  useClickOutside(profileDropdownRef, closeProfileDropdown, isProfileOpen);

  const handleLogout = async () => {
    await logout();
    navigate('/teacher/signin');
  };

  return (
    <div className={clsx('min-h-screen bg-background', 'text-text')}>
      <header className="fixed inset-x-0 top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className={TEACHER_PAGE_GUTTER}>
          <div className="relative flex items-center h-16 w-full gap-8 lg:gap-12">
            <div className="relative z-10 flex h-16 shrink-0 items-center">
              <img
                src="/FeedEcho-logo.png.png"
                alt="FeedEcho"
                className="h-40 w-auto max-w-[11rem] object-contain object-left mix-blend-mode: multiply"
              />
            </div>

            <nav className="hidden lg:flex flex-1 items-center justify-center gap-3 min-w-0">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      'shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive ? 'bg-[#6D415F] text-white shadow-soft' : 'hover:bg-[#6D415F]/10 hover:text-[#6D415F]'
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex shrink-0 items-center">
              <div className="relative" ref={profileDropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-primary-extralight transition-colors"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {userProfile?.firstName?.[0] || userProfile?.displayName?.[0] || 'T'}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {userProfile?.firstName || userProfile?.displayName || 'Teacher'}
                  </span>
                </button>

                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-soft-lg overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <p className="text-sm font-semibold text-gray-700">
                        {userProfile?.firstName || userProfile?.displayName || 'Teacher'}
                      </p>
                      <p className="text-xs text-gray-500">{userProfile?.email}</p>
                    </div>
                    <div className="py-1">
                      <button
                        type="button"
                        className="w-full flex items-center space-x-2 px-4 py-2 text-gray-600 hover:bg-primary-extralight"
                        onClick={() => {
                          setProfileOpen(false);
                          navigate('/teacher/profile');
                        }}
                      >
                        <User className="w-4 h-4" />
                        <span>Profile</span>
                      </button>
                    </div>
                    <div className="border-t border-gray-200">
                      <button
                        type="button"
                        className="w-full flex items-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50"
                        onClick={handleLogout}
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile navigation */}
      <nav className="lg:hidden fixed top-16 inset-x-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-md">
        <div className={`${TEACHER_PAGE_GUTTER} flex overflow-x-auto py-2 gap-3`}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'shrink-0 px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200',
                  isActive
                    ? 'bg-[#6D415F] text-white shadow-soft'
                    : 'text-neutral-500 hover:text-[#6D415F] hover:bg-[#6D415F]/10'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="pt-32 lg:pt-28 pb-12">
        <div className={TEACHER_PAGE_GUTTER}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default TeacherLayout;
