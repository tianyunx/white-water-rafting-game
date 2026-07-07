'use strict';
/*
 * 全部 Canvas 绘制。
 * 屏幕映射：sx = x - camX + w/2, sy = y - camY + h*0.62（船固定在屏幕 62% 高度处）。
 * 水流粒子直接按 River.flowAt 移动——看到的水流就是物理上的水流。
 */
const Render = (() => {
  const PARTICLE_COUNT = 170;
  let particles = [];
  let splashes = [];
  let lastStroke = { L: 99, R: 99 };

  function reset(view) {
    particles = [];
    splashes = [];
    lastStroke = { L: 99, R: 99 };
    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(spawnParticle(view, true));
  }

  function spawnParticle(view, anywhere) {
    const top = view.camY - view.h * 0.62;
    return {
      x: view.camX - view.w / 2 + Math.random() * view.w,
      y: anywhere ? top + Math.random() * view.h
                  : top + view.h * (0.7 + Math.random() * 0.4), // 主要从上游入口补充
      life: 3 + Math.random() * 5,
    };
  }

  // 确定性伪随机（用于岸边装饰、石头形状、植物）
  function hash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  /* ---------- 水花 ---------- */

  function addSplash(x, y, vx, vy, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 60;
      splashes.push({
        x, y,
        vx: vx + Math.cos(a) * sp,
        vy: vy + Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.3,
        max: 0.65,
        r: 1.5 + Math.random() * 2.5,
        color: color || '235,248,255',
      });
    }
  }

  // 受击 / 拾取 / 碎石时的粒子（main.js 调用）
  function burst(x, y, kind) {
    const color = kind === 'heal' ? '150,240,170'
                : kind === 'rock' ? '178,188,198'
                : '255,255,255';
    addSplash(x, y, 0, 0, kind === 'rock' ? 24 : kind === 'tick' ? 5 : 16, color);
  }

  // 划桨时在该侧三个桨叶处溅水花
  function paddleSplash(boat, sideKey) {
    const s = sideKey === 'L' ? -1 : 1;
    const dir = boat.strokes[sideKey].dir;
    const cos = Math.cos(boat.heading), sin = Math.sin(boat.heading);
    const fwdX = Math.sin(boat.heading), fwdY = -Math.cos(boat.heading);
    for (const off of [-24, 0, 24]) {
      const lx = s * 46, ly = off;
      const wx = boat.x + lx * cos - ly * sin;
      const wy = boat.y + lx * sin + ly * cos;
      addSplash(wx, wy, -fwdX * dir * 60, -fwdY * dir * 60, 4);
    }
  }

  /* ---------- 主绘制 ---------- */

  function draw(ctx, view, boat, dt, dpr, gameState) {
    const { w, h } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(view.shakeX, view.shakeY);

    const camX = view.camX, camY = view.camY;
    const ox = -camX + w / 2, oy = -camY + h * 0.62;
    const toSX = (x) => x + ox;
    const toSY = (y) => y + oy;
    const worldTop = camY - h * 0.62 - 60;
    const worldBot = camY + h * 0.38 + 60;
    const dMin = -worldBot, dMax = -worldTop;

    // ---- 水面底色 ----
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2e6fa3');
    grad.addColorStop(1, '#3a80b0');
    ctx.fillStyle = grad;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    // ---- 急流带泡沫条纹（随水流向下游/屏幕上方移动）----
    const rapids = River.rapidsNear(dMin, dMax);
    for (const rp of rapids) {
      for (let dd = rp.a; dd < rp.b; dd += 26) {
        const sy = toSY(-dd) - ((view.time * 90) % 26);
        if (sy < -30 || sy > h + 30) continue;
        const bl = River.bankLeftAt(dd), br = River.bankRightAt(dd);
        const wob = Math.sin(dd * 0.05 + view.time * 3) * 8;
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.fillRect(toSX(bl + 20 + wob), sy, (br - bl - 40), 5);
      }
    }

    // ---- 水流粒子 ----
    ctx.lineCap = 'round';
    for (const p of particles) {
      const v = River.flowAt(p.x, p.y);
      p.x += v.x * dt;
      p.y += v.y * dt;
      p.life -= dt;
      const sy = toSY(p.y), sx = toSX(p.x);
      const dHere = -p.y;
      const isl = River.islandAt(dHere);
      const onIsland = isl && Math.abs(p.x - isl.x) < isl.hw;
      const inRiver = p.x > River.bankLeftAt(dHere) - 5 && p.x < River.bankRightAt(dHere) + 5 && !onIsland;
      if (p.life <= 0 || sy < -40 || sy > h + 60 || sx < -40 || sx > w + 40 || !inRiver) {
        Object.assign(p, spawnParticle(view, Math.random() < 0.3));
        continue;
      }
      const spd = Math.hypot(v.x, v.y);
      const len = Math.min(26, 5 + spd * 0.08);
      const alpha = Math.min(0.55, 0.10 + spd / 380);
      ctx.strokeStyle = `rgba(230,244,255,${alpha})`;
      ctx.lineWidth = spd > 160 ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - v.x * (len / (spd + 1)), sy - v.y * (len / (spd + 1)));
      ctx.stroke();
    }

    // ---- 漩涡 ----
    const whirls = River.whirlsNear(dMin, dMax);
    for (const wl of whirls) {
      const sx = toSX(wl.x), sy = toSY(-wl.d);
      ctx.fillStyle = 'rgba(10,40,70,0.30)';
      ctx.beginPath();
      ctx.arc(sx, sy, wl.R * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,240,255,0.5)';
      ctx.lineWidth = 2;
      const rot = view.time * 1.8 * wl.dir;
      for (let k = 0; k < 3; k++) {
        const rr = wl.R * (0.28 + 0.24 * k);
        ctx.beginPath();
        ctx.arc(sx, sy, rr, rot + k * 2.1, rot + k * 2.1 + 3.6);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(5,25,50,0.55)';
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- 河岸 / 河心岛 ----
    drawBanks(ctx, view, toSX, toSY, worldTop, worldBot);
    drawIslands(ctx, view, toSX, toSY, dMin, dMax);

    // ---- 石头 ----
    const rocks = River.rocksNear(dMin, dMax);
    for (const rock of rocks) {
      drawRock(ctx, toSX(rock.x), toSY(-rock.d), rock, view.time, boat.time - rock.flashT < 0.13);
    }

    // ---- 植物 ----
    for (const p of River.plantsNear(dMin, dMax)) {
      drawPlant(ctx, toSX(p.x), toSY(-p.d), p, view.time);
    }

    // ---- 修理包 ----
    for (const pk of River.packsNear(dMin, dMax)) {
      if (!pk.taken) drawPack(ctx, toSX(pk.x), toSY(-pk.d), pk, view.time);
    }

    // ---- 子弹 ----
    ctx.lineCap = 'round';
    for (const bu of boat.bullets) {
      const bx = toSX(bu.x), by = toSY(bu.y);
      ctx.strokeStyle = 'rgba(255,230,120,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - bu.vx * 0.03, by - bu.vy * 0.03);
      ctx.stroke();
      ctx.fillStyle = '#fff2b0';
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- 水花粒子 ----
    // 检测划桨触发（stroke.t 被重置到 0 附近）
    for (const key of ['L', 'R']) {
      const t = boat.strokes[key].t;
      if (t < lastStroke[key] && t < 0.1) paddleSplash(boat, key);
      lastStroke[key] = t;
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const sp = splashes[i];
      sp.life -= dt;
      if (sp.life <= 0) { splashes.splice(i, 1); continue; }
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vx *= 1 - 3 * dt;
      sp.vy *= 1 - 3 * dt;
      const a = Math.min(0.85, sp.life / sp.max);
      ctx.fillStyle = `rgba(${sp.color},${a})`;
      ctx.beginPath();
      ctx.arc(toSX(sp.x), toSY(sp.y), sp.r * (1 + (1 - sp.life / sp.max) * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- 木筏 ----
    drawBoat(ctx, view, boat, toSX, toSY);

    ctx.restore();

    // ---- 受击红闪 ----
    if (view.flash > 0) {
      ctx.fillStyle = `rgba(255,40,20,${Math.min(0.4, view.flash * 0.35)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /* ---------- 河岸 ---------- */

  function drawBanks(ctx, view, toSX, toSY, worldTop, worldBot) {
    const { w, h } = view;
    const step = 14;

    for (const side of [-1, 1]) { // -1 左岸, 1 右岸
      const bankX = side < 0 ? River.bankLeftAt : River.bankRightAt;
      // 草地
      ctx.fillStyle = '#4a9648';
      ctx.beginPath();
      ctx.moveTo(side < 0 ? -30 : w + 30, toSY(worldTop));
      for (let y = worldTop; y <= worldBot; y += step) {
        ctx.lineTo(toSX(bankX(-y)), toSY(y));
      }
      ctx.lineTo(side < 0 ? -30 : w + 30, toSY(worldBot));
      ctx.closePath();
      ctx.fill();

      // 沙滩过渡带
      ctx.strokeStyle = '#d8c58a';
      ctx.lineWidth = 14;
      ctx.beginPath();
      for (let y = worldTop; y <= worldBot; y += step) {
        const sx = toSX(bankX(-y)), sy = toSY(y);
        if (y === worldTop) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.strokeStyle = '#3c7a3a';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 草地装饰（确定性，不闪烁）
      ctx.fillStyle = 'rgba(30,80,30,0.5)';
      for (let y = Math.floor(worldTop / 40) * 40; y <= worldBot; y += 40) {
        const r1 = hash(y * 0.77 + side * 13);
        const r2 = hash(y * 1.31 + side * 29);
        const off = 30 + r1 * 90;
        const bx = bankX(-y) + side * off;
        const sx = toSX(bx), sy = toSY(y + r2 * 30);
        if (sx > -20 && sx < view.w + 20) {
          ctx.beginPath();
          ctx.arc(sx, sy, 4 + r2 * 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 每 100 米一个里程标记
    const mStep = 3000; // 100 m
    for (let dd = Math.ceil(-worldBot / mStep) * mStep; dd <= -worldTop; dd += mStep) {
      if (dd <= 0) continue;
      const sy = toSY(-dd);
      if (sy < -20 || sy > h + 20) continue;
      const bl = toSX(River.bankLeftAt(dd));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${dd / 30 | 0} m`, bl - 22, sy + 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bl - 16, sy);
      ctx.lineTo(bl + 10, sy);
      ctx.stroke();
    }
  }

  /* ---------- 河心岛 ---------- */

  function drawIslands(ctx, view, toSX, toSY, dMin, dMax) {
    for (const is of River.islandsNear(dMin, dMax)) {
      const step = 16;
      const pts = [];
      for (let dd = is.a; dd <= is.b + 0.1; dd += step) {
        const hw = River.islandHW(is, dd);
        pts.push([River.centerXAt(dd) + is.off, dd, hw]);
      }
      if (pts.length < 2) continue;

      ctx.beginPath();
      for (let k = 0; k < pts.length; k++) {
        const [x, dd, hw] = pts[k];
        const sx = toSX(x - hw), sy = toSY(-dd);
        if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      for (let k = pts.length - 1; k >= 0; k--) {
        const [x, dd, hw] = pts[k];
        ctx.lineTo(toSX(x + hw), toSY(-dd));
      }
      ctx.closePath();
      ctx.fillStyle = '#4a9648';
      ctx.fill();
      ctx.strokeStyle = '#d8c58a';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = '#3c7a3a';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 岛上灌木
      for (let k = 0; k < 3; k++) {
        const t = 0.3 + 0.2 * k;
        const dd = is.a + (is.b - is.a) * t;
        const hw = River.islandHW(is, dd);
        if (hw < 25) continue;
        const r1 = hash(is.sd + k * 17.7);
        const bx = River.centerXAt(dd) + is.off + (r1 * 2 - 1) * hw * 0.4;
        ctx.fillStyle = '#2f6b2d';
        ctx.beginPath();
        ctx.arc(toSX(bx), toSY(-dd), 7 + r1 * 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ---------- 石头 ---------- */

  function drawRock(ctx, sx, sy, rock, time, flash) {
    // 上游面（屏幕下方）的浪花
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    const wob = Math.sin(time * 6 + rock.sd) * 2;
    ctx.beginPath();
    ctx.arc(sx, sy, rock.r + 5 + wob, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, rock.r + 11 - wob, Math.PI * 0.25, Math.PI * 0.75);
    ctx.stroke();

    // 石头本体：种子决定的不规则多边形
    ctx.beginPath();
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const a = (k % n) / n * Math.PI * 2;
      const jitter = 0.8 + 0.28 * hash(rock.sd + (k % n) * 7.3);
      const px = sx + Math.cos(a) * rock.r * jitter;
      const py = sy + Math.sin(a) * rock.r * jitter;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = flash ? '#c9d4dc' : '#7d8a94'; // 被子弹击中瞬间闪白
    ctx.fill();
    ctx.strokeStyle = '#59646d';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(sx - rock.r * 0.25, sy - rock.r * 0.3, rock.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- 植物 ---------- */

  function drawPlant(ctx, sx, sy, p, time) {
    if (p.type === 'lily') {
      // 荷叶簇：几片带缺口的圆叶
      const n = 4 + Math.floor(hash(p.sd) * 3);
      for (let k = 0; k < n; k++) {
        const a = hash(p.sd + k * 3.3) * Math.PI * 2 + Math.sin(time * 1.2 + p.sd + k) * 0.06;
        const rr = hash(p.sd + k * 7.1) * p.r * 0.6;
        const px = sx + Math.cos(a) * rr;
        const py = sy + Math.sin(a) * rr;
        const pr = 8 + hash(p.sd + k * 11.9) * 6;
        const notch = hash(p.sd + k * 5.7) * Math.PI * 2;
        ctx.fillStyle = k % 2 ? '#3f8f3f' : '#4da34b';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.arc(px, py, pr, notch + 0.5, notch - 0.5 + Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(25,70,25,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    } else {
      // 芦苇丛：从基部散开的细秆
      const n = 6 + Math.floor(hash(p.sd) * 4);
      for (let k = 0; k < n; k++) {
        const spread = (k / (n - 1) - 0.5) * 1.1;
        const sway = Math.sin(time * 1.5 + p.sd + k * 1.7) * 0.09;
        const a = -Math.PI / 2 + spread + sway;
        const len = 14 + hash(p.sd + k * 4.9) * 12;
        const bx = sx + (hash(p.sd + k * 2.3) * 2 - 1) * p.r * 0.5;
        ctx.strokeStyle = k % 2 ? '#2e6b2e' : '#3d7c35';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(bx, sy + 4);
        ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.5, sy + Math.sin(a) * len * 0.6,
                             bx + Math.cos(a) * len, sy + Math.sin(a) * len);
        ctx.stroke();
        if (k % 3 === 0) { // 香蒲穗
          ctx.fillStyle = '#8a5f36';
          ctx.beginPath();
          ctx.ellipse(bx + Math.cos(a) * len, sy + Math.sin(a) * len, 2.5, 5, a + Math.PI / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /* ---------- 修理包 ---------- */

  function drawPack(ctx, sx, sy, pk, time) {
    const bob = Math.sin(time * 2 + pk.d) * 2.5;
    ctx.save();
    ctx.translate(sx, sy + bob);
    ctx.rotate(Math.sin(time * 1.3 + pk.d) * 0.08);
    // 水波
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 20 + Math.sin(time * 3 + pk.d) * 2, 0, Math.PI * 2);
    ctx.stroke();
    // 木箱
    ctx.fillStyle = '#c89b5f';
    ctx.strokeStyle = '#7a5b33';
    ctx.lineWidth = 3;
    ctx.fillRect(-13, -13, 26, 26);
    ctx.strokeRect(-13, -13, 26, 26);
    // 红十字
    ctx.fillStyle = '#d9382c';
    ctx.fillRect(-3.5, -9, 7, 18);
    ctx.fillRect(-9, -3.5, 18, 7);
    ctx.restore();
  }

  /* ---------- 木筏 ---------- */

  function drawBoat(ctx, view, boat, toSX, toSY) {
    const sx = toSX(boat.x), sy = toSY(boat.y);
    const bob = Math.sin(view.time * 2.3) * 0.02;

    // 尾流
    const spd = Math.hypot(boat.vx, boat.vy);
    if (spd > 60) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.4, spd / 900)})`;
      ctx.lineWidth = 3;
      const bx = -Math.sin(boat.heading), by = Math.cos(boat.heading); // 船尾方向
      for (const s of [-1, 1]) {
        const px = Math.cos(boat.heading) * s * 14, py = Math.sin(boat.heading) * s * 14;
        ctx.beginPath();
        ctx.moveTo(sx + bx * 40 + px, sy + by * 40 + py);
        ctx.lineTo(sx + bx * (40 + spd * 0.12) + px * 1.6, sy + by * (40 + spd * 0.12) + py * 1.6);
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(boat.heading + bob);

    // 受击无敌帧闪烁
    if (boat.invuln > 0 && Math.floor(view.time * 12) % 2 === 0) ctx.globalAlpha = 0.55;

    // 六支桨（先画，压在筏身下面一半）
    for (const s of [-1, 1]) { // -1 左, 1 右
      const stk = s < 0 ? boat.strokes.L : boat.strokes.R;
      const t = Math.min(1, stk.t / Boat.C.animDur);
      const sm = t * t * (3 - 2 * t);
      // 前划：前伸->后拉；后划：反向扫；静止微微外摆
      let phi;
      if (t >= 1) phi = -0.12;
      else phi = stk.dir > 0 ? 0.85 - 1.75 * sm : -0.9 + 1.75 * sm;
      for (const off of [-24, 0, 24]) {
        ctx.save();
        ctx.translate(s * 19, off);
        ctx.rotate(-s * phi);
        ctx.strokeStyle = '#6b4a2b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s * 24, 0);
        ctx.stroke();
        // 菱形桨叶：两条对称的弧线收出尖头
        ctx.fillStyle = '#8a5f36';
        ctx.beginPath();
        ctx.moveTo(s * 22, 0);
        ctx.quadraticCurveTo(s * 33, -8, s * 46, 0);
        ctx.quadraticCurveTo(s * 33, 8, s * 22, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#6b4a2b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 叶脊
        ctx.beginPath();
        ctx.moveTo(s * 24, 0);
        ctx.lineTo(s * 42, 0);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 筏身：尖船头 + 平圆船尾
    ctx.beginPath();
    ctx.moveTo(0, -47);                      // 船头尖
    ctx.quadraticCurveTo(19, -38, 21, -14);
    ctx.lineTo(21, 26);
    ctx.quadraticCurveTo(21, 38, 0, 38);     // 船尾
    ctx.quadraticCurveTo(-21, 38, -21, 26);
    ctx.lineTo(-21, -14);
    ctx.quadraticCurveTo(-19, -38, 0, -47);
    ctx.closePath();
    ctx.fillStyle = '#e8702a';
    ctx.fill();
    ctx.strokeStyle = '#a34a15';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 船头黄色 V 形条纹（指向前进方向）
    ctx.strokeStyle = '#ffd35c';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, -24);
    ctx.lineTo(0, -39);
    ctx.lineTo(12, -24);
    ctx.stroke();

    // 内衬
    roundRect(ctx, -13, -20, 26, 52, 9);
    ctx.fillStyle = '#f5a25c';
    ctx.fill();

    // 充气管纹理
    ctx.strokeStyle = 'rgba(163,74,21,0.6)';
    ctx.lineWidth = 2;
    for (const yy of [-12, 6, 24]) {
      ctx.beginPath();
      ctx.moveTo(-17, yy);
      ctx.lineTo(17, yy);
      ctx.stroke();
    }

    // 六名划手（黄头盔）
    ctx.fillStyle = '#ffd35c';
    ctx.strokeStyle = '#c99a2e';
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      for (const off of [-24, 0, 24]) {
        ctx.beginPath();
        ctx.arc(s * 8, off, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 船尾小红旗
    ctx.strokeStyle = '#7a5b33';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 38);
    ctx.lineTo(0, 52);
    ctx.stroke();
    const flap = Math.sin(view.time * 6) * 2;
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.moveTo(0, 52);
    ctx.lineTo(11 + flap, 48);
    ctx.lineTo(0, 44);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { reset, draw, burst };
})();
