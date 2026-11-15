'use strict';
/* Particles, blood decals, gibs, flying loot, fire glow, police blinkers, item/weapon models. */
(function () {
  const { clamp, lerp, Batcher } = G;
  const FX = G.fx = {};
  const PI = Math.PI;

  /* ------------------------------------------------------------------ particle systems */
  const P_VS = `attribute float size; attribute vec4 pcolor; uniform float scale; varying vec4 vC;
    void main(){ vC = pcolor; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }`;
  const P_FS = `varying vec4 vC; uniform float soft;
    void main(){ float r = length(gl_PointCoord-0.5)*2.0; float a = smoothstep(1.0, soft, r)*vC.a; if(a<0.012) discard; gl_FragColor = vec4(vC.rgb, a);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`;
  class PSys {
    constructor(scene, n, additive) {
      this.n = n; this.head = 0;
      this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
      this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
      this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
      this.uni = { scale: { value: 600 }, soft: { value: additive ? 0.0 : 0.35 } };
      const m = new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5;
      const uni = this.uni, v2 = new THREE.Vector2();
      this.points.onBeforeRender = (renderer, sc, camera) => {
        const rt = renderer.getRenderTarget(); const h = rt ? rt.height : renderer.getDrawingBufferSize(v2).y;
        uni.scale.value = h * 0.5 / Math.tan((camera.fov || 60) * PI / 360);
      };
      scene.add(this.points);
    }
    emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav, drag) {
      const i = this.head; this.head = (i + 1) % this.n;
      const i3 = i * 3, i4 = i * 4;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.grav[i] = grav || 0; this.drag[i] = drag || 0;
      this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a; this.size[i] = s0;
    }
    update(dt) {
      const n = this.n, pos = this.pos, vel = this.vel, life = this.life;
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) continue;
        const l = life[i] - dt; life[i] = l;
        if (l <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
        const i3 = i * 3, k = 1 - this.drag[i] * dt;
        vel[i3] *= k; vel[i3 + 2] *= k; vel[i3 + 1] = vel[i3 + 1] * k - this.grav[i] * dt;
        pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
        const t = 1 - l / this.max[i];
        this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
        this.col[i * 4 + 3] = this.a0[i] * (t < 0.1 ? t * 10 : 1 - (t - 0.1) / 0.9);
      }
      const a = this.points.geometry.attributes; a.position.needsUpdate = true; a.pcolor.needsUpdate = true; a.size.needsUpdate = true;
    }
    clear() { this.life.fill(0); this.size.fill(0); }
  }

  let add, nrm, scene;
  const R = () => Math.random() - 0.5;
  const _col = new THREE.Color();

  /* ------------------------------------------------------------------ decals, gibs */
  const decals = [], gibs = [], loot = [];
  let decalHead = 0, gibHead = 0, decalMat, gibGeo;
  const blinkSprites = [], glowSprites = [];
  let fireLight, glowMat;

  FX.init = function (sc) {
    scene = sc;
    nrm = FX.nrm = new PSys(sc, 2400, false);
    add = FX.add = new PSys(sc, 1800, true);
    const tex = G.canvasTex(256, 256, (g) => {
      const rnd = G.rng(31);
      for (let i = 0; i < 26; i++) {
        const a = rnd() * 6.28, d = rnd() * rnd() * 96, r = 6 + rnd() * 34 * (1 - d / 120);
        g.fillStyle = `rgba(${70 + rnd() * 40 | 0},${4 + rnd() * 8 | 0},${4 + rnd() * 6 | 0},${0.75 + rnd() * 0.25})`;
        g.beginPath(); g.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); g.fill();
      }
      for (let i = 0; i < 60; i++) { const a = rnd() * 6.28, d = 40 + rnd() * 84; g.fillStyle = 'rgba(86,6,6,0.85)'; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + rnd() * 4, 0, 7); g.fill(); }
    }, { repeat: false });
    decalMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -12 });
    const dg = new THREE.PlaneGeometry(1, 1); dg.rotateX(-PI / 2);
    for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(dg, decalMat); m.visible = false; m.renderOrder = 2; m.receiveShadow = true; sc.add(m); decals.push(m); }
    gibGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 44; i++) { const m = new THREE.Mesh(gibGeo, G.mat(0x7a1010)); m.visible = false; m.castShadow = true; sc.add(m); gibs.push({ m, life: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, gy: 0 }); }
    glowMat = new THREE.SpriteMaterial({ map: G.glowTex('rgba(255,200,120,1)', 'rgba(255,120,30,0.4)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(glowMat.clone()); s.visible = false; sc.add(s); glowSprites.push(s); }
    for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); s.visible = false; sc.add(s); blinkSprites.push(s); }
    fireLight = new THREE.PointLight(0xff7a2a, 0, 28, 1.6); sc.add(fireLight);
    buildItemGeos();
  };
  FX.reset = function () {
    nrm.clear(); add.clear();
    for (const d of decals) d.visible = false;
    for (const g of gibs) { g.m.visible = false; g.life = 0; }
    for (const l of loot) scene.remove(l.mesh);
    loot.length = 0;
  };

  FX.decal = function (x, y, z, r) {
    const m = decals[decalHead]; decalHead = (decalHead + 1) % decals.length;
    m.position.set(x, y + 0.03, z); m.scale.set(r * 2, 1, r * 2); m.rotation.y = Math.random() * 6.28; m.visible = true;
  };
  FX.blood = function (x, y, z, n, vx, vz, power) {
    power = power || 1;
    for (let i = 0; i < n; i++) {
      const s = 0.07 + Math.random() * 0.14;
      nrm.emit(x + R() * 0.3, y + R() * 0.4, z + R() * 0.3, (vx || 0) * 0.5 + R() * 5 * power, 1 + Math.random() * 4.5 * power, (vz || 0) * 0.5 + R() * 5 * power, 0.5 + Math.random() * 0.6, s, s * 0.6, 0.30 + Math.random() * 0.12, 0.0, 0.0, 0.95, 13, 0.6);
    }
    for (let i = 0; i < Math.min(4, n / 4); i++) nrm.emit(x, y, z, R() * 1.5, 0.6 + Math.random(), R() * 1.5, 0.5, 0.3, 1.1, 0.28, 0.0, 0.0, 0.4, 1, 1);
  };
  FX.acid = function (x, y, z, n) {
    for (let i = 0; i < n; i++) { const s = 0.12 + Math.random() * 0.25; nrm.emit(x + R(), y + R(), z + R(), R() * 12, 2 + Math.random() * 8, R() * 12, 0.6 + Math.random() * 0.7, s, s * 0.5, 0.42, 0.62, 0.08, 0.95, 14, 0.5); }
    for (let i = 0; i < 14; i++) nrm.emit(x + R() * 2, y + Math.random(), z + R() * 2, R() * 3, 1 + Math.random() * 2, R() * 3, 1.6 + Math.random(), 1.0, 3.6, 0.36, 0.5, 0.1, 0.4, -0.3, 0.8);
  };
  FX.dust = function (x, y, z, n, hex, spread, up) {
    _col.set(hex === undefined ? 0xb8a888 : hex); spread = spread || 1;
    for (let i = 0; i < n; i++) nrm.emit(x + R() * spread, y + Math.random() * 0.3, z + R() * spread, R() * 2.2 * spread, 0.4 + Math.random() * (up || 1.4), R() * 2.2 * spread, 0.7 + Math.random() * 0.9, 0.25, 1.5 + Math.random(), _col.r, _col.g, _col.b, 0.34, -0.2, 1.2);
  };
  FX.chunks = function (x, y, z, n, hex, power) {   // splinters / hay / pumpkin bits
    _col.set(hex); power = power || 1;
    for (let i = 0; i < n; i++) { const s = 0.06 + Math.random() * 0.14, k = 0.7 + Math.random() * 0.5; nrm.emit(x + R() * 0.6, y + Math.random() * 0.6, z + R() * 0.6, R() * 9 * power, 2 + Math.random() * 6 * power, R() * 9 * power, 0.7 + Math.random() * 0.8, s, s, _col.r * k, _col.g * k, _col.b * k, 1, 14, 0.4); }
  };
  FX.sparks = function (x, y, z, n, vx, vz) {
    for (let i = 0; i < n; i++) add.emit(x, y, z, (vx || 0) + R() * 7, 1 + Math.random() * 5, (vz || 0) + R() * 7, 0.25 + Math.random() * 0.45, 0.09, 0.02, 1.0, 0.62 + Math.random() * 0.3, 0.2, 1, 12, 0.5);
  };
  FX.flash = function (x, y, z, size, r, g, b) { add.emit(x, y, z, 0, 0, 0, 0.09, size, size * 1.6, r, g, b, 1, 0, 0); };
  FX.smokePuff = function (x, y, z, n, dark) {
    const c = dark ? 0.08 : 0.5;
    for (let i = 0; i < n; i++) nrm.emit(x + R() * 0.4, y + R() * 0.3, z + R() * 0.4, R() * 1.5, 0.8 + Math.random() * 1.5, R() * 1.5, 0.9 + Math.random() * 0.9, 0.4, 2.2, c, c, c, 0.4, -0.4, 1.0);
  };
  FX.gib = function (x, y, z, n, hex, vx, vz, power) {
    power = power || 1;
    for (let i = 0; i < n; i++) {
      const g = gibs[gibHead]; gibHead = (gibHead + 1) % gibs.length;
      g.m.material = G.mat(Math.random() < 0.45 ? 0x7a1010 : hex);
      const s = 0.1 + Math.random() * 0.2; g.m.scale.set(s, s * (0.6 + Math.random() * 1.6), s);
      g.m.position.set(x + R() * 0.4, y + Math.random() * 0.8, z + R() * 0.4); g.m.visible = true;
      g.vx = (vx || 0) * 0.6 + R() * 9 * power; g.vy = 3 + Math.random() * 6 * power; g.vz = (vz || 0) * 0.6 + R() * 9 * power;
      g.rx = R() * 20; g.rz = R() * 20; g.life = 3.2; g.gy = y - 0.9;
    }
  };

  /* ------------------------------------------------------------------ item + weapon models (shared by loot and the first-person hands) */
  const M = G.models = {};
  M.weapon = function (B, kind) {
    const steel = 0xa8adb3, dsteel = 0x3a3d42, wood = 0x6b4a2c, dwood = 0x3e2a18;
    const j = B.jitter; B.jitter = 0.03;
    if (kind === 'knife') {
      B.box(0, 0, 0.055, 0.026, 0.034, 0.12, dwood); B.box(0, 0, -0.012, 0.012, 0.07, 0.016, 0xb09050);
      B.box(0, 0.004, -0.13, 0.004, 0.04, 0.22, steel); B.box(0, 0.012, -0.255, 0.004, 0.024, 0.04, steel, 0, 0.5);
    } else if (kind === 'shovel') {
      B.cyl(0, 0, -0.15, 0.017, 0.017, 1.15, wood, 7, 0, PI / 2); B.box(0, 0, 0.46, 0.14, 0.03, 0.03, wood); B.box(-0.06, 0, 0.41, 0.025, 0.03, 0.1, wood); B.box(0.06, 0, 0.41, 0.025, 0.03, 0.1, wood);
      B.box(0, 0, -0.86, 0.2, 0.012, 0.27, dsteel); B.box(0, 0.012, -0.72, 0.06, 0.03, 0.08, dsteel); B.box(0, -0.004, -1.0, 0.16, 0.01, 0.04, steel);
    } else if (kind === 'pitchfork') {
      B.cyl(0, 0, -0.1, 0.017, 0.019, 1.35, wood, 7, 0, PI / 2); B.box(0, 0, -0.8, 0.2, 0.022, 0.03, dsteel);
      for (const x of [-0.09, -0.03, 0.03, 0.09]) { B.cyl(x, 0.01, -0.96, 0.004, 0.008, 0.32, steel, 5, 0, PI / 2 + 0.06); }
    } else if (kind === 'revolver') {
      B.box(0, -0.055, 0.03, 0.03, 0.11, 0.045, dwood, 0, -0.3); B.box(0, 0, -0.03, 0.028, 0.045, 0.11, dsteel);
      B.cyl(0, 0.004, -0.02, 0.026, 0.026, 0.05, 0x55585e, 8, 0, PI / 2); B.cyl(0, 0.012, -0.16, 0.011, 0.011, 0.17, dsteel, 7, 0, PI / 2);
      B.box(0, 0.03, -0.235, 0.005, 0.014, 0.012, dsteel); B.box(0, 0.035, 0.03, 0.01, 0.03, 0.012, dsteel, 0, -0.5); B.box(0, -0.035, -0.02, 0.006, 0.03, 0.05, dsteel);
    } else if (kind === 'shotgun') {
      for (const x of [-0.015, 0.015]) B.cyl(x, 0.01, -0.42, 0.013, 0.014, 0.62, dsteel, 7, 0, PI / 2);
      B.box(0, 0, -0.07, 0.05, 0.055, 0.14, 0x55585e); B.box(0, -0.02, -0.3, 0.045, 0.04, 0.24, wood);
      B.box(0, -0.04, 0.14, 0.04, 0.075, 0.32, wood, 0, -0.16); B.box(0, -0.065, 0.3, 0.042, 0.11, 0.03, dwood, 0, -0.16); B.box(0, -0.04, -0.03, 0.006, 0.03, 0.06, dsteel);
    } else if (kind === 'whip') {
      B.cyl(0, 0, 0.02, 0.013, 0.016, 0.3, 0x2a1c12, 7, 0, PI / 2); B.cyl(0, 0, 0.17, 0.02, 0.02, 0.025, 0x1a120c, 7, 0, PI / 2);
      for (let i = 0; i < 4; i++) B.cyl(0, 0, -0.1 + i * 0.07, 0.0165, 0.0165, 0.012, 0x4a3422, 7, 0, PI / 2);
    }
    B.jitter = j;
  };
  const ITEMS = M.items = {
    apple(B) { B.blob(0, 0, 0, 0.13, 0.12, 0.13, 0xb81e1e, 1, 0xd8402a); B.box(0, 0.13, 0, 0.012, 0.06, 0.012, 0x4a3018); B.box(0.035, 0.15, 0, 0.06, 0.008, 0.035, 0x4a8a2a, 0, 0, 0.4); },
    carrot(B) { B.cyl(0, 0, 0, 0.055, 0.0, 0.3, 0xe8761a, 7); for (let i = 0; i < 3; i++) B.box((i - 1) * 0.03, 0.2, 0, 0.012, 0.14, 0.012, 0x3f8a2a, 0, 0, (i - 1) * 0.3); },
    oats(B) { B.blob(0, 0, 0, 0.17, 0.2, 0.14, 0xb89a68, 2, 0xd0b888); B.cyl(0, 0.17, 0, 0.05, 0.08, 0.06, 0xb89a68, 7); B.cyl(0, 0.14, 0, 0.085, 0.085, 0.02, 0x7a4a2a, 7); B.box(0, 0, 0.13, 0.14, 0.09, 0.01, 0x7a2a1e); },
    sugar(B) { for (const [x, y, z] of [[-0.05, 0, 0], [0.05, 0, 0.02], [0, 0.08, 0.01]]) B.box(x, y, z, 0.08, 0.08, 0.08, 0xf4f4f0, x * 3); },
    hay(B) { B.box(0, 0, 0, 0.34, 0.2, 0.22, 0xd2b25c); B.box(-0.08, 0, 0, 0.02, 0.21, 0.23, 0x8a6a3a); B.box(0.08, 0, 0, 0.02, 0.21, 0.23, 0x8a6a3a); },
    pie(B) { B.cyl(0, 0, 0, 0.17, 0.13, 0.05, 0xa8adb3, 12); B.cyl(0, 0.03, 0, 0.16, 0.16, 0.03, 0x4a2c16, 12); B.cyl(0, 0.05, 0, 0.165, 0.165, 0.012, 0xc89a58, 12); for (let i = 0; i < 4; i++) B.box(0, 0.06, 0, 0.3, 0.008, 0.02, 0xb8864a, i * PI / 4); },
    salve(B) { B.cyl(0, 0, 0, 0.07, 0.07, 0.11, 0x3a7a5a, 9); B.cyl(0, 0.065, 0, 0.074, 0.074, 0.03, 0xc8b060, 9); B.box(0, 0, 0.068, 0.08, 0.05, 0.01, 0xf0ead8); },
    ammo(B) { B.box(0, 0, 0, 0.16, 0.07, 0.1, 0x7a3a1e); for (let i = 0; i < 5; i++) { B.cyl(-0.056 + i * 0.028, 0.055, 0, 0.011, 0.011, 0.05, 0xc8a040, 6); B.cyl(-0.056 + i * 0.028, 0.09, 0, 0.004, 0.011, 0.02, 0x8a6a5a, 6); } },
    shells(B) { B.box(0, 0, 0, 0.16, 0.08, 0.11, 0x2a4a2a); for (let i = 0; i < 4; i++) { B.cyl(-0.05 + i * 0.034, 0.07, 0, 0.015, 0.015, 0.07, 0xb82a22, 7); B.cyl(-0.05 + i * 0.034, 0.045, 0, 0.016, 0.016, 0.02, 0xc8a040, 7); } },
    armor(B) { B.box(0, 0, 0, 0.36, 0.3, 0.025, 0x6a6e74, 0, 0, 0.1); for (const [x, y] of [[-0.14, 0.11], [0.14, 0.11], [-0.14, -0.11], [0.14, -0.11]]) B.cyl(x, y, 0.016, 0.018, 0.018, 0.012, 0xb0b4ba, 6, 0, PI / 2); B.box(0.03, -0.02, 0.014, 0.2, 0.03, 0.006, 0x8a4a2a, 0, 0, 0.5); },
    blades(B) { B.box(0, 0, 0, 0.42, 0.06, 0.012, 0xc4c8ce, 0, 0, 0.25); B.box(0.2, 0.07, 0, 0.14, 0.04, 0.012, 0xc4c8ce, 0, 0, 0.8); B.box(-0.22, -0.06, 0, 0.1, 0.03, 0.03, 0x5a3c22, 0, 0, 0.25); },
    speed(B) { for (let i = 0; i < 9; i++) { const a = -0.4 + i / 8 * (PI + 0.8); B.box(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0, 0.035, 0.1, 0.025, 0xd8b040, 0, 0, a); } },
    knife(B) { B.setBase(0, 0, 0, PI / 2); M.weapon(B, 'knife'); },
    shovel(B) { B.setBase(0, 0, 0, PI / 2); M.weapon(B, 'shovel'); },
    pitchfork(B) { B.setBase(0, 0, 0, PI / 2); M.weapon(B, 'pitchfork'); },
    revolver(B) { B.setBase(0, 0, 0, PI / 2); M.weapon(B, 'revolver'); },
    shotgun(B) { B.setBase(0.2, 0, 0, PI / 2); M.weapon(B, 'shotgun'); }
  };
  const itemGeo = {}, ITEM_SCALE = { knife: 2.2, revolver: 2.4, shotgun: 1.4, shovel: 0.9, pitchfork: 0.8 };
  function buildItemGeos() { for (const k in ITEMS) { const B = new Batcher(); B.jitter = 0.04; ITEMS[k](B); itemGeo[k] = B.geometry(); } }
  M.itemMesh = function (kind) { const m = new THREE.Mesh(itemGeo[kind], G.matBatch); m.scale.setScalar(ITEM_SCALE[kind] || 1); return m; };

  const GLOW = { armor: 0x88aaff, blades: 0xff6644, speed: 0xffd040, revolver: 0xffffff, shotgun: 0xffffff };
  FX.loot = function (kind, x, y, z) {
    const mesh = new THREE.Group(), body = M.itemMesh(kind);
    body.scale.multiplyScalar(2.1); mesh.add(body);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex(), color: GLOW[kind] || 0xfff0b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false }));
    sp.scale.setScalar(1.3); mesh.add(sp);
    mesh.position.set(x, y, z); scene.add(mesh);
    loot.push({ kind, mesh, vx: R() * 3, vy: 5.5 + Math.random() * 2, vz: R() * 3, t: 0, sp });
  };

  /* ------------------------------------------------------------------ per-frame */
  const _t = new THREE.Vector3();
  FX.update = function (dt, target, night) {
    nrm.update(dt); add.update(dt);
    for (const g of gibs) {
      if (g.life <= 0) continue;
      g.life -= dt; const p = g.m.position;
      if (g.life <= 0) { g.m.visible = false; continue; }
      g.vy -= 20 * dt; p.x += g.vx * dt; p.y += g.vy * dt; p.z += g.vz * dt;
      g.m.rotation.x += g.rx * dt; g.m.rotation.z += g.rz * dt;
      if (p.y < g.gy + 0.08) { p.y = g.gy + 0.08; if (Math.abs(g.vy) > 2) { g.vy *= -0.3; FX.decalSmall(p.x, g.gy, p.z); } else g.vy = 0; g.vx *= 0.5; g.vz *= 0.5; g.rx *= 0.4; g.rz *= 0.4; }
      if (g.life < 0.4) g.m.scale.multiplyScalar(0.9);
    }
    // loot: pop, hang, then fly to the driver's hand
    for (let i = loot.length - 1; i >= 0; i--) {
      const l = loot[i], p = l.mesh.position; l.t += dt;
      l.mesh.children[0].rotation.y += dt * 5; l.mesh.children[0].rotation.x = 0.4;
      if (l.t < 0.45) { l.vy -= 14 * dt; p.x += l.vx * dt; p.y += l.vy * dt; p.z += l.vz * dt; }
      else {
        _t.copy(target).sub(p); const d = _t.length(), sp = 14 + (l.t - 0.45) * 60;
        if (d < 0.7 || l.t > 4) { scene.remove(l.mesh); l.sp.material.dispose(); loot.splice(i, 1); G.game.collect(l.kind); continue; }
        p.addScaledVector(_t, Math.min(1, sp * dt / d));
        l.mesh.scale.setScalar(clamp(d / 3, 0.35, 1));
      }
    }
  };
  let dsCount = 0;
  FX.decalSmall = function (x, y, z) { if ((dsCount++ & 3) === 0) FX.decal(x, y, z, 0.25 + Math.random() * 0.3); };

  /* fires, glows and police lights near the player */
  const nearFires = [];
  FX.ambient = function (dt, s, time, cam) {
    const night = G.env.cur.night;
    nearFires.length = 0;
    G.world.each('fires', s, 150, f => { const dz = -f.z - s; f._d = Math.abs(dz); if (dz > -90 && dz < 150) nearFires.push(f); });
    nearFires.sort((a, b) => a._d - b._d);
    for (let i = 0; i < nearFires.length; i++) {
      const f = nearFires[i], sz = f.size, rate = (f._d < 70 ? 34 : 14) * sz;
      let n = rate * dt; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const h = Math.random();
        add.emit(f.x + R() * 0.9 * sz, f.y + Math.random() * 0.3, f.z + R() * 0.9 * sz, R() * 0.6, 1.6 + Math.random() * 2.4 * sz, R() * 0.6, 0.5 + Math.random() * 0.6, 1.0 * sz, 0.15, 1.0, 0.36 + h * 0.4, 0.06 + h * 0.1, 0.5, -1.2, 0.3);
      }
      if (Math.random() < dt * 9 * sz) { const c = 0.05 + Math.random() * 0.07; nrm.emit(f.x + R() * 0.6, f.y + 1.2 * sz, f.z + R() * 0.6, 0.8 + R() * 0.6, 2.2 + Math.random() * 1.5, R() * 0.6, 3.5 + Math.random() * 2.5, 0.9 * sz, 5.5 * sz, c, c, c, 0.5, -0.25, 0.12); }
      if (Math.random() < dt * 5) add.emit(f.x + R() * 0.8, f.y + 0.6, f.z + R() * 0.8, R() * 2.5, 2.5 + Math.random() * 3, R() * 2.5, 1 + Math.random(), 0.08, 0.02, 1.0, 0.6, 0.2, 1, -0.6, 0.4);
    }
    for (let i = 0; i < glowSprites.length; i++) {
      const sp = glowSprites[i], f = nearFires[i];
      if (!f) { sp.visible = false; continue; }
      sp.visible = true; sp.position.set(f.x, f.y + 0.7, f.z);
      const fl = 0.85 + 0.15 * Math.sin(time * 17 + i * 3) + 0.08 * Math.sin(time * 41 + i);
      sp.scale.setScalar((4 + 6 * night) * f.size * fl); sp.material.opacity = (0.3 + 0.5 * night) * fl;
    }
    const f0 = nearFires[0];
    if (f0 && f0._d < 60) { fireLight.position.set(f0.x, f0.y + 1.4, f0.z); fireLight.intensity = (0.5 + 2.6 * night) * (0.8 + 0.2 * Math.sin(time * 19) + 0.12 * Math.sin(time * 47)) * f0.size; fireLight.distance = 26 * f0.size; }
    else fireLight.intensity = 0;
    let bi = 0;
    G.world.each('blinkers', s, 140, b => {
      if (bi >= blinkSprites.length) return;
      const on = ((time * 2.4 + b.phase) % 1) < 0.5 && ((time * 14) % 1 < 0.7);
      const sp = blinkSprites[bi++]; sp.visible = on; sp.position.set(b.x, b.y, b.z); sp.material.color.setHex(b.color); sp.scale.setScalar(2.2 + 3 * night);
    });
    for (; bi < blinkSprites.length; bi++) blinkSprites[bi].visible = false;
  };
})();
