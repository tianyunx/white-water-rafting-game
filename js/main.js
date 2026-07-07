'use strict';
/* 游戏循环、状态机、输入（键盘 + 屏幕按钮）、HUD、音效接线 */
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const hudEl = document.getElementById('hud');
  const hpbarEl = document.getElementById('hpbar');
  const hpfillEl = document.getElementById('hpfill');
  const distEl = document.getElementById('dist');
  const speedEl = document.getElementById('speed');
  const muteEl = document.getElementById('mute');
  const menuEl = document.getElementById('menu');
  const overEl = document.getElementById('over');
  const controlsEl = document.getElementById('controls');
  const finalDistEl = document.getElementById('finalDist');
  const bestDistEl = document.getElementById('bestDist');

  const PX_PER_M = 30;
  const BEST_KEY = 'rafting-best';
  const LANG_KEY = 'rafting-lang';

  /* ---------- 中英双语 ---------- */
  const I18N = {
    en: {
      title: 'White Water Rafting', sub: '激流勇进',
      hull: 'Hull', dist: 'Distance', speed: 'Speed',
      leftOars: 'Left', rightOars: 'Right',
      startPrompt: 'Press Space or tap anywhere to start',
      overTitle: 'The raft fell apart!',
      overDist: 'You rafted', best: 'Best record',
      retryPrompt: 'Press Space or tap to retry',
      muteTitle: 'Mute (M)',
      langBtn: '中文',
      instructions: [
        '<p><b>← / A</b> left oars forward&ensp;<b>Z</b> left oars backward</p>',
        '<p><b>→ / D</b> right oars forward&ensp;<b>X</b> right oars backward</p>',
        '<p>Alternate sides to go straight & fast; paddle one side to turn; back-paddle + opposite forward = pivot on the spot</p>',
        '<p>Rocks damage the raft; banks only slow you down; lilies & reeds drag you</p>',
        '<p>The bow cannon fires on its own: crack rocks open, shoot floating crates to collect them</p>',
        '<p>Red-cross crates repair the raft (+20 hull)</p>',
        '<p>At river forks pick your channel — narrow is faster but riskier&ensp;<b>M</b> mute</p>',
      ].join(''),
    },
    zh: {
      title: '激流勇进', sub: 'White Water Rafting',
      hull: '耐久', dist: '距离', speed: '速度',
      leftOars: '左桨', rightOars: '右桨',
      startPrompt: '按 空格 或 点击屏幕 出发',
      overTitle: '木筏散架了！',
      overDist: '本次漂流', best: '最佳纪录',
      retryPrompt: '按 空格 或 点击屏幕 再来一次',
      muteTitle: '静音 (M)',
      langBtn: 'English',
      instructions: [
        '<p><b>← / A</b> 左桨前划　<b>Z</b> 左桨后划</p>',
        '<p><b>→ / D</b> 右桨前划　<b>X</b> 右桨后划</p>',
        '<p>左右交替前划加速；单侧划转向；后划+对侧前划＝原地掉头</p>',
        '<p>撞石头扣耐久；撞岸只减速；荷叶芦苇会拖慢船</p>',
        '<p>船头自动开火：对准石头能把它打碎，打中木箱隔空收取</p>',
        '<p>拾取带红十字的木箱可修船 +20 耐久</p>',
        '<p>遇到河心岛记得选路——窄道更快也更险　<b>M</b> 静音</p>',
      ].join(''),
    },
  };
  let lang = localStorage.getItem(LANG_KEY) === 'zh' ? 'zh' : 'en'; // 默认英文

  function applyLang() {
    const t = I18N[lang];
    document.querySelectorAll('[data-t]').forEach((el) => {
      if (t[el.dataset.t] !== undefined) el.textContent = t[el.dataset.t];
    });
    const ins = document.getElementById('instructions');
    if (ins) ins.innerHTML = t.instructions;
    const lb = document.getElementById('langBtn');
    if (lb) lb.textContent = t.langBtn;
    if (muteEl) muteEl.title = t.muteTitle;
    document.documentElement.lang = lang;
  }

  let state = 'menu'; // menu | playing | over
  let last = performance.now();
  let shake = 0, flash = 0;
  let dpr = 1;
  const view = { w: 0, h: 0, camX: 0, camY: 0, shakeX: 0, shakeY: 0, flash: 0, time: 0 };

  function resize() {
    dpr = window.devicePixelRatio || 1;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  Boat.onHit = (dmg) => {
    shake = Math.min(14, 4 + dmg * 0.5);
    flash = Math.min(1, 0.45 + dmg * 0.03);
    hpbarEl.classList.remove('hit', 'heal');
    void hpbarEl.offsetWidth; // 重启动画
    hpbarEl.classList.add('hit');
    Sound.thud(dmg);
    Render.burst(Boat.state.x, Boat.state.y);
  };

  Boat.onBulletHit = (x, y, kind) => {
    if (kind === 'break') {
      Render.burst(x, y, 'rock');
      Sound.crack();
    } else {
      Render.burst(x, y, 'tick');
      Sound.hit();
    }
  };

  Boat.onPickup = (x, y) => {
    hpbarEl.classList.remove('hit', 'heal');
    void hpbarEl.offsetWidth;
    hpbarEl.classList.add('heal');
    Sound.pickup();
    Render.burst(x, y, 'heal');
  };

  function paddle(side, dir) {
    if (state !== 'playing') return;
    if (Boat.stroke(side, dir)) Sound.splash();
  }

  function setupWorld(seed) {
    River.reset(seed);
    River.ensure(0);
    Boat.reset();
    view.camX = Boat.state.x;
    view.camY = Boat.state.y;
    Render.reset(view);
  }

  function newGame() {
    setupWorld((Math.random() * 0x7fffffff) | 0);
    shake = 0; flash = 0;
    state = 'playing';
    menuEl.classList.add('hidden');
    overEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    controlsEl.classList.remove('hidden');
    updateHUD();
  }

  function gameOver() {
    state = 'over';
    const meters = Math.floor(Boat.state.dist / PX_PER_M);
    const best = Math.max(meters, parseInt(localStorage.getItem(BEST_KEY) || '0', 10));
    localStorage.setItem(BEST_KEY, String(best));
    finalDistEl.textContent = String(meters);
    bestDistEl.textContent = String(best);
    overEl.classList.remove('hidden');
    controlsEl.classList.add('hidden');
    Sound.over();
  }

  function updateHUD() {
    const b = Boat.state;
    hpfillEl.style.width = Math.max(0, b.hp) + '%';
    distEl.textContent = Math.floor(b.dist / PX_PER_M) + ' m';
    speedEl.textContent = (Math.hypot(b.vx, b.vy) / PX_PER_M).toFixed(1) + ' m/s';
  }

  /* ---------- 键盘 ---------- */
  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA':
        e.preventDefault();
        if (!e.repeat) paddle('L', 1);
        break;
      case 'ArrowRight': case 'KeyD':
        e.preventDefault();
        if (!e.repeat) paddle('R', 1);
        break;
      case 'KeyZ':
        if (!e.repeat) paddle('L', -1);
        break;
      case 'KeyX':
        if (!e.repeat) paddle('R', -1);
        break;
      case 'KeyM':
        if (!e.repeat) muteEl.textContent = Sound.toggleMute() ? '🔇' : '🔊';
        break;
      case 'Space':
        e.preventDefault();
        if (!e.repeat && state !== 'playing') newGame();
        break;
    }
  });

  /* ---------- 屏幕按钮（触屏 / 鼠标） ---------- */
  for (const [id, side, dir] of [
    ['btn-lf', 'L', 1], ['btn-lb', 'L', -1],
    ['btn-rf', 'R', 1], ['btn-rb', 'R', -1],
  ]) {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      paddle(side, dir);
    });
  }
  muteEl.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    muteEl.textContent = Sound.toggleMute() ? '🔇' : '🔊';
  });

  // 语言切换（阻止冒泡，避免触发"点击开始"）
  const langBtnEl = document.getElementById('langBtn');
  if (langBtnEl) {
    langBtnEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      lang = lang === 'en' ? 'zh' : 'en';
      localStorage.setItem(LANG_KEY, lang);
      applyLang();
    });
  }

  // 空白处点击：开始 / 重开（游戏中划桨请用按钮或键盘）
  window.addEventListener('pointerdown', () => {
    if (state !== 'playing') newGame();
  });

  /* ---------- 主循环 ---------- */
  function loop(now) {
    const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
    last = now;
    view.time += dt;

    if (state === 'playing') {
      Boat.update(dt);
      const b = Boat.state;
      River.ensure(-b.y);

      const targetX = b.x * 0.65 + River.centerXAt(-b.y) * 0.35;
      view.camX += (targetX - view.camX) * Math.min(1, dt * 3.5);
      view.camY = b.y;

      updateHUD();
      if (!b.alive) gameOver();
    }

    shake = Math.max(0, shake - shake * 6 * dt - 2 * dt);
    flash = Math.max(0, flash - 2.2 * dt);
    view.shakeX = (Math.random() * 2 - 1) * shake;
    view.shakeY = (Math.random() * 2 - 1) * shake;
    view.flash = flash;

    Render.draw(ctx, view, Boat.state, dt, dpr, state);
    requestAnimationFrame(loop);
  }

  // 初始场景（菜单背后也有河景）
  applyLang();
  setupWorld(20260705);
  requestAnimationFrame(loop);
})();
