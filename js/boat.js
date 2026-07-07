'use strict';
/*
 * 木筏物理。
 * heading = 0 表示朝下游（屏幕上方），正方向为顺时针（向右转）。
 * 前进向量 fwd = (sin h, -cos h)，右侧向量 side = (cos h, sin h)。
 * 划桨：stroke(side, dir)，dir=+1 前划，dir=-1 后划（左后划→左转，可配合对侧前划原地掉头）。
 */
const Boat = (() => {
  // 手感调参都集中在这里
  const C = {
    hp: 100,
    thrust: 720,        // 单次前划推力峰值 (px/s^2)
    backThrustMul: 0.65,// 后划推力比例
    backTorqueMul: 1.15,// 后划力矩比例（后划更利于转向）
    strokeDur: 0.35,    // 推力作用时长 (s)
    animDur: 0.55,      // 桨动画时长 (s)
    retrigger: 0.34,    // 同侧两次划桨最小间隔 (s)
    torque: 6.0,        // 单侧划桨力矩峰值 (rad/s^2)
    dragLong: 1.25,     // 纵向水阻 (1/s，作用于相对水流的速度)
    dragLat: 3.8,       // 横向水阻——船不容易横漂
    dragAng: 3.0,       // 角阻尼
    shearTorque: 0.022, // 船头/船尾水流差产生的旋转（漩涡会拽着船转）
    sampleLen: 30,      // 船头/船尾采样点距船心
    maxSpeed: 620,
    circles: [-26, 0, 26], // 碰撞圆沿船身的偏移
    circleR: 19,
    invulnTime: 0.9,
    healAmount: 20,     // 修理包回复量
    fireInterval: 0.3,  // 船头自动开火间隔 (s)
    bulletSpeed: 560,
    bulletLife: 0.85,   // 子弹存活时间（决定射程约 480px）
    bulletR: 4,
  };

  const state = {
    x: 0, y: 0, vx: 0, vy: 0,
    heading: 0, angVel: 0,
    hp: C.hp, alive: true,
    dist: 0,          // 最远下漂距离（px）
    invuln: 0,
    time: 0,          // 游戏内累计时间（供石头受击闪白等使用）
    strokes: { L: { t: 99, dir: 1 }, R: { t: 99, dir: 1 } },
    bullets: [],
    fireT: 0,
  };

  let onHit = null;       // main.js 注入：受击 (dmg)
  let onPickup = null;    // main.js 注入：获得修理包 (x, y)
  let onBulletHit = null; // main.js 注入：子弹命中 (x, y, 'hit'|'break')

  function reset() {
    state.x = River.centerXAt(0);
    state.y = 0;
    state.vx = 0; state.vy = 0;
    state.heading = 0; state.angVel = 0;
    state.hp = C.hp; state.alive = true;
    state.dist = 0; state.invuln = 0; state.time = 0;
    state.strokes.L.t = 99; state.strokes.L.dir = 1;
    state.strokes.R.t = 99; state.strokes.R.dir = 1;
    state.bullets.length = 0;
    state.fireT = 0;
  }

  function stroke(side, dir = 1) {
    if (!state.alive) return false;
    const s = state.strokes[side];
    if (s.t < C.retrigger) return false;
    s.t = 0;
    s.dir = dir;
    return true;
  }

  function strokeProfile(t) {
    if (t < 0 || t >= C.strokeDur) return 0;
    return Math.sin(Math.PI * t / C.strokeDur);
  }

  function damage(dmg) {
    if (state.invuln > 0 || !state.alive) return;
    state.hp = Math.max(0, state.hp - dmg);
    state.invuln = C.invulnTime;
    if (state.hp <= 0) state.alive = false;
    if (onHit) onHit(dmg);
  }

  function update(dt) {
    const st = state;
    st.time += dt;
    st.strokes.L.t += dt;
    st.strokes.R.t += dt;
    st.invuln = Math.max(0, st.invuln - dt);

    const fwdX = Math.sin(st.heading), fwdY = -Math.cos(st.heading);
    const sideX = Math.cos(st.heading), sideY = Math.sin(st.heading);

    // ---- 划桨：推力 + 力矩（前划：左桨右转；后划：左桨左转 + 倒退）----
    let thrust = 0, torque = 0;
    const pL = strokeProfile(st.strokes.L.t), eL = st.strokes.L.dir;
    const pR = strokeProfile(st.strokes.R.t), eR = st.strokes.R.dir;
    thrust += C.thrust * pL * (eL > 0 ? 1 : -C.backThrustMul);
    thrust += C.thrust * pR * (eR > 0 ? 1 : -C.backThrustMul);
    torque += C.torque * pL * eL * (eL > 0 ? 1 : C.backTorqueMul);
    torque -= C.torque * pR * eR * (eR > 0 ? 1 : C.backTorqueMul);

    // ---- 水流：船头/船尾各采样一次，均值给推力、差值给旋转 ----
    const wB = River.flowAt(st.x + fwdX * C.sampleLen, st.y + fwdY * C.sampleLen);
    const wS = River.flowAt(st.x - fwdX * C.sampleLen, st.y - fwdY * C.sampleLen);
    const wx = (wB.x + wS.x) / 2, wy = (wB.y + wS.y) / 2;
    const shear = (wB.x - wS.x) * sideX + (wB.y - wS.y) * sideY;
    torque += shear * C.shearTorque;

    // ---- 相对水流的阻力（水对船的耦合：水会拖着船走）----
    const rvx = st.vx - wx, rvy = st.vy - wy;
    const rLong = rvx * fwdX + rvy * fwdY;
    const rLat = rvx * sideX + rvy * sideY;

    const ax = fwdX * thrust - (fwdX * rLong * C.dragLong + sideX * rLat * C.dragLat);
    const ay = fwdY * thrust - (fwdY * rLong * C.dragLong + sideY * rLat * C.dragLat);

    st.vx += ax * dt;
    st.vy += ay * dt;

    const sp = Math.hypot(st.vx, st.vy);
    if (sp > C.maxSpeed) { st.vx *= C.maxSpeed / sp; st.vy *= C.maxSpeed / sp; }

    st.angVel += (torque - st.angVel * C.dragAng) * dt;
    st.heading += st.angVel * dt;

    st.x += st.vx * dt;
    st.y += st.vy * dt;
    st.dist = Math.max(st.dist, -st.y);

    const d = -st.y;

    // ---- 植物：减速但不扣血 ----
    let slow = 0;
    for (const p of River.plantsNear(d - 120, d + 120)) {
      if (Math.hypot(st.x - p.x, st.y - (-p.d)) < p.r + 18) {
        slow = Math.max(slow, p.type === 'lily' ? 1.7 : 1.2);
      }
    }
    if (slow > 0) {
      const f = Math.max(0, 1 - slow * dt);
      st.vx *= f; st.vy *= f; st.angVel *= f;
    }

    // ---- 修理包 ----
    for (const pk of River.packsNear(d - 100, d + 100)) {
      if (pk.taken) continue;
      if (Math.hypot(st.x - pk.x, st.y - (-pk.d)) < 42) {
        pk.taken = true;
        st.hp = Math.min(C.hp, st.hp + C.healAmount);
        if (onPickup) onPickup(pk.x, -pk.d);
      }
    }

    // ---- 船头自动开火 ----
    st.fireT += dt;
    while (st.fireT >= C.fireInterval) {
      st.fireT -= C.fireInterval;
      const fX = Math.sin(st.heading), fY = -Math.cos(st.heading); // 积分后的最新朝向
      st.bullets.push({
        x: st.x + fX * 52, y: st.y + fY * 52,
        vx: st.vx + fX * C.bulletSpeed, vy: st.vy + fY * C.bulletSpeed,
        life: C.bulletLife,
      });
    }
    updateBullets(dt);

    collide();
  }

  function updateBullets(dt) {
    const st = state;
    for (let i = st.bullets.length - 1; i >= 0; i--) {
      const bu = st.bullets[i];
      bu.life -= dt;
      bu.x += bu.vx * dt;
      bu.y += bu.vy * dt;
      let dead = bu.life <= 0;
      const bd = -bu.y;

      // 岸和岛挡子弹
      if (!dead && (bu.x < River.bankLeftAt(bd) || bu.x > River.bankRightAt(bd))) dead = true;
      if (!dead) {
        const isl = River.islandAt(bd);
        if (isl && Math.abs(bu.x - isl.x) < isl.hw) dead = true;
      }

      // 石头：击中掉 1 点，打空则碎
      if (!dead) {
        for (const rock of River.rocksNear(bd - 80, bd + 80)) {
          if (Math.hypot(bu.x - rock.x, bu.y - (-rock.d)) < rock.r + C.bulletR) {
            rock.hp -= 1;
            rock.flashT = st.time;
            if (rock.hp <= 0) {
              rock.destroyed = true;
              if (onBulletHit) onBulletHit(rock.x, -rock.d, 'break');
            } else if (onBulletHit) {
              onBulletHit(bu.x, bu.y, 'hit');
            }
            dead = true;
            break;
          }
        }
      }

      // 修理包：隔空收取
      if (!dead) {
        for (const pk of River.packsNear(bd - 60, bd + 60)) {
          if (!pk.taken && Math.hypot(bu.x - pk.x, bu.y - (-pk.d)) < 18 + C.bulletR) {
            pk.taken = true;
            st.hp = Math.min(C.hp, st.hp + C.healAmount);
            if (onPickup) onPickup(pk.x, -pk.d);
            dead = true;
            break;
          }
        }
      }

      if (dead) st.bullets.splice(i, 1);
    }
  }

  function collide() {
    const st = state;
    const fwdX = Math.sin(st.heading), fwdY = -Math.cos(st.heading);
    const sideX = Math.cos(st.heading), sideY = Math.sin(st.heading);
    const d = -st.y;
    const rocks = River.rocksNear(d - 200, d + 200);

    for (const off of C.circles) {
      const cx = st.x + fwdX * off, cy = st.y + fwdY * off;
      const rr = C.circleR;

      // ---- 石头（扣耐久）----
      for (const rock of rocks) {
        const ry = -rock.d;
        const dx = cx - rock.x, dy = cy - ry;
        const dist = Math.hypot(dx, dy);
        const minDist = rr + rock.r;
        if (dist >= minDist || dist < 0.001) continue;
        const nx = dx / dist, ny = dy / dist;
        const pen = minDist - dist;
        st.x += nx * pen;
        st.y += ny * pen;
        const vn = st.vx * nx + st.vy * ny;
        if (vn < 0) {
          st.vx -= nx * vn * 1.4;
          st.vy -= ny * vn * 1.4;
          const impact = -vn;
          if (impact > 45) damage(Math.min(34, 6 + (impact - 45) * 0.10));
          // 偏心撞击带一点旋转
          st.angVel += (nx * sideX + ny * sideY) * (off > 0 ? -1 : off < 0 ? 1 : 0) * 1.6;
        }
      }

      // ---- 河岸（只反弹，不扣耐久）----
      const dc = -cy;
      const bl = River.bankLeftAt(dc), br = River.bankRightAt(dc);
      if (cx - rr < bl) {
        st.x += bl - (cx - rr);
        if (st.vx < 0) st.vx = -st.vx * 0.35;
      } else if (cx + rr > br) {
        st.x -= (cx + rr) - br;
        if (st.vx > 0) st.vx = -st.vx * 0.35;
      }

      // ---- 河心岛边缘（同河岸：只反弹）----
      const isl = River.islandAt(dc);
      if (isl && isl.hw > 2) {
        const dx = cx - isl.x;
        if (Math.abs(dx) < isl.hw + rr) {
          const sgn = dx >= 0 ? 1 : -1;
          st.x += isl.x + sgn * (isl.hw + rr) - cx;
          if ((sgn > 0 && st.vx < 0) || (sgn < 0 && st.vx > 0)) st.vx = -st.vx * 0.35;
        }
      }
    }
  }

  return {
    state, C,
    reset, update, stroke,
    set onHit(fn) { onHit = fn; },
    set onPickup(fn) { onPickup = fn; },
    set onBulletHit(fn) { onBulletHit = fn; },
  };
})();
