// SKY FALCON — Ace Combat Run: game state, screens, input, save slots.
// Screens: title, save slots, hangar/shop, briefing, flight, pause, results,
// game over, help. Progress (missions, credits, upgrades, best grades) is
// stored in localStorage, three slots, exactly as the brief orders.
window.SF = window.SF || {};
SF.Game = (function () {
  const CFG = SF.CONFIG;
  const R = SF.Render;
  let canvas = null, ctx = null;
  const G = {
    screen: 'title', slot: 0, view: 'chase', freeze: false,
    profile: null, world: null, missionIdx: 0, selUpgrade: 0,
    input: {}, mouse: { x: 0, y: 0 }, buttons: [],
    results: null, gameover: null, lastTime: 0, muted: false,
    titleT: 0, slotMode: 'load',
  };

  function freshProfile() {
    return { credits: CFG.START_CREDITS, upgrades: {}, unlocked: 1, best: {}, pilot: 'FALCON-1', played: 0 };
  }
  function saveKey(slot) { return CFG.SAVE_PREFIX + slot; }
  function loadSlot(slot) {
    try {
      const raw = window.localStorage.getItem(saveKey(slot));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSlot(slot, profile) {
    try { window.localStorage.setItem(saveKey(slot), JSON.stringify(profile)); } catch (e) { /* headless */ }
  }
  function slotSummary(slot) {
    const p = loadSlot(slot);
    if (!p) return null;
    let bestGrade = '-';
    const grades = Object.keys(p.best).map(function (k) { return p.best[k].grade; });
    if (grades.length) bestGrade = grades.sort()[0];
    return { credits: p.credits, unlocked: p.unlocked, best: bestGrade, played: p.played || 0 };
  }

  function gradeFor(pct) {
    for (let i = 0; i < CFG.GRADES.length; i++) {
      if (pct >= CFG.GRADES[i].min) return CFG.GRADES[i];
    }
    return CFG.GRADES[CFG.GRADES.length - 1];
  }

  function startMission(idx) {
    G.missionIdx = idx;
    G.world = SF.World.makeMission(CFG.MISSIONS[idx], G.profile.upgrades, 20261126 + idx * 7919);
    G.view = 'chase';
    G.screen = 'briefing';
    SF.Audio.unlock();
    SF.Audio.startMusic();
  }
  function launchMission() {
    G.screen = 'flight';
    G.world.radio = CFG.MISSIONS[G.missionIdx].briefing[0][0] === 'vega'
      ? 'VEGA: "Falcon-1, you are clear to launch. Good hunting."'
      : 'TOWER: "Falcon-1, catapult is hot. Launch when ready."';
    G.world.radioT = 3.5;
    SF.Audio.radio();
    SF.Audio.startEngine();
  }
  function finishMission() {
    const w = G.world, def = w.def;
    const acc = w.shots ? Math.round((w.hits / w.shots) * 100) : 100;
    const killPct = Math.min(100, Math.round((SF.World.killsSoFar(w) / def.target.count) * 100));
    const pct = w.won
      ? Math.round(killPct * 0.45 + (w.hull / w.maxHull) * 100 * 0.25 + acc * 0.15 + (w.timeLeft / def.time) * 100 * 0.15)
      : Math.round(killPct * 0.4);
    const g = gradeFor(pct);
    const earned = w.score + (w.won ? CFG.MISSION_BONUS[G.missionIdx] : 0);
    G.results = { won: w.won, pct: pct, grade: g, score: w.score, earned: earned, acc: acc, kills: killPct, hull: Math.round((w.hull / w.maxHull) * 100), timeLeft: Math.round(w.timeLeft), reason: w.reason, mission: def };
    if (w.won) {
      G.profile.credits += earned;
      G.profile.unlocked = Math.max(G.profile.unlocked, Math.min(6, G.missionIdx + 2));
      const prev = G.profile.best[def.id];
      if (!prev || pct > prev.pct) G.profile.best[def.id] = { grade: g.grade, pct: pct, score: w.score };
      G.profile.played++;
      saveSlot(G.slot, G.profile);
    }
    SF.Audio.stopEngine();
    SF.Audio.stopMusic();
    if (w.won) SF.Audio.coin();
    G.screen = 'results';
  }
  function gameOver() {
    G.gameover = { reason: G.world.reason };
    SF.Audio.stopEngine();
    SF.Audio.stopMusic();
    G.screen = 'gameover';
  }

  // ---------- buttons ----------
  function btn(x, y, w, h, label, action, opts) {
    opts = opts || {};
    G.buttons.push({ x: x, y: y, w: w, h: h, action: action });
    ctx.fillStyle = opts.fill || 'rgba(10,24,44,0.9)';
    R.rr(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = opts.stroke || 'rgba(126,226,255,0.6)';
    ctx.lineWidth = 2; ctx.stroke();
    R.text(ctx, label, x + w / 2, y + h / 2 + 6, opts.size || 16, opts.color || '#eaf6ff', 'center');
  }
  function clickAt(x, y) {
    for (let i = G.buttons.length - 1; i >= 0; i--) {
      const b = G.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return true; }
    }
    return false;
  }

  // ---------- screens ----------
  function drawBackdrop(cols) {
    const g = ctx.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, cols[0]); g.addColorStop(0.6, cols[1]); g.addColorStop(1, cols[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
  }
  function drawTopBar() {
    R.panel(ctx, 12, 10, 1256, 46, 'rgba(6,14,28,0.88)');
    R.text(ctx, 'SKY FALCON', 28, 40, 20, '#ffd34d');
    R.text(ctx, 'ACE COMBAT RUN  •  SQUADRON KESTREL', 210, 40, 14, '#9db8cc');
    R.text(ctx, 'CREDITS  ' + (G.profile ? G.profile.credits : 0) + ' cr', 1000, 40, 16, '#ffd34d');
    R.text(ctx, 'SLOT ' + (G.slot + 1), 1180, 40, 14, '#7ee2ff');
  }
  function drawCrew(ctx2, x, y, person, scale) {
    const p = CFG.PEOPLE[person];
    ctx2.fillStyle = '#2a2f38';
    ctx2.beginPath(); ctx2.arc(x, y - 34 * scale, 13 * scale, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = p.color;
    ctx2.beginPath(); ctx2.arc(x, y - 34 * scale, 13 * scale, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = '#e8c39a';
    ctx2.beginPath(); ctx2.arc(x, y - 36 * scale, 8 * scale, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = '#3a4a2f';
    ctx2.fillRect(x - 12 * scale, y - 22 * scale, 24 * scale, 26 * scale);
    ctx2.fillStyle = '#222';
    ctx2.fillRect(x - 10 * scale, y + 4 * scale, 8 * scale, 16 * scale);
    ctx2.fillRect(x + 2 * scale, y + 4 * scale, 8 * scale, 16 * scale);
    R.text(ctx2, p.name, x, y + 34, 12, p.color, 'center');
    R.text(ctx2, p.role, x, y + 50, 10, '#9db8cc', 'center');
  }

  function drawTitle() {
    drawBackdrop(['#e8a56b', '#c97e4e', '#2c2f45']);
    // Carrier deck at dawn, big jet parked centre.
    ctx.fillStyle = '#3a3f46'; ctx.fillRect(0, 560, 1280, 160);
    ctx.fillStyle = '#ffd34d';
    for (let i = 0; i < 12; i++) ctx.fillRect(40 + i * 106, 640, 50, 5);
    R.drawJet(ctx, 640, 470, 2.6, 0, false, false);
    R.drawFlame(ctx, 640, 505, false);
    drawCrew(ctx, 380, 620, 'gus', 1.4);
    drawCrew(ctx, 900, 620, 'vega', 1.4);
    R.text(ctx, 'SKY FALCON', 640, 150, 84, '#ffd34d', 'center', 'bold ');
    R.text(ctx, 'ACE COMBAT RUN', 640, 205, 34, '#fff', 'center');
    R.text(ctx, 'Six sorties. One ace. Zero room for error.', 640, 245, 18, '#eaf6ff', 'center');
    R.text(ctx, 'A HD jet-combat campaign  •  lock-on missiles  •  exploding ships  •  3 save slots', 640, 275, 14, '#9db8cc', 'center');
    btn(490, 320, 300, 56, '▶  FLY  (SAVE SLOTS)', function () { G.slotMode = 'load'; G.screen = 'slots'; }, { fill: '#7a4d00', size: 18 });
    btn(490, 390, 300, 48, 'HOW TO FLY', function () { G.screen = 'help'; });
    btn(490, 450, 300, 48, G.muted ? 'SOUND: OFF' : 'SOUND: ON', function () { toggleMute(); });
    R.text(ctx, 'Keyboard + mouse  •  desktop browser  •  no network needed', 640, 540, 13, '#9db8cc', 'center');
    R.text(ctx, 'v1.0  •  original game, original art, original story', 640, 690, 12, 'rgba(234,246,255,0.6)', 'center');
  }

  function drawSlots() {
    drawBackdrop(['#0d1b3d', '#1d3a6e', '#050914']);
    drawTopBar();
    R.text(ctx, G.slotMode === 'load' ? 'SELECT SAVE SLOT' : 'CHOOSE SLOT TO SAVE', 640, 110, 30, '#ffd34d', 'center');
    R.text(ctx, 'Progress, missions, credits and upgrades are saved per slot.', 640, 140, 15, '#eaf6ff', 'center');
    for (let i = 0; i < 3; i++) {
      const s = slotSummary(i);
      const x = 140 + i * 360, y = 180;
      R.panel(ctx, x, y, 320, 300, 'rgba(10,24,44,0.92)', i === G.slot ? '#ffd34d' : 'rgba(126,226,255,0.45)');
      R.text(ctx, 'SLOT ' + (i + 1), x + 160, y + 44, 22, '#ffd34d', 'center');
      if (s) {
        R.text(ctx, 'Missions open: ' + s.unlocked + ' / 6', x + 24, y + 100, 16, '#eaf6ff');
        R.text(ctx, 'Credits: ' + s.credits + ' cr', x + 24, y + 134, 16, '#eaf6ff');
        R.text(ctx, 'Best grade: ' + s.best, x + 24, y + 168, 16, '#eaf6ff');
        R.text(ctx, 'Sorties flown: ' + s.played, x + 24, y + 202, 16, '#eaf6ff');
        R.text(ctx, '— SAVED —', x + 160, y + 250, 14, '#9dff8a', 'center');
      } else {
        R.text(ctx, '— EMPTY —', x + 160, y + 130, 18, '#9db8cc', 'center');
        R.text(ctx, 'Fresh campaign,', x + 160, y + 170, 15, '#eaf6ff', 'center');
        R.text(ctx, '400 cr starting purse', x + 160, y + 196, 15, '#eaf6ff', 'center');
      }
      btn(x + 60, y + 268, 200, 44, s ? 'LOAD SLOT ' + (i + 1) : 'NEW GAME', (function (slot) {
        return function () {
          G.slot = slot;
          G.profile = loadSlot(slot) || freshProfile();
          saveSlot(slot, G.profile);
          G.screen = 'hangar';
          SF.Audio.unlock(); SF.Audio.startMusic();
        };
      })(i), { size: 15 });
    }
    btn(490, 540, 300, 48, '← BACK TO TITLE', function () { G.screen = 'title'; });
    R.text(ctx, 'Tip: your hangar, shop and mission progress live in the slot you pick.', 640, 620, 13, '#9db8cc', 'center');
  }

  function drawHangar() {
    drawBackdrop(['#2c2f45', '#3d3a30', '#14161f']);
    drawTopBar();
    // Hangar interior: warm lamps, big jet centre-left, crew around it.
    ctx.fillStyle = 'rgba(255,190,90,0.16)';
    ctx.fillRect(0, 70, 1280, 120);
    ctx.fillStyle = '#ffd34d';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(120 + i * 220, 82, 8, 0, Math.PI * 2); ctx.fill(); }
    R.drawJet(ctx, 330, 400, 2.4, 0, false, false);
    R.text(ctx, 'FALCON-1  •  F/A-77 SKY FALCON', 330, 520, 16, '#eaf6ff', 'center');
    R.text(ctx, 'HULL ' + (100 + (G.profile.upgrades.armor || 0) * 40) + '  •  MISSILES ' + (4 + (G.profile.upgrades.missiles || 0) * 2) + '  •  FUEL ' + (100 + (G.profile.upgrades.tank || 0) * 40), 330, 546, 13, '#9dff8a', 'center');
    drawCrew(ctx, 150, 585, 'gus', 1.3);
    drawCrew(ctx, 520, 585, 'rook', 1.3);
    R.text(ctx, 'GUS: "She is fuelled and hungry, Falcon."', 330, 692, 14, '#ff9d5c', 'center');
    // Mission map: 6 sortie cards, top-right.
    R.text(ctx, 'SORTIES — pick your mission', 700, 110, 18, '#ffd34d');
    CFG.MISSIONS.forEach(function (m, i) {
      const x = 690 + (i % 3) * 192, y = 130 + Math.floor(i / 3) * 96;
      const open = i < G.profile.unlocked;
      const best = G.profile.best[m.id];
      R.panel(ctx, x, y, 182, 84, open ? 'rgba(10,24,44,0.92)' : 'rgba(20,20,26,0.85)', best ? '#9dff8a' : 'rgba(126,226,255,0.45)');
      R.text(ctx, 'M' + m.num + ' ' + m.name, x + 10, y + 22, 12, open ? '#fff' : '#666');
      // Sub wraps to two short lines so no card text is ever clipped.
      const words = m.sub.split(' ');
      let line1 = '', line2 = '';
      words.forEach(function (wd) {
        if ((line1 + ' ' + wd).trim().length <= 26 && !line2) line1 = (line1 + ' ' + wd).trim();
        else line2 = (line2 + ' ' + wd).trim();
      });
      R.text(ctx, line1, x + 10, y + 40, 9, '#9db8cc');
      R.text(ctx, line2, x + 10, y + 54, 9, '#9db8cc');
      R.text(ctx, open ? (best ? 'BEST ' + best.grade + '  •  ' + best.pct + '%' : 'READY — ' + m.weather.toUpperCase()) : '🔒 LOCKED', x + 10, y + 74, 11, best ? '#9dff8a' : (open ? '#ffd34d' : '#666'));
      if (open) G.buttons.push({ x: x, y: y, w: 182, h: 84, action: (function (mi) { return function () { startMission(mi); }; })(i) });
    });
    // Shop: 7 upgrade cards, bottom-right.
    R.text(ctx, 'HANGAR SHOP — spend credits, fly stronger', 700, 340, 18, '#ffd34d');
    CFG.UPGRADES.forEach(function (u, i) {
      const lvl = G.profile.upgrades[u.id] || 0;
      const x = 700, y = 362 + i * 42;
      const afford = G.profile.credits >= u.price && lvl < u.max;
      R.panel(ctx, x, y, 566, 36, 'rgba(10,24,44,0.9)', lvl >= u.max ? '#9dff8a' : 'rgba(126,226,255,0.4)');
      R.text(ctx, u.name + '  Lv' + lvl + '/' + u.max, x + 12, y + 23, 14, '#fff');
      R.text(ctx, u.desc, x + 250, y + 23, 12, '#9db8cc');
      R.text(ctx, lvl >= u.max ? 'MAXED' : u.price + ' cr', x + 556, y + 23, 13, lvl >= u.max ? '#9dff8a' : (afford ? '#ffd34d' : '#ff4d6a'), 'right');
      if (afford) G.buttons.push({ x: x, y: y, w: 566, h: 36, action: (function (up) { return function () { buyUpgrade(up); }; })(u) });
    });
    btn(700, 668, 180, 36, 'SAVE SLOTS', function () { G.slotMode = 'load'; G.screen = 'slots'; }, { size: 14 });
    btn(900, 668, 180, 36, 'HOW TO FLY', function () { G.screen = 'help'; }, { size: 14 });
    btn(1100, 668, 166, 36, 'TITLE', function () { G.screen = 'title'; }, { size: 14 });
  }
  function buyUpgrade(u) {
    const lvl = G.profile.upgrades[u.id] || 0;
    if (lvl >= u.max || G.profile.credits < u.price) return;
    G.profile.credits -= u.price;
    G.profile.upgrades[u.id] = lvl + 1;
    saveSlot(G.slot, G.profile);
    SF.Audio.coin();
  }

  function drawBriefing() {
    const m = CFG.MISSIONS[G.missionIdx];
    drawBackdrop(['#0d1b3d', '#1d3a6e', '#050914']);
    drawTopBar();
    R.text(ctx, 'MISSION ' + m.num + ' — ' + m.name, 640, 110, 30, '#ffd34d', 'center');
    R.text(ctx, m.sub + '  •  Weather: ' + m.weather.toUpperCase() + '  •  Time limit ' + Math.floor(m.time / 60) + ':' + String(m.time % 60).padStart(2, '0'), 640, 140, 15, '#eaf6ff', 'center');
    // Route map strip.
    R.panel(ctx, 140, 160, 1000, 90, 'rgba(10,24,44,0.9)');
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(180, 205);
    for (let i = 1; i <= 5; i++) ctx.lineTo(180 + i * 180, 205 + (i % 2 ? -18 : 18));
    ctx.stroke();
    ['KESTREL', 'STRAIT', 'ISLANDS', 'FLEET', 'COAST', 'GHOST'].forEach(function (n, i) {
      const x = 180 + i * 180;
      ctx.fillStyle = i <= G.missionIdx ? '#ffd34d' : '#5a6a7a';
      ctx.beginPath(); ctx.arc(x, 205 + (i % 2 ? -18 : 18), 8, 0, Math.PI * 2); ctx.fill();
      R.text(ctx, n, x, 240, 11, '#eaf6ff', 'center');
    });
    R.text(ctx, 'OBJECTIVE: ' + m.goal, 640, 285, 17, '#9dff8a', 'center');
    // Dialogue.
    m.briefing.forEach(function (line, i) {
      const p = CFG.PEOPLE[line[0]];
      const y = 310 + i * 62;
      R.panel(ctx, 140, y, 1000, 52, 'rgba(10,24,44,0.9)', p.color);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(172, y + 26, 16, 0, Math.PI * 2); ctx.fill();
      R.text(ctx, p.name.charAt(0), 172, y + 31, 14, '#0a0d12', 'center');
      R.text(ctx, p.name + ' — ' + p.role, 200, y + 20, 13, p.color);
      R.text(ctx, '"' + line[1] + '"', 200, y + 42, 14, '#eaf6ff');
    });
    btn(440, 600, 400, 56, '▶  LAUNCH  —  FALCON-1', function () { launchMission(); }, { fill: '#7a4d00', size: 18 });
    btn(490, 668, 300, 36, '← BACK TO HANGAR', function () { G.screen = 'hangar'; }, { size: 14 });
  }

  function drawResults() {
    const r = G.results;
    drawBackdrop(r.won ? ['#1d4a2f', '#2c6a44', '#0a1a12'] : ['#4a1d1d', '#6a2c2c', '#1a0a0a']);
    drawTopBar();
    R.text(ctx, r.won ? 'MISSION COMPLETE' : 'MISSION FAILED', 640, 110, 34, r.won ? '#9dff8a' : '#ff4d6a', 'center');
    R.text(ctx, r.mission.name + ' — ' + r.reason, 640, 142, 15, '#eaf6ff', 'center');
    // Big grade.
    R.panel(ctx, 140, 170, 260, 260, 'rgba(10,24,44,0.92)', r.grade.color);
    R.text(ctx, r.grade.grade, 270, 330, 150, r.grade.color, 'center', 'bold ');
    R.text(ctx, r.pct + '%', 270, 390, 26, '#eaf6ff', 'center');
    R.text(ctx, 'GRADE', 270, 414, 13, '#9db8cc', 'center');
    // Score breakdown bars.
    R.panel(ctx, 430, 170, 710, 260, 'rgba(10,24,44,0.92)');
    R.text(ctx, 'SCORE BREAKDOWN', 460, 200, 16, '#ffd34d');
    const rows = [
      ['Kills vs objective', r.kills, '#ff4d6a'],
      ['Hull remaining', r.hull, '#9dff8a'],
      ['Cannon accuracy', r.acc, '#7ee2ff'],
      ['Time left', Math.round((r.timeLeft / r.mission.time) * 100), '#ffd34d'],
    ];
    rows.forEach(function (row, i) {
      const y = 226 + i * 44;
      R.text(ctx, row[0], 460, y + 6, 15, '#eaf6ff');
      R.bar(ctx, 700, y - 8, 300, 18, row[1] / 100, row[2]);
      R.text(ctx, row[1] + '%', 1015, y + 6, 15, '#eaf6ff');
    });
    R.text(ctx, 'Mission score ' + r.score + '  •  Credits earned ' + r.earned + ' cr  •  Total credits ' + G.profile.credits + ' cr', 460, 406, 15, '#ffd34d');
    btn(300, 480, 260, 52, '↻  RETRY MISSION', function () { startMission(G.missionIdx); }, { size: 16 });
    btn(580, 480, 260, 52, 'HANGAR / SHOP', function () { G.screen = 'hangar'; }, { size: 16 });
    if (r.won && G.missionIdx < 5 && G.missionIdx + 1 < G.profile.unlocked) {
      btn(860, 480, 260, 52, 'NEXT MISSION ▶', function () { startMission(G.missionIdx + 1); }, { fill: '#7a4d00', size: 16 });
    }
    btn(490, 560, 300, 44, 'SAVE SLOTS', function () { G.slotMode = 'load'; G.screen = 'slots'; });
    R.text(ctx, 'Progress auto-saved to slot ' + (G.slot + 1) + ' on a win.', 640, 640, 13, '#9db8cc', 'center');
  }

  function drawGameOver() {
    drawBackdrop(['#1a0a0a', '#3d1414', '#050505']);
    R.text(ctx, 'FALCON-1 IS DOWN', 640, 200, 44, '#ff4d6a', 'center');
    R.text(ctx, G.gameover ? G.gameover.reason : '', 640, 250, 18, '#eaf6ff', 'center');
    R.text(ctx, 'The squadron recovers the pilot. The jet is another story.', 640, 285, 15, '#9db8cc', 'center');
    btn(380, 360, 220, 52, '↻  FLY AGAIN', function () { startMission(G.missionIdx); }, { size: 16 });
    btn(680, 360, 220, 52, 'HANGAR', function () { G.screen = 'hangar'; }, { size: 16 });
    R.text(ctx, 'Tip: buy ARMOR PLATE and FLARES before a hard sortie.', 640, 460, 14, '#ffd34d', 'center');
  }

  function drawPause() {
    if (G.world) R.drawFlight(ctx, G.world, G.view);
    ctx.fillStyle = 'rgba(4,8,16,0.72)';
    ctx.fillRect(0, 0, 1280, 720);
    R.text(ctx, 'PAUSED', 640, 220, 44, '#ffd34d', 'center');
    btn(490, 280, 300, 52, '▶  RESUME', function () { G.screen = 'flight'; }, { size: 17 });
    btn(490, 346, 300, 48, '↻  RESTART SORTIE', function () { startMission(G.missionIdx); launchMission(); });
    btn(490, 406, 300, 48, 'HANGAR', function () { SF.Audio.stopEngine(); G.screen = 'hangar'; });
    btn(490, 466, 300, 48, G.muted ? 'SOUND: OFF' : 'SOUND: ON', function () { toggleMute(); });
  }

  function drawHelp() {
    drawBackdrop(['#0d1b3d', '#1d3a6e', '#050914']);
    drawTopBar();
    R.text(ctx, 'HOW TO FLY', 640, 110, 30, '#ffd34d', 'center');
    CFG.CONTROLS.forEach(function (c, i) {
      const y = 150 + i * 42;
      R.panel(ctx, 340, y, 600, 34, 'rgba(10,24,44,0.9)');
      R.text(ctx, c[0], 360, y + 22, 15, '#ffd34d');
      R.text(ctx, c[1], 620, y + 22, 15, '#eaf6ff');
    });
    R.text(ctx, 'Lock-on: keep the bandit inside the centre diamond. The bracket closes and the tone', 640, 560, 14, '#eaf6ff', 'center');
    R.text(ctx, 'rises — at full LOCK press F or click to fire. Flares (C) break missiles chasing you.', 640, 584, 14, '#eaf6ff', 'center');
    R.text(ctx, 'Afterburner is fast and thirsty. Watch the fuel gauge, or the sea will catch you.', 640, 608, 14, '#eaf6ff', 'center');
    btn(490, 640, 300, 44, '← BACK', function () { G.screen = G.profile ? 'hangar' : 'title'; });
  }

  function toggleMute() {
    G.muted = !G.muted;
    SF.Audio.setMuted(G.muted);
  }

  // ---------- loop ----------
  function draw() {
    G.buttons = [];
    ctx.clearRect(0, 0, 1280, 720);
    if (G.screen === 'title') drawTitle();
    else if (G.screen === 'slots') drawSlots();
    else if (G.screen === 'hangar') drawHangar();
    else if (G.screen === 'briefing') drawBriefing();
    else if (G.screen === 'flight' || G.screen === 'pause') {
      if (G.world) {
        if (G.screen === 'pause') drawPause();
        else R.drawFlight(ctx, G.world, G.view);
      }
    }
    else if (G.screen === 'results') drawResults();
    else if (G.screen === 'gameover') drawGameOver();
    else if (G.screen === 'help') drawHelp();
  }

  function step(now) {
    const dt = Math.min(0.05, (now - G.lastTime) / 1000 || 0.016);
    G.lastTime = now;
    if (G.screen === 'title') G.titleT += dt;
    if (G.screen === 'flight' && G.world && !G.freeze) {
      // Throttle keys: E spools the engine up, Q spools it down.
      if (G.input.throttleUp) G.world.throttle = Math.min(1, G.world.throttle + dt * 0.5);
      if (G.input.throttleDown) G.world.throttle = Math.max(0.15, G.world.throttle - dt * 0.5);
      SF.World.update(G.world, G.input, dt, G.profile.upgrades);
      SF.Audio.setThrottle(G.world.throttle, G.world.boost);
      if (G.world.done) {
        if (G.world.won) finishMission(); else gameOver();
      }
    }
    draw();
  }

  function onKey(e, down) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') G.input.left = down;
    if (k === 'arrowright' || k === 'd') G.input.right = down;
    if (k === 'arrowup' || k === 'w') G.input.up = down;
    if (k === 'arrowdown' || k === 's') G.input.down = down;
    if (k === 'e') G.input.throttleUp = down;
    if (k === 'q') G.input.throttleDown = down;
    if (k === 'shift') G.input.boost = down;
    if (k === ' ') { G.input.fire = down; if (e.preventDefault) e.preventDefault(); }
    if (!down) return;
    if (k === 'f' && G.screen === 'flight' && G.world) SF.World.fireMissile(G.world);
    if (k === 'c' && G.screen === 'flight' && G.world) SF.World.dropFlare(G.world);
    if (k === 'v' && G.screen === 'flight') G.view = G.view === 'chase' ? 'cockpit' : 'chase';
    if (k === 'p' && G.screen === 'flight') { G.screen = 'pause'; SF.Audio.stopEngine(); }
    else if (k === 'p' && G.screen === 'pause') { G.screen = 'flight'; SF.Audio.startEngine(); }
    if (k === 'm') toggleMute();
    if (k === 'enter') {
      if (G.screen === 'title') { G.slotMode = 'load'; G.screen = 'slots'; }
      else if (G.screen === 'briefing') launchMission();
      else if (G.screen === 'results') G.screen = 'hangar';
      else if (G.screen === 'gameover') startMission(G.missionIdx);
    }
    if (k === 'escape' && G.screen === 'flight') { G.screen = 'pause'; SF.Audio.stopEngine(); }
  }

  function boot() {
    canvas = document.getElementById('game');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Mouse: click fires a missile in flight, clicks buttons elsewhere.
    canvas.addEventListener('mousedown', function (e) {
      const r = canvas.getBoundingClientRect();
      const sx = r.width ? 1280 / r.width : 1;
      const sy = r.height ? 720 / r.height : 1;
      const x = (e.clientX - r.left) * sx;
      const y = (e.clientY - r.top) * sy;
      if (G.screen === 'flight' && G.world && !clickAt(x, y)) SF.World.fireMissile(G.world);
      else clickAt(x, y);
    });
    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    G.lastTime = performance.now();
    const loop = function (now) { step(now); if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(loop); };
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(loop);
    else setInterval(function () { step(performance.now()); }, 33);
    // Expose state for screenshots and playtests.
    window.SKYFALCON = G;
    if (window.SF && SF.Shots) SF.Shots.apply();
  }

  return {
    G: G, boot: boot, startMission: startMission, launchMission: launchMission,
    loadSlot: loadSlot, saveSlot: saveSlot, freshProfile: freshProfile,
    finishMission: finishMission, gameOver: gameOver, toggleMute: toggleMute,
  };
})();
