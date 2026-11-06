// 模式二：养狗日常（喂食 + 心情养成）
// 四项需求随时间下降，照顾它攒心情和经验，升级解锁新造型。
window.PET = window.PET || {};

PET.Pet = (function () {
  const NEEDS = [
    { id: 'hunger', name: '饱饱', emoji: '🍖', decay: 1.15, color: '#f0a24b' },
    { id: 'water', name: '水润', emoji: '💧', decay: 0.95, color: '#5bb8f0' },
    { id: 'energy', name: '精神', emoji: '⚡', decay: 0.75, color: '#f2d24b' },
    { id: 'fun', name: '开心', emoji: '🎾', decay: 1.35, color: '#8fce6b' }
  ];

  const ACTIONS = [
    {
      id: 'snack', name: '喂肉干', emoji: '🍖', cd: 1100, fx: ['🍖', '✨'], sound: 'nom',
      apply: function (n) { n.hunger += 26; n.fun += 5; n.water -= 6; },
      lines: ['咔嚓咔嚓，三秒光盘。', '再给一块嘛，就一块。', '嚼得很响，我很满意。']
    },
    {
      id: 'water', name: '倒水', emoji: '💧', cd: 1100, fx: ['💧', '💧'], sound: 'gulp',
      apply: function (n) { n.water += 30; n.hunger -= 3; },
      lines: ['咕嘟咕嘟……喝好了。', '舌头卷起来喝水的样子很认真。', '水盆空了，谢谢！']
    },
    {
      id: 'ball', name: '丢球', emoji: '🎾', cd: 1500, fx: ['🎾', '🐾'], sound: 'swoosh',
      apply: function (n) { n.fun += 30; n.energy -= 15; n.hunger -= 8; },
      lines: ['我叼回来了！再丢一次！', '球是我的，谁都不给。', '跑了八圈，值。']
    },
    {
      id: 'pet', name: '摸摸', emoji: '🤲', cd: 700, fx: ['💗', '💗'], sound: 'bark',
      apply: function (n) { n.fun += 12; n.energy += 6; },
      lines: ['蹭蹭你的手。', '这里，这里，再挠挠。', '尾巴已经不受控制了。']
    },
    {
      id: 'brush', name: '梳毛', emoji: '🧹', cd: 1800, fx: ['✨', '🌟'], sound: 'swoosh',
      apply: function (n) { n.fun += 9; n.energy += 4; },
      lines: ['毛被梳得蓬蓬的。', '梳下来的毛能再捏一只我。', '舒服到眯眼。']
    },
    {
      id: 'nap', name: '睡一觉', emoji: '💤', cd: 0, fx: ['💤', '😴'], sound: 'click',
      toggleNap: true,
      apply: function () { },
      lines: ['趴下啦，别吵。', '做个有骨头的梦。', '呼……呼……']
    }
  ];

  const IDLE_LINES = [
    '盯着你看，等你先开口。', '门口有声音，我先叫两声。', '把裙子转了一圈，好看吧。',
    '闻了闻地板，什么都没有。', '打了个小小的哈欠。', '尾巴摇得像个小风扇。',
    '把牵引绳叼过来又放下了。', '在窝里转了三圈才趴好。'
  ];

  const TEMPLATE = [
    '<div class="petgame">',
    '  <div class="pet-stage">',
    '    <div class="pet-bubble"></div>',
    '    <div class="pet-scene"><div class="pet-holder"></div><div class="pet-shadow"></div></div>',
    '    <div class="pet-fx"></div>',
    '    <div class="pet-caption"><span class="pet-costume"></span><span class="pet-mood"></span></div>',
    '  </div>',
    '  <div class="pet-panel">',
    '    <div class="pet-level"></div>',
    '    <div class="needs"></div>',
    '    <div class="actions"></div>',
    '    <div class="pet-log"></div>',
    '  </div>',
    '</div>'
  ].join('\n');

  function clamp(v) { return Math.max(0, Math.min(100, v)); }

  function mount(root) {
    root.innerHTML = TEMPLATE;
    const holder = root.querySelector('.pet-holder');
    const bubble = root.querySelector('.pet-bubble');
    const fxRoot = root.querySelector('.pet-fx');
    const needsRoot = root.querySelector('.needs');
    const actionsRoot = root.querySelector('.actions');
    const levelRoot = root.querySelector('.pet-level');
    const logRoot = root.querySelector('.pet-log');
    const elCostume = root.querySelector('.pet-costume');
    const elMood = root.querySelector('.pet-mood');

    const n = { hunger: 72, water: 66, energy: 78, fun: 60 };
    let napping = false, lastTick = performance.now(), idleTimer = 5, bubbleTimer = 0;
    let panelAcc = 0;
    let currentSprite = null;

    needsRoot.innerHTML = NEEDS.map(function (d) {
      return '<div class="need" data-id="' + d.id + '">' +
        '<span class="need-emoji">' + d.emoji + '</span>' +
        '<span class="need-name">' + d.name + '</span>' +
        '<span class="need-bar"><i style="background:' + d.color + '"></i></span>' +
        '<span class="need-val">0</span></div>';
    }).join('');
    const needEls = {};
    needsRoot.querySelectorAll('.need').forEach(function (el) {
      needEls[el.getAttribute('data-id')] = { bar: el.querySelector('i'), val: el.querySelector('.need-val'), el: el };
    });

    actionsRoot.innerHTML = ACTIONS.map(function (a) {
      return '<button class="act" type="button" data-id="' + a.id + '">' +
        '<span class="act-emoji">' + a.emoji + '</span><span class="act-name">' + a.name + '</span>' +
        '<i class="act-cd"></i></button>';
    }).join('');

    function showDog() {
      const id = PET.State.get().costume;
      const sp = PET.Sprites.peek(id);
      holder.innerHTML = '';
      if (!sp) return;
      const c = document.createElement('canvas');
      c.width = sp.canvas.width; c.height = sp.canvas.height;
      c.getContext('2d').drawImage(sp.canvas, 0, 0);
      c.className = 'pet-img';
      holder.appendChild(c);
      currentSprite = c;
    }

    function say(text, hold) {
      bubble.textContent = text;
      bubble.classList.add('is-on');
      bubbleTimer = hold || 3;
    }

    function log(text) {
      const line = document.createElement('div');
      line.className = 'log-line';
      line.textContent = text;
      logRoot.insertBefore(line, logRoot.firstChild);
      while (logRoot.children.length > 5) logRoot.removeChild(logRoot.lastChild);
    }

    function fx(chars, count) {
      for (let i = 0; i < count; i++) {
        const s = document.createElement('span');
        s.className = 'fx-item';
        s.textContent = chars[Math.floor(Math.random() * chars.length)];
        s.style.left = (28 + Math.random() * 44) + '%';
        s.style.setProperty('--dx', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
        s.style.setProperty('--dur', (1 + Math.random() * 0.7).toFixed(2) + 's');
        s.style.fontSize = (18 + Math.random() * 16) + 'px';
        fxRoot.appendChild(s);
        s.addEventListener('animationend', function () { s.remove(); });
      }
    }

    function moodValue() {
      let sum = 0;
      NEEDS.forEach(function (d) { sum += n[d.id]; });
      return sum / NEEDS.length;
    }

    function moodLabel() {
      const m = moodValue();
      const lowest = NEEDS.slice().sort(function (a, b) { return n[a.id] - n[b.id]; })[0];
      if (napping) return { text: '💤 睡得正香', cls: 'nap' };
      if (m > 82) return { text: '😄 心情超好', cls: 'great' };
      if (m > 60) return { text: '🙂 挺舒服', cls: 'ok' };
      if (m > 38) return { text: '😐 有点想要「' + lowest.name + '」', cls: 'meh' };
      return { text: '🥺 需要照顾（' + lowest.name + '）', cls: 'bad' };
    }

    function renderPanel() {
      NEEDS.forEach(function (d) {
        const ref = needEls[d.id];
        ref.bar.style.width = n[d.id].toFixed(0) + '%';
        ref.val.textContent = Math.round(n[d.id]);
        ref.el.classList.toggle('is-low', n[d.id] < 28);
      });
      const p = PET.State.xpProgress();
      levelRoot.innerHTML = '<div class="lv-row"><span class="lv-num">Lv.' + p.level + '</span>' +
        '<span class="lv-bar"><i style="width:' + Math.round(p.ratio * 100) + '%"></i></span>' +
        '<span class="lv-xp">' + Math.round(p.inLevel) + ' / ' + p.span + '</span></div>' +
        '<div class="lv-mood">心情 <b>' + Math.round(moodValue()) + '</b> · 金币 <b>' + PET.State.get().coins + '</b></div>';
      const ml = moodLabel();
      elMood.textContent = ml.text;
      elMood.className = 'pet-mood ' + ml.cls;
      elCostume.textContent = '穿着：' + PET.State.current().name;
      if (currentSprite) {
        currentSprite.classList.toggle('is-nap', napping);
        currentSprite.classList.toggle('is-sad', !napping && moodValue() < 35);
      }
    }

    function levelCheck() {
      const fresh = PET.State.syncUnlocks();
      fresh.forEach(function (c, i) {
        setTimeout(function () {
          PET.Audio.play('unlock');
          PET.UI.toast('解锁新造型：' + c.emoji + '「' + c.name + '」', 'good');
          say('我有新衣服啦！', 3.5);
          fx(['✨', '🎉', c.emoji], 10);
          PET.UI.emit('costume-change', c.id);
        }, i * 900);
      });
    }

    function doAction(a) {
      if (a.toggleNap) {
        napping = !napping;
        say(napping ? '趴好，闭上眼睛。' : '醒啦！先去玩！', 2.5);
        fx(a.fx, napping ? 3 : 6);
        log(napping ? '开始午睡' : '睡醒了');
        PET.Audio.play('click');
        renderPanel();
        return;
      }
      if (napping) {
        say('别吵……让我再睡五分钟。', 2);
        PET.Audio.play('sad');
        return;
      }
      a.apply(n);
      NEEDS.forEach(function (d) { n[d.id] = clamp(n[d.id]); });
      const gain = 3 + moodValue() / 40;
      const leveled = PET.State.addXp(gain);
      if (leveled > 0) {
        PET.Audio.play('levelup');
        PET.UI.toast('升到 Lv.' + PET.State.get().level + '！', 'good');
        log('升到 Lv.' + PET.State.get().level);
        levelCheck();
      }
      PET.Audio.play(a.sound);
      fx(a.fx, 6);
      say(a.lines[Math.floor(Math.random() * a.lines.length)], 2.6);
      if (n.hunger > 80 && n.water > 80 && n.energy > 80 && n.fun > 80) {
        if (PET.State.mark('pet-care')) { PET.UI.toast('成就解锁：合格铲屎官', 'good'); say('我是全世界最幸福的狗！', 3); }
      }
      if (PET.State.get().level >= 2 && PET.State.mark('pet-level2')) PET.UI.toast('成就解锁：长大一点点', 'good');
      if (PET.State.get().level >= 5 && PET.State.mark('pet-level5')) PET.UI.toast('成就解锁：贴心主人', 'good');
      renderPanel();
    }

    actionsRoot.addEventListener('click', function (ev) {
      const btn = ev.target.closest('.act');
      if (!btn || btn.disabled) return;
      const a = ACTIONS.filter(function (x) { return x.id === btn.getAttribute('data-id'); })[0];
      if (!a) return;
      doAction(a);
      if (a.cd > 0) {
        btn.disabled = true;
        const ring = btn.querySelector('.act-cd');
        ring.style.transition = 'none';
        ring.style.transform = 'scaleX(1)';
        requestAnimationFrame(function () {
          ring.style.transition = 'transform ' + a.cd + 'ms linear';
          ring.style.transform = 'scaleX(0)';
        });
        setTimeout(function () { btn.disabled = false; }, a.cd);
      }
    });

    function tick(ts) {
      const dt = Math.min(0.05, (ts - lastTick) / 1000);
      lastTick = ts;

      NEEDS.forEach(function (d) {
        const rate = napping ? d.decay * (d.id === 'energy' ? -6 : 0.35) : d.decay;
        n[d.id] = clamp(n[d.id] - rate * dt * 1.6);
      });
      if (napping && n.energy >= 100) {
        napping = false;
        say('睡饱了！我们去跑步吧。', 3);
        log('午睡结束，精神满格');
      }

      // 心情好时缓慢积累经验
      const m = moodValue();
      if (!napping && m > 55) {
        const leveled = PET.State.addXp(dt * (m - 55) / 40);
        if (leveled > 0) {
          PET.Audio.play('levelup');
          PET.UI.toast('升到 Lv.' + PET.State.get().level + '！', 'good');
          levelCheck();
        }
      }

      if (bubbleTimer > 0) {
        bubbleTimer -= dt;
        if (bubbleTimer <= 0) bubble.classList.remove('is-on');
      }
      idleTimer -= dt;
      if (idleTimer <= 0) {
        idleTimer = 7 + Math.random() * 7;
        if (bubbleTimer <= 0 && !napping) {
          if (m < 35) say('呜……我有点难受。', 3);
          else say(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)], 2.8);
        }
      }

      panelAcc += dt;
      if (panelAcc >= 0.2) { panelAcc = 0; renderPanel(); }
      raf = requestAnimationFrame(tick);
    }

    let raf = requestAnimationFrame(tick);
    showDog();
    renderPanel();
    levelCheck();
    say('你来啦！先摸摸我。', 3.2);
    log('开始今天的照顾');

    const unsub = PET.UI.on('costume-change', showDog);

    return {
      unmount: function () {
        cancelAnimationFrame(raf);
        unsub();
      }
    };
  }

  return { mount: mount };
})();
