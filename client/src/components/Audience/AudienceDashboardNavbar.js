import React, { useCallback, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bot, ChevronDown, Home, LogOut, Menu, TrendingUp, User, X } from 'lucide-react';
import AudienceAvatar from '../AudienceAvatar';
import { useClickOutside } from '../../hooks/useClickOutside';
import { getStoredAudienceSession } from '../../utils/audienceSession';

export default function AudienceDashboardNavbar({
  displayName,
  displayEmail,
  onLogout,
  onChatbotToggle,
  chatbotOpen = false,
}) {
  const location = useLocation();
  const session = getStoredAudienceSession();
  const name = displayName || session?.name || 'Audience';
  const email = displayEmail || session?.email || '';
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const profileDropdownRef = useRef(null);
  const closeProfileDropdown = useCallback(() => {
    setShowProfileDropdown(false);
  }, []);
  useClickOutside(profileDropdownRef, closeProfileDropdown, showProfileDropdown);

  const isHome = location.pathname === '/audience/home';
  const isProgress = location.pathname === '/audience/progress';

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 min-w-0 gap-2 max-[480px]:gap-1">
          <div className="flex items-center space-x-3 min-w-0 shrink max-[480px]:order-2 max-[480px]:h-16 max-[480px]:overflow-hidden">
            <img
              src="/FeedEcho-logo.png.png"
              alt="FeedEcho"
              className="h-32 w-auto object-contain object-left mix-blend-multiply min-[481px]:max-md:h-12 min-[481px]:max-md:max-w-[min(8.5rem,calc(100vw-11rem))] max-[480px]:h-40 max-[480px]:max-w-[min(11rem,calc(100vw-12.5rem))]"
            />
          </div>

          <div className="hidden md:flex items-center space-x-6">
            <a
              href="/audience/home"
              className={`flex items-center space-x-2 ${
                isHome ? 'text-primary font-medium' : 'text-gray-700 hover:text-primary transition-colors'
              }`}
            >
              <Home className="w-4 h-4" />
              <span className="font-medium">Home</span>
            </a>
            <Link
              to="/audience/progress"
              className={`flex items-center space-x-2 ${
                isProgress ? 'text-primary font-medium' : 'text-gray-700 hover:text-primary transition-colors'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span className="font-medium">Progress</span>
            </Link>
          </div>

          <div
            className="hidden max-[480px]:block max-[480px]:flex-1 max-[480px]:order-3 max-[480px]:min-w-0"
            aria-hidden="true"
          />

          <div className="flex items-center space-x-3 max-md:space-x-1 shrink-0 max-[480px]:contents">
            {typeof onChatbotToggle === 'function' && (
              <button
                type="button"
                onClick={onChatbotToggle}
                className="p-2 rounded-lg text-gray-600 hover:text-primary transition-colors min-h-11 min-w-11 inline-flex items-center justify-center max-[480px]:order-4 max-[480px]:shrink-0"
              >
                <Bot className="w-5 h-5" />
              </button>
            )}

            <div className="relative max-[480px]:order-5 max-[480px]:shrink-0" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() => setShowProfileDropdown((prev) => !prev)}
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors min-h-11 max-[480px]:min-w-11 max-[480px]:justify-center"
              >
                <AudienceAvatar name={name} />
                <span className="font-medium text-text max-md:max-w-[4.5rem] max-md:truncate max-[480px]:hidden">
                  {name.split(' ')[0] || 'Audience'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0 max-[480px]:hidden" />
              </button>

              {showProfileDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-3 border-b border-gray-200">
                    <p className="font-medium text-text">{name}</p>
                    <p className="text-sm text-gray-600">{email}</p>
                  </div>
                  <div className="py-2">
                    <Link to="/audience/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4" />
                        <span>Profile</span>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100"
                    >
                      <div className="flex items-center space-x-2">
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              className="md:hidden min-h-11 min-w-11 p-2 rounded-lg hover:bg-neutral-100 transition-colors inline-flex items-center justify-center max-[480px]:order-1 max-[480px]:shrink-0"
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
          <nav className="md:hidden py-3 border-t border-gray-200">
            <div className="flex flex-col space-y-2">
              <a
                href="/audience/home"
                className={`flex items-center space-x-2 min-h-11 px-3 py-3 rounded-lg text-sm font-medium ${
                  isHome
                    ? 'bg-[#6D415F] text-white'
                    : 'text-neutral-600 hover:bg-[#6D415F]/10 hover:text-[#6D415F]'
                }`}
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </a>
              <Link
                to="/audience/progress"
                className={`flex items-center space-x-2 min-h-11 px-3 py-3 rounded-lg text-sm font-medium ${
                  isProgress
                    ? 'bg-[#6D415F] text-white'
                    : 'text-neutral-600 hover:bg-[#6D415F]/10 hover:text-[#6D415F]'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Progress</span>
              </Link>
            </div>
          </nav>
        )}
      </div>
    </nav>
  );
}
