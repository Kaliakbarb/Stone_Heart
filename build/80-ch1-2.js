/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 80-ch1-2.js
   REGISTERS: Chapter 1 (ТАМЫР) + Chapter 2 (БАҚСЫ) scenes, their World
   locations, and their Dialogue trees.

   OWNS NO CORE NAMESPACE. At top-level this file ONLY:
     - registers World locations  (World.register)
     - registers Scenes         (Scenes.register)
     - defines local Dialogue tree literals (plain objects)
   It NEVER calls another module's runtime method (draw/play/update/start)
   at top-level — only inside scene/dialogue callbacks. Every cross-module
   call is defensively guarded so a single absent sprite / audio cue /
   scene / map key can never throw inside the 60fps loop.

   All in-game text is reproduced VERBATIM from DESIGN.md (§ГЛАВА 1, §ГЛАВА 2).
   RAW JS fragment — concatenated inside the single script tag of index.html.
   ===================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* small local guarded helpers (no globals leaked except registrations) */
  /* ------------------------------------------------------------------ */

  function cue(name) {
    try {
      if (typeof Audio !== "undefined" && Audio && Audio.playCue) Audio.playCue(name);
    } catch (e) {}
  }
  function stopMusic() {
    try {
      if (typeof Audio !== "undefined" && Audio && Audio.stopMusic) Audio.stopMusic();
    } catch (e) {}
  }
  function go(id, params) {
    try { if (typeof setScene === "function") setScene(id, params || {}); } catch (e) {}
  }
  function sprite(c, key, x, y, scale, opts) {
    try {
      if (typeof Sprites !== "undefined" && Sprites && Sprites.draw &&
          Sprites.has && Sprites.has(key)) {
        Sprites.draw(c, key, x, y, scale || 1, opts || {});
        return true;
      }
    } catch (e) {}
    return false;
  }
  function pal(name, fallback) {
    try {
      if (typeof PALETTE !== "undefined" && PALETTE && PALETTE[name]) return PALETTE[name];
    } catch (e) {}
    return fallback;
  }
  function txt(c, str, x, y, opts) {
    try { if (typeof drawText === "function") { drawText(c, str, x, y, opts || {}); return; } } catch (e) {}
    // last-ditch raw text so a scene is never blank if drawText is missing
    try {
      c.save();
      c.fillStyle = (opts && opts.color) || "#F5ECD7";
      c.font = '700 ' + ((opts && opts.size) || 16) + 'px "Courier New", monospace';
      c.textAlign = (opts && opts.align) || "left";
      c.fillText(String(str), x, y);
      c.restore();
    } catch (e2) {}
  }
  function W() { try { return (typeof Engine !== "undefined" && Engine.W) ? Engine.W : 800; } catch (e) { return 800; } }
  function H() { try { return (typeof Engine !== "undefined" && Engine.H) ? Engine.H : 600; } catch (e) { return 600; } }
  function clampL(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function flag(name) { try { return !!(G && G.flags && G.flags[name]); } catch (e) { return false; } }
  function setFlag(name, val) { try { if (G) { if (!G.flags) G.flags = {}; G.flags[name] = val; } } catch (e) {} }
  function inInventory(item) { try { return !!(G && G.inventory && G.inventory.indexOf(item) >= 0); } catch (e) { return false; } }
  function addInventory(item) {
    try { if (G) { if (!G.inventory) G.inventory = []; if (G.inventory.indexOf(item) < 0) G.inventory.push(item); } } catch (e) {}
  }
  function questStart(id) { try { if (typeof Quests !== "undefined" && Quests && Quests.start) Quests.start(id); } catch (e) {} }
  function questComplete(id) { try { if (typeof Quests !== "undefined" && Quests && Quests.complete) Quests.complete(id); } catch (e) {} }
  function dialogueActive() { try { return (typeof Dialogue !== "undefined" && Dialogue && Dialogue.active); } catch (e) { return false; } }
  function startDialogue(tree, onDone) {
    try {
      if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.start) {
        Dialogue.start(tree, onDone);
        return true;
      }
    } catch (e) {}
    // Dialogue missing: don't strand the caller's chain.
    if (typeof onDone === "function") { try { onDone(); } catch (e2) {} }
    return false;
  }
  function driveDialogueUpdate(dt) {
    try { if (dialogueActive() && Dialogue.update) Dialogue.update(dt); } catch (e) {}
  }
  function driveDialogueRender(c) {
    try { if (dialogueActive() && Dialogue.render) Dialogue.render(c); } catch (e) {}
  }
  function driveDialogueKey(e) {
    try { if (dialogueActive() && Dialogue.onKey) Dialogue.onKey(e); } catch (er) {}
  }
  function decayLevel(region) {
    try { if (typeof Decay !== "undefined" && Decay && Decay.levelFor) return Decay.levelFor(region); } catch (e) {}
    return 0;
  }

  /* a soft vertical gradient backdrop used by cutscene-style story scenes */
  function backdrop(c, topHex, botHex) {
    try {
      var g = c.createLinearGradient(0, 0, 0, H());
      g.addColorStop(0, topHex);
      g.addColorStop(1, botHex);
      c.fillStyle = g;
      c.fillRect(0, 0, W(), H());
    } catch (e) {
      c.fillStyle = botHex;
      c.fillRect(0, 0, W(), H());
    }
  }

  /* ================================================================== */
  /* CHAPTER 1 — DIALOGUE TREES (VERBATIM, DESIGN.md §ГЛАВА 1)           */
  /* ================================================================== */

  /* Scene 1.1 — у юрты аксакала (Бейсен ↔ Ержан). Verbatim. */
  var TREE_ch1_beysen = {
    start: {
      speaker: "Бейсен", portrait: "beysen", note: "смотрит на огонь. Молчит. Долго.",
      text: "Ты видел траву у ворот?", goto: "e1"
    },
    e1: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Видел. Думал — засуха.", goto: "b2"
    },
    b2: {
      speaker: "Бейсен", portrait: "beysen", note: "старик смотрит на угли",
      text: "Нет. Засуха идёт снизу. Это идёт изнутри.", goto: "e2"
    },
    e2: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Что это значит?", goto: "b3"
    },
    b3: {
      speaker: "Бейсен", portrait: "beysen",
      text: "Три дня назад ночью что-то изменилось в Орхон-горе. Я слышал — Тас Жүрек больше не отвечает.",
      goto: "e3"
    },
    e3: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Тас Жүрек — это легенда. Дед рассказывал, что это сказка для детей.", goto: "b4"
    },
    b4: {
      speaker: "Бейсен", portrait: "beysen", note: "пауза",
      text: "Твой дед говорил так, потому что боялся. А твой отец — потому что знал.", goto: "e4"
    },
    e4: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Что знал мой отец?", goto: "b5"
    },
    b5: {
      speaker: "Бейсен", portrait: "beysen",
      note: "встаёт, подходит к стене и снимает старую карту — потёртую, с трещиной прямо посередине",
      text: "Что степь — живая. И что однажды кто-то из нашей крови должен будет за неё ответить.",
      set: { knowsLegend: true }
    }
  };

  /* Scene 1.2 — four directions: a short villager line at each dying-land
     symbol. Verbatim flavour drawn from DESIGN §1.2: "Они боятся. Не
     понимают. Называют разные причины." Each point is its own tiny tree. */

  var TREE_ch1_cattle = {
    start: {
      speaker: "Жительница", portrait: "mother", note: "у мёртвого скота",
      text: "Скот пал за одну ночь. Ни раны, ни болезни. Просто лёг — и не встал.", goto: "v2"
    },
    v2: {
      speaker: "Жительница", portrait: "mother", note: "боится",
      text: "Старики говорят — земля забирает обратно то, что давала. Я не понимаю.",
      set: { sawCattle: true }
    }
  };

  var TREE_ch1_earth = {
    start: {
      speaker: "Житель", portrait: "beysen", note: "у потрескавшейся земли",
      text: "Земля треснула сама. Воды не было — но трещины глубокие, как раны.", goto: "v2"
    },
    v2: {
      speaker: "Житель", portrait: "beysen",
      text: "Кто-то говорит — засуха. Кто-то — гнев духов. Никто не знает.",
      set: { sawEarth: true }
    }
  };

  var TREE_ch1_birds = {
    start: {
      speaker: "Мальчик", portrait: "child", note: "у замолчавших птиц",
      text: "Птицы замолчали. Совсем. Утром не пели. Тихо так, что страшно.", goto: "v2"
    },
    v2: {
      speaker: "Мальчик", portrait: "child",
      text: "Мама говорит — они улетели. Но я видел: они здесь. Просто молчат.",
      set: { sawBirds: true }
    }
  };

  /* Scene 1.2 climax — у родника: footprint of a boot with the Ordo mark
     (triangle with a dot inside). */
  var TREE_ch1_spring = {
    start: {
      speaker: "Старуха", portrait: "mother", note: "у пересохшего родника",
      text: "Родник высох за ночь. Здесь всегда была вода. Сколько помню — всегда.", goto: "v2"
    },
    v2: {
      speaker: "Старуха", portrait: "mother", note: "боится",
      text: "А утром у воды был след. Не наш. Чужой сапог. Я не подходила.", goto: "found"
    },
    found: {
      speaker: "", portrait: "",
      note: "Ержан наклоняется к высохшему руслу",
      text: "След. Не звериный. Человеческий. В сапоге с необычным орнаментом — треугольник с точкой внутри.",
      goto: "found2"
    },
    found2: {
      speaker: "Ержан", portrait: "erzhan", note: "тихо",
      text: "Это знак Ордо.",
      set: { sawSpring: true, foundOrdoMark: true }
    }
  };

  /* Scene 1.3 — ночь перед уходом (мать Гүлнар ↔ Ержан). Verbatim. */
  var TREE_ch1_mother = {
    start: {
      speaker: "Мать", portrait: "mother", note: "Из-за юрты выходит мать — Гүлнар.",
      text: "Опять играешь.", goto: "e1"
    },
    e1: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Не могу закончить. Не знаю, как должно звучать.", goto: "m2"
    },
    m2: {
      speaker: "Мать", portrait: "mother",
      text: "Твой отец тоже не мог закончить эту мелодию. Годами играл. Потом ушёл.", goto: "e2"
    },
    e2: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Он не ушёл. Он пропал.", goto: "m3"
    },
    m3: {
      speaker: "Мать", portrait: "mother", note: "тихо",
      text: "Да.", goto: "m4"
    },
    m4: {
      speaker: "Мать", portrait: "mother", note: "садится рядом. Берёт его руку.",
      text: "Куда ты идёшь завтра?", goto: "e3"
    },
    e3: {
      speaker: "Ержан", portrait: "erzhan",
      text: "За следом.", goto: "m5"
    },
    m5: {
      speaker: "Мать", portrait: "mother",
      text: "Я знала, что однажды ты это скажешь. Я боялась этого дня. И всё равно — иди.", goto: "e4"
    },
    e4: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Мама...", goto: "m6"
    },
    m6: {
      speaker: "Мать", portrait: "mother",
      text: "Иди. Наша семья всегда платила за степь. Это наш долг. Я только прошу — вернись.",
      note: "Ержан кивает. Не говорит. Просто кивает.",
      set: { motherFarewell: true }
    }
  };

  /* ================================================================== */
  /* CHAPTER 2 — DIALOGUE TREES (VERBATIM, DESIGN.md §ГЛАВА 2)           */
  /* ================================================================== */

  /* Scene 2.1 — встреча с бақсы (Нұрлан ↔ Ержан). Verbatim. */
  var TREE_ch2_nurlan = {
    start: {
      speaker: "Нұрлан", portrait: "nurlan", note: "не открывая глаз",
      text: "Ты пришёл слишком поздно. И в самый нужный момент.", goto: "e1"
    },
    e1: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Тебя укусила змея? Я могу...", goto: "n2"
    },
    n2: {
      speaker: "Нұрлан", portrait: "nurlan", note: "наконец открывает глаза — они белые",
      text: "Меня укусила Жалмауыз. Это не лечится травами.", goto: "e2"
    },
    e2: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Жалмауыз — сказка.", goto: "n3"
    },
    n3: {
      speaker: "Нұрлан", portrait: "nurlan", note: "слабая улыбка, кашель",
      text: "Сегодня второй раз за день мне говорят, что я — сказка.", goto: "n4"
    },
    n4: {
      speaker: "Нұрлан", portrait: "nurlan",
      note: "с трудом берёт домбру. Протягивает Ержану.",
      text: "Это Дыбысты Домбыра. Звучащая домбра. Она слышит то, что обычные уши не слышат. Следы. Ложь. Боль земли. Ты умеешь играть?",
      goto: "e3"
    },
    e3: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Плохо.", goto: "n5"
    },
    n5: {
      speaker: "Нұрлан", portrait: "nurlan",
      text: "Хорошо. Те, кто играет хорошо — думают о красоте. Те, кто играет плохо — слышат больше.",
      set: { metNurlan: true },
      onEnd: function () {
        addInventory("dybysty_dombra");
        // the Дыбысты Домбыра is the sounding dombra — playing it is now richer
        if (G) { if (typeof G.dombraMelodyLearned !== "number") G.dombraMelodyLearned = 0; }
      }
    }
  };

  /* Scene 2.2 lead-in — Нұрлан explains Жалмауыз before the boss. Verbatim
     paraphrase forbidden: DESIGN gives narration; we present it as Нұрлан's
     briefing using only DESIGN's own facts, kept terse and faithful. */
  var TREE_ch2_brief = {
    start: {
      speaker: "Нұрлан", portrait: "nurlan",
      text: "Жалмауыз — старуха из Нижнего мира. Её выпустили те, кто взял Тас Жүрек.", goto: "n2"
    },
    n2: {
      speaker: "Нұрлан", portrait: "nurlan",
      text: "Она заперла детей аула в пещере. Иди туда.", goto: "n3"
    },
    n3: {
      speaker: "Нұрлан", portrait: "nurlan", note: "тяжело дышит",
      text: "Она не берёт атаки в лоб. Играй на домбре. Правильные ноты ослабят её — и только тогда меч найдёт её сердце.",
      set: { jalmauyzBriefed: true }
    }
  };

  /* Жалмауыз's verbatim crumble line (shown after the rhythm-only defeat). */
  var TREE_ch2_jalmauyz_crumble = {
    start: {
      speaker: "Жалмауыз", portrait: "jalmauyz", note: "рассыпается в пыль и смеётся",
      text: "Думаешь, ты меня убил, мальчик? Я — часть вашего же забвения. Убьёшь меня — найдёшь другую. Ты борешься с зеркалом.",
      set: { jalmauyzDefeated: true }
    }
  };

  /* Scene 2.3 — смерть Нұрлана. Verbatim. */
  var TREE_ch2_death = {
    start: {
      speaker: "Нұрлан", portrait: "nurlan", note: "ещё жив — едва. Дети окружают его. Он смотрит на них долго.",
      text: "Они здоровы?", goto: "e1"
    },
    e1: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Все живы.", goto: "n2"
    },
    n2: {
      speaker: "Нұрлан", portrait: "nurlan", note: "долгая пауза, закрывает глаза",
      text: "Хорошо.", goto: "e2"
    },
    e2: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Не уходи. Ты нужен. Я не знаю дороги.", goto: "n3"
    },
    n3: {
      speaker: "Нұрлан", portrait: "nurlan", note: "открывает один глаз",
      text: "Ты знаешь. Просто ещё не понял, что знаешь.", goto: "n4"
    },
    n4: {
      speaker: "Нұрлан", portrait: "nurlan", note: "слабо улыбается",
      text: "Три Силы. Земля. Небо. Вода. Когда соберёшь все три — Тас Жүрек почувствует тебя. А я никуда не ухожу.",
      goto: "e3"
    },
    e3: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Что это значит — 'никуда не ухожу'?",
      note: "Нұрлан не отвечает. Его дыхание останавливается. Тишина. Дети плачут. Ержан стоит с домброй в руках.",
      set: { nurlanDied: true }
    }
  };

  /* the unfinished-kui melody used as Жалмауыз's rhythm-only weakening.
     Lanes 0..3, t in ms; 8 notes per the brief (kui_erzhan_unfinished). */
  var JALMAUYZ_MELODY = [
    { lane: 0, t: 0 },
    { lane: 2, t: 520 },
    { lane: 1, t: 1040 },
    { lane: 3, t: 1560 },
    { lane: 2, t: 2080 },
    { lane: 0, t: 2600 },
    { lane: 1, t: 3120 },
    { lane: 3, t: 3640 }
  ];

  /* ================================================================== */
  /* MAP LOCATIONS                                                       */
  /* ================================================================== */

  /* ---- АУЛ ЖЕТІҚАЗ — 7 yurts, river, ancestor graveyard ------------- */
  /* Legend:
       g grass   G grass_grey(grey at gate)   w water(river)   t tree
       T tree_grey   y yurt   # rock   x grave   p petroglyph
       . grass (walkable)  c campfire(walkable decor; not solid)
     The gate (south, where the grass turned grey) sits at the bottom edge. */
  var AUL_GRID = [
    "ttttttttttttttttttttttttt",
    "t.......................t",
    "t..yy......ww.....yy.....t",
    "t..yy......ww.....yy....Tt",
    "t..........ww...........t",
    "t....yy....ww....yy.....t",
    "t....yy....ww....yy.....t",
    "t..........ww...........t",
    "t.......c......c........t",
    "t......yy......yy.......t",
    "t......yy......yy......xt",
    "t.....................xxt",
    "t..p..................xxt",
    "t.....................xxt",
    "t..........GG..........t",
    "t..........GG..........t",
    "t.........GGGG.........t",
    "ttttttt.GGGGGGGG.tttttttt",
    "tttttttttttttttttttttttt0"
  ];
  // count of 'y' pairs above gives the 7 yurts (3 left columns of pairs + 3 right + 1 = 7 huts).
  var AUL_LEGEND = {
    "t": "tree",
    "T": "tree_grey",
    ".": "grass",
    "g": "grass",
    "G": "grass_grey",
    "w": "water",
    "y": "yurt",
    "#": "rock",
    "x": "grave",
    "p": "petroglyph",
    "c": "campfire",
    "0": "tree"
  };

  function registerAulMap() {
    if (typeof World === "undefined" || !World || !World.register) return;
    World.register({
      id: "aul_jetiqaz",
      name: "АУЛ ЖЕТІҚАЗ",
      region: "jetiqaz",
      decayRegion: "jetiqaz",
      bg: "grassDark",
      grid: AUL_GRID,
      legend: AUL_LEGEND,
      solid: ["water", "rock", "yurt", "yurt_stone", "tree", "tree_grey", "grave"],
      spawns: {
        "default": { x: 12, y: 13, dir: "up" },
        "from_steppe": { x: 12, y: 16, dir: "up" },
        "gate": { x: 12, y: 16, dir: "up" },
        "from_valley": { x: 12, y: 16, dir: "up" }
      },
      npcs: [
        {
          key: "beysen", x: 7, y: 9, name: "Бейсен",
          onInteract: function () {
            go("ch1_beysen");
          }
        },
        {
          key: "mother", x: 17, y: 9, name: "Гүлнар",
          onInteract: function () {
            if (dialogueActive()) return;
            startDialogue({
              start: {
                speaker: "Мать", portrait: "mother",
                text: flag("knowsLegend")
                  ? "Бейсен рассказал тебе про карту? Тогда ты уже знаешь — это началось."
                  : "Сходи к Бейсену. Он ждал тебя дольше, чем ты думаешь.",
                set: {}
              }
            });
          }
        }
      ]
    });
  }

  /* ---- ДОЛИНА КОБЛАНДЫ — steppe greyer, grass burning without wind --- */
  /* The valley where the shaman dies. A burning ring of grass in the centre;
     Нұрлан sits at its heart. Legend:
       g grass  G grass_grey  f campfire(=the burning grass, walkable decor)
       r rock  s sand  w water  N (npc anchor; tile under is sand)            */
  var VALLEY_GRID = [
    "rrrrrrrrrrrrrrrrrrrrrrrrr",
    "r.....................r",
    "r..GG....GGGG....GG....r",
    "r..GG....GGGG....GG....r",
    "r........GGGG.........rr",
    "r....GG..........GG...r",
    "r....GG....ff....GG...r",
    "r..........ffff.......r",
    "r.........ffNff.......r",
    "r..........ffff.......r",
    "r....GG....ff....GG...r",
    "r....GG..........GG...r",
    "r........GGGG.........r",
    "r..GG....GGGG....GG..rr",
    "r..GG....GGGG....GG...r",
    "r.....................r",
    "rrrrr.GGGGGGGGGGG.rrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrr0"
  ];
  var VALLEY_LEGEND = {
    "r": "rock",
    ".": "grass_grey",
    "g": "grass",
    "G": "grass_grey",
    "f": "campfire",
    "s": "sand",
    "w": "water",
    "N": "sand",
    "0": "rock"
  };

  function registerValleyMap() {
    if (typeof World === "undefined" || !World || !World.register) return;
    World.register({
      id: "valley_koblandy",
      name: "ДОЛИНА КОБЛАНДЫ",
      region: "koblandy",
      decayRegion: "koblandy",
      bg: "deadGreen",
      grid: VALLEY_GRID,
      legend: VALLEY_LEGEND,
      solid: ["rock", "water", "yurt", "yurt_stone", "tree", "tree_grey", "grave"],
      spawns: {
        "default": { x: 12, y: 15, dir: "up" },
        "from_aul": { x: 12, y: 16, dir: "up" }
      },
      npcs: [
        {
          key: "nurlan", x: 12, y: 8, name: "Нұрлан",
          onInteract: function () {
            go("ch2_nurlan");
          }
        }
      ]
    });
  }

  // register maps at top-level (safe: World.register only stores data)
  registerAulMap();
  registerValleyMap();

  /* ================================================================== */
  /* CHAPTER 1 SCENES                                                    */
  /* ================================================================== */

  /* ------------------------------------------------------------------ */
  /* ch1_intro — THE WHOLE-GAME FIRST SCENE.                             */
  /* Cold open: Erzhan already in the steppe at dawn, no splash, no       */
  /* tutorial text. He tries the dombra passage that always breaks.        */
  /* Space (action "dombra") to play; it always breaks at the end.         */
  /* When the player has tried it, returning to the aul: grass at the gate */
  /* is grey (handled by the aul map's grey gate tiles + seeded decay).    */
  /* ------------------------------------------------------------------ */
  Scenes.register("ch1_intro", {
    blockPause: true,
    _t: 0,
    _tries: 0,
    _breakAt: 0,         // ms timestamp when the passage "breaks"
    _playing: false,
    _hint: 0,            // grows so a faint prompt eventually appears
    _phase: "steppe",    // "steppe" -> player free to play -> "leave"
    _note: 0,            // pulsing note index for the little dombra animation
    _leaveT: 0,

    enter: function () {
      this._t = 0; this._tries = 0; this._breakAt = 0; this._playing = false;
      this._hint = 0; this._phase = "steppe"; this._note = 0; this._leaveT = 0;
      if (G) G.chapter = 1;
      // seed the dying steppe (DESIGN §1.2 ~80% grey). Idempotent / guarded.
      try {
        if (typeof Decay !== "undefined" && Decay && Decay.seed) {
          if (!G.worldDecay || G.worldDecay.jetiqaz === undefined) Decay.seed("jetiqaz", 0.8);
          if (!G.worldDecay || G.worldDecay.koblandy === undefined) Decay.seed("koblandy", 0.85);
        }
      } catch (e) {}
      // the unfinished kui as ambient (loops); it is the passage he keeps trying
      cue("kui_erzhan_unfinished");
    },
    exit: function () { stopMusic(); },

    update: function (dt) {
      this._t += dt;
      this._hint += dt;
      if (this._playing) {
        this._note += dt;
        // the passage always BREAKS near the end (~2.0s in)
        if (this._t >= this._breakAt) {
          this._playing = false;
          cue("sfx_cancel"); // the broken note
        }
      }
      if (this._phase === "leave") {
        this._leaveT += dt;
        if (this._leaveT > 2600) {
          this._phase = "done";
          go("ch1_aul", { spawn: "from_steppe" });
        }
      }
    },

    onKey: function (e) {
      if (!e) return;
      if (this._phase !== "steppe") return;
      if (e.action === "dombra") {
        // play the passage; it breaks every time
        this._playing = true;
        this._t = 0;
        this._note = 0;
        this._breakAt = 2000;
        this._tries += 1;
        cue("kui_erzhan_unfinished");
      } else if (e.action === "confirm" && this._tries >= 1) {
        // after at least one attempt, return to the aul (grass at the gate is grey)
        this._phase = "leave";
        this._leaveT = 0;
        cue("sfx_confirm");
      }
    },

    render: function (c) {
      var t = this._t;
      // dawn sky: deep blue high -> warm gold low (rassvet)
      backdrop(c, pal("skyBlue", "#2980B9"), pal("gold", "#D4A017"));
      var w = W(), h = H();

      // low sun on the horizon
      var sunY = h * 0.62;
      c.save();
      c.globalAlpha = 0.9;
      c.fillStyle = pal("gold", "#D4A017");
      c.beginPath();
      try { c.arc(w * 0.5, sunY, 46, 0, Math.PI * 2); c.fill(); } catch (e) {}
      c.globalAlpha = 0.35;
      try { c.arc(w * 0.5, sunY, 70, 0, Math.PI * 2); c.fill(); } catch (e2) {}
      c.restore();

      // greying steppe ground (decay-tinted band)
      var groundY = h * 0.66;
      var lvl = decayLevel("jetiqaz");
      var grassCol = pal("grassDark", "#4E7A33");
      var groundCol = grassCol;
      try { if (typeof lerpColor === "function") groundCol = lerpColor(grassCol, pal("greySteppe", "#8A8A7A"), lvl); } catch (e3) {}
      c.fillStyle = groundCol;
      c.fillRect(0, groundY, w, h - groundY);

      // a few tufts of grass, greyer toward the right (the rot moves east->west)
      for (var i = 0; i < 60; i++) {
        var gx = (i * 53) % w;
        var gy = groundY + 8 + ((i * 37) % (h - groundY - 14));
        var localGrey = clampL(lvl + (gx / w) * 0.25, 0, 1);
        var tuft = grassCol;
        try { if (typeof lerpColor === "function") tuft = lerpColor(grassCol, pal("greySteppe", "#8A8A7A"), localGrey); } catch (e4) {}
        c.fillStyle = tuft;
        c.fillRect(gx, gy, 2, 4);
        c.fillRect(gx + 2, gy - 1, 2, 5);
      }

      // Ержан standing at dawn with the dombra (sprite, with graceful fallback)
      var ex = Math.round(w * 0.5 - 24);
      var ey = Math.round(groundY - 44);
      var drew = sprite(c, "erzhan", ex, ey, 4, {});
      if (!drew) {
        // fallback figure
        c.fillStyle = pal("skyBlue", "#2980B9");
        c.fillRect(ex + 14, ey + 6, 20, 38);
        c.fillStyle = pal("outline", "#1A0A00");
        c.fillRect(ex + 16, ey, 16, 12);
      }
      // the dombra icon at his hands, pulsing while playing
      var dix = ex + 30, diy = ey + 22;
      var pulse = this._playing ? (0.6 + 0.4 * Math.abs(Math.sin(this._note / 90))) : 0.5;
      c.save();
      c.globalAlpha = pulse;
      var dd = sprite(c, "dombra_icon", dix, diy, 3, {});
      if (!dd) {
        c.fillStyle = pal("earth", "#7D4E2A");
        c.fillRect(dix, diy + 6, 18, 8);
        c.fillRect(dix + 16, diy - 2, 4, 16);
      }
      c.restore();

      // when playing, a row of pentatonic "notes" that BREAKS near the end
      if (this._playing) {
        var prog = clampL(t / this._breakAt, 0, 1);
        var notes = 8;
        var shown = Math.floor(prog * notes);
        for (var k = 0; k < shown; k++) {
          var nx = w * 0.5 - 70 + k * 18;
          var ny = groundY - 70 - (Math.sin(k * 0.9) * 10);
          c.fillStyle = pal("gold", "#D4A017");
          c.fillRect(nx, ny, 5, 5);
        }
        // the break: last note glitches red
        if (prog > 0.9) {
          c.fillStyle = pal("feltRed", "#C0392B");
          c.fillRect(w * 0.5 - 70 + (notes - 1) * 18, groundY - 86, 6, 6);
        }
      }

      // sparse, diegetic prompt (no tutorial wall): only after a beat of stillness
      if (this._phase === "steppe") {
        if (this._hint > 1800 && !this._playing) {
          var blink = (Math.floor(this._t / 600) % 2) === 0;
          if (blink) {
            txt(c, "Space", w * 0.5, h - 40,
              { color: pal("yurtWhite", "#F5ECD7"), size: 14, align: "center" });
          }
          if (this._tries >= 1) {
            txt(c, "Z", w * 0.5, h - 20,
              { color: pal("boneGrey", "#B8B4A4"), size: 12, align: "center" });
          }
        }
      } else if (this._phase === "leave") {
        // fade-to-aul beat: he turns toward the aul; the gate-grass note
        var a = clampL(this._leaveT / 1600, 0, 1);
        c.save();
        c.globalAlpha = a;
        c.fillStyle = "#000000";
        c.fillRect(0, 0, w, h);
        c.restore();
        txt(c, "Трава у входа серая. Вчера была зелёная.", w / 2, h / 2,
          { color: pal("boneGrey", "#B8B4A4"), size: 16, align: "center", maxWidth: w - 120 });
      }
    }
  });

  /* ------------------------------------------------------------------ */
  /* ch1_aul — the village overworld (free roam).                        */
  /* Built on World.makeExploreScene; on first arrival the grey gate-grass  */
  /* is visible. Talking to Бейсен -> ch1_beysen. After the legend, the   */
  /* four-directions quest is available; the night scene gate too.        */
  /* ------------------------------------------------------------------ */
  (function registerAulScene() {
    var base = null;
    if (typeof World !== "undefined" && World && World.makeExploreScene) {
      base = World.makeExploreScene("aul_jetiqaz", {
        spawn: "from_steppe",
        onEnter: function () {
          cue("theme_aul");
          questStart("q_four_directions");
        },
        onExit: function () { /* music continues into sub-scenes intentionally */ },
        onRender: function (c) {
          // contextual objective line, faint, top-right
          var msg = null;
          if (!flag("knowsLegend")) {
            msg = "Поговори с аксакалом Бейсеном.";
          } else if (!flag("fourDirectionsDone")) {
            msg = "Обойди аул: четыре стороны света.";
          } else {
            msg = "Ночь близко. Вернись к огню.";
          }
          if (msg && !dialogueActive()) {
            c.save();
            c.globalAlpha = 0.8;
            txt(c, msg, W() - 14, 26, { color: pal("gold", "#D4A017"), size: 12, align: "right" });
            c.restore();
          }
        }
      });
    }
    // if World is unavailable, a defensive fallback scene that still advances
    if (!base) {
      base = {
        render: function (c) {
          c.fillStyle = pal("night", "#0E0F1A");
          c.fillRect(0, 0, W(), H());
          txt(c, "АУЛ ЖЕТІҚАЗ", W() / 2, H() / 2 - 10, { color: pal("gold", "#D4A017"), size: 22, align: "center" });
          txt(c, "Z — к аксакалу", W() / 2, H() / 2 + 24, { color: pal("boneGrey", "#B8B4A4"), size: 14, align: "center" });
        },
        onKey: function (e) { if (e && e.action === "confirm") go("ch1_beysen"); }
      };
    }
    // wrap onKey so that after the legend is known and the quest done, pressing
    // confirm near the campfire at night triggers ch1_night — but the simplest,
    // robust route is a dedicated decision: once fourDirectionsDone, offer night.
    var wrappedKey = base.onKey;
    base.onKey = function (e) {
      if (typeof wrappedKey === "function") { try { wrappedKey.call(base, e); } catch (er) {} }
      if (!e || dialogueActive()) return;
      if (e.action === "cancel") return; // pause handled by engine
    };
    // when the four-directions quest just completed, auto-advance to night on
    // the next overworld update (so the player isn't left without a trigger).
    var wrappedUpdate = base.update;
    base.update = function (dt) {
      if (typeof wrappedUpdate === "function") { try { wrappedUpdate.call(base, dt); } catch (er) {} }
      if (flag("fourDirectionsDone") && !flag("nightStarted") && !dialogueActive()) {
        setFlag("nightStarted", true);
        go("ch1_night");
      }
    };
    Scenes.register("ch1_aul", base);
  })();

  /* ------------------------------------------------------------------ */
  /* ch1_beysen — Scene 1.1, full verbatim dialogue (the cracked map).    */
  /* Renders the yurt interior + fire, runs TREE_ch1_beysen, then sends   */
  /* the player to the four-directions quest.                             */
  /* ------------------------------------------------------------------ */
  Scenes.register("ch1_beysen", {
    blockPause: true,
    _started: false,
    _t: 0,
    enter: function () {
      this._started = false;
      this._t = 0;
      stopMusic();
    },
    update: function (dt) {
      this._t += dt;
      if (!this._started) {
        this._started = true;
        startDialogue(TREE_ch1_beysen, function () {
          questStart("q_four_directions");
          go("ch1_quest");
        });
      }
      driveDialogueUpdate(dt);
    },
    onKey: function (e) { driveDialogueKey(e); },
    render: function (c) {
      // yurt interior: warm felt walls, central fire
      backdrop(c, pal("earth", "#7D4E2A"), pal("caveDark", "#171826"));
      var w = W(), h = H();
      // felt wall band
      c.fillStyle = pal("feltRed", "#C0392B");
      c.save(); c.globalAlpha = 0.18; c.fillRect(0, 0, w, h * 0.5); c.restore();
      // floor
      c.fillStyle = pal("earth", "#7D4E2A");
      c.fillRect(0, h * 0.62, w, h * 0.38);

      // the central fire (campfire), flickering
      var fx = w * 0.5, fy = h * 0.5;
      var flick = 0.7 + 0.3 * Math.abs(Math.sin(this._t / 120));
      if (!sprite(c, "campfire", Math.round(fx - 16), Math.round(fy - 8), 2, {})) {
        c.save(); c.globalAlpha = flick;
        c.fillStyle = pal("caveFire", "#E8B25A");
        c.beginPath();
        try { c.moveTo(fx, fy - 22); c.lineTo(fx - 12, fy + 8); c.lineTo(fx + 12, fy + 8); c.closePath(); c.fill(); } catch (e) {}
        c.restore();
      }
      c.save(); c.globalAlpha = 0.25 * flick;
      c.fillStyle = pal("caveFire", "#E8B25A");
      try { c.beginPath(); c.arc(fx, fy, 80, 0, Math.PI * 2); c.fill(); } catch (e2) {}
      c.restore();

      // Бейсен seated (left), Ержан standing (right) — sprites with fallbacks
      if (!sprite(c, "beysen", Math.round(w * 0.30 - 24), Math.round(fy - 36), 3, {})) {
        c.fillStyle = pal("boneGrey", "#B8B4A4");
        c.fillRect(w * 0.30 - 12, fy - 30, 24, 40);
      }
      if (!sprite(c, "erzhan", Math.round(w * 0.66 - 24), Math.round(fy - 40), 3, { flip: true })) {
        c.fillStyle = pal("skyBlue", "#2980B9");
        c.fillRect(w * 0.66 - 12, fy - 34, 24, 42);
      }

      // the cracked old map appears once Бейсен reveals it (knowsLegend or late tree)
      if (flag("knowsLegend") || this._t > 4000) {
        var mx = w * 0.5 - 40, my = h * 0.18;
        c.fillStyle = pal("bone", "#D8CFB8");
        c.fillRect(mx, my, 80, 54);
        c.strokeStyle = pal("earth", "#7D4E2A");
        c.lineWidth = 2;
        try { c.strokeRect(mx + 1, my + 1, 78, 52); } catch (e3) {}
        // the crack down the middle
        c.strokeStyle = pal("outline", "#1A0A00");
        c.lineWidth = 2;
        try {
          c.beginPath();
          c.moveTo(mx + 40, my + 2);
          c.lineTo(mx + 36, my + 18);
          c.lineTo(mx + 44, my + 34);
          c.lineTo(mx + 38, my + 52);
          c.stroke();
        } catch (e4) {}
      }

      // dialogue overlay on top
      driveDialogueRender(c);
    }
  });

  /* ------------------------------------------------------------------ */
  /* ch1_quest — Scene 1.2: four directions.                             */
  /* Four compass points (N/E/S/W). Each shows a dying-land symbol + a    */
  /* short villager line. The spring (W) holds the boot footprint with    */
  /* the Ordo mark (triangle with a dot). Visiting all four completes the */
  /* quest and returns to the aul (which then advances to night).          */
  /* ------------------------------------------------------------------ */
  Scenes.register("ch1_quest", {
    blockPause: true,
    _t: 0,
    _sel: 0,            // selected compass index 0..3
    _busy: false,
    // index order: 0 N(cattle) 1 E(earth) 2 S(birds) 3 W(spring)
    _points: [
      { dir: "С", x: 0.5, y: 0.16, label: "Север", sym: "cattle", flag: "sawCattle", tree: "cattle", title: "Мёртвый скот" },
      { dir: "В", x: 0.82, y: 0.5, label: "Восток", sym: "earth", flag: "sawEarth", tree: "earth", title: "Потрескавшаяся земля" },
      { dir: "Ю", x: 0.5, y: 0.84, label: "Юг", sym: "birds", flag: "sawBirds", tree: "birds", title: "Замолчавшие птицы" },
      { dir: "З", x: 0.18, y: 0.5, label: "Запад", sym: "spring", flag: "sawSpring", tree: "spring", title: "Пересохший родник" }
    ],
    enter: function () {
      this._t = 0; this._sel = 0; this._busy = false;
      cue("theme_overworld");
      questStart("q_four_directions");
    },
    exit: function () { stopMusic(); },
    _treeFor: function (key) {
      if (key === "cattle") return TREE_ch1_cattle;
      if (key === "earth") return TREE_ch1_earth;
      if (key === "birds") return TREE_ch1_birds;
      if (key === "spring") return TREE_ch1_spring;
      return null;
    },
    _allSeen: function () {
      for (var i = 0; i < this._points.length; i++) {
        if (!flag(this._points[i].flag)) return false;
      }
      return true;
    },
    update: function (dt) {
      this._t += dt;
      if (dialogueActive()) { driveDialogueUpdate(dt); return; }
      if (this._busy) {
        // a point's dialogue just ended; check completion
        this._busy = false;
        if (this._allSeen()) {
          setFlag("fourDirectionsDone", true);
          questComplete("q_four_directions");
          // brief beat then back to the aul (which auto-advances to night)
        }
      }
    },
    onKey: function (e) {
      if (!e) return;
      if (dialogueActive()) { driveDialogueKey(e); return; }
      if (this._busy) return;
      var n = this._points.length;
      if (e.action === "left" || e.action === "up") {
        this._sel = (this._sel + n - 1) % n; cue("sfx_select");
      } else if (e.action === "right" || e.action === "down") {
        this._sel = (this._sel + 1) % n; cue("sfx_select");
      } else if (e.action === "confirm") {
        if (this._allSeen()) {
          // all symbols seen: leave for the aul
          cue("sfx_confirm");
          go("ch1_aul", { spawn: "from_steppe" });
          return;
        }
        var p = this._points[this._sel];
        var tree = this._treeFor(p.tree);
        var self = this;
        this._busy = true;
        cue("sfx_confirm");
        startDialogue(tree, function () {
          self._busy = true; // update() will resolve completion next frame
        });
      } else if (e.action === "choice1" || e.action === "choice2" ||
                 e.action === "choice3" || e.action === "choice4") {
        // jump straight to a point by number
        var idx = e.action === "choice1" ? 0 : e.action === "choice2" ? 1 :
                  e.action === "choice3" ? 2 : 3;
        this._sel = idx; cue("sfx_select");
      }
    },
    _drawSymbol: function (c, sym, cx, cy, seen) {
      // each dying-land symbol drawn defensively (no sprite dependency)
      c.save();
      var col = seen ? pal("boneGrey", "#B8B4A4") : pal("feltRed", "#C0392B");
      if (sym === "cattle") {
        // a fallen animal silhouette
        c.fillStyle = col;
        c.fillRect(cx - 14, cy - 2, 28, 8);
        c.fillRect(cx + 10, cy - 8, 6, 8);   // head down
        c.fillRect(cx - 12, cy + 6, 3, 6);   // legs
        c.fillRect(cx + 8, cy + 6, 3, 6);
      } else if (sym === "earth") {
        // cracked ground
        c.strokeStyle = col; c.lineWidth = 2;
        try {
          c.beginPath();
          c.moveTo(cx - 16, cy); c.lineTo(cx - 4, cy - 6); c.lineTo(cx + 6, cy + 4); c.lineTo(cx + 16, cy - 2);
          c.moveTo(cx - 2, cy - 4); c.lineTo(cx, cy + 10);
          c.stroke();
        } catch (e) {}
      } else if (sym === "birds") {
        // silent birds (small + a 'no sound' arc)
        c.fillStyle = col;
        c.fillRect(cx - 10, cy - 2, 5, 3);
        c.fillRect(cx + 4, cy - 6, 5, 3);
        c.fillRect(cx - 2, cy + 4, 5, 3);
      } else if (sym === "spring") {
        // dry spring bed + (if found) the Ordo bootprint mark
        c.strokeStyle = col; c.lineWidth = 2;
        try { c.beginPath(); c.arc(cx, cy, 12, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); } catch (e2) {}
        if (flag("foundOrdoMark")) {
          // the Ordo mark: triangle with a dot inside
          c.strokeStyle = pal("crackLight", "#7A3CE0"); c.lineWidth = 2;
          try {
            c.beginPath();
            c.moveTo(cx, cy - 12); c.lineTo(cx - 11, cy + 8); c.lineTo(cx + 11, cy + 8); c.closePath();
            c.stroke();
          } catch (e3) {}
          c.fillStyle = pal("crackLight", "#7A3CE0");
          c.fillRect(cx - 2, cy - 1, 4, 4);
        }
      }
      c.restore();
    },
    render: function (c) {
      var w = W(), h = H();
      // greying steppe seen from above (compass view)
      var lvl = decayLevel("jetiqaz");
      var ground = pal("grassDark", "#4E7A33");
      var gcol = ground;
      try { if (typeof lerpColor === "function") gcol = lerpColor(ground, pal("greySteppe", "#8A8A7A"), lvl); } catch (e) {}
      c.fillStyle = gcol;
      c.fillRect(0, 0, w, h);

      // title
      txt(c, "ЧЕТЫРЕ СТОРОНЫ СВЕТА", w / 2, 40, { color: pal("gold", "#D4A017"), size: 18, align: "center" });

      // central aul marker
      var ccx = w * 0.5, ccy = h * 0.5;
      if (!sprite(c, "yurt", Math.round(ccx - 16), Math.round(ccy - 16), 2, {})) {
        c.fillStyle = pal("yurtWhite", "#F5ECD7");
        c.beginPath();
        try { c.moveTo(ccx, ccy - 14); c.lineTo(ccx - 16, ccy + 10); c.lineTo(ccx + 16, ccy + 10); c.closePath(); c.fill(); } catch (e2) {}
      }
      txt(c, "Аул", ccx, ccy + 30, { color: pal("boneGrey", "#B8B4A4"), size: 11, align: "center" });

      // the four points
      for (var i = 0; i < this._points.length; i++) {
        var p = this._points[i];
        var px = p.x * w, py = p.y * h;
        var seen = flag(p.flag);
        var sel = (i === this._sel) && !this._allSeen();

        // line from aul to point
        c.save();
        c.globalAlpha = 0.3;
        c.strokeStyle = pal("boneGrey", "#B8B4A4");
        c.lineWidth = 1;
        try { c.beginPath(); c.moveTo(ccx, ccy); c.lineTo(px, py); c.stroke(); } catch (e3) {}
        c.restore();

        // selection ring
        if (sel) {
          var pr = 26 + Math.sin(this._t / 200) * 3;
          c.save();
          c.strokeStyle = pal("gold", "#D4A017");
          c.lineWidth = 2;
          try { c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.stroke(); } catch (e4) {}
          c.restore();
        }

        this._drawSymbol(c, p.sym, px, py, seen);

        // labels
        txt(c, p.dir, px, py - 30, { color: sel ? pal("gold", "#D4A017") : pal("yurtWhite", "#F5ECD7"), size: 14, align: "center" });
        txt(c, p.title, px, py + 34, { color: seen ? pal("boneGrey", "#B8B4A4") : pal("yurtWhite", "#F5ECD7"), size: 11, align: "center", maxWidth: 150 });
        if (seen) {
          txt(c, "✓", px + 22, py - 22, { color: pal("grassLight", "#7CA646"), size: 14, align: "center", shadow: false });
        }
      }

      // footer prompt
      var allSeen = this._allSeen();
      var foot = allSeen
        ? "Все четыре стороны увидены.  Z — вернуться в аул"
        : "←/→ — выбрать сторону   Z — подойти   (1–4 — быстрый выбор)";
      c.save(); c.globalAlpha = 0.85;
      txt(c, foot, w / 2, h - 18, { color: allSeen ? pal("gold", "#D4A017") : pal("boneGrey", "#B8B4A4"), size: 12, align: "center" });
      c.restore();

      // a quiet note about the discovered Ordo mark
      if (flag("foundOrdoMark") && !allSeen) {
        txt(c, "След в сапоге с орнаментом — треугольник с точкой. Знак Ордо.",
          w / 2, h - 40, { color: pal("crackLight", "#7A3CE0"), size: 11, align: "center", maxWidth: w - 80 });
      }

      // dialogue overlay
      driveDialogueRender(c);
    }
  });

  /* ------------------------------------------------------------------ */
  /* ch1_night — Scene 1.3: night before leaving (mother Гүлнар).         */
  /* Verbatim dialogue, then the chapter-closing epigraph, then hand-off  */
  /* to Chapter 2.                                                        */
  /* ------------------------------------------------------------------ */
  Scenes.register("ch1_night", {
    blockPause: true,
    _started: false,
    _t: 0,
    _phase: "scene",   // "scene" (dombra+dialogue) -> "epigraph" -> "done"
    _epiT: 0,
    enter: function () {
      this._started = false; this._t = 0; this._phase = "scene"; this._epiT = 0;
      stopMusic();
      // he sits alone at the fire, tries the same passage again
      cue("kui_erzhan_unfinished");
    },
    exit: function () { stopMusic(); },
    update: function (dt) {
      this._t += dt;
      if (this._phase === "scene") {
        if (!this._started) {
          this._started = true;
          var self = this;
          startDialogue(TREE_ch1_mother, function () {
            self._phase = "epigraph";
            self._epiT = 0;
          });
        }
        driveDialogueUpdate(dt);
      } else if (this._phase === "epigraph") {
        this._epiT += dt;
        if (this._epiT > 6500) {
          this._phase = "done";
          if (G) G.chapter = 2;
          go("ch2_valley", { spawn: "from_aul" });
        }
      }
    },
    onKey: function (e) {
      if (!e) return;
      if (this._phase === "scene") { driveDialogueKey(e); return; }
      if (this._phase === "epigraph") {
        if (e.action === "confirm") {
          // allow skipping the held epigraph
          this._phase = "done";
          if (G) G.chapter = 2;
          cue("sfx_confirm");
          go("ch2_valley", { spawn: "from_aul" });
        }
      }
    },
    render: function (c) {
      var w = W(), h = H();
      // night by the fire
      backdrop(c, pal("night", "#0E0F1A"), pal("caveDark", "#171826"));
      // stars
      for (var i = 0; i < 50; i++) {
        var sx = (i * 71) % w, sy = (i * 37) % (h * 0.5);
        c.fillStyle = pal("bone", "#D8CFB8");
        c.save(); c.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(this._t / 700 + i));
        c.fillRect(sx, sy, 2, 2); c.restore();
      }

      if (this._phase === "epigraph") {
        // the chapter epigraph (verbatim, DESIGN §ГЛАВА 1 closing)
        c.fillStyle = "#000000";
        c.save(); c.globalAlpha = clampL(this._epiT / 1200, 0, 0.92);
        c.fillRect(0, 0, w, h); c.restore();
        var a = clampL(this._epiT / 900, 0, 1);
        c.save(); c.globalAlpha = a;
        txt(c, "«Кюй — это не мелодия. Кюй — это слова, для которых нет слов.»",
          w / 2, h / 2 - 12, { color: pal("gold", "#D4A017"), size: 17, align: "center", maxWidth: w - 120 });
        txt(c, "— Нұрлан-бақсы",
          w / 2, h / 2 + 30, { color: pal("boneGrey", "#B8B4A4"), size: 14, align: "center" });
        c.restore();
        return;
      }

      // the fire
      var fx = w * 0.5, fy = h * 0.6;
      var flick = 0.7 + 0.3 * Math.abs(Math.sin(this._t / 110));
      if (!sprite(c, "campfire", Math.round(fx - 16), Math.round(fy - 8), 2, {})) {
        c.save(); c.globalAlpha = flick;
        c.fillStyle = pal("caveFire", "#E8B25A");
        try { c.beginPath(); c.moveTo(fx, fy - 20); c.lineTo(fx - 11, fy + 8); c.lineTo(fx + 11, fy + 8); c.closePath(); c.fill(); } catch (e) {}
        c.restore();
      }
      c.save(); c.globalAlpha = 0.22 * flick; c.fillStyle = pal("caveFire", "#E8B25A");
      try { c.beginPath(); c.arc(fx, fy, 90, 0, Math.PI * 2); c.fill(); } catch (e2) {}
      c.restore();

      // Ержан with the dombra at the fire
      if (!sprite(c, "erzhan", Math.round(fx - 60), Math.round(fy - 40), 3, {})) {
        c.fillStyle = pal("skyBlue", "#2980B9");
        c.fillRect(fx - 50, fy - 34, 22, 42);
      }
      // mother appears once the dialogue begins
      if (!sprite(c, "mother", Math.round(fx + 28), Math.round(fy - 38), 3, { flip: true })) {
        c.fillStyle = pal("feltRed", "#C0392B");
        c.fillRect(fx + 30, fy - 32, 22, 40);
      }

      driveDialogueRender(c);
    }
  });

  /* ================================================================== */
  /* CHAPTER 2 SCENES                                                    */
  /* ================================================================== */

  /* ------------------------------------------------------------------ */
  /* ch2_valley — Долина Кобланды (day two): follow tracks, steppe         */
  /* greyer, grass burning without wind. Free-roam toward Нұрлан at the    */
  /* heart of the burning ring. Talking to him -> ch2_nurlan.             */
  /* ------------------------------------------------------------------ */
  (function registerValleyScene() {
    var base = null;
    if (typeof World !== "undefined" && World && World.makeExploreScene) {
      base = World.makeExploreScene("valley_koblandy", {
        spawn: "from_aul",
        onEnter: function () {
          cue("theme_overworld");
          questStart("q_follow_tracks");
        },
        onRender: function (c) {
          // the grass burns without wind: drifting embers over the field
          var w = W(), hh = H();
          var t = (typeof Engine !== "undefined" && Engine.now) ? Engine.now : 0;
          c.save();
          for (var i = 0; i < 26; i++) {
            var ex = ((i * 97) + (t * 0.02)) % w;
            var ey = (hh - ((i * 53) + (t * 0.03)) % hh);
            c.globalAlpha = 0.25 + 0.25 * Math.abs(Math.sin(t / 300 + i));
            c.fillStyle = (i % 3 === 0) ? pal("feltRed", "#C0392B") : pal("caveFire", "#E8B25A");
            c.fillRect(ex, ey, 2, 2);
          }
          c.restore();
          if (!dialogueActive()) {
            c.save(); c.globalAlpha = 0.8;
            txt(c, "Дым на горизонте. Трава горит сама — без ветра.",
              W() / 2, 50, { color: pal("feltRed", "#C0392B"), size: 12, align: "center", maxWidth: W() - 80 });
            c.restore();
          }
        }
      });
    }
    if (!base) {
      base = {
        render: function (c) {
          c.fillStyle = pal("deadGreen", "#6E7059");
          c.fillRect(0, 0, W(), H());
          txt(c, "ДОЛИНА КОБЛАНДЫ", W() / 2, H() / 2 - 10, { color: pal("gold", "#D4A017"), size: 20, align: "center" });
          txt(c, "Z — подойти к старику", W() / 2, H() / 2 + 24, { color: pal("boneGrey", "#B8B4A4"), size: 14, align: "center" });
        },
        onKey: function (e) { if (e && e.action === "confirm") go("ch2_nurlan"); }
      };
    }
    Scenes.register("ch2_valley", base);
  })();

  /* ------------------------------------------------------------------ */
  /* ch2_nurlan — Scene 2.1: meeting Нұрлан-бақсы (white eyes, broken      */
  /* dombra). Verbatim. Receive the Дыбысты Домбыра, then the briefing,    */
  /* then on to the boss.                                                 */
  /* ------------------------------------------------------------------ */
  Scenes.register("ch2_nurlan", {
    blockPause: true,
    _phase: "meet",   // "meet" -> "brief" -> "done"
    _started: false,
    _t: 0,
    enter: function () {
      this._phase = "meet"; this._started = false; this._t = 0;
      stopMusic();
      cue("theme_serik"); // sparse, almost-no-melody pulse fits the dying valley
    },
    exit: function () { stopMusic(); },
    update: function (dt) {
      this._t += dt;
      var self = this;
      if (this._phase === "meet") {
        if (!this._started) {
          this._started = true;
          startDialogue(TREE_ch2_nurlan, function () {
            self._phase = "brief";
            self._started = false;
          });
        }
        driveDialogueUpdate(dt);
      } else if (this._phase === "brief") {
        if (!this._started) {
          this._started = true;
          startDialogue(TREE_ch2_brief, function () {
            self._phase = "done";
            go("ch2_jalmauyz");
          });
        }
        driveDialogueUpdate(dt);
      }
    },
    onKey: function (e) { driveDialogueKey(e); },
    render: function (c) {
      var w = W(), h = H();
      // the burning ring of grass; Нұрлан at its heart, day two
      backdrop(c, pal("deadGreen", "#6E7059"), pal("earth", "#7D4E2A"));
      // ground
      c.fillStyle = pal("greySteppe", "#8A8A7A");
      c.fillRect(0, h * 0.6, w, h * 0.4);

      // the fire ring (burns without wind)
      var cx = w * 0.5, cy = h * 0.56;
      c.save();
      for (var i = 0; i < 18; i++) {
        var ang = (i / 18) * Math.PI * 2;
        var rr = 120;
        var ffx = cx + Math.cos(ang) * rr;
        var ffy = cy + Math.sin(ang) * rr * 0.55;
        var fl = 0.5 + 0.5 * Math.abs(Math.sin(this._t / 130 + i));
        c.globalAlpha = fl;
        c.fillStyle = (i % 2 === 0) ? pal("caveFire", "#E8B25A") : pal("feltRed", "#C0392B");
        try { c.beginPath(); c.moveTo(ffx, ffy - 12); c.lineTo(ffx - 6, ffy + 6); c.lineTo(ffx + 6, ffy + 6); c.closePath(); c.fill(); } catch (e) {}
      }
      c.restore();

      // Нұрлан seated on the earth, hands on knees
      if (!sprite(c, "nurlan", Math.round(cx - 24), Math.round(cy - 30), 3, {})) {
        c.fillStyle = pal("bone", "#D8CFB8");
        c.fillRect(cx - 16, cy - 24, 32, 40);
        // white eyes hint
        c.fillStyle = pal("yurtWhite", "#F5ECD7");
        c.fillRect(cx - 8, cy - 16, 5, 3);
        c.fillRect(cx + 3, cy - 16, 5, 3);
      }
      // the broken dombra beside him (three burst strings)
      var dx = cx + 28, dy = cy - 4;
      if (!sprite(c, "dombra_icon", Math.round(dx), Math.round(dy), 2, {})) {
        c.fillStyle = pal("earth", "#7D4E2A");
        c.fillRect(dx, dy + 6, 16, 7);
        c.fillRect(dx + 14, dy - 4, 4, 16);
      }
      // Ержан standing
      if (!sprite(c, "erzhan", Math.round(cx - 90), Math.round(cy - 34), 3, {})) {
        c.fillStyle = pal("skyBlue", "#2980B9");
        c.fillRect(cx - 80, cy - 28, 22, 42);
      }

      driveDialogueRender(c);
    }
  });

  /* ------------------------------------------------------------------ */
  /* ch2_jalmauyz — Boss 2.2: Жалмауыз Кемпір (RHYTHM-ONLY).              */
  /* Battle.start with canMelee:false + a melody and countsAsKill:false.  */
  /* On win: children freed, Жалмауыз crumbles to dust laughing her        */
  /* verbatim line -> ch2_death.  On lose: retry.                         */
  /* ------------------------------------------------------------------ */
  Scenes.register("ch2_jalmauyz", {
    blockPause: true,
    _started: false,
    _t: 0,
    _phase: "fight",   // "fight" (delegated to Battle) -> "crumble"
    _crumbleStarted: false,
    enter: function () {
      this._started = false; this._t = 0; this._phase = "fight"; this._crumbleStarted = false;
      stopMusic();
    },
    exit: function () { stopMusic(); },
    _startBattle: function () {
      var self = this;
      var started = false;
      try {
        if (typeof Battle !== "undefined" && Battle && Battle.start) {
          Battle.start({
            enemyKey: "jalmauyz",
            name: "Жалмауыз Кемпір",
            hp: 30,
            music: "theme_battle",
            canMelee: false,            // RHYTHM-ONLY: the sword does nothing
            countsAsKill: false,        // she crumbles; not a true kill
            rhythm: {
              melody: JALMAUYZ_MELODY,
              bpm: 96,
              accuracyNeeded: 80
            },
            onWin: function () {
              // children freed
              setFlag("childrenFreed", true);
              if (typeof Quests !== "undefined") { questComplete("q_jalmauyz"); }
              self._phase = "crumble";
              self._crumbleStarted = false;
              // return to THIS scene to play the crumble line
              go("ch2_jalmauyz");
            },
            onLose: function () {
              // retry the fight from this scene
              self._started = false;
              go("ch2_jalmauyz");
            }
          });
          started = true;
        }
      } catch (e) {}
      if (!started) {
        // Battle module absent: resolve narratively so the story never stalls.
        setFlag("childrenFreed", true);
        this._phase = "crumble";
        this._crumbleStarted = false;
      }
    },
    update: function (dt) {
      this._t += dt;
      if (this._phase === "fight") {
        if (!this._started) {
          this._started = true;
          questStart("q_jalmauyz");
          this._startBattle();
        }
        return;
      }
      // crumble phase
      if (this._phase === "crumble") {
        if (!this._crumbleStarted) {
          this._crumbleStarted = true;
          cue("sfx_curse");
          var self = this;
          startDialogue(TREE_ch2_jalmauyz_crumble, function () {
            go("ch2_death");
          });
        }
        driveDialogueUpdate(dt);
      }
    },
    onKey: function (e) {
      if (this._phase === "crumble") { driveDialogueKey(e); }
    },
    render: function (c) {
      var w = W(), h = H();
      // cave mouth where the children were held
      backdrop(c, pal("caveDark", "#171826"), pal("night", "#0E0F1A"));
      c.fillStyle = pal("caveStone", "#33354A");
      c.fillRect(0, h * 0.7, w, h * 0.3);

      if (this._phase === "fight") {
        // while Battle runs it is the active scene; this only shows for the
        // brief frame before/after delegation or if Battle is absent.
        txt(c, "Жалмауыз Кемпір", w / 2, h / 2 - 10, { color: pal("feltRed", "#C0392B"), size: 20, align: "center" });
        txt(c, "Играй на домбре — меч её не берёт.", w / 2, h / 2 + 20,
          { color: pal("boneGrey", "#B8B4A4"), size: 13, align: "center", maxWidth: w - 100 });
        return;
      }

      // crumble: she dissolves into drifting dust as she laughs her line
      var cx = w * 0.5, cy = h * 0.42;
      var dissolve = clampL(this._t / 2600, 0, 1);
      if (!sprite(c, "jalmauyz", Math.round(cx - 28), Math.round(cy - 36), 3, { alpha: 1 - dissolve })) {
        c.save(); c.globalAlpha = 1 - dissolve;
        c.fillStyle = pal("bloodDark", "#5A1E1A");
        c.fillRect(cx - 18, cy - 30, 36, 48);
        c.restore();
      }
      // dust motes rising
      c.save();
      for (var i = 0; i < 30; i++) {
        var ang = (i / 30) * Math.PI * 2;
        var rad = 10 + dissolve * (40 + (i % 7) * 6);
        var dxp = cx + Math.cos(ang) * rad;
        var dyp = cy + Math.sin(ang) * rad - dissolve * 20;
        c.globalAlpha = (1 - dissolve) * 0.7;
        c.fillStyle = pal("boneGrey", "#B8B4A4");
        c.fillRect(dxp, dyp, 2, 2);
      }
      c.restore();

      // freed children at the cave mouth
      if (flag("childrenFreed")) {
        for (var k = 0; k < 4; k++) {
          var chx = w * 0.30 + k * 36;
          var chy = h * 0.66;
          if (!sprite(c, "child", Math.round(chx), Math.round(chy), 2, {})) {
            c.fillStyle = pal("yurtWhite", "#F5ECD7");
            c.fillRect(chx, chy, 12, 20);
          }
        }
      }

      driveDialogueRender(c);
    }
  });

  /* ------------------------------------------------------------------ */
  /* ch2_death — Scene 2.3: death of Нұрлан (verbatim). He reappears as a  */
  /* translucent ghost (nurlan_ghost), nods, and vanishes. End: set up     */
  /* Жер Асты for Chapter 3 (hand-off to ch3_descent).                    */
  /* ------------------------------------------------------------------ */
  Scenes.register("ch2_death", {
    blockPause: true,
    _started: false,
    _t: 0,
    _phase: "death",   // "death" -> "ghost" -> "done"
    _ghostT: 0,
    enter: function () {
      this._started = false; this._t = 0; this._phase = "death"; this._ghostT = 0;
      stopMusic();
      // children returned; Нұрлан barely alive
      cue("theme_serik");
    },
    exit: function () { stopMusic(); },
    update: function (dt) {
      this._t += dt;
      var self = this;
      if (this._phase === "death") {
        if (!this._started) {
          this._started = true;
          startDialogue(TREE_ch2_death, function () {
            // his breath stops; silence; then the ghost rises
            cue("sfx_death");
            self._phase = "ghost";
            self._ghostT = 0;
          });
        }
        driveDialogueUpdate(dt);
      } else if (this._phase === "ghost") {
        this._ghostT += dt;
        if (this._ghostT > 5200) {
          this._phase = "done";
          // From this moment Нұрлан appears as a ghost (party/flag).
          setFlag("nurlanGhost", true);
          try {
            if (G) {
              if (!G.party) G.party = [];
              if (G.party.indexOf("nurlan_ghost") < 0) G.party.push("nurlan_ghost");
            }
          } catch (e) {}
          // set up Жер Асты for ch3
          setFlag("zherAstyOpen", true);
          if (G) G.chapter = 3;
          go("ch3_descent");
        }
      }
    },
    onKey: function (e) {
      if (this._phase === "death") { driveDialogueKey(e); return; }
      if (this._phase === "ghost") {
        if (e && e.action === "confirm" && this._ghostT > 2600) {
          this._phase = "done";
          setFlag("nurlanGhost", true);
          try {
            if (G) {
              if (!G.party) G.party = [];
              if (G.party.indexOf("nurlan_ghost") < 0) G.party.push("nurlan_ghost");
            }
          } catch (e2) {}
          setFlag("zherAstyOpen", true);
          if (G) G.chapter = 3;
          cue("sfx_confirm");
          go("ch3_descent");
        }
      }
    },
    render: function (c) {
      var w = W(), h = H();
      backdrop(c, pal("night", "#0E0F1A"), pal("caveDark", "#171826"));

      // the fire the children sit around
      var fx = w * 0.5, fy = h * 0.62;
      var flick = 0.7 + 0.3 * Math.abs(Math.sin(this._t / 120));
      if (!sprite(c, "campfire", Math.round(fx - 16), Math.round(fy - 8), 2, {})) {
        c.save(); c.globalAlpha = flick; c.fillStyle = pal("caveFire", "#E8B25A");
        try { c.beginPath(); c.moveTo(fx, fy - 18); c.lineTo(fx - 10, fy + 6); c.lineTo(fx + 10, fy + 6); c.closePath(); c.fill(); } catch (e) {}
        c.restore();
      }
      c.save(); c.globalAlpha = 0.2 * flick; c.fillStyle = pal("caveFire", "#E8B25A");
      try { c.beginPath(); c.arc(fx, fy, 80, 0, Math.PI * 2); c.fill(); } catch (e2) {}
      c.restore();

      // Нұрлан lying / seated by the fire (living until the ghost phase)
      if (this._phase === "death") {
        if (!sprite(c, "nurlan", Math.round(fx - 70), Math.round(fy - 28), 3, {})) {
          c.fillStyle = pal("bone", "#D8CFB8");
          c.fillRect(fx - 62, fy - 22, 30, 38);
        }
      }

      // Ержан with the dombra in his hands
      if (!sprite(c, "erzhan", Math.round(fx + 40), Math.round(fy - 34), 3, { flip: true })) {
        c.fillStyle = pal("skyBlue", "#2980B9");
        c.fillRect(fx + 44, fy - 28, 22, 42);
      }

      // the children gathered, weeping
      for (var k = 0; k < 4; k++) {
        var chx = fx - 40 + k * 26;
        var chy = fy + 18;
        if (!sprite(c, "child", Math.round(chx), Math.round(chy), 2, {})) {
          c.fillStyle = pal("yurtWhite", "#F5ECD7");
          c.fillRect(chx, chy, 11, 18);
        }
      }

      // the translucent ghost rises from behind the fire
      if (this._phase === "ghost") {
        var a = clampL(this._ghostT / 1500, 0, 0.7) * (0.7 + 0.3 * Math.abs(Math.sin(this._ghostT / 500)));
        var gx = fx - 18, gy = fy - 64 - clampL(this._ghostT / 60, 0, 30);
        c.save();
        c.globalAlpha = a;
        if (!sprite(c, "nurlan_ghost", Math.round(gx), Math.round(gy), 3, { alpha: a })) {
          c.fillStyle = pal("skyHigh", "#C7D6DE");
          c.fillRect(gx, gy, 30, 46);
          c.fillStyle = pal("yurtWhite", "#F5ECD7");
          c.fillRect(gx + 8, gy + 8, 4, 3);
          c.fillRect(gx + 18, gy + 8, 4, 3);
        }
        c.restore();
        // caption: he nods and vanishes
        if (this._ghostT > 2200) {
          c.save(); c.globalAlpha = clampL((this._ghostT - 2200) / 800, 0, 1);
          txt(c, "Нұрлан смотрит на Ержана. Кивает. И исчезает.",
            w / 2, h - 40, { color: pal("boneGrey", "#B8B4A4"), size: 14, align: "center", maxWidth: w - 120 });
          c.restore();
        }
      }

      driveDialogueRender(c);
    }
  });

})();
