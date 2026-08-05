import React, { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
import { Reveal } from '../components/Reveal';
import { SurfaceCard } from '../components/marketing/SurfaceCard';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyForm = { name: '', email: '', message: '' };

const Contact = () => {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const updateField = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = () => {
    const next = {};
    const name = form.name.trim();
    const email = form.email.trim();
    const message = form.message.trim();

    if (!name) next.name = 'Name is required.';
    if (!email) next.email = 'Email is required.';
    else if (!EMAIL_RE.test(email)) next.email = 'Enter a valid email address.';
    if (!message) next.message = 'Message is required.';
    else if (message.length < 10) next.message = 'Message should be at least 10 characters.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSending(true);
    // Front-end only for now — ready to swap for an API/email service later
    window.setTimeout(() => {
      setSending(false);
      setSubmitted(true);
      setForm(emptyForm);
    }, 450);
  };

  const handleSendAnother = () => {
    setSubmitted(false);
    setErrors({});
  };

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-transparent to-transparent"
          aria-hidden
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-6 sm:pb-8">
          <Reveal immediate className="text-center max-w-3xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-text tracking-tight leading-tight">
              Get in
              <span className="text-primary"> Touch</span>
            </h1>
          </Reveal>
        </div>
      </section>

      <section className="relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20">
          <div className="max-w-xl mx-auto">
            <Reveal>
              <SurfaceCard className="!p-5 sm:!p-6">
                {submitted ? (
                  <div className="text-center py-4 sm:py-5">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h2 className="text-lg font-semibold text-text mb-2">Message ready</h2>
                    <p className="text-sm text-text-light mb-4 max-w-md mx-auto">
                      Thanks for reaching out. Your message has been recorded on this
                      page — for now, please also email us at{' '}
                      <a
                        href="mailto:feedecho4@gmail.com"
                        className="text-primary font-medium hover:underline"
                      >
                        feedecho4@gmail.com
                      </a>{' '}
                      if you need a reply soon.
                    </p>
                    <button
                      type="button"
                      onClick={handleSendAnother}
                      className="btn-marketing-secondary"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} noValidate className="space-y-3">
                    <h2 className="text-lg font-semibold text-text mb-0.5">Send a message</h2>
                    <p className="text-sm text-text-light !mt-0 mb-1">
                      All fields are required.
                    </p>

                    <div>
                      <label htmlFor="contact-name" className="block text-sm font-medium text-text mb-1">
                        Name
                      </label>
                      <input
                        id="contact-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        value={form.name}
                        onChange={updateField('name')}
                        className={`input-field py-2.5 ${errors.name ? 'border-error-500 focus:ring-error-500 focus:border-error-500' : ''}`}
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? 'contact-name-error' : undefined}
                      />
                      {errors.name && (
                        <p id="contact-name-error" className="mt-1 text-sm text-error-600">
                          {errors.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="contact-email" className="block text-sm font-medium text-text mb-1">
                        Email
                      </label>
                      <input
                        id="contact-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={updateField('email')}
                        className={`input-field py-2.5 ${errors.email ? 'border-error-500 focus:ring-error-500 focus:border-error-500' : ''}`}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? 'contact-email-error' : undefined}
                      />
                      {errors.email && (
                        <p id="contact-email-error" className="mt-1 text-sm text-error-600">
                          {errors.email}
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="contact-message" className="block text-sm font-medium text-text mb-1">
                        Message
                      </label>
                      <textarea
                        id="contact-message"
                        name="message"
                        rows={4}
                        value={form.message}
                        onChange={updateField('message')}
                        className={`input-field resize-y min-h-[6rem] py-2.5 ${errors.message ? 'border-error-500 focus:ring-error-500 focus:border-error-500' : ''}`}
                        aria-invalid={Boolean(errors.message)}
                        aria-describedby={errors.message ? 'contact-message-error' : undefined}
                      />
                      {errors.message && (
                        <p id="contact-message-error" className="mt-1 text-sm text-error-600">
                          {errors.message}
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={sending}
                      className="btn-marketing-primary w-full sm:w-auto disabled:opacity-60 disabled:pointer-events-none !mt-4"
                    >
                      <Send className="w-4 h-4" />
                      <span>{sending ? 'Sending…' : 'Send'}</span>
                    </button>
                  </form>
                )}
              </SurfaceCard>
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Contact;
