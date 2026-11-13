import React, { useEffect, useRef } from 'react';

interface InteractiveCanvasBackgroundProps {
  isLightMode?: boolean;
}

interface GridNode {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number;
  hueOffset: number;
}

export const InteractiveCanvasBackground: React.FC<InteractiveCanvasBackgroundProps> = ({
  isLightMode = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const pointer = {
      x: -9999,
      y: -9999,
      smoothX: -9999,
      smoothY: -9999,
      active: false,
    };

    let nodes: GridNode[] = [];
    let cols = 0;
    let rows = 0;
    const SPACING = 44;

    const buildGrid = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      cols = Math.ceil(width / SPACING) + 2;
      rows = Math.ceil(height / SPACING) + 2;
      const offsetX = (width - (cols - 1) * SPACING) / 2;
      const offsetY = (height - (rows - 1) * SPACING) / 2;

      nodes = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx = offsetX + c * SPACING;
          const by = offsetY + r * SPACING;
          nodes.push({
            baseX: bx,
            baseY: by,
            x: bx,
            y: by,
            vx: 0,
            vy: 0,
            energy: 0,
            hueOffset: ((c * 19 + r * 31) % 100) / 100,
          });
        }
      }
    };

    buildGrid();

    const handleResize = () => buildGrid();
    const handlePointerMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
      if (pointer.smoothX < -1000) {
        pointer.smoothX = e.clientX;
        pointer.smoothY = e.clientY;
      }
    };
    const handlePointerLeave = () => {
      pointer.active = false;
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    let rafId = 0;
    let time = 0;

    const renderFrame = () => {
      time += 0.016;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (pointer.active) {
        pointer.smoothX += (pointer.x - pointer.smoothX) * 0.22;
        pointer.smoothY += (pointer.y - pointer.smoothY) * 0.22;
      } else {
        pointer.smoothX += (-9999 - pointer.smoothX) * 0.04;
        pointer.smoothY += (-9999 - pointer.smoothY) * 0.04;
      }

      const INFLUENCE_RADIUS = 210;
      const SPRING_K = 0.085;
      const DAMPING = 0.78;

      if (pointer.active && pointer.smoothX > -500) {
        const aura = ctx.createRadialGradient(
          pointer.smoothX,
          pointer.smoothY,
          0,
          pointer.smoothX,
          pointer.smoothY,
          260
        );
        if (isLightMode) {
          aura.addColorStop(0, 'rgba(99, 102, 241, 0.10)');
          aura.addColorStop(0.5, 'rgba(6, 182, 212, 0.04)');
          aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
          aura.addColorStop(0, 'rgba(99, 102, 241, 0.14)');
          aura.addColorStop(0.45, 'rgba(139, 92, 246, 0.06)');
          aura.addColorStop(0.75, 'rgba(6, 182, 212, 0.03)');
          aura.addColorStop(1, 'rgba(5, 5, 7, 0)');
        }
        ctx.fillStyle = aura;
        ctx.fillRect(
          pointer.smoothX - 260,
          pointer.smoothY - 260,
          520,
          520
        );
      }

      const energized: GridNode[] = [];

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if (!prefersReducedMotion) {
          const waveX = Math.sin(time * 0.7 + node.baseY * 0.012) * 1.4;
          const waveY = Math.cos(time * 0.6 + node.baseX * 0.012) * 1.4;
          let targetX = node.baseX + waveX;
          let targetY = node.baseY + waveY;

          let targetEnergy = 0;
          if (pointer.active) {
            const dx = node.baseX - pointer.smoothX;
            const dy = node.baseY - pointer.smoothY;
            const distSq = dx * dx + dy * dy;

            if (distSq < INFLUENCE_RADIUS * INFLUENCE_RADIUS && distSq > 0.01) {
              const dist = Math.sqrt(distSq);
              const factor = 1 - dist / INFLUENCE_RADIUS;
              const eased = factor * factor;
              const push = eased * 24;
              targetX += (dx / dist) * push;
              targetY += (dy / dist) * push;
              targetEnergy = eased;
            }
          }

          node.vx = (node.vx + (targetX - node.x) * SPRING_K) * DAMPING;
          node.vy = (node.vy + (targetY - node.y) * SPRING_K) * DAMPING;
          node.x += node.vx;
          node.y += node.vy;
          node.energy += (targetEnergy - node.energy) * 0.18;
        }

        if (node.energy > 0.16) {
          energized.push(node);
        }

        const baseAlpha = isLightMode ? 0.12 : 0.14;
        const alpha = baseAlpha + node.energy * 0.78;
        const radius = 1.05 + node.energy * 1.85;

        if (node.energy > 0.05) {
          if (node.hueOffset < 0.34) {
            ctx.fillStyle = `rgba(129, 140, 248, ${alpha.toFixed(3)})`;
          } else if (node.hueOffset < 0.68) {
            ctx.fillStyle = `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
          } else {
            ctx.fillStyle = `rgba(167, 139, 250, ${alpha.toFixed(3)})`;
          }
        } else {
          ctx.fillStyle = isLightMode
            ? `rgba(15, 23, 42, ${baseAlpha})`
            : `rgba(255, 255, 255, ${baseAlpha})`;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (energized.length > 1 && energized.length < 48) {
        ctx.lineWidth = 0.85;
        for (let i = 0; i < energized.length; i++) {
          const a = energized[i];
          for (let j = i + 1; j < energized.length; j++) {
            const b = energized[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < 4600) {
              const strength = Math.min(a.energy, b.energy) * (1 - dSq / 4600);
              ctx.strokeStyle = `rgba(129, 140, 248, ${(strength * 0.45).toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }

      if (!prefersReducedMotion) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [isLightMode]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none select-none"
    />
  );
};
