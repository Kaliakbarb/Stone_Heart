/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 83-ch7-8.js
   REGISTERS: ch7_* and ch8_* scenes (+ their World locations + Dialogue trees).
   Owns NO core namespace. Calls the documented APIs of World, Dialogue, Battle,
   Rhythm, Cutscene, Memory, Quests, Endings, Audio, Sprites, Scenes only.

   CONTENT (per DESIGN.md "ГЛАВА 7: ТАС ЖҮРЕК" + "ГЛАВА 8: ТАМАША"):
     CH7 — Тронный зал Тёмного Ордо. Огромная ободранная юрта, огонь, Серік
           один, Тас Жүрек у него на коленях. Армия трёх жузов стала у входа;
           Ержан идёт один.
       7.1 ch7_throne -> ch7_serik : the LONGEST dialogue in the game, no
            combat — tea, "ты сын Қайрата", the book of cracks (40 years ago
            first entry, 3 days ago last = 17 cracks), his reasoning, "когда
            придёт тот, кто знает незаконченный кюй". Choices set serikPath.
       7.2 ch7_shadow : the Тень — Ержан's own shadow, copies his attacks,
            verbatim taunts; defeated ONLY by playing the FULL 12-note kui
            (the climactic Rhythm minigame, canMelee:false, countsAsKill:false).
            On completion the Shadow dissolves INTO Ержан (accepted, not beaten);
            Нұрлан-ghost's final verbatim line, then vanishes forever.
     CH8 — three endings via Endings.resolve(); each is a Cutscene with verbatim
           text. ch8_ending_a (БАТЫР), ch8_ending_b (КҮЙШІ), ch8_ending_c
           (ХРАНИТЕЛЬ). New Game+ hook (ch8_newgameplus): Серік recognizes Ержан
           ("Ты снова пришёл. Значит, ещё не понял.") + the hidden 4th ending.
           Final returns to title.

   TOP-LEVEL SAFETY: only Scenes.register / World.register / Dialogue-tree
   literals here. No other module's runtime method runs at top-level — only
   inside scene/update/render/dialogue/cutscene callbacks. Every cross-module
   call is guarded so one absent sprite/audio/scene key never throws in-loop.
   ===================================================================== */

(function () {

  /* ------------------------------------------------------------------ */
  /* guarded helpers (this module assumes nothing about load timing)     */
  /* ------------------------------------------------------------------ */
  function _W() { return (typeof Engine !== "undefined" && Engine.W) ? Engine.W : 800; }
  function _H() { return (typeof Engine !== "undefined" && Engine.H) ? Engine.H : 600; }

  function _pal(name, fb) {
    if (typeof PALETTE !== "undefined" && PALETTE && PALETTE[name]) return PALETTE[name];
    return fb || "#D4A017";
  }
  function _cue(name) {
    try { if (typeof Audio !== "undefined" && Audio && Audio.playCue) Audio.playCue(name); }
    catch (e) {}
  }
  function _stopMusic() {
    try { if (typeof Audio !== "undefined" && Audio && Audio.stopMusic) Audio.stopMusic(); }
    catch (e) {}
  }
  function _spr(c, key, x, y, scale, opts) {
    try {
      if (typeof Sprites !== "undefined" && Sprites && Sprites.draw) {
        Sprites.draw(c, key, x, y, scale, opts || {});
        return true;
      }
    } catch (e) {}
    return false;
  }
  function _sprHas(key) {
    try {
      if (typeof Sprites !== "undefined" && Sprites && Sprites.has) return !!Sprites.has(key);
    } catch (e) {}
    return false;
  }
  function _text(c, str, x, y, opts) {
    opts = opts || {};
    if (typeof drawText === "function") { try { drawText(c, str, x, y, opts); return; } catch (e) {} }
    c.save();
    c.font = opts.font || ('700 ' + (opts.size || 16) + 'px "Courier New", monospace');
    c.textAlign = opts.align || "left";
    if (opts.shadow !== false) {
      c.fillStyle = opts.shadowColor || _pal("outline", "#1A0A00");
      c.fillText(String(str), x + 2, y + 2);
    }
    c.fillStyle = opts.color || _pal("yurtWhite", "#F5ECD7");
    c.fillText(String(str), x, y);
    c.restore();
  }
  function _cl(v, a, b) {
    if (typeof clamp === "function") return clamp(v, a, b);
    return v < a ? a : (v > b ? b : v);
  }
  function _rint(n) { return (typeof rint === "function") ? rint(n) : (n | 0); }
  function _pressed(a) {
    try { if (typeof Input !== "undefined" && Input && Input.pressed) return !!Input.pressed(a); }
    catch (e) {}
    return false;
  }
  function _setScene(id, params) {
    if (typeof setScene === "function") { try { setScene(id, params || {}); } catch (e) {} }
  }
  function _registerScene(id, obj) {
    if (typeof Scenes !== "undefined" && Scenes && Scenes.register) {
      try { Scenes.register(id, obj); } catch (e) {}
    }
  }
  function _registerMap(loc) {
    if (typeof World !== "undefined" && World && World.register) {
      try { World.register(loc); } catch (e) {}
    }
  }
  function _hasFlag(name) {
    try { return !!(G && G.flags && G.flags[name]); } catch (e) { return false; }
  }
  function _isNewGamePlus() {
    /* NG+ is flagged when the player reaches the throne having already finished
       a run once. We persist it on G.flags.completedOnce (set by the endings). */
    try { return !!(G && G.flags && G.flags.completedOnce === true); } catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ */
  /* the FULL 12-note kui melody for the Shadow fight + ending B         */
  /* 8 father-notes (learned through the game) + 4 Ержан additions.      */
  /* lanes 0..3 across the 4 dombra strings; t in ms. Pentatonic feel.   */
  /* ------------------------------------------------------------------ */
  var KUI_FULL_12 = [
    // — the unfinished passage / 8 notes from the father (Жер Асты) —
    { lane: 0, t: 0 },
    { lane: 2, t: 520 },
    { lane: 1, t: 1040 },
    { lane: 3, t: 1560 },
    { lane: 2, t: 2080 },
    { lane: 0, t: 2600 },
    { lane: 3, t: 3120 },
    { lane: 1, t: 3640 },
    // — the 4 notes Ержан adds himself; here, at last, the kui completes —
    { lane: 2, t: 4220 },
    { lane: 3, t: 4760 },
    { lane: 1, t: 5300 },
    { lane: 0, t: 5860 }
  ];

  /* ================================================================== */
  /* MAP — the throne hall: a huge, threadbare yurt (~24x16)            */
  /* ================================================================== */
  /* Legend:  s = yurt_stone wall   . = cave_floor   f = campfire
              g = grave (army gear at the door, impassable barricade)
              e = exit tile that hands the player to ch7_serik           */
  _registerMap({
    id: "ordo_throne",
    name: "ТЁМНЫЙ ОРДО",
    region: "ordo",
    decayRegion: "ordo",
    w: 24, h: 16,
    bg: "night",
    music: "theme_serik",
    grid: [
      "ssssssssssssssssssssssss",
      "s......................s",
      "s......................s",
      "s.......sssssss........s",
      "s.......s.....s........s",
      "s.......s..f..s........s",
      "s.......s.....s........s",
      "s.......s..e..s........s",
      "s.......sss.sss........s",
      "s......................s",
      "s......................s",
      "s..gggg..........gggg..s",
      "s..gggg..........gggg..s",
      "s......................s",
      "s......................s",
      "ssssssssssssssssssssssss"
    ],
    legend: {
      "s": "yurt_stone",
      ".": "cave_floor",
      "f": "campfire",
      "g": "grave",
      "e": "cave_floor"
    },
    solid: ["yurt_stone", "grave", "campfire", "water", "rock"],
    spawns: {
      "default": { x: 11, y: 14, dir: "up" },
      "from_labyrinth": { x: 11, y: 14, dir: "up" }
    },
    npcs: [
      {
        key: "serik", x: 11, y: 5, name: "Серік", dir: "down",
        onInteract: function () { _setScene("ch7_serik"); }
      }
    ],
    /* walking up to the fire (the 'e' tile, just below Серік) begins 7.1 too */
    exits: [
      { x: 11, y: 7, onEnter: function () { _setScene("ch7_serik"); } }
    ]
  });

  /* ================================================================== */
  /* CH7 SCENE 7.0 — ch7_throne : the approach across the great yurt     */
  /* The army stops at the entrance; Ержан walks in alone. A short        */
  /* framing caption, then free-roam to the fire (or auto-trigger 7.1).   */
  /* ================================================================== */
  _registerScene("ch7_throne", (function () {
    var explore = null;
    var introT = 0;
    var INTRO_MS = 5200;
    var introDone = false;
    var captions = [
      "Ордо внутри — не крепость. Это огромная юрта. Старая, ободранная.",
      "В центре — огонь. У огня — Серік. Один. Без охраны.",
      "Тас Жүрек лежит у него на коленях — тускло светящийся камень с трещинами.",
      "Армия трёх жузов остановилась у входа. Ержан идёт один."
    ];

    function ensureExplore() {
      if (!explore && typeof World !== "undefined" && World && World.makeExploreScene) {
        try { explore = World.makeExploreScene("ordo_throne", { spawn: "default" }); }
        catch (e) { explore = null; }
      }
      return explore;
    }

    return {
      blockPause: false,
      enter: function (params) {
        if (G) { G.chapter = 7; }
        introT = 0;
        introDone = false;
        ensureExplore();
        if (explore && typeof explore.enter === "function") {
          try { explore.enter(params || {}); } catch (e) {}
        }
        _stopMusic();
        _cue("theme_serik");
      },
      exit: function () {
        if (explore && typeof explore.exit === "function") { try { explore.exit(); } catch (e) {} }
      },
      update: function (dt) {
        if (!introDone) {
          introT += dt;
          if (introT >= INTRO_MS || _pressed("confirm") || _pressed("cancel")) {
            introDone = true;
          }
          return; // freeze the world while the framing plays
        }
        if (explore && typeof explore.update === "function") {
          try { explore.update(dt); } catch (e) {}
        }
      },
      render: function (c) {
        // draw the world underneath
        if (explore && typeof explore.render === "function") {
          try { explore.render(c); } catch (e) {}
        } else {
          c.fillStyle = _pal("night", "#0E0F1A");
          c.fillRect(0, 0, _W(), _H());
        }
        if (!introDone) {
          // cinematic letterbox + rolling caption
          c.fillStyle = "rgba(6,6,10,0.72)";
          c.fillRect(0, 0, _W(), _H());
          c.fillStyle = "#000";
          c.fillRect(0, 0, _W(), 70);
          c.fillRect(0, _H() - 90, _W(), 90);
          _text(c, "ТАС ЖҮРЕК · КАМЕННОЕ СЕРДЦЕ", _W() / 2, 44,
            { color: _pal("gold", "#D4A017"), size: 20, align: "center" });
          var idx = _cl(Math.floor(introT / (INTRO_MS / captions.length)), 0, captions.length - 1);
          _text(c, captions[idx], _W() / 2, _H() / 2,
            { color: _pal("yurtWhite", "#F5ECD7"), size: 17, align: "center", maxWidth: _W() - 120 });
          _text(c, "Z — дальше", _W() / 2, _H() - 32,
            { color: _pal("boneGrey", "#B8B4A4"), size: 13, align: "center" });
        }
      },
      onKey: function (e) {
        if (!e) return;
        if (!introDone) {
          if (e.action === "confirm" || e.action === "cancel") { introDone = true; }
          return;
        }
        if (explore && typeof explore.onKey === "function") {
          try { explore.onKey(e); } catch (er) {}
        }
      },
      onClick: function (x, y) {
        if (!introDone) { introDone = true; return; }
        if (explore && typeof explore.onClick === "function") {
          try { explore.onClick(x, y); } catch (e) {}
        }
      }
    };
  })());

  /* ================================================================== */
  /* CH7 SCENE 7.1 — ch7_serik : the longest dialogue. Verbatim.         */
  /* Hosts a Dialogue tree, drawn over a quiet fire-lit throne backdrop.  */
  /* Choices accumulate serikPath (understand / accuse / music / kill).   */
  /* On completion -> ch7_shadow.                                         */
  /* ================================================================== */

  /* ---- standard (first-playthrough) Серік tree — DESIGN §7.1 verbatim ---- */
  var TREE_serik = {
    start: {
      speaker: "Серік", portrait: "serik", note: "не поднимает головы",
      text: "Садись. Чай будешь?", goto: "e_tea"
    },
    e_tea: {
      speaker: "Ержан", portrait: "erzhan", note: "пауза — игрок не ожидал этого",
      text: "...Буду.", goto: "s_pour"
    },
    s_pour: {
      speaker: "Серік", portrait: "serik",
      note: "наливает чай из маленького котла. Двигается медленно. Руки не дрожат",
      text: "Ты — сын Қайрата.", goto: "e_yes"
    },
    e_yes: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Да.", goto: "s_father"
    },
    s_father: {
      speaker: "Серік", portrait: "serik", note: "смотрит на огонь",
      text: "Он был хорошим человеком. Потом стал хорошим отцом. Это разные вещи, и не всем удаётся оба.",
      goto: "c_killed"
    },
    /* CHOICE 1 — how Ержан raises his father's death (sets the first lean) */
    c_killed: {
      speaker: "Ержан", portrait: "erzhan",
      text: "...",
      choices: [
        { label: "«Ты убил его.»", goto: "s_killed_answer",
          set: { serikPath: "accuse" } },
        { label: "«Что с ним стало?» [тихо, без обвинения]", goto: "s_killed_answer",
          set: { serikPath: "understand", talkedSoft: true } }
      ]
    },
    s_killed_answer: {
      speaker: "Серік", portrait: "serik", note: "прямо, без попытки оправдаться",
      text: "Нет. Я перестал его защищать. Это не одно и то же. Хотя результат одинаковый.",
      goto: "c_why"
    },
    /* CHOICE 2 — why did you take the stone */
    c_why: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Зачем ты взял Тас Жүрек?",
      goto: "s_why"
    },
    s_why: {
      speaker: "Серік", portrait: "serik",
      text: "Потому что он умирал. Я видел это сорок лет. Каждый год — новая трещина. Я записывал. Вот.",
      note: "достаёт старую книгу, пухлую",
      goto: "s_book1"
    },
    s_book1: {
      speaker: "Серік", portrait: "serik",
      text: "Посмотри на первую запись. Сорок лет назад. Потом на последнюю — три дня назад.",
      goto: "n_book",
      dombra: false
    },
    /* narration as Ержан opens the book — verbatim from §7.1 */
    n_book: {
      speaker: "", portrait: "",
      note: "Ержан открывает книгу",
      text: "Первая запись: маленькая трещина у северного края. Последняя: семнадцать трещин. Одна — через весь камень.",
      goto: "s_shards"
    },
    s_shards: {
      speaker: "Серік", portrait: "serik", note: "тихо",
      text: "Я собирал осколки. Склеивал. Они держатся. Но камень не может жить у меня. Он должен жить в степи. Я знал это. Но степь не была готова принять его обратно.",
      goto: "c_ready"
    },
    /* CHOICE 3 — when would she be ready / the music lean */
    c_ready: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Когда она была бы готова?",
      choices: [
        { label: "[ждать ответа]", goto: "s_ready" },
        { label: "[взять домбру — сыграть незаконченный кюй]", goto: "s_ready",
          dombra: true, set: { serikPath: "music", playedForSerik: true } }
      ]
    },
    s_ready: {
      speaker: "Серік", portrait: "serik", note: "смотрит на домбру Ержана",
      text: "Когда придёт тот, кто знает незаконченный кюй.",
      goto: "c_waited"
    },
    /* CHOICE 4 — did you wait for me */
    c_waited: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Ты ждал меня?",
      choices: [
        { label: "«Ты ждал меня?»", goto: "s_waited",
          set: { serikPath: "understand" } },
        { label: "«Я пришёл забрать его. И уйти героем.» [холодно]", goto: "s_waited_kill",
          set: { serikPath: "kill" } }
      ]
    },
    s_waited: {
      speaker: "Серік", portrait: "serik",
      text: "Я ждал сына Қайрата. Он начал кюй. Ты должен его закончить.",
      goto: "n_end"
    },
    s_waited_kill: {
      speaker: "Серік", portrait: "serik", note: "не отводит взгляда",
      text: "Я ждал сына Қайрата. Он начал кюй. Ты должен его закончить. Чем закончишь — решать тебе.",
      goto: "n_end"
    },
    /* terminal — proceed to the Shadow */
    n_end: {
      speaker: "", portrait: "",
      note: "огонь трещит; камень на коленях Серіка тускло пульсирует",
      text: "Серік замолкает. Из темноты у стены что-то отделяется и встаёт.",
      onEnd: function () { _setScene("ch7_shadow"); }
    }
  };

  /* ---- New Game+ variant — DESIGN §4.6 verbatim recognition line ---- */
  var TREE_serik_ngp = {
    start: {
      speaker: "Серік", portrait: "serik", note: "поднимает голову сразу",
      text: "Ты снова пришёл. Значит, ещё не понял.", goto: "e_ngp1"
    },
    e_ngp1: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Может быть. А может — наоборот.", goto: "s_ngp2"
    },
    s_ngp2: {
      speaker: "Серік", portrait: "serik", note: "усмехается краем рта",
      text: "Садись. Чай будешь? В этот раз — до конца.",
      goto: "c_ngp"
    },
    c_ngp: {
      speaker: "Серік", portrait: "serik",
      text: "Тас Жүрек нельзя украсть и нельзя хранить. Его можно только помнить. Ты это уже знаешь. Что выберешь теперь?",
      choices: [
        { label: "«Выйдем к степи вместе.» [скрытая концовка]", goto: "n_ngp_together",
          set: { serikPath: "understand", ngpTogether: true } },
        { label: "«Я закончу кюй.»", goto: "n_ngp_end",
          set: { serikPath: "music", playedForSerik: true } }
      ]
    },
    n_ngp_together: {
      speaker: "", portrait: "",
      note: "Серік медленно встаёт. Впервые за сорок лет он идёт не от степи — к ней",
      text: "Серік поднимается. Берёт камень в ладони. И кивает на выход — туда, где ждёт открытое небо.",
      onEnd: function () { _setScene("ch8_ending_d"); }
    },
    n_ngp_end: {
      speaker: "", portrait: "",
      note: "из темноты у стены отделяется тень",
      text: "Но прежде чем кюй прозвучит — встаёт твоя собственная тень.",
      onEnd: function () { _setScene("ch7_shadow"); }
    }
  };

  _registerScene("ch7_serik", (function () {
    var started = false;
    var firePhase = 0;

    function drawBackdrop(c) {
      var w = _W(), h = _H();
      // dark felt interior
      c.fillStyle = _pal("caveDark", "#171826");
      c.fillRect(0, 0, w, h);
      // soft radial fire glow at center
      var cx = w / 2, cy = h * 0.42;
      var g = c.createRadialGradient(cx, cy, 20, cx, cy, 320);
      g.addColorStop(0, "rgba(232,178,90,0.22)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Серік sprite + the stone, fire below
      var bob = Math.sin(firePhase / 380) * 2;
      if (_sprHas("serik")) {
        _spr(c, "serik", _rint(cx - 48), _rint(cy - 70 + bob), 6, {});
      } else {
        c.fillStyle = _pal("earth", "#7D4E2A");
        c.fillRect(_rint(cx - 30), _rint(cy - 60), 60, 90);
      }
      // the cracked stone on his knees (small glow)
      if (_sprHas("crack")) {
        _spr(c, "crack", _rint(cx - 16), _rint(cy + 10), 2, {});
      } else {
        c.fillStyle = _pal("crackLight", "#7A3CE0");
        c.globalAlpha = 0.7 + 0.3 * Math.sin(firePhase / 220);
        c.fillRect(_rint(cx - 12), _rint(cy + 12), 24, 16);
        c.globalAlpha = 1;
      }
      // campfire
      if (_sprHas("campfire")) {
        _spr(c, "campfire", _rint(cx - 16), _rint(cy + 60), 2, {});
      } else {
        c.fillStyle = _pal("caveFire", "#E8B25A");
        var fh = 18 + Math.sin(firePhase / 120) * 6;
        c.beginPath();
        c.moveTo(cx, cy + 60 - fh);
        c.lineTo(cx + 14, cy + 80);
        c.lineTo(cx - 14, cy + 80);
        c.closePath();
        c.fill();
      }
    }

    return {
      blockPause: true, // a cutscene-grade conversation; suppress pause
      enter: function () {
        started = false;
        firePhase = 0;
        _stopMusic();
        _cue("theme_serik");
      },
      exit: function () {
        // close the dialogue if we leave mid-tree (defensive)
        if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.active && Dialogue.close) {
          try { Dialogue.close(); } catch (e) {}
        }
      },
      update: function (dt) {
        firePhase += dt;
        if (!started) {
          started = true;
          var tree = _isNewGamePlus() ? TREE_serik_ngp : TREE_serik;
          if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.start) {
            try {
              Dialogue.start(tree, function () {
                /* tree's terminal onEnd already navigates; if somehow it did
                   not, fall through to the Shadow so the player isn't stuck. */
                var cur = (typeof Scenes !== "undefined") ? Scenes.currentId : null;
                if (cur === "ch7_serik") { _setScene("ch7_shadow"); }
              });
            } catch (e) {
              _setScene("ch7_shadow");
            }
          } else {
            _setScene("ch7_shadow");
          }
        }
        if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.active && Dialogue.update) {
          try { Dialogue.update(dt); } catch (e) {}
        }
      },
      render: function (c) {
        drawBackdrop(c);
        if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.active && Dialogue.render) {
          try { Dialogue.render(c); } catch (e) {}
        }
      },
      onKey: function (e) {
        if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.active && Dialogue.onKey) {
          try { Dialogue.onKey(e); } catch (er) {}
        }
      }
    };
  })());

  /* ================================================================== */
  /* CH7 SCENE 7.2 — ch7_shadow : the final boss, the Тень.              */
  /* Pre-fight verbatim taunt dialogue, then the rhythm-only Battle.     */
  /* The Shadow is defeated ONLY by playing the FULL 12-note kui. On win  */
  /* it dissolves INTO Ержан; Нұрлан-ghost's final line; then -> Ch8.    */
  /* ================================================================== */

  /* the pre-battle exchange — DESIGN §7.2 verbatim */
  var TREE_shadow_pre = {
    start: {
      speaker: "Тень", portrait: "shadow", note: "его голос, но холоднее",
      text: "Зачем ты слушаешь его? Он предал твоего отца. Он — враг. Убей его. Возьми камень. Стань героем, о котором будут помнить.",
      goto: "e1"
    },
    e1: {
      speaker: "Ержан", portrait: "erzhan",
      text: "Я не хочу, чтобы меня помнили.", goto: "t2"
    },
    t2: {
      speaker: "Тень", portrait: "shadow",
      text: "Тогда зачем ты вообще пришёл?", goto: "e2"
    },
    e2: {
      speaker: "Ержан", portrait: "erzhan", note: "пауза",
      text: "Потому что мама попросила вернуться. Потому что аксакал Бейсен показал карту. Потому что дети в пещере плакали. Потому что Нұрлан умер. Не ради памяти — ради них.",
      goto: "t3"
    },
    t3: {
      speaker: "Тень", portrait: "shadow", note: "замолкает. Потом атакует",
      text: "...",
      onEnd: function () { /* hosting scene launches the Battle */ }
    }
  };

  /* the after-battle beat — Нұрлан's last verbatim line, then he vanishes */
  var TREE_shadow_after = {
    start: {
      speaker: "", portrait: "",
      note: "мелодия завершена; Тень не исчезает — она растворяется в Ержане, становится его частью",
      text: "Тень растворяется в тебе. Становится твоей частью.",
      goto: "n1"
    },
    n1: {
      speaker: "Нұрлан", portrait: "nurlan_ghost",
      note: "тихо",
      text: "Ты не победил тьму. Ты принял её. Это труднее.",
      goto: "n2"
    },
    n2: {
      speaker: "", portrait: "",
      note: "Нұрлан-призрак исчезает навсегда",
      text: "Нұрлан кивает в последний раз. И исчезает — навсегда.",
      onEnd: function () { /* hosting scene routes to the resolved ending */ }
    }
  };

  _registerScene("ch7_shadow", (function () {
    // phases: "pre" (taunt dialogue) -> "battle" -> "after" (Нұрлан) -> hand-off
    var phase = "pre";
    var preStarted = false;
    var battleLaunched = false;
    var afterStarted = false;
    var bgPhase = 0;
    var dissolveT = 0;

    function startPre() {
      if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.start) {
        try {
          Dialogue.start(TREE_shadow_pre, function () {
            phase = "battle";
          });
        } catch (e) { phase = "battle"; }
      } else {
        phase = "battle";
      }
    }

    function launchBattle() {
      battleLaunched = true;
      if (typeof Battle !== "undefined" && Battle && Battle.start) {
        try {
          Battle.start({
            enemyKey: "shadow",
            name: "Тень",
            hp: 60,
            music: "theme_battle",
            canMelee: false,        // copies your attacks; sword is useless
            countsAsKill: false,    // absorbed, not killed (hidden counter untouched)
            rhythm: {
              melody: KUI_FULL_12,  // the FULL 12-note kui — 8 father-notes + 4 adds
              bpm: 96,
              accuracyNeeded: 80    // play the whole kui cleanly to be accepted
            },
            onWin: function () {
              // mark the kui as complete in the save state
              if (G) {
                if ((G.dombraMelodyLearned | 0) < 3) G.dombraMelodyLearned = 3;
                if (!G.flags) G.flags = {};
                G.flags.shadowAccepted = true;
                G.flags.dombraUsed = true;
              }
              _stopMusic();
              _cue("theme_victory_shadow");
              phase = "after";
              dissolveT = 0;
              afterStarted = false;
              _setScene("ch7_shadow");
            },
            onLose: function () {
              // the player retries the fight; come back to the Shadow scene
              phase = "battle";
              battleLaunched = false;
              _setScene("ch7_shadow");
            }
          });
        } catch (e) {
          // Battle unavailable -> degrade: treat as accepted so the story flows
          if (G) { if ((G.dombraMelodyLearned | 0) < 3) G.dombraMelodyLearned = 3; }
          phase = "after";
        }
      } else {
        if (G) { if ((G.dombraMelodyLearned | 0) < 3) G.dombraMelodyLearned = 3; }
        phase = "after";
      }
    }

    function startAfter() {
      afterStarted = true;
      if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.start) {
        try {
          Dialogue.start(TREE_shadow_after, function () { gotoChapter8(); });
        } catch (e) { gotoChapter8(); }
      } else {
        gotoChapter8();
      }
    }

    function gotoChapter8() {
      if (G) { G.chapter = 8; }
      var letter = "b";
      if (typeof Endings !== "undefined" && Endings && Endings.resolve) {
        try { letter = Endings.resolve(); } catch (e) { letter = "b"; }
      }
      if (letter === "a") _setScene("ch8_ending_a");
      else if (letter === "c") _setScene("ch8_ending_c");
      else _setScene("ch8_ending_b");
    }

    function drawShadowBackdrop(c) {
      var w = _W(), h = _H();
      c.fillStyle = _pal("night", "#0E0F1A");
      c.fillRect(0, 0, w, h);
      // cold violet vignette — the Тень's own light
      var cx = w / 2, cy = h * 0.44;
      var g = c.createRadialGradient(cx, cy, 30, cx, cy, 360);
      g.addColorStop(0, "rgba(122,60,224,0.16)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // the shadow figure — Ержан's mirror. Dissolving in the 'after' phase.
      var alpha = 1;
      if (phase === "after") {
        alpha = _cl(1 - dissolveT / 1600, 0, 1);
      }
      c.save();
      c.globalAlpha = alpha;
      var sway = Math.sin(bgPhase / 500) * 4;
      if (_sprHas("shadow")) {
        _spr(c, "shadow", _rint(cx - 54 + sway), _rint(cy - 80), 7, { alpha: alpha });
      } else if (_sprHas("erzhan")) {
        _spr(c, "erzhan", _rint(cx - 48 + sway), _rint(cy - 64), 6, { tint: { toName: "night", amt: 0.8 }, alpha: alpha });
      } else {
        c.fillStyle = _pal("shadow", "#222018");
        c.fillRect(_rint(cx - 30 + sway), _rint(cy - 70), 60, 100);
      }
      c.restore();
    }

    return {
      blockPause: true,
      enter: function () {
        bgPhase = 0;
        if (phase === "pre") {
          preStarted = false;
          _stopMusic();
          _cue("theme_serik");
        } else if (phase === "after") {
          afterStarted = false;
          dissolveT = 0;
        }
      },
      exit: function () {
        if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.active && Dialogue.close) {
          try { Dialogue.close(); } catch (e) {}
        }
      },
      update: function (dt) {
        bgPhase += dt;

        if (phase === "pre") {
          if (!preStarted) { preStarted = true; startPre(); }
          if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.active && Dialogue.update) {
            try { Dialogue.update(dt); } catch (e) {}
          }
          return;
        }

        if (phase === "battle") {
          if (!battleLaunched) { launchBattle(); }
          return;
        }

        if (phase === "after") {
          dissolveT += dt;
          // let the dissolve play a beat before the dialogue
          if (!afterStarted && dissolveT > 700) { startAfter(); }
          if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.active && Dialogue.update) {
            try { Dialogue.update(dt); } catch (e) {}
          }
          return;
        }
      },
      render: function (c) {
        drawShadowBackdrop(c);
        if (phase === "pre" || phase === "after") {
          if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.active && Dialogue.render) {
            try { Dialogue.render(c); } catch (e) {}
          }
          if (phase === "after" && dissolveT <= 700) {
            _text(c, "Кюй завершён.", _W() / 2, _H() / 2 - 40,
              { color: _pal("gold", "#D4A017"), size: 22, align: "center" });
          }
        } else if (phase === "battle" && !battleLaunched) {
          _text(c, "Тень", _W() / 2, _H() / 2,
            { color: _pal("crackLight", "#7A3CE0"), size: 30, align: "center" });
        }
      },
      onKey: function (e) {
        if ((phase === "pre" || phase === "after") &&
            typeof Dialogue !== "undefined" && Dialogue && Dialogue.active && Dialogue.onKey) {
          try { Dialogue.onKey(e); } catch (er) {}
        }
      }
    };
  })());

  /* ================================================================== */
  /* CH8 — three endings (Cutscenes, verbatim). Hand off from ch7_shadow */
  /* via Endings.resolve(). Each marks G.flags.completedOnce on finish so */
  /* a NEXT run is recognized as New Game+, then returns to title.        */
  /* ================================================================== */

  function _markCompleted() {
    if (G) {
      if (!G.flags) G.flags = {};
      G.flags.completedOnce = true;
    }
    // persist the completion so NG+ survives a reload (guarded)
    try { if (typeof Save !== "undefined" && Save && Save.write) Save.write((G && G.saveSlot) || 1); }
    catch (e) {}
  }

  function _playCutscene(timeline, onDone) {
    if (typeof Cutscene !== "undefined" && Cutscene && Cutscene.play) {
      try { Cutscene.play(timeline, onDone); return true; }
      catch (e) {}
    }
    // Cutscene missing -> run onDone immediately so we never strand the player
    if (typeof onDone === "function") { try { onDone(); } catch (e) {} }
    return false;
  }

  /* helper: a self-contained ending scene that just plays its timeline once
     on enter and then routes home (or to a follow-up scene). This guarantees
     the ending shows even if some other module's scene wiring differs. */
  function _makeEndingScene(buildTimeline, opts) {
    opts = opts || {};
    return {
      blockPause: true,
      _played: false,
      _bgPhase: 0,
      enter: function () {
        this._played = false;
        this._bgPhase = 0;
        _stopMusic();
        if (typeof opts.music === "string") _cue(opts.music);
      },
      exit: function () {},
      update: function (dt) {
        this._bgPhase += dt;
        if (!this._played) {
          this._played = true;
          var self = this;
          var tl = buildTimeline();
          _playCutscene(tl, function () {
            if (typeof opts.onDone === "function") { try { opts.onDone(); } catch (e) {} }
          });
        }
      },
      render: function (c) {
        // a quiet backdrop under the cutscene captions (the Cutscene overlay,
        // when present, draws its own captions on top of whatever scene is
        // active; we provide a tasteful fill so it's never bare).
        var w = _W(), h = _H();
        if (typeof opts.bg === "function") {
          try { opts.bg(c, this._bgPhase); return; } catch (e) {}
        }
        c.fillStyle = _pal(opts.bgName || "night", "#0E0F1A");
        c.fillRect(0, 0, w, h);
      },
      onKey: function (e) {
        // the Cutscene overlay handles fast-forward; nothing to do here.
      }
    };
  }

  /* ---- shared painterly backdrops for the endings ---- */
  function _bgGreenSteppe(c, t) {
    var w = _W(), h = _H();
    // sky
    var sky = c.createLinearGradient(0, 0, 0, h * 0.6);
    sky.addColorStop(0, _pal("skyHigh", "#C7D6DE"));
    sky.addColorStop(1, _pal("skyWhite", "#EDEFE6"));
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    // rolling green hills
    c.fillStyle = _pal("grassDark", "#4E7A33");
    c.beginPath();
    c.moveTo(0, h * 0.62);
    for (var x = 0; x <= w; x += 40) {
      c.lineTo(x, h * 0.62 + Math.sin((x + t * 0.02) / 90) * 14);
    }
    c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
    c.fillStyle = _pal("grassLight", "#7CA646");
    c.beginPath();
    c.moveTo(0, h * 0.74);
    for (var x2 = 0; x2 <= w; x2 += 40) {
      c.lineTo(x2, h * 0.74 + Math.sin((x2 + t * 0.03) / 70 + 2) * 10);
    }
    c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
  }
  function _bgGreySteppe(c, t) {
    var w = _W(), h = _H();
    c.fillStyle = _pal("greySteppe", "#8A8A7A");
    c.fillRect(0, 0, w, h * 0.62);
    c.fillStyle = _pal("deadGreen", "#6E7059");
    c.fillRect(0, h * 0.62, w, h * 0.38);
    // a thin grey road with a fringe of grey grass at its edge
    c.fillStyle = _pal("boneGrey", "#B8B4A4");
    c.fillRect(w / 2 - 30, h * 0.62, 60, h * 0.38);
  }
  function _bgFireYurt(c, t) {
    var w = _W(), h = _H();
    c.fillStyle = _pal("caveDark", "#171826");
    c.fillRect(0, 0, w, h);
    var cx = w / 2, cy = h * 0.5;
    var g = c.createRadialGradient(cx, cy, 20, cx, cy, 300);
    g.addColorStop(0, "rgba(232,178,90,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = _pal("caveFire", "#E8B25A");
    var fh = 22 + Math.sin(t / 120) * 8;
    c.beginPath();
    c.moveTo(cx, cy - fh); c.lineTo(cx + 16, cy + 22); c.lineTo(cx - 16, cy + 22);
    c.closePath(); c.fill();
  }

  /* ---- ENDING A : БАТЫР (кровавая) — DESIGN §8 verbatim ---- */
  _registerScene("ch8_ending_a", _makeEndingScene(function () {
    return [
      { at: 0, cue: "sfx_death" },
      { at: 0, text: "Ержан убивает Серіка. Берёт Тас Жүрек." },
      { at: 3200, text: "Выносит на улицу. Камень светится — но трещины остаются." },
      { at: 7400, cue: "sfx_heal" },
      { at: 7400, text: "Степь зеленеет — быстро, за несколько дней." },
      { at: 11200, text: "Ержана чествуют как героя." },
      { at: 14600, text: "Через 10 лет — эпилог:" },
      { at: 17000, text: "Ержан стар. Сидит один. За окном — снова серая трава у дороги." },
      { at: 21400, text: "Он смотрит. Берёт домбру. Пробует сыграть тот пассаж." },
      { at: 25800, cue: "kui_erzhan_unfinished" },
      { at: 26000, text: "До сих пор не может закончить." },
      { at: 30200, text: "«Победа — это не конец битвы. Это начало следующей.»" },
      { at: 35000, text: "" },
      { at: 36000 }
    ];
  }, {
    bg: function (c, t) {
      // grey epilogue tone, but warmer firelight in the window of the old man
      _bgGreySteppe(c, t);
      var w = _W(), h = _H();
      c.fillStyle = "rgba(8,8,12,0.35)";
      c.fillRect(0, 0, w, h);
    },
    onDone: function () { _markCompleted(); _setScene("title"); }
  }));

  /* ---- ENDING B : КҮЙШІ (каноническая — музыкальная) — DESIGN §8 verbatim ---- */
  /* The longest ending: Ержан plays the whole kui, adds his own 4 final notes,
     the stone heals and sinks home, Серік dissolves, the steppe greens, then a
     full-titles montage of every NPC + the verbatim epilogue quotes incl. the
     mother's Kazakh line. We play the climactic kui as a Rhythm beat first
     (the player literally finishes it), then run the Cutscene montage. */
  _registerScene("ch8_ending_b", (function () {
    var phase = "kui";       // "kui" -> "montage"
    var kuiStarted = false;
    var bgPhase = 0;

    function montageTimeline() {
      return [
        { at: 0, cue: "kui_erzhan_full" },
        { at: 0, text: "Ержан не убивает Серіка. Он садится рядом с ним у огня." },
        { at: 4000, text: "Берёт домбру. И играет — всё. Все пассажи. Тот, что не мог закончить." },
        { at: 8600, text: "8 нот от отца. И финал — 4 ноты, которые Ержан добавляет сам. Впервые." },
        { at: 13600, text: "Кюй становится полным." },
        { at: 16800, text: "Тас Жүрек на коленях Серіка начинает светиться. Трещины затягиваются — не все, но большинство." },
        { at: 22600, cue: "sfx_heal" },
        { at: 22600, text: "Камень поднимается в воздух и уходит вниз, сквозь пол, в землю." },
        { at: 27200, text: "Серік закрывает глаза и медленно растворяется — не умирает, именно растворяется. Уходит туда же, куда ушёл камень." },
        { at: 33400, text: "Степь зеленеет медленно. За несколько недель. Потом за месяц. Потом — всё." },
        { at: 39000, text: "" },
        // — full-titles montage: every NPC in their new life —
        { at: 39400, text: "Финальные титры." },
        { at: 41800, cue: "sfx_eagle_cry" },
        { at: 41800, text: "Аяулым — на горе, с орлом, свободная." },
        { at: 45600, text: "Мать Ержана — у огня, смотрит на восток, но уже не с тревогой." },
        { at: 50000, text: "Три бека — сидят вместе за одним дастарханом впервые за 20 лет." },
        { at: 54600, text: "Аксакал Бейсен — спит." },
        { at: 58200, text: "" },
        { at: 58600, text: "Последняя сцена: Ержан сидит один у реки. Играет на домбре." },
        { at: 63000, text: "Не тот кюй — новый. Какой-то его собственный. Никто не слушает. Это не важно." },
        { at: 68600, text: "«Жерің болса — жетімсіз. Елің болса — елімсіз.»" },
        { at: 72400, text: "— Мать Ержана, финальная сцена" },
        { at: 76000, text: "" },
        { at: 77000 }
      ];
    }

    function startKui() {
      kuiStarted = true;
      if (typeof Rhythm !== "undefined" && Rhythm && Rhythm.start) {
        try {
          Rhythm.start({
            melody: KUI_FULL_12,
            bpm: 96,
            title: "Закончи кюй — добавь свои четыре ноты",
            onResult: function (acc) {
              if (G) {
                if (!G.flags) G.flags = {};
                G.flags.dombraUsed = true;
                G.flags.kuiFinished = true;
                if ((G.dombraMelodyLearned | 0) < 3) G.dombraMelodyLearned = 3;
              }
              phase = "montage";
              _setScene("ch8_ending_b");
            }
          });
        } catch (e) {
          phase = "montage";
        }
      } else {
        phase = "montage";
      }
    }

    return {
      blockPause: true,
      enter: function () {
        bgPhase = 0;
        _stopMusic();
        if (phase === "kui") {
          kuiStarted = false;
          _cue("theme_serik");
        }
      },
      exit: function () {},
      update: function (dt) {
        bgPhase += dt;
        if (phase === "kui") {
          if (!kuiStarted) { startKui(); }
          return;
        }
        if (phase === "montage") {
          if (!this._mStarted) {
            this._mStarted = true;
            _playCutscene(montageTimeline(), function () {
              _markCompleted();
              _setScene("title");
            });
          }
          return;
        }
      },
      render: function (c) {
        // green, healing steppe behind the montage captions
        _bgGreenSteppe(c, bgPhase);
        if (phase === "kui" && !kuiStarted) {
          _text(c, "ТАМАША · ЧУДО", _W() / 2, _H() / 2,
            { color: _pal("gold", "#D4A017"), size: 26, align: "center" });
        }
      },
      onKey: function (e) {}
    };
  })());

  /* ---- ENDING C : ХРАНИТЕЛЬ (одинокая) — DESIGN §8 verbatim ---- */
  _registerScene("ch8_ending_c", _makeEndingScene(function () {
    return [
      { at: 0, cue: "theme_serik" },
      { at: 0, text: "Ержан остаётся. Серік передаёт ему Тас Жүрек и задачу хранителя." },
      { at: 4600, text: "Уходит — просто уходит пешком на север." },
      { at: 8200, text: "Ержан один в Ордо. С камнем." },
      { at: 11600, cue: "sfx_heal" },
      { at: 11600, text: "Степь зеленеет. Жузы возвращаются домой." },
      { at: 15600, cue: "sfx_eagle_cry" },
      { at: 15600, text: "Аяулым улетает с орлом. Мать думает, что сын вернётся." },
      { at: 20000, text: "Эпилог: проходят годы." },
      { at: 23000, text: "Новый молодой пастух приходит к Ордо. Видит старика у огня — Ержана." },
      { at: 28000, text: "И старик говорит:" },
      { at: 30400, text: "«Садись. Чай будешь?»" },
      { at: 33800, text: "Круг замкнулся." },
      { at: 36600, text: "" },
      { at: 37400 }
    ];
  }, {
    bg: function (c, t) {
      // young shepherd arrives to a fire-lit yurt; warm but lonely
      _bgFireYurt(c, t);
    },
    onDone: function () { _markCompleted(); _setScene("title"); }
  }));

  /* ---- HIDDEN 4th ENDING (New Game+) — DESIGN §4.6 verbatim ---- */
  /* "Ержан и Серік вместе выходят к степи. Серік умирает под открытым небом.
     Степь зеленеет в тот же момент. Ержан возвращается домой." */
  _registerScene("ch8_ending_d", _makeEndingScene(function () {
    return [
      { at: 0, cue: "theme_aspan" },
      { at: 0, text: "Скрытая концовка." },
      { at: 2400, text: "Ержан и Серік вместе выходят к степи." },
      { at: 6000, text: "Серік умирает под открытым небом." },
      { at: 9800, cue: "sfx_heal" },
      { at: 9800, text: "Степь зеленеет в тот же момент." },
      { at: 13800, text: "Ержан возвращается домой." },
      { at: 17600, text: "«Степь — это не земля. Степь — это то, что мы помним о земле. Пока помним — она живёт.»" },
      { at: 22600, text: "— Серік Байұлы" },
      { at: 25600, text: "" },
      { at: 26400 }
    ];
  }, {
    bg: function (c, t) {
      _bgGreenSteppe(c, t);
      // a wide bright sky band — the open heaven Серік finally stands under
      var w = _W(), h = _H();
      c.fillStyle = "rgba(237,239,230,0.18)";
      c.fillRect(0, 0, w, h * 0.35);
    },
    onDone: function () { _markCompleted(); _setScene("title"); }
  }));

  /* ---- explicit New Game+ entry scene (optional hook for the title/menu) ---
     If anything wants to re-enter the throne knowing it's a second run, it can
     setScene("ch8_newgameplus"); this simply forwards to the throne (the Серік
     tree there auto-switches to the NG+ recognition variant). */
  _registerScene("ch8_newgameplus", {
    blockPause: false,
    enter: function () {
      if (G) {
        if (!G.flags) G.flags = {};
        G.flags.completedOnce = true; // ensure NG+ variant triggers
        G.chapter = 7;
      }
      _setScene("ch7_throne");
    },
    render: function (c) {
      c.fillStyle = _pal("night", "#0E0F1A");
      c.fillRect(0, 0, _W(), _H());
      _text(c, "ЖАҢА ОЙЫН+ / NEW GAME+", _W() / 2, _H() / 2,
        { color: _pal("gold", "#D4A017"), size: 22, align: "center" });
    }
  });

})();
