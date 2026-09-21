import React from 'react';
import clsx from 'clsx';

export function formatChatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Shared anonymous-chat bubble used by host and audience views.
 * `isOwn` is always from the current viewer's perspective.
 */
export default function ChatMessageBubble({
  message,
  isOwn,
  label,
  showStudentDot = false,
}) {
  const text = message?.content || message?.message || '';
  const isHidden = Boolean(message?.isHidden);
  const isAnswered = Boolean(message?.isAnswered);

  return (
    <div className={clsx('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[80%] min-w-0">
        <div
          className={clsx(
            'flex items-center gap-1.5 mb-1',
            isOwn ? 'justify-end' : 'justify-start'
          )}
        >
          {showStudentDot && (
            <span className="w-2 h-2 rounded-full bg-muted-purple" />
          )}
          <span className="text-[11px] font-medium text-text-light">{label}</span>
        </div>

        <div
          className={clsx(
            'px-4 py-2.5 text-sm shadow-sm rounded-2xl',
            isOwn
              ? 'bg-primary text-white rounded-br-md'
              : 'border rounded-bl-md',
            !isOwn &&
              (isHidden
                ? 'bg-background/60 border-primary/10 text-text-light line-through'
                : isAnswered
                ? 'bg-emerald-50 border-emerald-200 text-text'
                : 'bg-background border-primary/10 text-text')
          )}
        >
          <p className="whitespace-pre-wrap break-words">{text}</p>
        </div>

        <div
          className={clsx(
            'flex items-center gap-2 mt-1',
            isOwn ? 'justify-end' : 'justify-start'
          )}
        >
          <span className="text-[11px] text-text-light">
            {formatChatMessageTime(message?.timestamp)}
          </span>
          {isAnswered && !isOwn && (
            <span className="text-[11px] text-emerald-600 font-medium">
              ✓ Answered
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
