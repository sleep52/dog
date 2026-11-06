// 全部音效与背景音乐用 WebAudio 现场合成，不加载任何音频文件。
// AudioContext 必须在第一次用户手势里创建，所以 ensure() 由各模式的交互入口调用。
window.PET = window.PET || {};

PET.Audio = (function () {
  let ctx = null, master = null, sfxGain = null, musicGain = null;
  let musicTimer = null, step = 0, nextTime = 0;
  let enabled = true;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    return ctx;
  }

  function muted() { return !!(PET.State.get && PET.State.get().muted); }

  function now() { return ctx.currentTime; }

  function tone(opts) {
    if (!ctx || !enabled || muted()) return;
    const t = (opts.at || 0) + now();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.from, t);
    if (opts.to && opts.to !== opts.from) {
      if (opts.slide === 'linear') osc.frequency.linearRampToValueAtTime(opts.to, t + opts.dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.dur);
    }
    const peak = opts.gain === undefined ? 0.22 : opts.gain;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, opts.dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    let node = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter; f.frequency.value = opts.filterFreq || 1200;
      node.connect(f); node = f;
    }
    node.connect(opts.music ? musicGain : sfxGain);
    osc.start(t); osc.stop(t + opts.dur + 0.02);
  }

  function noise(opts) {
    if (!ctx || !enabled || muted()) return;
    const t = (opts.at || 0) + now();
    const len = Math.max(1, Math.floor(ctx.sampleRate * opts.dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter || 'bandpass';
    f.frequency.setValueAtTime(opts.freq || 900, t);
    if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, opts.freqTo), t + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain === undefined ? 0.18 : opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f); f.connect(g); g.connect(opts.music ? musicGain : sfxGain);
    src.start(t); src.stop(t + opts.dur + 0.02);
  }

  function arp(notes, gap, opts) {
    const o = opts || {};
    notes.forEach(function (f, i) {
      tone({
        from: f, to: f, at: i * gap,
        dur: o.dur || 0.16, type: o.type || 'triangle',
        gain: o.gain === undefined ? 0.2 : o.gain, music: !!o.music
      });
    });
  }

  const SFX = {
    click: function () { tone({ from: 660, to: 720, dur: 0.05, type: 'sine', gain: 0.12 }); },
    jump: function () { tone({ from: 300, to: 620, dur: 0.16, type: 'square', gain: 0.12, filter: 'lowpass', filterFreq: 2200 }); },
    jump2: function () { tone({ from: 420, to: 820, dur: 0.16, type: 'square', gain: 0.12, filter: 'lowpass', filterFreq: 2400 }); },
    jump3: function () { tone({ from: 540, to: 1040, dur: 0.18, type: 'triangle', gain: 0.14 }); },
    treat: function () { arp([880, 1174], 0.05, { dur: 0.1, type: 'triangle', gain: 0.16 }); },
    star: function () { arp([784, 988, 1319], 0.055, { dur: 0.14, type: 'triangle', gain: 0.18 }); },
    hit: function () {
      tone({ from: 260, to: 60, dur: 0.34, type: 'sawtooth', gain: 0.2, filter: 'lowpass', filterFreq: 900 });
      noise({ dur: 0.22, freq: 700, freqTo: 180, gain: 0.2, filter: 'lowpass' });
    },
    shield: function () { tone({ from: 1200, to: 500, dur: 0.24, type: 'sine', gain: 0.16 }); },
    bark: function () {
      tone({ from: 560, to: 200, dur: 0.09, type: 'sawtooth', gain: 0.16, filter: 'bandpass', filterFreq: 1100 });
      tone({ from: 480, to: 170, dur: 0.11, type: 'sawtooth', gain: 0.13, filter: 'bandpass', filterFreq: 950, at: 0.16 });
    },
    flip: function () { noise({ dur: 0.09, freq: 1400, freqTo: 700, gain: 0.1, filter: 'highpass' }); },
    match: function () { arp([523, 659, 784], 0.07, { dur: 0.2, type: 'triangle', gain: 0.18 }); },
    nomatch: function () { tone({ from: 300, to: 200, dur: 0.18, type: 'sine', gain: 0.14 }); },
    win: function () { arp([523, 659, 784, 1046, 1319], 0.1, { dur: 0.26, type: 'triangle', gain: 0.2 }); },
    levelup: function () { arp([659, 784, 1046, 1319], 0.09, { dur: 0.24, type: 'square', gain: 0.12 }); },
    unlock: function () { arp([392, 523, 659, 784, 1046], 0.11, { dur: 0.3, type: 'triangle', gain: 0.2 }); },
    gulp: function () { tone({ from: 180, to: 420, dur: 0.14, type: 'sine', gain: 0.16 }); },
    swoosh: function () { noise({ dur: 0.16, freq: 1800, freqTo: 500, gain: 0.08 }); },
    sad: function () { arp([440, 392, 330], 0.13, { dur: 0.3, type: 'sine', gain: 0.16 }); }
  };

  function play(name) {
    ensure();
    if (!ctx || !enabled) return;
    const fn = SFX[name];
    if (fn) fn();
  }

  // 背景音乐：16 步循环，蜜蜂主题的五声音阶 + 低音
  const MELODY = [0, null, 4, null, 7, null, 4, 2, 0, null, 2, 4, 7, null, 9, 7];
  const BASS = [0, null, null, null, -5, null, null, null, -3, null, null, null, -5, null, -7, null];
  const BASE = 440;
  const PENTA = [-2, -1, 0, 2, 4, 5, 7, 9, 12];

  function semisToFreq(semis) { return BASE * Math.pow(2, semis / 12); }

  function scheduleMusic() {
    if (!ctx || !enabled) return;
    const spb = 0.16;
    while (nextTime < ctx.currentTime + 0.25) {
      const idx = step % 16;
      const at = nextTime - now();
      const m = MELODY[idx];
      if (m !== null) {
        tone({ from: semisToFreq(PENTA[Math.abs(m) % PENTA.length]), to: semisToFreq(PENTA[Math.abs(m) % PENTA.length]), dur: 0.22, at: at, type: 'triangle', gain: 0.1, music: true });
      }
      const b = BASS[idx];
      if (b !== null) {
        tone({ from: semisToFreq(b - 12), to: semisToFreq(b - 12), dur: 0.3, at: at, type: 'sine', gain: 0.16, music: true });
      }
      if (idx % 4 === 2) noise({ dur: 0.05, freq: 6000, gain: 0.03, filter: 'highpass', music: true });
      nextTime += spb;
      step++;
    }
  }

  function startMusic() {
    ensure();
    if (!ctx || !enabled || musicTimer) return;
    if (!PET.State.get().bgm) return;
    step = 0; nextTime = ctx.currentTime + 0.05;
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 80);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function setMuted(muted) {
    PET.State.get().muted = muted;
    PET.State.save();
    if (muted) stopMusic(); else startMusic();
  }

  function toggleMute() { setMuted(!PET.State.get().muted); return PET.State.get().muted; }

  return {
    ensure: ensure, play: play,
    startMusic: startMusic, stopMusic: stopMusic,
    isMusicOn: function () { return !!musicTimer; },
    setMuted: setMuted, toggleMute: toggleMute,
    isMuted: function () { return !!PET.State.get().muted; }
  };
})();
