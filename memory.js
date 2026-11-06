// 模式三：表情配对（记忆翻牌）
// 四张照片各切两个取景，共 8 对 16 张牌。
window.PET = window.PET || {};

PET.Memory = (function () {
  const SIZE = 4;
  const TEMPLATE = [
    '<div class="memory">',
    '  <div class="mem-head">',
    '    <div class="mem-stats"></div>',
    '    <div class="mem-btns">',
    '      <button class="btn" data-act="hint" type="button">💡 提示（20 金币）</button>',
    '      <button class="btn" data-act="restart" type="button">↻ 重新洗牌</button>',
    '    </div>',
    '  </div>',
    '  <div class="mem-grid"></div>',
    '  <div class="mem-overlay"></div>',
    '</div>'
  ].join('\n');

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function mount(root) {
    root.innerHTML = TEMPLATE;
    const grid = root.querySelector('.mem-grid');
    const stats = root.querySelector('.mem-stats');
    const overlay = root.querySelector('.mem-overlay');

    const s = { moves: 0, matched: 0, started: 0, elapsed: 0, lock: false, cards: [], timer: null, dead: false };

    function buildTiles() {
      const jobs = [];
      const keys = [];
      PET.State.COSTUMES.forEach(function (c) {
        jobs.push(PET.Sprites.tile(c.photo, 'full').then(function (cv) {
          keys.push({ key: c.id + '-full', cv: cv, label: c.name + ' 全身' });
        }));
        jobs.push(PET.Sprites.tile(c.photo, 'face').then(function (cv) {
          keys.push({ key: c.id + '-face', cv: cv, label: c.name + ' 特写' });
        }));
      });
      return Promise.all(jobs).then(function () { return keys; });
    }

    function renderStats() {
      const best = PET.State.get().best;
      stats.innerHTML =
        '<span>步数 <b>' + s.moves + '</b></span>' +
        '<span>已配对 <b>' + s.matched + '/16</b></span>' +
        '<span>用时 <b>' + fmt(s.elapsed) + '</b></span>' +
        '<span class="mem-best">最少步数 <b>' + (best.memoryMoves || '—') + '</b></span>';
    }

    function fmt(sec) {
      const m = Math.floor(sec / 60), r = Math.floor(sec % 60);
      return m + ':' + (r < 10 ? '0' : '') + r;
    }

    function start() {
      overlay.innerHTML = '<p class="loading">正在切照片…</p>';
      buildTiles().then(function (tiles) {
        overlay.innerHTML = '';
        deal(tiles);
      }).catch(function (err) {
        overlay.innerHTML = '<p class="loading">出错了：' + err.message + '</p>';
      });
    }

    function cloneCanvas(cv) {
      const c = document.createElement('canvas');
      c.width = cv.width; c.height = cv.height;
      c.getContext('2d').drawImage(cv, 0, 0);
      return c;
    }

    function deal(tiles) {
      s.moves = 0; s.matched = 0; s.started = 0; s.elapsed = 0; s.lock = false; s.dead = false;
      const deck = shuffle(tiles.concat(tiles));
      grid.innerHTML = '';
      s.cards = deck.map(function (t, i) {
        const el = document.createElement('div');
        el.className = 'card';
        el.tabIndex = 0;
        el.innerHTML = '<div class="card-inner"><div class="card-face card-back"></div>' +
          '<div class="card-face card-front"></div></div>';
        el.querySelector('.card-front').appendChild(cloneCanvas(t.cv));
        el.setAttribute('data-key', t.key);
        el.setAttribute('data-index', i);
        grid.appendChild(el);
        return { el: el, key: t.key, flipped: false, matched: false };
      });
      renderStats();
    }

    function flip(card) {
      if (s.lock || card.matched || card.flipped || s.dead) return;
      if (!s.started) {
        s.started = performance.now();
        s.timer = setInterval(function () {
          s.elapsed = (performance.now() - s.started) / 1000;
          renderStats();
        }, 250);
      }
      card.flipped = true;
      card.el.classList.add('is-up');
      PET.Audio.play('flip');
      const open = s.cards.filter(function (c) { return c.flipped && !c.matched; });
      if (open.length < 2) return;
      s.moves++;
      s.lock = true;
      renderStats();
      const a = open[0], b = open[1];
      if (a.key === b.key) {
        setTimeout(function () {
          a.matched = b.matched = true;
          a.el.classList.add('is-matched');
          b.el.classList.add('is-matched');
          s.matched += 2;
          s.lock = false;
          renderStats();
          PET.Audio.play('match');
          if (s.matched === 16) finish();
        }, 380);
      } else {
        setTimeout(function () {
          a.flipped = b.flipped = false;
          a.el.classList.remove('is-up');
          b.el.classList.remove('is-up');
          s.lock = false;
          PET.Audio.play('nomatch');
        }, 760);
      }
    }

    function stars() {
      return s.moves <= 13 ? 3 : s.moves <= 19 ? 2 : 1;
    }

    function finish() {
      s.dead = true;
      if (s.timer) { clearInterval(s.timer); s.timer = null; }
      const sec = Math.round(s.elapsed);
      const newMoves = PET.State.recordBest('memoryMoves', s.moves, true);
      const newTime = PET.State.recordBest('memoryTime', sec, true);
      const st = stars();
      PET.State.addXp(12 + st * 8);
      PET.State.addCoins(st * 15);
      if (PET.State.mark('memory-win')) PET.UI.toast('成就解锁：眼力不错', 'good');
      if (st === 3 && PET.State.mark('memory-star3')) PET.UI.toast('成就解锁：过目不忘', 'good');
      PET.Audio.play('win');
      overlay.innerHTML = [
        '<div class="win-card">',
        '<div class="win-stars">' + '★'.repeat(st) + '<span>' + '★'.repeat(3 - st) + '</span></div>',
        '<h3>全部配对！</h3>',
        '<p>步数 <b>' + s.moves + '</b> · 用时 <b>' + fmt(sec) + '</b></p>',
        '<p class="win-note">' + (newMoves || newTime ? '新纪录已保存。' : '再快一点点就能破纪录。') + '</p>',
        '<p class="win-reward">+' + (st * 15) + ' 金币 · +' + (12 + st * 8) + ' 经验</p>',
        '<div class="ov-actions"><button class="btn btn-primary" data-act="again" type="button">再来一局</button>',
        '<button class="btn" data-act="home" type="button">回首页</button></div>',
        '</div>'
      ].join('');
      PET.UI.confetti(overlay, 18);
    }

    grid.addEventListener('click', function (ev) {
      const el = ev.target.closest('.card');
      if (!el) return;
      const card = s.cards[parseInt(el.getAttribute('data-index'), 10)];
      flip(card);
    });
    grid.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const el = ev.target.closest('.card');
      if (!el) return;
      ev.preventDefault();
      flip(s.cards[parseInt(el.getAttribute('data-index'), 10)]);
    });

    overlay.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      PET.Audio.play('click');
      if (act === 'again') start();
      else if (act === 'home') location.hash = '#/';
    });

    root.querySelector('.mem-btns').addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'restart') {
        PET.Audio.play('swoosh');
        if (s.timer) clearInterval(s.timer);
        start();
        return;
      }
      if (act === 'hint') {
        if (s.dead || !s.cards.length) return;
        if (PET.State.get().coins < 20) {
          PET.UI.toast('金币不够，先去跑酷或照顾小狗赚点', 'warn');
          PET.Audio.play('sad');
          return;
        }
        const pool = s.cards.filter(function (c) { return !c.matched && !c.flipped; });
        if (pool.length < 2) return;
        PET.State.addCoins(-20);
        PET.State.save();
        const key = pool[0].key;
        const pair = pool.filter(function (c) { return c.key === key; }).slice(0, 2);
        pair.forEach(function (c) { c.el.classList.add('is-hint'); });
        PET.Audio.play('star');
        setTimeout(function () { pair.forEach(function (c) { c.el.classList.remove('is-hint'); }); }, 900);
        renderStats();
      }
    });

    start();

    return {
      unmount: function () {
        if (s.timer) clearInterval(s.timer);
        s.dead = true;
      }
    };
  }

  return { mount: mount };
})();
