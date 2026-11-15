'use strict';
/* The English, lately unwell: models, animation, AI, grabbing, the pursuing horde, spawn director. */
(function () {
  const { clamp, lerp, smooth, Batcher } = G;
  const Z = G.zombies = { list: [], kills: 0 };
  const PI = Math.PI, road = () => G.road;

  const TYPES = Z.TYPES = {
    shambler: { hp: 70, speed: [1.0, 1.9], scale: 1, trample: 4.5, tCost: 2.5, slow: 0.9, grab: 0.55, dmg: 4, atk: 1.0, horse: 5, loot: 0.5, r: 0.38, turn: 2.6, eye: 0xe8e4c4, pitch: 1 },
    runner: { hp: 55, speed: [7.6, 10.2], scale: 0.96, trample: 4.5, tCost: 2.5, slow: 0.92, grab: 0.85, dmg: 5, atk: 0.8, horse: 6, loot: 0.55, r: 0.36, turn: 5.5, eye: 0xff3a20, pitch: 1.5 },
    crawler: { hp: 45, speed: [0.8, 1.4], scale: 1, trample: 0, tCost: 6, slow: 0.84, grab: 0, dmg: 3, atk: 1.2, horse: 4, loot: 0.4, r: 0.42, turn: 2.2, eye: 0xe8e4c4, pitch: 0.8 },
    bloater: { hp: 150, speed: [0.9, 1.4], scale: 1.12, trample: 6.4, tCost: 5, slow: 0.78, grab: 0.15, dmg: 6, atk: 1.2, horse: 8, loot: 0.65, r: 0.62, turn: 2.0, eye: 0xa0ff40, pitch: 0.6 },
    brute: { hp: 520, speed: [2.3, 3.0], charge: 8.6, scale: 1.55, trample: 12.6, tCost: 12, slow: 0.5, grab: 0, dmg: 16, atk: 1.4, horse: 18, loot: 1, r: 0.8, turn: 2.2, eye: 0xff2010, pitch: 0.5 },
    jugg: { hp: 1300, speed: [1.9, 2.3], charge: 6.2, scale: 2.2, trample: 99, tCost: 20, slow: 0.2, grab: 0, dmg: 24, atk: 1.5, horse: 30, loot: 1, r: 1.15, turn: 1.6, eye: 0xff2010, pitch: 0.36 }
  };
  const SKINS = [0x7d8f6a, 0x9aa38c, 0x6f8088, 0x5f6b4a, 0x8a8f78];
  const HAIR = [0x1a1410, 0x4a3420, 0x8a7a5a, 0x9a9a98, 0x6a2a14];
  const OUT = {
    tourist: { shirt: [0xe2574c, 0x3aa0c8, 0xe8c23a, 0x7ac86a, 0xe07ab0], pants: [0xb8a888, 0x8a8a6a], shorts: 1, hat: 'cap', hatCol: [0xf0f0f0, 0xc81e1e, 0x23406e], extra: 'camera', drop: ['apple', 'sugar', 'pie', 'carrot'] },
    farmer: { shirt: [0xa83232, 0x3a6a4a, 0x8a6a3a], pants: [0x34507a], bib: 0x34507a, hat: 'brim', hatCol: [0xd8c078], prop: 'pitchfork', drop: ['pitchfork', 'pitchfork', 'scythe', 'scythe', 'oats', 'carrot'] },
    hunter: { shirt: [0x5a6238, 0x4a5230], pants: [0x4a5a34, 0x5a5238], vest: [0xf06a14, 0xf06a14], hat: 'cap', hatCol: [0xf06a14], drop: ['shells', 'shells', 'shotgun', 'ammo'] },
    cop: { shirt: [0x1c2a4a], pants: [0x161c30], hat: 'cap', hatCol: [0x161c30], extra: 'badge', drop: ['ammo', 'ammo', 'revolver', 'revolver'] },
    worker: { shirt: [0x6a7078, 0x34507a, 0x7a5a3a], pants: [0x34507a, 0x5a5248], vest: [0xc8e020, 0xc8ccd0], hat: 'helmet', hatCol: [0xf0f0f0, 0xe8c020], prop: 'shovel', drop: ['shovel', 'shovel', 'pie'] },
    butcher: { shirt: [0xe8e8e2], pants: [0x2a2a30], apron: 0xd8d0c6, bloody: 1, prop: 'knife', drop: ['knife', 'knife', 'pie'] },
    nurse: { shirt: [0x4aa8a0, 0x6a9ad0], samePants: 1, drop: ['salve', 'salve', 'pie'] },
    business: { shirt: [0x4a4e58, 0x2a2e3a], pants: [0x2a2e3a], extra: 'tie', drop: ['sugar', 'ammo', 'apple'] },
    jogger: { shirt: [0x2ad0c0, 0xe040a0, 0xd0e020], pants: [0x15151a], shorts: 1, drop: ['apple', 'carrot', 'sugar'] },
    grocer: { shirt: [0xf0f0f0, 0xc8d8e8], pants: [0x2a2a30, 0x5a5248], apron: 0x2f7a3a, drop: ['apple', 'carrot', 'oats', 'oats'] },
    teen: { shirt: [0x5a2a6a, 0x2a2a30, 0x8a1f1f, 0x3a5a3a], pants: [0x34507a, 0x2a3a5a], drop: null },
    fire: { shirt: [0x8a7a4a], pants: [0x6a5e3a], extra: 'firestripes', hat: 'helmet', hatCol: [0x8a1a1a, 0x15151a], drop: ['armor', 'blades', 'speed', 'shells', 'flamethrower', 'fuel'] }
  };
  const OUTFITS_FOR = {
    shambler: ['tourist', 'tourist', 'farmer', 'hunter', 'cop', 'worker', 'butcher', 'nurse', 'business', 'business', 'jogger', 'grocer', 'teen', 'teen'],
    runner: ['jogger', 'jogger', 'teen', 'teen', 'tourist', 'cop', 'nurse'],
    crawler: ['tourist', 'business', 'teen', 'nurse', 'grocer'],
    bloater: ['tourist', 'grocer', 'business', 'butcher'],
    brute: ['farmer', 'worker', 'butcher', 'hunter'],
    jugg: ['fire']
  };

  /* ------------------------------------------------------------------ shared geometry
     Every body part is a small sculpt of rounded primitives with its colours baked in, cached per
     colour/variant, so the whole crowd shares one material. */
  const GEO = {};
  function geo(name, build) { if (!GEO[name]) { const B = new Batcher(); B.jitter = 0; build(B); GEO[name] = B.geometry(); } return GEO[name]; }
  const BONE = 0xd9d0b4, BLOOD = 0x6a0d0d, GORE = 0x3a0707, PIT = 0x0c090b;
  const SHOES = [0x2a2420, 0x15151a, 0xd8d8d2, 0x5a3e24, 0x3a3a40, 'bare'];
  const dk = (c, k) => G.mixHex(c, 0x000000, k), lt = (c, k) => G.mixHex(c, 0xffffff, k);

  function headGeo(skin, v) {
    return geo('head' + v + '_' + skin, B => {
      const sk2 = dk(skin, 0.28);
      B.cyl(0, 0.0, 0.012, 0.047, 0.057, 0.15, sk2, 8);                               // neck
      B.cyl(-0.03, 0.0, -0.02, 0.012, 0.014, 0.13, dk(skin, 0.4), 5, 0, 0.12, 0.2);    // neck tendons
      B.cyl(0.03, 0.0, -0.02, 0.012, 0.014, 0.13, dk(skin, 0.4), 5, 0, 0.12, -0.2);
      B.sph(0, 0.15, 0.005, 0.1, 0.118, 0.115, sk2, skin);                             // skull
      B.sphl(0, 0.088, -0.03, 0.08, 0.066, 0.084, dk(skin, 0.1));                      // muzzle / cheeks
      for (const s of [-1, 1]) {
        B.sphl(s * 0.056, 0.116, -0.07, 0.034, 0.028, 0.034, lt(skin, 0.07));          // cheekbone
        B.sphl(s * 0.043, 0.158, -0.086, 0.031, 0.027, 0.024, PIT);                    // sunken socket
        B.sphl(s * 0.043, 0.136, -0.094, 0.026, 0.012, 0.014, dk(skin, 0.45));         // bag under the eye
        B.box(s * 0.101, 0.14, 0.004, 0.02, 0.06, 0.036, sk2, 0, 0, s * 0.18);         // ear
      }
      B.sphl(0, 0.186, -0.084, 0.082, 0.02, 0.034, sk2);                              // brow ridge
      if (v !== 1) { B.sphl(0, 0.132, -0.108, 0.014, 0.034, 0.02, lt(skin, 0.05)); B.sphl(0, 0.106, -0.118, 0.021, 0.015, 0.017, dk(skin, 0.12)); }
      else B.sphl(0, 0.118, -0.103, 0.02, 0.028, 0.014, PIT);                          // nose rotted away
      B.box(0, 0.066, -0.097, 0.084, 0.022, 0.03, PIT);                                // mouth
      for (let i = 0; i < 6; i++) B.box(-0.03 + i * 0.012, 0.077, -0.107, 0.0095, 0.018 + (i % 2) * 0.004, 0.01, BONE);   // upper teeth
      B.sphl(0.018, 0.094, -0.106, 0.034, 0.02, 0.012, BLOOD);                         // smeared mouth
      if (v === 1) { B.sphl(0.066, 0.086, -0.06, 0.03, 0.036, 0.022, GORE); for (let i = 0; i < 3; i++) B.box(0.066, 0.07 + i * 0.014, -0.078, 0.01, 0.01, 0.022, BONE); }   // cheek torn to the teeth
      if (v === 2) { B.sphl(-0.05, 0.222, -0.04, 0.06, 0.042, 0.06, BONE); B.sphl(-0.028, 0.2, -0.078, 0.036, 0.032, 0.02, GORE); B.box(-0.05, 0.14, -0.1, 0.012, 0.09, 0.008, BLOOD); }   // scalped
    });
  }
  function jawGeo(skin) {   // origin is the hinge, so it can hang open
    return geo('jaw_' + skin, B => {
      B.sphl(0, -0.046, -0.058, 0.07, 0.034, 0.076, dk(skin, 0.14));
      B.box(0, -0.022, -0.105, 0.066, 0.012, 0.03, PIT);
      for (let i = 0; i < 5; i++) B.box(-0.024 + i * 0.012, -0.016, -0.126, 0.009, 0.016 + (i % 2) * 0.004, 0.009, BONE);
      B.sphl(0, -0.056, -0.118, 0.032, 0.022, 0.016, BLOOD);
    });
  }
  const eyesGeo = () => geo('eyes', B => { B.sphl(-0.043, 0.158, -0.1, 0.0115, 0.0115, 0.011, 0xffffff); B.sphl(0.043, 0.158, -0.1, 0.0115, 0.0115, 0.011, 0xffffff); });
  function hairGeo(v, c) {
    return geo('hair' + v + '_' + c, B => {
      const c2 = dk(c, 0.3);
      if (v === 2) { B.sphl(0, 0.152, 0.036, 0.108, 0.07, 0.1, c2, c); return; }       // balding: just the sides
      B.sph(0, 0.2, 0.03, 0.107, 0.086, 0.106, c2, c);
      if (v === 1) for (let i = 0; i < 9; i++) { const a = -2.2 + i * 0.55, l = 0.14 + ((i * 7) % 5) * 0.03; B.box(Math.sin(a) * 0.1, 0.16 - l / 2, 0.03 + Math.cos(a) * 0.098, 0.035, l, 0.012, c2, a); }   // lank strands
    });
  }
  function hatGeo(kind, c) {
    return geo('hat_' + kind + '_' + c, B => {
      if (kind === 'cap') { B.sphl(0, 0.212, 0.012, 0.109, 0.075, 0.118, dk(c, 0.2), c); B.box(0, 0.2, -0.145, 0.13, 0.012, 0.1, dk(c, 0.15), 0, 0.12); B.sphl(0, 0.285, 0.012, 0.012, 0.008, 0.012, dk(c, 0.3)); }
      else if (kind === 'brim') { B.cyl(0, 0.225, 0.01, 0.21, 0.2, 0.014, dk(c, 0.12), 14); B.cyl(0, 0.275, 0.01, 0.1, 0.108, 0.09, c, 12); B.cyl(0, 0.245, 0.01, 0.112, 0.112, 0.03, 0x1c1a18, 12); for (let i = 0; i < 5; i++) B.box(0.16 + i * 0.008, 0.226, -0.1 + i * 0.03, 0.05, 0.016, 0.01, dk(c, 0.3), i); }
      else { B.sph(0, 0.205, 0.005, 0.124, 0.098, 0.134, dk(c, 0.2), c); B.cyl(0, 0.176, 0.0, 0.152, 0.152, 0.014, dk(c, 0.1), 14); B.box(0, 0.292, 0.005, 0.03, 0.03, 0.2, lt(c, 0.1)); B.box(0, 0.178, 0.17, 0.2, 0.012, 0.09, dk(c, 0.1), 0, -0.2); }
    });
  }
  function torsoGeo(shirt, v) {
    return geo('torso' + v + '_' + shirt, B => {
      const s2 = dk(shirt, 0.34), s1 = dk(shirt, 0.14);
      B.ecyl(0, 0.19, 0, 0.176, 0.12, 1.15, 0.46, s2, 12, shirt);                     // waist to chest
      B.sphl(0, 0.44, 0.0, 0.215, 0.11, 0.126, shirt);                                 // yoke
      B.sphl(0, 0.36, -0.052, 0.166, 0.11, 0.086, shirt);                              // chest
      B.sphl(0, 0.4, 0.062, 0.172, 0.14, 0.092, s1);                                   // hunched back
      for (const s of [-1, 1]) B.sphl(s * 0.236, 0.5, 0, 0.072, 0.066, 0.072, shirt);  // shoulders
      B.cyl(0, 0.556, 0.006, 0.058, 0.078, 0.05, s2, 8);                               // collar
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283, l = 0.035 + ((i * 13 + v * 5) % 7) * 0.012; B.box(Math.sin(a) * 0.166, -0.04 - l / 2, Math.cos(a) * 0.112, 0.07, l, 0.012, s2, a); }   // ragged hem
      B.box(0, 0.2, -0.128, 0.014, 0.4, 0.01, s2, 0, -0.06);                           // placket
      B.sphl(0.04, 0.33, -0.126, 0.07, 0.085, 0.022, BLOOD);                           // old blood down the front
      B.sphl(-0.03, 0.14, -0.12, 0.05, 0.1, 0.016, dk(BLOOD, 0.2));
      if (v === 1) { B.sphl(-0.075, 0.2, -0.104, 0.062, 0.078, 0.03, GORE); for (let i = 0; i < 4; i++) B.box(-0.075, 0.155 + i * 0.03, -0.127, 0.1, 0.011, 0.012, BONE, 0, 0, 0.16); }   // ribs showing
      if (v === 2) { B.sphl(0.165, 0.5, -0.04, 0.062, 0.05, 0.052, GORE); B.sphl(0.15, 0.49, -0.07, 0.02, 0.02, 0.02, BONE); B.box(0.13, 0.36, -0.132, 0.03, 0.24, 0.01, BLOOD, 0, -0.1); }   // shoulder bitten out
    });
  }
  function bibGeo(c) {      // overalls
    return geo('bib_' + c, B => {
      B.ecyl(0, 0.16, 0, 0.182, 0.128, 1.14, 0.4, dk(c, 0.2), 12, c, 'front');
      B.ecyl(0, 0.0, 0, 0.176, 0.12, 1.02, 0.09, c, 12);
      for (const s of [-1, 1]) { B.beam(s * 0.09, 0.36, -0.146, s * 0.12, 0.54, -0.03, 0.036, 0.012, c); B.beam(s * 0.12, 0.54, -0.03, s * 0.09, 0.3, 0.14, 0.036, 0.012, c); B.sphl(s * 0.088, 0.355, -0.15, 0.012, 0.012, 0.008, 0xc8a850); }
      B.box(0, 0.26, -0.15, 0.13, 0.1, 0.012, dk(c, 0.15));
    });
  }
  function apronGeo(c, bloody) {
    return geo('apron_' + c + (bloody ? 'b' : ''), B => {
      B.ecyl(0, 0.02, 0, 0.184, 0.132, 1.1, 0.68, dk(c, 0.22), 12, c, 'front');
      for (const s of [-1, 1]) B.beam(s * 0.1, 0.36, -0.148, s * 0.05, 0.56, 0.02, 0.022, 0.01, dk(c, 0.2));
      B.ecyl(0, 0.08, 0, 0.19, 0.136, 1.0, 0.03, dk(c, 0.3), 12);
      if (bloody) { B.sphl(0.04, 0.16, -0.14, 0.085, 0.1, 0.02, BLOOD); B.sphl(-0.07, -0.1, -0.132, 0.06, 0.08, 0.02, BLOOD); B.sphl(0.06, -0.2, -0.128, 0.04, 0.06, 0.02, GORE); B.box(0.0, 0.0, -0.142, 0.02, 0.26, 0.008, BLOOD); }
    });
  }
  function vestGeo(c, stripe) {
    return geo('vest_' + c + '_' + stripe, B => {
      B.ecyl(0, 0.24, 0, 0.181, 0.126, 1.12, 0.42, dk(c, 0.18), 12, c);
      B.sphl(0, 0.452, 0, 0.2, 0.1, 0.131, c);
      if (stripe !== c) { B.ecyl(0, 0.15, 0, 0.185, 0.13, 1.02, 0.036, stripe, 12); B.ecyl(0, 0.31, 0, 0.196, 0.139, 1.02, 0.036, stripe, 12); }
      B.box(0, 0.26, -0.146, 0.012, 0.4, 0.01, dk(c, 0.4));
    });
  }
  function extraGeo(kind) {
    return geo('x_' + kind, B => {
      if (kind === 'tie') { B.cyl(0, 0.556, 0.006, 0.064, 0.082, 0.04, 0xe2e2dc, 8); B.box(0, 0.4, -0.142, 0.036, 0.26, 0.01, 0x8e1616, 0, -0.1, 0.12); B.box(0, 0.525, -0.1, 0.04, 0.04, 0.02, 0x8e1616); for (const s of [-1, 1]) B.box(s * 0.07, 0.4, -0.128, 0.05, 0.3, 0.012, 0x23262e, 0, -0.08, s * 0.16); }
      else if (kind === 'camera') { B.box(0, 0.27, -0.172, 0.11, 0.075, 0.05, 0x1a1a1a); B.cyl(0, 0.27, -0.21, 0.03, 0.03, 0.04, 0x30302e, 8, 0, Math.PI / 2); for (const s of [-1, 1]) B.beam(s * 0.05, 0.3, -0.16, s * 0.06, 0.55, -0.02, 0.014, 0.006, 0x1a1a1a); }
      else if (kind === 'badge') { B.sphl(-0.09, 0.41, -0.136, 0.02, 0.024, 0.008, 0xe8c020); B.ecyl(0, -0.02, 0, 0.173, 0.117, 1.0, 0.045, 0x121216, 12); B.box(0.17, -0.09, 0.0, 0.04, 0.14, 0.09, 0x121216); B.box(0, -0.02, -0.12, 0.04, 0.035, 0.012, 0xc8ccd0); B.box(0.1, 0.44, -0.13, 0.05, 0.02, 0.008, 0x121216); }
      else if (kind === 'firestripes') { for (const y of [0.1, 0.34]) { B.ecyl(0, y, 0, 0.176 + y * 0.06, 0.12 + y * 0.05, 1.02, 0.05, 0xd8e020, 12); B.ecyl(0, y, 0, 0.178 + y * 0.06, 0.122 + y * 0.05, 1.02, 0.016, 0xc8ccd0, 12); } for (const s of [-1, 1]) B.sphl(s * 0.24, 0.53, 0, 0.09, 0.05, 0.09, 0x2a2c30); B.cyl(0, 0.57, 0.006, 0.07, 0.09, 0.07, 0x3a3428, 8); }
    });
  }
  function bellyGeo(skin) {
    return geo('belly_' + skin, B => {
      const sick = G.mixHex(skin, 0xb4b458, 0.5);
      B.sph(0, 0.2, -0.07, 0.34, 0.31, 0.31, dk(sick, 0.25), lt(sick, 0.1));
      B.sphl(0, 0.05, -0.05, 0.3, 0.2, 0.28, dk(sick, 0.2));
      for (let i = 0; i < 9; i++) { const a = i * 1.7; B.sphl(Math.cos(a) * 0.25, 0.2 + Math.sin(a * 1.3) * 0.2, -0.25 - Math.sin(a) * 0.09, 0.045 + (i % 3) * 0.012, 0.045, 0.04, 0xd4cc5a); }
      B.sphl(0.08, 0.24, -0.36, 0.09, 0.12, 0.03, GORE); B.box(0.08, 0.1, -0.375, 0.02, 0.2, 0.008, BLOOD);
      for (let i = 0; i < 5; i++) B.cyl(-0.1 + i * 0.05, 0.22, -0.378, 0.006, 0.006, 0.16, 0x4a3a5a, 4, 0, 0, 0.3 * (i - 2));   // dark veins
    });
  }
  function upperGeo(shirt) {
    return geo('upper_' + shirt, B => {
      B.sphl(0, -0.01, 0, 0.068, 0.064, 0.068, shirt);
      B.cyl(0, -0.16, 0, 0.062, 0.05, 0.3, dk(shirt, 0.3), 8, 0, 0, 0, shirt);
      for (let i = 0; i < 5; i++) { const a = i * 1.257; B.box(Math.sin(a) * 0.05, -0.32, Math.cos(a) * 0.05, 0.045, 0.03 + (i % 2) * 0.02, 0.008, dk(shirt, 0.35), a); }
    });
  }
  function foreGeo(skin, sleeve, stump) {
    return geo('fore_' + skin + '_' + (sleeve === null ? 'n' : sleeve) + (stump ? 's' : ''), B => {
      const c = sleeve === null ? skin : sleeve;
      B.sphl(0, 0, 0, 0.052, 0.052, 0.052, c);                                         // elbow
      if (stump) { B.cyl(0, -0.07, 0, 0.043, 0.032, 0.13, c, 8); B.sphl(0, -0.14, 0, 0.034, 0.022, 0.034, GORE); B.cyl(0, -0.185, 0, 0.012, 0.01, 0.1, BONE, 6); B.cyl(0.012, -0.17, 0.006, 0.008, 0.006, 0.07, BONE, 5); return; }
      B.cyl(0, -0.15, 0, 0.05, 0.037, 0.28, dk(c, 0.25), 8, 0, 0, 0, c);
      if (sleeve === null) B.sphl(0.02, -0.16, -0.03, 0.02, 0.05, 0.012, GORE);          // bite on the forearm
      B.box(0, -0.335, 0, 0.076, 0.09, 0.03, dk(skin, 0.1));                         // palm
      for (let i = 0; i < 4; i++) B.cyl(-0.027 + i * 0.018, -0.408, -0.012, 0.009, 0.006, 0.078, dk(skin, 0.2), 5, 0, 0.3 + (i % 2) * 0.12, 0);   // clawing fingers
      B.cyl(0.044, -0.355, -0.012, 0.01, 0.007, 0.056, skin, 5, 0, 0.25, 0.6);          // thumb
      B.sphl(0, -0.43, -0.026, 0.036, 0.024, 0.016, BLOOD);
    });
  }
  function thighGeo(pants) {
    return geo('thigh_' + pants, B => {
      B.sphl(0, -0.02, 0, 0.098, 0.096, 0.104, pants);
      B.ecyl(0, -0.22, 0, 0.066, 0.07, 1.42, 0.4, dk(pants, 0.3), 10, pants);
      B.sphl(0, -0.42, -0.004, 0.066, 0.062, 0.068, dk(pants, 0.12));                   // knee
    });
  }
  function shinGeo(c, shoe, skin, cuffs) {
    return geo('shin_' + c + '_' + shoe + '_' + skin + (cuffs ? 'c' : ''), B => {
      B.cyl(0, -0.2, 0, 0.064, 0.046, 0.38, dk(c, 0.34), 8, 0, 0, 0, c);
      if (cuffs) for (let i = 0; i < 6; i++) { const a = i * 1.047; B.box(Math.sin(a) * 0.046, -0.39, Math.cos(a) * 0.046, 0.04, 0.03 + (i % 3) * 0.015, 0.008, dk(c, 0.4), a); }
      else B.sphl(0.01, -0.22, -0.045, 0.02, 0.06, 0.012, GORE);
      if (shoe === 'bare') { B.sphl(0, -0.445, -0.04, 0.042, 0.03, 0.095, dk(skin, 0.2)); for (let i = 0; i < 4; i++) B.sphl(-0.027 + i * 0.018, -0.455, -0.13, 0.009, 0.01, 0.014, dk(skin, 0.3)); }
      else { B.box(0, -0.466, -0.045, 0.086, 0.024, 0.235, dk(shoe, 0.55)); B.sphl(0, -0.432, -0.05, 0.046, 0.04, 0.116, shoe); B.cyl(0, -0.4, 0.01, 0.045, 0.046, 0.05, shoe, 8); }
    });
  }
  function initGeo() {
    for (const k of ['pitchfork', 'shovel', 'knife']) geo('prop_' + k, B => { B.setBase(0, -0.36, -0.02, 0); const j = new THREE.Matrix4().makeRotationX(k === 'knife' ? 0 : -1.2); B.base.multiply(j); G.models.weapon(B, k); });
    // one merged silhouette for the far-off horde
    geo('horde', B => {
      B.ecyl(0, 1.12, 0, 0.17, 0.11, 1.2, 0.56, 0xffffff, 8); B.sphl(0, 1.58, -0.03, 0.1, 0.12, 0.11, 0xa8b090);
      for (const s of [-1, 1]) { B.cyl(s * 0.25, 1.32, -0.2, 0.045, 0.04, 0.56, 0xa8b090, 6, 0, 1.4 + s * 0.1, 0); B.cyl(s * 0.1, 0.43, s * 0.05, 0.08, 0.05, 0.86, 0x5a5a66, 6, 0, s * 0.25, 0); }
    });
    matZ = zombieMaterial();
    barBg = new THREE.SpriteMaterial({ color: 0x0a0606, opacity: 0.8, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    barMats = [0x76d64c, 0xe9b930, 0xe2362a].map(c => new THREE.SpriteMaterial({ color: c, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  }
  /* one lit material for every zombie; a little procedural mottling and grime so flat colours read as skin and cloth */
  let matZ, barBg, barMats;
  function zombieMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vZp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvZp = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vZp;
        float zh(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
        float zn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(zh(i),zh(i+vec3(1.,0.,0.)),f.x), mix(zh(i+vec3(0.,1.,0.)),zh(i+vec3(1.,1.,0.)),f.x), f.y),
                     mix(mix(zh(i+vec3(0.,0.,1.)),zh(i+vec3(1.,0.,1.)),f.x), mix(zh(i+vec3(0.,1.,1.)),zh(i+vec3(1.,1.,1.)),f.x), f.y), f.z); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        float zg = zn(vZp*46.0)*0.5 + zn(vZp*13.0)*0.5;
        diffuseColor.rgb *= 0.6 + 0.74*zg;
        float zb = smoothstep(0.6, 0.82, zn(vZp*7.0+3.7));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.5,0.3,0.28), zb*0.65);`);
    };
    return m;
  }
  const eyeMats = {};
  const eyeMat = hex => eyeMats[hex] || (eyeMats[hex] = new THREE.MeshBasicMaterial({ color: hex }));

  function mk(parent, g, mat, x, y, z) { const m = new THREE.Mesh(typeof g === 'string' ? GEO[g] : g, mat); if (x !== undefined) m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
  function grp(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  /* ------------------------------------------------------------------ sculpted bodies
     Optional rigged GLB models in assets/zombies/. They are posed by the very same procedural rig as the
     built-in figures: animate() turns the rig joints and pose3D() copies those turns onto the skeleton,
     so walking, grabbing, hanging on and falling all work without any baked animation clips. */
  const TPL = {};
  const MODEL_KEYS = ['walker', 'farmer', 'cop', 'worker', 'butcher', 'tourist', 'bloater', 'brute'];
  // which body goes with which outfit (the outfit still decides the loot); the heavy types have bodies of their own
  const MODEL_BY_OUTFIT = { farmer: ['farmer'], cop: ['cop'], worker: ['worker'], butcher: ['butcher'], tourist: ['tourist'], jogger: ['tourist', 'walker'], nurse: ['tourist'], grocer: ['butcher', 'walker'], teen: ['walker'], business: ['walker'], hunter: ['walker', 'farmer'], fire: ['brute'] };
  function pickModel(z) {
    if (Z.noSkins) return null;
    const want = z.type === 'bloater' ? ['bloater'] : (z.type === 'brute' || z.type === 'jugg') ? ['brute'] : MODEL_BY_OUTFIT[z.outfit] || ['walker'];
    let have = want.filter(q => TPL[q]);
    if (!have.length && z.type !== 'bloater') have = ['walker'].filter(q => TPL[q]);
    return have.length ? have[Math.floor(Math.random() * have.length)] : null;
  }
  const TINTS = [0xffffff, 0xdfe6d6, 0xead9cc, 0xcfd6e0, 0xe6e0c8, 0xd6c8c8];
  const DOWN = new THREE.Vector3(0, -1, 0);
  function prepModel(key, gltf) {
    const scene = gltf.scene; scene.updateMatrixWorld(true);
    // a skinned mesh is drawn where its bones put it, not where its node sits, so measure the bind-pose geometry itself
    const box = new THREE.Box3(); scene.traverse(o => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); } });
    if (box.isEmpty()) box.setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const bones = []; scene.traverse(o => { if (o.isBone) bones.push(o); });
    const N = n => n.toLowerCase().replace(/[^a-z0-9]/g, '');
    const pick = (...res) => { for (const re of res) { const b = bones.find(q => re.test(N(q.name))); if (b) return b; } return null; };
    const side = (s, S) => ({
      arm: pick(new RegExp('^' + s + 'arm$'), new RegExp(s + 'upperarm'), new RegExp('upperarm' + S + '$')),
      fore: pick(new RegExp(s + 'forearm'), new RegExp(s + 'lowerarm'), new RegExp('(lowerarm|forearm)' + S + '$')),
      hand: pick(new RegExp('^' + s + 'hand$'), new RegExp('hand' + S + '$')),
      leg: pick(new RegExp(s + 'upleg'), new RegExp(s + 'thigh'), new RegExp('(thigh|upleg)' + S + '$')),
      shin: pick(new RegExp('^' + s + 'leg$'), new RegExp(s + '(shin|calf|lowerleg)'), new RegExp('(shin|calf)' + S + '$')),
      foot: pick(new RegExp('^' + s + 'foot$'), new RegExp('foot' + S + '$'))
    });
    const L = side('left', 'l'), R = side('right', 'r');
    const depth = b => { let d = 0; for (let q = b.parent; q; q = q.parent) d++; return d; };
    const lowestSpine = bones.filter(q => /spine/.test(N(q.name))).sort((a, b) => depth(a) - depth(b))[0] || null;   // the one nearest the hips, whatever it is numbered
    const J = { hips: pick(/^hips$/, /pelvis/, /^hip/, /root/), spine: lowestSpine, head: pick(/^head$/, /neck/) };
    const need = [J.hips, J.spine, J.head, L.arm, L.fore, L.leg, L.shin, R.arm, R.fore, R.leg, R.shin];
    if (need.some(b => !b)) { console.warn('zombie model "' + key + '": skeleton not recognised', bones.map(b => b.name)); return; }
    const wq = o => o.getWorldQuaternion(new THREE.Quaternion()), wp = o => o.getWorldPosition(new THREE.Vector3());
    const info = bones.map(b => ({ name: b.name, parent: bones.indexOf(b.parent), restW: wq(b), parentW0: b.parent && !b.parent.isBone ? wq(b.parent) : new THREE.Quaternion(), drive: null, fix: null }));
    const drive = (joint, bone, child) => { const I = info[bones.indexOf(bone)]; I.drive = joint; if (child) I.fix = new THREE.Quaternion().setFromUnitVectors(wp(child).sub(wp(bone)).normalize(), DOWN); };
    drive('hips', J.hips); drive('body', J.spine); drive('neck', J.head);
    drive('armL', L.arm, L.fore); drive('foreL', L.fore, L.hand || null); drive('legL', L.leg, L.shin); drive('shinL', L.shin, L.foot || null);
    drive('armR', R.arm, R.fore); drive('foreR', R.fore, R.hand || null); drive('legR', R.leg, R.shin); drive('shinR', R.shin, R.foot || null);
    // whichever way the model happens to face, turn it so its left-to-right matches the game's figures (which face -z)
    const lr = wp(R.arm).sub(wp(L.arm)), yaw = Math.atan2(lr.z, lr.x);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), yawQi = yawQ.clone().invert();
    const fwdM = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQi), rightM = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQi);
    const k = 1.75 / size.y, hw = wp(J.hips);
    // glowing eyes for the dark (hidden by day), riding on the head bone
    const hp = wp(J.head), eyeY = hp.y + (box.max.y - hp.y) * 0.5;
    const eB = new Batcher(); eB.jitter = 0; const er = 0.011 / k;
    for (const s of [-1, 1]) eB.sphl(hp.x + (fwdM.x * 0.085 + rightM.x * s * 0.033) / k, eyeY, hp.z + (fwdM.z * 0.085 + rightM.z * s * 0.033) / k, er, er, er, 0xffffff);
    const eyes = new THREE.Mesh(eB.geometry(), eyeMat(0xffffff)); eyes.name = 'zeyes';
    scene.add(eyes); J.head.attach(eyes);
    // give the skinned mesh a body-sized culling sphere (its own bounds don't follow the bones), so off-screen zombies cost nothing
    scene.traverse(o => { if (o.isSkinnedMesh) { const ws = o.getWorldScale(new THREE.Vector3()).x || 1; o.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(hw.x / ws, 0.95 / (ws * k), hw.z / ws), 1.7 / (ws * k)); } });
    TPL[key] = { scene, info, yaw, yawQ, yawQi, scale: k, yOff: -box.min.y, cx: hw.x, cz: hw.z, mats: {}, bs: J.hips.getWorldScale(new THREE.Vector3()).x || 1 };
  }
  function loadModels() {
    if (!THREE.GLTFLoader || !THREE.SkeletonUtils) return;
    const loader = new THREE.GLTFLoader();
    for (const key of MODEL_KEYS) loader.load('assets/zombies/' + key + '.glb', g => { try { prepModel(key, g); } catch (e) { console.warn(e); } }, undefined, () => { });
  }
  function buildSkin(z, g, key) {
    const tpl = TPL[key], inst = THREE.SkeletonUtils.clone(tpl.scene);
    const holder = new THREE.Group(); holder.scale.setScalar(tpl.scale); holder.rotation.y = tpl.yaw;
    inst.position.set(-tpl.cx, tpl.yOff, -tpl.cz); holder.add(inst); g.add(holder);
    const tint = z.type === 'jugg' ? 0xb89a90 : TINTS[Math.floor(Math.random() * TINTS.length)], byName = {};
    inst.traverse(o => {
      if (o.isBone) byName[o.name] = o;
      if (o.name === 'zeyes') { o.material = eyeMat(z.T.eye); o.castShadow = false; z.eyes = o; }
      else if (o.isMesh) { const src = o.material, mk2 = tint + '_' + src.uuid; o.material = tpl.mats[mk2] || (tpl.mats[mk2] = new THREE.MeshLambertMaterial({ map: src.map, color: new THREE.Color(tint).multiplyScalar(1.35) })); o.castShadow = true; }
    });
    z.skin = { tpl, holder, bones: tpl.info.map(I => byName[I.name]), W: tpl.info.map(() => new THREE.Quaternion()) };
    if (z.type === 'crawler') holder.position.y = -0.62;
    // what they were holding when it happened: fixed to the forearm bone, lined up the way the rig expects
    const prop = OUT[z.outfit].prop, fi = tpl.info.findIndex(I => I.drive === 'foreR');
    if (prop && z.type !== 'crawler' && fi >= 0 && z.skin.bones[fi]) {
      const I = tpl.info[fi], h = new THREE.Group();
      h.quaternion.copy(I.restW).invert(); if (I.fix) h.quaternion.multiply(I.fix.clone().invert()); h.quaternion.multiply(tpl.yawQi);
      h.scale.setScalar(1 / (tpl.bs * tpl.scale));
      z.skin.bones[fi].add(h); z.prop = mk(h, 'prop_' + prop, G.matBatch);
    }
  }
  const RQ = { hips: 0, body: 0, neck: 0, armL: 0, foreL: 0, armR: 0, foreR: 0, legL: 0, shinL: 0, legR: 0, shinR: 0 };
  for (const k in RQ) RQ[k] = new THREE.Quaternion();
  const _pq = new THREE.Quaternion();
  function pose3D(z) {
    const s = z.skin, info = s.tpl.info, P = z.parts;
    RQ.body.copy(P.body.quaternion);
    if (z.type === 'crawler' && z.state !== 'hang') RQ.hips.copy(RQ.body); else RQ.hips.set(0, 0, 0, 1);
    RQ.neck.multiplyQuaternions(RQ.body, P.neck.quaternion);
    RQ.armL.multiplyQuaternions(RQ.body, P.armL.quaternion); RQ.foreL.multiplyQuaternions(RQ.armL, P.foreL.quaternion);
    RQ.armR.multiplyQuaternions(RQ.body, P.armR.quaternion); RQ.foreR.multiplyQuaternions(RQ.armR, P.foreR.quaternion);
    RQ.legL.copy(P.legL.quaternion); RQ.shinL.multiplyQuaternions(RQ.legL, P.shinL.quaternion);
    RQ.legR.copy(P.legR.quaternion); RQ.shinR.multiplyQuaternions(RQ.legR, P.shinR.quaternion);
    for (const k in RQ) RQ[k].premultiply(s.tpl.yawQi).multiply(s.tpl.yawQ);          // the same turn, expressed in the model's own frame
    for (let i = 0; i < info.length; i++) {
      const I = info[i], b = s.bones[i], W = s.W[i], pW = I.parent >= 0 ? s.W[I.parent] : I.parentW0;
      if (I.drive) { W.copy(RQ[I.drive]); if (I.fix) W.multiply(I.fix); W.multiply(I.restW); b.quaternion.copy(_pq.copy(pW).invert().multiply(W)); }
      else W.multiplyQuaternions(pW, b.quaternion);
    }
  }

  function buildModel(z) {
    const T = z.T, rnd = Math.random, pick = a => a[Math.floor(rnd() * a.length)], vr = () => Math.floor(rnd() * 3);
    const o = OUT[z.outfit], M = matZ;
    const skinC = pick(SKINS), shirtC = pick(o.shirt), pantsC = o.bib ? o.bib : o.samePants ? shirtC : pick(o.pants);
    const big = z.type === 'brute' || z.type === 'jugg', fat = z.type === 'bloater';
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const P = z.parts = {};
    const key = pickModel(z);
    const wide = big ? 1.35 : fat ? 1.5 : z.type === 'runner' ? 0.92 : 1, deep = fat ? 1.5 : big ? 1.25 : 1;
    const armK = big ? 1.7 : fat ? 1.25 : 1, legK = big ? 1.4 : fat ? 1.25 : 1;
    P.body = grp(g, 0, 0.86, 0);
    P.neck = grp(P.body, 0, 0.6, 0);
    for (const s of [-1, 1]) {
      const a = grp(P.body, s * (0.236 * wide + 0.012), 0.5, 0), f = grp(a, 0, -0.3, 0);
      if (s < 0) { P.armL = a; P.foreL = f; } else { P.armR = a; P.foreR = f; }
      const l = grp(g, s * 0.1 * (big ? 1.35 : fat ? 1.3 : 1), 0.86, 0), sh = grp(l, 0, -0.42, 0);
      if (s < 0) { P.legL = l; P.shinL = sh; } else { P.legR = l; P.shinR = sh; }
    }
    if (key) {
      P.jaw = grp(P.neck, 0, 0.075, 0.03);
      buildSkin(z, g, key);
    } else {
      P.torso = mk(P.body, torsoGeo(shirtC, vr()), M); P.torso.scale.set(wide, 1, deep);
      const extra = ge => { mk(P.body, ge, M).scale.set(wide, 1, deep); };
      if (fat) mk(P.body, bellyGeo(skinC), M);
      else if (o.bib) extra(bibGeo(o.bib));
      else if (o.apron) extra(apronGeo(o.apron, !!o.bloody));
      else if (o.vest) extra(vestGeo(o.vest[0], o.vest[1]));
      else if (o.extra) extra(extraGeo(o.extra));
      P.neck.scale.setScalar(z.type === 'jugg' ? 0.72 : z.type === 'brute' ? 0.84 : 1);
      mk(P.neck, headGeo(skinC, vr()), M);
      P.jaw = mk(P.neck, jawGeo(skinC), M, 0, 0.075, 0.03);
      z.eyes = mk(P.neck, eyesGeo(), eyeMat(T.eye)); z.eyes.castShadow = false;
      if (o.hat) mk(P.neck, hatGeo(o.hat, pick(o.hatCol)), M); else if (rnd() < 0.86) mk(P.neck, hairGeo(vr(), pick(HAIR)), M);
      const sleeves = !o.shorts && rnd() < 0.5, shoe = pick(SHOES);
      const stump = z.type !== 'crawler' && !o.prop && rnd() < 0.15 ? (rnd() < 0.5 ? -1 : 1) : 0;
      mk(P.armL, upperGeo(shirtC), M).scale.set(armK, 1, armK); mk(P.armR, upperGeo(shirtC), M).scale.set(armK, 1, armK);
      mk(P.foreL, foreGeo(skinC, sleeves ? shirtC : null, stump === -1), M).scale.set(armK, 1, armK);
      mk(P.foreR, foreGeo(skinC, sleeves ? shirtC : null, stump === 1), M).scale.set(armK, 1, armK);
      for (const [l, sh] of [[P.legL, P.shinL], [P.legR, P.shinR]]) {
        mk(l, thighGeo(pantsC), M).scale.set(legK, 1, legK);
        mk(sh, shinGeo(o.shorts ? skinC : pantsC, shoe, skinC, !o.shorts), M).scale.set(legK, 1, legK);
      }
      if (o.prop && z.type !== 'crawler') { z.prop = mk(P.foreR, 'prop_' + o.prop, G.matBatch); }
      if (z.type === 'crawler') { P.legL.visible = rnd() < 0.5; P.legR.visible = rnd() < 0.3; }
    }
    g.scale.setScalar(T.scale * (0.94 + rnd() * 0.12));
    z.scale = g.scale.x; z.skinHex = skinC; z.shirtHex = shirtC;
    // health bar: a billboard pair that floats over the head (main view only, not in the mirrors)
    const hb = z.bar = new THREE.Group(); hb.position.y = z.type === 'crawler' ? 0.95 : 2.1;
    const bg = new THREE.Sprite(barBg); bg.scale.set(0.64, 0.09, 1); bg.renderOrder = 8;
    const fill = z.barFill = new THREE.Sprite(barMats[0]); fill.scale.set(0.6, 0.055, 1); fill.renderOrder = 9;
    hb.add(bg, fill); hb.traverse(q => q.layers.set(1)); hb.visible = false; g.add(hb);
    z.group = g; G.zscene.add(g);
  }
  function setBar(z) {
    const f = clamp(z.hp / z.maxHp, 0.02, 1), fill = z.barFill;
    fill.scale.x = 0.6 * f; fill.center.x = 0.5 / f;       // keep the left edge pinned as it shrinks
    fill.material = barMats[f > 0.6 ? 0 : f > 0.3 ? 1 : 2];
  }

  /* ------------------------------------------------------------------ spawn / remove */
  let nextId = 1;
  Z.spawn = function (type, x, zz, opts) {
    opts = opts || {};
    const T = TYPES[type], st = G.state;
    const z = {
      id: nextId++, type, T, x, z: zz, y: 0, yaw: opts.yaw !== undefined ? opts.yaw : Math.random() * 6.28,
      hp: T.hp * st.diff.hp, maxHp: T.hp * st.diff.hp, speed: lerp(T.speed[0], T.speed[1], Math.random()) * (opts.speedMul || 1),
      state: opts.state || 'idle', t: 0, phase: Math.random() * 6, slot: -1, atkT: 0, vx: 0, vz: 0, kx: 0, kz: 0,
      stagger: 0, grabCD: 0, bladeCD: 0, smashCD: 0, hitT: 0, groanT: 1 + Math.random() * 6, latOff: (Math.random() - 0.5) * 2.6, intent: Math.random(),
      outfit: opts.outfit || OUTFITS_FOR[type][Math.floor(Math.random() * OUTFITS_FOR[type].length)], dead: false, hangT: 0, wander: Math.random() * 6.28
    };
    z.dropList = OUT[z.outfit].drop;
    buildModel(z);
    z.y = groundY(z.x, z.z);
    z.group.position.set(z.x, z.y, z.z); z.group.rotation.y = z.yaw;
    Z.list.push(z);
    return z;
  };
  function remove(z) { G.zscene.remove(z.group); z.removed = true; if (z.slot >= 0) { Z.slots[z.slot] = null; z.slot = -1; } }
  Z.reset = function () {
    for (const z of Z.list) G.zscene.remove(z.group);
    Z.list.length = 0; Z.kills = 0; Z.slots = [null, null, null, null, null, null];
    H.s = -230; H.active = false; H.spawnT = 0; H.engulfT = 0;
    dir.t = 2.5; dir.bruteT = 0; dir.juggs = 0; dir.scripted = 0;
    if (H.mesh) H.mesh.visible = false;
  };
  Z.slots = [null, null, null, null, null, null];
  Z.hangers = side => { // side: -1 left, 1 right, 0 rear
    const a = side < 0 ? 0 : side > 0 ? 2 : 4; return (Z.slots[a] ? 1 : 0) + (Z.slots[a + 1] ? 1 : 0);
  };
  Z.hangCount = () => Z.slots.reduce((n, s) => n + (s ? 1 : 0), 0);

  function groundY(x, zz) { const s = -zz, lat = x - G.road.x(s); return Math.abs(lat) < 4.7 ? G.road.y(s) : G.terrainY(x, s); }

  /* ------------------------------------------------------------------ damage & death */
  Z.damage = function (z, amount, cause, dx, dz, knock) {
    if (z.dead) return false;
    z.hp -= amount; z.hitT = 0.14;
    const cy = z.y + (z.type === 'crawler' ? 0.35 : 1.25 * z.scale) + (z.slot >= 0 ? 0.3 : 0);
    if (cause !== 'fire') G.fx.blood(z.x, cy, z.z, cause === 'shotgun' ? 16 : 8, (dx || 0) * 4, (dz || 0) * 4, cause === 'whip' ? 0.7 : 1);
    if (z.hp <= 0) { Z.kill(z, cause, dx, dz); return true; }
    if (z.slot < 0) {
      const res = z.type === 'brute' ? 0.25 : z.type === 'jugg' ? 0.08 : z.type === 'bloater' ? 0.5 : 1;
      z.stagger = Math.max(z.stagger, 0.45 * res + 0.1); z.kx += (dx || 0) * (knock || 3) * res; z.kz += (dz || 0) * (knock || 3) * res;
      if (z.state === 'idle') z.state = 'chase';
    }
    setBar(z);
    if (cause !== 'fire') G.audio.hit(cause);
    return false;
  };
  Z.kill = function (z, cause, dx, dz) {
    if (z.dead) return;
    z.dead = true; z.hp = 0; z.t = 0;
    const st = G.state, wasHanging = z.slot >= 0;
    if (wasHanging) { Z.slots[z.slot] = null; z.slot = -1; }
    Z.kills++;
    const cy = z.y + (z.type === 'crawler' ? 0.3 : 1.1 * z.scale);
    const big = z.type === 'brute' || z.type === 'jugg';
    const gibbed = cause === 'shotgun' || cause === 'acid' || z.type === 'bloater' || (cause === 'trample' && st.speed > 9.5 && !big) || (cause === 'scrape' && Math.random() < 0.4);
    G.fx.blood(z.x, cy, z.z, gibbed ? 30 : 14, (dx || 0) * 5, (dz || 0) * 5, 1.2);
    G.fx.decal(z.x, groundY(z.x, z.z), z.z, (0.7 + Math.random() * 0.7) * z.scale);
    if (gibbed) {
      G.fx.gib(z.x, cy, z.z, big ? 14 : 8, Math.random() < 0.5 ? z.shirtHex : z.skinHex, (dx || 0) * 7 + st.vx * 0.5, (dz || 0) * 7 + st.vz * 0.5, 1);
      z.group.visible = false; z.state = 'gone'; z.t = 0;
    } else if (cause === 'trample' || cause === 'scrape' || cause === 'shovel' || cause === 'crash' || wasHanging) {
      z.state = 'fling';
      const k = cause === 'shovel' ? 7 : 1;
      z.vx = (dx || 0) * k + st.vx * (cause === 'trample' ? 0.75 : 0.35) + (Math.random() - 0.5) * 3; z.vz = (dz || 0) * k + st.vz * (cause === 'trample' ? 0.75 : 0.35) + (Math.random() - 0.5) * 3;
      z.vy = 3 + Math.random() * 3 + (cause === 'trample' ? st.speed * 0.25 : 0); z.spin = (Math.random() - 0.5) * 14;
    } else { z.state = 'fall'; z.fallDir = (dx || 0) * -Math.sin(z.yaw) + (dz || 0) * -Math.cos(z.yaw) > 0 ? -1 : 1; }
    if (z.eyes) z.eyes.visible = false;
    z.bar.visible = false;
    if (z.type === 'bloater') explode(z);
    G.audio.death(z.T.pitch, G.game.panOf(z.x, z.z), cause);
    G.game.onKill(z, cause, cy);
  };
  function explode(z) {
    const st = G.state, y = z.y + 1;
    G.fx.acid(z.x, y, z.z, 46); G.fx.flash(z.x, y, z.z, 5, 0.5, 0.9, 0.15);
    G.audio.splat(G.game.panOf(z.x, z.z));
    for (const o of Z.list) { if (o.dead || o === z) continue; const d = Math.hypot(o.x - z.x, o.z - z.z); if (d < 4.6) Z.damage(o, 170 * (1 - d / 6), 'acid', (o.x - z.x) / (d || 1), (o.z - z.z) / (d || 1), 6); }
    const d = Math.hypot(st.x - z.x, st.z - z.z);
    if (d < 4.2) G.game.hurt(9, 'acid');
    const hd = Math.hypot(st.hx - z.x, st.hz - z.z);
    if (hd < 3.2) G.game.hurtHorse(9, 'acid');
  }
  /* knock clinging zombies off one flank (-1 left, 1 right, 0 rear). returns how many went */
  Z.knockOff = function (side, max, cause) {
    const a = side < 0 ? 0 : side > 0 ? 2 : 4; let n = 0;
    for (let i = a + 1; i >= a && n < (max || 2); i--) {
      const z = Z.slots[i]; if (!z) continue;
      const st = G.state, rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
      Z.kill(z, cause || 'scrape', side * rx * 0.6 + Math.sin(st.yaw) * 0.5, side * rz * 0.6 + Math.cos(st.yaw) * 0.5);
      n++;
    }
    return n;
  };

  /* ------------------------------------------------------------------ targeting for the driver's weapons */
  const _v = new THREE.Vector3();
  Z.aimPoint = function (z, out) { return out.set(z.x, z.y + (z.type === 'crawler' && z.slot < 0 ? 0.35 : 1.28 * z.scale) + (z.slot >= 0 ? 0.25 : 0), z.z); };
  Z.pick = function (cam, dir, range, assist) {
    let best = null, bestA = 1e9;
    for (const z of Z.list) {
      if (z.dead) continue;
      Z.aimPoint(z, _v).sub(cam); const d = _v.length(); if (d > range + z.T.r) continue;
      const ang = Math.acos(clamp(_v.dot(dir) / d, -1, 1)), tol = assist + Math.atan((z.T.r + 0.25) * z.scale / Math.max(d, 0.6));
      if (ang < tol && ang - tol * 0.5 + d * 0.004 < bestA) { bestA = ang - tol * 0.5 + d * 0.004; best = z; }
    }
    return best;
  };
  Z.inCone = function (cam, dir, range, half, out) {
    out.length = 0;
    for (const z of Z.list) {
      if (z.dead) continue;
      Z.aimPoint(z, _v).sub(cam); const d = _v.length(); if (d > range) continue;
      const ang = Math.acos(clamp(_v.dot(dir) / d, -1, 1));
      if (ang < half + Math.atan(z.T.r / Math.max(d, 0.6))) out.push({ z, d, ang });
    }
    out.sort((a, b) => a.d - b.d); return out;
  };

  /* ------------------------------------------------------------------ the horde on your tail */
  const H = Z.horde = { s: -230, active: false, spawnT: 0, engulfT: 0, N: 120, mesh: null, off: [] };
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3();
  function initHorde() {
    H.mesh = new THREE.InstancedMesh(GEO.horde, new THREE.MeshLambertMaterial({ vertexColors: true }), H.N);
    H.mesh.frustumCulled = false; H.mesh.castShadow = false; H.mesh.visible = false;
    const c = new THREE.Color(), cols = [0x6a5a50, 0x4a5a6a, 0x7a3a34, 0x5a6a4a, 0x8a8478, 0x3a3a44, 0x6a4a6a];
    for (let i = 0; i < H.N; i++) { H.off.push({ d: Math.pow(Math.random(), 1.4) * 34, lat: (Math.random() - 0.5) * 20, ph: Math.random() * 6.28, sc: 0.9 + Math.random() * 0.3, sp: 0.8 + Math.random() * 0.5 }); c.setHex(cols[i % cols.length]); H.mesh.setColorAt(i, c); }
    G.zscene.add(H.mesh);
  }
  function updateHorde(dt, st) {
    const t = st.time;
    if (!H.active) { if (t > 38) { H.active = true; H.s = st.s - 235; G.game.say('horde'); } else return; }
    const sp = lerp(4.5, 8.8, clamp((t - 38) / 520, 0, 1)) * st.diff.horde;
    H.s += sp * dt;
    if (st.s - H.s > 235) H.s = st.s - 235;
    if (H.s > st.s - 5) H.s = st.s - 5;
    const gap = H.gap = st.s - H.s;
    H.mesh.visible = gap < 300;
    const R = G.road, tt = st.realTime;
    for (let i = 0; i < H.N; i++) {
      const o = H.off[i], s = H.s - o.d + Math.sin(tt * 0.4 + o.ph) * 1.2, lim = Math.min(G.world.latLimit(s, -1), G.world.latLimit(s, 1), 9.5) - 0.4;
      const lat = clamp(o.lat + Math.sin(tt * 0.3 + o.ph * 2) * 0.8, -lim, lim), x = R.x(s) + lat;
      const y = (Math.abs(lat) < 4.7 ? R.y(s) : G.terrainY(x, s)) + Math.abs(Math.sin(tt * 7 * o.sp + o.ph)) * 0.09;
      _e.set(-0.22 + Math.sin(tt * 7 * o.sp + o.ph) * 0.06, R.ang(s), Math.sin(tt * 3.5 * o.sp + o.ph) * 0.1, 'YXZ'); _q.setFromEuler(_e);
      _m4.compose(_p3.set(x, y, -s), _q, _s3.setScalar(o.sc)); H.mesh.setMatrixAt(i, _m4);
    }
    H.mesh.instanceMatrix.needsUpdate = true;
    if (gap < 200 && Math.random() < dt * 14) { const s = H.s - Math.random() * 24, lat = (Math.random() - 0.5) * 16; G.fx.dust(R.x(s) + lat, R.y(s), -s, 1, 0x9a8a74, 2, 2.4); }
    // close enough to peel sprinters off the front rank
    if (gap < 60) {
      H.spawnT -= dt * (1 + (60 - gap) / 22);
      if (H.spawnT <= 0 && Z.list.length < dir.cap(st) + 10) {
        H.spawnT = 1.5;
        const s = H.s + 3 + Math.random() * 4, lat = clamp((Math.random() - 0.5) * 9, -6, 6);
        Z.spawn(Math.random() < 0.8 ? 'runner' : 'shambler', R.x(s) + lat, -s, { state: 'chase', yaw: R.ang(s), speedMul: 1.05 });
      }
    }
    if (gap < 12) { H.engulfT += dt; if (H.engulfT > 0.5) { H.engulfT = 0; G.game.hurt(5, 'horde'); G.game.say('engulf'); } }
  }

  /* ------------------------------------------------------------------ spawn director */
  const dir = Z.director = {
    t: 2.5, bruteT: 0, juggs: 0, scripted: 0,
    cap(st) { return Math.round((5 + 46 * Math.pow(clamp(st.time / 600, 0, 1), 1.05)) * st.diff.spawn); },
    pickType(t) {
      const w = { shambler: 10, crawler: t > 55 ? lerp(1.5, 3.5, clamp((t - 55) / 300, 0, 1)) : 0, runner: t > 95 ? lerp(0.8, 8, clamp((t - 95) / 320, 0, 1)) : 0, bloater: t > 165 ? lerp(0.6, 3, clamp((t - 165) / 300, 0, 1)) : 0 };
      let sum = 0; for (const k in w) sum += w[k]; let r = Math.random() * sum;
      for (const k in w) { if (r < w[k]) return k; r -= w[k]; } return 'shambler';
    },
    ahead(st, type, distMin, distMax, where) {
      const R = G.road, vis = G.env.visibility();
      const d = distMin !== undefined ? lerp(distMin, distMax, Math.random()) : clamp(vis * (0.42 + Math.random() * 0.22), 85, 215);
      const s = st.s + d, nearBr = Math.abs(s - G.bridgeAt(s)) < 26;
      let lat, r = where !== undefined ? where : Math.random();
      if (r < 0.42 || nearBr) lat = (Math.random() - 0.5) * (nearBr ? 5 : 7);
      else if (r < 0.7) lat = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3);
      else { const side = Math.random() < 0.5 ? -1 : 1, use = G.landUse(s, side); lat = side * ((use === 'corn' ? 9.5 : 8.5) + Math.random() * (use === 'corn' || use === 'cemetery' ? 7 : 14)); }
      return Z.spawn(type, R.x(s) + lat, -s, { yaw: R.ang(s) + PI + (Math.random() - 0.5) });
    },
    update(dt, st) {
      const t = st.time, R = G.road;
      // the first minute: just a couple of strangers who look unwell
      if (this.scripted === 0 && t > 1) { this.scripted = 1; this.ahead(st, 'shambler', 95, 100, 0.95).outfit0 = 1; }
      if (this.scripted === 1 && t > 9) { this.scripted = 2; this.ahead(st, 'shambler', 110, 120, 0.5); }
      if (t < 16) return;
      this.t -= dt;
      const alive = Z.list.length;
      if (this.t <= 0 && alive < this.cap(st)) {
        const k = clamp(t / 600, 0, 1);
        this.t = lerp(3.0, 0.4, Math.pow(k, 0.72)) / st.diff.spawn * (0.6 + Math.random() * 0.8);
        const type = this.pickType(t);
        const pack = t > 150 && Math.random() < 0.12 + 0.2 * k ? 2 + Math.floor(Math.random() * (2 + 4 * k)) : 1;
        if (type === 'runner' && Math.random() < 0.45) {
          // out of the rear-view mirror
          const s = st.s - (42 + Math.random() * 30), lat = (Math.random() - 0.5) * 9;
          for (let i = 0; i < Math.min(pack, 3); i++) Z.spawn('runner', R.x(s - i * 3) + lat + i, -(s - i * 3), { state: 'chase', yaw: R.ang(s) });
        } else {
          const z0 = this.ahead(st, type);
          for (let i = 1; i < pack; i++) Z.spawn(Math.random() < 0.7 ? 'shambler' : this.pickType(t), z0.x + (Math.random() - 0.5) * 5, z0.z + (Math.random() - 0.5) * 6, { yaw: z0.yaw });
        }
      }
      // heavies
      if (t > 240) {
        this.bruteT -= dt;
        let brutes = 0; for (const z of Z.list) if (!z.dead && (z.type === 'brute' || z.type === 'jugg')) brutes++;
        if (this.bruteT <= 0 && brutes < (t > 430 ? 3 : t > 330 ? 2 : 1)) { this.bruteT = lerp(34, 13, clamp((t - 240) / 300, 0, 1)) / st.diff.spawn; this.ahead(st, 'brute', undefined, undefined, 0.3); G.game.say('brute'); }
      }
      const juggAt = [470, 530, 572];
      if (this.juggs < juggAt.length && t > juggAt[this.juggs]) { this.juggs++; this.ahead(st, 'jugg', undefined, undefined, 0.2); G.game.say('jugg'); G.audio.roar(); }
    }
  };

  /* ------------------------------------------------------------------ per-frame */
  Z.init = function (scene) { G.zscene = scene; initGeo(); initHorde(); loadModels(); };
  Z.models = TPL;
  const _loc = new THREE.Vector3();

  function animate(z, dt, moving, st) {
    const P = z.parts, T = z.T, ph = z.phase, type = z.type;
    let lean = -0.14, armL = 1.25, armR = 1.1, armZ = 0.08, legA = 0.5 * moving, fore = -0.25, bodyZ = 0, headX = 0.1, headZ = 0.2;
    if (z.state === 'hang') {
      const a = z.atkT / T.atk, lunge = a > 0.75 ? Math.sin((a - 0.75) * 4 * PI) : 0;
      lean = -0.18 - lunge * 0.5; armL = 2.2 + Math.sin(st.realTime * 9 + z.id) * 0.12; armR = 2.05 - lunge * 0.9 + Math.sin(st.realTime * 8 + z.id) * 0.1; fore = -0.5 - lunge * 0.4;
      const drag = clamp(st.speed * 0.07, 0, 0.9), sw = Math.sin(st.realTime * 7 + z.id) * 0.25;
      P.legL.rotation.x = -drag + sw; P.legR.rotation.x = -drag * 0.8 - sw; P.shinL.rotation.x = -0.5 - drag * 0.4; P.shinR.rotation.x = -0.3 - drag * 0.4;
      bodyZ = Math.sin(st.realTime * 5 + z.id) * 0.08; headX = -0.25 - lunge * 0.3; headZ = Math.sin(st.realTime * 3 + z.id) * 0.3;
      P.jaw.rotation.x = -(0.3 + lunge * 0.4);
    } else if (type === 'crawler') {
      lean = -1.32; armL = 2.5 + Math.sin(ph) * 0.55; armR = 2.5 - Math.sin(ph) * 0.55; fore = -0.3; bodyZ = Math.sin(ph) * 0.16; headX = 1.0;
      P.legL.rotation.x = -0.25; P.legR.rotation.x = -0.2; P.shinL.rotation.x = 0; P.shinR.rotation.x = 0; P.jaw.rotation.x = -0.32;
    } else {
      if (type === 'runner') { lean = -0.42; armL = 0.5 + Math.sin(ph) * 1.0; armR = 0.5 - Math.sin(ph) * 1.0; armZ = 0.25; legA = 0.95 * moving; fore = -0.9; headX = 0.3; }
      else if (type === 'bloater') { lean = 0.06; armL = 0.5; armR = 0.45; armZ = 0.7; bodyZ = Math.sin(ph) * 0.13; legA = 0.34 * moving; }
      else if (type === 'brute' || type === 'jugg') {
        if (z.state === 'charge') { lean = -0.5; armL = -0.5; armR = -0.4; armZ = 0.5; legA = 0.9; headX = 0.4; }
        else { lean = -0.2; armL = 0.35 + Math.sin(ph) * 0.3; armR = 0.35 - Math.sin(ph) * 0.3; armZ = 0.45; legA = 0.45 * moving; bodyZ = Math.sin(ph) * 0.08; }
      } else { armL += Math.sin(ph * 0.5) * 0.14; armR += Math.cos(ph * 0.6) * 0.14; bodyZ = Math.sin(ph) * 0.07 + z.latOff * 0.03; }
      if (z.state === 'attackHorse') { const a = (z.atkT / T.atk) * 2 * PI; armL = 1.5 + Math.sin(a) * 0.7; armR = 1.5 - Math.sin(a) * 0.7; lean = -0.3; }
      if (z.stagger > 0) { const k = Math.min(1, z.stagger * 2.5); lean = lerp(lean, 0.55, k); armL = lerp(armL, -0.4, k); armR = lerp(armR, -0.6, k); armZ = lerp(armZ, 0.9, k); }
      P.legL.rotation.x = Math.sin(ph) * legA; P.legR.rotation.x = -Math.sin(ph) * legA;
      P.shinL.rotation.x = -Math.max(0, Math.cos(ph)) * legA * 1.3; P.shinR.rotation.x = -Math.max(0, -Math.cos(ph)) * legA * 1.3;
      P.jaw.rotation.x = -(0.08 + Math.max(0, Math.sin(st.realTime * 2 + z.id)) * 0.34);
    }
    const sq = z.hitT > 0 ? 1 - z.hitT * 1.5 : 1;
    P.body.rotation.set(lean, 0, bodyZ); P.body.scale.set(1, sq, 1);
    P.armL.rotation.set(armL, 0, -armZ); P.armR.rotation.set(armR, 0, armZ);
    P.foreL.rotation.x = fore; P.foreR.rotation.x = fore * 0.8;
    P.neck.rotation.set(headX, 0, headZ * Math.sin(st.realTime * 1.3 + z.id));
    if (z.skin) pose3D(z);
  }

  Z.update = function (dt, st) {
    const R = G.road, Bg = G.buggy, list = Z.list;
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
    const blades = st.blades, armorK = 1 - st.armor * 0.1;
    st.blocked = false;
    dir.update(dt, st);
    updateHorde(dt, st);

    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i], T = z.T;
      z.t += dt; if (z.hitT > 0) z.hitT -= dt;
      const dx = z.x - st.x, dz = z.z - st.z;
      const lx = dx * rx + dz * rz, lz = dx * fx + dz * fz;   // buggy-local: right, forward

      /* ---- dead bodies */
      if (z.dead) {
        const g = z.group;
        if (z.state === 'fall') {
          const k = Math.min(1, z.t / 0.55); g.rotation.x = z.fallDir * 1.5 * k * k; g.position.y = z.y + Math.sin(k * PI) * 0.1;
          if (z.t > 0.3) { z.parts.armL.rotation.x = lerp(z.parts.armL.rotation.x, 0.2, 0.2); z.parts.armR.rotation.x = lerp(z.parts.armR.rotation.x, 2.8, 0.2); }
          if (z.t > 3.5) g.position.y = z.y - (z.t - 3.5) * 0.35;
        } else if (z.state === 'fling') {
          if (z.vy !== null) {
            z.vy -= 20 * dt; z.x += z.vx * dt; z.z += z.vz * dt; g.position.y += z.vy * dt; g.rotation.x += z.spin * dt; g.rotation.z += z.spin * 0.4 * dt;
            const gy = groundY(z.x, z.z);
            if (g.position.y < gy + 0.25 && z.vy < 0) { g.position.y = gy + 0.25; g.rotation.x = 1.5; g.rotation.z = 0; z.vy = null; z.y = gy; G.fx.dust(z.x, gy, z.z, 5); G.fx.decalSmall(z.x, gy, z.z); z.t = 0; }
            g.position.x = z.x; g.position.z = z.z;
          } else if (z.t > 3) g.position.y = z.y + 0.25 - (z.t - 3) * 0.35;
        }
        if (z.t > 5 || lz < -70 || (z.state === 'gone' && z.t > 0.1)) { remove(z); list.splice(i, 1); }
        continue;
      }

      /* ---- on fire */
      if (z.burn > 0) {
        z.burn -= dt; z.hp -= 28 * dt;
        if (Math.random() < dt * 24) { const h = Math.random(); G.fx.add.emit(z.x + (Math.random() - 0.5) * 0.4, z.y + (0.3 + Math.random() * 1.3) * z.scale, z.z + (Math.random() - 0.5) * 0.4, 0, 1.4 + Math.random() * 1.6, 0, 0.35 + Math.random() * 0.3, 0.55 * z.scale, 0.1, 1, 0.38 + h * 0.4, 0.06 + h * 0.1, 0.6, -1, 0.3); }
        if (Math.random() < dt * 4) setBar(z);
        if (z.hp <= 0) { Z.kill(z, 'fire', 0, 0); continue; }
      }
      /* ---- clinging to the buggy */
      if (z.state === 'hang') {
        const sl = Bg.SLOTS[z.slot];
        Bg.slotWorld(z.slot, _loc);
        z.x = _loc.x; z.z = _loc.z; z.y = st.y + (z.slot >= 4 ? 0.3 : 0.42) + Bg.body.position.y;
        z.yaw = st.yaw + sl[2]; z.hangT += dt; z.bar.visible = true; z.bar.position.y = 1.98;
        z.group.position.set(z.x, z.y, z.z); z.group.rotation.set(0, z.yaw, Math.sin(st.realTime * 4 + z.id) * 0.05);
        z.atkT += dt;
        if (z.atkT >= T.atk) {
          z.atkT = 0;
          G.game.hurt(T.dmg * (z.hangT > 10 ? 1.6 : 1), 'claw', z.slot);
        }
        if (blades > 0) { z.hp -= 9 * blades * dt; if (Math.random() < dt * 5) G.fx.blood(z.x, z.y + 0.8, z.z, 2, 0, 0, 0.5); if (z.hp <= 0) { Z.kill(z, 'blade', (z.slot < 2 ? -1 : z.slot < 4 ? 1 : 0) * rx, (z.slot < 2 ? -1 : z.slot < 4 ? 1 : 0) * rz); continue; } }
        z.groanT -= dt; if (z.groanT <= 0) { z.groanT = 1.5 + Math.random() * 2; G.audio.groan(z.slot < 2 ? -0.8 : z.slot < 4 ? 0.8 : 0, 0.5, T.pitch * 1.2); }
        animate(z, dt, 0, st);
        continue;
      }

      const dist = Math.hypot(dx, dz);
      if (lz < -120 || lz > 330) { remove(z); list.splice(i, 1); continue; }
      z.bar.visible = dist < 48;
      if (z.skin && z.eyes) z.eyes.visible = st.night > 0.35;
      const nearSh = z.skin ? (lz > -12 && lz < 28) : (lz > -22 && lz < 42);   // only nearby bodies cast shadows
      if (z.shadowOn !== nearSh) { z.shadowOn = nearSh; z.group.traverse(o => { if (o.isMesh && o !== z.eyes) o.castShadow = nearSh; }); }

      /* ---- decide where to go */
      let tx, tz, want = z.speed, moving = 1;
      if (z.state === 'idle') {
        if (dist < 62 || (lz < 45 && lz > -10)) { z.state = 'chase'; if (dist < 50) G.audio.groan(G.game.panOf(z.x, z.z), 0.5, T.pitch); }
        z.wander += (Math.random() - 0.5) * dt * 2; tx = z.x - Math.sin(z.wander) * 5; tz = z.z - Math.cos(z.wander) * 5; want = z.speed * 0.35;
      } else if (z.state === 'charge') {
        tx = z.x + z.cx * 10; tz = z.z + z.cz * 10; want = T.charge;
        if (z.t > 3.6 || lz < -4) { z.state = 'chase'; z.stagger = 1.0; z.t = 0; }
      } else {
        const slow = T.speed[1] < 4;
        if (slow && lz > 11) {
          // can't outrun a horse: shuffle into its path and wait for it
          const zs = -z.z, lim = Math.min(G.world.latLimit(zs, st.lat < 0 ? -1 : 1) - 0.6, 9);
          const lat = clamp(st.lat + z.latOff * (z.intent < 0.45 ? 0.35 : 1), -lim, lim);
          const ts = zs - 3; tx = R.x(ts) + lat; tz = -ts;
          if (Math.abs((z.x - R.x(zs)) - lat) < 0.5) { want = z.speed * 0.4; }
        } else if (lz > 2.2 && z.intent < 0.5 && Math.abs(lx) < 3) {
          tx = st.hx + rx * z.latOff * 0.25; tz = st.hz + rz * z.latOff * 0.25;       // go for the horse
        } else {
          // nearest free flank
          const lead = clamp(dist / Math.max(z.speed, 1), 0, 1.1) * (slow ? 0.3 : 0.85);
          const side = lz < -1.6 && Math.abs(lx) < 1.2 ? 0 : lx < 0 ? -1 : 1;
          const ox = side * 1.05, oz = side === 0 ? -1.5 : (z.id % 2 ? 0.3 : -0.6);
          tx = st.x + rx * ox + fx * oz + st.vx * lead; tz = st.z + rz * ox + fz * oz + st.vz * lead;
        }
        if ((z.type === 'brute' || z.type === 'jugg') && dist < 30 && lz > -2 && z.t > 2.5 && z.stagger <= 0) {
          const lead = dist / T.charge * 0.8; let cx = st.x + st.vx * lead - z.x, cz = st.z + st.vz * lead - z.z; const l = Math.hypot(cx, cz) || 1;
          z.cx = cx / l; z.cz = cz / l; z.state = 'charge'; z.t = 0; G.audio.roar(G.game.panOf(z.x, z.z));
        }
      }
      if (z.stagger > 0) { z.stagger -= dt; want = 0; moving = 0; }
      if (z.state === 'attackHorse') { want *= 0.3; }

      /* ---- steer & move */
      const ax = tx - z.x, az = tz - z.z, wantYaw = Math.atan2(-ax, -az);
      const dy = G.angDiff(z.yaw, wantYaw), turn = T.turn * dt;
      z.yaw += clamp(dy, -turn, turn);
      const align = Math.max(0.15, Math.cos(dy));
      const spd = want * align;
      z.x += -Math.sin(z.yaw) * spd * dt + z.kx * dt; z.z += -Math.cos(z.yaw) * spd * dt + z.kz * dt;
      z.kx *= Math.max(0, 1 - 6 * dt); z.kz *= Math.max(0, 1 - 6 * dt);
      z.phase += dt * (2.2 + spd * (z.type === 'runner' ? 1.5 : 2.6)) * (z.type === 'crawler' ? 0.8 : 1);
      // crowd separation
      for (let k = i - 1; k >= 0; k--) {
        const o = list[k]; if (o.dead || o.state === 'hang') continue;
        const ex = z.x - o.x, ez = z.z - o.z, d2 = ex * ex + ez * ez, rr = (T.r + o.T.r) * 1.15;
        if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2), p = (rr - d) * 0.5 / d; z.x += ex * p; z.z += ez * p; o.x -= ex * p; o.z -= ez * p; }
      }
      // world: wrecks, bridge walls
      const zs = -z.z;
      G.world.each('obstacles', zs, 8, o => { if (o.cls !== 'solid') return; const ex = z.x - o.x, ez = z.z - o.z, rr = o.r + T.r * 0.7, d2 = ex * ex + ez * ez; if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2); z.x += ex / d * (rr - d); z.z += ez / d * (rr - d); } });
      const sb = G.bridgeAt(zs);
      if (Math.abs(zs - sb) < 16.5) { const cx = R.x(zs), lat = z.x - cx; if (Math.abs(lat) < 3.3) z.x = cx + clamp(lat, -2.9, 2.9); else if (Math.abs(lat) < 4.2) z.x = cx + Math.sign(lat) * 4.2; }
      z.y = groundY(z.x, z.z);
      z.group.position.set(z.x, z.y, z.z); z.group.rotation.set(0, z.yaw, 0);

      /* ---- sounds */
      z.groanT -= dt;
      if (z.groanT <= 0 && dist < 48) { z.groanT = 3 + Math.random() * 7; G.audio.groan(G.game.panOf(z.x, z.z), clamp(1 - dist / 50, 0.1, 1) * 0.6, T.pitch * (0.9 + Math.random() * 0.25)); }

      /* ---- contact with horse and buggy */
      z.grabCD -= dt; z.bladeCD -= dt; z.smashCD -= dt;
      const frontW = 0.78 + T.r * 0.5 + (blades >= 5 ? 0.25 : 0);
      if (lz > 1.7 && lz < 5.0 && Math.abs(lx) < frontW) {
        const thr = T.trample - (blades >= 5 ? 2.2 : blades >= 3 ? 0.8 : 0);
        if (st.speed >= thr) {
          // under the hooves
          const big = z.type === 'brute';
          st.stamina = Math.max(0, st.stamina - T.tCost * (blades >= 5 ? 0.6 : 1));
          st.speed *= blades >= 5 ? Math.sqrt(T.slow) : T.slow;
          Bg.jolt += z.type === 'crawler' ? 1.6 : big ? 2.2 : 0.8;
          G.game.shake(big ? 0.5 : z.type === 'crawler' ? 0.3 : 0.16);
          if (big || z.type === 'bloater') G.game.hurtHorse(big ? 8 : 5, 'trample');
          G.audio.thud(big ? 1 : 0.6);
          Z.kill(z, 'trample', fx * 0.6 + rx * (lx > 0 ? 0.5 : -0.5), fz * 0.6 + rz * (lx > 0 ? 0.5 : -0.5));
          st.trampled++;
          continue;
        } else if (z.type === 'brute' || z.type === 'jugg') {
          if (z.smashCD <= 0) {
            z.smashCD = 1.8; G.game.hurtHorse(T.horse, 'smash'); st.speed = 0; Bg.rear = 1; Bg.jolt += 2.5; G.game.shake(0.8); G.audio.crash(1); G.audio.whinny();
            z.stagger = 0.7; z.state = 'chase'; z.t = 0; G.game.say('blocked');
          }
          st.blocked = true;
        } else {
          st.blocked = true;
          if (lz < 4.6 && Math.abs(lx) < 0.6) { const push = Math.min(4.6 - lz, st.speed * dt + 0.03); z.x += fx * push; z.z += fz * push; }   // shoved along by the horse's chest
          if (z.state !== 'attackHorse') { z.state = 'attackHorse'; z.atkT = T.atk * 0.5; }
          z.atkT += dt;
          if (z.atkT >= T.atk) { z.atkT = 0; G.game.hurtHorse(T.horse, 'bite'); G.fx.blood(st.hx, st.y + 1.2, st.hz, 4); if (Math.random() < 0.5) { Bg.rear = 1; G.audio.whinny(); } G.game.say('blocked'); }
        }
      } else if (z.state === 'attackHorse') z.state = 'chase';

      const sideReach = 1.3 + T.r * 0.5;
      if (Math.abs(lx) > 0.55 && Math.abs(lx) < sideReach && lz > -1.5 && lz < 1.5 && z.state !== 'idle') {
        const side = lx < 0 ? -1 : 1;
        if (blades > 0 && z.bladeCD <= 0) {
          z.bladeCD = 0.45; G.fx.sparks(z.x, z.y + 0.9, z.z, 4); G.audio.slice();
          if (Z.damage(z, 36 * blades, 'blade', side * rx, side * rz, 5)) continue;
        }
        if (T.grab > 0 && z.grabCD <= 0 && z.stagger <= 0) {
          z.grabCD = 1.3;
          const a = side < 0 ? 0 : 2, slot = !Z.slots[a] ? a : !Z.slots[a + 1] ? a + 1 : -1;
          let ch = T.grab; if (z.type !== 'runner' && st.speed > 7.4) ch *= 0.22; if (st.speed > 11.5) ch *= 0.55;
          if (slot >= 0 && Math.random() < ch) { hang(z, slot); continue; }
          if (st.speed < 9 || z.type === 'runner') G.game.hurt(3, 'swipe', a);
          z.stagger = 0.9; z.kx = side * rx * 3 + st.vx * 0.4; z.kz = side * rz * 3 + st.vz * 0.4;
        } else if (T.grab === 0 && z.type !== 'crawler' && z.smashCD <= 0) {
          z.smashCD = 1.7; G.game.hurt(T.dmg, 'smash', side < 0 ? 0 : 2); st.latVel += -side * 7.5; Bg.jolt += 2; G.game.shake(0.7); G.audio.crash(0.8);
          z.stagger = 0.6; if (z.state === 'charge') { z.state = 'chase'; z.t = 0; }
        }
      } else if (lz < -1.0 && lz > -2.4 && Math.abs(lx) < 1.0 && T.grab > 0 && z.grabCD <= 0 && z.stagger <= 0 && (z.type === 'runner' || st.speed < 3.2)) {
        z.grabCD = 1.0;
        const slot = !Z.slots[4] ? 4 : !Z.slots[5] ? 5 : -1;
        if (slot >= 0 && Math.random() < T.grab) { hang(z, slot); continue; }
      }
      animate(z, dt, moving * clamp(spd / Math.max(0.5, z.speed) + 0.2, 0, 1), st);
    }
  };
  function hang(z, slot) {
    z.state = 'hang'; z.slot = slot; Z.slots[slot] = z; z.hangT = 0; z.atkT = z.T.atk * 0.4; z.stagger = 0;
    G.audio.grab(slot < 2 ? -0.8 : slot < 4 ? 0.8 : 0);
    G.game.onGrab(slot);
  }
})();
