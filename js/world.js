'use strict';
/* Endless Lancaster-County road: terrain, road ribbon, fences, farms, covered bridges, wrecks, debris. */
(function () {
  const { clamp, lerp, smooth, hash, noise2, Batcher } = G;
  const CH = G.CHUNK = 50;
  const W = G.world = { chunks: new Map(), signTex: null };
  const PI = Math.PI;

  /* ------------------------------------------------------------------ road */
  const road = G.road = {
    x(s) { const r = smooth(70, 340, s); return r * (34 * Math.sin(s * 0.0037) + 18 * Math.sin(s * 0.0081 + 1.3) + 5 * Math.sin(s * 0.019 + 4)); },
    dx(s) { return this.x(s + 0.5) - this.x(s - 0.5); },
    y(s) { return 5 * Math.sin(s * 0.006 + 0.5) + 2.2 * Math.sin(s * 0.017 + 2) + 0.8 * Math.sin(s * 0.043); },
    dy(s) { return this.y(s + 0.5) - this.y(s - 0.5); },
    ang(s) { return -Math.atan(this.dx(s)); }
  };
  const BR0 = 650, BRSTEP = 1000;
  G.bridgeAt = s => { const k = Math.round((s - BR0) / BRSTEP); return k < 0 ? -1e9 : BR0 + k * BRSTEP; };
  const creekDip = s => 3.8 * smooth(20, 8, Math.abs(s - G.bridgeAt(s)));
  G.onBridge = s => Math.abs(s - G.bridgeAt(s)) < 16;

  G.terrainY = function (x, s) {
    const d = Math.abs(x - road.x(s));
    let y = road.y(s) - creekDip(s);
    y -= 0.3 * smooth(4.9, 6.2, d) * smooth(9.2, 6.9, d);            // drainage ditch
    const off = smooth(11, 85, d);
    if (off > 0) y += off * ((noise2(x * 0.011 + 7, s * 0.011) - 0.42) * 17 + (noise2(x * 0.05, s * 0.05) - 0.5) * 2.4);
    return y;
  };

  /* ------------------------------------------------------------------ land use */
  const USE_TABLE = [['pasture', 0.22], ['corn', 0.24], ['wheat', 0.13], ['woods', 0.17], ['farm', 0.12], ['pumpkin', 0.07], ['cemetery', 0.05]];
  function zoneOf(s, side) { return Math.floor((s + (side > 0 ? 100 : 0)) / 250); }
  function zoneChunk(s, side) { return Math.floor((((s + (side > 0 ? 100 : 0)) % 250) + 250) % 250 / CH); }
  const landUse = G.landUse = function (s, side) {
    const zi = zoneOf(s, side);
    if (zi <= 0) return side > 0 ? 'farm' : 'pasture';
    let h = hash(zi * 7 + (side > 0 ? 3 : 11), 91);
    for (const [n, w] of USE_TABLE) { if (h < w) return n; h -= w; }
    return 'pasture';
  };
  function fenceType(s, side) {
    const cs = Math.floor(s / CH) * CH + 25, u = landUse(cs, side), zi = zoneOf(cs, side);
    switch (u) {
      case 'pasture': case 'farm': return 'board';
      case 'corn': case 'wheat': return hash(zi, 5) < 0.75 ? 'wire' : null;
      case 'woods': return hash(zi, 6) < 0.5 ? 'rail' : null;
      case 'cemetery': return 'iron';
      default: return null;
    }
  }
  /* how far from the centre line the buggy's flank may go (fences, bridge walls) */
  W.latLimit = function (s, side) {
    const base = fenceType(s, side) ? 7.6 : 10.5;
    const d = Math.abs(s - G.bridgeAt(s));
    if (d < 16) return 3.3;
    if (d < 36) return lerp(3.3, base, (d - 16) / 20);
    return base;
  };
  W.hasBarrier = function (s, side) { return !!fenceType(s, side) || Math.abs(s - G.bridgeAt(s)) < 36; };

  /* ------------------------------------------------------------------ textures & materials */
  function roadTexture() {
    return G.canvasTex(512, 1024, (g, w, h) => {
      const rnd = G.rng(77);
      g.fillStyle = '#39393b'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 30000; i++) {
        const v = 34 + rnd() * 60 | 0;
        g.fillStyle = `rgba(${v + (rnd() * 8 | 0)},${v},${v - (rnd() * 6 | 0)},${0.3 + rnd() * 0.45})`;
        g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.8, 1 + rnd() * 1.8);
      }
      // tyre-polished tracks and the darker hoof path between them
      for (const cx of [171, 341]) {
        for (const dx of [-37, 37]) {
          const gr = g.createLinearGradient(cx + dx - 16, 0, cx + dx + 16, 0);
          gr.addColorStop(0, 'rgba(130,128,120,0)'); gr.addColorStop(0.5, 'rgba(130,128,120,0.16)'); gr.addColorStop(1, 'rgba(130,128,120,0)');
          g.fillStyle = gr; g.fillRect(cx + dx - 16, 0, 32, h);
        }
        const gr = g.createLinearGradient(cx - 18, 0, cx + 18, 0);
        gr.addColorStop(0, 'rgba(16,16,16,0)'); gr.addColorStop(0.5, 'rgba(16,16,16,0.22)'); gr.addColorStop(1, 'rgba(16,16,16,0)');
        g.fillStyle = gr; g.fillRect(cx - 18, 0, 36, h);
        for (let k = 0; k < 5; k++) {  // what horses leave behind
          const px = cx + (rnd() - 0.5) * 16, py = 30 + rnd() * (h - 60);
          for (let j = 0; j < 7; j++) { g.fillStyle = `rgba(${48 + rnd() * 20 | 0},${36 + rnd() * 12 | 0},18,0.85)`; g.beginPath(); g.ellipse(px + (rnd() - 0.5) * 12, py + (rnd() - 0.5) * 16, 2 + rnd() * 3, 2 + rnd() * 3, 0, 0, 7); g.fill(); }
        }
      }
      // tar-sealed cracks
      for (let k = 0; k < 16; k++) {
        g.strokeStyle = 'rgba(14,14,16,0.9)'; g.lineWidth = 1.5 + rnd() * 3; g.lineCap = 'round';
        let x = 95 + rnd() * 320, y = 30 + rnd() * (h - 220); g.beginPath(); g.moveTo(x, y);
        const n = 6 + rnd() * 10 | 0, horiz = rnd() < 0.3;
        for (let j = 0; j < n; j++) { if (horiz) { x += 10 + rnd() * 18; y += (rnd() - 0.5) * 16; } else { y += 8 + rnd() * 18; x += (rnd() - 0.5) * 18; } if (x < 92 || x > 420) break; g.lineTo(x, y); }
        g.stroke();
      }
      for (let k = 0; k < 3; k++) { // patches
        const x = 100 + rnd() * 250, y = 40 + rnd() * (h - 240), pw = 40 + rnd() * 70, ph = 60 + rnd() * 110;
        g.fillStyle = 'rgba(26,26,28,0.62)'; g.fillRect(x, y, pw, ph);
        g.strokeStyle = 'rgba(70,70,70,0.5)'; g.lineWidth = 1; g.strokeRect(x, y, pw, ph);
      }
      // paint, worn in places
      const stripe = (x, wd, col) => { for (let y = 0; y < h; y += 6) { g.fillStyle = col; g.globalAlpha = 0.62 + rnd() * 0.34; g.fillRect(x, y, wd, 6); } g.globalAlpha = 1; };
      stripe(248, 6, '#d6a61c'); stripe(258, 6, '#d6a61c');
      stripe(92, 6, '#d8d8d0'); stripe(414, 6, '#d8d8d0');
      for (let i = 0; i < 2600; i++) { g.fillStyle = 'rgba(50,50,52,0.55)'; const lx = [92, 248, 258, 414][i & 3]; g.fillRect(lx + rnd() * 6, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 4); }
      // gravel shoulders
      for (const [x0, x1] of [[0, 86], [426, 512]]) {
        g.fillStyle = '#7b7468'; g.fillRect(x0, 0, x1 - x0, h);
        for (let i = 0; i < 9000; i++) {
          g.fillStyle = ['#9a9286', '#5f5a50', '#b0a898', '#6e675c', '#8b8376'][rnd() * 5 | 0];
          g.fillRect(x0 + rnd() * (x1 - x0), rnd() * h, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
        }
        for (let i = 0; i < 260; i++) { // weeds creeping in
          const outer = x0 === 0 ? rnd() * 40 : 512 - rnd() * 40;
          g.fillStyle = `rgba(${70 + rnd() * 30 | 0},${100 + rnd() * 40 | 0},45,0.8)`; g.fillRect(outer, rnd() * h, 2 + rnd() * 4, 2 + rnd() * 5);
        }
      }
      // ragged alpha fade at outer edges
      g.globalCompositeOperation = 'destination-out';
      for (let y = 0; y < h; y += 3) {
        const e1 = 6 + 22 * noise2(y * 0.045, 3), e2 = 6 + 22 * noise2(y * 0.045, 9);
        let gr = g.createLinearGradient(0, 0, e1 + 16, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.4, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, y, e1 + 16, 3);
        gr = g.createLinearGradient(w, 0, w - e2 - 16, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.4, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(w - e2 - 16, y, e2 + 16, 3);
      }
      g.globalCompositeOperation = 'source-over';
    }, { aniso: 16 });
  }
  function groundTexture() {
    return G.canvasTex(256, 256, (g, w, h) => {
      const rnd = G.rng(5);
      g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 7000; i++) {
        const v = 170 + rnd() * 85 | 0; g.strokeStyle = `rgba(${v},${v},${v},0.55)`; g.lineWidth = 1;
        const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y - 2 - rnd() * 5); g.stroke();
      }
      for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(150,150,150,${0.1 + rnd() * 0.15})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 6 + rnd() * 16, 0, 7); g.fill(); }
    });
  }
  /* hand-painted roadside signs — one atlas, many planes */
  const SIGNS = {};
  function signAtlas() {
    return G.canvasTex(1024, 1024, (g) => {
      const cell = (name, x, y, w, h, fn) => { SIGNS[name] = { u0: x / 1024, v0: 1 - (y + h) / 1024, u1: (x + w) / 1024, v1: 1 - y / 1024 }; g.save(); g.translate(x, y); fn(w, h); g.restore(); };
      const board = (w, h, col, grain) => {
        g.fillStyle = col; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`; g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2); }
        if (grain) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let yy = h / 3; yy < h; yy += h / 3) { g.beginPath(); g.moveTo(0, yy); g.lineTo(w, yy); g.stroke(); } }
      };
      const text = (str, x, y, size, col, font, rot) => { g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.font = `${size}px ${font || 'Georgia, serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(str, 0, 0); g.restore(); };
      const diamond = (w, h, draw) => { g.save(); g.translate(w / 2, h / 2); g.rotate(PI / 4); const r = w * 0.34; g.fillStyle = '#f2c417'; g.fillRect(-r, -r, 2 * r, 2 * r); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(-r + 8, -r + 8, 2 * r - 16, 2 * r - 16); g.restore(); draw(); };
      cell('buggy', 0, 0, 256, 256, (w, h) => diamond(w, h, () => {
        g.fillStyle = '#111';
        g.fillRect(132, 96, 46, 40); g.fillRect(126, 92, 58, 6);                         // cab
        g.beginPath(); g.arc(142, 148, 17, 0, 7); g.arc(172, 148, 17, 0, 7); g.fill();
        g.fillStyle = '#f2c417'; g.beginPath(); g.arc(142, 148, 11, 0, 7); g.arc(172, 148, 11, 0, 7); g.fill();
        g.fillStyle = '#111'; g.fillRect(84, 112, 44, 20); g.fillRect(74, 96, 14, 22); g.fillRect(64, 94, 16, 9);   // horse
        g.fillRect(88, 130, 5, 28); g.fillRect(100, 130, 5, 28); g.fillRect(114, 130, 5, 28); g.fillRect(122, 130, 5, 26); g.fillRect(118, 124, 16, 3);
      }));
      cell('narrow', 256, 0, 256, 256, (w, h) => diamond(w, h, () => { text('NARROW', 128, 112, 30, '#111', 'Arial Black, sans-serif'); text('BRIDGE', 128, 146, 30, '#111', 'Arial Black, sans-serif'); }));
      cell('speed', 512, 0, 192, 256, (w, h) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); text('SPEED', w / 2, 52, 36, '#111', 'Arial, sans-serif'); text('LIMIT', w / 2, 92, 36, '#111', 'Arial, sans-serif'); text('35', w / 2, 175, 110, '#111', 'Arial Black, sans-serif'); });
      cell('pies', 0, 256, 512, 256, (w, h) => { board(w, h, '#5b3d24', true); text('SHOOFLY PIES', w / 2, 80, 62, '#f3ead2'); text('whoopie pies · root beer', w / 2, 150, 34, '#f3ead2', 'Georgia, serif'); text('NO SUNDAY SALES', w / 2, 210, 30, '#e8c36a'); });
      cell('eggs', 512, 256, 512, 256, (w, h) => { board(w, h, '#efe9d8', true); text('FRESH EGGS', w / 2, 84, 70, '#7a1f17'); text('brown · white · duck', w / 2, 160, 36, '#333'); text('honor box — God sees', w / 2, 212, 28, '#333', 'Georgia, serif'); });
      cell('quilts', 0, 512, 512, 256, (w, h) => { board(w, h, '#2d4a3a', true); text('QUILTS', w / 2, 70, 70, '#f3ead2'); text('furniture · jams · brooms', w / 2, 142, 34, '#f3ead2'); text('next lane →', w / 2, 204, 34, '#e8c36a'); });
      cell('pumpkins', 512, 512, 512, 256, (w, h) => { board(w, h, '#e9e1c8', true); text('PUMPKINS', w / 2, 96, 84, '#d9661a'); text('$3  ·  gourds  ·  cider', w / 2, 186, 38, '#333'); });
      cell('quarantine', 0, 768, 512, 256, (w, h) => { board(w, h, '#e0701a'); g.fillStyle = '#111'; g.fillRect(0, 0, w, 20); g.fillRect(0, h - 20, w, 20); text('QUARANTINE', w / 2, 86, 68, '#111', 'Arial Black, sans-serif'); text('ROAD CLOSED · TURN BACK', w / 2, 164, 32, '#111', 'Arial Black, sans-serif'); text('they bite', w / 2 + 60, 214, 40, '#8a0f0f', 'Brush Script MT, cursive', -0.08); });
      cell('dead', 512, 768, 512, 256, (w, h) => { board(w, h, '#cfc6ae', true); text('THE DEAD WALK', w / 2, 90, 64, '#8a0f0f', 'Impact, sans-serif', -0.03); text('DO NOT STOP', w / 2, 180, 58, '#8a0f0f', 'Impact, sans-serif', 0.03); g.fillStyle = 'rgba(138,15,15,0.9)'; for (let i = 0; i < 9; i++) g.fillRect(60 + i * 46, 110 + Math.random() * 12, 5, 16 + Math.random() * 40); });
    }, { repeat: false });
  }

  let matRoad, matGround, matWater, matSign, sparkTex, matSpark, matHeal;
  W.init = function (scene) {
    W.scene = scene;
    matRoad = new THREE.MeshLambertMaterial({ map: roadTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    matGround = new THREE.MeshLambertMaterial({ map: groundTexture(), vertexColors: true });
    matWater = new THREE.MeshPhongMaterial({ color: 0x2c4a52, transparent: true, opacity: 0.86, shininess: 90, specular: 0x8899aa });
    W.signTex = signAtlas();
    matSign = new THREE.MeshLambertMaterial({ map: W.signTex });
    sparkTex = G.canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.2, 'rgba(255,210,90,0.5)'); gr.addColorStop(1, 'rgba(255,200,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(255,250,220,0.95)'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 2); g.lineTo(32, 62); g.moveTo(2, 32); g.lineTo(62, 32); g.stroke();
    }, { repeat: false });
    matHeal = new THREE.SpriteMaterial({ map: G.glowTex('rgba(200,255,210,1)', 'rgba(60,230,110,0.5)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true });
    matSpark = W.matSpark = new THREE.SpriteMaterial({ map: sparkTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true });
  };

  /* ------------------------------------------------------------------ batch extensions */
  const _n = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
  Batcher.prototype.quad = function (a, b, c, d, hex) {   // world-space quad a-b-c-d (CCW)
    const col = G.colorOf(hex), j = 1 + (this.rnd() - 0.5) * 2 * this.jitter;
    _p1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _p2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _n.crossVectors(_p1, _p2).normalize();
    for (const p of [a, b, c, a, c, d]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(_n.x, _n.y, _n.z); this.col.push(col.r * j, col.g * j, col.b * j); }
    return this;
  };
  /* gable: triangular prism, base on y, ridge along local z */
  Batcher.prototype.prism = function (x, y, z, w, h, len, hex, ry) {
    this._local(x, y + h / 3, z, w / 1.732, len, h / 1.5, ry || 0, -PI / 2, 0);
    let g = Batcher._prism;
    if (!g) { const geo = new THREE.CylinderGeometry(1, 1, 1, 3).toNonIndexed(); g = Batcher._prism = { p: geo.attributes.position.array, n: geo.attributes.normal.array, count: geo.attributes.position.count }; }
    this._add(g, hex);
    return this;
  };

  const P = (s, lat) => { const x = road.x(s) + lat; return { x, y: G.terrainY(x, s), z: -s }; };

  /* ------------------------------------------------------------------ vegetation */
  const GREENS = [0x4f7a2e, 0x5c8a35, 0x3f6a2a, 0x688f38];
  const AUTUMN = [0xc8742a, 0xd9a02e, 0xa8442a, 0x8a5a2a, 0xe0b23a, 0xb5512c];
  function tree(B, x, y, z, kind, sc, rng) {
    B.setBase(x, y - 0.2, z, rng() * 6.28);
    if (kind === 'pine') {
      B.cylb(0, 0, 0, 0.12 * sc, 0.26 * sc, 2.2 * sc, 0x4a3828, 6);
      for (let i = 0; i < 4; i++) B.cylb(0, (1.2 + i * 1.45) * sc, 0, 0, (2.1 - i * 0.42) * sc, 2.3 * sc, 0x2c4a30, 7, 0x3d6240);
    } else if (kind === 'dead') {
      B.cylb(0, 0, 0, 0.12 * sc, 0.34 * sc, 4.6 * sc, 0x453c34, 6);
      for (let i = 0; i < 6; i++) { const a = rng() * 6.28, h = (2.2 + rng() * 2.2) * sc, l = (1 + rng() * 1.6) * sc; B.beam(0, h, 0, Math.cos(a) * l, h + l * (0.4 + rng() * 0.7), Math.sin(a) * l, 0.09 * sc, 0.09 * sc, 0x453c34); }
    } else if (kind === 'willow') {
      B.cylb(0, 0, 0, 0.3 * sc, 0.52 * sc, 3.4 * sc, 0x5a4a36, 7);
      B.blob(0, 5.4 * sc, 0, 3.6 * sc, 2.3 * sc, 3.6 * sc, 0x6d8a3c, rng() * 3, 0x93ab55);
      for (let i = 0; i < 15; i++) { const a = i / 15 * 6.28 + rng() * 0.3, r = (2.6 + rng() * 1.2) * sc; B.blob(Math.cos(a) * r, (3.2 + rng() * 0.8) * sc, Math.sin(a) * r, 0.62 * sc, (1.9 + rng() * 0.8) * sc, 0.62 * sc, 0x7f9a46, rng() * 3, 0x9db45a); }
    } else {
      const pal = kind === 'autumn' ? AUTUMN : GREENS, th = (2.4 + rng() * 1.4) * sc;
      B.cylb(0, 0, 0, 0.17 * sc, 0.34 * sc, th + 1.2 * sc, 0x54412e, 7);
      const n = 5 + (rng() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.28, r = (i === 0 ? 0 : 0.7 + rng() * 1.3) * sc, c = rng.pick(pal);
        const rad = (1.5 + rng() * 0.9) * sc;
        B.blob(Math.cos(a) * r, th + (1.3 + rng() * 1.7) * sc, Math.sin(a) * r, rad, rad * 0.82, rad, G.mixHex(c, 0x000000, 0.22), rng() * 3, G.mixHex(c, 0xffffff, 0.12));
      }
    }
  }
  function bush(B, x, y, z, sc, rng, col) { B.setBase(x, y, z, 0); B.blob(0, 0.45 * sc, 0, 0.9 * sc, 0.6 * sc, 0.9 * sc, col || 0x4a6a2c, rng() * 3, 0x6f8f3e); }

  /* ------------------------------------------------------------------ buildings & props (static, batched) */
  function window_(B, x, y, z, ry, w, h) {
    B.box(x, y, z, w + 0.14, h + 0.14, 0.08, 0xdedad0, ry);
    B.box(x + Math.sin(ry) * 0.03, y - h * 0.22, z + Math.cos(ry) * 0.03, w, h * 0.55, 0.08, 0x18212b, ry);
    B.box(x + Math.sin(ry) * 0.03, y + h * 0.27, z + Math.cos(ry) * 0.03, w, h * 0.45, 0.09, 0x2c5a3c, ry);   // the green shades
  }
  function farmhouse(B, x, y, z, ry, rng) {
    B.setBase(x, y, z, ry);
    const wc = 0xece8dc;
    B.boxb(0, -0.6, 0, 9.4, 1.0, 7.4, 0x8d8a82);                                  // stone footing
    B.boxb(0, 0.4, 0, 9, 5.8, 7, wc);
    B.prism(0, 6.2, 0, 7.8, 2.9, 9.6, 0x3a3b40, PI / 2);
    B.boxb(2.6, 7.4, 0.4, 0.8, 2.2, 0.8, 0x7a4a3a);                               // chimney
    B.boxb(-6.2, 0.4, 0.5, 3.6, 3.2, 5, wc); B.prism(-6.2, 3.6, 0.5, 5.6, 1.6, 4.0, 0x3a3b40, PI / 2);   // summer kitchen
    for (const fx of [-3, 0, 3]) { window_(B, fx, 4.8, 3.52, 0, 0.9, 1.4); if (fx !== 0) window_(B, fx, 2.2, 3.52, 0, 0.9, 1.4); }
    for (const fz of [-1.8, 1.8]) { window_(B, 4.52, 4.8, fz, PI / 2, 0.9, 1.4); window_(B, 4.52, 2.2, fz, PI / 2, 0.9, 1.4); }
    B.box(0, 1.5, 3.53, 1.0, 2.1, 0.08, 0x2c5a3c);                                // door
    B.boxb(0, 0.15, 4.6, 9, 0.25, 2.2, 0x9c9588);                                 // porch
    B.box(0, 3.35, 4.6, 9.4, 0.14, 2.6, 0x3a3b40, 0, 0.12);
    for (const px of [-4.3, -1.5, 1.5, 4.3]) B.boxb(px, 0.4, 5.55, 0.16, 2.8, 0.16, wc);
    for (let i = 0; i < 3; i++) B.blob(-3.6 + i * 0.6 + rng() * 0.2, 0.62, 5.2, 0.24, 0.19, 0.24, 0xd9661a, rng() * 3);   // porch pumpkins
    B.boxb(3.2, 0.4, 5.0, 1.5, 0.45, 0.5, 0x4a3828); B.box(3.2, 1.1, 4.8, 1.5, 0.7, 0.06, 0x4a3828);   // bench
  }
  function barn(B, x, y, z, ry, rng, red) {
    B.setBase(x, y, z, ry);
    const c = red ? 0x8a2d22 : 0xe9e5d8, trim = red ? 0xf0ece2 : 0x2c5a3c;
    B.boxb(0, -0.8, 0, 12.3, 2.2, 18.3, 0x85827a);
    B.boxb(0, 1.4, 0, 12, 6.2, 18, c);
    B.prism(0, 7.6, 0, 13.2, 5, 19, 0x35363b, 0);
    B.boxb(0, 12.1, 0, 1.6, 1.4, 1.6, c); B.prism(0, 13.5, 0, 2.2, 1.0, 2.2, 0x35363b, 0);   // cupola
    for (const s of [-1, 1]) {
      B.box(0, 3.6, s * 9.03, 4.6, 4.4, 0.1, trim === 0xf0ece2 ? 0x7a271d : 0xdad6c8);
      B.box(0, 3.6, s * 9.08, 4.8, 0.2, 0.06, trim); B.box(0, 5.8, s * 9.08, 4.8, 0.2, 0.06, trim); B.box(0, 1.5, s * 9.08, 4.8, 0.2, 0.06, trim);
      B.box(-2.35, 3.6, s * 9.08, 0.2, 4.5, 0.06, trim); B.box(2.35, 3.6, s * 9.08, 0.2, 4.5, 0.06, trim); B.box(0, 3.6, s * 9.08, 0.16, 4.5, 0.06, trim);
      B.box(-1.2, 3.6, s * 9.09, 0.16, 4.9, 0.05, trim, 0, 0, 0.5); B.box(1.2, 3.6, s * 9.09, 0.16, 4.9, 0.05, trim, 0, 0, -0.5);
      B.box(0, 9.0, s * 9.04, 1.2, 1.4, 0.08, 0x1c1c1c);
      B.cyl(0, 10.9, s * 9.1, 0.55, 0.55, 0.06, 0xe8c12a, 12, 0, PI / 2); B.cyl(0, 10.9, s * 9.14, 0.3, 0.3, 0.06, 0xb82a1e, 8, 0, PI / 2);   // hex sign
    }
    for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) B.box(s * 6.03, 4.2, i * 3.4, 0.08, 1.0, 0.8, 0x1c1c1c);
    // silo
    B.cylb(9.6, -0.8, -4, 2.3, 2.3, 15, 0xb9b5a8, 14);
    for (let i = 1; i < 6; i++) B.cylb(9.6, -0.8 + i * 2.4, -4, 2.34, 2.34, 0.12, 0x8a877e, 14);
    B.sph(9.6, 14.2, -4, 2.32, 1.5, 2.32, 0x9aa1a8);
    if (rng() < 0.6) { B.cylb(14.2, -0.8, -1.5, 1.7, 1.7, 11, 0x4a5d73, 12); B.sph(14.2, 10.2, -1.5, 1.72, 1.1, 1.72, 0xc8ccd0); }
  }
  function windmill(B, x, y, z, rng) {
    B.setBase(x, y, z, rng() * 6);
    for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.beam(ax * 1.3, 0, az * 1.3, ax * 0.2, 10, az * 0.2, 0.09, 0.09, 0x8a8f94);
    for (let h = 2; h < 10; h += 2.6) { const r = 1.3 - h * 0.11; B.box(0, h, r, 2 * r, 0.06, 0.06, 0x8a8f94); B.box(0, h, -r, 2 * r, 0.06, 0.06, 0x8a8f94); B.box(r, h, 0, 0.06, 0.06, 2 * r, 0x8a8f94); B.box(-r, h, 0, 0.06, 0.06, 2 * r, 0x8a8f94); }
    for (let i = 0; i < 14; i++) B.box(Math.cos(i / 14 * 6.28) * 0.95, 10.4 + Math.sin(i / 14 * 6.28) * 0.95, 0.5, 0.36, 1.2, 0.03, 0xc9ced2, 0, 0.25, i / 14 * 6.28 + PI / 2);
    B.box(0, 10.4, -1.3, 0.05, 0.9, 1.5, 0xb03a2e);
  }
  function clothesline(B, x, y, z, ry, rng) {
    B.setBase(x, y, z, ry);
    for (const px of [-6, 6]) { B.boxb(px, 0, 0, 0.12, 2.3, 0.12, 0x6b563c); B.box(px, 2.25, 0, 0.1, 0.1, 1.2, 0x6b563c); }
    B.box(0, 2.2, 0.4, 12, 0.02, 0.02, 0xcccccc); B.box(0, 2.2, -0.4, 12, 0.02, 0.02, 0xcccccc);
    const cols = [0x2b3a67, 0x4b2a5a, 0x15151a, 0xf0f0f0, 0x2f5a3a, 0x3a6a8a, 0x15151a];
    for (let i = 0; i < 13; i++) { const w = 0.5 + rng() * 0.5, h = 0.6 + rng() * 0.7; B.box(-5.4 + i * 0.9, 2.18 - h / 2, rng() < 0.5 ? 0.4 : -0.4, w, h, 0.03, rng.pick(cols), 0, (rng() - 0.5) * 0.3); }
  }
  function cow(B, x, y, z, ry, rng, horse) {
    B.setBase(x, y, z, ry);
    const c = horse ? rng.pick([0x5a3a22, 0x2a2018, 0x8a6a48]) : 0xf0eee6, d = horse ? 0x1a1410 : 0x15151a;
    B.box(0, 1.05, 0, 0.72, 0.8, 1.9, c);
    if (!horse) for (let i = 0; i < 4; i++) B.box((rng() - 0.5) * 0.3, 1.05 + (rng() - 0.5) * 0.3, (rng() - 0.5) * 1.3, 0.75, 0.3 + rng() * 0.4, 0.3 + rng() * 0.5, d);
    const graze = rng() < 0.6;
    B.box(0, graze ? 0.55 : 1.45, -1.25, 0.34, 0.4, 0.62, horse ? c : d, 0, graze ? 0.9 : 0.1);
    B.box(0, graze ? 0.95 : 1.3, -0.95, 0.3, 0.6, 0.4, c, 0, graze ? 0.9 : -0.5);
    for (const [lx, lz] of [[-0.24, -0.72], [0.24, -0.72], [-0.24, 0.72], [0.24, 0.72]]) B.boxb(lx, 0, lz, 0.14, 0.7, 0.14, horse ? d : c);
    B.box(0, 0.95, 1.02, 0.06, 0.7, 0.06, d, 0, 0.25);
    if (!horse) B.box(0, 0.62, 0.45, 0.34, 0.2, 0.36, 0xe0a0a0);
  }
  function haybale(B, x, y, z, ry) { B.setBase(x, y, z, ry); B.cyl(0, 0.72, 0, 0.75, 0.75, 1.4, 0xcdaa58, 12, 0, 0, PI / 2); B.cyl(0, 0.72, 0, 0.3, 0.3, 1.42, 0xb8944a, 8, 0, 0, PI / 2); }
  function pumpkin(B, x, y, z, r, rng) { B.setBase(x, y, z, rng() * 6); B.blob(0, r * 0.7, 0, r, r * 0.78, r, rng() < 0.85 ? 0xd9661a : 0xe9dcc0, rng() * 3, 0xf08a2a); B.boxb(0, r * 1.3, 0, 0.05, 0.1, 0.05, 0x4a5a2a); }
  function gravestone(B, x, y, z, ry, rng) {
    B.setBase(x, y - 0.1, z, ry + (rng() - 0.5) * 0.3);
    const k = rng(), c = rng.pick([0x9a9a92, 0x84847e, 0xaaa69c]), tilt = (rng() - 0.5) * 0.25;
    if (k < 0.3) { B.box(0, 0.7, 0, 0.14, 1.4, 0.12, c, 0, tilt); B.box(0, 1.0, 0, 0.7, 0.14, 0.12, c, 0, tilt); }
    else { const h = 0.6 + rng() * 0.5; B.box(0, h / 2, 0, 0.62, h, 0.14, c, 0, tilt); B.cyl(0, h, 0, 0.31, 0.31, 0.14, c, 10, 0, PI / 2 + tilt); }
    if (rng() < 0.3) { B.box(0, 0.1, 1.2, 0.9, 0.3, 2.0, 0x4a3a28); B.box(0, 0.26, 1.2, 0.6, 0.02, 1.7, 0x15100c); }  // someone got out
  }
  function mailbox(B, x, y, z, ry) { B.setBase(x, y, z, ry); B.boxb(0, 0, 0, 0.1, 1.05, 0.1, 0x6b563c); B.box(0, 1.15, 0, 0.2, 0.22, 0.48, 0x2a2a2e); B.cyl(0, 1.26, 0, 0.1, 0.1, 0.48, 0x2a2a2e, 8, 0, PI / 2); B.box(0.12, 1.3, -0.1, 0.02, 0.16, 0.08, 0xc0261c); }
  function parkedBuggy(B, x, y, z, ry) {
    B.setBase(x, y, z, ry);
    B.boxb(0, 0.7, 0, 1.4, 1.5, 2.1, 0x1b1b1e); B.boxb(0, 2.2, 0, 1.5, 0.08, 2.3, 0x4c4e52);
    for (const wx of [-0.82, 0.82]) for (const wz of [-0.85, 0.85]) { B.cyl(wx, 0.56, wz, 0.56, 0.56, 0.05, 0x26262a, 14, 0, 0, PI / 2); B.cyl(wx, 0.56, wz, 0.46, 0.46, 0.06, 0x8a877e, 14, 0, 0, PI / 2); }
    B.box(-0.45, 0.6, -2.2, 0.05, 0.05, 2.4, 0x26262a, 0, 0.2); B.box(0.45, 0.6, -2.2, 0.05, 0.05, 2.4, 0x26262a, 0, 0.2);
    B.box(0, 1.3, 1.07, 0.5, 0.45, 0.02, 0xe86a14);
  }
  function produceStand(B, x, y, z, ry, rng) {
    B.setBase(x, y, z, ry);
    B.boxb(0, 0, 0, 3.4, 0.9, 1.1, 0x7a5a38);
    for (const px of [-1.6, 1.6]) for (const pz of [-0.5, 0.5]) B.boxb(px, 0, pz, 0.1, 2.3, 0.1, 0x5a4028);
    for (let i = 0; i < 6; i++) B.box(-1.42 + i * 0.57, 2.42, 0, 0.57, 0.06, 1.7, i % 2 ? 0xf0ece2 : 0xb8322a, 0, 0, 0);
    for (let i = 0; i < 9; i++) pumpkinLocal(B, -1.3 + (i % 5) * 0.62, 0.9, (i < 5 ? -0.2 : 0.25), 0.2 + rng() * 0.08, rng);
    for (let i = 0; i < 4; i++) { B.boxb(-1.2 + i * 0.8, 0, 0.95, 0.6, 0.4, 0.45, 0x8a6a42); for (let k = 0; k < 4; k++) B.blob(-1.35 + i * 0.8 + (k % 2) * 0.28, 0.46, 0.85 + (k >> 1) * 0.2, 0.11, 0.11, 0.11, i % 2 ? 0xb82a22 : 0x8fae3a, k); }
  }
  function pumpkinLocal(B, x, y, z, r, rng) { B.blob(x, y + r * 0.7, z, r, r * 0.78, r, 0xd9661a, rng() * 3, 0xf08a2a); }
  function chapel(B, x, y, z, ry) {
    B.setBase(x, y, z, ry);
    B.boxb(0, -0.5, 0, 6, 5, 10, 0xe9e5d8); B.prism(0, 4.5, 0, 6.8, 3, 10.6, 0x35363b, 0);
    B.boxb(0, 4.5, 4, 2, 4.5, 2, 0xe9e5d8); B.cylb(0, 9, 4, 0, 1.5, 4, 0x35363b, 4);
    B.box(0, 1.2, 5.03, 1.3, 2.4, 0.08, 0x3a2a1c);
    for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) B.box(s * 3.03, 2.4, i * 2.6 - 0.6, 0.08, 2.0, 0.8, 0x18212b);
  }

  /* ------------------------------------------------------------------ wrecks (static, batched) */
  const CAR_COLS = [0x8a1f1f, 0x23406e, 0xd8d8d2, 0x1f1f22, 0x6b7278, 0x2f5d3a, 0xb8922e, 0x7a8a9a, 0x5a2a4a, 0xc4c0b4];
  function wheel(B, x, y, z, r, w, gone) {
    if (!gone) B.cyl(x, y, z, r, r, w, 0x121214, 12, 0, 0, PI / 2);
    B.cyl(x, y, z, r * 0.58, r * 0.58, w + 0.03, gone ? 0x3a2a22 : 0x9a9da2, 8, 0, 0, PI / 2);
  }
  /* builds a vehicle around the batcher's current base; front faces local -z. returns {len, wid, fire:[x,y,z]} */
  function vehicle(B, kind, col, rng, burnt) {
    const glass = burnt ? 0x0c0c0c : 0x1a2630, body = burnt ? 0x1f1c1a : col, dark = burnt ? 0x141211 : 0x2a2a2e;
    const j = () => (rng() - 0.5) * 0.08;
    let L = 4.4, Wd = 1.8, fire = [0, 1.0, -1.6];
    if (kind === 'sedan' || kind === 'police' || kind === 'taxi') {
      const c1 = kind === 'police' ? 0x16161a : kind === 'taxi' ? 0xe0b21a : body;
      B.box(0, 0.62, 0, 1.8, 0.56, 4.4, c1, j(), j(), j());
      if (kind === 'police' && !burnt) { B.box(0, 0.66, 0.15, 1.83, 0.5, 1.9, 0xe6e6e0); }
      B.box(0, 1.14, 0.25, 1.62, 0.5, 2.2, glass, j()); B.box(0, 1.42, 0.25, 1.56, 0.07, 1.8, kind === 'police' ? 0xe6e6e0 : c1);
      for (const s of [-1, 1]) { B.box(s * 0.78, 1.14, -0.82, 0.07, 0.52, 0.07, c1, 0, 0.5); B.box(s * 0.78, 1.14, 1.3, 0.07, 0.52, 0.07, c1, 0, -0.4); B.box(s * 0.8, 1.14, 0.2, 0.06, 0.5, 0.08, c1); }
      B.box(0, 0.42, -2.22, 1.84, 0.22, 0.14, 0x8a8d92); B.box(0, 0.42, 2.22, 1.84, 0.22, 0.14, 0x8a8d92);
      for (const s of [-1, 1]) { B.box(s * 0.62, 0.7, -2.2, 0.36, 0.16, 0.06, burnt ? dark : 0xf2efc8); B.box(s * 0.66, 0.72, 2.2, 0.32, 0.14, 0.06, burnt ? dark : 0xa81c1c); }
      for (const s of [-1, 1]) for (const z of [-1.4, 1.4]) wheel(B, s * 0.88, 0.33, z, 0.33, 0.22, burnt);
      if (rng() < 0.6) B.box(0, 1.15, -1.75, 1.6, 0.05, 1.0, c1, 0, 0.75);                        // popped hood
      if (rng() < 0.5) { const s = rng.sign(); B.box(s * 1.35, 0.85, -0.3, 0.06, 0.9, 1.0, c1, s * 1.1); }   // door flung open
      if (kind === 'police') { B.box(0, 1.52, 0.2, 1.1, 0.12, 0.3, 0x333338); B.box(-0.34, 1.54, 0.2, 0.36, 0.14, 0.26, 0xc81e1e); B.box(0.34, 1.54, 0.2, 0.36, 0.14, 0.26, 0x1e3ec8); }
      if (kind === 'taxi') B.box(0, 1.53, 0.2, 0.5, 0.16, 0.2, 0xf2efc8);
    } else if (kind === 'pickup') {
      L = 5.3; Wd = 1.95;
      B.box(0, 0.72, 0, 1.95, 0.62, 5.3, body, j(), j(), j());
      B.box(0, 1.36, -0.55, 1.8, 0.7, 1.7, glass); B.box(0, 1.74, -0.55, 1.84, 0.08, 1.74, body);
      for (const s of [-1, 1]) { B.box(s * 0.88, 1.36, -1.36, 0.08, 0.72, 0.08, body, 0, 0.35); B.box(s * 0.88, 1.36, 0.26, 0.08, 0.72, 0.1, body); B.box(s * 0.92, 1.2, 1.55, 0.08, 0.36, 2.2, body); }
      B.box(0, 1.2, 2.62, 1.9, 0.36, 0.08, body, 0, rng() < 0.5 ? 0.9 : 0);
      B.box(0, 0.5, -2.68, 2.0, 0.26, 0.16, 0x8a8d92); B.box(0, 0.5, 2.68, 2.0, 0.26, 0.16, 0x8a8d92);
      for (const s of [-1, 1]) for (const z of [-1.7, 1.6]) wheel(B, s * 0.95, 0.4, z, 0.4, 0.26, burnt);
      const cargo = rng();
      if (cargo < 0.35) { B.cyl(0, 1.5, 1.5, 0.6, 0.6, 1.2, 0xcdaa58, 10, 0, 0, PI / 2); }
      else if (cargo < 0.7) { for (let i = 0; i < 3; i++) B.box((rng() - 0.5) * 0.9, 1.3, 0.8 + i * 0.6, 0.6, 0.5, 0.5, 0x8a6a42, rng()); }
      fire = [0, 1.1, -2.0];
    } else if (kind === 'van' || kind === 'ambulance') {
      L = 4.9; Wd = 1.95;
      const c1 = kind === 'ambulance' ? (burnt ? body : 0xe8e8e2) : body;
      B.box(0, 0.74, 0, 1.95, 0.7, 4.9, c1, j(), j(), j());
      B.box(0, 1.5, 0.35, 1.9, 0.86, 4.0, c1); B.box(0, 1.52, -1.72, 1.8, 0.7, 0.2, glass, 0, 0.3);
      for (const s of [-1, 1]) { B.box(s * 0.96, 1.6, -0.9, 0.04, 0.5, 0.9, glass); if (kind === 'van') B.box(s * 0.96, 1.6, 0.9, 0.04, 0.5, 1.7, glass); }
      if (kind === 'ambulance' && !burnt) { for (const s of [-1, 1]) { B.box(s * 0.97, 1.15, 0.4, 0.03, 0.22, 3.8, 0xe0701a); B.box(s * 0.975, 1.62, 1.1, 0.03, 0.6, 0.18, 0xc81e1e); B.box(s * 0.975, 1.62, 1.1, 0.03, 0.18, 0.6, 0xc81e1e); } B.box(0, 1.98, -1.2, 1.2, 0.12, 0.3, 0xc81e1e); }
      for (const s of [-1, 1]) B.box(s * 0.55, 1.35, 2.75, 0.9, 1.4, 0.06, c1, s * (0.6 + rng() * 0.8));   // rear doors open
      B.box(0, 0.48, -2.48, 2.0, 0.24, 0.14, 0x8a8d92);
      for (const s of [-1, 1]) for (const z of [-1.55, 1.55]) wheel(B, s * 0.93, 0.38, z, 0.38, 0.24, burnt);
      fire = [0, 1.2, -1.8];
    } else if (kind === 'tractor') {
      L = 3.6; Wd = 2.1;
      const gc = burnt ? body : 0x2f6b2f;
      B.box(0, 1.1, -0.5, 0.9, 0.7, 2.2, gc); B.box(0, 0.85, 0.9, 1.1, 0.5, 1.2, gc);
      for (const [px, pz] of [[-0.6, 0.3], [0.6, 0.3], [-0.6, 1.5], [0.6, 1.5]]) B.boxb(px, 1.0, pz, 0.07, 1.5, 0.07, dark);
      B.box(0, 2.54, 0.9, 1.5, 0.08, 1.5, gc); B.cylb(0.3, 1.45, -1.2, 0.05, 0.05, 0.9, 0x222222, 6);
      for (const s of [-1, 1]) { wheel(B, s * 0.95, 0.82, 1.0, 0.82, 0.42, burnt); B.cyl(s * 0.95, 0.82, 1.0, 0.36, 0.36, 0.46, 0xe0b21a, 10, 0, 0, PI / 2); wheel(B, s * 0.7, 0.42, -1.3, 0.42, 0.24, burnt); }
      fire = [0, 1.6, -0.6];
    } else if (kind === 'bus') {
      L = 10.6; Wd = 2.5;
      const yc = burnt ? body : 0xe2ae18;
      B.box(0, 1.75, 0.8, 2.5, 2.3, 9.0, yc, j() * 0.4); B.box(0, 1.15, -4.5, 2.3, 1.1, 1.7, yc);
      for (const s of [-1, 1]) { for (let i = 0; i < 8; i++) B.box(s * 1.26, 2.25, -2.9 + i * 1.02, 0.04, 0.6, 0.8, glass); B.box(s * 1.265, 1.45, 0.8, 0.03, 0.1, 9.0, 0x121214); B.box(s * 1.265, 0.95, 0.8, 0.03, 0.08, 9.0, 0x121214); }
      B.box(0, 2.2, -3.72, 2.2, 0.9, 0.05, glass);
      B.cyl(-1.42, 1.9, -1.8, 0.3, 0.3, 0.04, 0xc81e1e, 8, 0, 0, PI / 2);
      for (const s of [-1, 1]) for (const z of [-3.9, 3.0, 4.0]) wheel(B, s * 1.12, 0.5, z, 0.5, 0.3, burnt);
      fire = [0, 1.7, -4.6];
    }
    return { L, Wd, fire };
  }
  const _wm = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _we = new THREE.Euler(0, 0, 0, 'YXZ'), _wv = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  function addCircles(ch, cx, cz, yaw, halfLen, r, owner) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), n = Math.max(1, Math.round(halfLen * 2 / (r * 1.35)));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : (i / n - 0.5) * 2 * Math.max(0, halfLen - r * 0.6);
      ch.obstacles.push({ x: cx + fx * t, z: cz + fz * t, r, cls: 'solid', owner });
    }
  }
  function placeWreck(ch, B, rng, s, lat, yawRel, kind, opts) {
    opts = opts || {};
    const x = road.x(s) + lat, z = -s, y = Math.abs(lat) > 4.6 ? G.terrainY(x, s) : road.y(s);
    const yaw = road.ang(s) + yawRel;
    const burnt = opts.burnt !== undefined ? opts.burnt : rng() < 0.22;
    const flip = opts.flip !== undefined ? opts.flip : (kind === 'bus' || kind === 'tractor' ? 0 : rng() < 0.12 ? 2 : rng() < 0.12 ? 1 : 0);
    _we.set(0, yaw, flip === 2 ? PI : flip === 1 ? PI / 2 : (rng() - 0.5) * 0.06);
    _wq.setFromEuler(_we);
    const lift = flip === 2 ? 1.55 : flip === 1 ? 0.95 : 0;
    _wm.compose(_wv.set(x, y + lift, z), _wq, _one);
    B.setBaseM(_wm);
    const v = vehicle(B, kind, rng.pick(CAR_COLS), rng, burnt);
    const owner = { kind: 'wreck', x, y: y + 0.9, z, r: v.L * 0.42 + 0.4, looted: false, chance: burnt ? 0.4 : 0.6, table: 'wreck' };
    addCircles(ch, x, z, yaw, v.L / 2, v.Wd / 2 + 0.12, owner);
    ch.lootables.push(owner);
    const burning = opts.burning !== undefined ? opts.burning : (burnt && rng() < 0.75) || rng() < 0.12;
    if (burning) { _wv.set(v.fire[0], v.fire[1], v.fire[2]).applyMatrix4(_wm); ch.fires.push({ x: _wv.x, y: Math.max(_wv.y, y + 0.6), z: _wv.z, size: 1 + rng() * 0.6 }); }
    if (kind === 'police' && !burnt && flip === 0) { for (const sx of [-0.34, 0.34]) { _wv.set(sx, 1.66, 0.2).applyMatrix4(_wm); ch.blinkers.push({ x: _wv.x, y: _wv.y, z: _wv.z, color: sx < 0 ? 0xff2020 : 0x2040ff, phase: sx < 0 ? 0 : 0.5 }); } }
    // blood & glass around it
    if (G.fx && rng() < 0.6) ch.decals.push({ x: x + (rng() - 0.5) * 3, z: z + (rng() - 0.5) * 3, r: 0.8 + rng() * 1.2, s });
    const span = v.L / 2 * Math.abs(Math.sin(yawRel)) + v.Wd / 2 * Math.abs(Math.cos(yawRel)) + 0.25;
    return { s, lo: lat - span, hi: lat + span };
  }
  function placeSemi(ch, B, rng, s, side) {
    // jack-knifed rig: trailer across both lanes, one shoulder left open
    const lat = -side * 2.7, x = road.x(s) + lat, z = -s, y = road.y(s), yaw = road.ang(s) + side * 1.15;
    _we.set(0, yaw, 0); _wq.setFromEuler(_we); _wm.compose(_wv.set(x, y, z), _wq, _one); B.setBaseM(_wm);
    B.box(0, 2.3, 0, 2.6, 2.8, 12.5, 0xdcd9d0); B.box(1.31, 2.5, 0, 0.03, 1.0, 9, 0x23406e); B.box(-1.31, 2.5, 0, 0.03, 1.0, 9, 0x23406e);
    B.box(0, 0.75, 0, 2.2, 0.3, 12.3, 0x2a2a2e);
    for (const sx of [-1, 1]) for (const zz of [3.6, 4.8]) wheel(B, sx * 1.08, 0.5, zz, 0.5, 0.5, false);
    B.boxb(0.8, 0, -4.4, 0.12, 0.9, 0.12, 0x555555); B.boxb(-0.8, 0, -4.4, 0.12, 0.9, 0.12, 0x555555);
    for (const sx of [-1, 1]) B.box(sx * 0.66, 2.3, 6.3, 1.25, 2.7, 0.08, 0xcfccc4, sx * (0.9 + rng() * 0.6));
    const owner = { kind: 'wreck', x, y: y + 1.2, z, r: 5.5, looted: false, chance: 0.85, table: 'wreck' };
    addCircles(ch, x, z, yaw, 6.25, 1.4, owner); ch.lootables.push(owner);
    // cab, folded back against the trailer
    const cyaw = yaw - side * 1.3, cx = x - Math.sin(yaw) * 6.4 - Math.sin(cyaw) * 1.6, cz = z - Math.cos(yaw) * 6.4 - Math.cos(cyaw) * 1.6;
    _we.set(0, cyaw, 0); _wq.setFromEuler(_we); _wm.compose(_wv.set(cx, y, cz), _wq, _one); B.setBaseM(_wm);
    const cc = rng.pick([0x8a1f1f, 0x23406e, 0x2f5d3a, 0x1f1f22]);
    B.box(0, 1.7, 0.6, 2.5, 2.3, 2.4, cc); B.box(0, 1.25, -1.3, 2.3, 1.3, 1.6, cc); B.box(0, 2.2, -0.58, 2.2, 0.9, 0.06, 0x1a2630);
    for (const sx of [-1, 1]) { B.cylb(sx * 1.15, 1.2, 1.6, 0.09, 0.09, 2.6, 0xb8bcc2, 8); wheel(B, sx * 1.1, 0.5, -1.3, 0.5, 0.32, false); wheel(B, sx * 1.1, 0.5, 1.2, 0.5, 0.5, false); }
    B.box(0, 0.6, -2.15, 2.4, 0.36, 0.16, 0xb8bcc2);
    addCircles(ch, cx, cz, cyaw, 2.2, 1.35, owner);
    ch.fires.push({ x: cx - Math.sin(cyaw) * 1.4, y: y + 1.9, z: cz - Math.cos(cyaw) * 1.4, size: 1.5 });
    return { s, lo: side > 0 ? -9.5 : -3.7, hi: side > 0 ? 3.7 : 9.5 };
  }

  /* ------------------------------------------------------------------ loose props (individual meshes; can be knocked about) */
  const PROP = {
    cone(B) { B.boxb(0, 0, 0, 0.36, 0.04, 0.36, 0xe0601a); B.cylb(0, 0.04, 0, 0.04, 0.15, 0.6, 0xe86a14, 8); B.cylb(0, 0.3, 0, 0.085, 0.105, 0.12, 0xf2f2f2, 8); return { r: 0.26, cls: 'bump', h: 0.6 }; },
    tire(B) { B.cylb(0, 0, 0, 0.36, 0.36, 0.24, 0x121214, 12); B.cylb(0, 0.01, 0, 0.2, 0.2, 0.24, 0x050506, 10); return { r: 0.4, cls: 'bump', h: 0.25 }; },
    tirestack(B, r) { for (let i = 0; i < 3; i++) { B.cylb((r() - 0.5) * 0.08, i * 0.25, (r() - 0.5) * 0.08, 0.36, 0.36, 0.24, 0x121214, 12); } B.cylb(0, 0.52, 0, 0.2, 0.2, 0.24, 0x050506, 10); return { r: 0.45, cls: 'break', h: 0.75, loot: 0.25, puff: 0x222222 }; },
    crate(B, r) { crateAt(B, 0, 0, 0, 0.8, r); return { r: 0.6, cls: 'break', h: 0.8, loot: 0.5, puff: 0x8a6a42 }; },
    crates(B, r) { crateAt(B, -0.45, 0, 0, 0.8, r); crateAt(B, 0.45, 0, 0.1, 0.8, r); crateAt(B, 0, 0.8, 0.05, 0.72, r); return { r: 0.95, cls: 'break', h: 1.5, loot: 0.75, puff: 0x8a6a42 }; },
    barrel(B, r) { const c = r.pick([0x2a4a7a, 0x8a3a22, 0x4a5a3a, 0xb8322a]); B.cylb(0, 0, 0, 0.3, 0.3, 0.9, c, 10); for (const h of [0.08, 0.45, 0.82]) B.cylb(0, h, 0, 0.315, 0.315, 0.05, 0x555a60, 10); return { r: 0.36, cls: 'break', h: 0.9, loot: 0.3, puff: 0x555a60 }; },
    firebarrel(B) { B.cylb(0, 0, 0, 0.32, 0.3, 0.9, 0x2a2420, 10); B.cylb(0, 0.86, 0, 0.27, 0.27, 0.05, 0xff7a1a, 10); return { r: 0.38, cls: 'solid', h: 0.9, fire: 0.55 }; },
    barricade(B) {
      for (const sx of [-1, 1]) { B.box(sx * 1.0, 0.5, 0.18, 0.06, 1.05, 0.06, 0xdddddd, 0, 0.35); B.box(sx * 1.0, 0.5, -0.18, 0.06, 1.05, 0.06, 0xdddddd, 0, -0.35); }
      for (let i = 0; i < 8; i++) B.box(-1.05 + i * 0.3, 0.88, 0, 0.3, 0.2, 0.05, i % 2 ? 0xf2f2f2 : 0xe86a14);
      B.box(0, 0.5, 0, 2.3, 0.1, 0.04, 0xdddddd);
      return { r: 0.55, cls: 'break', h: 1.0, wide: 0.72, puff: 0xe0d8c8 };
    },
    luggage(B, r) { const cs = [0x8a1f1f, 0x23406e, 0x2f5d3a, 0x5a4a3a, 0xb8922e, 0x1f1f22]; for (let i = 0; i < 4; i++) B.box((r() - 0.5) * 0.9, 0.16 + (i > 2 ? 0.3 : 0), (r() - 0.5) * 0.7, 0.6, 0.3, 0.42, r.pick(cs), r() * 3); return { r: 0.6, cls: 'bump', h: 0.5, loot: 0.6 }; },
    haybale(B) { B.cyl(0, 0.72, 0, 0.75, 0.75, 1.4, 0xcdaa58, 12, 0, 0, PI / 2); B.cyl(0, 0.72, 0, 0.3, 0.3, 1.42, 0xb8944a, 8, 0, 0, PI / 2); return { r: 0.85, cls: 'break', h: 1.4, loot: 0.8, table: 'hay', puff: 0xcdaa58 }; },
    log(B, r) { B.cyl(0, 0.34, 0, 0.3, 0.36, 4.6, 0x4f3d2b, 9, 0, 0, PI / 2); for (let i = 0; i < 4; i++) { const px = (r() - 0.5) * 3.6; B.beam(px, 0.4, 0, px + (r() - 0.5), 1.1 + r(), (r() - 0.5) * 1.6, 0.08, 0.08, 0x4f3d2b); B.blob(px + (r() - 0.5) * 0.6, 1.0 + r() * 0.6, (r() - 0.5) * 1.2, 0.6, 0.45, 0.6, r.pick(AUTUMN), r() * 3); } return { r: 0.5, cls: 'solid', h: 0.7, wide: 1.8 }; },
    pumpkins(B, r) { for (let i = 0; i < 6; i++) pumpkinLocal(B, (r() - 0.5) * 1.4, 0, (r() - 0.5) * 1.4, 0.2 + r() * 0.14, r); B.box(0.2, 0.25, 0.2, 0.9, 0.5, 0.6, 0x8a6a42, 0.5, 0, 1.2); return { r: 0.75, cls: 'bump', h: 0.45, loot: 0.55, table: 'food', puff: 0xe0781e }; },
    // buggy repair kit: a white crate with a red cross and a toolbox on top. Drive over it.
    repair(B) {
      B.box(0, 0.3, 0, 0.74, 0.6, 0.74, 0xf2efe6); for (const s of [-1, 1]) { B.box(0, 0.3 + s * 0.26, 0, 0.78, 0.07, 0.78, 0xb8b2a2); B.box(s * 0.37, 0.3, 0, 0.012, 0.3, 0.1, 0xc81e1e); B.box(s * 0.37, 0.3, 0, 0.012, 0.1, 0.3, 0xc81e1e); B.box(0, 0.3, s * 0.37, 0.1, 0.3, 0.012, 0xc81e1e); B.box(0, 0.3, s * 0.37, 0.3, 0.1, 0.012, 0xc81e1e); }
      B.box(0, 0.605, 0, 0.14, 0.012, 0.42, 0xc81e1e); B.box(0, 0.605, 0, 0.42, 0.012, 0.14, 0xc81e1e);
      B.box(0.18, 0.68, -0.18, 0.3, 0.14, 0.16, 0xb8322a, 0.5); B.box(0.18, 0.77, -0.18, 0.16, 0.03, 0.03, 0x33363a, 0.5);
      return { r: 0.62, cls: 'heal', h: 0.7, heal: 20, puff: 0xf2efe6 };
    },
    corpse(B, r) { const c = r.pick([0x23406e, 0x5a4a3a, 0x8a1f1f, 0x2f5d3a]); B.box(0, 0.14, 0, 0.5, 0.26, 0.75, c, 0.3); B.box(0.05, 0.12, 0.75, 0.36, 0.2, 0.85, 0x2a2a30, 0.2); B.box(-0.1, 0.13, -0.55, 0.24, 0.24, 0.24, 0x9a8a78); B.box(0.45, 0.08, -0.2, 0.14, 0.12, 0.6, 0x9a8a78, 0.9); return { r: 0.5, cls: 'none', h: 0.3, loot: 0.45, table: 'body' }; }
  };
  function crateAt(B, x, y, z, sz, r) {
    const ry = r() * 0.5; B.box(x, y + sz / 2, z, sz, sz, sz, 0x8a6a42, ry);
    const c = 0x6a4e2e, e = sz / 2 + 0.01;
    for (const s of [-1, 1]) { B.box(x, y + sz / 2 + s * (sz / 2 - 0.05), z, sz + 0.04, 0.09, sz + 0.04, c, ry); }
    B.box(x, y + sz / 2, z, sz + 0.03, sz, 0.09, c, ry, 0, 0.78); B.box(x, y + sz / 2, z, 0.09, sz, sz + 0.03, c, ry, 0.78);
  }
  function placeProp(ch, rng, kind, s, lat, yawRel) {
    const B = new Batcher(rng), info = PROP[kind](B, rng);
    const mesh = B.mesh(G.matBatch); mesh.castShadow = true;
    const x = road.x(s) + lat, y = Math.abs(lat) > 4.6 ? G.terrainY(x, s) : road.y(s), z = -s, yaw = road.ang(s) + (yawRel || 0);
    mesh.position.set(x, y, z); mesh.rotation.y = yaw;
    ch.group.add(mesh);
    const p = Object.assign({ kind, mesh, x, y, z, gy: y, yaw, alive: true, looted: false, s, lat }, info);
    ch.props.push(p);
    if (p.cls !== 'none') {
      if (p.wide) { const cx = Math.cos(yaw), cz = -Math.sin(yaw); for (const t of [-1, 0, 1]) ch.obstacles.push({ x: x + cx * t * p.wide, z: z + cz * t * p.wide, r: p.r, cls: p.cls, owner: p, prop: p }); }
      else ch.obstacles.push({ x, z, r: p.r, cls: p.cls, owner: p, prop: p });
    }
    if (p.loot) { p.chance = p.loot; p.table = p.table || 'debris'; p.y = y + (p.h || 0.6) * 0.6; ch.lootables.push(p); }
    if (p.fire) ch.fires.push({ x, y: y + 1.0, z, size: p.fire, prop: p });
    if (p.heal) { const sp = new THREE.Sprite(matHeal); sp.position.set(x, y + 1.25, z); sp.scale.setScalar(1.5); ch.group.add(sp); p.glow = sp; }
    const half = (p.wide ? p.wide + p.r : p.r) + 0.1;
    return { s, lo: lat - half, hi: lat + half, solid: p.cls === 'solid' };
  }

  function sign(ch, B, name, s, lat, w, h, postH, faceBack) {
    const p = P(s, lat), ry = road.ang(s) + (faceBack ? PI : 0);
    B.setBase(p.x, p.y, p.z, ry);
    const two = w > 1.6;
    if (two) { B.boxb(-w * 0.4, 0, -0.06, 0.1, postH + h, 0.1, 0x5a4630); B.boxb(w * 0.4, 0, -0.06, 0.1, postH + h, 0.1, 0x5a4630); }
    else B.boxb(0, 0, -0.05, 0.07, postH + h * 0.5, 0.07, 0x6a6e72);
    if (name !== 'buggy' && name !== 'narrow') B.box(0, postH + h / 2, -0.02, w + 0.04, h + 0.04, 0.03, 0x3a3026);
    const r = SIGNS[name], g = new THREE.PlaneGeometry(w, h);
    g.attributes.uv.array.set([r.u0, r.v1, r.u1, r.v1, r.u0, r.v0, r.u1, r.v0]);
    const m = new THREE.Mesh(g, matSign);
    m.position.set(p.x + Math.sin(ry) * 0.01, p.y + postH + h / 2, p.z + Math.cos(ry) * 0.01); m.rotation.y = ry;
    ch.group.add(m); ch.geos.push(g);
    ch.obstacles.push({ x: p.x, z: p.z, r: 0.14, cls: 'post' });
    if (two) ch.obstacles.push({ x: p.x + Math.cos(ry) * w * 0.4, z: p.z - Math.sin(ry) * w * 0.4, r: 0.14, cls: 'post' });
  }

  /* ------------------------------------------------------------------ ground & road meshes */
  const US = [-460, -330, -240, -170, -120, -85, -60, -42, -30, -21, -14, -9.5, -6.4, -4.6, 0, 4.6, 6.4, 9.5, 14, 21, 30, 42, 60, 85, 120, 170, 240, 330, 460];
  const QUILT = [0x6c8f3e, 0xc9a94e, 0x7a6a44, 0x87a046, 0x5d7f38, 0xb89a48, 0x8a7a42, 0x4f6f34];
  const USECOL = { pasture: 0x6f9440, corn: 0x8f7d44, wheat: 0xc8a84c, woods: 0x505c2c, farm: 0x73963f, pumpkin: 0x6e6038, cemetery: 0x58733a };
  const _c = new THREE.Color(), _c2 = new THREE.Color(), _gout = new THREE.Color();
  function groundColor(out, u, s, x, useL, useR) {
    const d = Math.abs(u), use = u < 0 ? useL : useR;
    if (d < 5) { out.setHex(0x6a6048); return; }
    const n = noise2(x * 0.09, s * 0.09), n2 = noise2(x * 0.02 + 40, s * 0.02);
    out.setHex(0x61813a).lerp(_c2.setHex(0x86a04a), n);                 // verge
    if (d > 9) {
      _c.setHex(USECOL[use]);
      if (use === 'wheat') _c.lerp(_c2.setHex(0xdcc068), n);
      else if (use === 'woods') _c.lerp(_c2.setHex(0x7a5a2c), n * 0.7);
      else if (use === 'corn') _c.lerp(_c2.setHex(0x6e7a3a), n2 * 0.6);
      else _c.lerp(_c2.setHex(0x88a84c), n2 * 0.7);
      out.lerp(_c, smooth(9, 13, d));
    }
    if (d > 55) { out.lerp(_c.setHex(QUILT[Math.floor(hash(Math.floor(x / 110), Math.floor(s / 140)) * QUILT.length)]), smooth(55, 110, d) * 0.9); }
    const dip = creekDip(s); if (dip > 0.3 && d > 3) out.lerp(_c.setHex(0x4a4232), clamp(dip / 3.8, 0, 1) * 0.8);
  }
  function buildGround(ch) {
    const rows = CH / 5 + 1, cols = US.length, pos = [], col = [], uv = [], idx = [];
    const useL = landUse(ch.s0 + 25, -1), useR = landUse(ch.s0 + 25, 1);
    for (let r = 0; r < rows; r++) {
      const s = ch.s0 + r * 5, rx = road.x(s);
      for (let c = 0; c < cols; c++) {
        const u = US[c], x = rx + u;
        let y = G.terrainY(x, s); if (Math.abs(u) < 5) y -= 0.1;
        pos.push(x, y, -s); uv.push(x * 0.22, s * 0.22);
        groundColor(_gout, u, s, x, useL, useR); col.push(_gout.r, _gout.g, _gout.b);
      }
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; idx.push(a, b, d, b, e, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, matGround); m.receiveShadow = true;
    ch.group.add(m); ch.geos.push(g);
  }
  const RU = [-5.2, -3.5, 0, 3.5, 5.2];
  function buildRoad(ch) {
    const rows = CH / 2.5 + 1, pos = [], uv = [], idx = [], nor = [];
    for (let r = 0; r < rows; r++) {
      const s = ch.s0 + r * 2.5, rx = road.x(s), ry = road.y(s);
      for (let c = 0; c < 5; c++) { const u = RU[c]; pos.push(rx + u, ry + (c === 2 ? 0.04 : c === 0 || c === 4 ? -0.05 : 0), -s); uv.push((u + 5.2) / 10.4, s / 20.8); nor.push(0, 1, 0); }
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < 4; c++) { const a = r * 5 + c, b = a + 1, d = a + 5, e = d + 1; idx.push(a, b, d, b, e, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, matRoad); m.receiveShadow = true; m.renderOrder = 1;
    ch.group.add(m); ch.geos.push(g);
  }

  /* ------------------------------------------------------------------ fences, poles, bridge */
  function fences(ch, B, side) {
    const type = fenceType(ch.s0 + 25, side);
    for (let i = 0; i < CH / 2.5; i++) {
      const s1 = ch.s0 + i * 2.5, s2 = s1 + 2.5, db = Math.abs(s1 - G.bridgeAt(s1));
      const funnel = db < 36;
      if (db < 15.5 || (!type && !funnel)) continue;
      const a = P(s1, W.latLimit(s1, side) * side), b = P(s2, W.latLimit(s2, side) * side);
      B.setBase(0, 0, 0, 0);
      const t = funnel ? 'guard' : type;
      if (t === 'board') {
        B.boxb(a.x, a.y - 0.3, a.z, 0.13, 1.6, 0.13, 0xf1efe6);
        for (const h of [0.42, 0.78, 1.14]) B.beam(a.x, a.y + h, a.z, b.x, b.y + h, b.z, 0.04, 0.15, 0xf1efe6);
      } else if (t === 'wire') {
        if (i % 2 === 0) B.cylb(a.x, a.y - 0.3, a.z, 0.06, 0.075, 1.6, 0x6b543a, 6);
        for (const h of [0.5, 0.85, 1.2]) B.beam(a.x, a.y + h, a.z, b.x, b.y + h, b.z, 0.018, 0.018, 0x8a8a88);
      } else if (t === 'rail') {
        B.cylb(a.x, a.y - 0.3, a.z, 0.08, 0.1, 1.5, 0x5f4a34, 6);
        B.beam(a.x, a.y + 0.55, a.z, b.x, b.y + 0.62, b.z, 0.1, 0.1, 0x6a543a); B.beam(a.x, a.y + 1.05, a.z, b.x, b.y + 0.98, b.z, 0.1, 0.1, 0x6a543a);
      } else if (t === 'iron') {
        B.boxb(a.x, a.y - 0.2, a.z, 0.08, 1.7, 0.08, 0x1a1a1c); B.cylb(a.x, a.y + 1.5, a.z, 0, 0.07, 0.2, 0x1a1a1c, 4);
        B.beam(a.x, a.y + 0.25, a.z, b.x, b.y + 0.25, b.z, 0.03, 0.05, 0x1a1a1c); B.beam(a.x, a.y + 1.2, a.z, b.x, b.y + 1.2, b.z, 0.03, 0.05, 0x1a1a1c);
        for (let k = 1; k < 5; k++) { const f = k / 5; B.boxb(lerp(a.x, b.x, f), lerp(a.y, b.y, f) + 0.2, lerp(a.z, b.z, f), 0.025, 1.2, 0.025, 0x1a1a1c); }
      } else { // bridge approach guard rail
        const ya = road.y(s1), yb = road.y(s2);
        B.boxb(a.x, Math.min(a.y, ya) - 3.5, a.z, 0.2, 4.6 + Math.max(0, ya - a.y), 0.2, 0x5a4634);
        B.beam(a.x, ya + 0.5, a.z, b.x, yb + 0.5, b.z, 0.08, 0.22, 0x6e5640); B.beam(a.x, ya + 0.95, a.z, b.x, yb + 0.95, b.z, 0.08, 0.22, 0x6e5640);
      }
    }
  }
  function poles(ch, B, rng) {
    const s = ch.s0 + 10; if (Math.abs(s - G.bridgeAt(s)) < 40) return;
    const lat = 8.8, a = P(s, lat), ry = road.ang(s);
    B.setBase(a.x, a.y, a.z, ry);
    B.cylb(0, -0.5, 0, 0.11, 0.16, 9, 0x4a3c2c, 7); B.box(0, 7.9, 0, 2.2, 0.12, 0.12, 0x4a3c2c); B.box(0, 7.2, 0, 1.4, 0.1, 0.1, 0x4a3c2c);
    for (const ix of [-1, 0.2, 1]) B.cylb(ix, 7.96, 0, 0.04, 0.05, 0.14, 0x9ab0a8, 6);
    if (rng() < 0.3) B.cylb(0.25, 6.2, 0, 0.2, 0.2, 0.6, 0x7a8086, 8);
    ch.obstacles.push({ x: a.x, z: a.z, r: 0.2, cls: 'post' });
    const s2 = s + CH; if (Math.abs(s2 - G.bridgeAt(s2)) < 40) return;
    const b = P(s2, lat); B.setBase(0, 0, 0, 0);
    for (const ix of [-1, 1]) {
      const ox = Math.cos(ry) * ix, oz = -Math.sin(ry) * ix; let px = a.x + ox, py = a.y + 8.05, pz = a.z + oz;
      for (let k = 1; k <= 5; k++) { const f = k / 5, nx = lerp(a.x, b.x, f) + ox, nz = lerp(a.z, b.z, f) + oz, ny = lerp(a.y, b.y, f) + 8.05 - Math.sin(f * PI) * 0.9; B.beam(px, py, pz, nx, ny, nz, 0.025, 0.025, 0x16161a); px = nx; py = ny; pz = nz; }
    }
  }
  function bridge(ch, B, rng) {
    const sb = G.bridgeAt(ch.s0 + 25);
    if (sb < ch.s0 - 20 || sb >= ch.s0 + CH + 20) return;
    const red = 0x7c2a20, wood = 0x6b5038, dark = 0x3e2f22;
    for (let s = Math.max(ch.s0, sb - 16); s < Math.min(ch.s0 + CH, sb + 16); s += 2) {
      const sm = s + 1, x = road.x(sm), y = road.y(sm), ry = road.ang(sm), end = (s <= sb - 16 || s >= sb + 14);
      B.setBase(x, y, -sm, ry);
      B.box(0, -0.28, 0, 7.2, 0.5, 2.06, dark);                                              // deck beam
      for (let k = 0; k < 4; k++) B.box(0, 0.02, -0.75 + k * 0.5, 6.6, 0.07, 0.46, k % 2 ? 0x7a6248 : 0x6e563e);   // planks
      for (const sd of [-1, 1]) {
        B.box(sd * 3.38, 0.7, 0, 0.1, 1.4, 2.04, red); B.box(sd * 3.38, 3.5, 0, 0.1, 1.6, 2.04, red);       // siding with a window band
        B.box(sd * 3.32, 2.1, -0.98, 0.16, 4.2, 0.16, wood);
        B.box(sd * 3.3, 2.15, 0, 0.1, 0.14, 2.9, wood, 0, sd * ((s / 2) % 2 ? 0.75 : -0.75));      // truss diagonals
        B.box(sd * 3.3, 1.42, 0, 0.14, 0.12, 2.04, wood); B.box(sd * 3.3, 2.72, 0, 0.14, 0.12, 2.04, wood);
        B.box(sd * 1.95, 5.15, 0, 4.4, 0.1, 2.1, 0x35363b, 0, 0, -sd * 0.42);                       // roof slopes
      }
      B.box(0, 4.25, -0.98, 6.8, 0.16, 0.16, wood);
      if (end) { const zf = s <= sb - 16 ? 1.0 : -1.0; B.prism(0, 4.25, zf * 0.95, 7.4, 1.75, 0.14, 0xf0ece2, 0); for (const sd of [-1, 1]) B.box(sd * 3.4, 2.1, zf * 0.98, 0.42, 4.3, 0.16, 0xf0ece2); }
    }
    // stone abutments + water
    for (const e of [-1, 1]) {
      const s = sb + e * 17.5; if (s < ch.s0 || s >= ch.s0 + CH) continue;
      B.setBase(road.x(s), road.y(s), -s, road.ang(s));
      B.box(0, -2.3, 0, 8.6, 4.4, 3.4, 0x85827a); B.box(0, -4.2, -e * 2.2, 9.4, 1.2, 2.2, 0x75726a);
    }
    if (sb >= ch.s0 && sb < ch.s0 + CH) {
      const g = new THREE.PlaneGeometry(900, 15, 1, 1); g.rotateX(-PI / 2);
      const m = new THREE.Mesh(g, matWater); m.position.set(road.x(sb), road.y(sb) - 3.0, -sb);
      ch.group.add(m); ch.geos.push(g);
    }
  }

  /* ------------------------------------------------------------------ land-use decoration */
  function corn(ch, B, side) {
    const j0 = B.jitter; B.jitter = 0.16;
    for (let row = 0; row < 7; row++) {
      const lat = side * (9.2 + row * 0.95);
      for (let s = ch.s0 + B.rnd() * 0.7; s < ch.s0 + CH; s += 0.72 + B.rnd() * 0.3) {
        const p = P(s, lat + (B.rnd() - 0.5) * 0.25), h = 1.9 + B.rnd() * 0.6;
        B.setBase(p.x, p.y, p.z, B.rnd() * 6.28);
        B.boxb(0, 0, 0, 0.05, h, 0.05, 0xa89850);
        B.box(0.2, h * 0.55, 0, 0.46, 0.02, 0.09, 0xb8a455, 0, 0, -0.5); B.box(-0.2, h * 0.75, 0, 0.46, 0.02, 0.09, 0xa4a04a, 0, 0, 0.5);
        if (row < 3) B.box(0, h * 0.4, 0.14, 0.09, 0.02, 0.4, 0xb8a455, 0, 0.6);
      }
    }
    // the mass of the field behind the detailed rows
    const us = [16, 22, 34, 55, 90].map(v => v * side);
    B.setBase(0, 0, 0, 0);
    for (let s = ch.s0; s < ch.s0 + CH; s += 5) {
      const t = (u, ss) => { const x = road.x(ss) + u; return [x, G.terrainY(x, ss) + 2.05, -ss]; };
      const g = (u, ss) => { const x = road.x(ss) + u; return [x, G.terrainY(x, ss), -ss]; };
      if (side > 0) B.quad(g(us[0], s + 5), g(us[0], s), t(us[0], s), t(us[0], s + 5), 0x9a8a48);
      else B.quad(g(us[0], s), g(us[0], s + 5), t(us[0], s + 5), t(us[0], s), 0x9a8a48);
      for (let k = 0; k < us.length - 1; k++) {
        if (side > 0) B.quad(t(us[k], s), t(us[k + 1], s), t(us[k + 1], s + 5), t(us[k], s + 5), k % 2 ? 0xa8964e : 0x9c8c48);
        else B.quad(t(us[k + 1], s), t(us[k], s), t(us[k], s + 5), t(us[k + 1], s + 5), k % 2 ? 0xa8964e : 0x9c8c48);
      }
    }
    B.jitter = j0;
  }
  function decorate(ch, B, side, rng) {
    const use = landUse(ch.s0 + 25, side), zc = zoneChunk(ch.s0 + 25, side), s0 = ch.s0;
    const nearBridge = s => Math.abs(s - G.bridgeAt(s)) < 30;
    const at = (s, lat) => P(s, lat * side);
    const fall = () => rng() < 0.45 ? 'autumn' : 'oak';
    // trees hugging the road almost everywhere — long shadows across the asphalt
    if (use !== 'corn') for (let k = 0; k < 2; k++) if (rng() < 0.55) { const s = s0 + rng() * CH; if (nearBridge(s)) continue; const p = at(s, 9.6 + rng() * 3); tree(B, p.x, p.y, p.z, rng() < 0.18 ? 'willow' : fall(), 0.9 + rng() * 0.5, rng); }
    if (use === 'pasture') {
      for (let k = 0; k < 3; k++) { const p = at(s0 + rng() * CH, 18 + rng() * 60); tree(B, p.x, p.y, p.z, rng() < 0.3 ? 'willow' : fall(), 1 + rng() * 0.7, rng); }
      const n = rng.int(0, 5), horses = rng() < 0.3;
      for (let k = 0; k < n; k++) { const p = at(s0 + rng() * CH, 11 + rng() * 34); cow(B, p.x, p.y, p.z, rng() * 6.28, rng, horses); }
      if (rng() < 0.3) { const p = at(s0 + rng() * CH, 12 + rng() * 10); B.setBase(p.x, p.y, p.z, rng() * 3); B.boxb(0, 0, 0, 2.2, 0.5, 0.7, 0x7a7e82); B.box(0, 0.48, 0, 2.0, 0.04, 0.5, 0x3a5a6a); }
    } else if (use === 'corn') {
      corn(ch, B, side);
    } else if (use === 'wheat') {
      const n = rng.int(2, 6);
      for (let k = 0; k < n; k++) { const p = at(s0 + rng() * CH, 12 + rng() * 55); haybale(B, p.x, p.y, p.z, rng() * 3); }
      if (rng() < 0.25) { const p = at(s0 + rng() * CH, 30 + rng() * 30); tree(B, p.x, p.y, p.z, 'oak', 1.5, rng); }
    } else if (use === 'woods') {
      const n = rng.int(16, 24);
      for (let k = 0; k < n; k++) { const s = s0 + rng() * CH, p = at(s, 10 + Math.pow(rng(), 1.5) * 80); tree(B, p.x, p.y, p.z, rng() < 0.3 ? 'pine' : rng() < 0.08 ? 'dead' : fall(), 0.9 + rng() * 0.9, rng); }
      for (let k = 0; k < 8; k++) { const p = at(s0 + rng() * CH, 9.5 + rng() * 25); bush(B, p.x, p.y, p.z, 0.7 + rng() * 0.9, rng, rng() < 0.4 ? 0x8a5a2a : 0x4a6a2c); }
    } else if (use === 'farm') {
      if (zc === 2 || zoneOf(s0 + 25, side) <= 0 && ch.ci === 0) {
        const sH = s0 + 22, p = at(sH, 30), face = road.ang(sH) + (side > 0 ? -PI / 2 : PI / 2);
        farmhouse(B, p.x, p.y + 0.3, p.z, face, rng);
        const pb = at(sH + 16, 56); barn(B, pb.x, pb.y + 0.5, pb.z, road.ang(sH) + rng() * 0.3, rng, rng() < 0.45);
        const pw = at(sH - 14, 44); windmill(B, pw.x, pw.y, pw.z, rng);
        const pc = at(sH - 10, 24); clothesline(B, pc.x, pc.y, pc.z, road.ang(sH) + PI / 2, rng);
        const pg = at(sH + 6, 40); parkedBuggy(B, pg.x, pg.y, pg.z, rng() * 6);
        // gravel lane to the road
        B.setBase(0, 0, 0, 0);
        for (let l = 5; l < 28; l += 3) { const a1 = at(sH + 9, l), a2 = at(sH + 9, l + 3), b1 = at(sH + 12.5, l), b2 = at(sH + 12.5, l + 3); const q = [[a1.x, a1.y + 0.05, a1.z], [a2.x, a2.y + 0.05, a2.z], [b2.x, b2.y + 0.05, b2.z], [b1.x, b1.y + 0.05, b1.z]]; if (side > 0) B.quad(q[0], q[1], q[2], q[3], 0x8d8678); else B.quad(q[3], q[2], q[1], q[0], 0x8d8678); }
        const pm = at(sH + 7.5, 5.9); mailbox(B, pm.x, pm.y, pm.z, road.ang(sH)); ch.obstacles.push({ x: pm.x, z: pm.z, r: 0.16, cls: 'post' });
        for (let k = 0; k < 4; k++) { const pt = at(sH - 6 + rng() * 30, 14 + rng() * 14); tree(B, pt.x, pt.y, pt.z, rng() < 0.3 ? 'willow' : fall(), 1.1 + rng() * 0.5, rng); }
        if (ch.ci > 1) sign(ch, B, rng.pick(['pies', 'eggs', 'quilts']), sH + 2, 6.6 * side, 1.9, 0.95, 0.9, false);
      } else {
        const n = rng.int(1, 4); for (let k = 0; k < n; k++) { const p = at(s0 + rng() * CH, 11 + rng() * 30); cow(B, p.x, p.y, p.z, rng() * 6.28, rng, rng() < 0.4); }
        for (let k = 0; k < 3; k++) { const p = at(s0 + rng() * CH, 20 + rng() * 60); tree(B, p.x, p.y, p.z, fall(), 1 + rng() * 0.6, rng); }
      }
    } else if (use === 'pumpkin') {
      for (let k = 0; k < 46; k++) { const p = at(s0 + rng() * CH, 9.5 + rng() * 24); pumpkin(B, p.x, p.y, p.z, 0.2 + rng() * 0.18, rng); if (k % 4 === 0) bush(B, p.x + 0.4, p.y - 0.25, p.z + 0.3, 0.5, rng, 0x55702c); }
      if (zc === 2) { const p = at(s0 + 25, 8.6); produceStand(B, p.x, p.y, p.z, road.ang(s0 + 25) + (side > 0 ? -PI / 2 : PI / 2), rng); ch.obstacles.push({ x: p.x, z: p.z, r: 1.3, cls: 'solid' }); sign(ch, B, 'pumpkins', s0 + 12, 7.2 * side, 1.9, 0.95, 0.8, false); }
    } else if (use === 'cemetery') {
      for (let r = 0; r < 4; r++) for (let s = s0 + 2; s < s0 + CH; s += 3.2) { if (rng() < 0.3) continue; const p = at(s + rng() * 0.6, 10.5 + r * 4.2 + rng() * 0.8); gravestone(B, p.x, p.y, p.z, road.ang(s) + (side > 0 ? -PI / 2 : PI / 2), rng); }
      for (let k = 0; k < 2; k++) { const p = at(s0 + rng() * CH, 13 + rng() * 22); tree(B, p.x, p.y, p.z, rng() < 0.6 ? 'dead' : 'willow', 1.1, rng); }
      if (zc === 2) { const p = at(s0 + 25, 42); chapel(B, p.x, p.y, p.z, road.ang(s0 + 25) + (side > 0 ? -PI / 2 : PI / 2)); }
    }
    // far treelines so the horizon reads as country, not void
    for (let k = 0; k < 3; k++) { const p = at(s0 + rng() * CH, 110 + rng() * 200); tree(B, p.x, p.y, p.z, rng() < 0.3 ? 'pine' : fall(), 1.6 + rng() * 1.4, rng); }
  }

  /* ------------------------------------------------------------------ hazards on the road */
  function corridorOK(list, cand, limL, limR) {
    const spans = [];
    for (const o of list) if (Math.abs(o.s - cand.s) < 9.5) spans.push(o);
    if (!spans.length) return true;
    spans.push(cand); spans.sort((a, b) => a.lo - b.lo);
    let cur = -limL + 0.2;
    for (const sp of spans) { if (sp.lo - cur >= 2.7) return true; cur = Math.max(cur, sp.hi); }
    return limR - 0.2 - cur >= 2.7;
  }
  function hazards(ch, B, rng) {
    if (ch.ci < 2) return;
    const t = G.state ? G.state.time : 0, d = clamp((t + 45) / 560, 0, 1), s0 = ch.s0;
    const nearBridge = s => Math.abs(s - G.bridgeAt(s)) < 42;
    const solids = [];
    const kinds = ['sedan', 'sedan', 'sedan', 'pickup', 'pickup', 'van', 'taxi', 'police', 'ambulance', 'tractor', 'bus'];
    const tryWreck = (s, lat, yaw, kind, opts) => {
      if (nearBridge(s)) return false;
      const L = kind === 'bus' ? 10.6 : kind === 'pickup' ? 5.3 : 4.6, span = L / 2 * Math.abs(Math.sin(yaw)) + 1.0 * Math.abs(Math.cos(yaw)) + 0.25;
      const cand = { s, lo: lat - span, hi: lat + span };
      if (!corridorOK(solids, cand, W.latLimit(s, -1), W.latLimit(s, 1))) return false;
      solids.push(placeWreck(ch, B, rng, s, lat, yaw, kind, opts)); return true;
    };
    const set = rng(), mid = s0 + 25;
    if (d > 0.3 && set < 0.09 && !nearBridge(mid)) {
      // police roadblock — one buggy-wide gap
      const gap = rng.range(-1.2, 1.2);
      solids.push(placeWreck(ch, B, rng, mid, gap - 3.9, 1.25, 'police', { burnt: false, flip: 0, burning: false }));
      solids.push(placeWreck(ch, B, rng, mid + 0.5, gap + 3.9, -1.2, 'police', { burnt: false, flip: 0, burning: false }));
      for (let k = 0; k < 5; k++) placeProp(ch, rng, 'cone', mid - 9 - k * 2.5, gap + (k % 2 ? 2.2 : -2.2) + k * 0.2 * (k % 2 ? 1 : -1));
      placeProp(ch, rng, 'barricade', mid - 14, gap + rng.sign() * 3.4, 0);
      sign(ch, B, 'quarantine', mid - 22, 6.3, 1.9, 0.95, 0.9, false);
    } else if (d > 0.42 && set < 0.2 && !nearBridge(mid)) {
      // pile-up: slalom
      let lane = rng.sign();
      for (let k = 0; k < 4; k++) { tryWreck(s0 + 4 + k * 11.5, lane * (1.5 + rng() * 1.2), (rng() - 0.5) * 1.6, rng.pick(kinds)); lane = -lane; }
    } else if (d > 0.25 && set < 0.28 && !nearBridge(mid) && !nearBridge(mid + 12) && !nearBridge(mid - 12)) {
      solids.push(placeSemi(ch, B, rng, mid, rng.sign()));
      if (rng() < 0.5) sign(ch, B, 'dead', mid - 20, -6.3, 1.9, 0.95, 0.9, false);
    } else {
      const n = (rng() < 0.3 + 0.55 * d ? 1 : 0) + (rng() < d * 0.65 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const s = s0 + 6 + k * 22 + rng() * 14, where = rng();
        const lat = where < 0.38 ? 1.75 + (rng() - 0.5) : where < 0.76 ? -1.75 + (rng() - 0.5) : where < 0.88 ? rng.sign() * (4.8 + rng()) : (rng() - 0.5);
        tryWreck(s, lat, rng() < 0.6 ? (rng() - 0.5) * 0.7 : (rng() - 0.5) * 3.0, rng.pick(kinds));
      }
    }
    // loose debris
    // repair crates: a little more common as the road gets worse
    if (rng() < 0.24 + 0.2 * d) {
      const s = s0 + 5 + rng() * 40, lim = Math.min(W.latLimit(s, -1), W.latLimit(s, 1)) - 1.2, lat = clamp(rng.range(-4.2, 4.2), -lim, lim);
      let clash = false; for (const o of solids) if (Math.abs(o.s - s) < 5 && lat > o.lo - 1.2 && lat < o.hi + 1.2) clash = true;
      if (!clash) placeProp(ch, rng, 'repair', s, lat, rng() * 0.6);
    }
    const nd = Math.floor(rng() * (1.8 + 3.4 * d));
    const dk = ['cone', 'tire', 'tire', 'tirestack', 'crate', 'crates', 'barrel', 'barrel', 'luggage', 'luggage', 'haybale', 'pumpkins', 'corpse', 'corpse', 'barricade', 'firebarrel', 'log'];
    for (let k = 0; k < nd; k++) {
      const s = s0 + rng() * CH, kind = rng.pick(dk), onB = Math.abs(s - G.bridgeAt(s)) < 20;
      if (onB && (kind === 'log' || kind === 'firebarrel' || kind === 'barricade' || kind === 'haybale' || kind === 'crates')) continue;
      const lim = Math.min(W.latLimit(s, -1), W.latLimit(s, 1)) - 0.9, lat = clamp(rng.range(-5.2, 5.2), -lim, lim);
      const yaw = rng() * 3;
      if (kind === 'log' || kind === 'firebarrel') {
        const half = kind === 'log' ? 2.4 : 0.5, cand = { s, lo: lat - half, hi: lat + half };
        if (!corridorOK(solids, cand, W.latLimit(s, -1), W.latLimit(s, 1))) continue;
        solids.push(cand); placeProp(ch, rng, kind, s, lat, kind === 'log' ? (rng() - 0.5) * 0.5 : 0);
      } else {
        let clash = false; for (const o of solids) if (Math.abs(o.s - s) < 4 && lat > o.lo - 0.8 && lat < o.hi + 0.8) clash = true;
        if (!clash) placeProp(ch, rng, kind, s, lat, yaw);
      }
    }
    // roadside furniture
    if (rng() < 0.16) sign(ch, B, 'buggy', s0 + 8, 6.2, 0.9, 0.9, 1.6, false);
    else if (rng() < 0.1) sign(ch, B, 'speed', s0 + 30, 6.2, 0.6, 0.8, 1.6, false);
    const sb = G.bridgeAt(s0 + 25); if (sb - 70 >= s0 && sb - 70 < s0 + CH) sign(ch, B, 'narrow', sb - 70, 6.2, 0.9, 0.9, 1.6, false);
    if (d > 0.3 && rng() < 0.07) sign(ch, B, rng() < 0.5 ? 'dead' : 'quarantine', s0 + 40, -6.4, 1.9, 0.95, 0.9, false);
  }

  /* ------------------------------------------------------------------ chunk lifecycle */
  function buildChunk(ci) {
    const rng = G.rng(ci * 7919 + 13 + (W.seed | 0));
    const ch = { ci, s0: ci * CH, group: new THREE.Group(), obstacles: [], lootables: [], fires: [], props: [], blinkers: [], decals: [], geos: [], sparks: [] };
    buildGround(ch); buildRoad(ch);
    const B = new Batcher(rng);
    fences(ch, B, -1); fences(ch, B, 1);
    decorate(ch, B, -1, rng); decorate(ch, B, 1, rng);
    poles(ch, B, rng); bridge(ch, B, rng); hazards(ch, B, rng);
    if (!B.empty) { const m = B.mesh(G.matBatch); m.castShadow = true; m.receiveShadow = true; ch.group.add(m); ch.geos.push(m.geometry); }
    for (const l of ch.lootables) {
      const sp = new THREE.Sprite(matSpark); sp.position.set(l.x, l.y + (l.kind === 'wreck' ? 1.3 : 0.7), l.z); sp.scale.setScalar(0.9);
      ch.group.add(sp); l.spark = sp; ch.sparks.push(sp);
    }
    for (const dcl of ch.decals) if (G.fx) G.fx.decal(dcl.x, road.y(dcl.s) + 0.02, dcl.z, dcl.r, true);
    W.scene.add(ch.group);
    return ch;
  }
  function dropChunk(ch) {
    W.scene.remove(ch.group);
    for (const g of ch.geos) g.dispose();
    for (const p of ch.props) if (p.mesh) p.mesh.geometry.dispose();
  }
  W.reset = function () {
    for (const ch of W.chunks.values()) dropChunk(ch);
    W.chunks.clear();
    W.seed = (Math.random() * 1e6) | 0;
  };
  W.update = function (s, sync) {
    const lo = Math.floor((s - 170) / CH), hi = Math.floor((s + 420) / CH);
    for (const [ci, ch] of W.chunks) if (ci < lo || ci > hi) { dropChunk(ch); W.chunks.delete(ci); }
    let built = 0;
    for (let ci = Math.max(lo, -4); ci <= hi; ci++) if (!W.chunks.has(ci)) { W.chunks.set(ci, buildChunk(ci)); if (!sync && ++built >= 1) break; }
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.005);
    matSpark.opacity = pulse; matSpark.rotation = performance.now() * 0.0006; matHeal.opacity = 0.45 + 0.4 * pulse;
  };
  /* iterate things near s */
  W.each = function (key, s, range, fn) {
    const lo = Math.floor((s - range) / CH), hi = Math.floor((s + range) / CH);
    for (let ci = lo; ci <= hi; ci++) { const ch = W.chunks.get(ci); if (!ch) continue; const arr = ch[key]; for (let i = 0; i < arr.length; i++) fn(arr[i], ch); }
  };
  W.removeObstaclesOf = function (prop) {
    for (const ch of W.chunks.values()) { if (ch.props.indexOf(prop) < 0) continue; ch.obstacles = ch.obstacles.filter(o => o.prop !== prop); ch.fires = ch.fires.filter(f => f.prop !== prop); }
  };
  W.markLooted = function (l) { l.looted = true; if (l.spark) { l.spark.visible = false; } };
})();
