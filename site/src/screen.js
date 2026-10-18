// Draws the device's touchscreen into a canvas that the 3D screen uses as its texture.
import * as THREE from 'three';

const W = 576;
const H = 1024;

export const SCRIPT = [
  { who: 'CarePal', t: '7:10', text: 'Morning, Mary. You slept about six hours — a little restless near 3 a.m. How are you feeling today?', tele: 'RADAR · SLEEP  6h 04m · restless 02:58–03:20 · nothing worn' },
  { who: 'Mary', t: '7:11', text: 'Tired. My chest felt heavy in the night.', tele: 'SYMPTOM LOGGED  chest heaviness → checked against live heart rate and breathing → within range · noted for Dr. Rao' },
  { who: 'CarePal', t: '7:12', text: 'Your breathing and heart rate look steady right now. I’ve noted it for Dr. Rao. Shall we take your two morning tablets?', tele: 'VITALS · LIVE  HR 74 · RESP 15/min · 7-day trend stable' },
  { who: 'Mary', t: '7:14', text: 'Taken. I don’t feel much like eating, though.', tele: 'ADHERENCE  2/2 confirmed by voice · 07:14   NUTRITION  low appetite, day 2 → follow-up set' },
  { who: 'CarePal', t: '8:30', text: 'Even half a bowl of porridge helps. I’ll let Priya know you’re up and about.', tele: 'FAMILY UPDATE  → Priya: “Up and about, ate lightly.” · no alarm raised' },
  { who: 'Mary', t: '8:31', text: 'Thank you. The mornings do get a little lonely.', tele: 'MOOD  loneliness cue → companion mode · tracked as an early-warning signal' },
  { who: 'CarePal', t: '8:31', text: 'I’m right here. Shall I play your Tagore poems before we call Priya at ten?', tele: 'COMPANION  Tagore playlist queued · family call 10:00' },
];

export function createScreen() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function wrap(text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
    return lines;
  }

  function statusBar(dark) {
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.55)' : 'rgba(20,40,60,0.6)';
    ctx.font = '500 22px Inter, sans-serif';
    ctx.fillText(dark ? '2:58' : '9:41', 34, 50);
    ctx.fillRect(W - 78, 34, 34, 16);
  }

  function bg(night) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (night > 0.5) { g.addColorStop(0, '#0d1418'); g.addColorStop(1, '#101c20'); }
    else { g.addColorStop(0, '#d3e6f8'); g.addColorStop(1, '#e6f0fa'); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function orb(cx, cy, r, alpha = 1) {
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#d9ecff');
    g.addColorStop(0.45, '#8ec0f2');
    g.addColorStop(1, '#4f95e0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function buttons() {
    const y = H - 150;
    [W / 2 - 110, W / 2, W / 2 + 110].forEach((x) => {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(20,40,60,0.75)';
    roundRect(W / 2 - 80, H - 54, 160, 6, 3);
    ctx.fill();
  }

  // mode: 'idle' | 'night' | 'chat'; p: chat progress in messages (float)
  function draw(mode, elapsed, p = 0) {
    if (mode === 'night') {
      bg(1);
      statusBar(true);
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      ctx.font = '600 150px "Inter Tight", Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('2:58', W / 2, 420);
      ctx.font = '400 24px "Ubuntu Sans Mono", monospace';
      ctx.fillStyle = 'rgba(143,227,212,0.85)';
      ctx.fillText('BREATHING 19 /MIN · WATCHING', W / 2, 480);
      ctx.strokeStyle = 'rgba(143,227,212,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 60; x <= W - 60; x += 4) {
        const y = 640 + Math.sin(x * 0.03 - elapsed * 2) * 28 * Math.sin(((x - 60) / (W - 120)) * Math.PI);
        x === 60 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.textAlign = 'left';
    } else if (mode === 'chat') {
      bg(0);
      statusBar(false);
      orb(W / 2, 140, 46 + Math.sin(elapsed * 1.57) * 2);
      const shown = Math.min(SCRIPT.length, Math.floor(p) + 1);
      const frac = Math.min(1, (p % 1) * 3);
      ctx.font = '400 25px Inter, sans-serif';
      const blocks = [];
      for (let i = 0; i < shown; i++) {
        const m = SCRIPT[i];
        const lines = wrap(m.text, 380);
        blocks.push({ m, lines, h: lines.length * 34 + 40, last: i === shown - 1 });
      }
      let y = H - 240;
      for (let i = blocks.length - 1; i >= 0 && y > 220; i--) {
        const b = blocks[i];
        y -= b.h + 16;
        const a = b.last ? frac : 1;
        const me = b.m.who === 'Mary';
        const w = Math.max(...b.lines.map((l) => ctx.measureText(l).width)) + 44;
        const x = me ? W - 36 - w : 36;
        ctx.globalAlpha = a * (y < 260 ? Math.max(0, (y - 220) / 40) : 1);
        ctx.fillStyle = me ? '#1d4f7c' : 'rgba(255,255,255,0.92)';
        roundRect(x, y + (1 - a) * 20, w, b.h, 26);
        ctx.fill();
        ctx.fillStyle = me ? '#fff' : '#17324a';
        b.lines.forEach((l, j) => ctx.fillText(l, x + 22, y + (1 - a) * 20 + 44 + j * 34));
        ctx.globalAlpha = 1;
      }
      buttons();
    } else {
      bg(0);
      statusBar(false);
      const breath = Math.sin((elapsed * Math.PI * 2 * 15) / 60);
      const ring = ((elapsed * 15) / 60) % 1;
      ctx.strokeStyle = `rgba(79,149,224,${0.35 * (1 - ring)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.47, 92 + ring * 120, 0, Math.PI * 2);
      ctx.stroke();
      orb(W / 2, H * 0.47, 92 * (1.03 + breath * 0.03));
      ctx.fillStyle = 'rgba(40,70,100,0.45)';
      ctx.font = '400 24px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('listening…', W / 2, H * 0.47 + 160);
      ctx.textAlign = 'left';
      buttons();
    }
    texture.needsUpdate = true;
  }

  return { canvas, texture, draw };
}
