# White Water Rafting · 激流勇进

A pure-frontend whitewater rafting game: steer a six-oar raft with two-key paddling down an endlessly generated river — dodge rocks (or blast them with the bow cannon), ride the rapids, escape whirlpools, and pick your channel at river forks. See how far you can get.

**Play online: https://tianyunx.github.io/white-water-rafting-game/**

Zero dependencies, no build step — plain HTML5 Canvas + vanilla JavaScript. Just open `index.html` and play. The UI is available in English and 中文 (toggle button on the title screen).

## Controls

| Key | Action |
|------|--------|
| `←` / `A` | Left oars forward stroke (bow turns right) |
| `→` / `D` | Right oars forward stroke (bow turns left) |
| `Z` | Left oars back-paddle (turns left + reverses) |
| `X` | Right oars back-paddle |
| `ESC` | Pause / resume (or tap the ⏸ button) |
| `M` | Mute |
| Space | Start / restart |

Alternate left/right to go straight and fast; back-paddle plus opposite forward stroke pivots on the spot. On touch devices, use the on-screen buttons in the bottom corners.

## Gameplay

- The bow cannon fires automatically: aim by steering — rocks crack after a few hits (bigger = tougher), and shooting a floating crate collects it remotely
- Hitting rocks damages the hull based on impact speed; when it reaches zero the raft falls apart. Banks and islands only slow you down
- Lilies and reeds are harmless but drag the raft noticeably
- The current genuinely pushes the boat: faster mid-river, slower near banks, accelerating in narrow channels, and whirlpools spin you around — the flow you see is the flow you feel (physics and rendering share one flow-field function)
- Difficulty ramps with distance: narrower river, faster current, more rocks
- The HUD tracks distance, speed, rocks smashed, and your all-time best — the best-record counter turns gold and follows you live the moment you surpass it
- Best distance is saved in localStorage (per browser/device)

## Tech notes

- `js/river.js` — chunked infinite procedural river: sine-blend centerline, reproducible seeded randomness (mulberry32), rock layouts guaranteed to leave a passable channel, mid-river island forks, and the shared flow field `flowAt(x, y)`
- `js/boat.js` — boat physics: stroke impulses, anisotropic drag relative to the water, natural rotation from bow/stern flow difference, collisions and hull damage; all feel-tuning constants live in the `C` object at the top
- `js/render.js` — fully procedural Canvas drawing, no image assets
- `js/sound.js` — WebAudio-synthesized sound effects, no audio files

---

# 中文说明

一个纯前端的白水漂流小游戏：两键划桨控制一艘六桨木筏，在程序化生成的无限河道里顺流而下，躲开（或者用船头机炮打碎）石头，穿过急流、漩涡和河道分岔，看你能漂多远。

**在线试玩：https://tianyunx.github.io/white-water-rafting-game/**

无任何依赖、无构建步骤——纯 HTML5 Canvas + 原生 JavaScript，双击 `index.html` 即可游玩。界面支持中英文切换（标题画面右上角按钮）。

## 操作

| 按键 | 动作 |
|------|------|
| `←` / `A` | 左侧三桨前划（船头向右偏） |
| `→` / `D` | 右侧三桨前划（船头向左偏） |
| `Z` | 左桨后划（船头向左偏 + 倒退） |
| `X` | 右桨后划 |
| `ESC` | 暂停 / 继续（也可点 ⏸ 按钮） |
| `M` | 静音 |
| 空格 | 开始 / 重开 |

左右交替前划＝直行加速；后划＋对侧前划＝原地掉头。触屏设备用屏幕四角的按钮划桨。

## 玩法

- 船头自动发射子弹：对准石头可以把它打碎（越大越硬），打中漂浮的木箱可隔空收取修理包（+20 耐久）
- 撞石头按撞击速度扣耐久，耐久归零游戏结束；撞岸和河心岛只减速不扣血
- 荷叶、芦苇不造成伤害，但会明显拖慢船
- 水流会真实地影响船：河心快、近岸慢、窄道加速、漩涡拽着船打转——看到的水流方向就是船受力的方向（物理和渲染共用同一个流场函数）
- 难度随距离上升：河道变窄、水流变急、石头变多
- HUD 实时显示距离、速度、击碎石头数和历史最高纪录——一旦超越纪录，"最高"数字会变金色并实时跟涨
- 最佳纪录保存在浏览器 localStorage（每个浏览器/设备各自独立）

## 技术要点

- `js/river.js` — 分块（chunk）无限程序化河道：正弦叠加的中心线、可复现的种子随机（mulberry32）、保证可通行的石头布局、河心岛分岔、以及物理/视觉共用的水流场 `flowAt(x, y)`
- `js/boat.js` — 船体物理：划桨脉冲、相对水流的各向异性阻力、船头/船尾流速差产生的自然旋转、碰撞与耐久，手感参数集中在顶部 `C` 对象
- `js/render.js` — 全程序化 Canvas 绘制，无图片素材
- `js/sound.js` — WebAudio 纯合成音效，无音频素材

🤖 Generated with [Claude Code](https://claude.com/claude-code)
