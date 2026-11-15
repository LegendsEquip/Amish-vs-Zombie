'use strict';
/* Everything you hear is synthesised live with WebAudio: hooves, whip, groans, guns, thunder, and a banjo that gets nervous. */
(function () {
  const { clamp, lerp } = G;
  const A = G.audio = { ready: false, muted: false };
  let ctx, master, sfx, mus, noiseBuf, L = {};
  let groans = 0, nextNote = 0, step = 0, lastHeart = 0;

  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = A.muted ? 0 : 0.85; master.connect(comp);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    mus = ctx.createGain(); mus.gain.value = 0.55; mus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loop = (type, f, q, dest) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(dest || sfx); s.start(); return { g, fl }; };
    L.wheels = loop('lowpass', 240, 0.7); L.gravel = loop('bandpass', 1900, 0.6); L.wind = loop('bandpass', 520, 0.4); L.rain = loop('highpass', 2600, 0.3);
    // the horde: a wall of low moaning
    L.horde = ctx.createGain(); L.horde.gain.value = 0; const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 420; hf.Q.value = 1.2; hf.connect(L.horde); L.horde.connect(sfx);
    for (const f of [61, 73, 87, 98, 110]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lf = ctx.createOscillator(); lf.frequency.value = 0.13 + Math.random() * 0.4; const lg = ctx.createGain(); lg.gain.value = f * 0.07; lf.connect(lg); lg.connect(o.frequency); o.connect(hf); o.start(); lf.start(); }
    const hn = loop('bandpass', 700, 2, L.horde); hn.g.gain.value = 0.5;
    // crickets
    L.crick = ctx.createGain(); L.crick.gain.value = 0; L.crick.connect(sfx);
    for (const f of [4100, 4480]) { const o = ctx.createOscillator(); o.frequency.value = f; const am = ctx.createGain(); am.gain.value = 0; const lf = ctx.createOscillator(); lf.type = 'square'; lf.frequency.value = f > 4200 ? 23 : 31; const lg = ctx.createGain(); lg.gain.value = 0.5; lf.connect(lg); lg.connect(am.gain); o.connect(am); am.connect(L.crick); o.start(); lf.start(); }
    // drone under the music
    L.drone = ctx.createGain(); L.drone.gain.value = 0; const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 210; df.connect(L.drone); L.drone.connect(mus);
    for (const f of [73.42, 73.9, 110.2]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(df); o.start(); }
    A.ready = true; nextNote = ctx.currentTime + 0.2;
  };
  A.setMuted = function (m) { A.muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05); };

  function out(pan, dest) { if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(dest || sfx); return p; } return dest || sfx; }
  /* filtered noise burst with frequency sweep */
  function nz(dur, type, f0, f1, q, vol, pan, atk, when) {
    if (!A.ready) return; const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (atk || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out(pan)); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function tone(type, f0, f1, dur, vol, pan, atk, when, dest) {
    if (!A.ready) return; const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (atk || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out(pan, dest)); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  /* ---------------- horse & buggy ---------------- */
  A.clop = function (i, vol, soft) {
    const p = (i & 1 ? 0.15 : -0.15);
    if (soft) { nz(0.09, 'lowpass', 420, 120, 0.8, vol * 0.5, p); return; }
    nz(0.055, 'bandpass', 1500 + (i * 137 % 300), 800, 5, vol * 0.75, p);
    tone('sine', 250 + i * 14, 95, 0.05, vol * 0.5, p);
  };
  A.whinny = function () {
    if (!A.ready) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), v = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(760, t); o.frequency.linearRampToValueAtTime(1500, t + 0.16); o.frequency.linearRampToValueAtTime(1150, t + 0.5); o.frequency.linearRampToValueAtTime(520, t + 1.0);
    v.frequency.value = 13; vg.gain.setValueAtTime(40, t); vg.gain.linearRampToValueAtTime(190, t + 0.9); v.connect(vg); vg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.06); g.gain.setValueAtTime(0.2, t + 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    o.connect(f); f.connect(g); g.connect(sfx); o.start(t); v.start(t); o.stop(t + 1.1); v.stop(t + 1.1);
  };
  A.snort = function () { nz(0.28, 'bandpass', 500, 220, 1, 0.22, 0, 0.03); nz(0.1, 'bandpass', 900, 500, 2, 0.1, 0, 0.01, 0.05); };
  A.thud = v => { tone('sine', 120, 42, 0.16, 0.5 * v); nz(0.14, 'lowpass', 700, 150, 0.8, 0.4 * v); };
  A.crash = function (v) { nz(0.5, 'lowpass', 3200, 180, 0.6, 0.6 * v); tone('sine', 130, 36, 0.3, 0.5 * v); for (const f of [523, 811, 1307, 2113]) tone('square', f * (0.95 + Math.random() * 0.1), f * 0.9, 0.22, 0.045 * v); };
  A.woodBreak = function () { nz(0.22, 'bandpass', 2200, 500, 1.2, 0.5); nz(0.09, 'highpass', 3000, 2000, 0.8, 0.3, 0, 0.002, 0.04); tone('triangle', 320, 110, 0.1, 0.25); };
  A.scrape = function (pan) { nz(0.3, 'bandpass', 1300, 2400, 3, 0.3, pan, 0.02); nz(0.18, 'bandpass', 3600, 2800, 6, 0.12, pan, 0.01); };
  A.bump = function () { tone('sine', 150, 55, 0.12, 0.4); nz(0.1, 'lowpass', 900, 200, 0.7, 0.3); };

  /* ---------------- weapons ---------------- */
  A.whipSwing = function () { nz(0.2, 'bandpass', 500, 3400, 2.2, 0.16, 0, 0.1); };
  A.whipCrack = function () { nz(0.07, 'highpass', 2600, 1800, 0.7, 0.75, 0, 0.001); nz(0.22, 'bandpass', 2400, 700, 0.9, 0.2, 0, 0.002, 0.012); tone('square', 1900, 240, 0.035, 0.22); };
  A.swing = function (heavy) { nz(heavy ? 0.26 : 0.14, 'bandpass', heavy ? 300 : 700, heavy ? 1100 : 2200, 1.6, 0.2, 0, 0.06); };
  A.shot = function (kind) {
    const big = kind === 'shotgun';
    nz(big ? 0.55 : 0.32, 'lowpass', big ? 3800 : 5200, 160, 0.5, big ? 1.0 : 0.8, 0, 0.001); tone('sine', big ? 150 : 210, 38, big ? 0.3 : 0.16, 0.7);
    nz(1.1, 'bandpass', 900, 260, 0.5, 0.11, 0, 0.05, 0.08);
    if (big) nz(0.08, 'bandpass', 1500, 900, 4, 0.2, 0, 0.004, 0.42);
  };
  A.click = () => tone('square', 1700, 900, 0.03, 0.12);
  A.slice = () => nz(0.1, 'highpass', 5200, 2600, 1.2, 0.22);
  A.flame = () => { nz(0.24, 'bandpass', 700, 380, 0.5, 0.26, 0, 0.04); nz(0.2, 'highpass', 3200, 2400, 0.4, 0.05, 0, 0.04); };
  A.hit = function (cause) {
    if (cause === 'whip') { nz(0.07, 'bandpass', 1900, 700, 1.4, 0.3); return; }
    nz(0.13, 'lowpass', 900, 200, 1, 0.42); tone('sine', 170, 62, 0.1, 0.3);
    if (cause === 'shovel') tone('triangle', 720, 610, 0.3, 0.14);
  };

  /* ---------------- the dead ---------------- */
  A.groan = function (pan, vol, pitch) {
    if (!A.ready || groans >= 4) return; groans++;
    const t = ctx.currentTime, dur = 0.7 + Math.random() * 0.9, base = (72 + Math.random() * 40) * (pitch || 1);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(base * 0.9, t); o.frequency.linearRampToValueAtTime(base * (1.05 + Math.random() * 0.3), t + dur * 0.4); o.frequency.linearRampToValueAtTime(base * 0.7, t + dur);
    const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 5 + Math.random() * 22; vg.gain.value = base * 0.09; v.connect(vg); vg.connect(o.frequency);
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(); f1.type = f2.type = 'bandpass'; f1.Q.value = 5; f2.Q.value = 7;
    f1.frequency.setValueAtTime(520 + Math.random() * 200, t); f1.frequency.linearRampToValueAtTime(760 + Math.random() * 260, t + dur * 0.5); f2.frequency.value = 1150 + Math.random() * 500;
    const g = ctx.createGain(), peak = 0.5 * vol; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.12); g.gain.setValueAtTime(peak, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const d = out(pan); o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(d);
    o.start(t); v.start(t); o.stop(t + dur + 0.05); v.stop(t + dur + 0.05); o.onended = () => groans--;
  };
  A.roar = function (pan) {
    if (!A.ready) return; const t = ctx.currentTime;
    for (const [f, d] of [[52, 1.4], [78, 1.2], [47, 1.5]]) { const o = tone('sawtooth', f * 1.3, f * 0.7, d, 0.3, pan, 0.15); if (o) { const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 27; vg.gain.value = 9; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + d); } }
    nz(1.3, 'bandpass', 380, 200, 1.2, 0.5, pan, 0.2);
  };
  A.death = function (pitch, pan, cause) {
    nz(0.2, 'lowpass', 1100, 160, 1.3, 0.5, pan); tone('sine', 150, 50, 0.16, 0.3, pan);
    if (cause !== 'shotgun' && Math.random() < 0.7) tone('sawtooth', 150 * (pitch || 1), 55 * (pitch || 1), 0.4, 0.1, pan, 0.03);
    if (cause === 'trample' || cause === 'scrape') nz(0.12, 'bandpass', 2400, 900, 2, 0.2, pan, 0.002, 0.03);
  };
  A.splat = function (pan) { nz(0.5, 'lowpass', 2000, 110, 0.8, 0.85, pan); tone('sine', 95, 30, 0.4, 0.6, pan); nz(0.8, 'bandpass', 2600, 4200, 1.5, 0.12, pan, 0.2, 0.1); };
  A.grab = function (pan) { nz(0.12, 'lowpass', 700, 200, 1, 0.5, pan); tone('sawtooth', 230, 120, 0.3, 0.14, pan, 0.02); tone('triangle', 180, 140, 0.12, 0.3, pan); };
  A.hurt = function () { nz(0.16, 'lowpass', 1500, 260, 1, 0.45); tone('square', 190, 80, 0.14, 0.1); };

  /* ---------------- pickups, UI, weather ---------------- */
  A.pickup = function (good) { tone('sine', 880, 880, 0.12, 0.16); tone('sine', good ? 1318 : 1174, good ? 1318 : 1174, 0.2, 0.16, 0, 0.004, 0.08); };
  A.eat = function () { for (let i = 0; i < 3; i++) nz(0.07, 'bandpass', 1300, 700, 2.5, 0.25, 0, 0.004, i * 0.12); };
  A.upgrade = function () { for (const [f, w] of [[1568, 0], [2093, 0.02], [3136, 0.03]]) tone('triangle', f, f * 0.995, 0.9, 0.11, 0, 0.002, w); nz(0.05, 'highpass', 4000, 3000, 1, 0.3); [523, 659, 784, 1046].forEach((f, i) => tone('sine', f, f, 0.22, 0.12, 0, 0.004, 0.12 + i * 0.07)); };
  A.breakWeapon = function () { tone('triangle', 500, 180, 0.2, 0.2); nz(0.15, 'bandpass', 2600, 800, 2, 0.25); };
  A.thunder = function (delay) { nz(3.4, 'lowpass', 300, 45, 0.5, 0.95, (Math.random() - 0.5) * 0.8, 0.05, delay); nz(0.5, 'lowpass', 2600, 200, 0.6, 0.4, 0, 0.004, delay); };
  A.bell = function (when) { for (const [f, v] of [[392, 0.25], [784, 0.14], [1180, 0.08], [1574, 0.05]]) tone('sine', f, f * 0.998, 3.2, v, 0, 0.004, when || 0); };
  A.sting = function (win) {
    if (win) { [0, 0.9, 1.8, 2.7].forEach(w => A.bell(w)); [294, 370, 440, 587].forEach((f, i) => tone('triangle', f, f, 1.8, 0.12, 0, 0.02, 0.2 + i * 0.22, mus)); }
    else { [146.8, 138.6, 110, 73.4].forEach((f, i) => tone('sawtooth', f, f * 0.97, 1.6, 0.14, 0, 0.03, i * 0.5, mus)); nz(2.5, 'lowpass', 500, 60, 0.6, 0.5, 0, 0.3); }
  };

  /* ---------------- continuous beds + music; called every frame ---------------- */
  const CH = [[0, 3], [0, 3], [-4, 4], [-2, 4], [0, 3], [5, 3], [-4, 4], [-5, 4]];   // Dm Dm Bb C | Dm Gm Bb A
  function pluck(semi, t, vol, bright) {
    const f = 146.83 * Math.pow(2, semi / 12), o = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 2.003;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(bright, t); fl.frequency.exponentialRampToValueAtTime(420, t + 0.25); fl.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    const g2 = ctx.createGain(); g2.gain.value = 0.3; o.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(mus);
    o.start(t); o2.start(t); o.stop(t + 0.5); o2.stop(t + 0.5);
  }
  A.update = function (dt, s) {
    if (!A.ready) return;
    const t = ctx.currentTime, sp = s.speed || 0, playing = s.mode === 'play';
    const set = (n, v) => n.gain.setTargetAtTime(v, t, 0.12);
    set(L.wheels.g, playing ? clamp(sp / 14, 0, 1) * 0.5 : 0); L.wheels.fl.frequency.setTargetAtTime(160 + sp * 22, t, 0.2);
    set(L.gravel.g, playing && s.offroad ? clamp(sp / 9, 0, 1) * 0.3 : 0);
    set(L.wind.g, playing ? clamp(sp / 14, 0, 1) * 0.16 + (s.storm || 0) * 0.14 : 0.04);
    set(L.rain.g, (s.rain || 0) * 0.16);
    set(L.crick, playing ? (s.night || 0) * (1 - (s.rain || 0)) * 0.012 : 0);
    const gap = s.gap === undefined ? 999 : s.gap;
    set(L.horde, playing ? clamp(1 - gap / 170, 0, 1) * 0.2 : 0);
    // heartbeat when things are bad
    if (playing && s.danger > 0.55 && t - lastHeart > lerp(1.0, 0.45, s.danger)) { lastHeart = t; tone('sine', 62, 40, 0.13, 0.55 * s.danger); tone('sine', 56, 38, 0.13, 0.4 * s.danger, 0, 0.004, 0.16); }
    // music
    const k = playing ? clamp((s.time || 0) / 600, 0, 1) : 0, menu = s.mode === 'menu';
    set(L.drone, s.mode === 'over' ? 0 : 0.1 + k * 0.2);
    if (s.mode === 'over' || s.mode === 'pause') { nextNote = t + 0.1; return; }
    const bpm = menu ? 76 : lerp(86, 138, k) + (s.danger > 0.6 ? 8 : 0), eighth = 30 / bpm;
    while (nextNote < t + 0.15) {
      const bar = Math.floor(step / 8) % CH.length, n = step % 8, [root, third] = CH[bar];
      const pat = [0, 7, 12, third, 7, 12, third + 12, 7][n];
      const swing = n % 2 ? eighth * 0.12 : 0, nt = nextNote + swing;
      if (menu || k < 0.2 ? (n !== 3 && n !== 6) : true) pluck(root + pat + (k > 0.7 && n === 6 ? 12 : 0), nt, 0.085 + k * 0.05, 1500 + k * 2600);
      if (n === 0 || (k > 0.45 && n === 4)) tone('triangle', 73.42 * Math.pow(2, root / 12), 73.42 * Math.pow(2, root / 12) * 0.99, 0.5, 0.2, 0, 0.006, nt - t, mus);
      if (!menu && k > 0.18 && (n === 0 || n === 4 || (k > 0.6 && (n === 2 || n === 6)))) { tone('sine', 125, 42, 0.14, 0.3 + k * 0.15, 0, 0.002, nt - t, mus); }
      if (!menu && k > 0.38) { const s2 = ctx.createBufferSource(); s2.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500; const g = ctx.createGain(); g.gain.setValueAtTime(n % 2 ? 0.035 : 0.06, nt); g.gain.exponentialRampToValueAtTime(0.0001, nt + 0.04); s2.connect(f); f.connect(g); g.connect(mus); s2.start(nt, Math.random()); s2.stop(nt + 0.06); }
      if (!menu && k > 0.55 && (n === 2 || n === 6)) { const s2 = ctx.createBufferSource(); s2.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; const g = ctx.createGain(); g.gain.setValueAtTime(0.12, nt); g.gain.exponentialRampToValueAtTime(0.0001, nt + 0.12); s2.connect(f); f.connect(g); g.connect(mus); s2.start(nt, Math.random()); s2.stop(nt + 0.15); }
      nextNote += eighth; step++;
    }
  };
})();
