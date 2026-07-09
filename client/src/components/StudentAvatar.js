import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const getInitials = (name) => {
  if (!name) return 'S';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export default function StudentAvatar({
  name = 'Student',
  className = 'w-8 h-8',
  textClassName = 'text-sm',
}) {
  const { userProfile } = useAuth();
  const imageUrl = userProfile?.profileImage;

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`${className} rounded-full object-cover shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${className} bg-primary rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${textClassName}`}
    >
      {getInitials(name)}
    </div>
  );
}
