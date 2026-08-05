import React from 'react';
import { useInView } from '../hooks/useInView';

const STAGGER_MS = 90;
const DURATION_MS = 350;

/**
 * Fade-in + slight upward slide when entering the viewport.
 * Respects prefers-reduced-motion via useInView.
 * Pass `immediate` for above-the-fold content (animates on mount, no wait for scroll).
 */
export function Reveal({
  children,
  className = '',
  delay = 0,
  as: Tag = 'div',
  threshold,
  rootMargin,
  immediate = false,
}) {
  const { ref, inView, prefersReducedMotion } = useInView({
    threshold,
    rootMargin,
    // When immediate, still use the hook for reduced-motion; force visible path below
  });
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (!immediate || prefersReducedMotion) return undefined;
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [immediate, prefersReducedMotion]);

  const visible = prefersReducedMotion || (immediate ? mounted : inView);

  const style = prefersReducedMotion
    ? undefined
    : {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity ${DURATION_MS}ms ease-out ${delay}ms, transform ${DURATION_MS}ms ease-out ${delay}ms`,
        willChange: visible ? undefined : 'opacity, transform',
      };

  return (
    <Tag ref={immediate ? undefined : ref} className={className} style={style}>
      {children}
    </Tag>
  );
}

/** Staggered children: each child reveals ~90ms after the previous. */
export function RevealStagger({
  children,
  className = '',
  itemClassName = '',
  staggerMs = STAGGER_MS,
  as: Tag = 'div',
  itemAs: ItemTag = 'div',
}) {
  const { ref, inView, prefersReducedMotion } = useInView();
  const items = React.Children.toArray(children);

  return (
    <Tag ref={ref} className={className}>
      {items.map((child, index) => {
        const delay = prefersReducedMotion ? 0 : index * staggerMs;
        const style = prefersReducedMotion
          ? undefined
          : {
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateY(0)' : 'translateY(16px)',
              transition: `opacity ${DURATION_MS}ms ease-out ${delay}ms, transform ${DURATION_MS}ms ease-out ${delay}ms`,
              willChange: inView ? undefined : 'opacity, transform',
            };

        return (
          <ItemTag key={child.key ?? index} className={itemClassName} style={style}>
            {child}
          </ItemTag>
        );
      })}
    </Tag>
  );
}
