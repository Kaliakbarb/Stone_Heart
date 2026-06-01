/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 82-ch5-6.js
   REGISTERS: ch5_* (ҮШ ЖҮЗ / Три жуза) and ch6_* (ҚАРА ЖОЛ / Чёрный путь)
              scenes + their World locations + Dialogue trees.
   RAW JS — concatenated 11th inside the single <script> of index.html,
   after 81-ch3-4.js and before 83-ch7-8.js (CONTRACT §0).

   This file owns NO core namespace. It only:
     - REGISTERS World locations (World.register)           [top-level safe]
     - REGISTERS Scenes (Scenes.register)               [top-level safe]
     - declares Dialogue tree literals                  [plain data]
   Every cross-module runtime call (Dialogue.start, Battle.start,
   Cutscene.play, Audio.playCue, Quests.*, Decay.*, setScene, …) happens
   ONLY inside scene / update / render / dialogue / battle callbacks, and
   is GUARDED so one absent sprite / audio / scene key can never throw in
   the 60fps loop — it no-ops gracefully instead.

   CONTENT (verbatim dialogue reproduced EXACTLY from DESIGN.md):
     CH5 — unite the three feuding жуз (days 4–5):
        ch5_dosan  : Старший жуз — Досан-бек (east, stone yurts). Quest:
                     find his son who went to Ordo a month ago (alive/not).
        ch5_marat  : Средний жуз — Марат (trade aul). CHOICE A/B/C; option C
                     (play the dombra) adds a scene + a finale reward flag.
        ch5_erlan  : Младший жуз — Ерлан (west, young, angry, partisan war);
                     won when Ержан plays the Жер Асты melody — "Значит,
                     мы — одна память". Sets coalition flags as each bek joins.
     CH6 — coalition marches north, land fully grey (day 6):
        ch6_march            : three vanguard fights vs Ordo advance parties
                               (the Dark Khan only watches).
        ch6_ayaulym_confess  : night-camp confession; CHOICE A / B / C
                               (C => ayaulymLeft, she returns alone on Қара
                               Сұңқар in the final battle to save Ержан).
        ch6_labyrinth        : illusion labyrinth — false happy steppe with
                               living parents + a voice offering to stay.
                               Stay >60s -> Нұрлан-ghost plays the first
                               passage, illusion shatters. Exit at once ->
                               Серік: "Хорошо. Значит, ты готов знать правду."
                               Leads into ch7 (ch7_throne).
   ===================================================================== */

(function () {
  "use strict";

  /* ===================================================================== */
  /* small guarded shims so this module is robust in isolation and never   */
  /* throws inside the loop if a sibling namespace is briefly missing.     */
  /* ===================================================================== */
  function _W() { return (typeof Engine !== "undefined" && Engine.W) ? Engine.W : 800; }
  function _H() { return (typeof Engine !== "undefined" && Engine.H) ? Engine.H : 600; }

  function _pal(name, fb) {
    if (typeof PALETTE !== "undefined" && PALETTE && PALETTE[name]) return PALETTE[name];
    return fb || "#D4A017";
  }
  function _cue(name) {
    try { if (typeof Audio !== "undefined" && Audio && Audio.playCue) Audio.playCue(name); } catch (e) {}
  }
  function _stopMusic() {
    try { if (typeof Audio !== "undefined" && Audio && Audio.stopMusic) Audio.stopMusic(); } catch (e) {}
  }
  function _txt(c, str, x, y, opts) {
    opts = opts || {};
    if (typeof drawText === "function") { try { drawText(c, str, x, y, opts); return; } catch (e) {} }
    c.save();
    c.font = opts.font || ('700 ' + (opts.size || 16) + 'px "Courier New", monospace');
    c.textAlign = opts.align || "left";
    c.textBaseline = opts.baseline || "alphabetic";
    if (opts.shadow !== false) { c.fillStyle = _pal("outline", "#1A0A00"); c.fillText(String(str), x + 2, y + 2); }
    c.fillStyle = opts.color || _pal("yurtWhite", "#F5ECD7");
    c.fillText(String(str), x, y);
    c.restore();
  }
  function _spr(c, key, x, y, scale, opts) {
    try {
      if (typeof Sprites !== "undefined" && Sprites && Sprites.draw && Sprites.has && Sprites.has(key)) {
        Sprites.draw(c, key, x, y, scale, opts || {});
        return true;
      }
    } catch (e) {}
    return false;
  }
  function _clamp(v, a, b) { if (typeof clamp === "function") return clamp(v, a, b); return v < a ? a : (v > b ? b : v); }
  function _lerp(a, b, t) { if (typeof lerp === "function") return lerp(a, b, t); return a + (b - a) * t; }
  function _lerpColor(a, b, t) {
    if (typeof lerpColor === "function") { try { return lerpColor(a, b, t); } catch (e) {} }
    return a;
  }
  function _go(id, params) { try { if (typeof setScene === "function") setScene(id, params || {}); } catch (e) {} }
  function _flag(name, val) {
    try {
      if (typeof G === "undefined" || !G) return;
      if (!G.flags || typeof G.flags !== "object") G.flags = {};
      G.flags[name] = val;
    } catch (e) {}
  }
  function _hasFlag(name) {
    try { return !!(typeof G !== "undefined" && G && G.flags && G.flags[name]); } catch (e) { return false; }
  }
  function _coalition(bek, val) {
    try {
      if (typeof G === "undefined" || !G) return;
      if (!G.coalition || typeof G.coalition !== "object") G.coalition = { dosan: false, marat: false, erlan: false };
      G.coalition[bek] = !!val;
    } catch (e) {}
  }
  function _questStart(id) { try { if (typeof Quests !== "undefined" && Quests && Quests.start) Quests.start(id); } catch (e) {} }
  function _questComplete(id) { try { if (typeof Quests !== "undefined" && Quests && Quests.complete) Quests.complete(id); } catch (e) {} }
  function _decaySeed(region, lvl) { try { if (typeof Decay !== "undefined" && Decay && Decay.seed) Decay.seed(region, lvl); } catch (e) {} }
  function _decayHeal(region) { try { if (typeof Decay !== "undefined" && Decay && Decay.heal) Decay.heal(region); } catch (e) {} }
  function _decayLevel(region) {
    try { if (typeof Decay !== "undefined" && Decay && Decay.levelFor) return Decay.levelFor(region); } catch (e) {}
    return 0;
  }
  function _dialogue(tree, onComplete) {
    try {
      if (typeof Dialogue !== "undefined" && Dialogue && Dialogue.start) { Dialogue.start(tree, onComplete); return true; }
    } catch (e) {}
    if (typeof onComplete === "function") { try { onComplete(); } catch (e2) {} }
    return false;
  }
  function _dialogueActive() {
    try { return !!(typeof Dialogue !== "undefined" && Dialogue && Dialogue.active); } catch (e) { return false; }
  }
  function _cutscene(timeline, onDone) {
    try {
      if (typeof Cutscene !== "undefined" && Cutscene && Cutscene.play) { Cutscene.play(timeline, onDone); return true; }
    } catch (e) {}
    if (typeof onDone === "function") { try { onDone(); } catch (e2) {} }
    return false;
  }
  function _battle(cfg) {
    try { if (typeof Battle !== "undefined" && Battle && Battle.start) { Battle.start(cfg); return true; } } catch (e) {}
    /* Battle unavailable -> never deadlock: jump straight to the win path */
    if (cfg && typeof cfg.onWin === "function") { try { cfg.onWin(); } catch (e2) {} }
    return false;
  }
  function _rhythm(cfg) {
    try { if (typeof Rhythm !== "undefined" && Rhythm && Rhythm.start) { Rhythm.start(cfg); return true; } } catch (e) {}
    /* Rhythm unavailable -> report a passing accuracy so scenes continue */
    if (cfg && typeof cfg.onResult === "function") { try { cfg.onResult(85); } catch (e2) {} }
    return false;
  }
  function _melodyLearned() {
    try { return (typeof G !== "undefined" && G && typeof G.dombraMelodyLearned === "number") ? G.dombraMelodyLearned : 0; } catch (e) { return 0; }
  }
  function _memCount() {
    try {
      if (typeof Memory !== "undefined" && Memory && Memory.count) return Memory.count();
      if (typeof G !== "undefined" && G && Array.isArray(G.memories)) return G.memories.length;
    } catch (e) {}
    return 0;
  }

  /* The Жер Асты melody (the father's 8-note passage, lanes 0..3) reused for
     the Erlan scene and the labyrinth — a pentatonic phrase. */
  var JER_ASTY_MELODY = [
    { lane: 0, t: 0 }, { lane: 2, t: 520 }, { lane: 1, t: 1040 }, { lane: 3, t: 1560 },
    { lane: 2, t: 2080 }, { lane: 0, t: 2600 }, { lane: 3, t: 3120 }, { lane: 1, t: 3640 }
  ];

  /* ===================================================================== */
  /* ====================  CHAPTER 5 — ҮШ ЖҮЗ  ===========================  */
  /* ===================================================================== */

  /* seed the three жуз regions + the dead-lands march region (dying steppe).
     Top-level safe — only touches G + Decay's local state. */
  _decaySeed("uly_juz", 0.7);
  _decaySeed("orta_juz", 0.7);
  _decaySeed("kishi_juz", 0.85);
  _decaySeed("qara_jol", 1.0);

  /* --------------------------------------------------------------------- */
  /* 5.1  СТАРШИЙ ЖУЗ — Досан-бек (east, stone yurts). Verbatim.            */
  /* --------------------------------------------------------------------- */

  /* the bek's demand: find his son, gone to Ordo a month ago, alive or not.
     The "find the son" beat is resolved as a short cutscene reached from a
     second NPC (the scout) so the player can act on the quest before the bek
     joins. Досан then joins the coalition. */
  var TREE_ch5_dosan_intro = {
    start: { speaker: "Досан", portrait: "dosan", note: "крупный, властный, говорит медленно и весомо",
             text: "Ты говоришь: пойдём на Ордо. Кто ты такой? Чья кровь? Чей сын?", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan",
             text: "Я сын Қайрата из аула Жетіқаз.", goto: "d2" },
    d2:    { speaker: "Досан", portrait: "dosan", note: "пауза, смотрит в сторону",
             text: "Қайрат? Предатель?", goto: "e2" },
    e2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Мой отец ошибся. Потом исправил это. Это стоило ему жизни.", goto: "d3" },
    d3:    { speaker: "Досан", portrait: "dosan",
             text: "И что это доказывает?", goto: "e3" },
    e3:    { speaker: "Ержан", portrait: "erzhan", note: "пауза",
             text: "Что кровь — это не приговор. Ни плохая, ни хорошая.", goto: "d4" },
    d4:    { speaker: "Досан", portrait: "dosan", note: "долго молчит",
             text: "Ты умеешь говорить. Посмотрим, умеешь ли ты держать слово. Мне нужна одна вещь. Мой сын ушёл на Ордо месяц назад. Найди его — живого или нет. Тогда поговорим.",
             onEnd: function () { _questStart("q_dosan"); _flag("ch5_dosan_met", true); } }
  };

  /* the scout points the way to where the son was last seen. */
  var TREE_ch5_dosan_scout = {
    start: { speaker: "Дозорный", portrait: "dosan",
             text: "Ты ищешь сына бека? Его отряд видели у северной балки, на дороге к Ордо. Месяц тому. Никто не вернулся.", goto: "s2" },
    s2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Я найду его.", goto: "s3" },
    s3:    { speaker: "Дозорный", portrait: "dosan", note: "тихо",
             text: "Иди по серой траве. Она приведёт тебя к нему.",
             onEnd: function () { _flag("ch5_dosan_scout", true); } }
  };

  /* what Ержан finds at the balka: the son, dead, with the same triangle-Ordo
     mark on his gear. The bek will hear the truth and join. */
  function _ch5DosanFindSon() {
    if (_hasFlag("ch5_dosan_found")) { _go("ch5_dosan"); return; }
    var tl = [
      { at: 0, cue: "theme_serik" },
      { at: 0, text: "Северная балка. Серая трава. Ветра нет — и всё же что-то шепчет." },
      { at: 3600, text: "Здесь лежит молодой воин. На сапоге — треугольник с точкой внутри. Знак Ордо." },
      { at: 8200, text: "Сын Досана не дошёл до крепости. Он не дошёл и до дома." },
      { at: 12200, text: "Ержан складывает руки погибшего на груди. Запоминает лицо — чтобы рассказать отцу." },
      { at: 16400, text: "" },
      { at: 17000 }
    ];
    _cutscene(tl, function () {
      _flag("ch5_dosan_found", true);
      _go("ch5_dosan", { spawn: "default" });
    });
  }

  /* Досан hears the news. He joins. Coalition flag set; region healed. */
  var TREE_ch5_dosan_return = {
    start: { speaker: "Ержан", portrait: "erzhan", note: "тихо",
             text: "Я нашёл твоего сына. Он не дошёл до Ордо. Знак на его сапоге — треугольник с точкой. Это сделал Тёмный Хан.", goto: "d2" },
    d2:    { speaker: "Досан", portrait: "dosan", note: "долгое молчание; каменное лицо не меняется, но что-то в нём ломается",
             text: "Месяц я ждал. Каждый день смотрел на дорогу.", goto: "d3" },
    d3:    { speaker: "Досан", portrait: "dosan",
             text: "Ты держишь слово, сын Қайрата. Старший жуз идёт с тобой. За моего сына — и за степь.",
             set: { ch5_dosan_joined: true },
             onEnd: function () {
               _coalition("dosan", true);
               _questComplete("q_dosan");
               _decayHeal("uly_juz");
             } }
  };

  /* The east aul: stone yurts (yurt_stone). Compact ~24x16, built from fills
     via a string grid + legend (no giant literal arrays). */
  (function registerDosanMap() {
    var W = 24, H = 16;
    var rows = [];
    var y, x, line;
    for (y = 0; y < H; y++) {
      line = "";
      for (x = 0; x < W; x++) {
        var ch = "g";                 // grass base (greyed by decay tint)
        if (x === 0 || x === W - 1 || y === 0 || y === H - 1) ch = "#"; // rock border
        if (y === 1 && x > 1 && x < W - 2) ch = "#";                    // back stone wall
        line += ch;
      }
      rows.push(line);
    }
    function place(tx, ty, c) {
      if (ty < 0 || ty >= H) return;
      var r = rows[ty];
      if (tx < 0 || tx >= r.length) return;
      rows[ty] = r.substring(0, tx) + c + r.substring(tx + 1);
    }
    /* stone yurts in two rows, a central campfire, a couple of trees */
    place(4, 4, "Y"); place(8, 4, "Y"); place(12, 4, "Y"); place(16, 4, "Y"); place(19, 4, "Y");
    place(5, 9, "Y"); place(10, 9, "Y"); place(15, 9, "Y"); place(18, 9, "Y");
    place(11, 7, "f");                                 // central fire
    place(2, 12, "t"); place(21, 12, "t"); place(3, 6, "t");
    /* west gate row clear (entry); exit chevron at far west leads back to march hub later */

    World.register({
      id: "aul_dosan",
      name: "АУЛ СТАРШЕГО ЖУЗА",
      region: "uly_juz",
      decayRegion: "uly_juz",
      w: W, h: H,
      grid: rows,
      legend: { "g": "grass", "#": "rock", "Y": "yurt_stone", "f": "campfire", "t": "tree" },
      solid: ["rock", "yurt_stone", "tree", "water", "grave"],
      bg: "night",
      music: "theme_overworld",
      spawns: { "default": { x: 2, y: 8, dir: "right" } },
      npcs: [
        { key: "dosan", x: 11, y: 5, name: "Досан",
          onInteract: function () {
            if (_dialogueActive()) return;
            if (!_hasFlag("ch5_dosan_met")) { _dialogue(TREE_ch5_dosan_intro, null); return; }
            if (_hasFlag("ch5_dosan_found") && !_hasFlag("ch5_dosan_joined")) {
              _dialogue(TREE_ch5_dosan_return, function () { _go("ch5_marat"); });
              return;
            }
            if (_hasFlag("ch5_dosan_joined")) {
              _dialogue({ start: { speaker: "Досан", portrait: "dosan",
                text: "Мои всадники готовы. Веди нас на север.",
                onEnd: function () { _go("ch5_marat"); } } }, null);
              return;
            }
            /* met but not yet found the son */
            _dialogue({ start: { speaker: "Досан", portrait: "dosan", note: "сурово",
              text: "Сначала — мой сын. Найди его. Потом будем говорить о войне." } }, null);
          } },
        { key: "child", x: 7, y: 9, name: "Дозорный",
          onInteract: function () {
            if (_dialogueActive()) return;
            if (!_hasFlag("ch5_dosan_met")) {
              _dialogue({ start: { speaker: "Дозорный", portrait: "dosan",
                text: "Сначала говори с беком. Без его слова здесь не решают ничего." } }, null);
              return;
            }
            if (_hasFlag("ch5_dosan_found")) {
              _dialogue({ start: { speaker: "Дозорный", portrait: "dosan", note: "тихо",
                text: "Ты вернулся. Значит, нашёл. Иди к беку." } }, null);
              return;
            }
            _dialogue(TREE_ch5_dosan_scout, null);
          } },
        /* the grey-grass trail at the west gate: a standard Z-interaction. Once
           the scout has pointed the way, examining the trail follows it to the
           northern balka (the find-son cutscene). The petroglyph sprite stands
           in as the faint trail marker on the ground. */
        { key: "petroglyph", x: 2, y: 11, name: "След",
          onInteract: function () {
            if (_dialogueActive()) return;
            if (!_hasFlag("ch5_dosan_scout")) {
              _dialogue({ start: { speaker: "", portrait: "",
                text: "Серая трава у западных ворот. Что-то прошло здесь — но куда, пока неясно. Сначала расспроси дозорного." } }, null);
              return;
            }
            if (_hasFlag("ch5_dosan_found")) {
              _dialogue({ start: { speaker: "", portrait: "",
                text: "След привёл тебя к сыну бека. Больше идти некуда. Возвращайся к Досану." } }, null);
              return;
            }
            /* follow the grey grass to the balka */
            _dialogue({ start: { speaker: "Ержан", portrait: "erzhan", note: "тихо",
              text: "Серая трава ведёт на север. Я пойду по ней.",
              onEnd: function () { _ch5DosanFindSon(); } } }, null);
          } }
      ]
    });
  })();

  Scenes.register("ch5_dosan", (typeof World !== "undefined" && World.makeExploreScene)
    ? World.makeExploreScene("aul_dosan", {
        onEnter: function () {
          if (typeof G !== "undefined" && G) G.chapter = Math.max(G.chapter || 1, 5);
        },
        onRender: function (c) {
          /* objective banner */
          if (_dialogueActive()) return;
          var msg = null;
          if (!_hasFlag("ch5_dosan_met")) msg = "Поговори с Досан-беком (Z)";
          else if (!_hasFlag("ch5_dosan_found")) {
            msg = _hasFlag("ch5_dosan_scout")
              ? "Иди по серой траве у западных ворот (Z на след)"
              : "Расспроси дозорного о сыне бека (Z)";
          } else if (!_hasFlag("ch5_dosan_joined")) msg = "Расскажи Досану, что ты нашёл (Z)";
          else msg = "Старший жуз с тобой. Иди к Среднему жузу.";
          if (msg) {
            c.save();
            c.globalAlpha = 0.9;
            _txt(c, msg, _W() / 2, 52, { color: _pal("gold", "#D4A017"), size: 14, align: "center" });
            c.restore();
          }
        }
      })
    : { render: function (c) { c.fillStyle = "#000"; c.fillRect(0, 0, _W(), _H()); } });

  /* --------------------------------------------------------------------- */
  /* 5.2  СРЕДНИЙ ЖУЗ — Марат (trade aul). Verbatim + CHOICE A/B/C.         */
  /*      Option C (play the dombra) -> extra scene + finale reward flag.   */
  /* --------------------------------------------------------------------- */

  /* the persuasion choices. A and B convince with words; C plays the dombra
     (the first time music persuades in dialogue) and unlocks an extra beat +
     the reward flag dombraMarat (read by Endings as a "used dombra" signal). */
  var TREE_ch5_marat = {
    start: { speaker: "Марат", portrait: "marat", note: "хитрый, дружелюбный, улыбается",
             text: "Я слышал о тебе. Говорят, ты убил Жалмауыз. Говорят, ты был в Жер Асты. Говорят, ты летел на орле.", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan",
             text: "Всё правда.", goto: "m2" },
    m2:    { speaker: "Марат", portrait: "marat", note: "пауза",
             text: "Значит, ты ценный человек. Ценных людей я поддерживаю.", goto: "m3" },
    m3:    { speaker: "Марат", portrait: "marat",
             text: "Но мой народ — торговый. Война разрушает торговлю. Дай мне причину рискнуть.", goto: "e2" },
    e2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Если степь умрёт — торговать будет нечем и некому.", goto: "m4" },
    m4:    { speaker: "Марат", portrait: "marat",
             text: "Это я понимаю. Но это — завтра. Мне нужно что-то сегодня.", goto: "choose" },

    /* the player's choice of how to convince Марат */
    choose: { speaker: "Ержан", portrait: "erzhan", note: "как убедить Марата?",
              text: "...", choices: [
        { label: "Предложить защиту торговых путей после победы.", goto: "optA",
          set: { ch5_marat_choice: "A" } },
        { label: "Рассказать о нити Тәңір-Ана, что тянется к каждому аулу.", goto: "optB",
          set: { ch5_marat_choice: "B" } },
        { label: "Сыграть на домбре.", goto: "optC", dombra: true,
          set: { ch5_marat_choice: "C", dombraMarat: true } }
      ] },

    /* Вариант A — protection of the trade routes after the victory */
    optA:  { speaker: "Ержан", portrait: "erzhan",
             text: "Идём со мной — и после победы твои караваны пойдут по степи без страха. Мечи трёх жузов встанут вдоль твоих дорог.", goto: "mA" },
    mA:    { speaker: "Марат", portrait: "marat", note: "взвешивает, как товар на ладони",
             text: "Защита дорог. Это — цена, которую я понимаю. По рукам, пастух. Средний жуз с тобой.",
             onEnd: function () { _ch5MaratJoin(false); } },

    /* Вариант B — the thread of Тәңір-Ана reaching every aul */
    optB:  { speaker: "Ержан", portrait: "erzhan", note: "тихо",
             text: "Я был в Верхнем мире. Тәңір-Ана прядёт нить — и эта нить уходит вниз, в степь. К каждому аулу. И к твоему. Когда рвётся нить — рвётся и торговля, и кровь, и память.", goto: "mB" },
    mB:    { speaker: "Марат", portrait: "marat", note: "впервые не улыбается",
             text: "Нить, говоришь. К моему аулу тоже. Я торговец — я знаю, что бывает, когда рвётся то, что всех держит вместе. Средний жуз идёт.",
             onEnd: function () { _ch5MaratJoin(false); } },

    /* Вариант C — play the dombra (first time music persuades in dialogue).
       Extra scene + finale reward flag (dombraMarat already set on the choice). */
    optC:  { speaker: "Ержан", portrait: "erzhan", note: "берёт домбру, не говоря ни слова",
             text: "...", goto: "mC1" },
    mC1:   { speaker: "Марат", portrait: "marat", note: "улыбка медленно сходит с лица",
             text: "Эй. Эй-эй. Я торгуюсь словами, а не... этим.", goto: "mC2" },
    mC2:   { speaker: "Марат", portrait: "marat", note: "слушает; рука замирает на чётках",
             text: "Эту мелодию... её играл старик на базаре в Сарыарке, когда я был мальчишкой. Я думал, что забыл её.", goto: "mC3" },
    mC3:   { speaker: "Ержан", portrait: "erzhan",
             text: "Ты не забыл. Никто не забывает по-настоящему. Просто перестаёт слушать.", goto: "mC4" },
    mC4:   { speaker: "Марат", portrait: "marat", note: "долгая пауза, потом тихо смеётся",
             text: "Ты не дал мне ни одной причины — и дал больше, чем все. Средний жуз идёт. И знаешь что — играй так в день битвы. Мои люди пойдут охотнее под кюй, чем под барабан.",
             onEnd: function () { _ch5MaratJoin(true); } }
  };

  function _ch5MaratJoin(viaDombra) {
    _coalition("marat", true);
    _flag("ch5_marat_joined", true);
    if (viaDombra) {
      /* finale reward flag — Марат's men march to the kui in the end (and the
         dombraMarat signal already nudges the canonical/musical ending). */
      _flag("maratDombraReward", true);
      _flag("dombraMarat", true);
    }
    _questComplete("q_marat");
    _decayHeal("orta_juz");
  }

  /* The middle (trade) aul: ordinary felt yurts, market stalls (sand), a fire,
     a couple of trees, a thin river along the east. Compact ~24x16. */
  (function registerMaratMap() {
    var W = 24, H = 16;
    var rows = [];
    var y, x, line;
    for (y = 0; y < H; y++) {
      line = "";
      for (x = 0; x < W; x++) {
        var ch = "g";
        if (y === 0 || y === H - 1) ch = "t";          // tree-line top/bottom edges
        if (x === 0) ch = "t";                          // west tree-line
        if (x === W - 1) ch = "w";                      // east river
        if (x === W - 2 && (y % 2 === 0)) ch = "w";     // river fringe
        line += ch;
      }
      rows.push(line);
    }
    function place(tx, ty, c) {
      if (ty < 0 || ty >= H) return;
      var r = rows[ty];
      if (tx < 0 || tx >= r.length) return;
      rows[ty] = r.substring(0, tx) + c + r.substring(tx + 1);
    }
    place(4, 4, "y"); place(9, 4, "y"); place(14, 4, "y");
    place(6, 10, "y"); place(12, 10, "y"); place(17, 6, "y");
    /* market stalls as sand patches */
    place(7, 7, "s"); place(8, 7, "s"); place(10, 7, "s"); place(11, 7, "s"); place(13, 7, "s");
    place(11, 8, "f");

    World.register({
      id: "aul_marat",
      name: "ТОРГОВЫЙ АУЛ — СРЕДНИЙ ЖУЗ",
      region: "orta_juz",
      decayRegion: "orta_juz",
      w: W, h: H,
      grid: rows,
      legend: { "g": "grass", "t": "tree", "w": "water", "y": "yurt", "s": "sand", "f": "campfire" },
      solid: ["tree", "water", "yurt", "grave"],
      bg: "night",
      music: "theme_overworld",
      spawns: { "default": { x: 2, y: 8, dir: "right" } },
      npcs: [
        { key: "marat", x: 11, y: 9, name: "Марат",
          onInteract: function () {
            if (_dialogueActive()) return;
            if (_hasFlag("ch5_marat_joined")) {
              _dialogue({ start: { speaker: "Марат", portrait: "marat", note: "улыбается",
                text: "Караваны подождут. Сегодня мы торгуем сталью. Веди, пастух.",
                onEnd: function () { _go("ch5_erlan"); } } }, null);
              return;
            }
            _dialogue(TREE_ch5_marat, function () { _go("ch5_erlan"); });
          } }
      ]
    });
  })();

  Scenes.register("ch5_marat", (typeof World !== "undefined" && World.makeExploreScene)
    ? World.makeExploreScene("aul_marat", {
        onEnter: function () { if (typeof G !== "undefined" && G) G.chapter = Math.max(G.chapter || 1, 5); },
        onRender: function (c) {
          if (_dialogueActive()) return;
          var msg = _hasFlag("ch5_marat_joined")
            ? "Средний жуз с тобой. Иди к Младшему жузу."
            : "Поговори с Маратом (Z)";
          c.save();
          c.globalAlpha = 0.9;
          _txt(c, msg, _W() / 2, 52, { color: _pal("gold", "#D4A017"), size: 14, align: "center" });
          c.restore();
        }
      })
    : { render: function (c) { c.fillStyle = "#000"; c.fillRect(0, 0, _W(), _H()); } });

  /* --------------------------------------------------------------------- */
  /* 5.3  МЛАДШИЙ ЖУЗ — Ерлан (west, young, angry, partisan war). Verbatim. */
  /*      Won when Ержан plays the Жер Асты melody — "Значит, мы — одна     */
  /*      память". Coalition flag set; region healed.                      */
  /* --------------------------------------------------------------------- */

  /* The dialogue runs verbatim up to the moment Ержан takes the dombra; the
     "начинает играть — мелодию из Жер Асты" beat hands off to a Rhythm moment,
     then the conversation resumes verbatim ("Где ты это слышал?" …). */
  var TREE_ch5_erlan_pre = {
    start: { speaker: "Ерлан", portrait: "erlan", note: "молодой, злой",
             text: "Наконец-то. Ты пришёл воевать или разговаривать?", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan",
             text: "И то, и другое.", goto: "r2" },
    r2:    { speaker: "Ерлан", portrait: "erlan",
             text: "У нас уже четыре человека погибло. Нет времени на разговоры.", goto: "e2" },
    e2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Именно поэтому нужны разговоры. Ты теряешь людей, потому что атакуешь в одиночку.", goto: "r3" },
    r3:    { speaker: "Ерлан", portrait: "erlan", note: "с горечью",
             text: "А кто мне поможет? Старший жуз? Они сидят за каменными стенами.", goto: "e3" },
    e3:    { speaker: "Ержан", portrait: "erzhan",
             text: "Я пришёл именно затем, чтобы это изменить.", goto: "r4" },
    r4:    { speaker: "Ерлан", portrait: "erlan", note: "смотрит в сторону",
             text: "Слова. Все приходят со словами.", goto: "e4" },
    /* "Тогда без слов." [берёт домбру, начинает играть — мелодию из Жер Асты] */
    e4:    { speaker: "Ержан", portrait: "erzhan", note: "берёт домбру, начинает играть — мелодию из Жер Асты",
             text: "Тогда без слов." }
  };

  /* the verbatim continuation after the melody is played. */
  var TREE_ch5_erlan_post = {
    start: { speaker: "Ерлан", portrait: "erlan", note: "замолкает, слушает; что-то в его лице меняется",
             text: "Где ты это слышал?", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan",
             text: "От отца. В Нижнем мире.", goto: "r2" },
    r2:    { speaker: "Ерлан", portrait: "erlan", note: "тихо",
             text: "Мой дед играл это. Я думал, что больше никто не знает эту мелодию.", goto: "e2" },
    e2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Значит, мы — одна память.", goto: "r3" },
    /* [Долгая пауза. Ерлан берёт копьё.] */
    r3:    { speaker: "Ерлан", portrait: "erlan", note: "долгая пауза, берёт копьё",
             text: "Веди.",
             onEnd: function () {
               _coalition("erlan", true);
               _flag("ch5_erlan_joined", true);
               _flag("dombraErlan", true);
               _questComplete("q_erlan");
               _decayHeal("kishi_juz");
             } }
  };

  /* play the Жер Асты melody, then resume the verbatim dialogue. */
  function _ch5ErlanPlay() {
    _flag("ch5_erlan_played", true);
    _rhythm({
      melody: JER_ASTY_MELODY,
      bpm: 84,
      title: "Кюй из Жер Асты — для Ерлана",
      onResult: function () {
        /* the melody lands regardless of accuracy here (the meaning, not the
           perfection, is what moves Ерлан) — resume the verbatim dialogue.
           Rhythm restored control to the previous scene; re-open dialogue. */
        _dialogue(TREE_ch5_erlan_post, function () { _go("ch5_done"); });
      }
    });
  }

  /* The west aul: young partisan camp — felt yurts, watch-fires, broken ground
     (a few graves of the four fallen), tree-line. Compact ~24x16. */
  (function registerErlanMap() {
    var W = 24, H = 16;
    var rows = [];
    var y, x, line;
    for (y = 0; y < H; y++) {
      line = "";
      for (x = 0; x < W; x++) {
        var ch = "g";
        if (y === 0 || y === H - 1) ch = "t";
        if (x === W - 1) ch = "t";                      // west edge tree-line
        line += ch;
      }
      rows.push(line);
    }
    function place(tx, ty, c) {
      if (ty < 0 || ty >= H) return;
      var r = rows[ty];
      if (tx < 0 || tx >= r.length) return;
      rows[ty] = r.substring(0, tx) + c + r.substring(tx + 1);
    }
    place(5, 5, "y"); place(10, 5, "y"); place(15, 4, "y");
    place(8, 10, "y"); place(13, 10, "y");
    place(6, 7, "f"); place(16, 8, "f");
    /* graves of the four fallen partisans */
    place(18, 11, "x"); place(19, 11, "x"); place(20, 11, "x"); place(19, 12, "x");

    World.register({
      id: "aul_erlan",
      name: "ЗАПАДНЫЙ АУЛ — МЛАДШИЙ ЖУЗ",
      region: "kishi_juz",
      decayRegion: "kishi_juz",
      w: W, h: H,
      grid: rows,
      legend: { "g": "grass", "t": "tree", "y": "yurt", "f": "campfire", "x": "grave" },
      solid: ["tree", "yurt", "grave", "water"],
      bg: "night",
      music: "theme_overworld",
      spawns: { "default": { x: 2, y: 8, dir: "right" } },
      npcs: [
        { key: "erlan", x: 11, y: 8, name: "Ерлан",
          onInteract: function () {
            if (_dialogueActive()) return;
            if (_hasFlag("ch5_erlan_joined")) {
              _dialogue({ start: { speaker: "Ерлан", portrait: "erlan",
                text: "Хватит хоронить своих. Веди — будем хоронить чужих.",
                onEnd: function () { _go("ch5_done"); } } }, null);
              return;
            }
            /* run the verbatim pre-melody dialogue; on the "Тогда без слов."
               beat ending we trigger the dombra moment, then the post tree. */
            _dialogue(TREE_ch5_erlan_pre, function () { _ch5ErlanPlay(); });
          } }
      ]
    });
  })();

  Scenes.register("ch5_erlan", (typeof World !== "undefined" && World.makeExploreScene)
    ? World.makeExploreScene("aul_erlan", {
        onEnter: function () { if (typeof G !== "undefined" && G) G.chapter = Math.max(G.chapter || 1, 5); },
        onRender: function (c) {
          if (_dialogueActive()) return;
          var msg = _hasFlag("ch5_erlan_joined")
            ? "Все три жуза собраны. Иди дальше."
            : "Поговори с Ерланом (Z)";
          c.save();
          c.globalAlpha = 0.9;
          _txt(c, msg, _W() / 2, 52, { color: _pal("gold", "#D4A017"), size: 14, align: "center" });
          c.restore();
        }
      })
    : { render: function (c) { c.fillStyle = "#000"; c.fillRect(0, 0, _W(), _H()); } });

  /* --------------------------------------------------------------------- */
  /* CH5 -> CH6 hand-off: a short coalition-formed beat, then the march.    */
  /* --------------------------------------------------------------------- */
  Scenes.register("ch5_done", {
    blockPause: true,
    enter: function () {
      var both = (typeof G !== "undefined" && G && G.coalition) ? G.coalition : { dosan: true, marat: true, erlan: true };
      var lines = [];
      var n = 0;
      if (both.dosan) n++; if (both.marat) n++; if (both.erlan) n++;
      var tl = [
        { at: 0, cue: "theme_overworld" },
        { at: 0, text: "Три жуза — Старший, Средний, Младший. Впервые за двадцать лет — под одним небом, одной дорогой." },
        { at: 4800, text: "Старший пришёл за сына. Средний — за память на базаре. Младший — за деда, что играл тот же кюй." },
        { at: 10200, text: "Коалиция собрана. Степь смотрит, как её дети снова идут вместе." },
        { at: 14600, text: "На север. К Тёмному Ордо." },
        { at: 18200, text: "" },
        { at: 18800 }
      ];
      var self = this;
      this._done = false;
      _cutscene(tl, function () {
        if (self._done) return;
        self._done = true;
        if (typeof G !== "undefined" && G) G.chapter = 6;
        _go("ch6_march");
      });
    },
    update: function () {},
    render: function (c) {
      /* the Cutscene overlay draws over us; this is just a safe backdrop in
         case Cutscene is briefly unavailable. */
      c.fillStyle = _pal("night", "#0E0F1A");
      c.fillRect(0, 0, _W(), _H());
      _txt(c, "ҮШ ЖҮЗ", _W() / 2, _H() / 2 - 6, { color: _pal("gold", "#D4A017"), size: 30, align: "center" });
      _txt(c, "Коалиция собрана", _W() / 2, _H() / 2 + 26, { color: _pal("boneGrey", "#B8B4A4"), size: 14, align: "center" });
    },
    onKey: function (e) {
      /* allow a manual skip if the cutscene didn't run (defensive) */
      if (e && e.action === "confirm" && !this._done) {
        this._done = true;
        if (typeof G !== "undefined" && G) G.chapter = 6;
        _go("ch6_march");
      }
    }
  });

  /* ===================================================================== */
  /* ====================  CHAPTER 6 — ҚАРА ЖОЛ  =========================  */
  /* ===================================================================== */

  /* 6.0  THE MARCH — coalition moves north; land fully grey. Three vanguard
     fights vs Ordo advance parties (the Dark Khan only watches). A simple,
     readable march scene: the column advances across a fully-grey field; at
     three waypoints an Ordo party blocks the road -> Battle.start. After the
     third, the night camp (6.1) begins. */
  var CH6 = {
    fight: 0,          // 0..3 vanguard fights resolved
    started: false,
    marchT: 0,
    bannerT: 0,
    introT: 0
  };

  function _ch6StartFight(idx) {
    var names = ["Передовой отряд Ордо", "Дозор Ордо", "Застава Ордо"];
    var hp = [22, 26, 30];
    var nm = names[idx] || "Отряд Ордо";
    _battle({
      enemyKey: "ordo_soldier",
      name: nm,
      hp: hp[idx] || 24,
      music: "theme_battle",
      canMelee: true,
      countsAsKill: true,
      onWin: function () {
        CH6.fight = Math.min(3, idx + 1);
        if (CH6.fight >= 3) {
          /* the road to Ordo is open; the coalition camps for the night */
          if (typeof G !== "undefined" && G) G.chapter = 6;
          _go("ch6_ayaulym_confess");
        } else {
          _go("ch6_march");
        }
      },
      onLose: function () {
        /* narrative non-death: the line re-forms and tries again (no global
           death out of battle, per CONTRACT §9). Return to the march. */
        _go("ch6_march");
      }
    });
  }

  Scenes.register("ch6_march", {
    enter: function () {
      if (typeof G !== "undefined" && G) G.chapter = 6;
      CH6.started = true;
      CH6.marchT = 0;
      CH6.bannerT = 0;
      CH6.introT = 0;
      this._engaging = false;
      try { _cue("theme_overworld"); } catch (e) {}
    },
    exit: function () {},
    update: function (dt) {
      if (typeof dt !== "number" || !(dt >= 0)) dt = 16;
      CH6.marchT += dt;
      CH6.bannerT += dt;
      CH6.introT += dt;
      if (this._engaging) return;

      /* after a short approach beat, the next Ordo party blocks the road */
      if (CH6.fight < 3 && CH6.introT > 1500) {
        if (typeof Input !== "undefined" && Input.pressed &&
            (Input.pressed("confirm") || Input.pressed("dombra"))) {
          this._engaging = true;
          _ch6StartFight(CH6.fight);
        }
      }
    },
    render: function (c) {
      var W = _W(), H = _H();
      /* fully-grey dead-lands: not ash-grey but a washed-out drawing. */
      var amt = _decayLevel("qara_jol");
      if (amt <= 0) amt = 1; // the march land is fully grey by design
      var sky = _lerpColor(_pal("skyHigh", "#C7D6DE"), _pal("greySteppe", "#8A8A7A"), 0.7);
      var ground = _lerpColor(_pal("deadGreen", "#6E7059"), _pal("greySteppe", "#8A8A7A"), amt);
      c.fillStyle = sky;
      c.fillRect(0, 0, W, H * 0.55);
      c.fillStyle = ground;
      c.fillRect(0, H * 0.55, W, H * 0.45);
      /* a faint horizon line + the dark silhouette of Ordo far north */
      c.strokeStyle = _lerpColor(_pal("greySteppe", "#8A8A7A"), _pal("outline", "#1A0A00"), 0.4);
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, H * 0.55); c.lineTo(W, H * 0.55); c.stroke();
      c.fillStyle = _lerpColor(_pal("caveStone", "#33354A"), _pal("outline", "#1A0A00"), 0.5);
      /* distant fortress block */
      var fx = W / 2 - 60, fy = H * 0.55 - 40;
      c.fillRect(fx, fy, 120, 40);
      c.fillRect(fx + 16, fy - 16, 18, 16);
      c.fillRect(fx + 86, fy - 16, 18, 16);

      /* the coalition column: a marching row of small banner/soldier marks
         drawn from fills (no per-sprite reliance). Three banners = three жуз. */
      var baseY = H * 0.74;
      var bob = Math.sin(CH6.marchT / 240) * 2;
      var i;
      var bannerCols = [_pal("feltRed", "#C0392B"), _pal("gold", "#D4A017"), _pal("skyBlue", "#2980B9")];
      for (i = 0; i < 14; i++) {
        var mx = 60 + i * 50 + (Math.sin((CH6.marchT / 300) + i) * 2);
        if (mx > W - 20) continue;
        var my = baseY + ((i % 2) ? bob : -bob);
        /* try a soldier sprite, else a felt-figure fill */
        if (!_spr(c, "ordo_soldier", mx - 16, my - 28, 2, { tint: { toName: "greySteppe", amt: 0.2 } })) {
          c.fillStyle = _lerpColor(_pal("earth", "#7D4E2A"), _pal("greySteppe", "#8A8A7A"), 0.3);
          c.fillRect(mx - 6, my - 22, 12, 22);
          c.fillStyle = _pal("outline", "#1A0A00");
          c.fillRect(mx - 6, my - 22, 12, 2);
        }
        /* a banner every 5th */
        if (i % 5 === 1) {
          c.fillStyle = _pal("earth", "#7D4E2A");
          c.fillRect(mx - 1, my - 52, 2, 30);
          c.fillStyle = bannerCols[(Math.floor(i / 5)) % 3];
          c.fillRect(mx + 1, my - 52, 16, 10);
        }
      }
      /* Ержан at the head (lead figure) */
      var hx = Math.min(W - 80, 80 + (CH6.marchT / 60) % (W - 160) * 0 + 760);
      hx = W - 90;
      if (!_spr(c, "erzhan", hx - 16, baseY - 30, 2, {})) {
        c.fillStyle = _pal("skyBlue", "#2980B9");
        c.fillRect(hx - 6, baseY - 24, 12, 24);
      }

      /* title + banner */
      c.save();
      c.globalAlpha = 0.95;
      _txt(c, "ҚАРА ЖОЛ — ЧЁРНЫЙ ПУТЬ", W / 2, 34, { color: _pal("gold", "#D4A017"), size: 18, align: "center" });
      _txt(c, "Земля здесь полностью серая — будто кто-то стёр краску.", W / 2, 56,
        { color: _pal("boneGrey", "#B8B4A4"), size: 12, align: "center" });
      c.restore();

      /* progress + prompt */
      var prog = CH6.fight;
      _txt(c, "Передовые отряды Ордо: " + prog + " / 3", W / 2, H - 56,
        { color: _pal("yurtWhite", "#F5ECD7"), size: 14, align: "center" });
      _txt(c, "Тёмный Хан не посылает сильных — он наблюдает.", W / 2, H - 36,
        { color: _pal("crackLight", "#7A3CE0"), size: 12, align: "center" });
      if (CH6.fight < 3) {
        var blink = (Math.floor(CH6.bannerT / 460) % 2) === 0;
        if (blink) {
          _txt(c, "Z — встретить отряд", W / 2, H - 14, { color: _pal("gold", "#D4A017"), size: 14, align: "center" });
        }
      }
    },
    onKey: function (e) {
      if (!e || this._engaging) return;
      if ((e.action === "confirm" || e.action === "dombra") && CH6.fight < 3 && CH6.introT > 800) {
        this._engaging = true;
        _ch6StartFight(CH6.fight);
      }
    }
  });

  /* --------------------------------------------------------------------- */
  /* 6.1  ПРИЗНАНИЕ АЯУЛЫМ — night camp confession. Verbatim + CHOICE A/B/C */
  /*      A: 'Я знаю.' (if all father-memories collected) — she stays.     */
  /*      B: 'Я злюсь. Но ты сказала правду. Этого достаточно.' — molchat.  */
  /*      C: 'Уходи из лагеря.' -> ayaulymLeft; returns alone on Қара       */
  /*         Сұңқар in the final battle to save Ержан.                      */
  /* --------------------------------------------------------------------- */

  /* whether the player "understood earlier" — gates the A option's flavour,
     and per DESIGN the A line itself is available when all father-memories
     are collected (all 12 petroglyphs). We expose A always, but mark it. */
  function _ayaulymKnewEarlier() { return _memCount() >= 12; }

  var TREE_ch6_confess = {
    start: { speaker: "Аяулым", portrait: "ayaulym", note: "смотрит на угли; долгое молчание",
             text: "Мне нужно кое-что сказать. До завтра.", goto: "e1" },
    e1:    { speaker: "Ержан", portrait: "erzhan",
             text: "Говори.", goto: "a2" },
    a2:    { speaker: "Аяулым", portrait: "ayaulym",
             text: "Два года назад Серік отправил меня в аул Жетіқаз. Наблюдать. Я должна была сообщать ему, если кто-то начнёт искать дорогу к Тас Жүрек.", goto: "a3" },
    a3:    { speaker: "Аяулым", portrait: "ayaulym", note: "Ержан не двигается, смотрит на огонь",
             text: "Я сообщала. Полгода. Потом перестала.", goto: "e2" },
    e2:    { speaker: "Ержан", portrait: "erzhan",
             text: "Почему?", goto: "a4" },
    a4:    { speaker: "Аяулым", portrait: "ayaulym",
             text: "Потому что твоя мать каждое утро выходила из юрты и смотрела на восток. Ждала тебя — ты пас лошадей далеко. И я поняла, что не могу участвовать в том, что может её сломать.", goto: "e3" },
    e3:    { speaker: "Ержан", portrait: "erzhan", note: "поднимает взгляд",
             text: "Почему ты говоришь мне это сейчас?", goto: "a5" },
    a5:    { speaker: "Аяулым", portrait: "ayaulym", note: "прямо",
             text: "Потому что завтра я могу не вернуться. И я не хочу, чтобы ты узнал это от кого-то другого.", goto: "choose" },

    choose: { speaker: "Ержан", portrait: "erzhan",
              text: "...", choices: [
        { label: "Я знаю.", goto: "optA", set: { ch6_confess_choice: "A", ayaulymTrust: 2 } },
        { label: "Я злюсь. Но ты сказала правду. Этого достаточно.", goto: "optB",
          set: { ch6_confess_choice: "B", ayaulymTrust: 1 } },
        { label: "Уходи из лагеря.", goto: "optC",
          set: { ch6_confess_choice: "C", ayaulymLeft: true } }
      ] },

    /* A: 'Я знаю.' — calm. She stays. (If all father-memories collected, Ержан
       had understood it earlier; the node reflects that quiet certainty.) */
    optA:  { speaker: "Аяулым", portrait: "ayaulym", note: "смотрит на него долго",
             text: "Знаешь.", goto: "optA2" },
    optA2: { speaker: "Ержан", portrait: "erzhan", note: "тихо",
             text: "Я собрал память отца по всей степи. Он тоже когда-то служил Серіку — и тоже перестал. Я понял про тебя раньше, чем ты сказала. И всё равно ты здесь, рядом со мной. Это и есть ответ.", goto: "optA3" },
    optA3: { speaker: "Аяулым", portrait: "ayaulym", note: "впервые за долгое время — что-то отпускает её",
             text: "Тогда завтра я вернусь. Обещаю.",
             onEnd: function () { _ch6ConfessResolve("A"); } },

    /* B: anger, but the truth is enough. They sit in silence together. */
    optB:  { speaker: "Аяулым", portrait: "ayaulym", note: "кивает; не оправдывается",
             text: "Достаточно.", goto: "optB2" },
    optB2: { speaker: "", portrait: "",
             note: "Они молчат вместе. Огонь догорает. Иногда это — самый честный разговор.",
             text: "Ержан и Аяулым сидят у огня. Никто больше ничего не говорит. И в этом молчании — больше доверия, чем в любых словах.",
             onEnd: function () { _ch6ConfessResolve("B"); } },

    /* C: 'Уходи из лагеря.' — she leaves. Returns alone in the final battle. */
    optC:  { speaker: "Аяулым", portrait: "ayaulym", note: "встаёт; лицо неподвижно",
             text: "Хорошо.", goto: "optC2" },
    optC2: { speaker: "Аяулым", portrait: "ayaulym", note: "у края света костра — оборачивается",
             text: "Я ухожу. Но Қара Сұңқар остаётся в небе над тобой. Беркут не слушает приказов — даже моих. Береги себя, сын Қайрата.", goto: "optC3" },
    optC3: { speaker: "", portrait: "",
             note: "Аяулым уходит в темноту. Орёл кричит один раз — высоко, далеко.",
             text: "Аяулым уходит из лагеря. Её силуэт растворяется в серой ночи.",
             onEnd: function () { _ch6ConfessResolve("C"); } }
  };

  function _ch6ConfessResolve(choice) {
    if (choice === "C") {
      try { if (typeof G !== "undefined" && G) G.ayaulymLeft = true; } catch (e) {}
      _flag("ayaulymLeftCamp", true);
      try { _cue("sfx_eagle_cry"); } catch (e2) {}
    } else {
      /* she stays; mark the reconciliation flag the endings can read alongside
         ayaulymTrust. (ayaulymTrust already bumped by the choice's set{}.) */
      try { if (typeof G !== "undefined" && G) G.ayaulymLeft = false; } catch (e) {}
      _flag("ayaulymStayed", true);
    }
    _flag("ch6_confess_done", true);
  }

  /* night-camp scene: a dark steppe at night, a campfire, two figures by it,
     the sleeping coalition behind. Hosts the confession dialogue. */
  Scenes.register("ch6_ayaulym_confess", {
    enter: function () {
      if (typeof G !== "undefined" && G) G.chapter = 6;
      this.t = 0;
      this._started = false;
      this._fireParts = [];
      var i;
      for (i = 0; i < 18; i++) {
        this._fireParts.push({ x: (Math.random() * 2 - 1) * 10, y: -Math.random() * 26, s: 2 + Math.random() * 2, life: Math.random() });
      }
      try { _stopMusic(); } catch (e) {}
      try { _cue("theme_serik"); } catch (e2) {}
    },
    exit: function () {},
    update: function (dt) {
      if (typeof dt !== "number" || !(dt >= 0)) dt = 16;
      this.t += dt;
      /* particles */
      var i, p;
      for (i = 0; i < this._fireParts.length; i++) {
        p = this._fireParts[i];
        p.y -= dt * 0.02;
        p.life -= dt * 0.0009;
        if (p.life <= 0 || p.y < -34) {
          p.x = (Math.random() * 2 - 1) * 10; p.y = -Math.random() * 4;
          p.s = 2 + Math.random() * 2; p.life = 0.7 + Math.random() * 0.3;
        }
      }
      if (_dialogueActive()) {
        if (typeof Dialogue !== "undefined" && Dialogue.update) { try { Dialogue.update(dt); } catch (e) {} }
        return;
      }
      /* start the confession after a brief settle, once per scene */
      if (!this._started && this.t > 900) {
        this._started = true;
        if (_hasFlag("ch6_confess_done")) {
          /* already done (returned to scene) -> proceed to the labyrinth */
          _go("ch6_labyrinth");
          return;
        }
        _dialogue(TREE_ch6_confess, function () { _go("ch6_labyrinth"); });
      }
    },
    render: function (c) {
      var W = _W(), H = _H();
      /* night sky with a few cold stars */
      c.fillStyle = _pal("night", "#0E0F1A");
      c.fillRect(0, 0, W, H);
      c.fillStyle = "rgba(199,214,222,0.35)";
      var s;
      for (s = 0; s < 50; s++) {
        var sx = (s * 89 + 17) % W;
        var sy = (s * 41 + 7) % (H * 0.5);
        var tw = 0.4 + 0.6 * Math.abs(Math.sin((this.t / 700) + s));
        c.globalAlpha = tw * 0.5;
        c.fillRect(sx, sy, 2, 2);
        c.globalAlpha = 1;
      }
      /* grey ground band */
      c.fillStyle = _lerpColor(_pal("deadGreen", "#6E7059"), _pal("night", "#0E0F1A"), 0.5);
      c.fillRect(0, H * 0.62, W, H * 0.38);

      /* the sleeping coalition behind — a row of dim yurts/figures */
      var i;
      for (i = 0; i < 6; i++) {
        var yx = 70 + i * 120;
        c.fillStyle = _lerpColor(_pal("yurtWhite", "#F5ECD7"), _pal("night", "#0E0F1A"), 0.72);
        c.beginPath();
        c.moveTo(yx, H * 0.60);
        c.lineTo(yx + 26, H * 0.60);
        c.lineTo(yx + 13, H * 0.60 - 20);
        c.closePath();
        c.fill();
      }

      /* the campfire (center-low) + two figures beside it */
      var fx = W / 2, fy = H * 0.74;
      /* fire glow */
      var grad = c.createRadialGradient(fx, fy, 6, fx, fy, 140);
      grad.addColorStop(0, "rgba(232,178,90,0.45)");
      grad.addColorStop(1, "rgba(232,178,90,0)");
      c.fillStyle = grad;
      c.fillRect(fx - 150, fy - 150, 300, 220);
      /* logs */
      c.fillStyle = _pal("earth", "#7D4E2A");
      c.fillRect(fx - 18, fy + 6, 36, 6);
      c.fillRect(fx - 12, fy + 10, 30, 5);
      /* flame particles */
      for (i = 0; i < this._fireParts.length; i++) {
        var p = this._fireParts[i];
        var a = _clamp(p.life, 0, 1);
        c.globalAlpha = a;
        c.fillStyle = _lerpColor(_pal("caveFire", "#E8B25A"), _pal("feltRed", "#C0392B"), 1 - a);
        c.fillRect(fx + p.x - p.s / 2, fy + p.y, p.s, p.s);
        c.globalAlpha = 1;
      }
      /* Ержан (left of fire) */
      if (!_spr(c, "erzhan", fx - 70, fy - 36, 2, {})) {
        c.fillStyle = _pal("skyBlue", "#2980B9");
        c.fillRect(fx - 70, fy - 30, 14, 30);
      }
      /* Аяулым (right of fire) — only while she is still present */
      var gone = _hasFlag("ch6_confess_done") && _hasFlag("ayaulymLeftCamp");
      if (!gone) {
        if (!_spr(c, "ayaulym", fx + 52, fy - 36, 2, {})) {
          c.fillStyle = _pal("feltRed", "#C0392B");
          c.fillRect(fx + 52, fy - 30, 14, 30);
        }
      } else {
        /* the eagle wheeling high where she went */
        _spr(c, "eagle", fx + 120, fy - 150, 2, {});
      }

      /* caption while no dialogue (the settle beat) */
      if (!_dialogueActive() && !this._started) {
        c.save();
        c.globalAlpha = 0.9;
        _txt(c, "Ночной привал. Ержан и Аяулым — у огня, чуть в стороне от лагеря.", W / 2, 40,
          { color: _pal("boneGrey", "#B8B4A4"), size: 13, align: "center" });
        c.restore();
      }

      /* dialogue overlay */
      if (_dialogueActive() && typeof Dialogue !== "undefined" && Dialogue.render) {
        try { Dialogue.render(c); } catch (e) {}
      }
    },
    onKey: function (e) {
      if (_dialogueActive()) {
        if (typeof Dialogue !== "undefined" && Dialogue.onKey) { try { Dialogue.onKey(e); } catch (er) {} }
        return;
      }
    }
  });

  /* --------------------------------------------------------------------- */
  /* 6.2  ЛАБИРИНТ ИЛЛЮЗИЙ — illusion labyrinth (last dungeon before Ordo). */
  /*      Ержан sees a false happy steppe: living parents (mother young,    */
  /*      laughing; father alive, building a yurt) and a voice offering to  */
  /*      stay. Verbatim voice line.                                        */
  /*      Stay >60s -> Нұрлан-ghost appears, plays the first passage (the   */
  /*      one Ержан can't finish), and the illusion shatters by itself.     */
  /*      Exit at once -> Серік's voice: "Хорошо. Значит, ты готов знать    */
  /*      правду." -> ch7.                                                  */
  /* --------------------------------------------------------------------- */

  /* The exact voice line from DESIGN.md (the illusion's offer to stay). */
  var ILLUSION_VOICE =
    "Ты можешь остаться здесь. Просто повернись. Забудь про Тас Жүрек. Зачем тебе это? Твоя семья здесь.";
  /* Серік's verbatim line when the player tries to leave at once. */
  var SERIK_READY_LINE = "Хорошо. Значит, ты готов знать правду.";

  Scenes.register("ch6_labyrinth", {
    blockPause: true,   // a cutscene-like illusion; suppress the pause menu
    enter: function () {
      if (typeof G !== "undefined" && G) G.chapter = 6;
      this.t = 0;             // ms inside the illusion
      this.phase = "illusion"; // illusion | shatter | leaving | done
      this.voiceT = 0;
      this.promptBlink = 0;
      this._resolved = false;
      this._birds = [];
      var i;
      for (i = 0; i < 8; i++) this._birds.push({ x: Math.random() * _W(), y: 60 + Math.random() * 120, sp: 12 + Math.random() * 18 });
      try { _stopMusic(); } catch (e) {}
      /* the false steppe is gentle and alive — the aul/village theme, warped
         by being a lie. We use the gentle theme to make the temptation real. */
      try { _cue("theme_aul"); } catch (e2) {}
    },
    exit: function () {},
    update: function (dt) {
      if (typeof dt !== "number" || !(dt >= 0)) dt = 16;
      this.promptBlink += dt;
      if (this.phase !== "illusion") {
        /* shatter / leaving handled by their own timers/cutscenes */
        if (this.phase === "shatter") {
          this.t += dt;
        }
        return;
      }

      this.t += dt;
      /* drifting illusory birds */
      var i;
      for (i = 0; i < this._birds.length; i++) {
        this._birds[i].x += this._birds[i].sp * (dt / 1000);
        if (this._birds[i].x > _W() + 20) { this._birds[i].x = -20; this._birds[i].y = 60 + Math.random() * 120; }
      }

      /* the voice repeats its offer periodically */
      this.voiceT += dt;

      /* CHOICE: leave at once (cancel / dombra / walking "back") OR stay.
         Pressing cancel(X)/confirm-to-leave-prompt is the "try to leave" act.
         Staying >60s triggers the Нұрлан rescue. */
      var leave = false;
      if (typeof Input !== "undefined" && Input.pressed) {
        if (Input.pressed("cancel")) leave = true;   // X / Esc = refuse the illusion
        if (Input.pressed("dombra")) leave = true;   // playing the dombra = refuse
      }
      if (leave && !this._resolved) {
        this._leaveAtOnce();
        return;
      }

      /* staying past 60 seconds -> Нұрлан-ghost shatters the illusion */
      if (this.t >= 60000 && !this._resolved) {
        this._shatter();
      }
    },

    /* leaving at once -> Серік's verbatim line -> ch7 */
    _leaveAtOnce: function () {
      if (this._resolved) return;
      this._resolved = true;
      this.phase = "leaving";
      _flag("ch6_labyrinth_left_at_once", true);
      try { _stopMusic(); } catch (e) {}
      var tl = [
        { at: 0, cue: "theme_serik" },
        { at: 0, text: "Ержан не оборачивается. Он делает шаг — сквозь смех матери, мимо рук отца." },
        { at: 3600, text: "Иллюзия идёт трещинами, как стекло. За ней — холодный камень Ордо." },
        { at: 7400, text: "Голос Серіка, тихий, отовсюду:" },
        { at: 9600, text: "«" + SERIK_READY_LINE + "»" },
        { at: 13200, text: "" },
        { at: 13800 }
      ];
      var self = this;
      _cutscene(tl, function () { self._toChapter7(); });
    },

    /* staying too long -> Нұрлан-ghost plays the first passage; illusion breaks */
    _shatter: function () {
      if (this._resolved) return;
      this._resolved = true;
      this.phase = "shatter";
      this.t = 0;
      try { _stopMusic(); } catch (e) {}
      /* he does not speak — he only plays the first passage (the unfinished
         kui) — and the illusion crumbles by itself. */
      var tl = [
        { at: 0, text: "Ты остаёшься. Мать смеётся. Отец поднимает шанырак. Так тепло. Так легко остаться." },
        { at: 4200, text: "Из света выходит Нұрлан-призрак. Он ничего не говорит." },
        { at: 8000, cue: "kui_erzhan_unfinished" },
        { at: 8000, text: "Он берёт домбру и играет — тот самый первый пассаж. Тот, что ты не можешь закончить." },
        { at: 12800, text: "Иллюзия дрожит. Мать оборачивается — у неё нет лица. Отец растворяется в сером." },
        { at: 16800, text: "Ложь рассыпается сама. Остаёшься только ты — и правда впереди." },
        { at: 21200, text: "" },
        { at: 21800 }
      ];
      var self = this;
      _cutscene(tl, function () { self._toChapter7(); });
    },

    _toChapter7: function () {
      if (this.phase === "done") return;
      this.phase = "done";
      if (typeof G !== "undefined" && G) G.chapter = 7;
      _go("ch7_throne");
    },

    render: function (c) {
      var W = _W(), H = _H();

      if (this.phase === "illusion") {
        /* the FALSE happy steppe: warm, green, alive — everything the real
           dead-lands are not. Bright sky, green grass, the family scene. */
        /* sky gradient (warm dawn) */
        var g = c.createLinearGradient(0, 0, 0, H * 0.6);
        g.addColorStop(0, _pal("skyHigh", "#C7D6DE"));
        g.addColorStop(1, _lerpColor(_pal("yurtWhite", "#F5ECD7"), _pal("gold", "#D4A017"), 0.2));
        c.fillStyle = g;
        c.fillRect(0, 0, W, H * 0.6);
        /* sun */
        c.fillStyle = _lerpColor(_pal("gold", "#D4A017"), _pal("yurtWhite", "#F5ECD7"), 0.4);
        c.beginPath(); c.arc(W * 0.78, H * 0.22, 34, 0, Math.PI * 2); c.fill();
        /* living green grass */
        c.fillStyle = _pal("grassLight", "#7CA646");
        c.fillRect(0, H * 0.6, W, H * 0.4);
        c.fillStyle = _pal("grassDark", "#4E7A33");
        for (var bx = 0; bx < W; bx += 18) {
          c.fillRect(bx, H * 0.6 + ((bx / 18) % 2 ? 6 : 0), 9, 4);
        }
        /* drifting birds */
        var i;
        c.fillStyle = _pal("outline", "#1A0A00");
        for (i = 0; i < this._birds.length; i++) {
          var b = this._birds[i];
          c.fillRect(b.x, b.y, 4, 1);
          c.fillRect(b.x + 4, b.y - 1, 3, 1);
          c.fillRect(b.x - 3, b.y - 1, 3, 1);
        }

        /* the family scene, center-stage:
           — mother (young, laughing) left
           — father (alive, building a yurt) right
           — a half-built yurt frame between them */
        var cy = H * 0.66;
        /* yurt frame being built */
        c.strokeStyle = _pal("earth", "#7D4E2A");
        c.lineWidth = 3;
        c.beginPath();
        c.arc(W / 2, cy + 26, 46, Math.PI, 0); c.stroke();
        c.beginPath();
        c.moveTo(W / 2 - 46, cy + 26); c.lineTo(W / 2 + 46, cy + 26); c.stroke();
        c.beginPath(); c.moveTo(W / 2, cy - 20); c.lineTo(W / 2, cy + 26); c.stroke();

        /* mother */
        if (!_spr(c, "mother", W / 2 - 120, cy - 10, 3, {})) {
          c.fillStyle = _pal("feltRed", "#C0392B");
          c.fillRect(W / 2 - 116, cy - 4, 16, 34);
        }
        /* a tiny "laugh" shimmer above the mother */
        c.save();
        c.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(this.t / 500));
        _txt(c, "ха-ха", W / 2 - 108, cy - 18, { color: _pal("gold", "#D4A017"), size: 12, align: "center", shadow: false });
        c.restore();

        /* father (building the yurt) */
        if (!_spr(c, "nurlan", W / 2 + 100, cy - 10, 3, {})) {
          /* fall back to a generic figure if no father sprite; nurlan stands in
             only visually — narratively this is Қайрат, the living father. */
          c.fillStyle = _pal("earth", "#7D4E2A");
          c.fillRect(W / 2 + 100, cy - 4, 16, 34);
        }

        /* the warm overlay vignette to sell the dream */
        var vg = c.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 460);
        vg.addColorStop(0, "rgba(0,0,0,0)");
        vg.addColorStop(1, "rgba(212,160,23,0.10)");
        c.fillStyle = vg;
        c.fillRect(0, 0, W, H);

        /* the VOICE caption — the verbatim offer to stay, fading in/out */
        var vphase = (this.voiceT % 7000);
        var valpha = 0;
        if (vphase < 5200) valpha = _clamp(Math.sin((vphase / 5200) * Math.PI), 0, 1);
        if (this.t < 1400) valpha = _clamp(this.t / 1400, 0, 1) * 0.9; // ensure it shows immediately
        if (valpha > 0.02) {
          c.save();
          c.globalAlpha = valpha;
          /* a soft plate behind the voice text */
          c.fillStyle = "rgba(8,8,12,0.32)";
          c.fillRect(40, H - 132, W - 80, 64);
          _txt(c, ILLUSION_VOICE, W / 2, H - 100,
            { color: _pal("yurtWhite", "#F5ECD7"), size: 16, align: "center", maxWidth: W - 120, lineHeight: 22 });
          c.restore();
        }

        /* the refuse prompt (kept subtle — the game does not push the player) */
        var blink = (Math.floor(this.promptBlink / 560) % 2) === 0;
        if (blink) {
          c.save();
          c.globalAlpha = 0.7;
          _txt(c, "X — отвернуться   ·   Space — взять домбру", W / 2, H - 34,
            { color: _pal("boneGrey", "#B8B4A4"), size: 12, align: "center" });
          c.restore();
        }

        /* a faint, almost-subliminal timer feel: the longer you stay, the more
           a grey edge creeps in from the borders (the real world bleeding in).
           Never numeric — DESIGN: "Никто этого не объясняет." */
        var creep = _clamp(this.t / 60000, 0, 1) * 0.5;
        if (creep > 0.01) {
          c.save();
          c.globalAlpha = creep;
          c.fillStyle = _pal("greySteppe", "#8A8A7A");
          var band = 60 * creep + 8;
          c.fillRect(0, 0, W, band);
          c.fillRect(0, H - band, W, band);
          c.fillRect(0, 0, band, H);
          c.fillRect(W - band, 0, band, H);
          c.restore();
        }
        return;
      }

      /* SHATTER / LEAVING: the Cutscene overlay draws captions over us; we just
         paint a darkening field beneath it as the lie collapses to grey stone. */
      c.fillStyle = _pal("caveDark", "#171826");
      c.fillRect(0, 0, W, H);
      /* fractured-glass shards radiating from center */
      c.save();
      c.translate(W / 2, H / 2);
      c.strokeStyle = _lerpColor(_pal("crackLight", "#7A3CE0"), _pal("greySteppe", "#8A8A7A"), 0.4);
      c.lineWidth = 2;
      var k;
      for (k = 0; k < 14; k++) {
        var ang = (k / 14) * Math.PI * 2 + (this.t * 0.0006);
        var r1 = 30, r2 = 220 + (k % 3) * 60;
        c.globalAlpha = 0.5 + 0.4 * Math.sin(this.t / 300 + k);
        c.beginPath();
        c.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        c.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
        c.stroke();
      }
      c.restore();
      c.globalAlpha = 1;
    },

    onKey: function (e) {
      if (!e) return;
      if (this.phase !== "illusion") return;
      /* X / Esc here is the refuse act (the engine routes cancel to pause only
         if blockPause is false; we set blockPause=true so cancel reaches us). */
      if (e.action === "cancel" || e.action === "dombra") {
        if (!this._resolved) this._leaveAtOnce();
      }
    }
  });

})();
