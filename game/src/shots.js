// SKY FALCON — Ace Combat Run: deterministic staged screenshot scenes.
// Reads ?shot= from the URL and poses the game into one dense frame:
// cockpit (dogfight + explosion), sunset (cargo attack), sea (lock-on +
// missile over the fleet), hangar (home with jet, loadout, save slots).
// The frame is frozen (no world update) so the render is identical every run.
// This file is part of the game; the shots it stages are real renders of the
// game's own code, taken by the maker's render script.
window.SF = window.SF || {};
SF.Shots = (function () {
  function apply() {
    let shot = null;
    try {
      const q = new URLSearchParams(window.location.search);
      shot = q.get('shot');
    } catch (e) { shot = null; }
    if (!shot) return;
    const G = SF.Game.G;
    const CFG = SF.CONFIG;
    G.profile = G.profile || SF.Game.freshProfile();
    // A played-through profile so the hangar shows upgrades and best grades.
    G.profile.credits = 2450;
    G.profile.unlocked = 6;
    G.profile.upgrades = { missiles: 2, flares: 1, armor: 2, engine: 1, radar: 2, tank: 1, cannon: 1 };
    G.profile.best = {
      'sunset-intercept': { grade: 'A', pct: 82, score: 1240 },
      'island-dogfight': { grade: 'S', pct: 93, score: 1980 },
      'fleet-shield': { grade: 'B', pct: 68, score: 1510 },
    };
    G.profile.played = 9;
    G.slot = 0;
    G.freeze = true;
    SF.Audio.setMuted(true);

    if (shot === 'cockpit') {
      G.missionIdx = 1;
      G.world = SF.World.makeMission(CFG.MISSIONS[1], G.profile.upgrades, 777);
      stageDogfight(G.world, 'cockpit');
      G.view = 'cockpit';
      G.screen = 'flight';
    } else if (shot === 'sunset') {
      G.missionIdx = 0;
      G.world = SF.World.makeMission(CFG.MISSIONS[0], G.profile.upgrades, 888);
      stageSunset(G.world);
      G.view = 'chase';
      G.screen = 'flight';
    } else if (shot === 'sea') {
      G.missionIdx = 2;
      G.world = SF.World.makeMission(CFG.MISSIONS[2], G.profile.upgrades, 999);
      stageSea(G.world);
      G.view = 'chase';
      G.screen = 'flight';
    } else if (shot === 'hangar') {
      G.screen = 'hangar';
    } else if (shot === 'title') {
      G.screen = 'title';
    }
  }

  function stageDogfight(w, view) {
    // Cockpit dogfight: a bandit dead ahead blowing up, two more closing,
    // lock bracket on the next target, full HUD lit.
    w.time = 42; w.timeLeft = 258; w.score = 1240; w.speed = 520; w.alt = 12400;
    w.heading = 87; w.throttle = 0.8; w.fuel = 78; w.hull = 86;
    w.route = 0.45; w.boost = true;
    w.missileCount = 6; w.flareCount = 8;
    w.enemies = [];
    const mk = function (kind, x, y, dist, hp) {
      const en = { kind: kind, x: x, y: y, vx: -30, vy: 0, hp: hp || 1, t: 1, flareT: 0, dead: false, bank: 0.15, dist: dist, scale: kind === 'cargo' ? 1.7 : 1 };
      w.enemies.push(en); return en;
    };
    mk('fighter', 640, 300, 780).dead = false;
    mk('fighter', 420, 210, 1253);
    mk('fighter', 880, 230, 1103);
    mk('fighter', 220, 330, 1023);
    // The bandit at centre-frame explodes: big fireball + smoke + debris.
    w.blasts = [{ x: 640, y: 300, r: 74, max: 130, t: 0.4, big: true }];
    for (let i = 0; i < 12; i++) {
      const a = i * 0.53;
      w.debris.push({ x: 640 + Math.cos(a) * 40, y: 300 + Math.sin(a) * 30, vx: Math.cos(a) * 80, vy: Math.sin(a) * 60, t: 0.2, life: 1.4, s: 4 });
    }
    w.lockTarget = w.enemies[1];
    w.lock = 0.72;
    w.missiles = [{ x: 700, y: 380, vx: 120, vy: -420, target: w.enemies[1], t: 0.3, trail: [{ x: 720, y: 420 }, { x: 710, y: 400 }] }];
    w.radio = 'ROOK: "Splash one! Bandit down — two more on your nose, Falcon!"';
    w.radioT = 9;
  }

  function stageSunset(w) {
    // Sunset chase: cargo plane ahead under the weapon bracket, volcano left,
    // cliff island right, afterburner lit, mission timer running.
    w.time = 96; w.timeLeft = 144; w.score = 860; w.speed = 610; w.alt = 2800;
    w.heading = 92; w.throttle = 0.95; w.fuel = 64; w.hull = 100;
    w.route = 0.62; w.boost = true;
    w.missileCount = 8; w.flareCount = 8;
    w.enemies = [];
    const cargo = { kind: 'cargo', x: 640, y: 210, vx: -30, vy: 0, hp: 2, t: 2, flareT: 0, dead: false, bank: 0, dist: 860, scale: 1.7 };
    w.enemies.push(cargo);
    w.enemies.push({ kind: 'fighter', x: 920, y: 260, vx: -50, vy: 0, hp: 1, t: 2, flareT: 0, dead: false, bank: -0.2, dist: 1420, scale: 1 });
    w.enemies.push({ kind: 'fighter', x: 380, y: 180, vx: -40, vy: 0, hp: 1, t: 2, flareT: 0, dead: false, bank: 0.2, dist: 1180, scale: 1 });
    w.lockTarget = cargo;
    w.lock = 0.58;
    w.player.x = 640; w.player.y = 480;
    w.radio = 'MARA: "Tower: cargo flight is at 0.86 miles. Weapons free, Falcon-1."';
    w.radioT = 9;
  }

  function stageSea(w) {
    // Sea combat: red lock-on over a diving bandit, missile away on a smoke
    // trail, a missile boat burning below, carrier and escorts in frame.
    w.time = 130; w.timeLeft = 170; w.score = 1730; w.speed = 480; w.alt = 8600;
    w.heading = 74; w.throttle = 0.7; w.fuel = 71; w.hull = 92;
    w.route = 0.55; w.boost = false;
    w.missileCount = 5; w.flareCount = 6;
    w.enemies = [];
    const bandit = { kind: 'fighter', x: 760, y: 210, vx: -60, vy: 0, hp: 1, t: 3, flareT: 0, dead: false, bank: 0.3, dist: 640, scale: 1 };
    w.enemies.push(bandit);
    w.enemies.push({ kind: 'fighter', x: 420, y: 240, vx: -40, vy: 0, hp: 1, t: 3, flareT: 0, dead: false, bank: -0.2, dist: 980, scale: 1 });
    // Enemy boats sit clear of the Kestrel's own escorts (DDG-41/42 at
    // x 330/950, y 600): staged boats go wide and low instead.
    w.enemies.push({ kind: 'boat', x: 1100, y: 655, vx: 14, vy: 0, hp: 1, t: 3, flareT: 0, dead: false, bank: 0, dist: 1120, scale: 1.4 });
    w.enemies.push({ kind: 'boat', x: 200, y: 655, vx: 12, vy: 0, hp: 2, t: 3, flareT: 0, dead: false, bank: 0, dist: 1540, scale: 1.4 });
    w.lockTarget = bandit;
    w.lock = 1;
    w.missiles = [{ x: 700, y: 400, vx: 200, vy: -480, target: bandit, t: 0.4, trail: [{ x: 660, y: 470 }, { x: 680, y: 440 }, { x: 690, y: 420 }] }];
    // The boat at (1100,655) is already burning.
    w.blasts = [{ x: 1100, y: 651, r: 58, max: 130, t: 0.5, big: true }];
    for (let i = 0; i < 8; i++) {
      const a = i * 0.8;
      w.debris.push({ x: 1100 + Math.cos(a) * 30, y: 651 + Math.sin(a) * 20, vx: Math.cos(a) * 60, vy: Math.sin(a) * 40, t: 0.3, life: 1.2, s: 4 });
    }
    w.player.x = 640; w.player.y = 480;
    w.radio = 'VEGA: "Missile away! Boat is burning — keep the fighters off the Kestrel!"';
    w.radioT = 9;
  }

  return { apply: apply };
})();
