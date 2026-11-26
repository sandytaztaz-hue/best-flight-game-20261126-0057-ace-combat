// SKY FALCON — Ace Combat Run: world simulation.
// Seeded random, terrain features, enemies, missiles, flares, explosions,
// lock-on, collisions and the per-frame update. Drawing lives in render.js.
window.SF = window.SF || {};
SF.World = (function () {
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeMission(missionDef, upgrades, seed) {
    const rnd = mulberry32(seed || 20261126);
    const w = {
      def: missionDef, rnd: rnd, time: 0, timeLeft: missionDef.time,
      scroll: 0, speed: 0, throttle: 0.6, boost: false,
      alt: 5200, heading: 90, fuel: missionDef.fuel + (upgrades.tank || 0) * 40,
      maxFuel: missionDef.fuel + (upgrades.tank || 0) * 40,
      hull: 100 + (upgrades.armor || 0) * 40,
      maxHull: 100 + (upgrades.armor || 0) * 40,
      missileCount: 4 + (upgrades.missiles || 0) * 2,
      flareCount: 4 + (upgrades.flares || 0) * 4,
      player: { x: 640, y: 470, vx: 0, vy: 0, bank: 0 },
      enemies: [], missiles: [], flares: [], bullets: [], blasts: [], debris: [],
      clouds: [], rain: [], bolts: [],
      kills: { fighter: 0, cargo: 0, boat: 0, ground: 0, ghost: 0 },
      killsNeeded: missionDef.target.count,
      lock: 0, lockTarget: null, lockBeep: 0,
      score: 0, shots: 0, hits: 0, radio: null, radioT: 0,
      shake: 0, flash: 0, done: false, won: false, reason: '',
      route: 0, // 0..1 progress along the mission route
    };
    // Terrain features per ground type.
    w.islands = [];
    const ground = missionDef.ground;
    if (ground === 'strait') {
      w.islands.push({ x: 180, y: 430, w: 420, h: 190, kind: 'volcano', name: 'Mt. Kora' });
      w.islands.push({ x: 1010, y: 400, w: 380, h: 220, kind: 'cliff', name: 'Cliff Isle' });
      w.islands.push({ x: 640, y: 620, w: 300, h: 90, kind: 'reef', name: 'Reef' });
    } else if (ground === 'islands') {
      for (let i = 0; i < 6; i++) {
        w.islands.push({ x: 120 + rnd() * 1040, y: 330 + rnd() * 260, w: 140 + rnd() * 220, h: 70 + rnd() * 110, kind: 'green', name: 'Isle ' + (i + 1) });
      }
    } else if (ground === 'fleet') {
      w.carrier = { x: 640, y: 560, w: 300, h: 46 };
      w.ships = [
        { x: 330, y: 600, w: 130, h: 30, kind: 'escort', hp: 3, name: 'DDG-41' },
        { x: 950, y: 600, w: 130, h: 30, kind: 'escort', hp: 3, name: 'DDG-42' },
      ];
    } else if (ground === 'coast') {
      w.islands.push({ x: 640, y: 640, w: 1280, h: 130, kind: 'coast', name: 'Raider Coast' });
      w.groundTargets = [];
      for (let i = 0; i < 5; i++) {
        w.groundTargets.push({ x: 180 + i * 230 + rnd() * 60, y: 600 + rnd() * 30, kind: i === 4 ? 'radar' : 'tank', hp: 1, dead: false, name: i === 4 ? 'RADAR DOME' : 'FUEL TANK' });
      }
    } else if (ground === 'canyon') {
      w.canyon = { left: 300, right: 980, y: 300 };
      w.groundTargets = [];
      for (let i = 0; i < 4; i++) {
        w.groundTargets.push({ x: 420 + i * 150 + rnd() * 50, y: 620 + rnd() * 20, kind: 'truck', hp: 1, dead: false, name: 'CONVOY ' + (i + 1) });
      }
    } else if (ground === 'fogsea') {
      w.islands.push({ x: 200, y: 600, w: 260, h: 90, kind: 'rock', name: 'Fog Rock' });
      w.islands.push({ x: 1060, y: 610, w: 240, h: 80, kind: 'rock', name: 'Fog Rock' });
    }
    // Clouds.
    for (let i = 0; i < 14; i++) {
      w.clouds.push({ x: rnd() * 1280, y: 40 + rnd() * 220, s: 40 + rnd() * 90, v: 6 + rnd() * 14 });
    }
    // Enemies.
    const e = missionDef.enemies;
    for (let i = 0; i < (e.fighters || 0); i++) spawnEnemy(w, 'fighter', rnd);
    for (let i = 0; i < (e.cargo || 0); i++) spawnEnemy(w, 'cargo', rnd);
    for (let i = 0; i < (e.boats || 0); i++) spawnEnemy(w, 'boat', rnd);
    if (e.ghost) spawnEnemy(w, 'ghost', rnd);
    return w;
  }

  function spawnEnemy(w, kind, rnd) {
    rnd = rnd || w.rnd;
    const base = { kind: kind, x: 150 + rnd() * 980, y: 120 + rnd() * 260, vx: 0, vy: 0, hp: 1, t: rnd() * 10, flareT: 0, diving: false, dead: false, bank: 0, dist: 800 + Math.floor(rnd() * 900) };
    if (kind === 'fighter') { base.hp = 1; base.vx = -40 - rnd() * 60; base.scale = 1; }
    if (kind === 'cargo') { base.hp = 2; base.vx = -25 - rnd() * 20; base.scale = 1.7; base.y = 150 + rnd() * 120; }
    if (kind === 'boat') { base.hp = 2; base.y = 560 + rnd() * 80; base.vx = 12 + rnd() * 14; base.scale = 1.4; }
    if (kind === 'ghost') {
      base.hp = 6; base.scale = 1.15; base.name = 'GHOST'; base.vx = -70; base.y = 200;
      base.taunts = ['You fly like a textbook. Textbooks burn.', 'Fourteen pilots. You will be fifteen.', 'My radar sees your fear, Falcon.'];
    }
    w.enemies.push(base);
    return base;
  }

  function explode(w, x, y, big) {
    w.blasts.push({ x: x, y: y, r: 8, max: big ? 130 : 80, t: 0, big: !!big });
    for (let i = 0; i < (big ? 16 : 9); i++) {
      const a = w.rnd() * Math.PI * 2, sp = 40 + w.rnd() * (big ? 220 : 140);
      w.debris.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, t: 0, life: 0.8 + w.rnd() * 0.9, s: 2 + w.rnd() * 4 });
    }
    w.shake = Math.min(14, w.shake + (big ? 10 : 5));
    SF.Audio.explosion(big);
  }

  function fireMissile(w) {
    if (w.missileCount <= 0 || !w.lockTarget || w.lock < 1) return false;
    w.missileCount--;
    const p = w.player;
    w.missiles.push({ x: p.x, y: p.y - 20, vx: 0, vy: -520, target: w.lockTarget, t: 0, trail: [] });
    SF.Audio.missile();
    return true;
  }

  function dropFlare(w) {
    if (w.flareCount <= 0) return false;
    w.flareCount--;
    w.flares.push({ x: w.player.x, y: w.player.y + 10, t: 0, life: 1.6 });
    SF.Audio.flare();
    // Flares decoy every missile currently chasing the player.
    w.missiles.forEach(function (m) { if (m.hostile) m.decoyed = true; });
    return true;
  }

  function update(w, input, dt, upgrades) {
    if (w.done) { updateFx(w, dt); return; }
    w.time += dt;
    w.timeLeft = Math.max(0, w.def.time - w.time);
    const p = w.player;
    // Steering: arrows/WASD move the jet inside its flight box.
    const steer = 340 * dt;
    if (input.left) { p.vx -= steer * 2.4; p.bank = Math.max(-0.6, p.bank - dt * 2.2); }
    if (input.right) { p.vx += steer * 2.4; p.bank = Math.min(0.6, p.bank + dt * 2.2); }
    if (input.up) p.vy -= steer * 1.6;
    if (input.down) p.vy += steer * 1.6;
    p.vx *= 0.90; p.vy *= 0.90;
    p.bank *= 0.94;
    p.x = Math.max(90, Math.min(1190, p.x + p.vx * dt));
    p.y = Math.max(150, Math.min(560, p.y + p.vy * dt));
    // Throttle / afterburner.
    w.boost = !!input.boost && w.fuel > 0;
    const targetSpeed = (w.boost ? 640 : 380) * (0.55 + w.throttle * 0.45);
    w.speed += (targetSpeed - w.speed) * dt * 0.8;
    w.alt += (input.up ? 260 : input.down ? -260 : 0) * dt;
    w.alt = Math.max(800, Math.min(24000, w.alt));
    w.heading += p.bank * 42 * dt;
    if (w.heading < 0) w.heading += 360;
    if (w.heading >= 360) w.heading -= 360;
    w.scroll += w.speed * dt * 0.35;
    w.route = Math.min(1, w.time / w.def.time);
    // Fuel burn: boost is thirsty.
    w.fuel -= dt * (w.boost ? 2.6 : 0.55) * (1 - (upgrades.engine || 0) * 0.08);
    if (w.fuel <= 0) { w.fuel = 0; w.done = true; w.won = false; w.reason = 'OUT OF FUEL — Falcon-1 glided into the sea.'; }
    // Clouds drift; storm rain and lightning.
    w.clouds.forEach(function (c) { c.x -= (c.v + w.speed * 0.05) * dt; if (c.x < -120) { c.x = 1400; c.y = 40 + w.rnd() * 220; } });
    if (w.def.weather === 'storm') {
      if (w.rnd() < dt * 0.5) { w.bolts.push({ x: 100 + w.rnd() * 1080, t: 0 }); SF.Audio.thunder(); }
      if (w.rain.length < 160 && w.rnd() < 0.6) w.rain.push({ x: w.rnd() * 1280, y: -10, v: 700 + w.rnd() * 300 });
      w.rain.forEach(function (r) { r.y += r.v * dt; r.x -= 120 * dt; });
      w.rain = w.rain.filter(function (r) { return r.y < 730; });
      w.bolts.forEach(function (b) { b.t += dt; });
      w.bolts = w.bolts.filter(function (b) { return b.t < 0.25; });
      if (w.bolts.length) w.flash = 0.25;
    }
    // Enemies move, weave and shoot.
    w.enemies.forEach(function (en) {
      if (en.dead) return;
      en.t += dt;
      if (en.kind === 'boat') {
        en.x += en.vx * dt;
        if (en.x > 1250 || en.x < 30) en.vx *= -1;
      } else if (en.kind === 'ghost') {
        // Ghost weaves hard and dives at the player.
        en.x += (Math.sin(en.t * 1.7) * 190 + (en.x < p.x ? 60 : -60)) * dt;
        en.y += Math.cos(en.t * 2.3) * 60 * dt;
        en.y = Math.max(110, Math.min(430, en.y));
        if (Math.floor(en.t) % 7 === 0 && en.t - Math.floor(en.t) < dt) {
          w.radio = 'GHOST: "' + en.taunts[Math.floor(en.t / 7) % en.taunts.length] + '"';
          w.radioT = 3; SF.Audio.radio();
        }
        if (en.t % 3 < dt && w.rnd() < 0.6) enemyShoot(w, en);
      } else {
        en.x += en.vx * dt - w.speed * 0.12 * dt;
        en.y += Math.sin(en.t * 1.3 + en.x * 0.01) * 26 * dt;
        if (en.x < -80) { en.x = 1360; en.y = 120 + w.rnd() * 260; }
        if (w.rnd() < dt * 0.25) enemyShoot(w, en);
      }
      // Distance label (metres) from the player.
      en.dist = Math.max(60, Math.floor(Math.hypot(en.x - p.x, en.y - p.y) * 2.2));
    });
    // Lock-on: nearest living enemy near the centre bracket builds lock.
    let best = null, bestD = 1e9;
    w.enemies.forEach(function (en) {
      if (en.dead) return;
      const d = Math.hypot(en.x - 640, en.y - 300);
      if (d < bestD) { bestD = d; best = en; }
    });
    const radarBonus = 1 + (upgrades.radar || 0) * 0.35;
    if (best && bestD < 260) {
      w.lockTarget = best;
      w.lock = Math.min(1, w.lock + dt * 0.55 * radarBonus);
      w.lockBeep += dt;
      if (w.lockBeep > (w.lock > 0.95 ? 0.18 : 0.45)) { w.lockBeep = 0; SF.Audio.lockTick(w.lock); if (w.lock >= 1) SF.Audio.lockFull(); }
    } else {
      w.lock = Math.max(0, w.lock - dt * 1.4);
      if (w.lock <= 0) w.lockTarget = null;
    }
    // Cannon.
    if (input.fire && w.time - (w.lastShot || 0) > 0.14 - (upgrades.cannon || 0) * 0.02) {
      w.lastShot = w.time; w.shots++;
      w.bullets.push({ x: p.x, y: p.y - 26, vy: -900, t: 0 });
      SF.Audio.gun();
    }
    w.bullets.forEach(function (b) { b.y += b.vy * dt; b.t += dt; });
    w.bullets = w.bullets.filter(function (b) { return b.y > -20 && b.t < 1.2; });
    // Bullet hits.
    w.bullets.forEach(function (b) {
      w.enemies.forEach(function (en) {
        if (en.dead || en.kind === 'boat') return;
        if (Math.abs(b.x - en.x) < 34 * en.scale && Math.abs(b.y - en.y) < 20 * en.scale) {
          b.t = 9; en.hp -= 1 + (upgrades.cannon || 0) * 0.5; w.hits++;
          SF.Audio.hit();
          if (en.hp <= 0) killEnemy(w, en);
        }
      });
    });
    // Missiles chase their target.
    w.missiles.forEach(function (m) {
      m.t += dt;
      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > 14) m.trail.shift();
      if (m.hostile) {
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (m.decoyed) { m.vy += 300 * dt; }
        else {
          const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
          m.vx += (dx / d) * 500 * dt; m.vy += (dy / d) * 500 * dt;
          const sp = Math.hypot(m.vx, m.vy);
          if (sp > 520) { m.vx *= 520 / sp; m.vy *= 520 / sp; }
          if (d < 26) { m.t = 9; w.hull -= 14; explode(w, p.x, p.y, false); SF.Audio.warning(); }
        }
        return;
      }
      const tgt = m.target;
      if (!tgt || tgt.dead) { m.vy -= 40 * dt; m.y += m.vy * dt; m.x += m.vx * dt; return; }
      const dx = tgt.x - m.x, dy = tgt.y - m.y, d = Math.hypot(dx, dy) || 1;
      const sp = 560;
      m.vx = (dx / d) * sp; m.vy = (dy / d) * sp;
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (d < 30) {
        m.t = 9;
        // Ghost pops flares to break the missile sometimes.
        if (tgt.kind === 'ghost' && w.rnd() < 0.45) {
          dropFlareFor(w, tgt); w.radio = 'GHOST: "Flares. You will have to do better."'; w.radioT = 2.5;
        } else {
          tgt.hp -= 3;
          if (tgt.hp <= 0) killEnemy(w, tgt);
          else explode(w, tgt.x, tgt.y, false);
        }
      }
    });
    w.missiles = w.missiles.filter(function (m) { return m.t < 4 && m.y > -40 && m.y < 800 && m.x > -40 && m.x < 1320; });
    // Flares burn out.
    w.flares.forEach(function (f) { f.t += dt; });
    w.flares = w.flares.filter(function (f) { return f.t < f.life; });
    // Ground targets: cannon or missile hits.
    if (w.groundTargets) {
      w.groundTargets.forEach(function (g) {
        if (g.dead) return;
        w.bullets.forEach(function (b) {
          if (Math.abs(b.x - g.x) < 30 && Math.abs(b.y - g.y) < 24) { b.t = 9; g.hp -= 1; if (g.hp <= 0) { g.dead = true; w.kills.ground++; explode(w, g.x, g.y, true); } }
        });
        w.missiles.forEach(function (m) {
          if (!m.hostile && Math.hypot(m.x - g.x, m.y - g.y) < 34) { m.t = 9; g.dead = true; w.kills.ground++; explode(w, g.x, g.y, true); }
        });
      });
    }
    // Boats sink when hit by a missile.
    w.missiles.forEach(function (m) {
      if (m.hostile) return;
      w.enemies.forEach(function (en) {
        if (en.dead || en.kind !== 'boat') return;
        if (Math.hypot(m.x - en.x, m.y - en.y) < 40) { m.t = 9; en.hp -= 3; if (en.hp <= 0) killEnemy(w, en); }
      });
    });
    // Enemy boats shoot back at the carrier.
    if (w.ships) {
      w.ships.forEach(function (s) {
        if (s.hp <= 0) return;
        if (w.rnd() < dt * 0.05) { s.hp -= 0; }
      });
    }
    // Hull / time checks.
    if (w.hull <= 0) { w.hull = 0; w.done = true; w.won = false; w.reason = 'FALCON-1 SHOT DOWN — the sea took the jet.'; explode(w, p.x, p.y, true); }
    if (w.timeLeft <= 0 && !w.done) { w.done = true; w.won = false; w.reason = 'TIME UP — the mission window closed.'; }
    // Win check.
    const need = w.def.target.count;
    const got = w.def.target.kind === 'mixed'
      ? w.kills.fighter + w.kills.boat
      : w.def.target.kind === 'ground' ? w.kills.ground
      : w.def.target.kind === 'ghost' ? w.kills.ghost
      : w.kills[w.def.target.kind] || 0;
    if (got >= need && !w.done) {
      w.done = true; w.won = true; w.reason = 'MISSION COMPLETE — ' + w.def.name + ' done.';
      w.score += 400;
    }
    if (w.radioT > 0) w.radioT -= dt;
    updateFx(w, dt);
  }

  function enemyShoot(w, en) {
    const p = w.player;
    const dx = p.x - en.x, dy = p.y - en.y, d = Math.hypot(dx, dy) || 1;
    w.missiles.push({ x: en.x, y: en.y + 10, vx: (dx / d) * 300, vy: (dy / d) * 300, hostile: true, t: 0, trail: [] });
  }

  function dropFlareFor(w, en) {
    for (let i = 0; i < 5; i++) w.flares.push({ x: en.x + (w.rnd() - 0.5) * 60, y: en.y + 10 + i * 8, t: 0, life: 1.4 });
    SF.Audio.flare();
  }

  function killEnemy(w, en) {
    if (en.dead) return;
    en.dead = true;
    const big = en.kind === 'cargo' || en.kind === 'boat' || en.kind === 'ghost';
    explode(w, en.x, en.y, big);
    const pay = SF.CONFIG.PAY[en.kind] || 150;
    w.score += pay;
    w.kills[en.kind] = (w.kills[en.kind] || 0) + 1;
    if (en.kind === 'boat') SF.Audio.splash();
    w.radio = 'SPLASH! ' + (en.kind === 'ghost' ? 'GHOST IS DOWN!' : en.kind.toUpperCase() + ' destroyed. +' + pay + ' cr');
    w.radioT = 2.5;
    SF.Audio.coin();
  }

  function updateFx(w, dt) {
    w.blasts.forEach(function (b) { b.t += dt; b.r += dt * 260; });
    w.blasts = w.blasts.filter(function (b) { return b.t < 0.9; });
    w.debris.forEach(function (d) { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 320 * dt; });
    w.debris = w.debris.filter(function (d) { return d.t < d.life; });
    if (w.shake > 0) w.shake = Math.max(0, w.shake - dt * 30);
    if (w.flash > 0) w.flash = Math.max(0, w.flash - dt);
  }

  // Kills so far against this mission's goal, for the HUD progress bar.
  function killsSoFar(w) {
    const k = w.def.target.kind;
    if (k === 'mixed') return w.kills.fighter + w.kills.boat;
    return w.kills[k] || 0;
  }

  return { makeMission: makeMission, spawnEnemy: spawnEnemy, explode: explode, fireMissile: fireMissile, dropFlare: dropFlare, update: update, killEnemy: killEnemy, killsSoFar: killsSoFar };
})();
