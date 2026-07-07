'use strict';
/* WebAudio 纯合成音效，无素材文件。AudioContext 在首次播放（用户手势内）惰性创建。 */
const Sound = (() => {
  let ac = null, muted = false, noiseBuf = null;

  function ctx() {
    if (muted) return null;
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      const len = Math.floor(ac.sampleRate * 0.5);
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function noise(dur, freq, q, vol, when = 0) {
    const a = ctx(); if (!a) return;
    const src = a.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = a.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain();
    const t = a.currentTime + when;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(t); src.stop(t + dur);
  }

  function tone(freq, dur, vol, type = 'sine', when = 0, glideTo = 0) {
    const a = ctx(); if (!a) return;
    const o = a.createOscillator();
    o.type = type;
    const t = a.currentTime + when;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur);
  }

  // 划水声：柔和起音的低通噪声"哗——"（滤波频率下扫模拟水流散开）+ 很轻的入水"扑通"
  function splash() {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    const src = a.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = a.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(1600 + Math.random() * 600, t);
    f.frequency.exponentialRampToValueAtTime(350, t + 0.4);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.05); // 缓起音，去掉"咔哒"感
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(t, Math.random() * 0.3); // 随机起点，每桨声音略有不同
    src.stop(t + 0.45);
    tone(190 + Math.random() * 50, 0.13, 0.1, 'sine', 0, 80);
  }

  return {
    splash,
    thud(dmg) {
      tone(95, 0.25, Math.min(0.7, 0.25 + dmg * 0.015), 'sine', 0, 45);
      noise(0.15, 400, 1, 0.3);
    },
    pickup() {
      tone(660, 0.09, 0.25, 'triangle');
      tone(990, 0.16, 0.25, 'triangle', 0.09);
    },
    over() { [440, 330, 220].forEach((f, i) => tone(f, 0.3, 0.28, 'triangle', i * 0.22)); },
    hit() { noise(0.06, 2200, 2, 0.12); },   // 子弹打在石头上的轻响
    crack() {                                 // 石头碎裂
      noise(0.25, 300, 0.8, 0.5);
      tone(160, 0.18, 0.3, 'triangle', 0, 60);
    },
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
  };
})();
