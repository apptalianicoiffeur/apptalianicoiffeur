/**
 * Small sound-alert helper (Web Audio API, no assets needed).
 * Used by the dashboard when a new booking request arrives.
 */

let ctx = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Play a short two-tone chime. Safe to call repeatedly. */
export function playChime() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.14);
    gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.14 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.3);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + i * 0.14);
    osc.stop(now + i * 0.14 + 0.32);
  });
}

/** Play a soft confirmation blip. */
export function playBlip() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(660, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.22);
}
