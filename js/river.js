'use strict';
/*
 * 河道：程序化无限生成。
 * 世界坐标：y 向下为正，下游方向是 -y（船在屏幕上朝上前进）。
 * d = -y 表示顺流而下走过的像素距离（30 px = 1 m）。
 * 河道形状（中心线/河宽）是解析函数；石头、漩涡、急流、河心岛、植物、修理包按 chunk 生成。
 */
const River = (() => {
  const CHUNK_H = 900;

  let seed = 1;
  let phases = [0, 0, 0, 0];
  let chunks = new Map();

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function reset(newSeed) {
    seed = newSeed | 0;
    const r = mulberry32(seed);
    phases = [r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2];
    chunks = new Map();
  }

  /* ---------- 河道形状（解析，处处可采样） ---------- */

  function centerX(d) {
    return 120 * Math.sin(d * 0.0016 + phases[0])
         + 70 * Math.sin(d * 0.0031 + phases[1])
         + 40 * Math.sin(d * 0.0007 + phases[2]);
  }

  function centerSlope(d) {
    return (centerX(d + 2) - centerX(d - 2)) / 4;
  }

  function halfWidth(d) {
    const base = Math.max(205, 300 - d * 0.004); // 随距离缓慢收窄
    return Math.max(145, base + 55 * Math.sin(d * 0.0021 + phases[3]));
  }

  function bankLeft(d) { return centerX(d) - halfWidth(d); }
  function bankRight(d) { return centerX(d) + halfWidth(d); }

  function flowBase(d) {
    return 72 + Math.min(95, Math.max(0, d) * 0.003); // 流速随距离增加
  }

  /* ---------- 河心岛 ---------- */

  // 岛的梭形轮廓：两端收尖
  function islandHW(is, d) {
    if (d <= is.a || d >= is.b) return 0;
    return is.maxHW * Math.pow(Math.sin(Math.PI * (d - is.a) / (is.b - is.a)), 0.7);
  }

  // d 处若在岛区间内，返回 {x: 岛中心, hw: 岛半宽}
  function islandAt(d) {
    if (d < 0) return null;
    const c = getChunk(Math.floor(d / CHUNK_H));
    if (!c || !c.island) return null;
    const hw = islandHW(c.island, d);
    if (hw <= 0) return null;
    return { x: centerX(d) + c.island.off, hw };
  }

  /* ---------- chunk 生成 ---------- */

  // 检查加入 rock 后，同一横带上是否仍留有 >=115px 的可通行水道（岛也算占用）
  function canPlace(rock, others) {
    const d = rock.d;
    const lo = bankLeft(d) + 22, hi = bankRight(d) - 22;
    const ints = [[rock.x - rock.r - 45, rock.x + rock.r + 45]];
    for (const o of others) {
      if (Math.abs(o.d - d) < 130) ints.push([o.x - o.r - 45, o.x + o.r + 45]);
    }
    const isl = islandAt(d);
    if (isl) ints.push([isl.x - isl.hw - 45, isl.x + isl.hw + 45]);
    ints.sort((a, b) => a[0] - b[0]);
    let pos = lo, gap = 0;
    for (const [a, b] of ints) {
      gap = Math.max(gap, Math.min(a, hi) - pos);
      pos = Math.max(pos, b);
    }
    gap = Math.max(gap, hi - pos);
    return gap >= 115;
  }

  function getChunk(i) {
    if (i < 0) return null;
    let c = chunks.get(i);
    if (c) return c;

    const rnd = mulberry32((seed + i * 1013904223) | 0);
    const d0 = i * CHUNK_H;
    const diff = Math.min(1, d0 / 22000); // 难度 0 → 1

    c = { rocks: [], whirls: [], plants: [], rapid: null, island: null, pack: null };
    chunks.set(i, c); // 先注册，后续 islandAt/canPlace 查询本 chunk 才不会递归

    // 急流带
    if (i > 0 && rnd() < 0.30 + 0.22 * diff) {
      const len = 300 + rnd() * 450;
      const a = d0 + rnd() * (CHUNK_H - len);
      c.rapid = { a, b: a + len, mult: 1.45 + rnd() * 0.5 + 0.5 * diff };
    }

    // 河心岛（与急流互斥；水道一分为二）
    if (!c.rapid && d0 > 1500 && rnd() < 0.22) {
      const len = 500 + rnd() * 300;
      const a = d0 + rnd() * (CHUNK_H - len);
      const off = (rnd() * 2 - 1) * 50;
      let minHW = Infinity;
      for (let dd = a; dd <= a + len; dd += 40) minHW = Math.min(minHW, halfWidth(dd));
      const maxHW = Math.min(95, minHW - 145 - Math.abs(off)); // 两侧水道各留 >=120px
      if (maxHW > 45) c.island = { a, b: a + len, off, maxHW, sd: rnd() * 1000 };
    }

    // 石头（撞岸不再扣血，数量略增补偿难度）
    const nRocks = Math.round(2.5 + 5.5 * diff + rnd() * 2.5);
    const prev = chunks.get(i - 1);
    const neighbors = prev ? prev.rocks : [];
    for (let k = 0; k < nRocks; k++) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const dr = d0 + rnd() * CHUNK_H;
        if (dr < 700) break; // 出发区留空
        const r = 14 + rnd() * 16;
        const hw = halfWidth(dr);
        const x = centerX(dr) + (rnd() * 2 - 1) * Math.max(10, hw - r - 30);
        const isl = islandAt(dr);
        if (isl && Math.abs(x - isl.x) < isl.hw + r + 15) continue; // 不放在岛上
        // hp = 被子弹击碎所需发数（越大的石头越硬）
        const rock = { x, d: dr, r, sd: rnd() * 1000, hp: Math.ceil(r / 6), destroyed: false, flashT: -9 };
        if (canPlace(rock, c.rocks.concat(neighbors))) { c.rocks.push(rock); break; }
      }
    }

    // 漩涡（避开岛区间）
    const nW = i < 1 ? 0 : Math.floor(rnd() * (1.4 + 1.3 * diff));
    for (let k = 0; k < nW; k++) {
      const dw = d0 + rnd() * CHUNK_H;
      if (c.island && dw > c.island.a - 120 && dw < c.island.b + 120) continue;
      const R = 65 + rnd() * 55 * (0.6 + diff);
      const hw = halfWidth(dw);
      const x = centerX(dw) + (rnd() * 2 - 1) * Math.max(10, hw - R * 0.6 - 40);
      const wl = { x, d: dw, R, str: (85 + rnd() * 70) * (1 + 0.7 * diff), dir: rnd() < 0.5 ? -1 : 1 };
      let ok = true;
      for (const ro of c.rocks) {
        if (Math.hypot(ro.x - x, ro.d - dw) < ro.r + R * 0.5) { ok = false; break; }
      }
      if (ok) c.whirls.push(wl);
    }

    // 植物：荷叶（慢水区）与芦苇（贴岸），无伤害软障碍
    const nP = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < nP; k++) {
      const dp = d0 + rnd() * CHUNK_H;
      if (dp < 400) continue;
      const type = rnd() < 0.55 ? 'lily' : 'reed';
      const hw = halfWidth(dp);
      const side = rnd() < 0.5 ? -1 : 1;
      const u = type === 'reed' ? 0.90 + rnd() * 0.07 : 0.55 + rnd() * 0.32;
      const x = centerX(dp) + side * u * hw;
      const r = type === 'lily' ? 26 + rnd() * 20 : 18 + rnd() * 12;
      const isl = islandAt(dp);
      if (isl && Math.abs(x - isl.x) < isl.hw + r + 10) continue;
      let ok = true;
      for (const ro of c.rocks) {
        if (Math.hypot(ro.x - x, ro.d - dp) < ro.r + r) { ok = false; break; }
      }
      if (ok) c.plants.push({ x, d: dp, r, type, sd: rnd() * 1000 });
    }

    // 修理包
    if (i > 0 && rnd() < 0.22 + 0.15 * diff) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const dp = d0 + rnd() * CHUNK_H;
        if (dp < 900) break;
        const x = centerX(dp) + (rnd() * 2 - 1) * (halfWidth(dp) - 70);
        const isl = islandAt(dp);
        if (isl && Math.abs(x - isl.x) < isl.hw + 40) continue;
        let ok = true;
        for (const ro of c.rocks) {
          if (Math.hypot(ro.x - x, ro.d - dp) < ro.r + 35) { ok = false; break; }
        }
        if (ok) { c.pack = { x, d: dp, taken: false }; break; }
      }
    }

    return c;
  }

  // 预生成船前方的 chunk，清理身后远处的
  function ensure(d) {
    const i0 = Math.floor(Math.max(0, d - 1200) / CHUNK_H);
    const i1 = Math.floor((d + 2600) / CHUNK_H);
    for (let i = i0; i <= i1; i++) getChunk(i);
    for (const key of chunks.keys()) {
      if (key < i0 - 2) chunks.delete(key);
    }
  }

  /* ---------- 水流场（物理与视觉共用） ---------- */

  function smooth01(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  function rapidMult(d) {
    let m = 1;
    const i0 = Math.floor(d / CHUNK_H);
    for (let i = Math.max(0, i0 - 1); i <= i0 + 1; i++) {
      const c = getChunk(i);
      if (!c || !c.rapid) continue;
      const t = smooth01((d - c.rapid.a) / 120) * smooth01((c.rapid.b - d) / 120);
      m = Math.max(m, 1 + (c.rapid.mult - 1) * t);
    }
    return m;
  }

  function flowAt(x, y) {
    const d = -y;
    const cx = centerX(d), hw = halfWidth(d);
    let u = (x - cx) / hw;
    u = Math.max(-1.15, Math.min(1.15, u));

    let speed = flowBase(d) * (260 / hw) * rapidMult(d);
    speed *= 1 - 0.5 * Math.min(1, u * u); // 河心快、近岸慢

    const isl = islandAt(d);
    if (isl) speed *= Math.min(1.6, hw / Math.max(60, hw - isl.hw)); // 水道变窄，流速加快

    let vx = speed * centerSlope(d) - u * 18; // 顺着河道蜿蜒 + 微弱向心
    let vy = -speed;

    if (isl) {
      // 分流：靠近岛头/岛身时被推向所在侧水道
      const dx = x - isl.x;
      const push = Math.max(0, 1 - Math.abs(dx) / (isl.hw + 80));
      vx += (dx >= 0 ? 1 : -1) * push * 70;
    }

    // 漩涡：切向旋转 + 向心吸力
    const i0 = Math.floor(d / CHUNK_H);
    for (let i = Math.max(0, i0 - 1); i <= i0 + 1; i++) {
      const c = getChunk(i);
      if (!c) continue;
      for (const wl of c.whirls) {
        const dx = x - wl.x, dy = y - (-wl.d);
        const dist = Math.hypot(dx, dy);
        if (dist >= wl.R || dist < 1) continue;
        const t = dist / wl.R;
        const fall = t < 0.35 ? t / 0.35 : (1 - t) / 0.65;
        const tang = wl.str * fall * wl.dir;
        const inw = wl.str * 0.4 * (1 - t);
        vx += (-dy / dist) * tang + (-dx / dist) * inw;
        vy += (dx / dist) * tang + (-dy / dist) * inw;
      }
    }
    return { x: vx, y: vy };
  }

  /* ---------- 查询（渲染 / 碰撞用） ---------- */

  function collectNear(dMin, dMax, pick) {
    const out = [];
    const i0 = Math.max(0, Math.floor(dMin / CHUNK_H));
    const i1 = Math.max(0, Math.floor(dMax / CHUNK_H));
    for (let i = i0; i <= i1; i++) {
      const c = getChunk(i);
      if (c) pick(c, out);
    }
    return out;
  }

  function rocksNear(dMin, dMax) {
    return collectNear(dMin - 100, dMax + 100, (c, out) => {
      for (const r of c.rocks) if (!r.destroyed && r.d >= dMin - 100 && r.d <= dMax + 100) out.push(r);
    });
  }

  function whirlsNear(dMin, dMax) {
    return collectNear(dMin - 200, dMax + 200, (c, out) => {
      for (const w of c.whirls) if (w.d >= dMin - 200 && w.d <= dMax + 200) out.push(w);
    });
  }

  function plantsNear(dMin, dMax) {
    return collectNear(dMin - 100, dMax + 100, (c, out) => {
      for (const p of c.plants) if (p.d >= dMin - 100 && p.d <= dMax + 100) out.push(p);
    });
  }

  function packsNear(dMin, dMax) {
    return collectNear(dMin - 100, dMax + 100, (c, out) => {
      if (c.pack && c.pack.d >= dMin - 100 && c.pack.d <= dMax + 100) out.push(c.pack);
    });
  }

  function islandsNear(dMin, dMax) {
    return collectNear(dMin, dMax, (c, out) => {
      if (c.island && c.island.b >= dMin && c.island.a <= dMax) out.push(c.island);
    });
  }

  function rapidsNear(dMin, dMax) {
    return collectNear(dMin, dMax, (c, out) => {
      if (c.rapid && c.rapid.b >= dMin && c.rapid.a <= dMax) out.push(c.rapid);
    });
  }

  return {
    CHUNK_H,
    reset, ensure, flowAt,
    centerXAt: centerX, halfWidthAt: halfWidth,
    bankLeftAt: bankLeft, bankRightAt: bankRight,
    islandAt, islandHW,
    rocksNear, whirlsNear, plantsNear, packsNear, islandsNear, rapidsNear,
  };
})();
