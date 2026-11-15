'use strict';
/* ONE HORSEPOWER — main loop, driving, combat, collisions, loot, HUD, screens. */
(function () {
  const { clamp, lerp, smooth, damp } = G;
  const Game = G.game = {};
  const $ = id => document.getElementById(id);
  const PI = Math.PI;
  const W = G.world, Z = G.zombies, FX = G.fx, Bg = G.buggy, A = G.audio, R = G.road;
  const params = new URLSearchParams(location.search);

  const DIFFS = [{ hp: 0.8, dmg: 0.6, spawn: 0.8, horde: 0.9, name: 'Plain' }, { hp: 1, dmg: 1, spawn: 1, horde: 1, name: 'Ordnung' }, { hp: 1.25, dmg: 1.35, spawn: 1.25, horde: 1.06, name: 'Wrath' }];
  let diffIdx = 1;
  const WEAPONS = Game.WEAPONS = {
    whip: { name: 'Whip', dmg: 36, range: 7.6, assist: 0.16, cd: 0.5, delay: 0.17, anim: 0.42 },
    knife: { name: 'Knife', dmg: 85, range: 2.8, assist: 0.3, cd: 0.3, delay: 0.08, anim: 0.26, uses: 30 },
    shovel: { name: 'Shovel', dmg: 100, range: 3.7, assist: 0.25, cd: 0.68, delay: 0.2, anim: 0.5, uses: 22 },
    pitchfork: { name: 'Pitchfork', dmg: 155, range: 5.0, assist: 0.18, cd: 0.75, delay: 0.16, anim: 0.5, uses: 18 },
    revolver: { name: 'Revolver', dmg: 185, range: 95, assist: 0.045, cd: 0.42, delay: 0, anim: 0.25, gun: 1, ammo: 'ammo' },
    shotgun: { name: 'Shotgun', dmg: 300, range: 32, assist: 0.2, cd: 0.95, delay: 0, anim: 0.4, gun: 1, ammo: 'shells' },
    scythe: { name: 'Scythe', dmg: 140, range: 4.7, assist: 0.3, cd: 0.8, delay: 0.22, anim: 0.55, uses: 20 },
    flamethrower: { name: 'Flamethrower', label: 'Flamer', dmg: 26, range: 10, assist: 0.25, cd: 0.11, delay: 0, anim: 0.11, gun: 1, ammo: 'fuel', auto: 1 }
  };
  const ORDER = ['whip', 'knife', 'shovel', 'pitchfork', 'revolver', 'shotgun', 'scythe', 'flamethrower'];
  const GEAR_SPEED = [0, 2.7, 6.3, 9.6, 13.6];
  const ITEM_NAME = { apple: 'Apple', carrot: 'Carrot', oats: 'Sack of oats', sugar: 'Sugar cubes', hay: 'Hay', pie: 'Shoofly pie', salve: 'Horse liniment', ammo: 'Revolver rounds', shells: 'Shotgun shells', knife: 'Butcher knife', shovel: 'Shovel', pitchfork: 'Pitchfork', revolver: 'Revolver', shotgun: 'Shotgun', armor: 'Steel plate', blades: 'Scythe blades', speed: 'Lucky horseshoe', scythe: 'Scythe', flamethrower: 'Flamethrower', fuel: 'Fuel can' };
  const TABLES = {
    zombie: { apple: 20, carrot: 14, oats: 7, sugar: 6, pie: 11, salve: 7, ammo: 9, shells: 5, knife: 5, shovel: 4, pitchfork: 3, revolver: 3, shotgun: 1.5, scythe: 2.5, fuel: 2 },
    wreck: { armor: 26, blades: 22, speed: 18, ammo: 10, shells: 8, knife: 4, shovel: 5, pitchfork: 2, revolver: 3, shotgun: 2, flamethrower: 3, fuel: 7, scythe: 2 },
    debris: { apple: 12, carrot: 9, oats: 8, pie: 10, ammo: 12, shells: 8, knife: 8, shovel: 7, armor: 9, blades: 8, speed: 7, salve: 6, scythe: 4, fuel: 6, flamethrower: 1.5 },
    hay: { hay: 1 }, food: { apple: 3, carrot: 2, sugar: 2 },
    body: { ammo: 20, pie: 15, knife: 10, apple: 15, salve: 10, shells: 10, revolver: 6, sugar: 14 },
    heavy: { armor: 3, blades: 3, speed: 3 }
  };
  function roll(table) { const t = TABLES[table]; let sum = 0; for (const k in t) sum += t[k]; let r = Math.random() * sum; for (const k in t) { if (r < t[k]) return k; r -= t[k]; } }

  /* ------------------------------------------------------------------ renderer */
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 1300); camera.rotation.order = 'YXZ'; camera.layers.enable(1);
  scene.add(camera);
  G.scene = scene; G.camera = camera; G.renderer = renderer;
  function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize);

  /* ------------------------------------------------------------------ state */
  let mode = 'menu', realTime = 0, timeScale = 1, firstPerson = false, introT = 0, endShown = false, won = false;
  const look = { yaw: 0, pitch: 0, vyaw: 0 };
  let shakeAmt = 0, hurtA = 0, fov = 68, locked = false;
  const useAbs = params.has('nolock');
  const pending = [], flying = [];
  let st;
  function newState() {
    return {
      mode: 'menu', time: 0, realTime: 0, s: 22, lat: 1.75, latVel: 0, speed: 0, gear: 2, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, hx: 0, hz: 0,
      hp: 100, horseHP: 100, stamina: 100, exhausted: false, armor: 0, blades: 0, speedLvl: 0, feed: 1, pies: 0, sugarT: 0,
      uses: { knife: 0, shovel: 0, pitchfork: 0, scythe: 0 }, have: { whip: true }, ammo: 0, shells: 0, fuel: 0, cur: 'whip', atkCD: 0,
      blocked: false, trampled: 0, scraped: 0, looted: 0, offroad: false, night: 0, diff: DIFFS[diffIdx],
      crashCD: 0, sideCD: 0, knockCD: 0, scrapeSnd: 0, swerveDir: 0, swerveT: 0, feedCD: 0, said: {}, sayCD: {}, startS: 22, god: params.has('god')
    };
  }
  st = G.state = newState();

  /* ------------------------------------------------------------------ HUD plumbing */
  const el = {}; ['v-hp', 'v-horse', 'v-stam', 'b-hp', 'b-horse', 'b-stam', 'time', 'daydot', 'kills', 'horde', 'gap', 'n-feed', 'n-pie', 'sub', 'subt', 'toasts', 'w-l', 'w-r', 'w-b', 'cross', 'hint', 'speed', 'hurt', 'low', 'fade', 'flashw', 'blood'].forEach(k => el[k] = $(k));
  const gaitEls = [...$('gait').children], pipEls = { armor: [...$('u-armor').children], blades: [...$('u-blades').children], speed: [...$('u-speed').children] };
  const wslots = {};
  const hudCache = {};
  function setText(k, v) { if (hudCache[k] !== v) { hudCache[k] = v; el[k].textContent = v; } }
  function setBar(k, f) { f = Math.round(clamp(f, 0, 1) * 200) / 200; if (hudCache[k] !== f) { hudCache[k] = f; el[k].firstElementChild.style.transform = `scaleX(${f})`; } }
  function setShow(k, on, disp) { if (hudCache[k] !== on) { hudCache[k] = on; el[k].style.display = on ? (disp || 'block') : 'none'; } }

  function icon(kind) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 80; const g = c.getContext('2d');
    g.strokeStyle = g.fillStyle = '#eadfc4'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 5;
    const line = (...p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); };
    if (kind === 'whip') { g.lineWidth = 8; line(14, 62, 44, 44); g.lineWidth = 3; g.beginPath(); g.moveTo(44, 44); g.bezierCurveTo(70, 26, 96, 70, 74, 60); g.bezierCurveTo(52, 50, 96, 14, 118, 20); g.stroke(); }
    else if (kind === 'knife') { g.lineWidth = 9; line(16, 58, 44, 46); g.beginPath(); g.moveTo(46, 50); g.lineTo(112, 20); g.lineTo(104, 36); g.lineTo(52, 56); g.closePath(); g.fill(); }
    else if (kind === 'shovel') { g.lineWidth = 5; line(12, 62, 84, 30); line(8, 54, 18, 70); g.beginPath(); g.moveTo(80, 22); g.lineTo(104, 12); g.lineTo(120, 26); g.lineTo(96, 44); g.closePath(); g.fill(); }
    else if (kind === 'pitchfork') { g.lineWidth = 5; line(10, 66, 84, 32); g.lineWidth = 3; line(76, 22, 92, 44); for (let i = 0; i < 4; i++) line(77 + i * 5, 23 + i * 7, 108 + i * 4, 8 + i * 8); }
    else if (kind === 'revolver') { g.beginPath(); g.moveTo(26, 30); g.lineTo(110, 30); g.lineTo(110, 40); g.lineTo(66, 42); g.lineTo(58, 50); g.lineTo(46, 50); g.lineTo(40, 72); g.lineTo(24, 70); g.lineTo(30, 46); g.closePath(); g.fill(); g.clearRect(50, 33, 12, 7); }
    else if (kind === 'scythe') { g.lineWidth = 5; line(12, 70, 96, 14); g.lineWidth = 4; line(40, 44, 50, 56); g.beginPath(); g.moveTo(96, 14); g.quadraticCurveTo(70, 2, 30, 14); g.quadraticCurveTo(70, 12, 92, 24); g.closePath(); g.fill(); }
    else if (kind === 'flamethrower') { g.lineWidth = 7; line(14, 40, 78, 40); g.lineWidth = 11; line(22, 56, 56, 56); g.lineWidth = 4; line(30, 44, 26, 66); g.fillStyle = '#f0a030'; g.beginPath(); g.moveTo(80, 40); g.quadraticCurveTo(104, 18, 124, 36); g.quadraticCurveTo(106, 40, 122, 52); g.quadraticCurveTo(100, 62, 80, 40); g.fill(); }
    else if (kind === 'shotgun') { g.lineWidth = 4; line(34, 34, 122, 22); line(34, 40, 122, 28); g.beginPath(); g.moveTo(40, 32); g.lineTo(46, 44); g.lineTo(10, 66); g.lineTo(6, 52); g.closePath(); g.fill(); }
    return c;
  }
  function buildWeaponsHUD() {
    const host = $('weapons');
    ORDER.forEach((k, i) => {
      const d = document.createElement('div'); d.className = 'wslot';
      d.appendChild(icon(k));
      d.insertAdjacentHTML('beforeend', `<span class="k">${i + 1}</span><span class="nm">${WEAPONS[k].label || WEAPONS[k].name}</span><span class="n"></span>`);
      host.appendChild(d); wslots[k] = { d, n: d.querySelector('.n') };
    });
  }
  function refreshKit() {
    for (const k of ORDER) {
      const s = wslots[k], have = !!st.have[k];
      s.d.className = 'wslot' + (have ? ' have' : '') + (st.cur === k ? ' sel' : '');
      s.n.textContent = k === 'whip' ? '∞' : !have ? '' : WEAPONS[k].gun ? st[WEAPONS[k].ammo] : st.uses[k];
    }
    for (const [k, lvl] of [['armor', st.armor], ['blades', st.blades], ['speed', st.speedLvl]]) pipEls[k].forEach((p, i) => p.className = i < lvl ? 'on' : '');
    setText('n-feed', st.feed); setText('n-pie', st.pies);
  }
  function toast(html, cls) {
    const d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.innerHTML = html; el.toasts.appendChild(d);
    while (el.toasts.children.length > 5) el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 3200);
  }
  let hintT = 0;
  function hint(html, secs) { el.hint.innerHTML = html; el.hint.classList.add('on'); hintT = secs || 6; }

  /* Jebediah has opinions */
  const LINES = {
    start: { t: ["A fine evening for it, Dolly. Walk on."], once: 1 },
    sight: { t: ["That English fellow looks unwell. Too much television, I expect."], once: 1 },
    kill: { t: ["Forgive me. He tried to bite the horse."], once: 1 },
    horde: { t: ["Dolly's ears are back… there are a great many English behind us. And they are running."], once: 1 },
    grabL: { t: ["One's climbing on the left! Rub him off on something!", "On the left! Fence, post, anything!"], cd: 9 },
    grabR: { t: ["On the right side! Scrape him off!", "He's on the right — find a post!"], cd: 9 },
    grabB: { t: ["There's one on the back! Swerve, Dolly, swerve!", "Hanging off the back like a burr."], cd: 9 },
    scraped: { t: ["Off my buggy, friend.", "That fence was built in 1962. It will outlast you.", "Mind the paint.", "Go with God. Quickly."], cd: 7 },
    blocked: { t: ["They're at the horse! Whip them off her!", "Get away from her!"], cd: 6 },
    brute: { t: ["That one is the size of a hay wagon. Do not let Dolly meet him slowly.", "Another big one. Go round, or go fast."], cd: 30 },
    jugg: { t: ["Lord have mercy — what are they feeding these people?"], cd: 25 },
    armor: { t: ["Bolted on. Bishop Lapp need not hear of this."], once: 1 },
    blades: { t: ["Scythe blades. It is harvest season, after all."], once: 1 },
    speed: { t: ["A lucky horseshoe. I do not believe in luck. I am keeping it."], once: 1 },
    gun: { t: ["A firearm. For varmints only… these are varmints."], once: 1 },
    tired: { t: ["Easy, Dolly, easy. She's blown — find her something to eat.", "She needs a breather. Feed her."], cd: 20 },
    empty: { t: ["Nothing in this one but ghosts."], cd: 25 },
    gold: { t: ["Whatever ails the English, it is catching."], once: 1 },
    dusk: { t: ["The sun is going. I'll light the lanterns."], once: 1 },
    half: { t: ["Halfway to the Stoltzfus farm. Keep on, girl."], once: 1 },
    night: { t: ["Dark now. Watch the mirrors."], once: 1 },
    storm: { t: ["Storm coming. And the moon is the wrong colour."], once: 1 },
    mile: { t: ["One more mile. One more mile, Dolly."], once: 1 },
    bell: { t: ["I can hear the bell! They're holding the gate!"], once: 1 },
    engulf: { t: ["They are upon us! Giddy up!"], cd: 8 },
    lowhp: { t: ["The buggy will not take much more of this."], cd: 40 },
    lowhorse: { t: ["She's hurt. Keep them off her."], cd: 40 },
    pie: { t: ["Still warm. Forgive me, cousin, that is one less for the wedding."], once: 1 }
  };
  let subT = 0;
  Game.say = function (key) {
    const L = LINES[key]; if (!L || mode !== 'play') return;
    if (L.once) { if (st.said[key]) return; st.said[key] = 1; } else { if ((st.sayCD[key] || 0) > realTime) return; st.sayCD[key] = realTime + L.cd; }
    if (subT > 2.2 && !L.once) return;
    el.subt.textContent = L.t[Math.floor(Math.random() * L.t.length)]; el.sub.classList.add('on'); subT = 4.6;
  };
  const say = Game.say;

  /* ------------------------------------------------------------------ input */
  const keys = {}; let fireHeld = false;
  function onKey(code) {
    if (code === 'KeyM') { A.setMuted(!A.muted); toast(A.muted ? 'Sound off' : 'Sound on'); }
    if (mode === 'intro' && (code === 'Space' || code === 'Enter')) { introT = 99; return; }
    if (code === 'KeyP' || (code === 'Escape' && (useAbs || !locked))) { if (mode === 'play') pause(); else if (mode === 'pause') resume(); return; }
    if (mode !== 'play') return;
    if (code === 'KeyW' || code === 'ArrowUp') { if (st.exhausted && st.gear >= 2) say('tired'); else st.gear = Math.min(4, st.gear + 1); }
    else if (code === 'KeyS' || code === 'ArrowDown') {
      // slowing down past a standstill puts her in reverse, but only once she has actually stopped
      if (st.gear > 0) st.gear--; else if (st.gear === 0 && st.speed < 2.5) st.gear = -1;
    }
    else if (code === 'Space') st.gear = 0;
    else if (code === 'KeyE') feed();
    else if (code === 'KeyQ') eatPie();
    else if (code === 'KeyV') setFirstPerson(!firstPerson);
    else if (code === 'KeyX' || code === 'KeyC') { look.yaw = 0; look.pitch = 0; }
    else if (code === 'KeyF') attack(st.cur);
    else if (code.startsWith('Digit') || code.startsWith('Numpad')) {
      // a weapon's number draws it; pressing it again (or 1 for the whip, which is always in hand) uses it
      const k = ORDER[+code.slice(code.startsWith('Digit') ? 5 : 6) - 1];
      if (!k) return;
      if (!st.have[k]) { toast(`No ${WEAPONS[k].name.toLowerCase()} yet`, 'bad'); return; }
      if (k === st.cur || k === 'whip') attack(k); else select(k);
    }
  }
  window.addEventListener('keydown', e => { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault(); if (e.repeat) return; keys[e.code] = true; onKey(e.code); });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  document.addEventListener('mousemove', e => {
    if (mode !== 'play') return;
    if (locked) { look.yaw -= e.movementX * 0.0023; look.pitch -= e.movementY * 0.0021; look.vyaw = -e.movementX * 0.02; }
    else if ((useAbs || lockFails > 0) && !params.has('fix')) { look.yaw = -(e.clientX / window.innerWidth - 0.5) * 2.6; look.pitch = -(e.clientY / window.innerHeight - 0.5) * 1.3; }
    look.yaw = clamp(look.yaw, -2.95, 2.95); look.pitch = clamp(look.pitch, -1.0, 0.9);
  });
  canvas.addEventListener('mousedown', e => {
    if (mode !== 'play') return;
    if (!locked && !useAbs) lock();   // try to capture the mouse, but never swallow the click
    if (e.button === 0) { fireHeld = true; attack(st.cur); } else if (e.button === 2) attack('whip');
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) fireHeld = false; });
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('wheel', e => { if (mode !== 'play') return; const have = ORDER.filter(k => st.have[k]); let i = have.indexOf(st.cur); i = (i + (e.deltaY > 0 ? 1 : -1) + have.length) % have.length; select(have[i]); }, { passive: true });
  // if the browser refuses to capture the mouse, fall back to aiming with the cursor position
  let lockFails = 0;
  function lock() { if (useAbs) return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { lockFails++; }); } catch (e) { lockFails++; } }
  document.addEventListener('pointerlockerror', () => { lockFails++; });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && mode === 'play' && !useAbs) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && !params.has('nopause')) pause(); });

  function select(k) { if (!st.have[k] || st.cur === k) return; st.cur = k; Bg.vm.set(k); refreshKit(); }
  function setFirstPerson(fp) {
    firstPerson = fp; Bg.setFirstPerson(fp);
    if (fp) { Bg.body.add(camera); } else { scene.add(camera); }
  }

  /* ------------------------------------------------------------------ consumables & loot */
  function feed(auto) {
    if (st.feed <= 0) { if (!auto) toast('The feed bag is empty', 'bad'); return; }
    if (st.stamina > 96 && st.horseHP > 96) return;
    if (st.feedCD > 0) return;
    st.feed--; st.feedCD = 0.8; st.stamina = Math.min(100, st.stamina + 32); st.horseHP = Math.min(100, st.horseHP + 5);
    if (st.stamina > 22) st.exhausted = false;
    A.eat(); toast('Dolly eats <b>+32 stamina</b>'); refreshKit();
  }
  function eatPie() {
    if (st.pies <= 0) { toast('No pie left', 'bad'); return; }
    if (st.hp > 97) return;
    st.pies--; st.hp = Math.min(100, st.hp + 30); A.eat(); toast('Shoofly pie <b>+30 buggy</b>'); say('pie'); refreshKit();
  }
  Game.collect = function (kind) {
    if (mode === 'menu') return;
    st.looted++;
    let msg = ITEM_NAME[kind], cls = '';
    const up = (key, label) => {
      if (st[key] < 5) { st[key]++; cls = 'up'; msg = `${ITEM_NAME[kind]} — <b>${label} ${st[key]}/5</b>`; Bg.setUpgrades(st.armor, st.blades, st.speedLvl); A.upgrade(); say(kind); }
      else { st.hp = Math.min(100, st.hp + 15); msg = `${ITEM_NAME[kind]} — <b>patched the buggy +15</b>`; A.pickup(true); }
    };
    switch (kind) {
      case 'apple': case 'carrot': st.feed = Math.min(9, st.feed + 1); msg += ' <b>+1 feed</b>'; break;
      case 'oats': case 'hay': st.feed = Math.min(9, st.feed + 2); msg += ' <b>+2 feed</b>'; break;
      case 'sugar': st.stamina = Math.min(100, st.stamina + 25); st.sugarT = 8; st.exhausted = false; msg += ' <b>sugar rush! free gallop 8s</b>'; break;
      case 'pie': st.pies = Math.min(5, st.pies + 1); msg += ' <b>+1 pie</b>'; if (st.hp < 40) eatPie(); break;
      case 'salve': st.horseHP = Math.min(100, st.horseHP + 30); msg += ' <b>+30 Dolly</b>'; break;
      case 'ammo': st.ammo += 6; msg += ' <b>+6</b>'; break;
      case 'shells': st.shells += 4; msg += ' <b>+4</b>'; break;
      case 'fuel': st.fuel += 40; msg += ' <b>+40 fuel</b>'; break;
      case 'flamethrower': if (!st.have.flamethrower) { st.have.flamethrower = true; say('gun'); hint('A <b>flamethrower</b> — press <kbd>8</kbd> and hold the button. Burning zombies keep burning.', 7); } st.fuel += 60; msg += ' <b>+60 fuel</b>'; break;
      case 'knife': case 'shovel': case 'pitchfork': case 'scythe': st.have[kind] = true; st.uses[kind] += WEAPONS[kind].uses; if (st.cur === 'whip' && st.uses[kind] === WEAPONS[kind].uses) hint(`Picked up a <b>${ITEM_NAME[kind]}</b> — press <kbd>${ORDER.indexOf(kind) + 1}</kbd> to wield it. Right-click still cracks the whip.`, 6); break;
      case 'revolver': if (!st.have.revolver) { st.have.revolver = true; say('gun'); hint('A <b>revolver</b> — press <kbd>5</kbd>. Rounds are scarce.', 6); } st.ammo += 6; msg += ' <b>+6 rounds</b>'; break;
      case 'shotgun': if (!st.have.shotgun) { st.have.shotgun = true; say('gun'); hint('A <b>shotgun</b> — press <kbd>6</kbd>. Clears a whole road.', 6); } st.shells += 4; msg += ' <b>+4 shells</b>'; break;
      case 'armor': up('armor', 'Armor'); break;
      case 'blades': up('blades', 'Blades'); break;
      case 'speed': up('speedLvl', 'Speed'); break;
    }
    if (!cls) A.pickup(kind === 'revolver' || kind === 'shotgun');
    toast(msg, cls); refreshKit();
  };
  function fixUpgrade(kind) { // don't hand out parts that are already maxed
    if (kind === 'armor' && st.armor >= 5) return st.blades < 5 ? 'blades' : st.speedLvl < 5 ? 'speed' : 'pie';
    if (kind === 'blades' && st.blades >= 5) return st.armor < 5 ? 'armor' : st.speedLvl < 5 ? 'speed' : 'pie';
    if (kind === 'speed' && st.speedLvl >= 5) return st.armor < 5 ? 'armor' : st.blades < 5 ? 'blades' : 'pie';
    return kind;
  }
  Game.onKill = function (z, cause, cy) {
    say('kill');
    const T = z.T; let chance = T.loot;
    if (cause === 'acid') chance *= 0.5;
    if (Math.random() < chance) {
      let kind = roll('zombie');
      const od = z.dropList; if (od && Math.random() < 0.55) kind = od[Math.floor(Math.random() * od.length)];
      FX.loot(fixUpgrade(kind), z.x, cy + 0.3, z.z);
    }
    if (z.type === 'brute' || z.type === 'jugg') { FX.loot(fixUpgrade(roll('heavy')), z.x + 0.5, cy + 0.5, z.z); if (z.type === 'jugg') FX.loot(fixUpgrade(roll('heavy')), z.x - 0.5, cy + 0.5, z.z); }
  };
  Game.onGrab = function (slot) { say(slot < 2 ? 'grabL' : slot < 4 ? 'grabR' : 'grabB'); shake(0.3); Bg.jolt += 1; };
  function lootObject(l) {
    if (l.looted) return;
    W.markLooted(l);
    const metal = l.kind === 'wreck';
    if (metal) { FX.sparks(l.x, l.y, l.z, 12); A.crash(0.25); } else FX.dust(l.x, l.y, l.z, 6);
    if (Math.random() < l.chance || st.god) { FX.loot(fixUpgrade(roll(l.table)), l.x, l.y + 0.5, l.z); }
    else { FX.dust(l.x, l.y, l.z, 5, 0x6a6a6a); toast('Nothing worth taking'); say('empty'); }
  }

  /* ------------------------------------------------------------------ damage */
  function shake(a) { shakeAmt = Math.min(1.2, shakeAmt + a); }
  Game.shake = shake;
  Game.hurt = function (amount, cause, slot) {
    if (mode !== 'play' || st.god) return;
    amount *= st.diff.dmg * (1 - st.armor * 0.1);
    st.hp -= amount; hurtA = Math.min(1, hurtA + 0.25 + amount * 0.035); shake(0.12 + amount * 0.02);
    if (cause === 'claw' || cause === 'swipe' || cause === 'horde') A.hurt();
    if (st.hp < 30) say('lowhp');
    if (st.hp <= 0) { st.hp = 0; gameOver(false, cause === 'horde' ? 'The horde closed over the buggy like a tide.' : cause === 'acid' ? 'There was not much left of the buggy. Or the pies.' : 'They pulled the buggy apart board by board.'); }
  };
  Game.hurtHorse = function (amount, cause) {
    if (mode !== 'play' || st.god) return;
    amount *= st.diff.dmg * (1 - Math.max(0, st.armor - 2) * 0.14);
    st.horseHP -= amount; hurtA = Math.min(1, hurtA + 0.15);
    if (Math.random() < 0.4) A.whinny();
    if (st.horseHP < 30) say('lowhorse');
    if (st.horseHP <= 0) { st.horseHP = 0; gameOver(false, 'Dolly went down. Without a horse, an Amish man is just a man standing in the road.'); }
  };
  Game.panOf = function (x, z) { const dx = x - st.x, dz = z - st.z, d = Math.hypot(dx, dz) || 1; const yaw = st.yaw + (firstPerson ? look.yaw : 0); return clamp((dx * Math.cos(yaw) + dz * -Math.sin(yaw)) / d, -1, 1); };

  /* ------------------------------------------------------------------ combat */
  const eye = new THREE.Vector3(), aim = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), cone = [];
  let aimZ = null, aimL = null;
  function pickLootable(range) {
    let best = null, bestA = 9;
    W.each('lootables', st.s, 16, l => {
      if (l.looted) return;
      _v.set(l.x - eye.x, l.y - eye.y, l.z - eye.z); const d = _v.length(); if (d > range + l.r * 0.6) return;
      const ang = Math.acos(clamp(_v.dot(aim) / d, -1, 1)), tol = Math.atan(l.r / Math.max(d, 1)) + 0.1;
      if (ang < tol && ang < bestA) { bestA = ang; best = l; }
    });
    return best;
  }
  function attack(kind) {
    if (st.atkCD > 0 || !st.have[kind]) return;
    const Wp = WEAPONS[kind];
    if (kind !== st.cur) { st.cur = kind; Bg.vm.set(kind); refreshKit(); }
    if (Wp.gun && st[Wp.ammo] <= 0) { st.atkCD = 0.25; if (!Wp.auto || realTime - (st.emptyT || 0) > 2) { st.emptyT = realTime; A.click(); toast(Wp.auto ? 'Out of fuel!' : 'Empty!', 'bad'); } return; }
    const target = Z.pick(eye, aim, Wp.range, Wp.assist), lootable = !Wp.gun && !target ? pickLootable(Wp.range) : null;
    let tp = null;
    if (target) tp = Z.aimPoint(target, _v2).clone(); else if (lootable) tp = new THREE.Vector3(lootable.x, lootable.y, lootable.z);
    Bg.vm.attack(kind, tp, Wp.anim);
    st.atkCD = Wp.cd;
    if (kind === 'whip') A.whipSwing(); else if (!Wp.gun) A.swing(kind !== 'knife');
    if (Wp.auto) { resolve({ kind }); return; }
    pending.push({ kind, target, lootable, t: Wp.delay, tp });
  }
  function hitDir(z) { const dx = z.x - st.x, dz = z.z - st.z, d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d]; }
  function wear(kind) {
    if (--st.uses[kind] <= 0) { st.uses[kind] = 0; st.have[kind] = false; A.breakWeapon(); toast(`The ${WEAPONS[kind].name.toLowerCase()} is done for`, 'bad'); st.cur = 'whip'; Bg.vm.set('whip'); }
    refreshKit();
  }
  function resolve(p) {
    const Wp = WEAPONS[p.kind];
    if (p.kind === 'whip') {
      A.whipCrack();
      const z = p.target;
      if (z && !z.dead && !z.removed) { const [dx, dz] = hitDir(z); Z.damage(z, Wp.dmg, 'whip', dx, dz, 4.5); FX.flash(z.x, z.y + 1.3, z.z, 0.6, 1, 1, 0.9); }
      else if (p.lootable) lootObject(p.lootable);
      else if (p.tp) FX.dust(p.tp.x, p.tp.y, p.tp.z, 3);
    } else if (p.kind === 'knife') {
      const z = p.target && !p.target.dead ? p.target : Z.pick(eye, aim, Wp.range, Wp.assist);
      if (z) { const [dx, dz] = hitDir(z); Z.damage(z, Wp.dmg, 'knife', dx, dz, 2); wear('knife'); }
      else if (p.lootable) lootObject(p.lootable);
    } else if (p.kind === 'scythe') {
      // a wide reaping stroke: everything in the arc
      Z.inCone(eye, aim, Wp.range, 0.8, cone);
      let n = 0; for (const c of cone) { if (n >= 5) break; const [dx, dz] = hitDir(c.z); Z.damage(c.z, Wp.dmg * (n ? 0.8 : 1), 'scythe', dx, dz, 6); n++; }
      if (n) { wear('scythe'); shake(0.15); A.slice(); } else if (p.lootable) lootObject(p.lootable);
    } else if (p.kind === 'flamethrower') {
      st.fuel--; A.flame(); if (st.fuel % 5 === 0 || st.fuel < 10) refreshKit();
      const rxv = Math.cos(st.yaw + look.yaw), rzv = -Math.sin(st.yaw + look.yaw);
      for (let i = 0; i < 5; i++) {
        const sp = 13 + Math.random() * 9, jx = (Math.random() - 0.5) * 0.26, jy = (Math.random() - 0.5) * 0.2, jz = (Math.random() - 0.5) * 0.26, h = Math.random();
        FX.add.emit(eye.x + aim.x * 0.9 + rxv * 0.22, eye.y + aim.y * 0.9 - 0.22, eye.z + aim.z * 0.9 + rzv * 0.22, (aim.x + jx) * sp + st.vx, (aim.y + jy) * sp + 0.8, (aim.z + jz) * sp + st.vz, 0.34 + Math.random() * 0.24, 0.22, 1.5 + Math.random(), 1.0, 0.38 + h * 0.42, 0.05 + h * 0.12, 0.55, -2.5, 1.6);
      }
      if (Math.random() < 0.35) FX.smokePuff(eye.x + aim.x * 7, eye.y + aim.y * 7, eye.z + aim.z * 7, 1, true);
      Z.inCone(eye, aim, Wp.range, 0.26, cone);
      for (const c of cone) { const [dx, dz] = hitDir(c.z); c.z.burn = 3.5; Z.damage(c.z, Wp.dmg * clamp(1.1 - c.d / 13, 0.3, 1), 'fire', dx, dz, 0.6); }
    } else if (p.kind === 'shovel' || p.kind === 'pitchfork') {
      const sh = p.kind === 'shovel';
      Z.inCone(eye, aim, Wp.range, sh ? 0.55 : 0.2, cone);
      let n = 0; for (const c of cone) { if (n >= (sh ? 3 : 2)) break; const [dx, dz] = hitDir(c.z); Z.damage(c.z, Wp.dmg * (n ? 0.7 : 1), p.kind, dx, dz, sh ? 9 : 4); n++; }
      if (n) { wear(p.kind); shake(0.12); } else if (p.lootable) lootObject(p.lootable);
    } else {
      st[Wp.ammo]--; A.shot(p.kind); shake(p.kind === 'shotgun' ? 0.5 : 0.25); look.pitch += p.kind === 'shotgun' ? 0.05 : 0.025;
      for (let i = 1; i < 9; i++) FX.add.emit(eye.x + aim.x * i * 1.6, eye.y + aim.y * i * 1.6 - 0.12, eye.z + aim.z * i * 1.6, aim.x * 40, aim.y * 40, aim.z * 40, 0.07, 0.07, 0.02, 1, 0.85, 0.5, 0.8, 0, 0);
      if (p.kind === 'revolver') {
        const z = p.target && !p.target.dead ? p.target : null;
        if (z) { const [dx, dz] = hitDir(z); Z.damage(z, Wp.dmg, 'revolver', dx, dz, 5); }
      } else {
        Z.inCone(eye, aim, Wp.range, 0.2, cone);
        let n = 0; for (const c of cone) { if (n >= 7) break; const [dx, dz] = hitDir(c.z); Z.damage(c.z, Wp.dmg * clamp(1.15 - c.d / 34, 0.25, 1), 'shotgun', dx, dz, 10); n++; }
      }
      refreshKit();
    }
  }

  /* ------------------------------------------------------------------ driving */
  function updatePlayer(dt) {
    const playing = mode === 'play';
    let steer = 0;
    if (playing) { if (keys.KeyA || keys.ArrowLeft) steer -= 1; if (keys.KeyD || keys.ArrowRight) steer += 1; }
    let gear = st.gear;
    if (playing && (keys.ShiftLeft || keys.ShiftRight)) gear = 4;
    if (st.exhausted) gear = Math.min(gear, 2);
    if (mode === 'over') gear = won ? 2 : 0;
    if (mode === 'menu' || mode === 'intro') gear = 2;
    st.effGear = gear;
    const hang = Z.hangCount();
    let target = (gear < 0 ? -2.0 : GEAR_SPEED[gear]) * (gear < 0 ? 1 : 1 + 0.06 * st.speedLvl) * (1 - 0.07 * hang) * (st.offroad ? 0.8 : 1) * (st.horseHP < 35 ? 0.86 : 1);
    if (st.blocked && target > 0.7) target = 0.7;
    if (st.speed < target) st.speed = Math.min(target, st.speed + (gear === 4 ? 3.8 : 2.9) * (1 + 0.08 * st.speedLvl) * dt);
    else st.speed = Math.max(target, st.speed - (gear === 0 || st.blocked ? 9 : 3.6) * dt);
    if (playing) {
      st.sugarT = Math.max(0, st.sugarT - dt); st.feedCD -= dt;
      const eco = 1 - 0.07 * st.speedLvl;
      const d = gear === 4 ? (st.sugarT > 0 ? 0 : -7.6 * eco) : gear === 3 ? -1.0 * eco : gear === 2 ? 2.6 : gear === 1 ? 6 : gear < 0 ? 4 : 8;
      st.stamina = clamp(st.stamina + d * dt, 0, 100);
      if (st.stamina <= 0 && !st.exhausted) { st.exhausted = true; st.gear = Math.min(st.gear, 2); A.snort(); say('tired'); if (st.feed > 0) feed(true); }
      if (st.exhausted && st.stamina >= 22) st.exhausted = false;
    }
    // steering
    const tv = steer * clamp(1.2 + Math.abs(st.speed) * 0.44, 0, 6.4) * (Math.abs(st.speed) > 0.3 ? 1 : 0.15);
    st.latVel = damp(st.latVel, tv, 6.5, dt);
    st.lat += st.latVel * dt;
    // a hard left-right flick can throw the ones on the back
    if (playing && steer !== 0 && steer !== st.swerveDir) {
      if (st.swerveDir !== 0 && realTime - st.swerveT < 0.7 && st.speed > 6 && Math.abs(st.latVel) > 2 && Z.hangers(0) > 0 && Math.random() < 0.5) { if (Z.knockOff(0, 1, 'scrape')) { st.scraped++; say('scraped'); shake(0.3); Bg.jolt += 1.2; } }
      st.swerveDir = steer; st.swerveT = realTime;
    }
    st.s += st.speed * dt;
    // fences and bridge walls
    st.knockCD -= dt; st.scrapeSnd -= dt; st.crashCD -= dt; st.sideCD -= dt;
    const rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
    for (const side of [-1, 1]) {
      const lim = W.latLimit(st.s + 0.6, side) - 0.86;
      if (st.lat * side <= lim) continue;
      st.lat = side * lim;
      const barrier = W.hasBarrier(st.s, side), into = st.latVel * side;
      if (into > 0) { if (barrier && into > 3.2 && st.sideCD <= 0 && playing) { Game.hurt(2, 'scrape'); st.sideCD = 0.6; shake(0.3); } st.latVel = 0; }
      if (!barrier || st.speed < 1.5) continue;
      st.speed *= (1 - 0.3 * dt);
      const cx = st.x + rx * side * 0.92, cz = st.z + rz * side * 0.92, br = G.onBridge(st.s);
      if (Math.random() < dt * 34) { if (br) FX.chunks(cx, st.y + 0.8 + Math.random() * 0.6, cz, 1, 0x7c2a20, 0.5); else FX.sparks(cx, st.y + 0.6 + Math.random() * 0.6, cz, 1, st.vx * 0.3, st.vz * 0.3); if (Math.random() < 0.3) FX.chunks(cx, st.y + 1, cz, 1, 0xf1efe6, 0.5); }
      if (st.scrapeSnd <= 0) { A.scrape(side * 0.7); st.scrapeSnd = 0.24; shake(0.05); }
      if (playing && st.knockCD <= 0 && Z.hangers(side) > 0 && st.speed > 2.4) { const n = Z.knockOff(side, 1, 'scrape'); if (n) { st.knockCD = 0.22; st.scraped += n; say('scraped'); shake(0.25); } }
    }
  }
  function placeBuggy(dt) {
    st.x = R.x(st.s) + st.lat; st.z = -st.s;
    st.y = Math.abs(st.lat) > 4.85 ? G.terrainY(st.x, st.s) : R.y(st.s);
    st.yaw = R.ang(st.s) - Math.atan2(st.latVel, Math.max(st.speed, 4.5)) * 0.85;
    st.pitch = Math.atan(R.dy(st.s));
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    st.vx = fx * st.speed; st.vz = fz * st.speed; st.hx = st.x + fx * 2.9; st.hz = st.z + fz * 2.9;
    st.offroad = Math.abs(st.lat) > 4.3; st.night = G.env.cur.night;
    Bg.update(dt, st);
    if (Bg.strikes && mode !== 'pause') {
      const vol = clamp(0.25 + st.speed * 0.04, 0, 0.8) * (mode === 'menu' ? 0.35 : 1);
      for (let i = 0; i < 4; i++) if (Bg.strikes & (1 << i)) {
        A.clop(i, vol, st.offroad);
        const h = Bg.hoofWorld(i);
        if (st.offroad || st.speed > 9) FX.dust(h.x, st.y, h.z, st.offroad ? 2 : 1, st.offroad ? 0x8a7a5a : 0xa09a90, 0.3, 0.8);
      }
    }
    if (st.offroad && st.speed > 2 && Math.random() < dt * 14) FX.dust(st.x - fx * 0.9 + (Math.random() - 0.5) * 1.8, st.y, st.z - fz * 0.9, 1, 0x8a7a5a, 0.4, 1);
  }

  /* ------------------------------------------------------------------ wrecks, posts, debris */
  const CIRC = [[2.95, 0.58, 1], [0.45, 0.86, 0], [-0.5, 0.86, 0]];
  function collisions(dt) {
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
    W.each('obstacles', st.s + 1.5, 10, o => {
      if (o.dead) return;
      const ox = (o.x - st.x) * rx + (o.z - st.z) * rz, oz = (o.x - st.x) * fx + (o.z - st.z) * fz;   // obstacle in buggy space
      for (const [lf, cr, isHorse] of CIRC) {
        const lz = oz - lf, d = Math.hypot(ox, lz), gap = d - (cr + o.r);
        if (gap >= 0) {
          // a close shave is what scrapes the passengers off
          if (!isHorse && gap < 0.55 && Math.abs(lz) < 1.1 && o.cls !== 'bump' && o.cls !== 'heal' && st.speed > 2.5 && st.knockCD <= 0) {
            const side = ox < 0 ? -1 : 1;
            if (Z.hangers(side) > 0) { const n = Z.knockOff(side, 2, 'scrape'); if (n) { st.knockCD = 0.25; st.scraped += n; say('scraped'); shake(0.3); A.scrape(side * 0.7); FX.sparks(st.x + rx * side, st.y + 1, st.z + rz * side, 8, st.vx * 0.3, st.vz * 0.3); } }
          }
          continue;
        }
        const side = ox < 0 ? -1 : 1, pr = o.prop;
        if (o.cls === 'heal') {
          // repair crate: smash through it and patch the buggy up
          o.dead = true; W.removeObstaclesOf(pr);
          if (pr.alive) {
            pr.alive = false; pr.mesh.visible = false; if (pr.glow) pr.glow.visible = false;
            const before = st.hp; st.hp = Math.min(100, st.hp + pr.heal); st.repairs = (st.repairs || 0) + 1;
            FX.chunks(pr.x, pr.gy + 0.4, pr.z, 16, 0xf2efe6, 0.8); FX.flash(pr.x, pr.gy + 0.8, pr.z, 3, 0.4, 1, 0.5);
            A.woodBreak(); A.pickup(true); Bg.jolt += 0.8;
            toast('Repair crate <b>+' + Math.round(st.hp - before) + ' buggy</b>', 'up');
            if (!st.said.repairhint) { st.said.repairhint = 1; hint('White crates with a red cross repair the buggy — just drive over them', 6); }
          }
          return;
        }
        if (o.cls === 'bump' || o.cls === 'break') {
          // run it down
          const brk = o.cls === 'break';
          o.dead = true; W.removeObstaclesOf(pr);
          if (pr.alive) {
            pr.alive = false;
            if (brk) { pr.mesh.visible = false; FX.chunks(pr.x, pr.gy + 0.5, pr.z, 22, pr.puff || 0x8a6a42, 1); FX.dust(pr.x, pr.gy + 0.3, pr.z, 8, pr.puff); A.woodBreak(); }
            else { flying.push({ m: pr.mesh, vx: st.vx * 0.9 + rx * side * (2 + Math.random() * 3), vy: 3 + Math.random() * 3 + st.speed * 0.2, vz: st.vz * 0.9 + rz * side * (2 + Math.random() * 3), sp: (Math.random() - 0.5) * 16, gy: pr.gy, t: 0 }); A.bump(); if (pr.puff) FX.chunks(pr.x, pr.gy + 0.3, pr.z, 12, pr.puff, 0.8); }
            if (pr.loot && !pr.looted) { W.markLooted(pr); if (Math.random() < pr.chance * 0.6) FX.loot(fixUpgrade(roll(pr.table)), pr.x, pr.gy + 0.8, pr.z); }
          }
          st.speed *= brk ? 0.72 : 0.9; Bg.jolt += brk ? 1.6 : 2.0; shake(brk ? 0.35 : 0.2);
          if (isHorse) { st.stamina = Math.max(0, st.stamina - (brk ? 4 : 1.5)); if (brk) Game.hurtHorse(2 + st.speed * 0.2, 'crash'); } else Game.hurt(brk ? 2 + st.speed * 0.25 : 1, 'crash');
          if (Z.hangers(0) > 0 && Math.random() < 0.75) { const n = Z.knockOff(0, 1, 'scrape'); if (n) { st.scraped += n; say('scraped'); } }
          if (!isHorse && Z.hangers(side) > 0) { st.scraped += Z.knockOff(side, 1, 'scrape'); }
          return;
        }
        const post = o.cls === 'post';
        const frontal = lz > 0 && Math.abs(ox) < cr * 0.6 + o.r * 0.55;
        st.lat -= side * Math.min(-gap, 0.6) * (frontal ? 0.5 : 1);
        if (frontal) {
          if (st.crashCD <= 0 && st.speed > 1.4) {
            st.crashCD = 0.8;
            const v = st.speed;
            if (isHorse) { Game.hurtHorse((post ? 2 : 3) + v * (post ? 0.4 : 0.9), 'crash'); Game.hurt(1 + v * 0.4, 'crash'); Bg.rear = 1; A.whinny(); }
            else Game.hurt((post ? 2 : 4) + v * (post ? 0.5 : 1.5), 'crash');
            A.crash(clamp(v / 10, 0.3, 1)); shake(clamp(v / 9, 0.3, 1)); Bg.jolt += 3; hurtA = Math.min(1, hurtA + 0.3);
            FX.sparks(st.x + fx * (lf + cr), st.y + 0.8, st.z + fz * (lf + cr), 16, st.vx * 0.2, st.vz * 0.2);
            st.speed *= post ? 0.45 : 0.1;
            if (!post && !st.said.backhint) { st.said.backhint = 1; hint('Stuck? Keep pressing <kbd>S</kbd> until the gait shows <b>Back</b> to reverse, steer clear, then <kbd>W</kbd>', 8); }
            for (const sd of [0, -1, 1]) if (Z.hangers(sd) > 0) st.scraped += Z.knockOff(sd, sd === 0 ? 2 : 1, 'crash');
          }
          st.speed = Math.min(st.speed, post ? 4 : 1.2); st.lat -= side * 2.4 * dt; st.s -= Math.min(-gap, 0.3) * 0.5;
        } else {
          if (st.latVel * side > 0) st.latVel = -side * 0.6;
          if (st.sideCD <= 0 && st.speed > 2) { st.sideCD = 0.5; Game.hurt(post ? 1.5 : 2 + st.speed * 0.25, 'scrape'); st.speed *= 0.92; A.scrape(side * 0.7); shake(0.3); FX.sparks(st.x + rx * side * 0.9 + fx * lf, st.y + 0.9, st.z + rz * side * 0.9 + fz * lf, 10, st.vx * 0.4, st.vz * 0.4); }
          if (!isHorse && Z.hangers(side) > 0 && st.knockCD <= 0) { const n = Z.knockOff(side, 2, 'scrape'); if (n) { st.knockCD = 0.25; st.scraped += n; say('scraped'); } }
        }
        return;
      }
    });
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i], p = f.m.position; f.t += dt;
      f.vy -= 20 * dt; p.x += f.vx * dt; p.y += f.vy * dt; p.z += f.vz * dt; f.m.rotation.x += f.sp * dt; f.m.rotation.z += f.sp * 0.6 * dt;
      if (p.y < f.gy + 0.15 && f.vy < 0) { p.y = f.gy + 0.15; f.vy *= -0.35; f.vx *= 0.6; f.vz *= 0.6; f.sp *= 0.5; if (Math.abs(f.vy) < 1) { flying.splice(i, 1); } }
      else if (f.t > 6) flying.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------------ scripted beats */
  const MARKS = [[2.5, 'start'], [150, 'gold'], [296, 'dusk'], [306, 'half'], [415, 'night'], [476, 'storm'], [545, 'mile'], [578, 'bell']];
  let markI = 0, bellT = 0, lootHint = false, sawFirst = false;
  function triggers(dt) {
    while (markI < MARKS.length && st.time >= MARKS[markI][0]) { say(MARKS[markI][1]); markI++; }
    if (!sawFirst) for (const z of Z.list) if (!z.dead && Math.hypot(z.x - st.x, z.z - st.z) < 38) { sawFirst = true; say('sight'); hint('Crack the whip at whatever the crosshair is on: <kbd>Left click</kbd>, <kbd>F</kbd> or <kbd>1</kbd> &nbsp;·&nbsp; or simply run them down', 8); break; }
    if (!lootHint) W.each('lootables', st.s + 14, 12, l => { if (!lootHint && !l.looted && l.kind === 'wreck') { lootHint = true; hint('Glinting wrecks hide parts — <b>whip them as you pass</b> for armor, blades and speed', 8); } });
    if (st.time > 562) { bellT -= dt; if (bellT <= 0) { bellT = 5; A.bell(); } }
    if (st.time >= 600) gameOver(true, 'The bell at the Stoltzfus farm is still ringing. They barred the gate behind you, and somebody handed Dolly a bucket of oats. The pies arrived mostly intact.');
  }

  /* ------------------------------------------------------------------ camera */
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), _fwd = new THREE.Vector3();
  function updateCamera(dt) {
    shakeAmt = Math.max(0, shakeAmt - dt * 2.2);
    const sh = shakeAmt * shakeAmt, sx = (Math.random() - 0.5) * sh * 0.09, sy = (Math.random() - 0.5) * sh * 0.09, sr = (Math.random() - 0.5) * sh * 0.05;
    look.vyaw = damp(look.vyaw, 0, 8, dt);
    const tf = 68 + smooth(8, 14, st.speed) * 9; fov = damp(fov, tf, 3, dt);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (firstPerson) {
      const bob = Math.sin(realTime * 9) * 0.003 * st.speed;
      camera.position.set(Bg.EYE.x + sx, Bg.EYE.y + sy + bob * 0.4, Bg.EYE.z);
      camera.rotation.set(look.pitch + sy * 0.6, look.yaw + sx * 0.6, sr);
    } else {
      const menu = mode === 'menu' || mode === 'intro';
      const ang = st.yaw + (menu ? PI + 0.5 + Math.sin(realTime * 0.08) * 1.1 : look.yaw), dist = menu ? 8.2 : 7.4, hgt = menu ? 2.3 + Math.sin(realTime * 0.11) * 0.5 : 3.3 - look.pitch * 3;
      camTgt.set(st.x + Math.sin(ang) * dist, st.y + hgt, st.z + Math.cos(ang) * dist);
      if (camPos.distanceToSquared(camTgt) > 900) camPos.copy(camTgt); else camPos.lerp(camTgt, 1 - Math.exp(-6 * dt));
      camera.position.set(camPos.x + sx, camPos.y + sy, camPos.z);
      const f = menu ? 1.2 : 2.5;
      camera.lookAt(st.x - Math.sin(st.yaw) * f, st.y + 1.5, st.z - Math.cos(st.yaw) * f);
    }
    camera.updateMatrixWorld(true);
    Bg.body.updateMatrixWorld(true);
    eye.copy(Bg.EYE); Bg.body.localToWorld(eye);
    camera.getWorldDirection(aim);
    if (!firstPerson) { // aim from the seat toward where the chase camera is looking
      _v.copy(camera.position).addScaledVector(aim, 30).sub(eye).normalize(); aim.copy(_v);
    }
  }

  /* ------------------------------------------------------------------ HUD per-frame */
  function updateHUD(dt) {
    if (mode !== 'play' && mode !== 'over') return;
    setBar('b-hp', st.hp / 100); setBar('b-horse', st.horseHP / 100); setBar('b-stam', st.stamina / 100);
    setText('v-hp', Math.ceil(st.hp)); setText('v-horse', Math.ceil(st.horseHP)); setText('v-stam', Math.round(st.stamina));
    const sc = st.exhausted ? 'bar out' : st.sugarT > 0 ? 'bar rush' : 'bar'; if (hudCache.sc !== sc) { hudCache.sc = sc; el['b-stam'].className = sc; }
    if (hudCache.gear !== st.effGear) { hudCache.gear = st.effGear; gaitEls.forEach((g, i) => g.className = i === st.effGear + 1 ? 'on g' + st.effGear : ''); }
    setText('speed', Math.round(Math.abs(st.speed) * 2.237) + ' mph');
    setText('time', G.fmtTime(600 - st.time));
    const dd = Math.round(st.time / 6 * 10) / 10; if (hudCache.dd !== dd) { hudCache.dd = dd; el.daydot.style.left = dd + '%'; }
    setText('kills', Z.kills);
    const H = Z.horde;
    setShow('horde', H.active);
    if (H.active) { setText('gap', Math.round(H.gap * 1.094)); const hb = Math.round(clamp(1 - H.gap / 235, 0, 1) * 100) / 100; if (hudCache.hb !== hb) { hudCache.hb = hb; el.horde.querySelector('i').style.transform = `scaleX(${hb})`; } const near = H.gap < 70; if (hudCache.near !== near) { hudCache.near = near; el.horde.className = near ? 'near' : ''; } }
    setShow('w-l', Z.hangers(-1) > 0); setShow('w-r', Z.hangers(1) > 0); setShow('w-b', Z.hangers(0) > 0);
    const cc = aimZ ? 'z' : aimL ? 'l' : ''; if (hudCache.cc !== cc) { hudCache.cc = cc; el.cross.className = cc; }
    hurtA = Math.max(0, hurtA - dt * 1.4); el.hurt.style.opacity = hurtA.toFixed(2);
    const low = clamp(1 - Math.min(st.hp, st.horseHP) / 34, 0, 1) * (0.7 + 0.3 * Math.sin(realTime * 6)); el.low.style.opacity = low.toFixed(2);
    if (subT > 0) { subT -= dt; if (subT <= 0) el.sub.classList.remove('on'); }
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) el.hint.classList.remove('on'); }
    el.flashw.style.opacity = (G.env.flash * 0.16).toFixed(2);
  }

  /* ------------------------------------------------------------------ flow */
  function setMode(m) { mode = m; st.mode = m; document.body.classList.toggle('playing', m === 'play' || m === 'pause'); document.body.classList.toggle('cine', m === 'intro'); }
  function reset() {
    st = G.state = newState();
    pending.length = 0; flying.length = 0; markI = 0; bellT = 0; lootHint = false; sawFirst = false; won = false; endShown = false; timeScale = 1;
    look.yaw = look.pitch = 0; shakeAmt = 0; hurtA = 0; subT = 0; hintT = 0;
    W.reset(); Z.reset(); FX.reset(); Bg.resetAnim(); Bg.setUpgrades(0, 0, 0); Bg.vm.set('whip');
    W.update(st.s, true);
    for (const k in hudCache) delete hudCache[k];
    el.sub.classList.remove('on'); el.hint.classList.remove('on'); el.toasts.innerHTML = ''; el.blood.style.opacity = 0;
    refreshKit();
  }
  function startGame() {
    A.init();
    reset();
    if (params.has('t')) st.time = +params.get('t');
    if (params.has('kit')) { for (const k of ORDER) st.have[k] = true; st.uses = { knife: 30, shovel: 22, pitchfork: 18, scythe: 20 }; st.fuel = 200; st.ammo = 60; st.shells = 40; st.feed = 9; st.pies = 5; refreshKit(); }
    $('menu').classList.remove('on'); $('end').classList.remove('on');
    el.fade.style.opacity = 1;
    setFirstPerson(false);
    setMode('intro'); introT = params.has('skip') ? 99 : 0;
    $('intro').classList.add('on');
    setTimeout(() => { el.fade.style.opacity = 0; }, 80);
    lock();
  }
  function updateIntro(dt) {
    introT += dt;
    const cards = $('intro').children;
    const idx = introT < 4.2 ? 0 : introT < 7.4 ? 1 : introT < 10.4 ? 2 : -1;
    for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('on', i === idx && introT < 90);
    if (introT > 11) {
      $('intro').classList.remove('on'); for (const c of cards) c.classList.remove('on');
      setFirstPerson(true); setMode('play');
      hint('<kbd>W</kbd>/<kbd>S</kbd> change gait &nbsp;·&nbsp; <kbd>A</kbd>/<kbd>D</kbd> steer &nbsp;·&nbsp; hold <kbd>Shift</kbd> to gallop &nbsp;·&nbsp; mouse to look — the mirrors work', 9);
    }
  }
  function pause() { if (mode !== 'play') return; setMode('pause'); $('pause').classList.add('on'); if (locked) document.exitPointerLock(); }
  function resume() { if (mode !== 'pause') return; $('pause').classList.remove('on'); setMode('play'); lock(); }
  function gameOver(win, text) {
    if (mode !== 'play') return;
    won = win; setMode('over'); document.body.classList.add('playing');
    timeScale = win ? 0.5 : 0.3;
    A.sting(win);
    if (!win) { el.blood.style.opacity = 0.9; shake(1); }
    setTimeout(() => {
      if (locked) document.exitPointerLock();
      const e = $('end'); e.className = 'screen on ' + (win ? 'win' : 'lose');
      $('end-t').textContent = win ? 'Safe Behind the Gate' : 'The Road Took You';
      $('end-p').textContent = text;
      const up = st.armor + st.blades + st.speedLvl;
      let best = 0; try { best = +localStorage.getItem('ohp-best') || 0; if (st.time > best && !st.god && !params.has('t')) { best = Math.min(600, st.time); localStorage.setItem('ohp-best', best); } } catch (e2) { }
      e.style.setProperty('--art', `url(assets/${win ? 'win' : 'lose'}.jpg)`);
      const rows = [[G.fmtTime(Math.min(600, st.time)), 'Survived'], [Z.kills, 'Laid to rest'], [st.trampled, 'Under the hooves'], [st.scraped, 'Scraped off'], [((st.s - st.startS) / 1609).toFixed(2), 'Miles'], [up, 'Buggy upgrades'], [G.fmtTime(best), 'Best run'], [st.diff.name, 'Difficulty']];
      $('stats').innerHTML = rows.map(r => `<div class="panel"><b>${r[0]}</b><span>${r[1]}</span></div>`).join('');
      document.body.classList.remove('playing');
    }, win ? 3200 : 2400);
  }
  Game.debug = { start: startGame, state: () => st, over: gameOver, setTime: t => { st.time = t; }, mode: () => mode, give: k => Game.collect(k), step: (n, dt) => { for (let i = 0; i < n; i++) tick(dt || 1 / 30); }, look: (y, p) => { look.yaw = y; look.pitch = p; }, keys, attack: k => attack(k || st.cur), fp: setFirstPerson };

  /* ------------------------------------------------------------------ frame */
  let last = performance.now(), fpsAcc = 0, fpsN = 0;
  const camW = { position: new THREE.Vector3() };
  let prTarget = Math.min(window.devicePixelRatio || 1, 1.5), prCur = prTarget, slowT = 0, fastT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000; last = now;
    const dt = Math.min(0.05, Math.max(0.001, raw));
    fpsAcc += raw; fpsN++; if (fpsAcc > 1) { Game.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    // adaptive resolution: hold the frame rate on integrated graphics
    if (!params.has('noscale') && !document.hidden && mode === 'play') {
      if (raw > 1 / 42) { slowT += raw; fastT = 0; } else if (raw < 1 / 56) { fastT += raw; slowT = Math.max(0, slowT - raw); }
      if (slowT > 2.5 && prCur > 0.7) { prCur = Math.max(0.7, prCur - 0.15); renderer.setPixelRatio(prCur); resize(); slowT = 0; }
      else if (slowT > 4 && prCur <= 0.7 && !Z.noSkins) { Z.noSkins = true; slowT = 0; }   // last resort: new zombies use the light built-in figures
      else if (fastT > 12 && prCur < prTarget) { prCur = Math.min(prTarget, prCur + 0.1); renderer.setPixelRatio(prCur); resize(); fastT = 0; }
    }
    tick(dt);
  }
  function tick(dt) {
    if (mode === 'pause') { A.update(dt, { mode }); renderer.render(scene, camera); return; }
    realTime += dt; st.realTime = realTime;
    const sdt = dt * timeScale;
    if (mode === 'over') timeScale = Math.min(1, timeScale + dt * 0.12);
    if (mode === 'play') st.time += sdt;
    if (mode === 'intro') updateIntro(dt);
    updatePlayer(sdt);
    W.update(st.s);
    placeBuggy(sdt);
    if (mode === 'play' || mode === 'over') {
      Z.update(sdt, st);
      if (mode === 'play') {
        st.atkCD -= sdt;
        if ((fireHeld || keys.KeyF) && WEAPONS[st.cur].auto) attack(st.cur);   // hold to keep the flame going
        for (let i = pending.length - 1; i >= 0; i--) { pending[i].t -= sdt; if (pending[i].t <= 0) { const p = pending[i]; pending.splice(i, 1); resolve(p); } }
        collisions(sdt); triggers(sdt);
      }
    }
    updateCamera(dt);
    if (mode === 'play') {
      const Wc = WEAPONS[st.cur];
      aimZ = Z.pick(eye, aim, Wc.range, Wc.assist); aimL = aimZ ? null : pickLootable(WEAPONS.whip.range);
    } else { aimZ = aimL = null; }
    Bg.vm.update(sdt, realTime, st.speed, look.vyaw);
    _v.set(0.25, 1.35, -0.3); Bg.body.localToWorld(_v);
    FX.update(sdt, _v); FX.ambient(sdt, st.s, realTime);
    const envT = mode === 'menu' ? 150 : mode === 'intro' ? 0 : st.time;
    camera.getWorldPosition(camW.position);
    G.env.update(dt, envT, camW, renderer, realTime, firstPerson); G.env.follow(st.x, st.y, st.z);
    updateHUD(dt);
    A.update(dt, { mode, speed: st.speed, offroad: st.offroad, night: G.env.cur.night, storm: G.env.storm, rain: G.env.rainAmt, gap: Z.horde.active ? Z.horde.gap : 999, time: st.time, danger: mode === 'play' ? clamp(Math.max(1 - st.hp / 60, 1 - st.horseHP / 60, Z.horde.active ? 1 - Z.horde.gap / 40 : 0, Z.hangCount() * 0.3), 0, 1) : 0 });
    renderer.shadowMap.needsUpdate = true;
    if (mode !== 'menu') Bg.renderMirrors(renderer, scene);
    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------------ boot */
  function overlays() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), id = g.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0); $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
    const b = document.createElement('canvas'); b.width = 1024; b.height = 576; const bg = b.getContext('2d');
    for (let i = 0; i < 46; i++) {
      const edge = Math.random() < 0.8, x = edge ? (Math.random() < 0.5 ? Math.random() * 220 : 1024 - Math.random() * 220) : Math.random() * 1024, y = Math.random() * 576, r = 14 + Math.random() * 70;
      bg.fillStyle = `rgba(${100 + Math.random() * 50 | 0},4,4,${0.35 + Math.random() * 0.5})`;
      for (let k = 0; k < 9; k++) { bg.beginPath(); bg.ellipse(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r * 1.6, r * (0.2 + Math.random() * 0.6), r * (0.2 + Math.random() * 0.5), Math.random() * 3, 0, 7); bg.fill(); }
      bg.fillRect(x, y, 3 + Math.random() * 5, 30 + Math.random() * 160);
    }
    el.blood.style.background = `url(${b.toDataURL()}) center/cover`;
  }
  function tryArt() {   // optional key art dropped into /assets replaces the live title backdrop
    const img = new Image(); img.onload = () => { const m = $('menu'); m.style.setProperty('--art', `url(assets/title.jpg)`); m.classList.add('art'); }; img.src = 'assets/title.jpg';
  }
  function boot() {
    resize(); overlays(); buildWeaponsHUD();
    G.env.init(scene); W.init(scene); FX.init(scene); Bg.init(scene, camera); Z.init(scene);
    Z.reset(); W.reset(); W.update(st.s, true);
    Bg.setFirstPerson(false); setMode('menu'); refreshKit();
    $('start').addEventListener('click', startGame);
    $('again').addEventListener('click', startGame);
    $('resume').addEventListener('click', resume);
    $('pause').addEventListener('click', e => { if (e.target.id === 'pause') resume(); });
    [...$('diff').children].forEach(b => b.addEventListener('click', () => { diffIdx = +b.dataset.d; [...$('diff').children].forEach(x => x.classList.toggle('on', x === b)); }));
    tryArt();
    setTimeout(() => { el.fade.style.opacity = 0; }, 150);
    requestAnimationFrame(frame);
    if (params.has('auto')) setTimeout(startGame, 400);
  }
  boot();
})();
