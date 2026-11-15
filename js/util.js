'use strict';
/* ONE HORSEPOWER — shared helpers: math, seeded noise, geometry batching, canvas textures */
(function () {
  const G = window.G = {};
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  const clamp = G.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = G.lerp = (a, b, t) => a + (b - a) * t;
  G.smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  G.damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  G.TAU = Math.PI * 2;
  G.angDiff = (a, b) => { let d = (b - a) % G.TAU; if (d > Math.PI) d -= G.TAU; if (d < -Math.PI) d += G.TAU; return d; };

  G.rng = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.chance = p => f() < p;
    f.sign = () => f() < 0.5 ? -1 : 1;
    return f;
  };
  G.rand = G.rng(Date.now() & 0xffffff);

  const hash = G.hash = (x, y) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  G.noise2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  /* ---------- colour cache (sRGB hex -> linear rgb) ---------- */
  const _cc = new Map();
  const colorOf = G.colorOf = hex => {
    let c = _cc.get(hex);
    if (!c) { c = new THREE.Color(hex); _cc.set(hex, c); }
    return c;
  };
  G.mixHex = (a, b, t) => {
    const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
    return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
  };

  /* ---------- unit geometry cache (non-indexed arrays) ---------- */
  const _gc = {};
  function arrays(key, make) {
    let g = _gc[key];
    if (!g) {
      let geo = make();
      if (geo.index) geo = geo.toNonIndexed();
      g = { p: geo.attributes.position.array, n: geo.attributes.normal.array, count: geo.attributes.position.count };
      _gc[key] = g;
    }
    return g;
  }
  function blobArrays(variant) {
    return arrays('blob' + variant, () => {
      const geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 0.78 + 0.44 * hash(Math.round(x * 50) + variant * 131, Math.round(y * 50) * 7 + Math.round(z * 50) * 13);
        p.setXYZ(i, x * k, y * k, z * k);
      }
      geo.computeVertexNormals(); // non-indexed => flat facets
      return geo;
    });
  }

  const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _nm = new THREE.Matrix3();
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3(), _sc = new THREE.Vector3();

  /* Accumulates many transformed primitives into ONE vertex-coloured mesh. */
  class Batcher {
    constructor(rnd) {
      this.pos = []; this.nor = []; this.col = [];
      this.base = new THREE.Matrix4();
      this.jitter = 0.07;
      this.rnd = rnd || Math.random;
    }
    setBase(x, y, z, ry) {
      _e.set(0, ry || 0, 0); _q.setFromEuler(_e);
      this.base.compose(_v.set(x, y, z), _q, _sc.set(1, 1, 1));
      return this;
    }
    setBaseM(m) { this.base.copy(m); return this; }
    _add(g, hex, hex2) {
      _m.multiplyMatrices(this.base, _l);
      _nm.getNormalMatrix(_m);
      const e = _m.elements, ne = _nm.elements;
      const c = colorOf(hex), c2 = hex2 !== undefined ? colorOf(hex2) : null;
      const j = 1 + (this.rnd() - 0.5) * 2 * this.jitter;
      const P = this.pos, N = this.nor, C = this.col, gp = g.p, gn = g.n;
      for (let i = 0, n = g.count * 3; i < n; i += 3) {
        const x = gp[i], y = gp[i + 1], z = gp[i + 2];
        P.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        const nx = gn[i], ny = gn[i + 1], nz = gn[i + 2];
        let ax = ne[0] * nx + ne[3] * ny + ne[6] * nz, ay = ne[1] * nx + ne[4] * ny + ne[7] * nz, az = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        const il = 1 / (Math.sqrt(ax * ax + ay * ay + az * az) || 1);
        N.push(ax * il, ay * il, az * il);
        if (c2) { const t = clamp(y + 0.5, 0, 1); C.push((c.r + (c2.r - c.r) * t) * j, (c.g + (c2.g - c.g) * t) * j, (c.b + (c2.b - c.b) * t) * j); }
        else C.push(c.r * j, c.g * j, c.b * j);
      }
    }
    _local(x, y, z, sx, sy, sz, ry, rx, rz) {
      _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
      _l.compose(_v.set(x, y, z), _q, _sc.set(sx, sy, sz));
    }
    /* centre-based box */
    box(x, y, z, w, h, d, hex, ry, rx, rz, hex2) {
      this._local(x, y, z, w, h, d, ry, rx, rz);
      this._add(arrays('box', () => new THREE.BoxGeometry(1, 1, 1)), hex, hex2);
      return this;
    }
    /* box sitting on y */
    boxb(x, y, z, w, h, d, hex, ry, rx, rz, hex2) { return this.box(x, y + h / 2, z, w, h, d, hex, ry, rx, rz, hex2); }
    cyl(x, y, z, rTop, rBot, h, hex, sides, ry, rx, rz, hex2) {
      sides = sides || 8;
      let g, r;
      if (rBot < 1e-4) { g = arrays('ci' + sides, () => new THREE.CylinderGeometry(1, 0, 1, sides)); r = rTop; }
      else {
        const ratio = Math.round(rTop / rBot * 20) / 20;
        g = arrays('c' + sides + '_' + ratio, () => new THREE.CylinderGeometry(ratio, 1, 1, sides)); r = rBot;
      }
      this._local(x, y, z, r, h, r, ry, rx, rz);
      this._add(g, hex, hex2);
      return this;
    }
    cylb(x, y, z, rTop, rBot, h, hex, sides, hex2) { return this.cyl(x, y + h / 2, z, rTop, rBot, h, hex, sides, 0, 0, 0, hex2); }
    sph(x, y, z, rx_, ry_, rz_, hex, hex2) {
      this._local(x, y, z, rx_, ry_, rz_, 0, 0, 0);
      this._add(arrays('sph', () => new THREE.IcosahedronGeometry(1, 2)), hex, hex2);
      return this;
    }
    /* cheaper smooth sphere (80 tris) for small rounded forms */
    sphl(x, y, z, rx_, ry_, rz_, hex, hex2) {
      this._local(x, y, z, rx_, ry_, rz_, 0, 0, 0);
      this._add(arrays('sphl', () => new THREE.IcosahedronGeometry(1, 1)), hex, hex2);
      return this;
    }
    /* tapered cylinder with an elliptical section (rx_/rz_ are the bottom radii, `top` the top:bottom ratio).
       arc 'front' gives an open half-shell facing -z, for aprons and bibs */
    ecyl(x, y, z, rx_, rz_, top, h, hex, sides, hex2, arc, ry, rx, rz) {
      sides = sides || 10;
      const ratio = Math.round(top * 20) / 20;
      const g = arrays('e' + sides + '_' + ratio + (arc || ''), () => arc === 'front'
        ? new THREE.CylinderGeometry(ratio, 1, 1, sides, 1, true, Math.PI / 2, Math.PI)
        : new THREE.CylinderGeometry(ratio, 1, 1, sides));
      this._local(x, y, z, rx_, h, rz_, ry, rx, rz);
      this._add(g, hex, hex2);
      return this;
    }
    /* faceted, lumpy blob (foliage, rocks, smoke-stained junk) */
    blob(x, y, z, rx_, ry_, rz_, hex, rot, hex2) {
      this._local(x, y, z, rx_, ry_, rz_, rot || 0, (rot || 0) * 0.7, 0);
      this._add(blobArrays(Math.floor(this.rnd() * 4)), hex, hex2);
      return this;
    }
    /* box stretched between two points (rails, wires, beams) */
    beam(x1, y1, z1, x2, y2, z2, w, h, hex) {
      const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const ry = Math.atan2(dx, dz), rx = -Math.asin(dy / (len || 1));
      return this.box((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, w, h, len, hex, ry, rx, 0);
    }
    get empty() { return this.pos.length === 0; }
    geometry() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
      geo.computeBoundingSphere();
      return geo;
    }
    mesh(material) { return new THREE.Mesh(this.geometry(), material); }
  }
  G.Batcher = Batcher;

  /* ---------- canvas textures ---------- */
  G.canvasTex = function (w, h, draw, opt) {
    opt = opt || {};
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    if (opt.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = opt.aniso || 8;
    return t;
  };
  G.glowTex = function (inner, outer) {
    return G.canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, inner || 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, outer || 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }, { repeat: false });
  };

  /* shared vertex-colour materials */
  G.matBatch = new THREE.MeshLambertMaterial({ vertexColors: true });
  G.matBatchDS = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const _mats = new Map();
  G.mat = function (hex, kind) {
    const key = hex + (kind || '');
    let m = _mats.get(key);
    if (!m) {
      if (kind === 'phong') m = new THREE.MeshPhongMaterial({ color: hex, shininess: 38, specular: 0x333333 });
      else if (kind === 'basic') m = new THREE.MeshBasicMaterial({ color: hex });
      else if (kind === 'vc') m = new THREE.MeshLambertMaterial({ color: hex, vertexColors: true });
      else m = new THREE.MeshLambertMaterial({ color: hex });
      _mats.set(key, m);
    }
    return m;
  };

  /* place a unit-length (along +Y, centred) mesh between two points */
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  G.between = function (mesh, ax, ay, az, bx, by, bz, thick) {
    _a.set(ax, ay, az); _b.set(bx, by, bz);
    mesh.position.copy(_a).add(_b).multiplyScalar(0.5);
    _b.sub(_a); const len = _b.length();
    mesh.scale.set(thick, len, thick);
    mesh.quaternion.setFromUnitVectors(_up, _b.multiplyScalar(1 / (len || 1)));
  };

  G.fmtTime = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; };
})();
