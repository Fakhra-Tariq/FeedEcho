import React from 'react';
import { Mail } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-primary text-white py-8 border-t border-primary/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
          <div className="max-w-sm">
            <div className="mb-4">
              <span className="text-2xl font-bold tracking-tight text-white">
                FeedEcho
              </span>
            </div>
            <p className="text-white/80 text-sm mb-3">
              Real-time engagement for every kind of session.
            </p>
            <a
              href="mailto:feedecho4@gmail.com"
              className="inline-flex items-center gap-2 text-white/80 hover:text-white text-sm transition-colors"
            >
              <Mail className="w-4 h-4 shrink-0" aria-hidden />
              feedecho4@gmail.com
            </a>
          </div>
          <div className="md:text-right">
            <h4 className="text-md font-semibold mb-4 text-white">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="/about"
                  className="text-white/80 hover:text-white transition-colors"
                >
                  About Us
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  className="text-white/80 hover:text-white transition-colors"
                >
                  Contact
                </a>
              </li>
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
