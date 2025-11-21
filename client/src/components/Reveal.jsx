import React, { useEffect, useRef, useState } from 'react';

export default function Reveal({ children, className = '', as: Tag = 'div', threshold = 0.15, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setTimeout(() => setVisible(true), delay);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, delay]);

  return (
    <Tag
      ref={ref}
      className={
        `${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ` +
        `transition-all duration-700 ease-out will-change-transform ${className}`
      }
    >
      {children}
    </Tag>
  );
}
