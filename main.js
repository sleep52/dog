// 入口：路由、首页、顶栏、提示气泡、小事件总线。
window.PET = window.PET || {};

PET.UI = (function () {
  const listeners = {};

  function on(name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
    return function () { off(name, fn); };
  }

  function off(name, fn) {
    const arr = listeners[name] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }

  function emit(name, payload) {
    (listeners[name] || []).slice().forEach(function (fn) { fn(payload); });
  }

  function toast(text, kind) {
    const root = document.getElementById('toasts');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast-' + kind : '');
    el.textContent = text;
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 400);
    }, 2600);
  }

  function confetti(container, count) {
    if (!container) return;
    const chars = ['🎉', '✨', '🐝', '💛', '🦴'];
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'confetti';
      s.textContent = chars[Math.floor(Math.random() * chars.length)];
      s.style.left = (Math.random() * 100) + '%';
      s.style.fontSize = (14 + Math.random() * 18) + 'px';
      s.style.setProperty('--fall', (1.4 + Math.random() * 1.4).toFixed(2) + 's');
      s.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
      container.appendChild(s);
      s.addEventListener('animationend', function () { s.remove(); });
    }
  }

  return { on: on, off: off, emit: emit, toast: toast, confetti: confetti };
})();

PET.App = (function () {
  const MODES = {
    '/': { title: '小狗乐园', render: home },
    '/runner': { title: '小狗快跑', module: 'Runner' },
    '/pet': { title: '养狗日常', module: 'Pet' },
    '/memory': { title: '表情配对', module: 'Memory' },
    '/album': { title: '小狗图鉴', module: 'Album' }
  };

  let current = null, currentPath = null;

  function parseHash() {
    const raw = (location.hash || '#/').replace(/^#/, '');
    return MODES[raw] ? raw : '/';
  }

  function home(view) {
    const s = PET.State.get();
    const c = PET.State.current();
    const p = PET.State.xpProgress();
    view.innerHTML = [
      '<div class="home">',
      '  <div class="hero">',
      '    <div class="hero-dog" id="heroDog"></div>',
      '    <div class="hero-text">',
      '      <h1>小狗乐园</h1>',
      '      <p class="hero-sub">一只穿着碎花裙和蜜蜂卫衣的小蝴蝶犬，',
      '      以及围绕它的三个小游戏。</p>',
      '      <div class="hero-stats">',
      '        <span class="pill">Lv.' + p.level + '</span>',
      '        <span class="pill">🪙 ' + s.coins + '</span>',
      '        <span class="pill">🏃 最佳 ' + (s.best.runner || 0) + '</span>',
      '        <span class="pill">🃏 最少 ' + (s.best.memoryMoves || '—') + ' 步</span>',
      '        <span class="pill">🏅 ' + s.achievements.length + '/' + PET.State.ACHIEVEMENTS.length + '</span>',
      '      </div>',
      '      <div class="hero-xp"><i style="width:' + Math.round(p.ratio * 100) + '%"></i></div>',
      '      <p class="hero-wear">当前穿着：' + c.emoji + ' ' + c.name + ' · ' + c.perk + '</p>',
      '    </div>',
      '  </div>',
      '  <div class="cards">',
      modeCard('/runner', '🏃', '小狗快跑', '跳跃、下蹲、接零食，连击越高分数越夸张。四套造型手感不一样。'),
      modeCard('/pet', '🍼', '养狗日常', '四项需求一直在掉，喂肉干、倒水、丢球、摸摸、梳毛、睡一觉，攒经验解锁衣柜。'),
      modeCard('/memory', '🃏', '表情配对', '四张照片切成 16 张牌，翻出相同的两张。比步数，也比时间。'),
      modeCard('/album', '📸', '小狗图鉴', '原图放大看，顺便检查成就墙。'),
      '  </div>',
      '  <div class="tips">',
      '    <h2>怎么玩</h2>',
      '    <ul>',
      '      <li><kbd>空格</kbd> / <kbd>↑</kbd> 跳，<kbd>↓</kbd> 蹲，<kbd>1</kbd>–<kbd>4</kbd> 换造型，<kbd>P</kbd> 暂停。</li>',
      '      <li>手机上直接点屏幕跳，右下角有「蹲下」按钮。</li>',
      '      <li>跑酷赚的金币和经验会存进同一份存档，养狗到 2/3/4 级解锁另外三套造型。</li>',
      '      <li>进度存在浏览器本地（localStorage），换浏览器会清零。</li>',
      '    </ul>',
      '  </div>',
      '</div>'
    ].join('');

    const slot = view.querySelector('#heroDog');
    const sp = PET.Sprites.peek(c.photo);
    if (sp) {
      const cv = document.createElement('canvas');
      cv.width = sp.canvas.width; cv.height = sp.canvas.height;
      cv.getContext('2d').drawImage(sp.canvas, 0, 0);
      cv.className = 'hero-canvas';
      slot.appendChild(cv);
    } else {
      slot.textContent = '🐶';
    }
  }

  function modeCard(path, emoji, title, desc) {
    return '<a class="mode-card" href="#' + path + '" data-goto="' + path.slice(1) + '">' +
      '<span class="mc-emoji">' + emoji + '</span>' +
      '<span class="mc-title">' + title + '</span>' +
      '<span class="mc-desc">' + desc + '</span></a>';
  }

  function renderHeader() {
    const s = PET.State.get();
    const p = PET.State.xpProgress();
    document.getElementById('hdrStats').innerHTML =
      '<span class="pill">Lv.' + p.level + '</span><span class="pill">🪙 ' + s.coins + '</span>';
    const muteBtn = document.getElementById('btnMute');
    muteBtn.textContent = s.muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('is-off', s.muted);
  }

  function route() {
    const path = parseHash();
    if (path === currentPath && current) return;
    if (current && current.unmount) current.unmount();
    currentPath = path;
    const mode = MODES[path];
    document.getElementById('view').innerHTML = '';
    document.body.setAttribute('data-mode', path.slice(1) || 'home');
    document.querySelectorAll('.nav a').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === '#' + path);
    });
    document.getElementById('viewTitle').textContent = mode.title;

    const view = document.getElementById('view');
    if (mode.render) {
      mode.render(view);
      current = { unmount: function () { } };
    } else {
      PET.Audio.play('swoosh');
      current = PET[mode.module].mount(view);
    }
    renderHeader();
    window.scrollTo(0, 0);
  }

  function boot() {
    PET.State.load();
    PET.State.syncUnlocks();
    const boot$ = document.getElementById('boot');
    const ids = PET.State.COSTUMES.map(function (c) { return c.photo; });

    PET.Sprites.all(ids).then(function () {
      boot$.classList.add('is-done');
      setTimeout(function () { boot$.remove(); }, 700);
      route();
    }).catch(function (err) {
      boot$.innerHTML = '<div class="boot-error"><h2>素材处理失败</h2><p>' + err.message + '</p>' +
        '<p>请确认 assets.js 和其它 .js 文件都和 index.html 在同一个目录里。</p></div>';
    });

    window.addEventListener('hashchange', route);

    document.getElementById('btnMute').addEventListener('click', function () {
      const muted = PET.Audio.toggleMute();
      renderHeader();
      PET.UI.toast(muted ? '已静音' : '声音打开', 'good');
      if (!muted) PET.Audio.play('bark');
    });

    document.getElementById('btnReset').addEventListener('click', function () {
      if (!confirm('清空存档？等级、金币、解锁的造型和纪录都会归零。')) return;
      PET.State.reset();
      renderHeader();
      PET.UI.emit('costume-change', PET.State.get().costume);
      PET.UI.toast('存档已清空', 'warn');
      route();
    });

    // 浏览器要求用户手势之后才能出声
    const wake = function () {
      PET.Audio.ensure();
      if (!PET.State.get().muted) PET.Audio.startMusic();
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
  }

  return { boot: boot, route: route, renderHeader: renderHeader };
})();

document.addEventListener('DOMContentLoaded', function () { PET.App.boot(); });
