import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { User, LogOut, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useClickOutside } from '../../hooks/useClickOutside';

const navItems = [
  { label: 'Explore', to: '/host/explore' },
  { label: 'Sessions', to: '/sessions' },
  { label: 'Quiz', to: '/host/launch' },
  { label: 'Library', to: '/host/library' },
  { label: 'Space Race', to: '/host/space-race' },
  { label: 'Exit Ticket', to: '/host/exit-tickets' },
  { label: 'Reports', to: '/host/reports' },
];

/** Shared horizontal layout with navbar — keeps logo and page content left-aligned */
const TEACHER_PAGE_GUTTER = 'max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8';

const HostLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, userProfile } = useAuth();
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const profileDropdownRef = useRef(null);
  const menuPanelRef = useRef(null);
  const menuButtonRef = useRef(null);
  const menuJustOpenedRef = useRef(false);

  useEffect(() => {
    setIsMenuOpen(false);
    setProfileOpen(false);
  }, [location]);

  useEffect(() => {
    if (!isMenuOpen) {
      menuJustOpenedRef.current = false;
      return undefined;
    }

    menuJustOpenedRef.current = true;
    const releaseIgnoreId = window.setTimeout(() => {
      menuJustOpenedRef.current = false;
    }, 400);

    const onDocumentClick = (event) => {
      if (menuJustOpenedRef.current) return;
      if (!window.matchMedia('(max-width: 480px)').matches) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuPanelRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    };

    // Attach after the opening tap finishes so that same event cannot close the menu.
    let removeListener = () => {};
    const attachId = window.setTimeout(() => {
      document.addEventListener('click', onDocumentClick);
      removeListener = () => document.removeEventListener('click', onDocumentClick);
    }, 0);

    return () => {
      window.clearTimeout(releaseIgnoreId);
      window.clearTimeout(attachId);
      removeListener();
    };
  }, [isMenuOpen]);

  const closeProfileDropdown = useCallback(() => {
    setProfileOpen(false);
  }, []);

  useClickOutside(profileDropdownRef, closeProfileDropdown, isProfileOpen);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className={clsx('min-h-screen bg-background overflow-x-hidden max-w-full', 'text-text')}>
      {isMenuOpen && (
        <div
          role="presentation"
          className="hidden max-[480px]:block fixed inset-x-0 top-16 bottom-0 z-30 bg-black/20"
          onClick={() => {
            if (menuJustOpenedRef.current) return;
            setIsMenuOpen(false);
          }}
        />
      )}
      <header className="fixed inset-x-0 top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className={TEACHER_PAGE_GUTTER}>
          <div className="relative flex items-center h-16 w-full min-w-0 gap-2 lg:gap-8 xl:gap-12">
            <div className="relative z-10 flex h-16 min-w-0 shrink items-center max-[480px]:pointer-events-none">
              <img
                src="/FeedEcho-logo.png.png"
                alt="FeedEcho"
                className="h-40 w-auto max-w-[min(11rem,calc(100vw-8rem))] object-contain object-left mix-blend-multiply"
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

            <div className="flex shrink-0 items-center gap-1 ml-auto lg:ml-0">
              <div className="relative" ref={profileDropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  className="flex items-center space-x-2 min-h-11 px-3 py-2 rounded-lg border border-gray-200 hover:bg-primary-extralight transition-colors"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {userProfile?.firstName?.[0] || userProfile?.displayName?.[0] || 'H'}
                    </span>
                  </div>
                  <span className="hidden sm:inline text-sm font-medium text-gray-700">
                    {userProfile?.firstName || userProfile?.displayName || 'Host'}
                  </span>
                </button>

                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-soft-lg overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <p className="text-sm font-semibold text-gray-700">
                        {userProfile?.firstName || userProfile?.displayName || 'Host'}
                      </p>
                      <p className="text-xs text-gray-500">{userProfile?.email}</p>
                    </div>
                    <div className="py-1">
                      <button
                        type="button"
                        className="w-full flex items-center space-x-2 px-4 min-h-11 py-3 text-gray-600 hover:bg-primary-extralight"
                        onClick={() => {
                          setProfileOpen(false);
                          navigate('/host/profile');
                        }}
                      >
                        <User className="w-4 h-4" />
                        <span>Profile</span>
                      </button>
                    </div>
                    <div className="border-t border-gray-200">
                      <button
                        type="button"
                        className="w-full flex items-center space-x-2 px-4 min-h-11 py-3 text-red-600 hover:bg-red-50"
                        onClick={handleLogout}
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsMenuOpen((prev) => {
                    if (!prev) return true;
                    if (menuJustOpenedRef.current) return true;
                    return false;
                  });
                }}
                aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={isMenuOpen}
                className="lg:hidden relative z-50 min-h-11 min-w-11 p-2 rounded-lg hover:bg-neutral-100 transition-colors inline-flex items-center justify-center"
              >
                {isMenuOpen ? (
                  <X className="w-6 h-6 text-neutral-600" />
                ) : (
                  <Menu className="w-6 h-6 text-neutral-600" />
                )}
              </button>
            </div>
          </div>

          {isMenuOpen && (
            <nav
              ref={menuPanelRef}
              className="lg:hidden relative z-50 py-3 border-t border-gray-200"
            >
              <div className="flex flex-col space-y-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center min-h-11 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                        isActive
                          ? 'bg-[#6D415F] text-white shadow-soft'
                          : 'text-neutral-600 hover:bg-[#6D415F]/10 hover:text-[#6D415F]'
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </nav>
          )}
        </div>
      </header>

      <main className="pt-24 pb-12">
        <div className={TEACHER_PAGE_GUTTER}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default HostLayout;
