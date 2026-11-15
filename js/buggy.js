'use strict';
/* The buggy, the horse, the working side mirrors and the first-person hands. */
(function () {
  const { clamp, lerp, smooth, damp, Batcher } = G;
  const Bg = G.buggy = {};
  const PI = Math.PI;
  const EYE = new THREE.Vector3(0, 1.82, 0.15);
  Bg.EYE = EYE;
  Bg.HORSE_Z = -2.85;
  // hang-on points (model space; forward is -z): door L, rear-side L, door R, rear-side R, back L, back R
  const SLOTS = Bg.SLOTS = [[-1.0, -0.35, -PI / 2], [-1.0, 0.75, -PI / 2], [1.0, -0.35, PI / 2], [1.0, 0.75, PI / 2], [-0.45, 1.38, 0], [0.45, 1.38, 0]];

  let scene, camera, group, body, horse, hBody, neck, head, tail = [], legs = [], wheels = [];
  let matCab, matHorse, reins = [], driverHead, lantern, cabLight, lampGlow = [];
  let armorMeshes = [], bladeMeshes = [], speedMeshes = [];
  const mirrors = [];
  let phase = 0, bobV = 0, bobY = 0, rollV = 0, roll = 0;
  Bg.rear = 0; Bg.jolt = 0;

  function part(build, mat, jitter) { const B = new Batcher(); B.jitter = jitter === undefined ? 0.04 : jitter; build(B); const m = new THREE.Mesh(B.geometry(), mat); m.castShadow = true; m.receiveShadow = true; if (B.onHorse) m.userData.onHorse = true; return m; }

  function wheelGeo(r) {
    const B = new Batcher(); B.jitter = 0.03;
    const N = 26, seg = 2 * PI * r / N * 1.08, wood = 0xcfc7b2;
    for (let i = 0; i < N; i++) { const a = i / N * 2 * PI; B.box(0, Math.cos(a) * r, Math.sin(a) * r, 0.05, 0.04, seg, wood, 0, a); B.box(0, Math.cos(a) * (r + 0.024), Math.sin(a) * (r + 0.024), 0.04, 0.012, seg * 1.04, 0x4a4d52, 0, a); }
    for (let i = 0; i < 14; i++) { const a = i / 14 * 2 * PI; B.box(0, Math.cos(a) * r / 2, Math.sin(a) * r / 2, 0.026, r, 0.032, wood, 0, a); }
    B.cyl(0, 0, 0, 0.075, 0.075, 0.17, 0x55585e, 10, 0, 0, PI / 2);
    return B.geometry();
  }

  function buildCabin() {
    const blk = 0x1b1b1f, trim = 0x2a2a30;
    const cab = part(B => {
      B.box(0, 0.74, 0, 1.5, 0.08, 2.2, blk);                                   // floor
      B.box(0, 0.79, -0.2, 1.36, 0.02, 1.5, 0x2c6a6a);                          // teal carpet
      B.box(0, 0.56, -0.92, 1.9, 0.06, 0.06, 0x2a2a2e); B.box(0, 0.6, 0.92, 1.96, 0.06, 0.06, 0x2a2a2e);   // axles
      for (const z of [-0.92, 0.92]) for (const x of [-0.5, 0.5]) { B.box(x, 0.65, z, 0.05, 0.03, 0.7, 0x2a2a2e); B.box(x, 0.69, z, 0.05, 0.03, 0.5, 0x2a2a2e); }
      // dash
      B.box(0, 1.05, -1.03, 1.44, 0.58, 0.06, blk);
      B.box(0, 1.3, -0.9, 1.3, 0.17, 0.26, 0x18181b);
      B.box(0, 1.3, -0.768, 0.92, 0.12, 0.012, 0x24242a);
      B.box(0, 1.395, -0.99, 1.5, 0.04, 0.14, trim);
      for (let i = 0; i < 5; i++) { B.box(-0.34 + i * 0.1, 1.3, -0.755, 0.022, 0.022, 0.02, 0xb8bcc2); B.box(-0.34 + i * 0.1, 1.312, -0.745, 0.01, 0.03, 0.012, 0xd8dce2, 0, 0.5); }
      B.cyl(0.2, 1.3, -0.75, 0.016, 0.016, 0.03, 0xe8b820, 8, 0, PI / 2); B.cyl(0.29, 1.3, -0.75, 0.016, 0.016, 0.03, 0xe8b820, 8, 0, PI / 2);
      B.cyl(0.39, 1.3, -0.757, 0.012, 0.012, 0.012, 0xc81e1e, 8, 0, PI / 2); B.cyl(-0.42, 1.3, -0.757, 0.012, 0.012, 0.012, 0x2aa84a, 8, 0, PI / 2);
      B.cyl(0, 1.335, -0.76, 0.03, 0.03, 0.012, 0xc8a850, 12, 0, PI / 2); B.cyl(0, 1.335, -0.752, 0.024, 0.024, 0.006, 0xf0ead8, 12, 0, PI / 2);  // brass battery gauge
      // frame
      for (const s of [-1, 1]) {
        B.box(s * 0.72, 1.86, -1.04, 0.06, 0.95, 0.07, blk);                    // windshield posts
        B.box(s * 0.72, 1.55, 0.5, 0.06, 1.56, 0.06, blk); B.box(s * 0.72, 1.55, 1.04, 0.06, 1.56, 0.06, blk);
        B.box(s * 0.74, 1.02, -0.24, 0.03, 0.5, 1.5, blk); B.box(s * 0.74, 1.28, -0.24, 0.045, 0.04, 1.5, trim);     // door panels
        B.box(s * 0.74, 1.55, 0.78, 0.03, 1.56, 0.56, blk);
        B.box(s * 0.72, 2.3, -0.27, 0.06, 0.08, 1.6, blk);
        B.box(s * 0.86, 0.58, -0.3, 0.22, 0.03, 0.26, 0x2a2a2e); B.box(s * 0.8, 0.66, -0.3, 0.03, 0.16, 0.04, 0x2a2a2e);   // step
        B.box(s * 0.55, 1.78, 1.05, 0.36, 0.46, 0.03, blk);
        // side lamps (amber forward, red rearward) and brass lantern
        B.cyl(s * 0.86, 1.32, -1.0, 0.065, 0.065, 0.1, 0x202024, 10, 0, PI / 2);
        B.cyl(s * 0.86, 1.32, -1.055, 0.055, 0.055, 0.012, 0xf0a020, 10, 0, PI / 2); B.cyl(s * 0.86, 1.32, -0.945, 0.055, 0.055, 0.012, 0xd01818, 10, 0, PI / 2);
        B.box(s * 0.8, 1.32, -1.0, 0.1, 0.02, 0.02, 0x202024);
        B.box(s * 0.82, 1.62, -1.1, 0.09, 0.16, 0.09, 0xb89a48); B.box(s * 0.82, 1.62, -1.1, 0.075, 0.11, 0.1, 0xfff0c0); B.cylb(s * 0.82, 1.7, -1.1, 0.02, 0.06, 0.05, 0xb89a48, 6);
        // mirror arm + housing
        B.beam(s * 0.75, 1.9, -1.04, s * 1.0, 1.9, -1.03, 0.02, 0.02, 0x202024); B.beam(s * 0.75, 1.72, -1.04, s * 1.0, 1.84, -1.03, 0.015, 0.015, 0x202024);
        B.box(s * 1.025, 1.86, -1.035, 0.38, 0.28, 0.03, 0x101012, -s * 0.287);
        // leaf springs
        for (const z of [-0.92, 0.92]) B.box(s * 0.5, 0.61, z, 0.04, 0.02, 0.6, 0x3a3a3e);
      }
      B.box(0, 2.3, -1.04, 1.5, 0.1, 0.08, blk);
      B.cyl(0, 2.22, -0.99, 0.055, 0.055, 1.38, 0x2c2c30, 8, 0, 0, PI / 2);       // rolled storm curtain
      for (const x of [-0.5, 0, 0.5]) B.box(x, 2.22, -0.99, 0.03, 0.13, 0.13, 0x4a3422);
      B.box(0, 2.365, -0.06, 1.58, 0.05, 2.5, 0x3a3c40);                         // roof
      B.box(0, 2.335, 0, 1.42, 0.012, 2.06, 0x7c7c78);                           // headliner
      B.box(0, 1.16, 1.05, 1.44, 0.78, 0.03, blk); B.box(0, 2.16, 1.05, 1.44, 0.3, 0.03, blk);   // back wall around the window
      B.box(0, 2.3, 1.04, 1.5, 0.08, 0.06, blk);
      B.box(0, 1.12, 0.52, 1.32, 0.12, 0.5, 0x3a2e28); B.box(0, 1.5, 0.84, 1.32, 0.62, 0.08, 0x3a2e28);       // bench
      // rear: slow-moving-vehicle triangle, reflectors
      B.prism(0, 1.02, 1.08, 0.56, 0.48, 0.02, 0xc81e1e, 0); B.prism(0, 1.07, 1.09, 0.4, 0.34, 0.02, 0xf07a14, 0);
      for (const s of [-1, 1]) { B.cyl(s * 0.58, 0.95, 1.07, 0.05, 0.05, 0.02, 0xd01818, 8, 0, PI / 2); B.box(s * 0.66, 1.5, 1.07, 0.04, 0.5, 0.01, 0xd8d8d8); }
      // shafts & singletree
      B.box(0, 0.76, -1.22, 0.95, 0.05, 0.05, 0x2a2a2e);
      for (const s of [-1, 1]) { B.beam(s * 0.42, 0.76, -1.08, s * 0.5, 1.08, -3.78, 0.05, 0.05, 0x1c1c1f); B.beam(s * 0.42, 0.76, -1.08, s * 0.3, 0.6, -0.92, 0.04, 0.04, 0x1c1c1f); }
    }, matCab, 0.05);
    body.add(cab);
  }

  function buildDriver() {
    const coat = 0x15151a, shirt = 0x3a5a8a, skin = 0xc79a78;
    const d = part(B => {
      B.box(0, 1.47, 0.46, 0.44, 0.58, 0.24, coat);                              // torso
      B.box(0, 1.5, 0.34, 0.3, 0.46, 0.02, shirt);
      for (const s of [-1, 1]) {
        B.box(s * 0.12, 1.2, 0.18, 0.16, 0.15, 0.52, 0x1a1a20);                   // thighs
        B.box(s * 0.12, 0.98, -0.08, 0.13, 0.42, 0.14, 0x1a1a20);                 // shins
        B.box(s * 0.12, 0.82, -0.16, 0.12, 0.08, 0.26, 0x0c0c0e);                 // boots
        B.box(s * 0.19, 1.63, 0.24, 0.02, 0.3, 0.03, 0x0c0c0e);                   // suspenders
      }
      B.beam(-0.25, 1.62, 0.4, -0.2, 1.4, -0.08, 0.1, 0.1, shirt); B.beam(-0.2, 1.4, -0.08, -0.07, 1.37, -0.46, 0.085, 0.085, shirt);
      B.box(-0.065, 1.37, -0.5, 0.075, 0.06, 0.1, skin);
    }, G.matBatch, 0.03);
    body.add(d);
    driverHead = part(B => {
      B.box(0, 1.9, 0.44, 0.2, 0.24, 0.22, skin);
      B.box(0, 1.8, 0.37, 0.21, 0.14, 0.1, 0x6a5a48); B.box(0, 1.76, 0.44, 0.22, 0.1, 0.2, 0x6a5a48);     // chin-curtain beard, no moustache
      B.cyl(0, 2.03, 0.44, 0.3, 0.3, 0.02, 0xd8c078, 14); B.cyl(0, 2.09, 0.44, 0.13, 0.14, 0.11, 0xd8c078, 12); B.cyl(0, 2.055, 0.44, 0.145, 0.145, 0.03, 0x15151a, 12);
    }, G.matBatch, 0.03);
    body.add(driverHead);
  }

  function buildHorse() {
    const coat = 0x4f2e1c, coat2 = 0x6a3e24, blackp = 0x120e0b, hair = 0x0c0a08, hoof = 0x2a2622;
    horse = new THREE.Group(); horse.position.z = Bg.HORSE_Z; horse.scale.setScalar(1.07); group.add(horse);
    hBody = new THREE.Group(); horse.add(hBody);
    hBody.add(part(B => {
      B.sph(0, 1.3, 0, 0.33, 0.37, 0.8, coat, coat2);
      B.sph(0, 1.34, 0.52, 0.375, 0.41, 0.45, coat, coat2);
      B.sph(0, 1.3, -0.56, 0.33, 0.41, 0.38, coat, coat2);
      B.sph(0, 1.48, -0.5, 0.2, 0.2, 0.3, coat2);                                 // withers
    }, matHorse, 0.02));
    // harness (as in the reference footage: dark leather, russet breeching)
    hBody.add(part(B => {
      const lea = 0x16110d, rus = 0x8a4634, brass = 0xc8a850;
      const ring = (z, ry_, rz_, col, w, n0, n1, cy, tilt) => { for (let i = n0; i < n1; i++) { const a = i / 24 * 2 * PI; B.box(Math.sin(a) * ry_, (cy || 1.3) + Math.cos(a) * rz_, z + (tilt || 0) * Math.cos(a), 0.035, 0.02, w, col, 0, 0, -a); } };
      for (let i = 0; i < 24; i++) { const a = i / 24 * 2 * PI; B.box(Math.sin(a) * 0.35, 1.3 + Math.cos(a) * 0.39, -0.3, 0.1, 0.02, 0.07, lea, 0, 0, -a); }       // girth + saddle
      B.box(0, 1.7, -0.3, 0.3, 0.05, 0.18, lea); for (const s of [-1, 1]) B.cylb(s * 0.1, 1.72, -0.3, 0.012, 0.012, 0.07, brass, 6);
      for (let i = 0; i < 24; i++) { const a = i / 24 * 2 * PI; B.box(Math.sin(a) * 0.31, 1.36 + Math.cos(a) * 0.4, -0.78 - Math.cos(a) * 0.14, 0.11, 0.05, 0.1, lea, 0, 0.3, -a); }   // collar
      for (const s of [-1, 1]) { B.box(s * 0.3, 1.5, -0.8, 0.03, 0.5, 0.03, brass, 0, 0.3, s * 0.1); B.cylb(s * 0.2, 1.74, -0.9, 0.016, 0.016, 0.05, brass, 6); }
      B.box(0, 1.705, 0.2, 0.05, 0.02, 1.0, lea);                                // back strap
      B.box(0, 1.73, 0.62, 0.05, 0.02, 0.3, lea, 0, -0.25);
      for (let i = 4; i <= 20; i++) { const a = i / 24 * 2 * PI; if (i > 8 && i < 16) continue; B.box(Math.sin(a) * 0.39, 1.34 + Math.cos(a) * 0.42, 0.5, 0.06, 0.02, 0.045, lea, 0, 0, -a); }   // hip strap
      for (let i = -6; i <= 6; i++) { const a = i / 12 * PI * 0.5; B.box(Math.sin(a) * 0.4, 1.1, 0.56 + Math.cos(a) * 0.44, 0.1, 0.11, 0.03, rus, a); }     // breeching round the quarters
      for (const s of [-1, 1]) { B.box(s * 0.385, 1.1, 0.2, 0.02, 0.05, 0.8, rus); B.box(s * 0.36, 1.22, -0.1, 0.02, 0.045, 1.4, lea); B.box(s * 0.4, 1.02, 0.42, 0.02, 0.04, 2.3, lea); }   // traces
    }, G.matBatch, 0.05));

    neck = new THREE.Group(); neck.position.set(0, 1.5, -0.74); neck.rotation.x = -0.72; hBody.add(neck);
    neck.add(part(B => {
      B.cyl(0, 0.42, 0, 0.15, 0.27, 0.92, coat, 9, 0, 0, 0, coat2);
      B.box(0, 0.44, 0.19, 0.045, 0.84, 0.17, hair);
      for (let i = 0; i < 9; i++) B.box((i % 2 ? 0.045 : -0.045), 0.1 + i * 0.09, 0.18, 0.05, 0.13, 0.19, hair, 0, 0, (i % 2 ? -0.5 : 0.5));
    }, matHorse, 0.02));
    head = new THREE.Group(); head.position.set(0, 0.86, 0.02); head.rotation.x = -1.18; neck.add(head);
    head.add(part(B => {
      B.cyl(0, 0.27, 0, 0.085, 0.15, 0.56, coat, 8, 0, 0, 0, blackp);
      B.box(0, 0.55, 0, 0.14, 0.1, 0.13, 0x1a1512);                               // muzzle
      B.box(0, 0.06, 0.13, 0.08, 0.2, 0.06, hair, 0, -0.3);                        // forelock
      for (const s of [-1, 1]) {
        B.cyl(s * 0.075, 0.0, 0.14, 0.0, 0.045, 0.15, coat, 5, 0, PI / 2, s * 0.25);   // ears
        B.box(s * 0.118, 0.19, 0.03, 0.02, 0.05, 0.04, 0x050505);                   // eye
        B.box(s * 0.14, 0.19, 0.055, 0.015, 0.13, 0.12, 0x100c0a);                  // blinder
        B.box(s * 0.125, 0.3, 0, 0.012, 0.44, 0.03, 0x16110d);                      // cheek strap
        B.cyl(s * 0.1, 0.49, 0, 0.022, 0.022, 0.012, 0xc8a850, 8, 0, 0, PI / 2);    // bit ring
      }
      B.box(0, 0.12, 0.09, 0.27, 0.03, 0.02, 0x16110d); B.box(0, 0.4, 0.07, 0.2, 0.03, 0.02, 0x16110d);
    }, matHorse, 0.02));
    // tail — heavy and black, the thing you stare at for ten minutes
    let parent = hBody; let ty = 1.62, tz = 0.9;
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group(); g.position.set(0, i === 0 ? ty : -0.23, i === 0 ? tz : 0); parent.add(g);
      const r0 = [0.06, 0.1, 0.12, 0.12, 0.1, 0.06][i], r1 = [0.1, 0.12, 0.12, 0.1, 0.06, 0.015][i];
      g.add(part(B => { B.cyl(0, -0.115, 0, r0, r1, 0.25, hair, 7); B.cyl(0.03, -0.12, 0.02, r0 * 0.7, r1 * 0.7, 0.26, 0x18130f, 5); B.cyl(-0.035, -0.12, -0.015, r0 * 0.6, r1 * 0.7, 0.26, 0x050404, 5); }, matHorse, 0.03));
      tail.push(g); parent = g;
    }
    // legs
    const LP = [[-0.2, 1.1, -0.55, 0.5, 1], [0.2, 1.1, -0.55, 0.5, 1], [-0.22, 1.15, 0.55, 0.55, 0], [0.22, 1.15, 0.55, 0.55, 0]];
    for (const [x, y, z, ul, front] of LP) {
      const up = new THREE.Group(); up.position.set(x, y, z); hBody.add(up);
      up.add(part(B => { B.cyl(0, -ul / 2, 0, 0.075, front ? 0.11 : 0.15, ul, coat, 7, 0, 0, 0, coat2); if (!front) B.sph(0, -0.08, 0.02, 0.14, 0.2, 0.2, coat); }, matHorse, 0.02));
      const lo = new THREE.Group(); lo.position.y = -ul; up.add(lo);
      lo.add(part(B => { B.cyl(0, -0.24, 0, 0.05, 0.07, 0.48, blackp, 7); B.cyl(0, -0.45, 0, 0.06, 0.05, 0.08, blackp, 7); B.cyl(0, -0.54, -0.01, 0.085, 0.07, 0.11, hoof, 8); B.cyl(0, -0.595, -0.01, 0.088, 0.088, 0.015, 0x8a8d92, 8); }, matHorse, 0.02));
      legs.push({ up, lo, front, wasFwd: false, hoof: new THREE.Vector3() });
    }
  }

  function buildUpgrades() {
    const steel = 0x6c7076, rust = 0x7a4a34, bright = 0xc4c8ce;
    const A = [
      B => { for (const s of [-1, 1]) { B.box(s * 0.77, 1.02, -0.24, 0.02, 0.46, 1.3, steel, 0, 0, s * 0.02); B.box(s * 0.782, 1.0, -0.5, 0.012, 0.3, 0.3, rust); for (const z of [-0.8, 0.3]) for (const y of [0.85, 1.2]) B.cyl(s * 0.785, y, z, 0.018, 0.018, 0.012, bright, 6, 0, 0, PI / 2); } },
      B => { B.box(0, 1.16, 1.085, 1.3, 0.7, 0.02, steel); B.box(0.2, 1.1, 1.098, 0.5, 0.3, 0.012, rust, 0, 0, 0.1); for (const s of [-1, 1]) B.box(s * 0.77, 1.5, 0.78, 0.02, 1.2, 0.5, steel); },
      B => { B.onHorse = 1; B.box(0, 1.22, -0.93, 0.6, 0.5, 0.03, steel, 0, 0.25); B.box(0, 1.25, -0.955, 0.3, 0.26, 0.02, rust, 0, 0.25); for (const s of [-1, 1]) B.box(s * 0.37, 1.25, -0.5, 0.025, 0.45, 0.7, steel, s * 0.12); },
      B => { for (const s of [-1, 1]) for (const z of [-0.92, 0.92]) { B.box(s * 1.0, 1.22, z, 0.03, 0.05, 1.1, steel); B.box(s * 1.0, 1.0, z - 0.52, 0.03, 0.46, 0.05, steel, 0, 0.5); B.box(s * 1.0, 1.0, z + 0.52, 0.03, 0.46, 0.05, steel, 0, -0.5); } B.box(0, 2.41, 0, 1.3, 0.02, 2.0, steel); },
      B => { B.onHorse = 1; for (const s of [-1, 1]) B.box(s * 0.41, 1.32, 0.5, 0.025, 0.5, 0.75, steel, -s * 0.08); B.box(0, 1.74, 0.45, 0.5, 0.025, 0.7, steel); for (let i = 0; i < 4; i++) B.cylb(0, 1.75, 0.2 + i * 0.17, 0, 0.03, 0.12, bright, 4); }
    ];
    for (const f of A) { const m = part(f, G.matBatch, 0.08); m.visible = false; (m.userData.onHorse ? hBody : body).add(m); armorMeshes.push(m); }
    const Bl = [
      B => { for (const s of [-1, 1]) for (let i = 0; i < 5; i++) B.cyl(s * 0.84, 0.95, -0.85 + i * 0.32, 0, 0.03, 0.26, bright, 4, 0, 0, -s * PI / 2); },
      null,
      B => { for (const s of [-1, 1]) { B.box(s * 0.98, 0.8, -0.24, 0.5, 0.012, 0.09, bright, s * 0.25); B.box(s * 0.98, 0.8, 0.5, 0.5, 0.012, 0.09, bright, -s * 0.2); } },
      B => { for (let i = 0; i < 6; i++) B.cyl(-0.5 + i * 0.2, 0.9, 1.16, 0, 0.03, 0.26, bright, 4, 0, -PI / 2); },
      B => { B.onHorse = 1; for (const s of [-1, 1]) { B.beam(s * 0.47, 1.04, -0.85, s * 0.2, 0.7, -1.45, 0.04, 0.04, steel); for (let i = 0; i < 3; i++) B.cyl(s * (0.44 - i * 0.1), 0.98 - i * 0.12, -1.0 - i * 0.2, 0, 0.022, 0.3, bright, 4, 0, -PI / 2 - 0.2); } B.box(0, 0.7, -1.45, 0.5, 0.05, 0.05, steel); }
    ];
    for (const f of Bl) { if (!f) { bladeMeshes.push(null); continue; } const m = part(f, G.matBatch, 0.05); m.visible = false; (m.userData.onHorse ? hBody : body).add(m); bladeMeshes.push(m); }
  }

  /* ------------------------------------------------------------------ first-person hands & weapons */
  const VM = Bg.vm = { kind: 'whip', t: 1, dur: 0.4, kick: 0, target: new THREE.Vector3(), hasTarget: false };
  let vm, vmPivot, vmWeapons = {}, thong, thongPos, muzzle, muzzleLight;
  const TH = 22;
  const REST = {
    whip: [0.3, -0.26, -0.52, 0.55, -0.25, 0.1], knife: [0.27, -0.24, -0.5, 0.5, 0.25, 0.25], shovel: [0.3, -0.34, -0.42, 0.75, 0.3, 0.1],
    pitchfork: [0.28, -0.36, -0.4, 0.62, 0.22, 0.05], revolver: [0.2, -0.2, -0.52, 0.04, 0.06, 0], shotgun: [0.19, -0.22, -0.42, 0.03, 0.08, 0]
  };
  function buildVM() {
    vm = new THREE.Group(); camera.add(vm);
    vmPivot = new THREE.Group(); vm.add(vmPivot);
    const arm = part(B => {
      B.box(0, -0.012, 0.03, 0.075, 0.06, 0.1, 0xc79a78); B.box(0.0, -0.02, -0.01, 0.08, 0.035, 0.05, 0xb88a68);
      B.box(0.03, -0.07, 0.3, 0.1, 0.1, 0.46, 0x3a5a8a, -0.12, 0.2); B.box(0.008, -0.03, 0.09, 0.105, 0.085, 0.05, 0x34507a);
    }, G.matBatch, 0.02);
    vmPivot.add(arm);
    for (const k of ['whip', 'knife', 'shovel', 'pitchfork', 'revolver', 'shotgun']) {
      const m = part(B => G.models.weapon(B, k), G.matBatch, 0.03); m.visible = false; vmPivot.add(m); vmWeapons[k] = m;
    }
    // whip thong: camera-facing ribbon rebuilt every frame
    thongPos = new Float32Array(TH * 2 * 3);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(thongPos, 3));
    const nor = new Float32Array(TH * 2 * 3); for (let i = 0; i < TH * 2; i++) nor[i * 3 + 2] = 1; tg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const idx = []; for (let i = 0; i < TH - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } tg.setIndex(idx);
    thong = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ color: 0x2a1a10, side: THREE.DoubleSide })); thong.frustumCulled = false; vm.add(thong);
    muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex('rgba(255,250,220,1)', 'rgba(255,170,60,0.6)'), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false }));
    muzzle.visible = false; vm.add(muzzle);
    muzzleLight = new THREE.PointLight(0xffc878, 0, 30, 1.5); camera.add(muzzleLight);
    vm.traverse(o => { o.layers.set(1); o.castShadow = false; });
    VM.set('whip');
  }
  VM.set = function (kind) { VM.kind = kind; for (const k in vmWeapons) vmWeapons[k].visible = k === kind; thong.visible = kind === 'whip'; VM.t = 1; VM.swap = 0.25; };
  /* start an attack animation; targetWorld may be null */
  VM.attack = function (kind, targetWorld, dur) {
    VM.t = 0; VM.dur = dur;
    VM.hasTarget = !!targetWorld; if (targetWorld) VM.target.copy(targetWorld);
    if (kind === 'revolver' || kind === 'shotgun') { VM.kick = kind === 'shotgun' ? 1.6 : 1; VM.flash = 0.06; muzzleLight.intensity = kind === 'shotgun' ? 5 : 3; }
  };
  const _h = new THREE.Vector3(), _c1 = new THREE.Vector3(), _e = new THREE.Vector3(), _p = new THREE.Vector3(), _pp = new THREE.Vector3(), _tan = new THREE.Vector3(), _perp = new THREE.Vector3(), _tl = new THREE.Vector3(), _rest = new THREE.Vector3();
  VM.update = function (dt, time, speed, lookYawVel) {
    const k = VM.kind, r = REST[k];
    if (VM.t < 1) VM.t = Math.min(1, VM.t + dt / VM.dur);
    VM.swap = Math.max(0, (VM.swap || 0) - dt);
    VM.kick = Math.max(0, VM.kick - dt * 7);
    const t = VM.t, sw = Math.sin(PI * t), bobA = 0.004 + speed * 0.0009;
    let px = r[0] + Math.sin(time * 5.1) * bobA, py = r[1] + Math.sin(time * 10.2) * bobA - VM.swap * 0.9, pz = r[2], rx = r[3], ry = r[4], rz = r[5];
    if (t < 1) {
      if (k === 'knife') { pz -= sw * 0.32; px -= sw * 0.16; rx -= sw * 0.5; ry += sw * 0.9; }
      else if (k === 'shovel') { const e = smooth(0.1, 0.7, t); ry += lerp(1.0, -1.3, e) * (t < 0.85 ? 1 : (1 - t) / 0.15); rx -= sw * 0.5; px -= sw * 0.2; pz -= sw * 0.25; py += sw * 0.1; }
      else if (k === 'pitchfork') { pz -= Math.sin(PI * Math.pow(t, 0.6)) * 0.6; rx -= sw * 0.55; py += sw * 0.12; px -= sw * 0.12; }
      else if (k === 'whip') { const w = t < 0.3 ? smooth(0, 0.3, t) : 1 - smooth(0.3, 0.55, t) * 1.7 + smooth(0.6, 1, t) * 0.7; rx += w * 0.9; py += w * 0.1; pz -= (t > 0.3 && t < 0.7 ? 0.14 : 0); }
    }
    rx += VM.kick * 0.26; pz += VM.kick * 0.07; py += VM.kick * 0.02;
    vmPivot.position.set(px, py, pz); vmPivot.rotation.set(rx, ry, rz, 'YXZ');
    if (VM.flash > 0) {
      VM.flash -= dt; muzzle.visible = true;
      _p.set(0, 0.012, k === 'shotgun' ? -0.78 : -0.27); vmPivot.localToWorld(_p); vm.worldToLocal(_p); muzzle.position.copy(_p);
      muzzle.scale.setScalar(k === 'shotgun' ? 0.75 : 0.45); muzzle.material.rotation = Math.random() * 6;
    } else muzzle.visible = false;
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 50);
    if (k !== 'whip') return;
    // --- thong
    vmPivot.updateMatrix();
    _h.set(0, 0, -0.14).applyMatrix4(vmPivot.matrix);                 // handle tip in camera space
    _rest.set(_h.x + 0.05 + Math.sin(time * 2.3) * 0.03 - lookYawVel * 0.06, _h.y - 0.75, _h.z - 0.18 + Math.sin(time * 1.7) * 0.03);
    _e.copy(_rest);
    _c1.set(_h.x + 0.02, _h.y + 0.1, _h.z - 0.3);
    if (t < 1) {
      if (VM.hasTarget) { _tl.copy(VM.target); camera.worldToLocal(_tl); } else _tl.set(0.1, -0.1, -5.5);
      const wind = smooth(0, 0.28, t), strike = smooth(0.28, 0.5, t), back = smooth(0.58, 1, t);
      // wind-up: tip trails up and behind; strike: tip snaps out to the target; recover
      _p.set(_h.x + 0.5, _h.y + 1.0, _h.z + 0.9);
      _e.lerp(_p, wind); _e.lerp(_tl, strike); _e.lerp(_rest, back);
      _c1.set(_h.x + 0.25 * wind, _h.y + 0.9 * wind * (1 - back) + 0.1, lerp(_h.z + 0.2, (_h.z + _e.z) / 2, strike));
      _c1.y += strike * (1 - back) * (0.6 - strike * 0.45) * Math.min(3, Math.abs(_tl.z) * 0.3);
    }
    for (let i = 0; i < TH; i++) {
      const u = i / (TH - 1), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      _p.set(a * _h.x + b * _c1.x + c * _e.x, a * _h.y + b * _c1.y + c * _e.y, a * _h.z + b * _c1.z + c * _e.z);
      if (i === 0) _tan.subVectors(_c1, _h); else _tan.subVectors(_p, _pp);
      _perp.crossVectors(_tan, _p).normalize();
      const w = lerp(0.011, 0.0025, u) * (1 + Math.abs(_p.z) * 0.35);
      const o = i * 6;
      thongPos[o] = _p.x + _perp.x * w; thongPos[o + 1] = _p.y + _perp.y * w; thongPos[o + 2] = _p.z + _perp.z * w;
      thongPos[o + 3] = _p.x - _perp.x * w; thongPos[o + 4] = _p.y - _perp.y * w; thongPos[o + 5] = _p.z - _perp.z * w;
      _pp.copy(_p);
    }
    thong.geometry.attributes.position.needsUpdate = true;
  };

  /* ------------------------------------------------------------------ init */
  Bg.init = function (sc, cam) {
    scene = sc; camera = cam;
    matCab = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x555555 });
    matHorse = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 22, specular: 0x2a2018 });
    group = Bg.group = new THREE.Group(); group.rotation.order = 'YXZ'; scene.add(group);
    body = Bg.body = new THREE.Group(); group.add(body);
    buildCabin(); buildDriver(); buildHorse(); buildUpgrades();
    // wheels
    const gF = wheelGeo(0.56), gR = wheelGeo(0.6), wm = G.matBatch;
    const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10); hub.rotateZ(PI / 2);
    const scy = (() => { const B = new Batcher(); B.jitter = 0.03; B.box(0.3, 0, 0, 0.42, 0.012, 0.07, 0xc4c8ce, 0, 0.3); B.box(0.3, 0, 0, 0.42, 0.07, 0.012, 0xc4c8ce, 0, 0.3); B.cyl(0.52, 0, 0, 0, 0.03, 0.1, 0xc4c8ce, 4, 0, 0, -PI / 2); return B.geometry(); })();
    for (const [x, z, g, r] of [[-0.95, -0.92, gF, 0.56], [0.95, -0.92, gF, 0.56], [-0.98, 0.92, gR, 0.6], [0.98, 0.92, gR, 0.6]]) {
      const w = new THREE.Mesh(g, wm); w.position.set(x, r, z); w.castShadow = true; group.add(w);
      const cap = new THREE.Mesh(hub, G.mat(0xd8b040, 'phong')); cap.visible = false; w.add(cap); speedMeshes.push(cap);
      const bl = new THREE.Mesh(scy, G.matBatch); bl.rotation.y = x < 0 ? PI : 0; bl.visible = false; w.add(bl);
      wheels.push({ mesh: w, r, blade: bl });
    }
    // reins
    const rg = new THREE.CylinderGeometry(1, 1, 1, 5);
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(rg, G.mat(0x1a120c)); m.castShadow = false; group.add(m); reins.push(m); }
    // mirrors
    for (const s of [-1, 1]) {
      const rt = new THREE.WebGLRenderTarget(448, 320, { depthBuffer: true });
      const g = new THREE.PlaneGeometry(0.34, 0.24); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false, color: 0xe6ecf0 }));
      m.position.set(s * 1.02, 1.86, -1.015); m.rotation.y = -s * 0.287; body.add(m);
      const cam2 = new THREE.PerspectiveCamera(34, 448 / 320, 0.3, 420);
      cam2.position.set(s * 1.04, 1.86, -0.95); cam2.rotation.y = PI + s * 0.17; body.add(cam2);
      mirrors.push({ rt, mesh: m, cam: cam2 });
    }
    // lights
    lantern = new THREE.SpotLight(0xffd9a0, 0, 60, 0.62, 0.7, 1.2); lantern.position.set(0, 1.9, -1.2); group.add(lantern);
    lantern.target.position.set(0, 0.2, -22); group.add(lantern.target);
    cabLight = new THREE.PointLight(0xffc880, 0, 9, 1.5); cabLight.position.set(0, 1.7, -1.3); group.add(cabLight);
    for (const s of [-1, 1]) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex('rgba(255,235,190,1)', 'rgba(255,170,70,0.5)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); sp.position.set(s * 0.82, 1.62, -1.12); sp.scale.setScalar(0.01); body.add(sp); lampGlow.push(sp); }
    buildVM();
  };

  Bg.setUpgrades = function (armor, blades, speedLvl) {
    armorMeshes.forEach((m, i) => m.visible = armor > i);
    bladeMeshes.forEach((m, i) => { if (m) m.visible = blades > i; });
    for (const w of wheels) w.blade.visible = blades >= 2;
    speedMeshes.forEach(m => m.visible = speedLvl > 0);
  };
  Bg.setFirstPerson = function (fp) { driverHead.visible = !fp; vm.visible = fp; };

  const _w = new THREE.Vector3();
  Bg.slotWorld = function (i, out) { const s = SLOTS[i]; return group.localToWorld(out.set(s[0], 0, s[1])); };
  Bg.local = function (out) { return group.worldToLocal(out); };
  Bg.hoofWorld = function (i) { return legs[i].hoof; };
  Bg.headWorld = function (out) { return head.localToWorld(out.set(0, 0.3, 0)); };

  /* st: {x,y,z, yaw, pitch, speed, latVel, time, night, offroad} */
  Bg.update = function (dt, st) {
    group.position.set(st.x, st.y, st.z);
    group.rotation.set(st.pitch, st.yaw, 0);
    const sp = st.speed;
    // suspension: spring towards rest, kicked by jolts and road chatter
    const rough = st.offroad ? 1 : 0.25;
    bobV += (-bobY * 90 - bobV * 9) * dt + (Math.random() - 0.5) * sp * rough * 0.06;
    if (Bg.jolt) { bobV += Bg.jolt; rollV += (Math.random() - 0.5) * Bg.jolt * 0.6; Bg.jolt = 0; }
    bobY += bobV * dt;
    rollV += (-roll * 70 - rollV * 8 - st.latVel * 0.9) * dt + (Math.random() - 0.5) * sp * rough * 0.012; roll += rollV * dt;
    roll = clamp(roll, -0.16, 0.16); bobY = clamp(bobY, -0.12, 0.14);
    body.position.y = bobY; body.rotation.z = roll; body.rotation.x = -bobV * 0.01;
    for (const w of wheels) w.mesh.rotation.x -= sp * dt / w.r;

    // ---- horse gait
    const w = smooth(7.6, 10.6, sp), mv = smooth(0.1, 1.2, Math.abs(sp));
    const stride = lerp(lerp(1.5, 2.7, smooth(1, 6.4, sp)), 4.8, w);
    phase += dt * sp / stride * 2 * PI;
    const A = (lerp(0.14, 0.44, smooth(0, 6.4, sp)) + 0.24 * w) * mv;
    const offT = [0, PI, PI, 0], offG = [0, 0.75, 2.7, 3.45];
    Bg.strikes = 0;
    for (let i = 0; i < 4; i++) {
      const L = legs[i], a = phase + lerp(offT[i], offG[i], w), c = Math.cos(a);
      L.up.rotation.x = Math.sin(a) * A + (L.front ? 0.04 : -0.06) - Bg.rear * (L.front ? -1.2 : 0.35);
      const flex = Math.max(0, c) * (0.45 + 1.0 * mv + 0.3 * w) * mv;
      L.lo.rotation.x = L.front ? -flex * 1.25 - Bg.rear * 1.3 : flex * 0.25 - flex * 0.9;
      const fwd = c > 0;
      if (L.wasFwd && !fwd && sp > 0.4) { Bg.strikes |= (1 << i); L.lo.localToWorld(L.hoof.set(0, -0.6, 0)); }
      L.wasFwd = fwd;
    }
    const idle = 1 - mv;
    hBody.position.y = Math.sin(phase * 2) * 0.03 * mv * (1 - w) + Math.sin(phase + 0.5) * 0.075 * w + Bg.rear * 0.25;
    hBody.rotation.x = Math.sin(phase + 1.3) * 0.055 * w + Bg.rear * 0.55;
    hBody.rotation.z = Math.sin(phase) * 0.018 * mv;
    neck.rotation.x = -0.72 + Math.sin(phase * 2 + 0.6) * 0.045 * mv * (1 - w) - Math.sin(phase + 1.0) * 0.13 * w - w * 0.18 + idle * (0.08 + Math.sin(st.time * 0.7) * 0.05) - Bg.rear * 0.3;
    neck.rotation.z = Math.sin(st.time * 0.9) * 0.03 * idle - st.latVel * 0.02;
    head.rotation.x = -1.18 + w * 0.22 + Math.sin(phase * 2) * 0.03 * mv + Bg.rear * 0.5;
    const stream = clamp(sp * 0.055, 0, 0.85);
    for (let i = 0; i < tail.length; i++) {
      const tsg = tail[i];
      tsg.rotation.x = (i === 0 ? -0.55 - stream * 0.9 : i < 3 ? 0.2 - stream * 0.14 : 0.03 - stream * 0.1) + Math.sin(phase * 2 - i * 0.7) * 0.05 * mv;
      tsg.rotation.z = Math.sin(st.time * 1.9 - i * 0.6) * (0.05 + 0.1 * idle) + Math.sin(phase - i * 0.5) * 0.05 * mv - st.latVel * 0.015 * (i + 1);
    }
    Bg.rear = Math.max(0, Bg.rear - dt * 1.6);

    // ---- reins: hand -> saddle terret -> bit
    for (const s of [-1, 1]) {
      const i0 = s < 0 ? 0 : 2;
      _w.set(s * 0.1, 0.49, 0); head.localToWorld(_w); group.worldToLocal(_w);
      const tz = Bg.HORSE_Z - 0.3, ty = 1.74 + hBody.position.y, sway = Math.sin(st.time * 6 + s) * 0.006 * sp;
      const hx = s < 0 ? -0.085 : -0.045, hy = 1.385 + bobY, hz = -0.5;
      G.between(reins[i0], hx, hy, hz, s * 0.1, ty + sway, tz, 0.009);
      G.between(reins[i0 + 1], s * 0.1, ty + sway, tz, _w.x, _w.y, _w.z, 0.008);
    }
    // ---- lamps come up with the dusk
    const n = st.night;
    lantern.intensity = n * 2.3; cabLight.intensity = n * 0.55;
    for (const sp2 of lampGlow) { sp2.scale.setScalar(0.01 + n * 0.55 * (0.92 + 0.08 * Math.sin(st.time * 13))); sp2.material.opacity = n; }
  };

  let mirrorFlip = 0, mirrorTick = 0;
  Bg.renderMirrors = function (renderer, sc) {
    if (++mirrorTick % 3 === 0) return;                 // two frames in three: each mirror refreshes about 20 times a second
    const m = mirrors[mirrorFlip]; mirrorFlip ^= 1;
    renderer.setRenderTarget(m.rt); renderer.render(sc, m.cam); renderer.setRenderTarget(null);
  };
  Bg.resetAnim = function () { phase = 0; bobV = bobY = rollV = roll = 0; Bg.rear = 0; };
})();
