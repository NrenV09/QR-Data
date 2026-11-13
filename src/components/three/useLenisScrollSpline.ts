import { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useLenisScrollSpline(triggerSelector = '#spatial-exhibition') {
  const scrollProgressRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const lenis = new Lenis({
      lerp: prefersReducedMotion ? 1 : 0.085,
      smoothWheel: !prefersReducedMotion,
      wheelMultiplier: 0.95,
    });

    lenis.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const triggerEl = document.querySelector(triggerSelector);
    const st = ScrollTrigger.create({
      trigger: triggerEl || document.body,
      start: 'top bottom',
      end: 'bottom top',
      scrub: true,
      onUpdate: (self) => {
        scrollProgressRef.current = self.progress;
      },
    });

    return () => {
      st.kill();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, [triggerSelector]);

  return scrollProgressRef;
}
