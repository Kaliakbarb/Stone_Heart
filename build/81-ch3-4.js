/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 81-ch3-4.js
   Chapter 3 ЖЕР АСТЫ (Lower World / caves) + Chapter 4 АСПАН (Upper World / peak).
   REGISTERS ch3_* and ch4_* scenes, their World locations, and Dialogue trees.
   RAW JS fragment — concatenated after 80-ch1-2.js inside the single <script>.

   OWNS NOTHING (per CONTRACT §1): this file only REGISTERS data and CALLS the
   documented public APIs (Scenes, World, Dialogue, Battle, Rhythm, Audio, Cutscene,
   Quests, Decay, Sprites, drawText, the math helpers). Every cross-module call is
   guarded so one absent sprite/audio/scene key can never throw inside the 60fps loop.

   Story beats covered (DESIGN.md "ГЛАВА 3: ЖЕР АСТЫ" + "ГЛАВА 4: АСПАН"):
     ch3_descent   — Нұрлан-ghost reveals the new crack; descend.
     ch3_zher_asty — pale-fire caves; lost spirits you may release by talking (optional lore).
     ch3_father    — scene 3.1: meet Қайрат, recognised by the identical bracelet;
                     full verbatim confession; gives Тас Білезік; plays the next 8
                     notes of the unfinished kui (Rhythm) -> raises dombraMelodyLearned.
     ch3_donen     — boss 3.2: Дөнен, dead colossal horse blocking the exit; melee passes
                     through; resolved by playing the father melody -> Дөнен sleeps;
                     Нұрлан-ghost verbatim lines; hands off to Chapter 4.
     ch4_ascent    — living mountain Хан Тәңірі; riddle-spirits (TEXT riddles) open the path.
     ch4_ayaulym   — scene 4.1: meet Аяулым at the cliff (verbatim).
     ch4_curse     — quest 4.2: find the 3 hidden objects (each a small story); spoken-aloud
                     confession lifts the curse; eagle Қара Сұңқар approaches.
     ch4_flight    — eagle-flight cutscene (world shrinks, dissolves to sky-white).
     ch4_tanir     — scene 4.3: Тәңір-Ана spinning the thread (verbatim) ending in the Сила
                     Неба; Ayaulym joins the party; hands off to Chapter 5.
   ===================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* small guarded helpers (LOCAL — not a namespace, no global leak)    */
  /* ------------------------------------------------------------------ */
  function W() { return (typeof Engine !== "undefined" && Engine.W) ? Engine.W : 800; }
  function H() { return (typeof Engine !== "undefined" && Engine.H) ? Engine.H : 600; }
  function PAL(name, fallback) {
    if (typeof PALETTE !== "undefined" && PALETTE && PALETTE[name]) return PALETTE[name];
    return fallback || "#FF00FF";
  }
  function cue(name) {
    try { if (typeof Audio !== "undefined" && Audio.playCue) Audio.playCue(name); } catch (e) {}
  }
  function stopMusic() {
    try { if (typeof Audio !== "undefined" && Audio.stopMusic) Audio.stopMusic(); } catch (e) {}
  }
  function txt(c, str, x, y, opts) {
    if (typeof drawText === "function") { try { drawText(c, str, x, y, opts); return; } catch (e) {} }
    // ultra-defensive inline fallback (drawText is guaranteed by engine, but never throw)
    try {
      c.save();
      opts = opts || {};
      c.font = '700 ' + (opts.size || 16) + 'px "Courier New", monospace';
      c.textAlign = opts.align || "left";
      c.fillStyle = opts.color || "#F5ECD7";
      c.fillText(String(str), x, y);
      c.restore();
    } catch (e2) {}
  }
  function spriteSafe(c, key, x, y, scale, opts) {
    try {
      if (typeof Sprites !== "undefined" && Sprites.draw && Sprites.has && Sprites.has(key)) {
        Sprites.draw(c, key, x, y, scale, opts || {});
        return true;
      }
    } catch (e) {}
    return false;
  }
  function clampN(v, a, b) {
    if (typeof clamp === "function") return clamp(v, a, b);
    return v < a ? a : (v > b ? b : v);
  }
  function lerpN(a, b, t) {
    if (typeof lerp === "function") return lerp(a, b, t);
    return a + (b - a) * t;
  }
  function blockWorldInput() {
    return (typeof Dialogue !== "undefined" && Dialogue.active);
  }
  function startDialogue(tree, onDone) {
    if (typeof Dialogue !== "undefined" && Dialogue.start) {
      try { Dialogue.start(tree, onDone); return true; }
      catch (e) { if (typeof onDone === "function") { try { onDone(); } catch (e2) {} } return false; }
    }
    // Dialogue missing — never strand the player
    if (typeof onDone === "function") { try { onDone(); } catch (e3) {} }
    return false;
  }
  function dlgUpdate(dt) {
    if (typeof Dialogue !== "undefined" && Dialogue.active && Dialogue.update) {
      try { Dialogue.update(dt); } catch (e) {}
    }
  }
  function dlgRender(c) {
    if (typeof Dialogue !== "undefined" && Dialogue.active && Dialogue.render) {
      try { Dialogue.render(c); } catch (e) {}
    }
  }
  function dlgKey(e) {
    if (typeof Dialogue !== "undefined" && Dialogue.active && Dialogue.onKey) {
      try { Dialogue.onKey(e); } catch (er) {}
    }
  }
  function go(id, params) {
    if (typeof setScene === "function") { try { setScene(id, params || {}); } catch (e) {} }
  }
  function questStart(id) {
    try { if (typeof Quests !== "undefined" && Quests.start) Quests.start(id); } catch (e) {}
  }
  function questComplete(id) {
    try { if (typeof Quests !== "undefined" && Quests.complete) Quests.complete(id); } catch (e) {}
  }
  function decayHeal(region) {
    try { if (typeof Decay !== "undefined" && Decay.heal) Decay.heal(region); } catch (e) {}
  }
  function addInventory(item) {
    if (typeof G === "undefined" || !G) return;
    if (!Array.isArray(G.inventory)) G.inventory = [];
    if (G.inventory.indexOf(item) < 0) G.inventory.push(item);
  }
  function addParty(member) {
    if (typeof G === "undefined" || !G) return;
    if (!Array.isArray(G.party)) G.party = ["erzhan"];
    if (G.party.indexOf(member) < 0) G.party.push(member);
  }

  /* The 8-note father passage on the Kazakh pentatonic, expressed as Rhythm
     lanes (0..3). This is the kui Erzhan can't finish; playing it back lulls
     Дөнен. Kept here as the canonical "father melody" for both the learning
     beat (3.1) and the boss (3.2). 8 notes, ~460ms apart. */
  var FATHER_MELODY = [
    { lane: 0, t: 0 },
    { lane: 2, t: 460 },
    { lane: 1, t: 920 },
    { lane: 3, t: 1380 },
    { lane: 2, t: 1840 },
    { lane: 0, t: 2300 },
    { lane: 1, t: 2760 },
    { lane: 3, t: 3220 }
  ];

  /* ================================================================== */
  /* SHARED BACKDROPS (local draw helpers; pure ctx painting)           */
  /* ================================================================== */

  // tiny deterministic star/fire field so backgrounds shimmer without state churn
  function flicker(seed, t) {
    // cheap pseudo-noise 0..1, time-animated
    var s = Math.sin((seed * 12.9898 + t * 0.003) ) * 43758.5453;
    return (s - Math.floor(s));
  }

  function drawCaveBackdrop(c, t) {
    var w = W(), h = H();
    c.fillStyle = PAL("caveDark", "#171826");
    c.fillRect(0, 0, w, h);
    // stone strata
    c.fillStyle = PAL("caveStone", "#33354A");
    for (var i = 0; i < 7; i++) {
      var yy = 40 + i * 84 + Math.sin(t * 0.0006 + i) * 6;
      c.globalAlpha = 0.18 + 0.05 * (i % 3);
      c.fillRect(0, yy, w, 30);
    }
    c.globalAlpha = 1;
    // pale cave fires
    for (var k = 0; k < 9; k++) {
      var fx = 60 + (k * 83) % (w - 80);
      var fy = 120 + ((k * 137) % (h - 200));
      var fl = flicker(k + 1, t);
      var r = 5 + fl * 4;
      c.globalAlpha = 0.35 + fl * 0.4;
      c.fillStyle = PAL("caveFire", "#E8B25A");
      c.beginPath(); c.arc(fx, fy, r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.12 + fl * 0.18;
      c.beginPath(); c.arc(fx, fy, r * 2.6, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  function drawCrack(c, cx, cy, scale, t) {
    // a jagged violet-lit crack in the rock (the Tas Jurek crack light)
    scale = scale || 1;
    c.save();
    c.translate(cx, cy);
    var grad;
    try {
      grad = c.createLinearGradient(0, -60 * scale, 0, 60 * scale);
      grad.addColorStop(0, PAL("bloodDark", "#5A1E1A"));
      grad.addColorStop(0.5, PAL("crackLight", "#7A3CE0"));
      grad.addColorStop(1, PAL("bloodDark", "#5A1E1A"));
      c.fillStyle = grad;
    } catch (e) { c.fillStyle = PAL("crackLight", "#7A3CE0"); }
    c.beginPath();
    c.moveTo(-3 * scale, -62 * scale);
    c.lineTo(4 * scale, -30 * scale);
    c.lineTo(-2 * scale, -4 * scale);
    c.lineTo(6 * scale, 28 * scale);
    c.lineTo(-1 * scale, 60 * scale);
    c.lineTo(-7 * scale, 26 * scale);
    c.lineTo(-2 * scale, -2 * scale);
    c.lineTo(-9 * scale, -32 * scale);
    c.closePath();
    c.fill();
    // glow pulse
    var p = 0.4 + 0.3 * Math.sin(t * 0.004);
    c.globalAlpha = p;
    c.fillStyle = PAL("crackLight", "#7A3CE0");
    c.beginPath(); c.ellipse(0, 0, 16 * scale, 70 * scale, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    c.globalAlpha = 1;
  }

  function drawSkyBackdrop(c, t) {
    var w = W(), h = H();
    // dawn gradient from sky-high to bright void
    var grad;
    try {
      grad = c.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, PAL("skyHigh", "#C7D6DE"));
      grad.addColorStop(0.55, PAL("skyWhite", "#EDEFE6"));
      grad.addColorStop(1, PAL("yurtWhite", "#F5ECD7"));
      c.fillStyle = grad;
    } catch (e) { c.fillStyle = PAL("skyWhite", "#EDEFE6"); }
    c.fillRect(0, 0, w, h);
    // distant peaks
    c.fillStyle = PAL("greySteppe", "#8A8A7A");
    c.globalAlpha = 0.5;
    c.beginPath();
    c.moveTo(0, h);
    var n = 8;
    for (var i = 0; i <= n; i++) {
      var px = i * (w / n);
      var py = h - 140 - Math.abs(Math.sin(i * 1.7 + 0.5)) * 110;
      c.lineTo(px, py);
    }
    c.lineTo(w, h); c.closePath(); c.fill();
    c.globalAlpha = 1;
    // a couple of slow flageolet "sparkles"
    for (var k = 0; k < 14; k++) {
      var sx = (k * 113 + Math.sin(t * 0.0005 + k) * 30) % w;
      var sy = 30 + (k * 51) % (h - 200);
      var fl = flicker(k + 7, t);
      c.globalAlpha = 0.15 + fl * 0.4;
      c.fillStyle = PAL("yurtWhite", "#F5ECD7");
      c.fillRect(sx, sy, 2, 2);
    }
    c.globalAlpha = 1;
  }

  function drawMountainBackdrop(c, t) {
    var w = W(), h = H();
    var grad;
    try {
      grad = c.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, PAL("skyHigh", "#C7D6DE"));
      grad.addColorStop(0.5, PAL("skyBlue", "#2980B9"));
      grad.addColorStop(1, PAL("caveStone", "#33354A"));
      c.fillStyle = grad;
    } catch (e) { c.fillStyle = PAL("skyBlue", "#2980B9"); }
    c.fillRect(0, 0, w, h);
    // wind streaks
    c.strokeStyle = PAL("yurtWhite", "#F5ECD7");
    c.globalAlpha = 0.10;
    c.lineWidth = 2;
    for (var i = 0; i < 10; i++) {
      var yy = (i * 67 + t * 0.05) % h;
      c.beginPath();
      c.moveTo(0, yy);
      c.lineTo(w, yy - 40);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  /* a simple centered cinematic frame: backdrop fn + a portrait sprite + caption box */
  function drawNarrationFrame(c, opts) {
    opts = opts || {};
    if (typeof opts.backdrop === "function") { try { opts.backdrop(c, opts.t || 0); } catch (e) {} }
    // a faint vignette
    c.save();
    c.globalAlpha = 0.25;
    c.fillStyle = "#000000";
    c.fillRect(0, 0, W(), 60);
    c.fillRect(0, H() - 70, W(), 70);
    c.restore();
  }

  /* ================================================================== */
  /* DIALOGUE TREES — all text VERBATIM from DESIGN.md                  */
  /* ================================================================== */

  /* --- Нұрлан-ghost reveals the descent (bridges the death of Ch2 into Ch3).
     Uses only verbatim lines from DESIGN around the descent ("трещина в скале,
     которой не было вчера"). The narration paraphrase is rendered as engine
     narration, not as invented character dialogue. */
  var TREE_ch3_descent = {
    start: { speaker: "Нұрлан", portrait: "nurlan_ghost", note: "появляется у скалы",
             text: "Вход в Нижний мир — трещина в скале, которой не было вчера.", goto: "n2" },
    n2:    { speaker: "Нұрлан", portrait: "nurlan_ghost", note: "тихо",
             text: "Внутри — холод. Не обычный. Это холод всего, что забыто.", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan",
             text: "Тогда идём вниз.",
             onEnd: function () { /* hosting scene descends */ } }
  };

  /* --- Optional lost spirits in the caves (OPTIONAL LORE).
     "Здесь бродят духи — не злые, просто потерявшиеся. Те, кто умер с незакрытым
     делом. Некоторые из них можно 'отпустить'..." Each releases with peace. These
     are written as small self-contained vignettes; talking releases them. They are
     the only way to learn the world's history (optional content). */
  var TREE_spirit_1 = {
    start: { speaker: "Дух", portrait: "shadow", note: "бледный огонёк",
             text: "Я пас овец у Орхон-горы. Однажды трава под ногами стала серой. Я пошёл искать, откуда это — и не вернулся.", goto: "s2" },
    s2:    { speaker: "Дух", portrait: "shadow",
             text: "Я не злюсь. Я просто не нашёл дорогу домой.", goto: "ask" },
    ask:   { speaker: "Ержан", portrait: "erzhan",
             text: "Дорога домой — там, где о тебе помнят. Тебя помнят.",
             choices: [
               { label: "Сыграть ему на домбре", goto: "release", dombra: true },
               { label: "Просто побыть рядом", goto: "release" }
             ] },
    release: { speaker: "Дух", portrait: "shadow", note: "растворяется с покоем",
               text: "Спасибо. Теперь я слышу степь. Я пойду на этот звук.",
               onEnd: function () { markSpiritReleased("spirit_1"); } }
  };

  var TREE_spirit_2 = {
    start: { speaker: "Дух", portrait: "shadow", note: "сидит у мёртвого огня",
             text: "Я был кюйши. Я начал кюй и не успел доиграть — умер на полуноте. Эта нота держит меня здесь.", goto: "s2" },
    s2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Кюй не обязан кончаться на тебе. Его доиграют другие.", goto: "release" },
    release: { speaker: "Дух", portrait: "shadow", note: "огонёк гаснет мягко",
               text: "Доиграйте. Это всё, о чём я прошу.",
               onEnd: function () { markSpiritReleased("spirit_2"); } }
  };

  var TREE_spirit_3 = {
    start: { speaker: "Дух", portrait: "shadow", note: "мать, ищущая ребёнка",
             text: "Я ищу сына. Он убежал в пещеры за светом, который двигался. Я пошла за ним и потеряла и его, и себя.", goto: "s2" },
    s2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Свет, который двигался, — это трещина. Она забрала многих. Но твой сын вырос наверху. Я его видел в ауле.", goto: "s3" },
    s3:    { speaker: "Дух", portrait: "shadow", note: "впервые спокойна",
             text: "Вырос... значит, я могу отпустить. Спасибо, что сказал.",
               choices: [
                 { label: "Кивнуть", goto: "release" }
               ] },
    release: { speaker: "Ержан", portrait: "erzhan",
               text: "Иди. Тебя ждут не здесь.",
               onEnd: function () { markSpiritReleased("spirit_3"); } }
  };

  function markSpiritReleased(id) {
    if (typeof G !== "undefined" && G) {
      if (!G.flags) G.flags = {};
      G.flags["released_" + id] = true;
    }
    cue("sfx_heal");
  }

  /* --- KEY SCENE 3.1: meeting the father Қайрат (FULL VERBATIM).
     Recognised by the identical bracelet. He gives the Тас Білезік and plays the
     next 8 notes; the actual learning of the notes is an interactive Rhythm beat
     fired in onEnd (see ch3_father scene). */
  var TREE_ch3_father = {
    start: { speaker: "", portrait: "",
             note: "Ержан останавливается. Долго стоит. Фигура не двигается.",
             text: "Фигура в самом глубоком зале. Браслет на её запястье — такой же, как у тебя.", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan",
             text: "Отец?", goto: "turn" },
    turn:  { speaker: "", portrait: "",
             note: "Тишина. Потом фигура медленно поворачивается.",
             text: "...", goto: "q1" },
    q1:    { speaker: "Қайрат", portrait: "qairat_ghost",
             text: "Ты пришёл. Я ждал. Боялся, что не придёшь.", goto: "e2" },
    e2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Ты жив?", goto: "q2" },
    q2:    { speaker: "Қайрат", portrait: "qairat_ghost",
             text: "Нет. Я умер пять лет назад. Здесь, в этих пещерах. Я искал вход сам. Хотел вернуть то, что сделал.", goto: "e3" },
    e3:    { speaker: "Ержан", portrait: "erzhan",
             text: "Что ты сделал?", goto: "sit" },
    sit:   { speaker: "", portrait: "",
             note: "Долгая пауза. Қайрат садится на камень.",
             text: "...", goto: "q3" },
    q3:    { speaker: "Қайрат", portrait: "qairat_ghost",
             text: "Я работал на Серіка двадцать лет. Собирал для него информацию. Следил за теми, кто мог найти Тас Жүрек раньше него. Я верил, что он прав — что сердце степи нужно защитить от людей, которые снова его сломают.", goto: "e4" },
    e4:    { speaker: "Ержан", portrait: "erzhan",
             text: "А потом?", goto: "q4" },
    q4:    { speaker: "Қайрат", portrait: "qairat_ghost",
             text: "А потом я увидел тебя. Тебе было три года, ты нашёл домбру и начал на ней стучать. Смеялся. И я понял — я не могу делать это дальше. Ушёл от Серіка. Он не простил.", goto: "e5" },
    e5:    { speaker: "Ержан", portrait: "erzhan",
             text: "Он тебя убил?", goto: "q5" },
    q5:    { speaker: "Қайрат", portrait: "qairat_ghost", note: "тихо",
             text: "Нет. Он просто больше не защищал. В степи много опасностей для тех, кто один.", goto: "silence" },
    silence:{ speaker: "", portrait: "",
             note: "Ержан молчит. Сжимает браслет на запястье.",
             text: "...", goto: "e6" },
    e6:    { speaker: "Ержан", portrait: "erzhan",
             text: "Я злюсь на тебя.", goto: "q6" },
    q6:    { speaker: "Қайрат", portrait: "qairat_ghost",
             text: "Я знаю.", goto: "e7" },
    e7:    { speaker: "Ержан", portrait: "erzhan",
             text: "И я не знаю, простить тебя или нет.", goto: "q7" },
    q7:    { speaker: "Қайрат", portrait: "qairat_ghost", note: "встаёт, подходит, снимает свой браслет",
             text: "Тебе не нужно решать сейчас.", goto: "q8" },
    q8:    { speaker: "Қайрат", portrait: "qairat_ghost",
             text: "Это Тас Білезік. Он откроет тебе путь в Жер Асты снова, если понадобится. И ещё —",
             set: { hasTasBilezik: true },
             onEnd: function () { addInventory("tas_bilezik"); cue("sfx_petroglyph"); },
             goto: "q9" },
    q9:    { speaker: "Қайрат", portrait: "qairat_ghost", note: "берёт домбру Ержана, проигрывает несколько нот",
             text: "Мелодия, которую ты не можешь закончить. Я тоже не мог. Но я знаю, что дальше. Слушай.", goto: "q10" },
    q10:   { speaker: "Қайрат", portrait: "qairat_ghost", note: "играет следующий пассаж — 8 нот",
             text: "Запомни их. Эти восемь нот — ключ.",
             onEnd: function () { /* the ch3_father scene now launches the Rhythm learning beat */ } }
  };

  /* --- KEY SCENE 3.2: Дөнен resolution lines (Нұрлан-ghost, VERBATIM).
     Played AFTER the boss sleeps to the father melody. */
  var TREE_ch3_donen_after = {
    start: { speaker: "Нұрлан", portrait: "nurlan_ghost", note: "появляется у выхода",
             text: "Дух войны боится не силы. Он боится покоя. Ты сыграл правильно.", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan",
             text: "Я не убил его.", goto: "n2" },
    n2:    { speaker: "Нұрлан", portrait: "nurlan_ghost", note: "исчезает",
             text: "Нет. Ты ему помог.",
             onEnd: function () { /* hand off to Chapter 4 */ } }
  };

  /* --- Дөнен intro (no invented dialogue; engine narration of the design text). */
  var TREE_ch3_donen_before = {
    start: { speaker: "", portrait: "",
             note: "Выход блокирует Дөнен — мёртвый конь-колосс с горящими глазами. Дух войны.",
             text: "В него нельзя ударить мечом — удар проходит сквозь. Его можно только успокоить.", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan", note: "берёт домбру",
             text: "Мелодия отца. Восемь нот. Слушай, Дөнен.",
             onEnd: function () { /* hosting scene launches the boss rhythm */ } }
  };

  /* --- KEY SCENE 4.1: first meeting with Аяулым (FULL VERBATIM). */
  var TREE_ch4_ayaulym = {
    start: { speaker: "", portrait: "",
             note: "Аяулым слышит шаги. Не оборачивается.",
             text: "Она стоит у обрыва. Смотрит вниз.", goto: "a1" },
    a1:    { speaker: "Аяулым", portrait: "ayaulym",
             text: "Ещё один, кто пришёл просить орла.", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan",
             text: "Я не прошу. Мне нужно попасть в Верхний мир.", goto: "a2" },
    a2:    { speaker: "Аяулым", portrait: "ayaulym", note: "наконец оборачивается",
             text: "Тогда ты самый честный из тех, кто сюда приходил.", goto: "a3" },
    a3:    { speaker: "Аяулым", portrait: "ayaulym",
             text: "Не получится. Қара Сұңқар несёт только того, кого считает достойным. А меня он даже вниз не везёт уже два года.", goto: "e2" },
    e2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Почему?", goto: "a4" },
    a4:    { speaker: "Аяулым", portrait: "ayaulym", note: "коротко, без жалости к себе",
             text: "Потому что я солгала ему. Беркут не прощает ложь.", goto: "e3" },
    e3:    { speaker: "Ержан", portrait: "erzhan",
             text: "Что если я помогу снять проклятие?", goto: "a5" },
    a5:    { speaker: "Аяулым", portrait: "ayaulym",
             text: "Что ты просишь взамен?", goto: "e4" },
    e4:    { speaker: "Ержан", portrait: "erzhan",
             text: "Чтобы ты довезла меня до Тәңір-Ана.", goto: "pause" },
    pause: { speaker: "", portrait: "",
             note: "Долгая пауза. Аяулым смотрит на него. Потом на орла. Орёл смотрит на Ержана.",
             text: "...", goto: "a6" },
    a6:    { speaker: "Аяулым", portrait: "ayaulym",
             text: "Если Сұңқар примет тебя — договорились.",
             set: { ayaulymTrust: 1, ayaulymMet: true },
             onEnd: function () { /* hosting scene opens the curse quest */ } }
  };

  /* --- KEY SCENE 4.2: spoken-aloud confession that lifts the curse (VERBATIM
     of the two pinned lines). The "rasskaz vsluh" body is engine narration of the
     design summary; the only spoken lines kept verbatim are Аяулым's "Это всё?"
     and Нұрлан's pinned aphorism. */
  var TREE_ch4_curse_confess = {
    start: { speaker: "", portrait: "",
             note: "Все три объекта найдены. Аяулым сама рассказывает правду вслух.",
             text: "Она солгала орлу, что берёт его на охоту, а сама шла на задание Серіка.", goto: "say" },
    say:   { speaker: "Аяулым", portrait: "ayaulym", note: "вслух, орлу",
             text: "Я солгала тебе. Я сказала, что мы идём на охоту. Это была ложь. Я шла на задание Серіка — и взяла тебя как прикрытие. Прости.", goto: "approach" },
    approach: { speaker: "", portrait: "",
             note: "Произнесённое вслух признание снимает проклятие. Орёл подходит к ней. Впервые за два года.",
             text: "Қара Сұңқар склоняет голову.",
             onEnd: function () { cue("sfx_eagle_cry"); },
             goto: "a1" },
    a1:    { speaker: "Аяулым", portrait: "ayaulym",
             text: "Это всё?", goto: "n1" },
    n1:    { speaker: "Нұрлан", portrait: "nurlan_ghost", note: "появляется ненадолго",
             text: "Правда — самое тяжёлое оружие и самое лёгкое лекарство.",
             set: { ayaulymTrust: 1 },
             onEnd: function () { /* hosting scene -> flight cutscene */ } }
  };

  /* --- KEY SCENE 4.3: Тәңір-Ана spinning the thread (FULL VERBATIM), ending in
     the Сила Неба. Ayaulym joins the party here. */
  var TREE_ch4_tanir = {
    start: { speaker: "", portrait: "",
             note: "Тәңір-Ана — не грозная богиня. Старая женщина, которая сидит и прядёт нить. Нить уходит вниз — в степь.",
             text: "Она не поднимает головы.", goto: "t1" },
    t1:    { speaker: "Тәңір-Ана", portrait: "mother",
             text: "Сядь. Ты пришёл спрашивать про Серіка?", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan",
             text: "Я пришёл за Силой Неба.", goto: "t2" },
    t2:    { speaker: "Тәңір-Ана", portrait: "mother", note: "не останавливает прядение",
             text: "Это одно и то же. Сначала — ответь мне на вопрос.", goto: "t3" },
    t3:    { speaker: "Тәңір-Ана", portrait: "mother",
             text: "Ты думаешь, Серік — злодей?", goto: "e2" },
    e2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Он украл сердце степи. Степь умирает.", goto: "t4" },
    t4:    { speaker: "Тәңір-Ана", portrait: "mother", note: "пауза",
             text: "Степь умирала до него. Он просто первый, кто это заметил и что-то сделал. Неправильно — но сделал.", goto: "t5" },
    t5:    { speaker: "Тәңір-Ана", portrait: "mother", note: "кладёт нить на колени",
             text: "Тас Жүрек трескается не от злодеев. Он трескается от тишины. Когда в ауле три дня не звучит домбра — он трескается на волосок. Когда дети не помнят имён дедов — на ещё один. Серік не украл его. Он подобрал осколки.", goto: "e3" },
    e3:    { speaker: "Ержан", portrait: "erzhan",
             text: "Тогда почему степь умирает?", goto: "t6" },
    t6:    { speaker: "Тәңір-Ана", portrait: "mother",
             text: "Потому что осколки должны быть дома. Не у хранителя. Дома. Понял?", goto: "think" },
    think: { speaker: "", portrait: "",
             note: "Ержан думает. Потом кивает.",
             text: "...", goto: "e4" },
    e4:    { speaker: "Ержан", portrait: "erzhan",
             text: "Тас Жүрек нельзя украсть и нельзя хранить. Его можно только помнить.", goto: "t7" },
    t7:    { speaker: "Тәңір-Ана", portrait: "mother", note: "улыбается, продолжает прясть",
             text: "Вот твоя Сила Неба.",
             set: { hasSilaNeba: true },
             onEnd: function () { /* hosting scene: grant power, party, hand off Ch5 */ } }
  };

  /* ================================================================== */
  /* MAP LOCATIONS — caves (Ch3) and mountain (Ch4)                     */
  /* ================================================================== */

  /* legend chars -> tile sprite keys (all required keys exist per CONTRACT §8) */
  var CAVE_LEGEND = {
    "#": "cave_wall",
    ".": "cave_floor",
    "+": "cave_floor",    // doorway floor between the two halls (kept distinct for layout clarity)
    "f": "campfire",      // pale cave fire
    "r": "rock",
    "c": "cave_floor"     // marker tiles handled by NPC layer; floor underneath
  };

  // 25 x 19 cave hall. '#': wall, '.'/'+': floor, 'f': pale fire, 'r': rock.
  // Two halls split by a central divider (x=10) with TWO doorways ('+') so the
  // whole map is connected: spawn (left) -> spirits -> deep zal (right). Verified
  // fully reachable by flood-fill; no spirit or marker is walled off.
  var CAVE_GRID = [
    "#########################",
    "#.........#.............#",
    "#.f.......#.....f.......#",
    "#.........#.............#",
    "#....r....#........r....#",
    "#.........#.............#",
    "#.........#.............#",
    "#.........+.............#",
    "#...f.....#......f......#",
    "#.........#.............#",
    "#.........#.............#",
    "#....r....#.............#",
    "#.........+.............#",
    "#.........#......r......#",
    "#.f.......#.............#",
    "#.........#.........f...#",
    "#.........#.............#",
    "#.........#.............#",
    "#########################"
  ];

  World.register({
    id: "zher_asty_hall",
    name: "ЖЕР АСТЫ",
    region: "zher_asty",
    w: 25, h: 19,
    grid: CAVE_GRID,
    legend: CAVE_LEGEND,
    solid: ["cave_wall", "rock", "water"],
    spawns: {
      "default": { x: 2, y: 1, dir: "down" },
      "from_crack": { x: 2, y: 1, dir: "down" }
    },
    npcs: [
      { key: "shadow", x: 4, y: 4, name: "Дух", dir: "down",
        onInteract: function () { startDialogue(TREE_spirit_1); } },
      { key: "shadow", x: 16, y: 9, name: "Дух", dir: "down",
        onInteract: function () { startDialogue(TREE_spirit_2); } },
      { key: "shadow", x: 5, y: 13, name: "Дух", dir: "down",
        onInteract: function () { startDialogue(TREE_spirit_3); } },
      // deeper passage marker -> the father's hall
      { key: "crack", x: 20, y: 16, name: "Глубокий зал", dir: "down",
        onInteract: function () {
          startDialogue({
            start: { speaker: "Нұрлан", portrait: "nurlan_ghost", note: "тихо",
                     text: "Самый глубокий зал — там. Иди. Он ждал тебя пять лет.",
                     onEnd: function () { go("ch3_father"); } }
          });
        } }
    ],
    exits: []
  });

  /* Mountain ascent: a vertical map with riddle-spirits on ledges. The path is
     gated: a closed wall opens (we swap tiles) only after the riddle is solved.
     We use rock as the closed gate and cave_floor as open ledge. */
  var MTN_LEGEND = {
    "#": "rock",
    ".": "grass_grey",   // wind-bitten high meadow
    "s": "sand",
    "p": "grass_grey",
    "g": "rock"          // gate (solid until opened -> becomes path)
  };

  var MTN_GRID = [
    "#########################",
    "#.........#############.#",
    "#.........#...........#.#",
    "#....s....#....s......#.#",
    "#.........g...........#.#",
    "#.........#...........#.#",
    "#####.#####...........#.#",
    "#.........#####g#######.#",
    "#.........#...........#.#",
    "#....s....#....s......#.#",
    "#.........#...........#.#",
    "#.........#####.#######.#",
    "#.........#...........#.#",
    "#.........g.....s.....#.#",
    "#.........#...........#.#",
    "#.........#...........#.#",
    "#.........#...........#.#",
    "#.........#...........#.#",
    "#########################"
  ];

  World.register({
    id: "han_tanir_slope",
    name: "ХАН ТӘҢІРІ",
    region: "han_tanir",
    w: 25, h: 19,
    grid: MTN_GRID,
    legend: MTN_LEGEND,
    solid: ["rock", "water"],
    spawns: {
      "default": { x: 2, y: 17, dir: "up" },
      "from_slope": { x: 2, y: 17, dir: "up" }
    },
    npcs: [
      // three riddle-spirits guard the three gates. Each, when answered, "opens"
      // a gate (we clear an adjacent rock to grass_grey so the path proceeds).
      { key: "shadow", x: 6, y: 13, name: "Дух горы", dir: "down",
        onInteract: function () { askRiddle(0, { gx: 10, gy: 13 }); } },
      { key: "shadow", x: 6, y: 7, name: "Дух горы", dir: "down",
        onInteract: function () { askRiddle(1, { gx: 14, gy: 7 }); } },
      { key: "shadow", x: 6, y: 4, name: "Дух горы", dir: "down",
        onInteract: function () { askRiddle(2, { gx: 10, gy: 4 }); } },
      // summit marker -> Аяулым at the cliff
      { key: "ayaulym", x: 2, y: 1, name: "Вершина", dir: "down",
        onInteract: function () {
          if (mtnAllSolved()) {
            go("ch4_ayaulym");
          } else {
            startDialogue({
              start: { speaker: "Нұрлан", portrait: "nurlan_ghost", note: "тихо",
                       text: "Гора не пускает силой. Реши загадки духов — тропа откроется сама." }
            });
          }
        } }
    ],
    exits: []
  });

  /* ================================================================== */
  /* RIDDLE-SPIRIT SYSTEM (TEXT riddles; correct answer opens the path) */
  /* ================================================================== */

  // Three riddles. Each: prompt + 3 choices; exactly one is correct. Answers are
  // about the steppe / the game's themes (memory, dombra, the heart). Solving sets
  // a flag and opens the matching gate tile.
  var RIDDLES = [
    {
      q: "Дух горы загораживает тропу.\n«Я звучу — и степь жива. Я молчу три дня — и каменное сердце трескается. Что я?»",
      a: ["Домбра", "Ветер", "Гроза"],
      correct: 0
    },
    {
      q: "Второй дух смотрит сквозь тебя.\n«Меня нельзя украсть и нельзя спрятать в сундук. Меня можно только передать дальше. Что я?»",
      a: ["Золото", "Память", "Власть"],
      correct: 1
    },
    {
      q: "Третий дух стоит у самого узкого карниза.\n«Я тяжелее меча в руке врага и легче пера в руке друга. Что я?»",
      a: ["Камень", "Страх", "Правда"],
      correct: 2
    }
  ];

  function riddleSolvedFlag(i) { return "riddle_solved_" + i; }

  function mtnAllSolved() {
    if (typeof G === "undefined" || !G || !G.flags) return false;
    return !!(G.flags[riddleSolvedFlag(0)] && G.flags[riddleSolvedFlag(1)] && G.flags[riddleSolvedFlag(2)]);
  }

  // open a gate tile in the active mountain map (rock -> walkable grass_grey)
  function openGate(gx, gy) {
    try {
      var loc = (typeof World !== "undefined" && World.get) ? World.get("han_tanir_slope") : null;
      if (loc && Array.isArray(loc.grid)) {
        var row = loc.grid[gy];
        if (typeof row === "string") {
          loc.grid[gy] = row.substring(0, gx) + "." + row.substring(gx + 1);
        }
        // if the map is currently loaded, reload it in place so the cleared tile
        // takes effect (preserve player position by using a temp spawn at player tile)
        if (typeof World.active === "function" && World.active() && World.active().id === "han_tanir_slope") {
          var px = (World.player && typeof World.player.x === "number") ? World.player.x : 2;
          var py = (World.player && typeof World.player.y === "number") ? World.player.y : 17;
          loc.spawns = loc.spawns || {};
          loc.spawns["__resume__"] = { x: px, y: py, dir: (World.player && World.player.dir) || "up" };
          if (World.load) World.load("han_tanir_slope", "__resume__");
        }
      }
    } catch (e) {}
  }

  function askRiddle(idx, gate) {
    var r = RIDDLES[idx];
    if (!r) return;
    if (typeof G !== "undefined" && G && G.flags && G.flags[riddleSolvedFlag(idx)]) {
      startDialogue({
        start: { speaker: "Дух горы", portrait: "shadow", note: "уже спокоен",
                 text: "Ты уже ответил. Тропа открыта. Иди дальше." }
      });
      return;
    }
    var tree = {
      start: {
        speaker: "Дух горы", portrait: "shadow", note: "текстовая загадка",
        text: r.q,
        choices: [
          { label: r.a[0], goto: (r.correct === 0 ? "right" : "wrong") },
          { label: r.a[1], goto: (r.correct === 1 ? "right" : "wrong") },
          { label: r.a[2], goto: (r.correct === 2 ? "right" : "wrong") }
        ]
      },
      right: {
        speaker: "Дух горы", portrait: "shadow", note: "тропа открывается",
        text: "Верно. Камень слышит правду. Проходи.",
        set: {},
        onEnd: function () {
          if (typeof G !== "undefined" && G) {
            if (!G.flags) G.flags = {};
            G.flags[riddleSolvedFlag(idx)] = true;
          }
          cue("sfx_confirm");
          if (gate) openGate(gate.gx, gate.gy);
        }
      },
      wrong: {
        speaker: "Дух горы", portrait: "shadow", note: "ветер усиливается",
        text: "Нет. Подумай ещё. Гора подождёт.",
        onEnd: function () { cue("sfx_cancel"); }
      }
    };
    startDialogue(tree);
  }

  /* ================================================================== */
  /* CURSE QUEST 4.2 — find the 3 objects Аяулым hid two years ago      */
  /* Each is a small story. We present them as on-mountain finds; reading */
  /* each tells its story; once all 3 found, the spoken confession runs.  */
  /* ================================================================== */

  // The three hidden objects, each a small story about what she concealed.
  var CURSE_OBJECTS = [
    {
      id: "obj_feather",
      name: "Перо беркута",
      story: {
        start: { speaker: "", portrait: "",
                 note: "За камнем — перо Қара Сұңқар, спрятанное два года назад.",
                 text: "Аяулым: «В тот день он сбросил это перо в полёте. Я подобрала и спрятала — чтобы не вспоминать, куда мы на самом деле летели.»",
                 onEnd: function () { markCurseObject("obj_feather"); } }
      }
    },
    {
      id: "obj_letter",
      name: "Свёрнутая записка",
      story: {
        start: { speaker: "", portrait: "",
                 note: "Под плоским камнем — записка, перевязанная нитью.",
                 text: "Аяулым: «Приказ Серіка. Я сказала орлу, что это — карта охотничьих троп. Я спрятала её здесь, чтобы он не учуял ложь.»",
                 onEnd: function () { markCurseObject("obj_letter"); } }
      }
    },
    {
      id: "obj_bell",
      name: "Бубенец с упряжи",
      story: {
        start: { speaker: "", portrait: "",
                 note: "В трещине скалы — маленький бубенец с упряжи беркута.",
                 text: "Аяулым: «Я сняла бубенец, чтобы он летел тихо. Чтобы никто не услышал, куда мы идём. В тот день я впервые заставила его молчать.»",
                 onEnd: function () { markCurseObject("obj_bell"); } }
      }
    }
  ];

  function markCurseObject(id) {
    if (typeof G !== "undefined" && G) {
      if (!G.flags) G.flags = {};
      G.flags["curse_" + id] = true;
    }
    cue("sfx_petroglyph");
  }

  function curseAllFound() {
    if (typeof G === "undefined" || !G || !G.flags) return false;
    return !!(G.flags["curse_obj_feather"] && G.flags["curse_obj_letter"] && G.flags["curse_obj_bell"]);
  }

  function curseFoundCount() {
    if (typeof G === "undefined" || !G || !G.flags) return 0;
    var n = 0;
    if (G.flags["curse_obj_feather"]) n++;
    if (G.flags["curse_obj_letter"]) n++;
    if (G.flags["curse_obj_bell"]) n++;
    return n;
  }

  // Curse-quest map: a small high-altitude search field with the 3 objects + Аяулым.
  var CURSE_GRID = [
    "#########################",
    "#.......................#",
    "#..s.........s.........s#".slice(0, 25),
    "#.......................#",
    "#.......................#",
    "#......#####.......#####.#".slice(0, 25),
    "#.......................#",
    "#.......................#",
    "#...........@...........#",
    "#.......................#",
    "#.......................#",
    "#..#####.......#####....#".slice(0, 25),
    "#.......................#",
    "#.......................#",
    "#.......................#",
    "#.......................#",
    "#.......................#",
    "#.......................#",
    "#########################"
  ];

  World.register({
    id: "han_tanir_summit",
    name: "ВЕРШИНА ХАН ТӘҢІРІ",
    region: "han_tanir",
    w: 25, h: 19,
    grid: CURSE_GRID,
    legend: {
      "#": "rock",
      ".": "grass_grey",
      "s": "sand",
      "@": "grass_grey"
    },
    solid: ["rock", "water"],
    spawns: {
      "default": { x: 12, y: 12, dir: "up" }
    },
    npcs: [
      { key: "ayaulym", x: 12, y: 8, name: "Аяулым", dir: "down",
        onInteract: function () {
          if (curseAllFound()) {
            startDialogue(TREE_ch4_curse_confess, function () { go("ch4_flight"); });
          } else {
            var left = 3 - curseFoundCount();
            startDialogue({
              start: { speaker: "Аяулым", portrait: "ayaulym", note: "смотрит вдаль",
                       text: "Я спрятала здесь три вещи два года назад. Найди их все — тогда я смогу сказать правду вслух. Осталось: " + left + "." }
            });
          }
        } },
      { key: "crack", x: 3, y: 2, name: CURSE_OBJECTS[0].name, dir: "down",
        onInteract: function () { findCurseObject(0); } },
      { key: "crack", x: 20, y: 3, name: CURSE_OBJECTS[1].name, dir: "down",
        onInteract: function () { findCurseObject(1); } },
      { key: "crack", x: 5, y: 15, name: CURSE_OBJECTS[2].name, dir: "down",
        onInteract: function () { findCurseObject(2); } }
    ],
    exits: []
  });

  function findCurseObject(idx) {
    var o = CURSE_OBJECTS[idx];
    if (!o) return;
    if (typeof G !== "undefined" && G && G.flags && G.flags["curse_" + o.id]) {
      startDialogue({
        start: { speaker: "Аяулым", portrait: "ayaulym",
                 text: "Это я уже нашла. Поищи остальное." }
      });
      return;
    }
    startDialogue(o.story, function () {
      if (curseAllFound()) {
        // nudge the player toward Аяулым for the spoken confession
        startDialogue({
          start: { speaker: "Аяулым", portrait: "ayaulym", note: "тихо",
                   text: "Все три у меня. Подойди — я скажу это вслух." }
        });
      }
    });
  }

  /* ================================================================== */
  /* SCENES — Chapter 3                                                  */
  /* ================================================================== */

  /* ch3_descent — Нұрлан-ghost reveals the new crack; cinematic; then descend
     into the cave hall. */
  Scenes.register("ch3_descent", {
    _t: 0, _started: false,
    enter: function () {
      this._t = 0; this._started = false;
      if (typeof G !== "undefined" && G) { G.chapter = 3; if (!G.flags) G.flags = {}; }
      cue("theme_zher_asty");
    },
    update: function (dt) {
      this._t += dt;
      if (blockWorldInput()) { dlgUpdate(dt); return; }
      if (!this._started && this._t > 700) {
        this._started = true;
        startDialogue(TREE_ch3_descent, function () { go("ch3_zher_asty", { spawn: "from_crack" }); });
      }
    },
    render: function (c) {
      drawCaveBackdrop(c, this._t);
      // the new crack, centered, pulsing violet
      drawCrack(c, W() / 2, H() / 2 - 10, 1.4, this._t);
      drawNarrationFrame(c, { backdrop: null });
      txt(c, "ЖЕР АСТЫ — НИЖНИЙ МИР", W() / 2, 40, { color: PAL("crackLight", "#7A3CE0"), size: 20, align: "center" });
      txt(c, "ПЕЩЕРЫ ПОД САРЫАРКОЙ · НОЧЬ", W() / 2, 64, { color: PAL("boneGrey", "#B8B4A4"), size: 12, align: "center" });
      if (!blockWorldInput()) {
        txt(c, "Холод всего, что забыто.", W() / 2, H() - 40, { color: PAL("boneGrey", "#B8B4A4"), size: 13, align: "center" });
      }
      dlgRender(c);
    },
    onKey: function (e) {
      if (blockWorldInput()) { dlgKey(e); return; }
    }
  });

  /* ch3_zher_asty — explorable cave hall with optional lost spirits + the deep
     passage marker. Uses World.makeExploreScene; we add a custom dombra hook +
     ambient music + a header. */
  (function () {
    var base = (typeof World !== "undefined" && World.makeExploreScene)
      ? World.makeExploreScene("zher_asty_hall", {
          onEnter: function () { cue("theme_zher_asty"); },
          onRender: function (c) {
            if (!blockWorldInput()) {
              txt(c, "ЖЕР АСТЫ", 12, 22, { color: PAL("crackLight", "#7A3CE0"), size: 14 });
              txt(c, "Поговори с потерянными духами. Глубокий зал — внизу справа.",
                  W() / 2, 40, { color: PAL("boneGrey", "#B8B4A4"), size: 11, align: "center" });
            }
          },
          onKey: function (e) {
            if (e && e.action === "dombra" && !blockWorldInput()) {
              cue("kui_erzhan_unfinished");
            }
          }
        })
      : fallbackRoomScene("ЖЕР АСТЫ", "ch3_father");
    Scenes.register("ch3_zher_asty", base);
  })();

  /* ch3_father — KEY SCENE 3.1. Static cinematic in the deepest hall: the father
     figure with the identical bracelet. Runs the full confession; then an
     interactive Rhythm "learning" beat for the 8 notes; on a successful pass,
     raise dombraMelodyLearned and continue to the Дөнен boss. */
  Scenes.register("ch3_father", {
    _t: 0, _phase: "intro", _learned: false,
    enter: function () {
      this._t = 0; this._phase = "intro"; this._learned = false;
      cue("theme_zher_asty");
      var self = this;
      // begin the confession after a short beat
      this._kick = 600;
    },
    update: function (dt) {
      this._t += dt;
      if (this._kick > 0) {
        this._kick -= dt;
        if (this._kick <= 0 && this._phase === "intro") {
          this._phase = "talk";
          var self = this;
          startDialogue(TREE_ch3_father, function () { self._beginLearning(); });
        }
      }
      if (blockWorldInput()) { dlgUpdate(dt); }
    },
    _beginLearning: function () {
      this._phase = "learn";
      var self = this;
      // play the unfinished kui then ask the player to repeat the 8 notes
      cue("kui_erzhan_unfinished");
      if (typeof Rhythm !== "undefined" && Rhythm.start) {
        try {
          Rhythm.start({
            melody: FATHER_MELODY,
            bpm: 84,
            onResult: function (acc) { self._afterLearning(acc); }
          });
          return;
        } catch (e) {}
      }
      // Rhythm missing -> still grant the passage so the story can proceed
      self._afterLearning(100);
    },
    _afterLearning: function (acc) {
      this._phase = "done";
      this._learned = true;
      // reaching the father's passage sets the kui to at least 1 (CONTRACT §2)
      if (typeof G !== "undefined" && G) {
        var cur = (typeof G.dombraMelodyLearned === "number") ? G.dombraMelodyLearned : 0;
        G.dombraMelodyLearned = clampN(Math.max(cur, 1), 0, 3);
        if (!G.flags) G.flags = {};
        G.flags["learnedFatherMelody"] = true;
      }
      cue("sfx_confirm");
      var self = this;
      // a short verbatim-respecting beat acknowledging the learned notes, then boss
      startDialogue({
        start: { speaker: "Қайрат", portrait: "qairat_ghost", note: "кивает",
                 text: (acc >= 90 ? "Ты запомнил. Эти восемь нот теперь твои." :
                                    "Почти. Но ты запомнил главное — что дальше. Этого хватит."),
                 onEnd: function () { /* proceed */ } },
      }, function () { go("ch3_donen"); });
    },
    render: function (c) {
      drawCaveBackdrop(c, this._t);
      // deep-hall glow
      c.save();
      c.globalAlpha = 0.25 + 0.1 * Math.sin(this._t * 0.002);
      c.fillStyle = PAL("caveFire", "#E8B25A");
      c.beginPath(); c.ellipse(W() / 2, H() / 2 + 30, 160, 90, 0, 0, Math.PI * 2); c.fill();
      c.restore();
      // father figure (ghost) centered, slightly above floor
      var drew = spriteSafe(c, "qairat_ghost", W() / 2 - 24, H() / 2 - 70, 6, { alpha: 0.92 });
      if (!drew) {
        // defensive silhouette + the identical bracelet hint
        c.fillStyle = PAL("caveStone", "#33354A");
        c.fillRect(W() / 2 - 18, H() / 2 - 70, 36, 90);
        c.fillStyle = PAL("gold", "#D4A017");
        c.fillRect(W() / 2 + 12, H() / 2 - 30, 8, 4); // bracelet
      }
      drawNarrationFrame(c, { backdrop: null });
      txt(c, "САМЫЙ ГЛУБОКИЙ ЗАЛ", W() / 2, 40, { color: PAL("crackLight", "#7A3CE0"), size: 16, align: "center" });
      if (this._phase === "intro") {
        txt(c, "Браслет на её запястье — такой же, как у тебя.", W() / 2, H() - 36,
            { color: PAL("gold", "#D4A017"), size: 13, align: "center" });
      }
      dlgRender(c);
    },
    onKey: function (e) {
      if (blockWorldInput()) { dlgKey(e); return; }
    }
  });

  /* ch3_donen — BOSS 3.2. Дөнен blocks the exit; melee passes through; resolved by
     the father melody. We use Battle (canMelee:false, countsAsKill:false,
     enemyKey "donen"); Battle itself prints "Дөнен медленно ложится на камень.
     Засыпает." on the rhythm pass. After win -> Нұрлан-ghost verbatim lines -> Ch4. */
  Scenes.register("ch3_donen", {
    _t: 0, _phase: "intro",
    enter: function () {
      this._t = 0; this._phase = "intro";
      cue("theme_zher_asty");
      this._kick = 500;
    },
    update: function (dt) {
      this._t += dt;
      if (this._kick > 0) {
        this._kick -= dt;
        if (this._kick <= 0 && this._phase === "intro") {
          this._phase = "preTalk";
          var self = this;
          startDialogue(TREE_ch3_donen_before, function () { self._startBoss(); });
        }
      }
      if (blockWorldInput()) { dlgUpdate(dt); }
    },
    _startBoss: function () {
      this._phase = "boss";
      var self = this;
      if (typeof Battle !== "undefined" && Battle.start) {
        try {
          Battle.start({
            enemyKey: "donen",
            name: "Дөнен",
            hp: 24,
            music: "theme_battle",
            canMelee: false,          // sword passes through
            countsAsKill: false,      // sleeps, not killed (HIDDEN counter untouched)
            rhythm: {
              melody: FATHER_MELODY,  // the father's 8 notes
              bpm: 84,
              accuracyNeeded: 80
            },
            onWin: function () { self._afterBoss(); },
            onLose: function () {
              // a rhythm-only boss can't truly kill the player narratively; retry the beat
              go("ch3_donen");
            }
          });
          return;
        } catch (e) {}
      }
      // Battle missing -> resolve narratively so the story never deadlocks
      self._afterBoss();
    },
    _afterBoss: function () {
      this._phase = "after";
      // return into THIS scene to show Нұрлан's lines, then hand off to Ch4
      go("ch3_donen_after");
    },
    render: function (c) {
      drawCaveBackdrop(c, this._t);
      // the exit gap behind Дөнен
      c.fillStyle = PAL("crackLight", "#7A3CE0");
      c.globalAlpha = 0.18 + 0.1 * Math.sin(this._t * 0.003);
      c.fillRect(W() / 2 - 40, 70, 80, H() - 200);
      c.globalAlpha = 1;
      // the dead colossal horse with burning eyes (sprite key "donen")
      var drew = spriteSafe(c, "donen", W() / 2 - 64, H() / 2 - 60, 8, { alpha: 0.95 });
      if (!drew) {
        c.fillStyle = PAL("caveStone", "#33354A");
        c.fillRect(W() / 2 - 70, H() / 2 - 40, 140, 80);
        // burning eyes
        c.fillStyle = PAL("feltRed", "#C0392B");
        c.fillRect(W() / 2 - 40, H() / 2 - 20, 8, 8);
        c.fillRect(W() / 2 + 20, H() / 2 - 20, 8, 8);
      }
      drawNarrationFrame(c, { backdrop: null });
      txt(c, "ДӨНЕН — ДУХ ВОЙНЫ", W() / 2, 40, { color: PAL("feltRed", "#C0392B"), size: 18, align: "center" });
      txt(c, "Меч проходит сквозь. Только домбра.", W() / 2, 62, { color: PAL("boneGrey", "#B8B4A4"), size: 12, align: "center" });
      dlgRender(c);
    },
    onKey: function (e) {
      if (blockWorldInput()) { dlgKey(e); return; }
    }
  });

  /* ch3_donen_after — Нұрлан-ghost verbatim resolution; then hand off to Chapter 4. */
  Scenes.register("ch3_donen_after", {
    _t: 0, _started: false,
    enter: function () {
      this._t = 0; this._started = false;
      cue("theme_zher_asty");
    },
    update: function (dt) {
      this._t += dt;
      if (!this._started && this._t > 400) {
        this._started = true;
        startDialogue(TREE_ch3_donen_after, function () {
          stopMusic();
          if (typeof G !== "undefined" && G) G.chapter = 4;
          go("ch4_ascent");
        });
      }
      if (blockWorldInput()) { dlgUpdate(dt); }
    },
    render: function (c) {
      drawCaveBackdrop(c, this._t);
      // Дөнен now asleep on the stone
      c.fillStyle = PAL("caveStone", "#33354A");
      c.globalAlpha = 0.85;
      c.fillRect(W() / 2 - 80, H() / 2 + 10, 160, 40);
      c.globalAlpha = 1;
      var drew = spriteSafe(c, "donen", W() / 2 - 64, H() / 2 - 10, 8, { alpha: 0.6 });
      if (!drew) {
        c.fillStyle = PAL("caveStone", "#33354A");
        c.fillRect(W() / 2 - 70, H() / 2, 140, 40);
      }
      // the now-open exit, bright
      c.fillStyle = PAL("skyWhite", "#EDEFE6");
      c.globalAlpha = 0.10 + 0.06 * Math.sin(this._t * 0.003);
      c.fillRect(W() / 2 - 36, 60, 72, H() / 2 - 60);
      c.globalAlpha = 1;
      drawNarrationFrame(c, { backdrop: null });
      txt(c, "Дөнен спит. Выход открыт.", W() / 2, 44, { color: PAL("gold", "#D4A017"), size: 14, align: "center" });
      dlgRender(c);
    },
    onKey: function (e) {
      if (blockWorldInput()) { dlgKey(e); return; }
    }
  });

  /* ================================================================== */
  /* SCENES — Chapter 4                                                  */
  /* ================================================================== */

  /* ch4_ascent — explorable living mountain with riddle-spirits. World.makeExploreScene
     over han_tanir_slope; header + dombra hook + mountain music. */
  (function () {
    var base = (typeof World !== "undefined" && World.makeExploreScene)
      ? World.makeExploreScene("han_tanir_slope", {
          onEnter: function () {
            if (typeof G !== "undefined" && G) { G.chapter = 4; if (!G.flags) G.flags = {}; }
            cue("theme_aspan");
          },
          onRender: function (c) {
            if (!blockWorldInput()) {
              txt(c, "ХАН ТӘҢІРІ — ПОДЪЁМ", 12, 22, { color: PAL("skyBlue", "#2980B9"), size: 14 });
              var solved = (mtnSolvedCount());
              txt(c, "Реши загадки духов (" + solved + "/3) — тропа к вершине откроется.",
                  W() / 2, 40, { color: PAL("boneGrey", "#B8B4A4"), size: 11, align: "center" });
            }
          },
          onKey: function (e) {
            if (e && e.action === "dombra" && !blockWorldInput()) {
              cue("kui_erzhan_unfinished");
            }
          }
        })
      : fallbackRoomScene("ХАН ТӘҢІРІ", "ch4_ayaulym");
    Scenes.register("ch4_ascent", base);
  })();

  function mtnSolvedCount() {
    var n = 0;
    if (typeof G !== "undefined" && G && G.flags) {
      if (G.flags[riddleSolvedFlag(0)]) n++;
      if (G.flags[riddleSolvedFlag(1)]) n++;
      if (G.flags[riddleSolvedFlag(2)]) n++;
    }
    return n;
  }

  /* ch4_ayaulym — KEY SCENE 4.1. Аяулым at the cliff. Static cinematic; full
     verbatim; then opens the curse quest (transition to the summit search map). */
  Scenes.register("ch4_ayaulym", {
    _t: 0, _started: false,
    enter: function () {
      this._t = 0; this._started = false;
      cue("theme_aspan");
      questStart("curse_ayaulym");
    },
    update: function (dt) {
      this._t += dt;
      if (blockWorldInput()) { dlgUpdate(dt); return; }
      if (!this._started && this._t > 600) {
        this._started = true;
        startDialogue(TREE_ch4_ayaulym, function () { go("ch4_curse"); });
      }
    },
    render: function (c) {
      drawMountainBackdrop(c, this._t);
      // the cliff edge
      c.fillStyle = PAL("caveStone", "#33354A");
      c.fillRect(0, H() - 90, W(), 90);
      c.fillStyle = PAL("rock", "#33354A");
      c.fillRect(W() / 2 + 60, H() - 130, 200, 130);
      // Аяулым at the edge, the eagle on a crag behind her
      var aDrew = spriteSafe(c, "ayaulym", W() / 2 - 100, H() - 170, 6, { flip: false });
      if (!aDrew) {
        c.fillStyle = PAL("feltRed", "#C0392B");
        c.fillRect(W() / 2 - 96, H() - 170, 28, 80);
      }
      var eDrew = spriteSafe(c, "eagle", W() / 2 + 120, H() - 200, 5, {});
      if (!eDrew) {
        c.fillStyle = PAL("earth", "#7D4E2A");
        c.fillRect(W() / 2 + 124, H() - 196, 40, 28);
      }
      drawNarrationFrame(c, { backdrop: null });
      txt(c, "АСПАН — ВЕРХНИЙ МИР", W() / 2, 40, { color: PAL("skyBlue", "#2980B9"), size: 18, align: "center" });
      txt(c, "ПИК ХАН ТӘҢІРІ · РАССВЕТ ТРЕТЬЕГО ДНЯ", W() / 2, 62, { color: PAL("boneGrey", "#B8B4A4"), size: 11, align: "center" });
      dlgRender(c);
    },
    onKey: function (e) {
      if (blockWorldInput()) { dlgKey(e); return; }
    }
  });

  /* ch4_curse — KEY SCENE 4.2 search. Explorable summit field; find the 3 hidden
     objects (each a small story), then the spoken confession at Аяулым -> flight. */
  (function () {
    var base = (typeof World !== "undefined" && World.makeExploreScene)
      ? World.makeExploreScene("han_tanir_summit", {
          onEnter: function () { cue("theme_aspan"); questStart("curse_ayaulym"); },
          onRender: function (c) {
            if (!blockWorldInput()) {
              txt(c, "СНЯТИЕ ПРОКЛЯТИЯ", 12, 22, { color: PAL("skyBlue", "#2980B9"), size: 14 });
              txt(c, "Найди три вещи, что Аяулым спрятала (" + curseFoundCount() + "/3). Потом подойди к ней.",
                  W() / 2, 40, { color: PAL("boneGrey", "#B8B4A4"), size: 11, align: "center" });
            }
          },
          onKey: function (e) {
            if (e && e.action === "dombra" && !blockWorldInput()) {
              cue("kui_erzhan_unfinished");
            }
          }
        })
      : fallbackRoomScene("СНЯТИЕ ПРОКЛЯТИЯ", "ch4_flight");
    Scenes.register("ch4_curse", base);
  })();

  /* ch4_flight — eagle-flight CUTSCENE: the pixel world below shrinks, then
     dissolves to sky-white. Uses Cutscene if present (owned by 70-ui.js, loaded
     after this file — guarded). Falls back to a self-driven animation otherwise. */
  Scenes.register("ch4_flight", {
    _t: 0, _started: false, _zoom: 1, _white: 0,
    blockPause: true,
    enter: function () {
      this._t = 0; this._started = false; this._zoom = 1; this._white = 0;
      // mark curse done / heal nothing here (region heals on world progress); join later
      questComplete("curse_ayaulym");
      cue("sfx_eagle_cry");
      var self = this;
      // Prefer the Cutscene API for the canonical cinematic timeline
      if (typeof Cutscene !== "undefined" && Cutscene && Cutscene.play) {
        this._usingCutscene = true;
        var timeline = [
          { at: 0, cue: "theme_aspan" },
          { at: 0, text: "Қара Сұңқар расправляет крылья." },
          { at: 200, cue: "sfx_eagle_cry" },
          { at: 300, do: function (c) { self._drawFlight(c, self._cutT()); } },
          { at: 1600, text: "Пиксельный мир снизу становится маленьким." },
          { at: 3400, text: "Потом исчезает совсем." },
          { at: 5200, text: "Белая бесконечность." },
          { at: 7200, text: "" },
          { at: 8000 }
        ];
        try {
          Cutscene.play(timeline, function () { go("ch4_tanir"); });
          return;
        } catch (e) { this._usingCutscene = false; }
      }
      // self-driven fallback animation
      this._usingCutscene = false;
      this._started = true;
    },
    _cutT: function () { return this._t; },
    update: function (dt) {
      this._t += dt;
      if (this._usingCutscene) return; // Cutscene overlay drives visuals + ending
      // fallback timeline: zoom out for 4.5s, then whiteout for 2s, then continue
      if (this._t < 4500) {
        this._zoom = lerpN(1.0, 0.12, clampN(this._t / 4500, 0, 1));
      } else {
        this._zoom = 0.12;
        this._white = clampN((this._t - 4500) / 2000, 0, 1);
        if (this._t > 7000) {
          go("ch4_tanir");
        }
      }
    },
    _drawFlight: function (c, t) {
      // shared painter for both Cutscene `do` beats and the fallback render
      drawSkyBackdrop(c, t);
      // the shrinking pixel-world below (a little tiled patch that scales down)
      var z = this._usingCutscene
        ? clampN(1 - (t - 300) / 5000, 0.1, 1) // mirror the cutscene zoom over ~5s
        : this._zoom;
      var cw = W(), ch = H();
      var pw = 360 * z, ph = 240 * z;
      var ox = cw / 2 - pw / 2;
      var oy = ch * 0.62 - ph / 2 + (1 - z) * 120;
      c.save();
      c.globalAlpha = clampN(z * 1.1, 0, 1);
      // miniature steppe patch
      var cols = 9, rows = 6;
      for (var yy = 0; yy < rows; yy++) {
        for (var xx = 0; xx < cols; xx++) {
          var alive = ((xx + yy) % 3 !== 0);
          c.fillStyle = alive ? PAL("grassDark", "#4E7A33") : PAL("greySteppe", "#8A8A7A");
          c.fillRect(ox + xx * (pw / cols), oy + yy * (ph / rows),
                     Math.ceil(pw / cols), Math.ceil(ph / rows));
        }
      }
      // a tiny river
      c.fillStyle = PAL("waterLight", "#3E86A8");
      c.fillRect(ox + pw * 0.3, oy, Math.max(2, pw * 0.06), ph);
      c.restore();
      // the eagle, large, foreground, gently bobbing
      var bob = Math.sin(t * 0.004) * 8;
      var eDrew = spriteSafe(c, "eagle_fly", cw / 2 - 48, ch * 0.30 + bob, 8, {});
      if (!eDrew) eDrew = spriteSafe(c, "eagle", cw / 2 - 48, ch * 0.30 + bob, 8, {});
      if (!eDrew) {
        c.fillStyle = PAL("earth", "#7D4E2A");
        c.fillRect(cw / 2 - 60, ch * 0.30 + bob, 120, 40);
        c.fillStyle = PAL("outline", "#1A0A00");
        c.fillRect(cw / 2 - 90, ch * 0.30 + bob + 14, 180, 6);
      }
    },
    render: function (c) {
      if (this._usingCutscene) {
        // Cutscene overlay handles its own drawing; render a clean sky base beneath
        drawSkyBackdrop(c, this._t);
        return;
      }
      this._drawFlight(c, this._t);
      // whiteout
      if (this._white > 0) {
        c.fillStyle = "rgba(237,239,230," + this._white.toFixed(3) + ")";
        c.fillRect(0, 0, W(), H());
      }
      // captions for the fallback path
      var cap = "";
      if (this._t < 1600) cap = "Қара Сұңқар расправляет крылья.";
      else if (this._t < 3400) cap = "Пиксельный мир снизу становится маленьким.";
      else if (this._t < 4500) cap = "Потом исчезает совсем.";
      else cap = "Белая бесконечность.";
      txt(c, cap, W() / 2, H() - 40, { color: PAL("skyBlue", "#2980B9"), size: 14, align: "center" });
    },
    onKey: function (e) {
      // allow confirm to skip the fallback; Cutscene handles its own fast-forward
      if (!this._usingCutscene && e && e.action === "confirm" && this._t > 1000) {
        go("ch4_tanir");
      }
    }
  });

  /* ch4_tanir — KEY SCENE 4.3. Тәңір-Ana spinning the thread; full verbatim; ends
     in the Сила Неба; Ayaulym joins the party; hand off to Chapter 5. */
  Scenes.register("ch4_tanir", {
    _t: 0, _started: false,
    enter: function () {
      this._t = 0; this._started = false;
      cue("theme_aspan");
    },
    update: function (dt) {
      this._t += dt;
      if (blockWorldInput()) { dlgUpdate(dt); return; }
      if (!this._started && this._t > 700) {
        this._started = true;
        var self = this;
        startDialogue(TREE_ch4_tanir, function () { self._grantPower(); });
      }
    },
    _grantPower: function () {
      // grant the Sky power, add Ayaulym to the party, mark progress, hand off Ch5
      if (typeof G !== "undefined" && G) {
        if (!G.flags) G.flags = {};
        G.flags["silaNeba"] = true;
        addInventory("sila_neba");
        addParty("ayaulym");
        if (typeof G.ayaulymTrust === "number") {
          // joining cements trust
          G.ayaulymTrust = Math.max(G.ayaulymTrust, 2);
        }
      }
      cue("sfx_heal");
      var self = this;
      startDialogue({
        start: { speaker: "Аяулым", portrait: "ayaulym", note: "присоединяется",
                 text: "Я лечу с тобой. Я должна это закончить.", goto: "n1" },
        n1:    { speaker: "Нұрлан", portrait: "nurlan_ghost", note: "коротко",
                 text: "Земля. Небо. Осталась Вода — и то, что между людьми. Спускайтесь.",
                 onEnd: function () { /* hand off */ } }
      }, function () {
        stopMusic();
        if (typeof G !== "undefined" && G) G.chapter = 5;
        go("ch5_dosan");
      });
    },
    render: function (c) {
      // pure sky-white world (the Upper world); Тәңір-Ана seated, spinning
      var w = W(), h = H();
      c.fillStyle = PAL("skyWhite", "#EDEFE6");
      c.fillRect(0, 0, w, h);
      // very soft horizon glow
      c.save();
      c.globalAlpha = 0.4;
      var g;
      try {
        g = c.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, h);
        g.addColorStop(0, PAL("yurtWhite", "#F5ECD7"));
        g.addColorStop(1, PAL("skyWhite", "#EDEFE6"));
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      } catch (e) {}
      c.restore();
      // the thread descending into the steppe below
      c.strokeStyle = PAL("gold", "#D4A017");
      c.globalAlpha = 0.7;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(w / 2 + 6, h / 2 + 10);
      var wob = Math.sin(this._t * 0.002) * 6;
      c.bezierCurveTo(w / 2 + 30 + wob, h * 0.7, w / 2 - 20 + wob, h * 0.85, w / 2 + 10, h);
      c.stroke();
      c.globalAlpha = 1;
      // Тәңір-Ана (mother sprite), seated
      var drew = spriteSafe(c, "mother", w / 2 - 30, h / 2 - 60, 6, {});
      if (!drew) {
        c.fillStyle = PAL("boneGrey", "#B8B4A4");
        c.fillRect(w / 2 - 26, h / 2 - 40, 52, 70);
        c.fillStyle = PAL("yurtWhite", "#F5ECD7");
        c.fillRect(w / 2 - 18, h / 2 - 58, 36, 24); // head/scarf
      }
      drawNarrationFrame(c, { backdrop: null });
      txt(c, "ТӘҢІР-АНА", w / 2, 44, { color: PAL("gold", "#D4A017"), size: 18, align: "center" });
      if (!this._started) {
        txt(c, "Она прядёт нить. Нить уходит вниз — в степь.", w / 2, h - 36,
            { color: PAL("greySteppe", "#8A8A7A"), size: 13, align: "center" });
      }
      dlgRender(c);
    },
    onKey: function (e) {
      if (blockWorldInput()) { dlgKey(e); return; }
    }
  });

  /* ================================================================== */
  /* Defensive fallback scene factory (used only if World is unavailable)  */
  /* ================================================================== */
  function fallbackRoomScene(title, nextId) {
    return {
      _t: 0,
      enter: function () { this._t = 0; },
      update: function (dt) { this._t += dt; if (blockWorldInput()) dlgUpdate(dt); },
      render: function (c) {
        c.fillStyle = PAL("caveDark", "#171826");
        c.fillRect(0, 0, W(), H());
        txt(c, title, W() / 2, H() / 2 - 20, { color: PAL("gold", "#D4A017"), size: 22, align: "center" });
        txt(c, "Z — дальше", W() / 2, H() / 2 + 20, { color: PAL("boneGrey", "#B8B4A4"), size: 13, align: "center" });
        dlgRender(c);
      },
      onKey: function (e) {
        if (blockWorldInput()) { dlgKey(e); return; }
        if (e && e.action === "confirm") { go(nextId); }
      }
    };
  }

})();
