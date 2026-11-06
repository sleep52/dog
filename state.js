// 全局存档：等级、经验、解锁的造型、各模式最高分、成就。三个模式共用同一份数据。
window.PET = window.PET || {};

PET.State = (function () {
  const KEY = 'dogGame.save.v1';

  const COSTUMES = [
    {
      id: 'flower', name: '碎花小裙', emoji: '🌸', photo: 'flower', facing: 'left',
      tagline: '出门散步的标配，裙摆带荷叶边。',
      perk: '均衡：没有短板，新手首选',
      stats: { speed: 1.0, score: 1.0, jumps: 2, shield: 0 },
      unlockLevel: 1
    },
    {
      id: 'bee', name: '蜜蜂卫衣', emoji: '🐝', photo: 'bee', facing: 'front',
      tagline: '黄黑条纹连帽衫，趴下来的时候像一颗小饭团。',
      perk: '冲刺：跑酷速度 +15%，得分 ×1.2',
      stats: { speed: 1.15, score: 1.2, jumps: 2, shield: 0 },
      unlockLevel: 2
    },
    {
      id: 'beehood', name: '蜜蜂帽兜', emoji: '🎩', photo: 'beehood', facing: 'front',
      tagline: '帽子一戴，触须竖起来，只露出一双大眼睛。',
      perk: '灵巧：可以三段跳',
      stats: { speed: 1.05, score: 1.1, jumps: 3, shield: 0 },
      unlockLevel: 3
    },
    {
      id: 'nap', name: '趴趴休息', emoji: '💤', photo: 'nap', facing: 'left',
      tagline: '戴着定位项圈趴在窝里，一副不想动的样子。',
      perk: '慵懒：跑得慢一点，但开局带一面护盾',
      stats: { speed: 0.9, score: 1.15, jumps: 2, shield: 1 },
      unlockLevel: 4
    }
  ];

  const ACHIEVEMENTS = [
    { id: 'first-run', name: '第一次散步', desc: '在跑酷里跑满 100 米' },
    { id: 'runner-500', name: '小飞狗', desc: '跑酷单局得分 500 以上' },
    { id: 'runner-1500', name: '马拉松选手', desc: '跑酷单局得分 1500 以上' },
    { id: 'combo-8', name: '连击达人', desc: '跑酷里连击达到 8 次' },
    { id: 'pet-care', name: '合格铲屎官', desc: '四项需求同时高于 80' },
    { id: 'pet-level2', name: '长大一点点', desc: '把小狗养到 2 级' },
    { id: 'pet-level5', name: '贴心主人', desc: '把小狗养到 5 级' },
    { id: 'memory-win', name: '眼力不错', desc: '完成一局记忆翻牌' },
    { id: 'memory-star3', name: '过目不忘', desc: '记忆翻牌拿到三星' },
    { id: 'all-costumes', name: '全套衣柜', desc: '解锁全部四套造型' }
  ];

  const DEFAULT = {
    level: 1, xp: 0, coins: 0,
    costume: 'flower',
    unlocked: ['flower'],
    best: { runner: 0, memoryMoves: 0, memoryTime: 0 },
    totalDistance: 0,
    achievements: [],
    muted: false,
    bgm: true
  };

  let data = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? Object.assign({}, DEFAULT, JSON.parse(raw)) : Object.assign({}, DEFAULT);
      if (!Array.isArray(data.unlocked)) data.unlocked = ['flower'];
      if (!data.best) data.best = { runner: 0, memoryMoves: 0, memoryTime: 0 };
    } catch (e) {
      data = Object.assign({}, DEFAULT);
    }
    return data;
  }

  let saveTimer = null;

  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!data) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 隐私模式下忽略 */ }
  }

  // 主循环里会高频调用（比如每秒都加经验），所以合并写入
  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(flush, 400);
  }

  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });

  function get() { return data || load(); }

  function costumeById(id) {
    for (let i = 0; i < COSTUMES.length; i++) if (COSTUMES[i].id === id) return COSTUMES[i];
    return COSTUMES[0];
  }

  function current() { return costumeById(get().costume); }

  function isUnlocked(id) { return get().unlocked.indexOf(id) >= 0; }

  function select(id) {
    if (!isUnlocked(id)) return false;
    get().costume = id;
    save();
    return true;
  }

  const XP_PER_LEVEL = 120;

  function xpForLevel(level) { return (level - 1) * XP_PER_LEVEL; }

  // 等级到了就补解锁，避免存档和衣柜不一致
  function syncUnlocks() {
    const s = get();
    const fresh = COSTUMES.filter(function (c) { return c.unlockLevel <= s.level && !isUnlocked(c.id); });
    fresh.forEach(function (c) { s.unlocked.push(c.id); });
    if (fresh.length) {
      if (COSTUMES.every(function (c) { return isUnlocked(c.id); })) mark('all-costumes');
      save();
    }
    return fresh;
  }

  function addXp(amount) {
    const s = get();
    s.xp += Math.max(0, amount);
    let leveled = 0;
    while (s.xp >= xpForLevel(s.level + 1)) { s.level++; leveled++; }
    if (s.level >= 5) mark('pet-level5');
    if (s.level >= 2) mark('pet-level2');
    save();
    return leveled;
  }

  function xpProgress() {
    const s = get();
    const base = xpForLevel(s.level), next = xpForLevel(s.level + 1);
    const inLevel = s.xp - base;
    return { level: s.level, inLevel: inLevel, span: next - base, ratio: Math.max(0, Math.min(1, inLevel / (next - base))) };
  }

  function addCoins(n) {
    get().coins = Math.max(0, get().coins + Math.round(n));
    save();
  }

  function recordBest(key, value, lowerIsBetter) {
    const s = get();
    const prev = s.best[key];
    const better = prev === 0 ? true : (lowerIsBetter ? value < prev : value > prev);
    if (better) { s.best[key] = value; save(); }
    return better;
  }

  function mark(id) {
    const s = get();
    if (s.achievements.indexOf(id) >= 0) return false;
    s.achievements.push(id);
    s.coins += 30;
    save();
    return true;
  }

  function achievement(id) {
    for (let i = 0; i < ACHIEVEMENTS.length; i++) if (ACHIEVEMENTS[i].id === id) return ACHIEVEMENTS[i];
    return null;
  }

  function reset() {
    data = Object.assign({}, DEFAULT, { unlocked: ['flower'], best: { runner: 0, memoryMoves: 0, memoryTime: 0 }, achievements: [] });
    save();
  }

  return {
    COSTUMES: COSTUMES, ACHIEVEMENTS: ACHIEVEMENTS,
    load: load, save: save, get: get,
    costumeById: costumeById, current: current, isUnlocked: isUnlocked,
    select: select,
    addXp: addXp, xpProgress: xpProgress, addCoins: addCoins, syncUnlocks: syncUnlocks,
    recordBest: recordBest, mark: mark, achievement: achievement,
    reset: reset
  };
})();
