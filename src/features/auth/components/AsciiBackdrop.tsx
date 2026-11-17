import { useEffect, useRef } from "react";

/**
 * Fundo ASCII animado das telas de autenticação.
 *
 * - Canvas único (sem milhares de nós no DOM), ~24 fps, pausa com a aba oculta.
 * - O relógio é do módulo: ao navegar entre login/cadastro/recuperação o
 *   componente remonta, mas o campo continua do mesmo ponto, sem "salto".
 * - `prefers-reduced-motion`: desenha um quadro estático.
 * - A cor vem de `color` do próprio canvas (CSS), então segue o tema.
 */

const RAMP = " .·:-=+*";
const CELL_W = 11;
const CELL_H = 18;
const FRAME_MS = 1000 / 24;
const clockOrigin = typeof performance !== "undefined" ? performance.now() : 0;

function field(x: number, y: number, t: number): number {
  // Duas ondas lentas que interferem + uma deriva diagonal: lembra fluxo de
  // mensagens chegando em ondas, sem formar padrões repetitivos óbvios.
  const a = Math.sin(x * 0.11 + t * 0.35) * Math.cos(y * 0.17 - t * 0.22);
  const b = Math.sin((x + y) * 0.06 - t * 0.5);
  const c = Math.cos(Math.hypot(x - 40, y - 20) * 0.09 - t * 0.6);
  return (a + b * 0.8 + c * 0.6) / 2.4; // ~[-1, 1]
}

export function AsciiBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cols = 0;
    let rows = 0;
    let raf = 0;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / CELL_W);
      rows = Math.ceil(height / CELL_H);
    };

    const draw = (now: number) => {
      const t = (now - clockOrigin) / 1000;
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = getComputedStyle(canvas).color;
      ctx.font = `13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textBaseline = "top";
      const cx = cols / 2;
      const cy = rows / 2;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          // Máscara elíptica: rarefaz o campo atrás do cartão e o mantém
          // presente nas bordas, preservando a leitura do formulário.
          const dx = (x - cx) / (cols * 0.32);
          const dy = (y - cy) / (rows * 0.42);
          const mask = Math.min(1, Math.max(0, Math.hypot(dx, dy) - 0.55));
          const v = ((field(x, y, t) + 1) / 2) * mask;
          const i = Math.floor(v * RAMP.length);
          const ch = RAMP[Math.min(RAMP.length - 1, i)];
          if (ch && ch !== " ") ctx.fillText(ch, x * CELL_W, y * CELL_H);
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (reduceMotion.matches || document.hidden) {
        draw(performance.now());
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    resize();
    start();
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    document.addEventListener("visibilitychange", start);
    reduceMotion.addEventListener("change", start);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", start);
      reduceMotion.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={canvasRef} className="auth-ascii-backdrop" aria-hidden="true" />;
}
