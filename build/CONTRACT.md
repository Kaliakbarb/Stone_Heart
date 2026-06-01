# ТАС ЖҮРЕК / STONE HEART — ENGINE CONTRACT (authoritative interface spec)

This is the single source of truth every module obeys. All files are RAW JavaScript
fragments concatenated, in the LOAD ORDER below, inside ONE `<script>` tag of `index.html`.
There is NO module system, NO bundler — everything shares one global scope.

Obey this contract absolutely. Use ONLY the documented global namespaces and signatures.
NEVER reach into another module's internal state beyond its documented API. Each namespace
is DEFINED by exactly one file (see OWNERSHIP). You may ADD to the namespace you own and
CALL other modules' documented APIs, but must NOT redefine a namespace you do not own.

All in-game text (Russian/Kazakh) is reproduced VERBATIM from DESIGN.md. Do not translate,
paraphrase, shorten, or invent dialogue. Names keep their Cyrillic spelling.

---

## 0. FILE LOAD ORDER (canonical)

```
00-engine.js    10-sprites.js   20-audio.js    30-map.js     40-dialogue.js
50-battle.js    60-memory.js    70-ui.js       80-ch1-2.js   81-ch3-4.js
82-ch5-6.js     83-ch7-8.js
```

The engine boots on `DOMContentLoaded`, AFTER every module has executed top-level, so all
registrations (Scenes.register, Map.register, Sprites.define, Audio cue setup, Dialogue
tree literals) exist before anything runs.

---

## 1. OWNERSHIP TABLE (pinned — do not deviate)

| File           | DEFINES (owns)                                                              |
|----------------|----------------------------------------------------------------------------|
| 00-engine.js   | `G`, `PALETTE`, `Input`, `Scenes`, `setScene`, `EventBus`, `Save`, the rAF loop, gameTime accumulation, pause-menu shell, fade transition, built-in fallback `title` + `boot` |
| 10-sprites.js  | `Sprites`                                                                   |
| 20-audio.js    | `Audio`                                                                     |
| 30-map.js      | `Map`, `Decay`                                                              |
| 40-dialogue.js | `Dialogue`                                                                  |
| 50-battle.js   | `Battle`, `Rhythm`                                                          |
| 60-memory.js   | `Memory`, `Quests`, `Endings`                                               |
| 70-ui.js       | `UI`, `Cutscene`; OVERRIDES the engine fallback `title`, adds `menu`, `ending_a`, `ending_b`, `ending_c` scenes |
| 80-ch1-2.js    | REGISTERS `ch1_*`, `ch2_*` scenes + their Map locations + Dialogue trees    |
| 81-ch3-4.js    | REGISTERS `ch3_*`, `ch4_*` scenes + their Map locations + Dialogue trees    |
| 82-ch5-6.js    | REGISTERS `ch5_*`, `ch6_*` scenes + their Map locations + Dialogue trees    |
| 83-ch7-8.js    | REGISTERS `ch7_*`, `ch8_*` scenes + their Map locations + Dialogue trees    |

Chapter files ONLY register scenes/data. They never define a core namespace.

**TOP-LEVEL SAFETY:** at module top-level you may only (a) define your owned namespace and
(b) REGISTER data. NEVER call another module's runtime method (draw/play/update/start) at
top-level — those run only inside scene/update/render callbacks.

---

## 2. GLOBAL STATE — `G` (defined by 00-engine.js)

`G` is a single mutable global object. The engine creates it with `Save.defaults()`. Any
module reads/writes fields directly. Save serializes the whole object (minus runtime-only
keys listed in §13). FULL shape with exact field names, types, and initial values:

```js
G = {
  chapter: 1,                 // int 1..8 — current story chapter
  sceneId: "boot",            // string — id of the active scene (engine keeps this in sync)
  flags: {},                  // { [name:string]: boolean|number|string } — set by dialogue choices
  inventory: [],              // string[] of item keys, e.g. ["dombra","tas_bilezik"]
  party: ["erzhan"],          // string[] of party member keys; grows: "ayaulym", ...
  dombraMelodyLearned: 0,     // int 0..3 — passages of the unfinished kui learned
                              //   0 start, +1 after father's 8 notes (ch3), up toward 3
  worldDecay: {},             // { [regionId:string]: number 0..1 } — 0 alive, 1 fully grey
  killCount: 0,               // int — HIDDEN running kill counter; never shown in UI
  memories: [],               // string[] of collected petroglyph ids (max 12; see §11)
  quests: {},                 // { [questId:string]: "inactive"|"active"|"done" }
  coalition: { dosan:false, marat:false, erlan:false }, // bek alliance booleans
  ayaulymTrust: 0,            // int — relationship score with Аяулым (raised by good choices)
  ayaulymLeft: false,         // boolean — true if player told Аяулым to leave (ch6 choice C)
  serikPath: "neutral",       // "neutral"|"kill"|"music"|"understand" — final-dialogue branch lean
  settings: { musicVol: 0.6, sfxVol: 0.8, textSpeed: 30 }, // textSpeed = ms per char
  saveSlot: 1,                // int 1..3 — active save slot
  gameTimeMs: 0               // number — accumulated in-game time in ms (advances while !paused)
};
```

Field semantics modules rely on:
- `dombraMelodyLearned` is the count used by the FINAL rhythm fight to know how complete the
  kui is. Reaching the father's passage sets it to at least 1.
- `worldDecay[regionId]` is authored/read ONLY through the `Decay` API (§10). Renderers READ
  it via `Decay.levelFor(regionId)`.
- `serikPath` accumulates the lean from final-dialogue choices; `Endings.resolve()` reads it.
- `quests[id]` values are the three strings above; use the `Quests` API (§11) to mutate.

Engine helper: `G` is reset to a fresh object by `Save.read(slot)` (on load) or by starting
a new game (`Save.newGame()` which calls `Save.defaults()` and `setScene("ch1_intro")`).

---

## 3. PALETTE (defined by 00-engine.js)

`PALETTE` is a flat object of `name -> "#rrggbb"`. Sprites reference colors BY NAME through
their `map`. The five names anchored to DESIGN.md §6.5 keep those exact hex values. Accent
gold is `#C8960C` per the engine brief. ~24 named colors:

```js
PALETTE = {
  // --- core steppe / DESIGN.md §6.5 exact ---
  gold:        "#D4A017", // степное золото (UI accent text / kui glow)
  goldAccent:  "#C8960C", // engine-brief gold accent (borders, selection)
  feltRed:     "#C0392B", // войлочный красный
  skyBlue:     "#2980B9", // небесный синий
  earth:       "#7D4E2A", // земля (soil, dombra wood)
  yurtWhite:   "#F5ECD7", // юрта белая
  outline:     "#1A0A00", // тёмный контур (sprite outlines)
  greySteppe:  "#8A8A7A", // серая степь (умирающая) — decay target tint

  // --- living greens (alive land) ---
  grassLight:  "#7CA646",
  grassDark:   "#4E7A33",
  leaf:        "#3E5F2A",

  // --- dying greys (the decay) ---
  ashGrey:     "#9A9A8C",
  deadGreen:   "#6E7059",
  boneGrey:    "#B8B4A4",

  // --- water / sky ---
  waterDeep:   "#1F5E7A",
  waterLight:  "#3E86A8",
  skyWhite:    "#EDEFE6", // upper-world bright void
  skyHigh:     "#C7D6DE",

  // --- night / lower world ---
  night:       "#0E0F1A",
  caveDark:    "#171826",
  caveFire:    "#E8B25A", // pale cave-fire glow
  caveStone:   "#33354A",

  // --- accents / cracks ---
  bloodDark:   "#5A1E1A", // dark light inside cracks
  crackLight:  "#7A3CE0", // the dark/violet light filling Tas Jurek cracks
  bone:        "#D8CFB8",
  shadow:      "#222018"  // soft drop-shadow under sprites
};
```

Rule: never hardcode a hex in another module if a palette name exists — read `PALETTE.name`.
Unknown palette names used by a sprite render as `crackLight` magenta-ish? No — see §8: an
UNKNOWN sprite KEY draws a magenta box; an unknown CHAR in a sprite map renders transparent.

---

## 4. CANVAS / LOOP (defined by 00-engine.js)

- Canvas element MUST have `id="game"`, width `800`, height `600`. The engine looks it up;
  if absent it creates and appends one. `ctx = canvas.getContext("2d")` with
  `ctx.imageSmoothingEnabled = false` (re-asserted each frame; pixel-art integer scaling).
- Logical resolution is 800x600. The engine may CSS-scale the canvas for display, but all
  draw coordinates are in the 800x600 space.
- Globals the engine exposes (read-only for other modules unless noted):
  - `canvas` — the HTMLCanvasElement
  - `ctx` — the CanvasRenderingContext2D used for ALL drawing
  - `Engine.W = 800`, `Engine.H = 600`
  - `Engine.paused` (boolean) — when true the active scene's `update(dt)` is skipped, but
    `render(ctx)` still runs and the pause overlay draws on top. `gameTimeMs` does NOT advance.
  - `Engine.now` — timestamp of current frame (ms, from rAF).
- Loop: a single `requestAnimationFrame` loop. Per frame: compute `dt` (ms, clamped to
  `<= 50` to avoid spiral-of-death), if not paused add `dt` to `G.gameTimeMs` and call
  `Decay.tick(dt)` (guarded) and the active scene's `update(dt)`; then always call the active
  scene's `render(ctx)`; then draw any active fade overlay and pause overlay.
- Boot: `boot()` runs on `DOMContentLoaded` (guarded if the document is already loaded). It
  grabs/creates the canvas, sets up input listeners, starts the rAF loop, and `setScene`s the
  start scene. Boot flow: `boot -> title -> ch1_intro`. The engine ships a built-in fallback
  `title` scene; 70-ui.js overrides it with the real one (same id, last registration wins).

---

## 5. INPUT (defined by 00-engine.js — `Input`)

The engine attaches `keydown`/`keyup`/`click` listeners ONCE and dispatches to the active
scene. It also creates/resumes the Web Audio context on the first user gesture via
`Audio.resume()` (guarded — no-op if `Audio` absent).

Key map (engine normalizes `e.key`/`e.code` into a semantic `e.action` string passed through):
- Movement: Arrow keys + `W A S D` -> actions `"up" "down" "left" "right"`.
- Confirm / advance dialogue: `Z` or `Enter` -> action `"confirm"`.
- Cancel / pause-menu: `X` or `Escape` -> action `"cancel"`.
- Play dombra: `Space` -> action `"dombra"`.
- Dialogue choices: number keys `1 2 3 4` -> actions `"choice1".."choice4"`. (Up/Down arrows
  also move a choice cursor; Dialogue interprets `"up"/"down"/"confirm"` for menu navigation.)

`Input` API:
- `Input.keys` — object map of currently-held semantic actions, e.g. `Input.keys.up === true`
  while the up/W key is held. Use for continuous movement in `update(dt)`.
- `Input.pressed(action)` — `true` exactly once on the frame the action went down (edge).
  Cleared at end of frame by the loop. Prefer this for menu/dialogue stepping.
- The engine calls `scene.onKey(e)` on every keydown, where `e` is the raw KeyboardEvent
  AUGMENTED with `e.action` (the semantic string above, or `undefined` for unmapped keys).
  `Esc`/`X` is intercepted by the engine FIRST to toggle the pause menu (unless the active
  scene sets `scene.blockPause === true`, e.g. during a cutscene); if the pause menu consumes
  it, the scene does not also receive it.
- The engine calls `scene.onClick(x,y)` on canvas clicks, with `x,y` already converted into
  the 800x600 logical space.

A scene receives input through `onKey(e)` / `onClick(x,y)` AND may poll `Input.keys` /
`Input.pressed()` inside `update(dt)`. Both are valid; choose per need.

`AudioContext` is created/resumed on the first real user gesture (keydown or click) — the
engine calls `Audio.resume()` then. Modules must NOT create their own AudioContext.

---

## 6. SCENE SYSTEM (defined by 00-engine.js — `Scenes`, `setScene`)

A Scene is a plain object. ALL methods optional EXCEPT `render`. Shape:

```js
{
  enter(params) {},   // called once when scene becomes active; params from setScene(id, params)
  exit() {},          // called once when leaving this scene
  update(dt) {},      // per-frame logic; dt in ms; skipped while Engine.paused
  render(ctx) {},     // REQUIRED; per-frame draw into the 800x600 ctx
  onKey(e) {},        // keydown; e augmented with e.action (see §5)
  onClick(x, y) {}    // canvas click in logical 800x600 coords
}
```

Registry / control:
- `Scenes.register(id, sceneObj)` — register or REPLACE a scene by string id (last wins, so
  70-ui.js can override the engine's fallback `title`). Returns the stored object.
- `Scenes.get(id)` -> scene object or `undefined`.
- `Scenes.current` -> the active scene object. `Scenes.currentId` -> its id string.
- `setScene(id, params)` — switch scenes with a short fade (≈250ms out, ≈250ms in). Sequence:
  fade to black, call old `exit()`, set new current + `G.sceneId = id`, call new `enter(params)`,
  fade back in. If `id` is unknown, the engine installs an internal FALLBACK scene that renders
  the missing id on screen (does NOT throw, does NOT crash the loop). `params` defaults to `{}`.
- Calling `setScene` during a fade queues the latest target (only the last wins).

Naming convention (strict):
- Chapter scenes: `ch1_*` … `ch8_*` (e.g. `ch1_intro`, `ch1_aul`, `ch2_valley`, `ch7_throne`).
- System scenes: `title`, `menu`, `ending_a`, `ending_b`, `ending_c`.
- Boot uses internal id `"boot"` then immediately `setScene("title")`.

**Chapter hand-off:** to advance the story, a chapter's final scene sets `G.chapter` to the
next number and calls `setScene("<first scene id of next chapter>")`. Example: end of Chapter 2
does `G.chapter = 3; setScene("ch3_descent");`. Each chapter file is responsible for knowing
its own first scene id; the canonical first-scene ids are listed in §14.

Fallback render for unknown scene id (engine-provided, never throws):
```
black background; centered text "СЦЕНА НЕ НАЙДЕНА: <id>" in PALETTE.gold; subtitle "Z — на главную".
onKey confirm -> setScene("title").
```

---

## 7. DIALOGUE (defined by 40-dialogue.js — `Dialogue`)

A dialogue TREE is a plain object: a map of node-id -> node. The entry node id is `"start"`.

Node shape (all fields except none are strictly required; a node must lead somewhere via
`choices`, `goto`, or `onEnd`/terminal):

```js
{
  speaker: "Ержан",          // display name (string). "" or omit for narration.
  portrait: "erzhan",        // Sprites key for the left portrait; omit/unknown -> blank slot
  text: "Видел. Думал — засуха.", // VERBATIM line; \n allowed; typewriter-revealed
  note: "тихо",              // OPTIONAL stage direction shown subtly (italic/grey); from [bracketed] cues
  choices: [                 // OPTIONAL; presence => this node is a choice node
    { label: "Я знаю.",      // choice text shown to player
      goto: "she_stays",     // next node id (string) OR omit to end after this choice
      set: { ayaulymTrust: 1 }, // OPTIONAL flat patch applied to G (see merge rule below)
      dombra: true }         // OPTIONAL; play a dombra moment when this choice is taken
  ],
  goto: "next_node",         // OPTIONAL; auto-advance to this node id after text (no choices)
  dombra: true,              // OPTIONAL; on entering/leaving this node trigger a dombra moment
  onEnd: function(){ }       // OPTIONAL; called when this node finishes / dialogue ends
}
```

If a node has neither `choices` nor `goto`, finishing it ENDS the dialogue (runs node `onEnd`
if present, then the tree's `onComplete`).

`set` MERGE RULE (how choices mutate G): each key in `set` is applied to `G`:
- If the key names a top-level `G` field that is a NUMBER (e.g. `ayaulymTrust`, `killCount`),
  the value is ADDED (`G.ayaulymTrust += value`).
- If the key is `flags.<name>` form OR any key not a known numeric G field, it is written into
  `G.flags[key] = value` (booleans/strings) — UNLESS the key exactly equals a known G field
  (`ayaulymLeft`, `serikPath`, `chapter`, …), in which case it is ASSIGNED (`G[key] = value`).
- Convention for chapter authors: to set a story flag use a plain name -> goes to `G.flags`.
  To bump trust/kills use the numeric field name. To set the Serik lean use
  `{ serikPath: "understand" }`. Keep it simple; document any nonobvious set in the tree.

`dombra: true` TRIGGER: Dialogue calls `Battle.rhythmMoment?.(...)` is NOT used here; instead
Dialogue plays the dombra via `Audio.playCue("kui_erzhan_unfinished")` (guarded) and, if a full
interactive beat is wanted, may call `Rhythm.start(...)` (see §9) and resume the tree in the
`onResult` callback. The minimal guaranteed behavior of `dombra:true` is: play the unfinished-kui
cue and visually pulse the dombra icon; richer scenes may override by handling it in `onEnd`.

API:
- `Dialogue.start(tree, onComplete)` — begin running a tree from node `"start"`. Draws the
  dialogue box, portrait, typewriter text (speed = `G.settings.textSpeed` ms/char), and choice
  list. `onComplete()` (optional) fires when the tree ends. Returns nothing.
- `Dialogue.active` -> boolean (true while a tree is running). Scenes should NOT process world
  input while `Dialogue.active`.
- `Dialogue.update(dt)` / `Dialogue.render(ctx)` / `Dialogue.onKey(e)` — a scene that hosts
  dialogue calls these from its own `update/render/onKey` while `Dialogue.active`. (Dialogue
  does not own the loop; the hosting scene drives it.) `confirm` advances/【completes typewriter
  then】 advances node; `up/down` move the choice cursor; `confirm`/`choiceN` select.

Worked example (verbatim from DESIGN.md §1.1, Бейсен ↔ Ержан opening):
```js
var TREE_ch1_beysen = {
  start: { speaker:"Бейсен", portrait:"beysen", note:"смотрит на огонь",
           text:"Ты видел траву у ворот?", goto:"e1" },
  e1:    { speaker:"Ержан", portrait:"erzhan",
           text:"Видел. Думал — засуха.", goto:"b2" },
  b2:    { speaker:"Бейсен", portrait:"beysen", note:"старик смотрит на угли",
           text:"Нет. Засуха идёт снизу. Это идёт изнутри.", goto:"e2" },
  e2:    { speaker:"Ержан", portrait:"erzhan",
           text:"Что это значит?", goto:"b3" },
  b3:    { speaker:"Бейсен", portrait:"beysen",
           text:"Три дня назад ночью что-то изменилось в Орхон-горе. Я слышал — Тас Жүрек больше не отвечает.",
           goto:"e3" },
  e3:    { speaker:"Ержан", portrait:"erzhan",
           text:"Тас Жүрек — это легенда. Дед рассказывал, что это сказка для детей.", goto:"b4" },
  b4:    { speaker:"Бейсен", portrait:"beysen", note:"пауза",
           text:"Твой дед говорил так, потому что боялся. А твой отец — потому что знал.", goto:"e4" },
  e4:    { speaker:"Ержан", portrait:"erzhan",
           text:"Что знал мой отец?", goto:"b5" },
  b5:    { speaker:"Бейсен", portrait:"beysen",
           note:"встаёт, снимает старую карту с трещиной посередине",
           text:"Что степь — живая. И что однажды кто-то из нашей крови должен будет за неё ответить.",
           set:{ knowsLegend:true }, onEnd:function(){ /* hosting scene reacts */ } }
};
// usage inside a scene: Dialogue.start(TREE_ch1_beysen, function(){ setScene("ch1_quest"); });
```

---

## 8. SPRITES (defined by 10-sprites.js — `Sprites`)

ONE pixel data format (palette-driven, compact). A sprite definition:

```js
{
  w: 4, h: 4,                 // pixel dimensions of one frame
  frames: [                   // 1+ frames; each frame is an array of h strings of length w
    [ "0110",                 // each char is a key into `map` (or "." = transparent)
      "1221",
      "1221",
      "0110" ]
  ],
  map: { "0":"outline", "1":"earth", "2":"gold" }, // char -> PALETTE name
  anchor: "bottom"            // OPTIONAL "bottom"|"center"|"top" (default "top"/top-left)
}
```

Rules:
- Char `"."` (and any char NOT present in `map`) is TRANSPARENT (drawn as nothing).
- A char present in `map` whose value is NOT a PALETTE name draws transparent (defensive).
- Each `frames[i]` must have exactly `h` rows; rows should be length `w` (engine tolerates
  short/long rows by clipping).

API:
- `Sprites.define(key, data)` — register a sprite by string key (top-level safe).
- `Sprites.draw(ctx, key, x, y, scale, opts)` — draw frame at integer pixel `(x,y)` upscaled by
  integer `scale` (default 1). `opts` (all optional):
  `{ frame:int=0, flip:bool=false, alpha:0..1=1, tint:{toName, amt:0..1} }`.
  `tint` lerps every pixel toward `PALETTE[toName]` by `amt` — THIS is how the map renderer
  greys tiles by decay level (`tint:{toName:"greySteppe", amt:Decay.levelFor(region)}`).
  Unknown `key` draws a small MAGENTA box (`scale*w` × `scale*h`, fully visible) so missing art
  is obvious but never throws.
- `Sprites.has(key)` -> boolean.

Worked 4x4 example (a tiny dombra body): see format block above; `Sprites.draw(ctx,"x",100,100,8)`
renders it 32×32.

REQUIRED KEYS downstream files reference (must all be defined by 10-sprites.js; unknown ones
will visibly magenta-box but SHOULD exist):

Characters:
`erzhan`, `erzhan_walk`, `ayaulym`, `nurlan`, `nurlan_ghost`, `serik`, `qairat_ghost`,
`eagle`, `mother`, `beysen`, `dosan`, `marat`, `erlan`, `child`

Enemies:
`jalmauyz`, `donen`, `shadow`, `ordo_soldier`

Tiles:
`grass`, `grass_grey`, `water`, `rock`, `sand`, `yurt`, `yurt_stone`, `cave_floor`,
`cave_wall`, `sky_white`, `campfire`, `tree`, `tree_grey`, `grave`, `petroglyph`

Props:
`dombra_icon`, `crack`, `eagle_fly`

(Tile sprites are authored at 16×16 and drawn at the map's tile scale.)

---

## 9. BATTLE + RHYTHM (defined by 50-battle.js — `Battle`, `Rhythm`)

Battle is itself a scene-like overlay the engine treats as the active scene while running
(Battle calls `setScene` to its own internal battle scene, then returns to the caller scene
on win/lose via the provided callbacks). Authors do NOT need to manage that — they just call
`Battle.start(cfg)` from within a scene/dialogue callback.

`Battle.start(cfg)` config:
```js
Battle.start({
  enemyKey: "jalmauyz",       // Sprites key for the enemy
  name: "Жалмауыз Кемпір",    // display name (verbatim)
  hp: 30,                     // int max HP
  music: "theme_battle",      // Audio cue name for battle music (looped); guarded
  canMelee: true,             // boolean — false => RHYTHM-ONLY boss (sword passes through)
  rhythm: {                   // REQUIRED when canMelee:false; OPTIONAL otherwise
    melody: [{lane:0,t:0},{lane:2,t:500}, ...], // see Rhythm.start melody format
    bpm: 90,
    accuracyNeeded: 90        // percent; >= this fully weakens/defeats
  },
  onWin: function(){},        // called after victory (return-to-scene logic here)
  onLose: function(){}        // called after defeat
});
```

HP / attack model for MELEEABLE enemies (`canMelee:true`):
- Player melee action (`confirm` while the attack reticle is up) deals a base 4 HP.
- The dombra rhythm minigame WEAKENS enemies: a rhythm pass with accuracy `a%` applies a
  "weaken" stack that multiplies subsequent melee damage by `1 + a/100` for the next few hits
  AND immediately removes a chunk of HP proportional to accuracy. Some enemies (the rhythm-only
  bosses) take damage ONLY from the rhythm pass.
- Enemy attacks tick the player's battle HP (a local battle resource, default 20); reaching 0
  triggers `onLose`. (Out-of-battle the player has no global HP bar — death is narrative.)
- On any successful melee/weaken that kills an enemy, Battle increments `G.killCount` by 1
  (the HIDDEN counter). Rhythm-only "release" of a boss that is not truly killed (Жалмауыз
  crumbles, Дөнен sleeps, Тень is absorbed) does NOT increment `killCount` — Battle exposes
  `Battle.start` flag `countsAsKill` (default `true` for meleeable, `false` for the three
  rhythm-only bosses) so authors can control this; chapter files pass `countsAsKill:false`
  for Жалмауыз/Дөнен/Тень.

RHYTHM-ONLY bosses (`canMelee:false`, `countsAsKill:false`) — pinned:
- **Жалмауыз Кемпір** (Chapter 2) — weakened ONLY by the dombra; melee does nothing.
- **Дөнен** (Chapter 3) — the dead war-horse; sword passes through; sleeps to the father's melody.
- **Тень / Shadow** (Chapter 7) — the final boss; copies player attacks; yields ONLY to the
  FULL kui (all learned passages + father's 8 notes). This is the climactic `Rhythm.start`.

`Rhythm.start(cfg)` — the falling-arrow minigame (used inside battles AND key dialogues):
```js
Rhythm.start({
  melody: [ {lane:0, t:0}, {lane:1, t:480}, {lane:3, t:960}, ... ], // lane 0..3, t in ms
  bpm: 90,                    // scroll speed / feel
  onResult: function(accuracyPct){ /* 0..100 */ }
});
```
- Four lanes (0..3) mapped to Left/Down/Up/Right (and keys `1 2 3 4` as alternates). Arrows
  fall top→bottom; the hit zone is near the bottom. Hit window: ±120ms = hit, ±60ms = perfect.
- `onResult(accuracyPct)` fires when the last note has passed; `>90%` = maximum effect.
- Rhythm draws itself as an overlay scene while active and restores control on completion.
- `Rhythm.active` -> boolean.

Used by `Battle` for boss fights and by `Dialogue`/scenes for "play dombra to convince"
moments (e.g. Марат variant C, Ерлан, the illusion labyrinth).

---

## 10. MAP + DECAY (defined by 30-map.js — `Map`, `Decay`)

A LOCATION is registered data describing one explorable place:

```js
Map.register({
  id: "aul_jetiqaz",          // unique string id
  name: "АУЛ ЖЕТІҚАЗ",        // display name (verbatim)
  region: "jetiqaz",          // region id used by Decay (string)
  w: 25, h: 19,               // size in TILES
  tiles: [                    // EITHER a 2D array of tile-keys (h rows × w cols)...
    ["grass","grass","water", ...],
    ...
  ],
  // ...OR a string grid + legend (engine accepts both; if `grid` present it wins):
  grid: [ "ggggwww...", "ggg....." ],          // OPTIONAL h strings of w chars
  legend: { "g":"grass", "w":"water", "#":"rock", "y":"yurt" }, // char -> tile sprite key
  solid: ["water","rock","yurt","yurt_stone","cave_wall","tree","tree_grey","grave"], // blocking keys
  spawns: { "default":{x:5,y:9}, "from_valley":{x:1,y:9} }, // named entry points (tile coords)
  npcs: [ { key:"beysen", x:6, y:8, name:"Бейсен",
            onInteract:function(){ /* e.g. Dialogue.start(...) */ } } ],
  exits: [ { x:24, y:9, to:"valley_koblandy", toSpawn:"from_aul" } ], // walk-on tile transitions
  decayRegion: "jetiqaz"      // region this map participates in (usually == region)
});
```

Map API:
- `Map.register(loc)` — top-level safe; stores by `loc.id`.
- `Map.get(id)` -> location object or `undefined`.
- `Map.load(id, spawnName)` — make `id` the active map and place the player at `spawns[spawnName]`
  (default `"default"`). Sets up the player entity, NPCs, exits. Safe if id unknown (no-op +
  console-less fallback).
- `Map.update(dt)` — moves the player from `Input.keys`, resolves `solid` collisions, fires
  `npc.onInteract` when the player presses `confirm` adjacent to an NPC, and triggers `exits`
  when the player steps on an exit tile (calls `setScene` or `Map.load` to the target — chapter
  exits typically map a tile to another map within the same chapter scene).
- `Map.render(ctx)` — draws the visible tilemap with a camera centered on the player, NPCs,
  the player sprite, and applies decay tint per tile via `Sprites.draw(...,{tint:{toName:"greySteppe",
  amt:Decay.levelFor(region)}})`. Tile pixel size: `Map.TILE = 16`, drawn at `Map.SCALE`
  (integer, default 2 → 32px tiles; camera shows 800/32 × 600/32 region).
- `Map.player` -> `{x,y}` in tile coords (read-only for others), plus pixel pos for the camera.

A chapter "overworld" scene typically: in `enter`, `Map.load("<id>","<spawn>")`; in `update`,
`Map.update(dt)`; in `render`, `Map.render(ctx)`; in `onKey`, forward `confirm` to Map for
NPC interaction (or let `Map.update` poll `Input.pressed("confirm")`). Forward `dombra` to play
the "tracks" effect (scene calls `Audio.playCue("kui_erzhan_unfinished")` + reveals petroglyph
glows). Map does not own scenes; chapter files do.

WORLD-DECAY API (`Decay`):
- `Decay.tick(dt)` — called by the engine loop every frame (guarded). Internally accumulates;
  every 5 in-game MINUTES (`5*60*1000` ms of `G.gameTimeMs`) it darkens ONE not-yet-healed
  location by +0.10 (writes into `G.worldDecay[regionId]`, clamped 0..1). Regions that have
  been `heal`ed are skipped (their timer is stopped).
- `Decay.heal(regionId)` — stop AND reverse decay for a region on quest completion: marks the
  region healed (excluded from future ticks) and steps its level back toward 0 (the renderer
  shows returning color). Idempotent.
- `Decay.levelFor(regionId)` -> number 0..1 (0 if unknown). Renderers tint tiles toward
  `PALETTE.greySteppe` by this amount.
- `Decay.seed(regionId, level)` — set an initial decay level (chapter setup; e.g. the opening
  steppe starts ~0.8 grey per DESIGN.md). Top-level safe.
- `Decay.restoredPercent()` -> 0..100 overall world health used by the endings' final map.

Renderer tint contract: `tintedColor = lerp(baseColor, PALETTE.greySteppe, Decay.levelFor(region))`.
The final map in Chapter 8 reflects `Decay.restoredPercent()`.

---

## 11. MEMORY / QUESTS / ENDINGS (defined by 60-memory.js — `Memory`, `Quests`, `Endings`)

MEMORY (12 petroglyphs):
- The 12 canonical petroglyph ids (chapter files place these on maps and call `Memory.collect`):
  `petro_01` … `petro_12`. Each, when collected, plays a flashback via the Cutscene API.
- `Memory.collect(id)` — if not already in `G.memories`, push it, play `Audio.playCue("sfx_petroglyph")`
  (guarded), and fire the flashback hook `Cutscene.play(Memory.flashback(id), onDone)` (guarded;
  if `Cutscene` absent, just records). Idempotent (collecting twice does nothing).
- `Memory.has(id)` -> boolean. `Memory.count()` -> int 0..12 (== `G.memories.length`).
- `Memory.flashback(id)` -> a Cutscene timeline array (see §12) for that petroglyph; 60-memory.js
  owns the flashback content (the Серік/Қайрат backstory beats). Chapter files just call collect.

QUESTS:
- `Quests.start(id)` — set `G.quests[id]="active"` (idempotent; no-op if already done).
- `Quests.advance(id, step)` — optional progress bookkeeping (stored under the quest); keeps state
  `"active"`. Safe to call with just `id`.
- `Quests.complete(id)` — set `G.quests[id]="done"`; MAY call `Decay.heal(regionForQuest)` —
  but quest→region mapping lives in 60-memory.js's quest table, so completing a quest that heals
  a region is handled there. Plays `sfx_confirm` (guarded).
- `Quests.state(id)` -> `"inactive"|"active"|"done"`. `Quests.active()` -> array of active ids.

ENDINGS:
- `Endings.resolve()` -> `"a" | "b" | "c"` — the engine/UI calls this at the end of Chapter 7
  to pick which ending scene to load (`ending_a/b/c`). Decision logic (HIDDEN kill counter):
  - Lean **A (БАТЫР, кровавая)** when `G.killCount > 300` AND `G.ayaulymLeft === true` AND
    `Memory.count() < 12` (player chose force, sent Аяулым away, ignored the father's memories).
  - Lean **B (КҮЙШІ, каноническая/музыкальная)** when `Memory.count() === 12` AND the player
    used the dombra in key scenes AND reconciled with Аяулым (`G.ayaulymTrust` high,
    `!G.ayaulymLeft`). All 12 memories strongly leans B.
  - Lean **C (ХРАНИТЕЛЬ, одинокая)** when `G.serikPath === "understand"` (player chose the
    understanding/defending dialogue branch with Серік).
  - The function weighs these signals and returns a single letter; ties resolve toward B then C
    then A. The kill counter is never surfaced in UI.
- `Endings.id` -> caches the last resolved letter (for the ending scene to read).

---

## 12. CUTSCENE (defined by 70-ui.js — `Cutscene`)

`Cutscene.play(timeline, onDone)` runs a scripted, time-based cinematic as an overlay scene.

`timeline` = array of cue objects, sorted by `at` (ms from cutscene start):
```js
[
  { at: 0,    cue: "theme_aspan" },               // {cue} -> Audio.playCue(name) (guarded)
  { at: 0,    text: "Белая бесконечность." },      // {text} -> show this caption (replaces prev)
  { at: 1200, do: function(ctx){ /* custom draw/logic for this beat */ } }, // {do} -> call fn each frame from `at` until next beat
  { at: 4000, text: "" },                           // clear caption
  { at: 5000 }                                       // empty terminal beat
]
```
- Each beat may carry any of `cue` (one-shot audio), `text` (caption string shown until next
  text beat), and `do` (a function `(ctx)=>{}` invoked every frame from its `at` until the next
  `do` beat — for animation like the eagle zoom-to-white, illusion labyrinth, deaths, endings,
  and the final NPC-vignette titles).
- `Cutscene.play` sets `scene.blockPause` semantics (the pause menu is suppressed during a
  cutscene). `confirm`/`cancel` may fast-forward to the end (engine convention).
- When the last beat's time elapses, `onDone()` (optional) fires. `Cutscene` returns control to
  whatever scene the author sets in `onDone` (typically `setScene(...)`).
- `Cutscene.active` -> boolean.

Used for: eagle flight (zoom to white, Ch4), illusion labyrinth (Ch6), Нұрлан's death (Ch2),
the three endings (Ch8), and petroglyph flashbacks (via `Memory.flashback`).

---

## 13. SAVE / LOAD (defined by 00-engine.js — `Save`)

- localStorage key base: `"tas_zhurek_save"`. Per-slot key: `"tas_zhurek_save_<slot>"` (slot 1..3).
- `Save.defaults()` -> a brand-new `G`-shaped object (the §2 initial values). Used for new game.
- `Save.write(slot)` — serialize current `G` (minus runtime-only keys) to the slot. Returns true/false.
- `Save.read(slot)` -> the parsed saved object (merged over defaults) or `null` if none. The engine,
  on load, replaces the live `G`'s fields with the read object's fields (so references stay valid)
  and `setScene(G.sceneId)` (or the chapter's entry) to resume.
- `Save.exists(slot)` -> boolean.
- `Save.newGame(slot)` — set `G` to `Save.defaults()` (slot applied), `setScene("ch1_intro")`.
- `Save.clear(slot)` — delete a slot.
- Runtime-only keys NOT serialized: none required to strip from `G` itself (G is pure data);
  but the engine must NOT serialize transient module caches (those live outside G). Only `G` is saved.

---

## 14. AUDIO (defined by 20-audio.js — `Audio`)

All audio is synthesized (OscillatorNode/GainNode/BiquadFilterNode). No files. One shared
AudioContext, created/resumed by the engine on first gesture via `Audio.resume()`.

Kazakh pentatonic scale — semitone set from the tonic: `[0, 2, 4, 7, 9]` (до ре ми соль ля).
All melodies are built on it.

API:
- `Audio.resume()` — create the AudioContext if needed and resume it (called by engine on first
  user gesture; safe to call repeatedly).
- `Audio.note(semis, dur, opts)` — play a single pitched note `semis` semitones above the base
  tonic for `dur` ms. `opts` optional: `{ type:"triangle"|"sine"|"square"|"sawtooth",
  gain:0..1, when:msDelay, detune, attack, release, filter:{freq} }`. Pitch =
  `baseFreq * 2^(semis/12)` where the base tonic is a fixed low Hz the module picks (document
  it internally). Note: callers usually pass scale degrees mapped through `[0,2,4,7,9]`.
- `Audio.playMelody(melody, bpm, onNote)` — play an array of notes; supports rhythm sync.
  `melody` = `[{semis, dur}|{lane,t}|number]` — the module accepts an array of `{semis,dur}`
  pairs (preferred) and schedules them at `bpm`. `onNote(i, when)` (optional) fires per note so
  the Rhythm minigame can sync visuals to audio.
- `Audio.playCue(name)` — play a named, pre-baked cue (music or sfx). Music cues loop until
  `Audio.stopMusic()`; sfx cues are one-shots. Unknown name -> no-op (guarded).
- `Audio.stopMusic()` — stop the current looping music cue (sfx unaffected).
- `Audio.setMusicVolume(v)` / `Audio.setSfxVolume(v)` — 0..1, read defaults from `G.settings`.

CANONICAL CUE NAMES (the COMPLETE set modules may use; exact strings):

Music (loop until stopMusic):
- `kui_erzhan_unfinished` — the unfinished kui, **8 notes** (the passage Ержан can't finish).
- `kui_erzhan_full` — the unfinished kui COMPLETED, **12 notes** = 8 father-notes + 4 Ержан adds.
- `theme_serik` — slow ostinato on low notes, almost no melody — just a pulse.
- `theme_zher_asty` — reverberant low tone, one note every ~2s (Lower world).
- `theme_aspan` — high flageolets, arpeggio upward (Upper world).
- `theme_battle` — fast ~120bpm, sharp attack, minor pentatonic.
- `theme_victory_shadow` — the same notes as the unfinished kui — but now full (Shadow defeat).
- `theme_aul` — gentle village theme (Аул Жетіқаз).
- `theme_overworld` — traveling-the-steppe theme.

SFX (one-shot):
- `sfx_select` — cursor move.
- `sfx_confirm` — confirm / accept.
- `sfx_cancel` — back / cancel.
- `sfx_hit` — melee hit / damage.
- `sfx_curse` — Жалмауыз / curse / dark magic.
- `sfx_eagle_cry` — Қара Сұңқар's cry.
- `sfx_heal` — land/region restored, healing.
- `sfx_petroglyph` — petroglyph collected (memory).
- `sfx_door` — entering/exiting a place, cave crack opening.
- `sfx_death` — a death sting (Нұрлан, etc.).

Relationship pinned by the brief: `kui_erzhan_full` = `kui_erzhan_unfinished` completed
(8 father-notes + 4 Erzhan additions = 12). `theme_victory_shadow` uses those same notes, full.

---

## 15. EVENTBUS (defined by 00-engine.js — `EventBus`)

A tiny pub/sub for cross-module signals without tight coupling. Optional to use.
- `EventBus.on(event, fn)` -> returns an unsubscribe function.
- `EventBus.off(event, fn)`.
- `EventBus.emit(event, payload)` — calls listeners; never throws out (each listener guarded).
Suggested events (free-form strings; not exhaustive): `"scene:enter"`, `"scene:exit"`,
`"battle:win"`, `"battle:lose"`, `"memory:collect"`, `"quest:complete"`, `"decay:tick"`.
The engine emits `"scene:enter"`/`"scene:exit"` around transitions. Modules may emit/listen
freely; a missing listener is fine.

---

## 16. CANONICAL SCENE IDS (first scene of each chapter + system)

Chapter files MUST register at least these entry scenes (others as needed). Hand-off targets:

| Chapter | Entry scene id   | Notable scenes (suggested ids)                                  |
|---------|------------------|------------------------------------------------------------------|
| 1       | `ch1_intro`      | `ch1_aul`, `ch1_beysen`, `ch1_quest`, `ch1_night`               |
| 2       | `ch2_valley`     | `ch2_nurlan`, `ch2_jalmauyz` (Battle), `ch2_death`              |
| 3       | `ch3_descent`    | `ch3_zher_asty`, `ch3_father`, `ch3_donen` (Battle)            |
| 4       | `ch4_ascent`     | `ch4_ayaulym`, `ch4_curse`, `ch4_flight` (Cutscene), `ch4_tanir`|
| 5       | `ch5_dosan`      | `ch5_marat`, `ch5_erlan`                                        |
| 6       | `ch6_march`      | `ch6_ayaulym_confess`, `ch6_labyrinth` (Cutscene)              |
| 7       | `ch7_throne`     | `ch7_serik`, `ch7_shadow` (Battle, final Rhythm)              |
| 8       | resolved ending  | `ending_a` / `ending_b` / `ending_c` chosen via `Endings.resolve()` |

System scenes: `boot` (internal), `title` (engine fallback → overridden by 70-ui.js), `menu`,
`ending_a`, `ending_b`, `ending_c`.

Hand-off pattern (each chapter's last scene): `G.chapter = <n+1>; setScene("<next entry id>");`
End of Chapter 7: `setScene(Endings.resolve()==="a" ? "ending_a" : Endings.resolve()==="b" ? "ending_b" : "ending_c");`

---

## 17. GLOBAL HELPERS (exact names — defined by 00-engine.js)

Available globally to every module (call only inside callbacks, never at top-level except as noted):
- `setScene(id, params)` — switch scenes (see §6). (Top-level: do NOT call; only register.)
- `Scenes.register(id, obj)` / `Scenes.get(id)` — top-level safe (registration).
- `Save.*` (see §13).
- `Engine.W`, `Engine.H`, `Engine.paused`, `Engine.now`, `Engine.fade(toBlack, ms, cb)` — the
  engine's fade primitive (used by setScene; modules may use for custom transitions).
- `clamp(v,min,max)`, `lerp(a,b,t)`, `lerpColor(hexA,hexB,t)`, `rint(n)` (=`(n)|0`) — math/util
  helpers the engine exposes so modules don't re-implement them. `lerpColor` returns `"#rrggbb"`.
- `drawText(ctx, str, x, y, opts)` — engine pixel-text helper: `opts {color, size, align, font,
  maxWidth, shadow}`; used by UI/Dialogue for consistent text. (Guaranteed available; UI may add
  richer helpers but this one always exists.)

These helpers are guaranteed by 00-engine.js so all other modules can rely on them.

---

## 18. INTEGRATION CHECKLIST (zero-rename guarantees)

- Canvas id is exactly `"game"`, 800×600, `imageSmoothingEnabled=false`.
- Namespaces exist after their owning file loads: `G PALETTE Input Scenes setScene EventBus Save
  Engine` (engine); then `Sprites`, `Audio`, `Map Decay`, `Dialogue`, `Battle Rhythm`,
  `Memory Quests Endings`, `UI Cutscene`.
- Every cross-module call is GUARDED (`typeof X !== "undefined" && X.method && X.method(...)` or
  optional-chaining `X?.method?.(...)`) so one absent sprite/audio/scene key never throws in the
  60fps loop — no-op or graceful fallback instead.
- All in-game text VERBATIM from DESIGN.md; names stay Cyrillic.
- No placeholders, no TODO, no commented-out stubs. Every function fully implemented.
- Only register at top-level; run other modules' methods only inside scene/update/render/dialogue/
  cutscene callbacks. The engine boots on DOMContentLoaded after all modules registered.
