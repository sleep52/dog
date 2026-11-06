// 小狗图鉴：四套造型的原图、介绍、解锁状态，加上成就墙。
window.PET = window.PET || {};

PET.Album = (function () {
  const TEMPLATE = [
    '<div class="album">',
    '  <div class="album-head">',
    '    <h2>小狗衣柜</h2>',
    '    <p class="album-sub">照片都是原图，点卡片可以放大。等级升上去会解锁新造型。</p>',
    '  </div>',
    '  <div class="costume-grid"></div>',
    '  <h2 class="album-title">成就墙</h2>',
    '  <div class="achv-grid"></div>',
    '  <div class="lightbox"></div>',
    '</div>'
  ].join('\n');

  function statLine(c) {
    const st = c.stats;
    const bits = [];
    bits.push('速度 ' + (st.speed >= 1 ? '+' : '') + Math.round((st.speed - 1) * 100) + '%');
    bits.push('得分 ' + (st.score >= 1 ? '+' : '') + Math.round((st.score - 1) * 100) + '%');
    bits.push('跳跃 ' + st.jumps + ' 段');
    if (st.shield) bits.push('护盾 ' + st.shield);
    return bits.join(' · ');
  }

  function mount(root) {
    root.innerHTML = TEMPLATE;
    const grid = root.querySelector('.costume-grid');
    const achv = root.querySelector('.achv-grid');
    const lightbox = root.querySelector('.lightbox');

    function render() {
      const cur = PET.State.get().costume;
      grid.innerHTML = PET.State.COSTUMES.map(function (c) {
        const unlocked = PET.State.isUnlocked(c.id);
        return '<article class="cs-card' + (unlocked ? '' : ' is-locked') + (c.id === cur ? ' is-current' : '') +
          '" data-id="' + c.id + '" tabindex="0">' +
          '<div class="cs-photo"><img src="' + PET.Sprites.photo(c.photo) + '" alt="' + c.name + '"></div>' +
          '<div class="cs-body">' +
          '<h3>' + c.emoji + ' ' + c.name + (c.id === cur ? '<span class="cs-tag">当前</span>' : '') + '</h3>' +
          '<p class="cs-line">' + c.tagline + '</p>' +
          '<p class="cs-perk">' + (unlocked ? c.perk : '🔒 养到 Lv.' + c.unlockLevel + ' 解锁') + '</p>' +
          (unlocked ? '<p class="cs-stats">' + statLine(c) + '</p>' : '') +
          '</div></article>';
      }).join('');

      achv.innerHTML = PET.State.ACHIEVEMENTS.map(function (a) {
        const got = PET.State.get().achievements.indexOf(a.id) >= 0;
        return '<div class="achv' + (got ? ' is-got' : '') + '">' +
          '<span class="achv-mark">' + (got ? '✅' : '⬜') + '</span>' +
          '<div><b>' + a.name + '</b><span>' + a.desc + '</span></div></div>';
      }).join('');
    }

    function openLightbox(c) {
      if (!PET.State.isUnlocked(c.id)) {
        PET.UI.toast('这套还没解锁，先养到 Lv.' + c.unlockLevel, 'warn');
        PET.Audio.play('sad');
        return;
      }
      lightbox.innerHTML = '<div class="lb-inner"><button class="lb-close btn" type="button">关闭 ✕</button>' +
        '<img src="' + PET.Sprites.photo(c.photo) + '" alt="' + c.name + '">' +
        '<figcaption>' + c.emoji + ' ' + c.name + ' — ' + c.tagline + '</figcaption></div>';
      lightbox.classList.add('is-on');
      PET.Audio.play('swoosh');
    }

    function onCardActivate(el) {
      const c = PET.State.costumeById(el.getAttribute('data-id'));
      if (!c) return;
      if (!PET.State.isUnlocked(c.id)) {
        PET.UI.toast('这套还没解锁，去「养狗日常」把等级练到 Lv.' + c.unlockLevel, 'warn');
        PET.Audio.play('sad');
        return;
      }
      PET.State.select(c.id);
      PET.UI.emit('costume-change', c.id);
      PET.Audio.play('unlock');
      PET.UI.toast('已换上「' + c.name + '」', 'good');
      render();
    }

    grid.addEventListener('click', function (ev) {
      const card = ev.target.closest('.cs-card');
      if (!card) return;
      const c = PET.State.costumeById(card.getAttribute('data-id'));
      if (ev.target.closest('.cs-photo')) { openLightbox(c); return; }
      onCardActivate(card);
    });
    grid.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const card = ev.target.closest('.cs-card');
      if (!card) return;
      ev.preventDefault();
      onCardActivate(card);
    });
    lightbox.addEventListener('click', function (ev) {
      if (ev.target.closest('.lb-close') || ev.target === lightbox) lightbox.classList.remove('is-on');
    });

    render();
    return { unmount: function () { } };
  }

  return { mount: mount };
})();
