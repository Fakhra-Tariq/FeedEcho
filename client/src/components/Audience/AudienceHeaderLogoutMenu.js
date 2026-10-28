import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import AudienceAvatar from '../AudienceAvatar';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useAuth } from '../../contexts/AuthContext';
import { getStoredAudienceSession } from '../../utils/audienceSession';

export default function AudienceHeaderLogoutMenu({ displayName = 'Audience' }) {
  const navigate = useNavigate();
  const { audienceLogout, userProfile } = useAuth();
  const session = getStoredAudienceSession();
  const name = userProfile?.name || session?.name || displayName || 'Audience';
  const email = userProfile?.email || session?.email || '';
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const closeMenu = useCallback(() => setOpen(false), []);
  useClickOutside(menuRef, closeMenu, open);

  const handleLogout = async () => {
    setOpen(false);
    await audienceLogout();
    navigate('/');
  };

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-center p-1 rounded-lg hover:bg-gray-100 transition-colors min-h-11 min-w-11"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <AudienceAvatar name={name} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1.5rem)] bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-3 border-b border-gray-200">
            <p className="font-medium text-text truncate">{name}</p>
            {email ? <p className="text-sm text-gray-600 truncate">{email}</p> : null}
          </div>
          <div className="py-2">
            <button
              type="button"
              onClick={handleLogout}
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
  );
}
