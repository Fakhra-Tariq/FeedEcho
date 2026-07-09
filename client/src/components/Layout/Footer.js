import React from 'react';

const Footer = () => {
  // Don't show footer on login/signup pages
  const currentPath = window.location.pathname;
  if (['/login', '/register', '/teacher/signin'].includes(currentPath)) {
    return null;
  }

  return (
    <footer className="bg-primary text-white py-8 border-t border-primary/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <img 
                src="/FeedEcho-logo.png.png" 
                alt="FeedEcho" 
                className="h-10 w-auto object-contain"
              />
            </div>
            <p className="text-white/80 text-sm">
              Interactive learning platform for students and teachers.
            </p>
          </div>
          <div>
            <h4 className="text-md font-semibold mb-4 text-white">Quick Links</h4>
            <ul className="space-y-2">
              <li><a href="/about" className="text-white/80 hover:text-white transition-colors">About Us</a></li>
              <li><a href="/contact" className="text-white/80 hover:text-white transition-colors">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-md font-semibold mb-4 text-white">Legal</h4>
            <ul className="space-y-2">
              <li><a href="/privacy" className="text-white/80 hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="/terms" className="text-white/80 hover:text-white transition-colors">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/20 mt-8 pt-8 text-center">
          <p className="text-white/80 text-sm">
            © {new Date().getFullYear()} FeedEcho. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
