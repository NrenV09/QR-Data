import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, AnimatePresence } from 'motion/react';

export const MagneticCursor: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [visible, setVisible] = useState<boolean>(false);
  const [pressed, setPressed] = useState<boolean>(false);
  const [cursorLabel, setCursorLabel] = useState<string | null>(null);
  const [isMagneticHover, setIsMagneticHover] = useState<boolean>(false);

  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  const dotX = useSpring(mouseX, { stiffness: 900, damping: 42, mass: 0.2 });
  const dotY = useSpring(mouseY, { stiffness: 900, damping: 42, mass: 0.2 });

  const haloX = useSpring(mouseX, { stiffness: 320, damping: 28, mass: 0.5 });
  const haloY = useSpring(mouseY, { stiffness: 320, damping: 28, mass: 0.5 });

  const activeMagneticElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isCoarse || reducedMotion) {
      setEnabled(false);
      return;
    }
    setEnabled(true);

    const resetMagneticEl = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.transform = '';
    };

    const lastCoords = { x: -100, y: -100 };

    const updateTargetUnderPointer = (x: number, y: number) => {
      const target = document.elementFromPoint(x, y) as HTMLElement | null;
      const labelTarget = target?.closest<HTMLElement>('[data-cursor-label]');
      const magneticTarget = target?.closest<HTMLElement>('[data-magnetic]');

      setCursorLabel(labelTarget?.dataset.cursorLabel || null);
      setIsMagneticHover(
        Boolean(magneticTarget || target?.closest('button, a, [role="button"]'))
      );

      if (activeMagneticElRef.current && activeMagneticElRef.current !== magneticTarget) {
        resetMagneticEl(activeMagneticElRef.current);
      }
      activeMagneticElRef.current = magneticTarget || null;
      return magneticTarget;
    };

    const handlePointerMove = (e: PointerEvent) => {
      setVisible(true);
      lastCoords.x = e.clientX;
      lastCoords.y = e.clientY;
      const magneticTarget = updateTargetUnderPointer(e.clientX, e.clientY);

      if (magneticTarget) {
        const rect = magneticTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = e.clientX - centerX;
        const deltaY = e.clientY - centerY;
        const pullX = Math.max(-10, Math.min(10, deltaX * 0.22));
        const pullY = Math.max(-8, Math.min(8, deltaY * 0.22));
        magneticTarget.style.transform = `translate3d(${pullX.toFixed(2)}px, ${pullY.toFixed(2)}px, 0)`;

        mouseX.set(e.clientX - deltaX * 0.16);
        mouseY.set(e.clientY - deltaY * 0.16);
      } else {
        mouseX.set(e.clientX);
        mouseY.set(e.clientY);
      }
    };

    const handleScroll = () => {
      if (lastCoords.x >= 0 && lastCoords.y >= 0) {
        updateTargetUnderPointer(lastCoords.x, lastCoords.y);
      }
    };

    const handlePointerDown = () => setPressed(true);
    const handlePointerUp = () => setPressed(false);
    const handlePointerLeave = () => {
      setVisible(false);
      resetMagneticEl(activeMagneticElRef.current);
      activeMagneticElRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    document.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    return () => {
      resetMagneticEl(activeMagneticElRef.current);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [mouseX, mouseY]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-50 pointer-events-none select-none overflow-hidden"
    >
      <motion.div
        style={{
          x: haloX,
          y: haloY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{
          opacity: visible ? 1 : 0,
          scale: pressed ? 0.85 : isMagneticHover ? 1.35 : 1,
        }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 left-0 flex items-center justify-center will-change-transform"
      >
        <div
          className={`rounded-full transition-all duration-200 flex items-center justify-center ${
            cursorLabel
              ? 'px-3 py-1 bg-[#0b0c12]/90 backdrop-blur-md border border-indigo-400/50 shadow-[0_0_24px_-4px_rgba(99,102,241,0.6)]'
              : isMagneticHover
              ? 'w-9 h-9 border border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_20px_-4px_rgba(99,102,241,0.5)]'
              : 'w-7 h-7 border border-white/25 bg-white/[0.02]'
          }`}
        >
          <AnimatePresence mode="wait">
            {cursorLabel && (
              <motion.span
                key={cursorLabel}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.14 }}
                className="text-[10px] font-mono font-semibold tracking-wide text-indigo-100 whitespace-nowrap"
              >
                {cursorLabel}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <motion.div
        style={{
          x: dotX,
          y: dotY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{
          opacity: visible && !cursorLabel ? 1 : 0,
          scale: pressed ? 1.5 : 1,
        }}
        transition={{ duration: 0.12 }}
        className="fixed top-0 left-0 w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(56,189,248,0.9)] will-change-transform"
      />
    </div>
  );
};
