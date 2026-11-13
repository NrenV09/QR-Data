import React, { useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  borderGlowColor?: string;
  cursorLabel?: string;
  onClick?: () => void;
  as?: 'div' | 'section' | 'article';
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  spotlightColor = 'rgba(129, 140, 248, 0.14)',
  borderGlowColor = 'rgba(129, 140, 248, 0.55)',
  cursorLabel,
  onClick,
  as = 'div',
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const mouseX = useMotionValue(-400);
  const mouseY = useMotionValue(-400);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  const handleMouseLeave = () => {
    mouseX.set(-400);
    mouseY.set(-400);
  };

  const surfaceSpotlight = useMotionTemplate`radial-gradient(380px circle at ${mouseX}px ${mouseY}px, ${spotlightColor}, transparent 75%)`;
  const borderSpotlight = useMotionTemplate`radial-gradient(240px circle at ${mouseX}px ${mouseY}px, ${borderGlowColor}, transparent 75%)`;

  const Component = motion[as];

  return (
    <Component
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      data-cursor-label={cursorLabel}
      style={{ borderRadius: 'var(--m3-radius-lg)' }}
      className={`group relative overflow-hidden border border-[var(--m3-outline-variant)] bg-[color-mix(in_srgb,var(--m3-surface-container)_82%,transparent)] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09),0_24px_64px_-16px_rgba(0,0,0,0.72)] ${className}`}
    >
      <motion.div
        aria-hidden="true"
        style={{
          background: borderSpotlight,
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
          WebkitMaskComposite: 'xor',
          padding: '1px',
          borderRadius: 'inherit',
        }}
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <motion.div
        aria-hidden="true"
        style={{ background: surfaceSpotlight }}
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="relative z-10 h-full">{children}</div>
    </Component>
  );
};
