'use strict';
/* Sky, sun/moon, fog, time-of-day grading, lightning and rain.
   The ten-minute run plays out from a golden late afternoon to a blood-moon storm. */
(function () {
  const { clamp, lerp } = G;
  const E = G.env = {};

  // t = seconds into the run
  const KEYS = [
    { t: 0,   top: 0x2f6fc0, hor: 0xb9d3e6, fog: 0xbfd3df, sun: 0xfff0d2, sunI: 1.35, moonI: 0, hs: 0xc4d8f2, hg: 0x74704c, hi: 0.66, dens: 0.0040, stars: 0, el: 34, cl: 0xffffff, cs: 0x97a8bf, ca: 0.30, exp: 1.02 },
    { t: 140, top: 0x386cae, hor: 0xe9cf9e, fog: 0xdcc8a2, sun: 0xffd596, sunI: 1.30, moonI: 0, hs: 0xc8c8d8, hg: 0x74633f, hi: 0.60, dens: 0.0043, stars: 0, el: 17, cl: 0xfff0d6, cs: 0xa598a6, ca: 0.38, exp: 1.02 },
    { t: 255, top: 0x2c4884, hor: 0xf28d4c, fog: 0xd88c5c, sun: 0xff8436, sunI: 1.10, moonI: 0, hs: 0xa08aa8, hg: 0x5c4836, hi: 0.52, dens: 0.0052, stars: 0.05, el: 5, cl: 0xffb27c, cs: 0x6a4f70, ca: 0.48, exp: 1.04 },
    { t: 335, top: 0x1a2350, hor: 0x8c4a5e, fog: 0x5e3f5c, sun: 0xff5a2a, sunI: 0.30, moonI: 0.05, hs: 0x5a5686, hg: 0x32293c, hi: 0.50, dens: 0.0064, stars: 0.5, el: -5, cl: 0x90607c, cs: 0x2e2748, ca: 0.58, exp: 1.08 },
    { t: 410, top: 0x070b1e, hor: 0x1b2340, fog: 0x121a30, sun: 0x000000, sunI: 0.0, moonI: 0.42, hs: 0x34407a, hg: 0x161828, hi: 0.52, dens: 0.0082, stars: 1, el: -18, cl: 0x2a3050, cs: 0x0c0f1e, ca: 0.60, exp: 1.14 },
    { t: 510, top: 0x07060f, hor: 0x2c1622, fog: 0x1b101a, sun: 0x000000, sunI: 0.0, moonI: 0.44, hs: 0x44305a, hg: 0x1a1016, hi: 0.50, dens: 0.0100, stars: 0.8, el: -30, cl: 0x3a2030, cs: 0x0e0810, ca: 0.72, exp: 1.18 },
    { t: 600, top: 0x06040a, hor: 0x3c1414, fog: 0x220d0f, sun: 0x000000, sunI: 0.0, moonI: 0.46, hs: 0x54303a, hg: 0x1c0c0c, hi: 0.50, dens: 0.0112, stars: 0.6, el: -40, cl: 0x4a1c1c, cs: 0x100606, ca: 0.80, exp: 1.2 },
  ];
  const COLKEYS = ['top', 'hor', 'fog', 'sun', 'hs', 'hg', 'cl', 'cs'];
  for (const k of KEYS) for (const c of COLKEYS) k['_' + c] = new THREE.Color(k[c]);

  const cur = E.cur = { dens: 0.004, exp: 1, stars: 0, night: 0 };
  for (const c of COLKEYS) cur[c] = new THREE.Color();
  const sunDir = E.sunDir = new THREE.Vector3(), moonDir = E.moonDir = new THREE.Vector3(), lightDir = E.lightDir = new THREE.Vector3();
  const moonCol = new THREE.Color();
  let sky, hills, sun, hemi, rain, rainPos, rainVel;
  E.flash = 0; let nextBolt = 9999, boltSeq = 0;
  E.storm = 0;

  const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`;
  const SKY_FS = `
    uniform vec3 top, hor, fogc, sunDir, sunCol, moonDir, moonCol, cloudCol, cloudSh;
    uniform float time, stars, cloudAmt, flash, moonAmt;
    varying vec3 vDir;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y); }
    float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec2(17.,9.); a*=.5; } return s; }
    void main(){
      vec3 d = normalize(vDir);
      float h = max(d.y, 0.0);
      vec3 col = mix(hor, top, pow(h, 0.55));
      float sd = max(dot(d, sunDir), 0.0);
      col += sunCol * (pow(sd, 6.0)*0.22 + pow(sd, 40.0)*0.35);
      // stars
      vec3 sp = d*190.0; vec3 cell = floor(sp); vec3 fr = fract(sp)-0.5;
      float sh = hash(cell.xy + cell.z*17.3);
      float st = step(0.9955, sh) * smoothstep(0.32, 0.0, length(fr)) * (0.6 + 0.4*sin(time*2.5 + sh*90.0));
      col += vec3(0.9,0.95,1.0) * st * stars * smoothstep(0.02, 0.3, d.y) * 1.6;
      // moon
      float md = dot(d, moonDir);
      float disc = smoothstep(0.99925, 0.99955, md);
      float crater = 0.78 + 0.22*noise(d.xy*70.0 + 3.0) - 0.18*noise(d.zy*35.0);
      col = mix(col, moonCol*crater*1.5, disc*moonAmt);
      col += moonCol * (pow(max(md,0.0), 90.0)*0.5 + pow(max(md,0.0), 9.0)*0.10) * moonAmt;
      // sun disc
      col += sunCol * smoothstep(0.9990, 0.9996, sd) * 4.0;
      // clouds
      vec2 uv = d.xz/(d.y+0.14)*1.15 + time*vec2(0.007,0.0025);
      float n = fbm(uv);
      float cov = mix(0.62, 0.36, cloudAmt);
      float c = smoothstep(cov, cov+0.28, n) * smoothstep(0.0, 0.16, d.y);
      float lit = clamp((n - fbm(uv + sunDir.xz*0.22 + moonDir.xz*0.1))*2.4 + 0.55, 0.0, 1.0);
      vec3 cc = mix(cloudSh, cloudCol, lit) + sunCol*pow(sd, 5.0)*0.35*lit;
      cc += vec3(0.75,0.8,1.0)*flash*(0.5+0.5*n);
      col = mix(col, cc, c*0.92);
      col += vec3(0.5,0.55,0.75)*flash*0.25;
      col = mix(col, fogc, smoothstep(0.07, -0.015, d.y));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`;

  E.init = function (scene) {
    E.scene = scene;
    scene.fog = new THREE.FogExp2(0xbfd3df, 0.004);
    const uni = E.uni = {
      top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, fogc: { value: new THREE.Color() },
      sunDir: { value: sunDir }, sunCol: { value: new THREE.Color() }, moonDir: { value: moonDir }, moonCol: { value: moonCol },
      cloudCol: { value: new THREE.Color() }, cloudSh: { value: new THREE.Color() },
      time: { value: 0 }, stars: { value: 0 }, cloudAmt: { value: 0.5 }, flash: { value: 0 }, moonAmt: { value: 0 }
    };
    sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20),
      new THREE.ShaderMaterial({ uniforms: uni, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
    sky.renderOrder = -10; sky.frustumCulled = false;
    scene.add(sky);

    // distant ridge silhouette so the horizon never looks empty
    const seg = 120, hp = [], hidx = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, r = 760;
      const hgt = 26 + 46 * G.noise2(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5) + 16 * G.noise2(Math.cos(a) * 11, Math.sin(a) * 11) + 6 * G.noise2(Math.cos(a) * 40, Math.sin(a) * 40);
      hp.push(Math.cos(a) * r, -40, Math.sin(a) * r, Math.cos(a) * r, hgt, Math.sin(a) * r);
      if (i < seg) { const k = i * 2; hidx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); hg.setIndex(hidx);
    hills = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0x556655, fog: false, side: THREE.DoubleSide, depthWrite: false }));
    hills.renderOrder = -9; hills.frustumCulled = false;
    scene.add(hills);

    hemi = E.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemi);
    sun = E.sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 320;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
    scene.add(sun); scene.add(sun.target);

    // rain streaks (line segments wrapped in a box around the camera)
    const RN = 900; rainPos = new Float32Array(RN * 6); rainVel = new Float32Array(RN);
    for (let i = 0; i < RN; i++) {
      const x = (Math.random() - 0.5) * 36, y = Math.random() * 18 - 4, z = (Math.random() - 0.5) * 36;
      rainPos.set([x, y, z, x, y, z], i * 6); rainVel[i] = 20 + Math.random() * 10;
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab4d0, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    rain.frustumCulled = false; rain.visible = false;
    scene.add(rain);
  };

  E.update = function (dt, t, cam, renderer, realTime, indoor) {
    t = clamp(t, 0, 600);
    let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1], f = clamp((t - a.t) / (b.t - a.t), 0, 1);
    for (const c of COLKEYS) cur[c].copy(a['_' + c]).lerp(b['_' + c], f);
    const L = k => lerp(a[k], b[k], f);
    cur.dens = L('dens'); cur.exp = L('exp'); cur.stars = L('stars');
    const sunI = L('sunI'), moonI = L('moonI'), el = L('el') * Math.PI / 180, ca = L('ca');
    cur.night = clamp((t - 300) / 110, 0, 1);
    E.storm = clamp((t - 470) / 60, 0, 1);

    const az = -0.42;
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    const mel = lerp(0.2, 0.62, clamp((t - 330) / 270, 0, 1)), maz = 0.55;
    moonDir.set(Math.sin(maz) * Math.cos(mel), Math.sin(mel), -Math.cos(maz) * Math.cos(mel)).normalize();
    moonCol.setHex(0xbfd0ff).lerp(new THREE.Color(0xff5038), clamp((t - 440) / 110, 0, 1));

    // lightning
    if (t > 455) {
      nextBolt -= dt;
      if (nextBolt <= 0) { nextBolt = lerp(13, 5, E.storm) * (0.6 + Math.random() * 0.8); boltSeq = 0.55; if (G.audio) G.audio.thunder(0.4 + Math.random() * 1.6); }
    } else nextBolt = 3;
    if (boltSeq > 0) {
      boltSeq -= dt;
      const ph = 0.55 - boltSeq;
      E.flash = (ph < 0.07 ? 1 : ph < 0.14 ? 0.15 : ph < 0.2 ? 0.8 : Math.max(0, 0.6 - (ph - 0.2) * 2));
    } else E.flash = 0;

    const fogC = cur.fog;
    E.scene.fog.color.copy(fogC); E.scene.fog.density = cur.dens;
    if (E.flash > 0) E.scene.fog.color.lerp(new THREE.Color(0x8a94b8), E.flash * 0.5);
    const u = E.uni;
    u.top.value.copy(cur.top); u.hor.value.copy(cur.hor); u.fogc.value.copy(E.scene.fog.color);
    u.sunCol.value.copy(cur.sun).multiplyScalar(clamp(sunI + 0.25, 0, 1.4) * (el > -0.12 ? 1 : 0));
    u.cloudCol.value.copy(cur.cl); u.cloudSh.value.copy(cur.cs);
    u.time.value = realTime; u.stars.value = cur.stars * (1 - 0.6 * E.storm); u.cloudAmt.value = ca; u.flash.value = E.flash;
    u.moonAmt.value = clamp((t - 330) / 60, 0, 1);
    sky.position.copy(cam.position);
    hills.position.set(cam.position.x, cam.position.y * 0.5 - 6, cam.position.z);
    hills.material.color.copy(fogC).lerp(new THREE.Color(0x1e2a1c), 0.32 * (1 - cur.night * 0.6));

    hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = L('hi') + E.flash * 1.6;
    const useMoon = moonI > sunI;
    lightDir.copy(useMoon ? moonDir : sunDir);
    if (lightDir.y < 0.12) { lightDir.y = 0.12; lightDir.normalize(); }
    sun.color.copy(useMoon ? moonCol : cur.sun);
    if (useMoon) sun.color.lerp(new THREE.Color(0xffffff), 0.25);
    sun.intensity = Math.max(sunI, moonI) + E.flash * 0.8;
    renderer.toneMappingExposure = cur.exp;

    // rain
    const rainAmt = clamp((t - 490) / 40, 0, 1);
    rain.visible = rainAmt > 0.01;
    if (rain.visible) {
      rain.material.opacity = 0.34 * rainAmt;
      rain.position.copy(cam.position);
      const vx = -3.5, n = rainVel.length;
      for (let k = 0; k < n; k++) {
        const o = k * 6; let y = rainPos[o + 1] - rainVel[k] * dt, x = rainPos[o] + vx * dt;
        if (y < -5) { y += 18; x = (Math.random() - 0.5) * 36; rainPos[o + 2] = rainPos[o + 5] = (Math.random() - 0.5) * 36; }
        if (indoor && x * x + rainPos[o + 2] * rainPos[o + 2] < 2.2) x += x < 0 ? -1.6 : 1.6;   // keep the rain outside the cab
        rainPos[o] = x; rainPos[o + 1] = y;
        rainPos[o + 3] = x - vx * 0.035; rainPos[o + 4] = y + rainVel[k] * 0.035;
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    E.rainAmt = rainAmt;
  };

  /* keep the shadow frustum centred on the action */
  E.follow = function (x, y, z) {
    sun.target.position.set(x, y, z);
    sun.position.set(x + lightDir.x * 150, y + lightDir.y * 150, z + lightDir.z * 150);
    sun.target.updateMatrixWorld();
  };
  E.visibility = () => 1.55 / cur.dens;
})();
