// 模式一：小狗快跑（横版跑酷）
// 跳跃躲障碍、接零食攒连击，四套造型各有不同手感。
window.PET = window.PET || {};

PET.Runner = (function () {
  const GROUND_RATIO = 0.8;
  const BASE_H = 620;

  const GROUND_OBSTACLES = [
    { e: '🪣', s: 1.0 }, { e: '🧺', s: 1.06 }, { e: '🌵', s: 1.12 },
    { e: '🥬', s: 0.95 }, { e: '🪑', s: 1.1 }
  ];
  const AIR_OBSTACLES = [{ e: '🐝', s: 0.95 }, { e: '🎈', s: 1.1 }, { e: '🦋', s: 0.9 }];
  const PICKUPS = [
    { e: '🦴', v: 10, w: 6 }, { e: '🍎', v: 15, w: 4 },
    { e: '🍖', v: 25, w: 2 }, { e: '⭐', v: 50, w: 1 }
  ];

  const TEMPLATE = [
    '<div class="runner">',
    '  <div class="runner-stage">',
    '    <canvas></canvas>',
    '    <div class="runner-hud">',
    '      <div class="hud-main"><b class="hud-score">0</b><span class="hud-dist">0 米</span></div>',
    '      <div class="hud-side"><span class="hud-combo is-hidden">x1</span><span class="hud-shield is-hidden">🛡</span><span class="hud-best">最佳 0</span></div>',
    '    </div>',
    '    <div class="runner-overlay"></div>',
    '    <div class="runner-touch">',
    '      <button class="touch-duck" type="button">蹲下</button>',
    '      <button class="touch-jump" type="button">跳！</button>',
    '    </div>',
    '  </div>',
    '  <div class="costume-bar"></div>',
    '</div>'
  ].join('\n');

  function weightedPick(list) {
    let total = 0;
    list.forEach(function (i) { total += i.w; });
    let r = Math.random() * total;
    for (let i = 0; i < list.length; i++) {
      r -= list[i].w;
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  function mount(root) {
    root.innerHTML = TEMPLATE;
    const stage = root.querySelector('.runner-stage');
    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const overlay = root.querySelector('.runner-overlay');
    const elScore = root.querySelector('.hud-score');
    const elDist = root.querySelector('.hud-dist');
    const elCombo = root.querySelector('.hud-combo');
    const elShield = root.querySelector('.hud-shield');
    const elBest = root.querySelector('.hud-best');
    const bar = root.querySelector('.costume-bar');

    let W = 0, H = 0, dpr = 1, S = 1, groundY = 0;

    const g = {
      state: 'ready',           // ready | run | paused | over
      worldX: 0, speed: 0, dist: 0, score: 0,
      combo: 0, comboTimer: 0, multiplier: 1,
      shield: 0, invuln: 0,
      entities: [], particles: [], clouds: [], tufts: [],
      spawnTimer: 1.1, shake: 0, time: 0,
      coins: 0, newBest: false,
      costume: PET.State.current(), sprite: null,
      lastScore: -1, lastDist: -1, lastBest: -1, lastCombo: ''
    };

    const dog = { x: 0, y: 0, vy: 0, onGround: true, jumps: 0, duck: false, h: 0, w: 0, bob: 0, land: 0 };

    function resize() {
      const r = stage.getBoundingClientRect();
      W = Math.max(320, r.width); H = Math.max(240, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S = H / BASE_H;
      groundY = H * GROUND_RATIO;
      dog.x = W * 0.22;
      dog.h = Math.min(130 * S, H * 0.24);
      dog.w = dog.h * 0.95;
      if (dog.onGround) dog.y = groundY;
      buildScenery();
    }

    function buildScenery() {
      g.clouds = [];
      for (let i = 0; i < 5; i++) {
        g.clouds.push({ x: Math.random() * W, y: H * (0.08 + Math.random() * 0.28), s: 0.6 + Math.random() * 0.9 });
      }
      g.tufts = [];
      for (let i = 0; i < 40; i++) g.tufts.push({ x: Math.random() * W * 1.4, s: 0.5 + Math.random() * 0.8 });
    }

    function applyCostume(id) {
      const c = PET.State.costumeById(id);
      g.costume = c;
      g.sprite = PET.Sprites.peek(c.photo);
      renderBar();
    }

    function renderBar() {
      bar.innerHTML = PET.State.COSTUMES.map(function (c) {
        const unlocked = PET.State.isUnlocked(c.id);
        const active = c.id === g.costume.id;
        return '<button type="button" class="chip' + (active ? ' is-active' : '') + (unlocked ? '' : ' is-locked') +
          '" data-id="' + c.id + '" title="' + c.perk + '">' +
          '<span class="chip-emoji">' + (unlocked ? c.emoji : '🔒') + '</span>' +
          '<span class="chip-name">' + c.name + '</span></button>';
      }).join('');
    }

    bar.addEventListener('click', function (ev) {
      const btn = ev.target.closest('.chip');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (!PET.State.isUnlocked(id)) {
        PET.UI.toast('这套还没解锁，先去「养狗日常」把它养大一点', 'warn');
        PET.Audio.play('sad');
        return;
      }
      PET.State.select(id);
      applyCostume(id);
      PET.Audio.play('click');
      if (g.state === 'run') { g.shield = Math.max(g.shield, g.costume.stats.shield); syncHud(); }
    });

    function resetRun() {
      g.worldX = 0; g.speed = 300 * S; g.dist = 0; g.score = 0;
      g.combo = 0; g.comboTimer = 0; g.multiplier = 1;
      g.shield = g.costume.stats.shield;
      g.invuln = 0;
      g.entities = []; g.particles = [];
      // 开局给一点反应时间，不然刚点开始就撞死
      g.spawnTimer = 2.2;
      g.invuln = 1.6;
      g.shake = 0; g.coins = 0; g.newBest = false;
      dog.y = groundY; dog.vy = 0; dog.onGround = true; dog.jumps = 0; dog.duck = false; dog.land = 0;
      syncHud();
    }

    function syncHud() {
      const score = Math.floor(g.score);
      if (score !== g.lastScore) { elScore.textContent = score; g.lastScore = score; }
      const dist = Math.floor(g.dist);
      if (dist !== g.lastDist) { elDist.textContent = dist + ' 米'; g.lastDist = dist; }
      const best = Math.floor(PET.State.get().best.runner || 0);
      if (best !== g.lastBest) { elBest.textContent = '最佳 ' + best; g.lastBest = best; }
      elShield.classList.toggle('is-hidden', g.shield <= 0);
      const label = g.multiplier > 1 ? 'x' + g.multiplier + ' · 连击 ' + g.combo : '';
      if (label !== g.lastCombo) {
        elCombo.textContent = label;
        elCombo.classList.toggle('is-hidden', !label);
        g.lastCombo = label;
      }
    }

    // —— 生成 ——
    function spawnPattern() {
      const x = W + 80;
      const r = Math.random();
      const maxJumps = g.costume.stats.jumps;
      if (r < 0.42) {
        const o = GROUND_OBSTACLES[Math.floor(Math.random() * GROUND_OBSTACLES.length)];
        const size = 62 * S * o.s;
        g.entities.push({ kind: 'ground', e: o.e, x: x, w: size * 0.72, h: size, y: groundY });
        if (g.dist > 260 && Math.random() < 0.4) {
          g.entities.push({ kind: 'ground', e: o.e, x: x + size * 1.5, w: size * 0.72, h: size, y: groundY });
        }
      } else if (r < 0.62 && g.dist > 60) {
        const o = AIR_OBSTACLES[Math.floor(Math.random() * AIR_OBSTACLES.length)];
        const size = 56 * S * o.s;
        g.entities.push({ kind: 'air', e: o.e, x: x, w: size * 0.8, h: size, y: groundY - dog.h * 0.85, wob: Math.random() * 6 });
      } else if (r < 0.92) {
        const p = weightedPick(PICKUPS);
        const count = 3 + Math.floor(Math.random() * 3);
        const high = Math.random() < 0.45;
        const baseY = high ? groundY - dog.h * (maxJumps >= 3 ? 2.0 : 1.55) : groundY - dog.h * 0.55;
        for (let i = 0; i < count; i++) {
          const arc = high ? Math.sin((i / (count - 1)) * Math.PI) * dog.h * 0.7 : 0;
          g.entities.push({ kind: 'pickup', e: p.e, v: p.v, x: x + i * 62 * S, w: 40 * S, h: 40 * S, y: baseY - arc, spin: Math.random() * 6 });
        }
      } else if (g.shield <= 0) {
        g.entities.push({ kind: 'shield', e: '🛡', x: x, w: 44 * S, h: 44 * S, y: groundY - dog.h * 0.9, spin: 0 });
      }
    }

    function burst(x, y, chars, count) {
      for (let i = 0; i < count; i++) {
        g.particles.push({
          x: x, y: y, vx: (Math.random() - 0.5) * 260 * S, vy: (-Math.random() * 260 - 40) * S,
          life: 0.5 + Math.random() * 0.4, age: 0, ch: chars[Math.floor(Math.random() * chars.length)],
          size: (14 + Math.random() * 14) * S
        });
      }
    }

    // —— 操作 ——
    function jump() {
      if (g.state !== 'run') return;
      const maxJumps = g.costume.stats.jumps;
      if (dog.jumps >= maxJumps) return;
      const first = dog.jumps === 0;
      dog.vy = -(first ? 880 : 780) * S * (first ? 1 : Math.pow(0.94, dog.jumps - 1));
      dog.onGround = false;
      dog.jumps++;
      dog.duck = false;
      PET.Audio.play(dog.jumps === 1 ? 'jump' : dog.jumps === 2 ? 'jump2' : 'jump3');
      burst(dog.x, groundY, ['💨', '·', '·'], 4);
    }

    function setDuck(on) {
      if (g.state !== 'run') return;
      if (on && dog.onGround) dog.duck = true;
      if (!on) dog.duck = false;
    }

    function start() {
      PET.Audio.ensure();
      PET.Audio.startMusic();
      resetRun();
      g.state = 'run';
      overlay.innerHTML = '';
      stage.focus();
    }

    function pause(on) {
      if (on && g.state === 'run') {
        g.state = 'paused';
        showOverlay('<h3>休息一下</h3><p class="ov-sub">小狗在原地等你</p><button class="btn btn-primary" data-act="resume">继续跑</button>');
      } else if (!on && g.state === 'paused') {
        g.state = 'run';
        overlay.innerHTML = '';
      }
    }

    function gameOver() {
      g.state = 'over';
      PET.Audio.play('hit');
      g.shake = 1;
      g.coins = Math.floor(g.score / 20);
      PET.State.addCoins(g.coins);
      const prev = PET.State.get().best.runner || 0;
      g.newBest = PET.State.recordBest('runner', Math.floor(g.score));
      PET.State.get().totalDistance = Math.floor((PET.State.get().totalDistance || 0) + g.dist);
      PET.State.save();
      if (g.score >= 500 && PET.State.mark('runner-500')) PET.UI.toast('成就解锁：小飞狗', 'good');
      if (g.score >= 1500 && PET.State.mark('runner-1500')) PET.UI.toast('成就解锁：马拉松选手', 'good');
      const lines = g.score >= 1200 ? ['这速度，蜜蜂都追不上你！'] :
        g.score >= 600 ? ['跑得漂亮，零食都收进肚子里了。'] :
          g.score >= 200 ? ['不错呀，再试一次能更远。'] : ['刚开始热身，我们再来一趟。'];
      showOverlay([
        '<h3>摔了一跤</h3>',
        '<p class="ov-sub">' + lines[0] + '</p>',
        '<div class="ov-stats">',
        '<div><b>' + Math.floor(g.score) + '</b><span>得分</span></div>',
        '<div><b>' + Math.floor(g.dist) + '</b><span>米</span></div>',
        '<div><b>+' + g.coins + '</b><span>金币</span></div>',
        '</div>',
        g.newBest ? '<p class="ov-best">新纪录！</p>' : '<p class="ov-sub">最佳 ' + Math.floor(prev) + '</p>',
        '<div class="ov-actions"><button class="btn btn-primary" data-act="restart">再来一局</button>',
        '<button class="btn" data-act="home">回首页</button></div>'
      ].join(''));
    }

    function showOverlay(html) { overlay.innerHTML = html; }

    function readyScreen() {
      const c = g.costume;
      showOverlay([
        '<div class="ov-dog"><img src="' + PET.Sprites.photo(c.photo) + '" alt="' + c.name + '"></div>',
        '<h3>小狗快跑</h3>',
        '<p class="ov-sub">穿着「' + c.name + '」出发 · ' + c.perk + '</p>',
        '<ul class="ov-keys">',
        '<li><kbd>空格</kbd>／点屏幕 跳跃' + (c.stats.jumps > 2 ? '，可三段跳' : '，可二段跳') + '</li>',
        '<li><kbd>↓</kbd>／蹲下键 躲开头的蜜蜂和气球</li>',
        '<li><kbd>1</kbd>–<kbd>4</kbd> 换造型，接零食攒连击倍率</li>',
        '</ul>',
        '<div class="ov-actions"><button class="btn btn-primary" data-act="start">开始跑</button></div>'
      ].join(''));
    }

    overlay.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      PET.Audio.play('click');
      if (act === 'start' || act === 'restart') start();
      else if (act === 'resume') pause(false);
      else if (act === 'home') location.hash = '#/';
    });

    function onKey(ev, down) {
      if (ev.repeat && down) return;
      const k = ev.code;
      if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
        ev.preventDefault();
        if (down) {
          if (g.state === 'ready' || g.state === 'over') start();
          else jump();
        }
      } else if (k === 'ArrowDown' || k === 'KeyS') {
        ev.preventDefault();
        setDuck(down);
      } else if (down && k === 'Enter') {
        if (g.state === 'ready' || g.state === 'over') start();
        else if (g.state === 'paused') pause(false);
      } else if (down && k === 'KeyP') {
        pause(g.state === 'run');
      } else if (down && /^Digit[1-4]$/.test(k)) {
        const c = PET.State.COSTUMES[parseInt(k.slice(5), 10) - 1];
        if (c && PET.State.isUnlocked(c.id)) {
          PET.State.select(c.id); applyCostume(c.id); PET.Audio.play('click');
          PET.UI.toast('换上「' + c.name + '」', 'good');
        } else if (c) {
          PET.UI.toast('「' + c.name + '」还没解锁', 'warn');
        }
      }
    }
    const keyDown = function (e) { onKey(e, true); };
    const keyUp = function (e) { onKey(e, false); };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    stage.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.runner-touch') || ev.target.closest('[data-act]')) return;
      if (g.state === 'ready' || g.state === 'over') { start(); return; }
      if (g.state === 'paused') { pause(false); return; }
      jump();
    });

    const tJump = root.querySelector('.touch-jump');
    const tDuck = root.querySelector('.touch-duck');
    tJump.addEventListener('pointerdown', function (ev) { ev.preventDefault(); if (g.state !== 'run') start(); else jump(); });
    tDuck.addEventListener('pointerdown', function (ev) { ev.preventDefault(); setDuck(true); });
    tDuck.addEventListener('pointerup', function () { setDuck(false); });
    tDuck.addEventListener('pointercancel', function () { setDuck(false); });
    tDuck.addEventListener('pointerleave', function () { setDuck(false); });

    const vis = function () { if (document.hidden && g.state === 'run') pause(true); };
    document.addEventListener('visibilitychange', vis);

    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    // —— 更新 ——
    function update(dt) {
      g.time += dt;
      if (g.state !== 'run') return;

      const target = (300 + Math.min(340, g.dist * 0.55)) * S * g.costume.stats.speed;
      g.speed += (target - g.speed) * Math.min(1, dt * 0.6);
      g.worldX += g.speed * dt;
      g.dist += g.speed * dt / (58 * S);
      g.score += g.speed * dt / (58 * S) * 0.6 * g.costume.stats.score;

      if (g.invuln > 0) g.invuln -= dt;
      if (g.comboTimer > 0) {
        g.comboTimer -= dt;
        if (g.comboTimer <= 0) { g.combo = 0; g.multiplier = 1; }
      }
      if (g.dist >= 100 && PET.State.mark('first-run')) PET.UI.toast('成就解锁：第一次散步', 'good');

      // 小狗物理
      dog.vy += 2400 * S * dt;
      dog.y += dog.vy * dt;
      if (dog.y >= groundY) {
        if (!dog.onGround) { dog.land = 1; burst(dog.x, groundY, ['💨'], 3); }
        dog.y = groundY; dog.vy = 0; dog.onGround = true; dog.jumps = 0;
      }
      if (dog.land > 0) dog.land = Math.max(0, dog.land - dt * 5);
      if (dog.onGround && !dog.duck && Math.random() < dt * 12) {
        g.particles.push({ x: dog.x - dog.w * 0.4, y: groundY - 4 * S, vx: -g.speed * 0.2, vy: -30 * S * Math.random(), life: 0.4, age: 0, ch: '·', size: 8 * S });
      }

      // 生成
      g.spawnTimer -= dt;
      if (g.spawnTimer <= 0) {
        spawnPattern();
        const gap = Math.max(0.72, 1.5 - g.dist * 0.0016);
        g.spawnTimer = gap * (0.8 + Math.random() * 0.5);
      }

      const dogBox = {
        x: dog.x - dog.w * 0.34, y: dog.y - (dog.duck ? dog.h * 0.5 : dog.h * 0.92),
        w: dog.w * 0.68, h: dog.duck ? dog.h * 0.5 : dog.h * 0.92
      };

      for (let i = g.entities.length - 1; i >= 0; i--) {
        const en = g.entities[i];
        en.x -= g.speed * dt;
        if (en.kind === 'air') en.y += Math.sin(g.time * 3 + en.wob) * 12 * S * dt;
        if (en.spin !== undefined) en.spin += dt * 3;
        if (en.x + en.w < -40) { g.entities.splice(i, 1); continue; }

        const box = { x: en.x - en.w / 2, y: en.y - en.h / 2, w: en.w, h: en.h };
        if (en.kind === 'ground') { box.y = en.y - en.h; }
        const hit = box.x < dogBox.x + dogBox.w && box.x + box.w > dogBox.x &&
          box.y < dogBox.y + dogBox.h && box.y + box.h > dogBox.y;
        if (!hit) continue;

        if (en.kind === 'pickup' || en.kind === 'shield') {
          g.entities.splice(i, 1);
          if (en.kind === 'shield') {
            g.shield = 1; PET.Audio.play('shield');
            burst(en.x, box.y, ['✨'], 5);
          } else {
            g.combo++; g.comboTimer = 2.6;
            g.multiplier = Math.min(5, 1 + Math.floor(g.combo / 3));
            g.score += en.v * g.multiplier * g.costume.stats.score;
            PET.Audio.play(en.v >= 50 ? 'star' : 'treat');
            burst(en.x, box.y, [en.e, '✨'], 4);
            if (g.combo >= 8 && PET.State.mark('combo-8')) PET.UI.toast('成就解锁：连击达人', 'good');
          }
          syncHud();
        } else if (g.invuln <= 0) {
          if (g.shield > 0) {
            g.shield = 0; g.invuln = 1.2; g.shake = 0.5;
            PET.Audio.play('shield');
            burst(en.x, box.y, ['💫', '✨'], 6);
            en.x = -999;
            syncHud();
          } else {
            g.score = Math.floor(g.score);
            gameOver();
            return;
          }
        }
      }

      for (let i = g.particles.length - 1; i >= 0; i--) {
        const p = g.particles[i];
        p.age += dt;
        if (p.age > p.life) { g.particles.splice(i, 1); continue; }
        p.x += p.vx * dt - g.speed * dt * 0.35;
        p.y += p.vy * dt;
        p.vy += 420 * S * dt;
      }

      for (let i = 0; i < g.clouds.length; i++) {
        const c = g.clouds[i];
        c.x -= g.speed * dt * 0.08;
        if (c.x < -160 * c.s) { c.x = W + 120; c.y = H * (0.08 + Math.random() * 0.28); }
      }
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3);
      syncHud();
    }

    // —— 绘制 ——
    function drawBackground() {
      const sky = ctx.createLinearGradient(0, 0, 0, groundY);
      sky.addColorStop(0, '#bfe3ff');
      sky.addColorStop(0.55, '#e8f4ff');
      sky.addColorStop(1, '#fff4dc');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ffd977';
      ctx.beginPath();
      ctx.arc(W * 0.82, H * 0.16, 34 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(W * 0.82, H * 0.16, 60 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 远山
      const hills = [
        { off: 0.12, y: groundY - 10 * S, r: 150 * S, color: '#cfe6c9' },
        { off: 0.28, y: groundY - 4 * S, r: 110 * S, color: '#b6dcae' }
      ];
      hills.forEach(function (h) {
        ctx.fillStyle = h.color;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        const shift = (g.worldX * h.off) % (h.r * 1.6);
        for (let x = -h.r * 1.6 - shift; x < W + h.r * 2; x += h.r * 1.6) {
          ctx.arc(x + h.r * 0.8, h.y, h.r * 0.8, Math.PI, 0);
          ctx.lineTo(x + h.r * 1.6, h.y);
        }
        ctx.lineTo(W, groundY);
        ctx.closePath();
        ctx.fill();
      });

      // 云
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      g.clouds.forEach(function (c) {
        const r = 22 * S * c.s;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.arc(c.x + r * 0.9, c.y + r * 0.2, r * 0.75, 0, Math.PI * 2);
        ctx.arc(c.x - r * 0.9, c.y + r * 0.25, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function drawGround() {
      ctx.fillStyle = '#e7d9b8';
      ctx.fillRect(0, groundY, W, H - groundY);
      ctx.fillStyle = '#9ecb7f';
      ctx.fillRect(0, groundY, W, 8 * S);
      ctx.fillStyle = '#8bbd6d';
      const step = 26 * S;
      const shift = g.worldX % step;
      for (let x = -shift; x < W + step; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, groundY + 8 * S);
        ctx.quadraticCurveTo(x + 4 * S, groundY - 8 * S, x + 8 * S, groundY + 8 * S);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(120,100,60,.15)';
      ctx.lineWidth = 2 * S;
      const step2 = 90 * S;
      const shift2 = (g.worldX * 1.6) % step2;
      for (let x = -shift2; x < W + step2; x += step2) {
        ctx.beginPath();
        ctx.moveTo(x, groundY + 26 * S);
        ctx.lineTo(x + 34 * S, groundY + 26 * S);
        ctx.stroke();
      }
    }

    function drawEntities() {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      g.entities.forEach(function (en) {
        const size = Math.max(en.w, en.h) * 1.18;
        ctx.save();
        ctx.translate(en.x, en.y - (en.kind === 'ground' ? en.h / 2 : 0));
        if (en.kind === 'pickup' || en.kind === 'shield') {
          ctx.translate(0, Math.sin(g.time * 3 + (en.spin || 0)) * 5 * S);
        }
        ctx.font = Math.round(size) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(en.e, 0, 0);
        ctx.restore();
      });
    }

    function drawDog() {
      const h = dog.duck ? dog.h * 0.62 : dog.h;
      const w = h * (g.sprite ? g.sprite.w / g.sprite.h : 1);
      const feet = dog.y;
      const air = (groundY - dog.y) / (120 * S);

      // 影子
      ctx.save();
      ctx.globalAlpha = Math.max(0.05, 0.25 - air * 0.12);
      ctx.fillStyle = '#5a4a2a';
      ctx.beginPath();
      ctx.ellipse(dog.x, groundY + 6 * S, w * 0.42 * (1 - air * 0.2), 8 * S * (1 - air * 0.25), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const bob = dog.onGround && !dog.duck ? Math.sin(g.time * 16) * 4 * S : 0;
      ctx.save();
      ctx.translate(dog.x, feet - h / 2 + bob);
      const tilt = dog.onGround ? Math.sin(g.time * 16) * 0.04 : (dog.vy < 0 ? -0.14 : 0.12);
      ctx.rotate(tilt);
      if (dog.land > 0) ctx.scale(1 + dog.land * 0.12, 1 - dog.land * 0.12);
      if (g.costume.facing === 'left') ctx.scale(-1, 1);
      if (g.invuln > 0 && Math.floor(g.time * 12) % 2 === 0) ctx.globalAlpha = 0.45;
      if (g.sprite) {
        ctx.drawImage(g.sprite.canvas, -w / 2, -h / 2, w, h);
      } else {
        ctx.font = Math.round(h) + 'px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🐶', 0, 0);
      }
      ctx.restore();

      if (g.shield > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(90,190,255,.75)';
        ctx.lineWidth = 3 * S;
        ctx.setLineDash([6 * S, 5 * S]);
        ctx.lineDashOffset = -g.time * 30;
        ctx.beginPath();
        ctx.ellipse(dog.x, feet - h / 2, w * 0.62, h * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawParticles() {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      g.particles.forEach(function (p) {
        const a = 1 - p.age / p.life;
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.font = Math.round(p.size) + 'px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
        ctx.fillText(p.ch, p.x, p.y);
        ctx.restore();
      });
    }

    function drawSpeedLines() {
      if (g.speed < 430 * S) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 2 * S;
      for (let i = 0; i < 5; i++) {
        const y = ((g.time * 300 + i * 140) % (groundY - 40)) + 20;
        const len = 40 * S + (i % 3) * 30 * S;
        ctx.beginPath();
        ctx.moveTo(W - ((g.time * 900 + i * 220) % (W + 200)), y);
        ctx.lineTo(W - ((g.time * 900 + i * 220) % (W + 200)) + len, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    function draw() {
      ctx.save();
      if (g.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * S * g.shake, (Math.random() - 0.5) * 8 * S * g.shake);
      drawBackground();
      drawGround();
      drawEntities();
      drawDog();
      drawParticles();
      drawSpeedLines();
      ctx.restore();
    }

    let raf = 0, last = 0;
    function frame(ts) {
      const dt = Math.min(0.033, (ts - last) / 1000 || 0);
      last = ts;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }

    resize();
    applyCostume(g.costume.id);
    resetRun();
    readyScreen();
    raf = requestAnimationFrame(frame);

    return {
      unmount: function () {
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', keyDown);
        window.removeEventListener('keyup', keyUp);
        document.removeEventListener('visibilitychange', vis);
        ro.disconnect();
      }
    };
  }

  return { mount: mount };
})();
