/**
 * Toca um som suave de notificação de nova mensagem (estilo WhatsApp Web)
 * gerado nativamente via Web Audio API (sem arquivos externos, sem latência).
 */
export function playNotificationSound() {
  try {
    const AudioCtx = audioContextConstructor();
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Primeiro tom suave (800Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(800, now);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Segundo tom harmônico (1050Hz) - assinatura clássica de mensagem nova
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1050, now + 0.08);
    gain2.gain.setValueAtTime(0.1, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.25);
  } catch {
    // Tratamento silencioso caso o navegador bloqueie áudio antes de interação
  }
}

/**
 * Toca o som característico de mensagem enviada do WhatsApp Web (um clique/pop suave).
 */
export function playSentSound() {
  try {
    const AudioCtx = audioContextConstructor();
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.07);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  } catch {
    // Tratamento silencioso
  }
}
type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

function audioContextConstructor(): typeof AudioContext | undefined {
  return window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
}
