import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-text mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-text mb-4">Page Not Found</h2>
        <p className="text-text-light mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link 
          to="/"
          className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary-dark inline-block"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
