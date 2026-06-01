/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 60-memory.js
   Owns: Memory, Quests, Endings.
   - Memory: 12 petroglyphs (petro_01..petro_12). Memory.collect(id) records
     the id, plays sfx_petroglyph, and fires a scripted flashback via the
     Cutscene API (Серік / Қайрат backstory — батыр 40 years ago, meeting
     Қайрат, the first cracks of Тас Жүрек). Without the 12 his motivation is
     opaque; with all 12 it is clear.
   - Quests: tiny state machine over G.quests[id] ("inactive"/"active"/"done").
     Completing a region quest heals that region via Decay.heal.
   - Endings: Endings.resolve() -> "a"|"b"|"c", deterministic priority so
     exactly one letter is returned. Tracks the HIDDEN moral weight / kill
     counter logic (never surfaced in UI).
   RAW JS — concatenated 7th inside the single <script> of index.html.
   Loads BEFORE 70-ui.js, so Cutscene may not exist yet at top-level; every
   cross-module call is guarded and only ever runs inside a callback.
   ===================================================================== */

/* ===================================================================== */
/* MEMORY — petroglyph memories + flashback content                      */
/* ===================================================================== */
var Memory = (function () {

  /* The 12 canonical petroglyph ids, in narrative order. Chapter files place
     these on maps and call Memory.collect(id). The ORDER here is the order of
     the unfolding Серік/Қайрат backstory, but collect() is order-independent:
     each id always plays its own fixed flashback. */
  var IDS = [
    "petro_01", "petro_02", "petro_03", "petro_04",
    "petro_05", "petro_06", "petro_07", "petro_08",
    "petro_09", "petro_10", "petro_11", "petro_12"
  ];

  /* Per-petroglyph captions for the flashback cutscene. These are short
     scripted backstory beats (Серік 40 years ago, the war won and the peace
     lost, meeting Қайрат, the first cracks of Тас Жүрек). They are AUTHORED
     here — the source DESIGN.md describes this backstory in §2.4/§2.5 in
     narration; the in-game character LINES that exist verbatim in DESIGN.md
     (Серік's and the mother's сlosing words, Қайрат's confession) are
     reproduced EXACTLY where used below. */
  var FLASHBACKS = {

    /* ---- petro_01 : the steppe is memory (the game's thesis line) ----- */
    petro_01: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Наскальный рисунок. Всадник. Под ним — трещина в камне." },
      { at: 2600, text: "Голос старика, которого ты ещё не встречал:" },
      { at: 5200, text: "«Степь — это не земля. Степь — это то, что мы помним о земле. Пока помним — она живёт.»" },
      { at: 9600, text: "" },
      { at: 10200 }
    ],

    /* ---- petro_02 : young Серік, the war for the steppe (40 yrs ago) -- */
    petro_02: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: молодой батыр с копьём. Сорок лет назад." },
      { at: 2800, text: "Серік Байұлы. Тогда — воин. Он воевал за объединение степи против внешних захватчиков." },
      { at: 7200, text: "Он выиграл битву." },
      { at: 9400, text: "" },
      { at: 10000 }
    ],

    /* ---- petro_03 : won the battle, lost the peace -------------------- */
    petro_03: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: три юрты, повёрнутые спинами друг к другу." },
      { at: 2800, text: "Он выиграл битву. Но проиграл мир." },
      { at: 5400, text: "Жузы поссорились. Народ разошёлся." },
      { at: 8000, text: "Память о той войне исчезла за двадцать лет." },
      { at: 11200, text: "" },
      { at: 11800 }
    ],

    /* ---- petro_04 : the first crack appears -------------------------- */
    petro_04: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: камень-сердце. У северного края — одна тонкая трещина." },
      { at: 3200, text: "Он видел, как Тас Жүрек начинает трескаться — буквально, физически." },
      { at: 7400, text: "Когда дети перестают петь песни предков — камень трескается на волосок." },
      { at: 11400, text: "" },
      { at: 12000 }
    ],

    /* ---- petro_05 : the silence that cracks the heart ---------------- */
    petro_05: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: домбра, лежащая в пыли. Струны порваны." },
      { at: 3000, text: "Когда в ауле три дня не звучит домбра — он трескается на волосок." },
      { at: 7200, text: "Когда дети не помнят имён дедов — на ещё один." },
      { at: 11000, text: "" },
      { at: 11600 }
    ],

    /* ---- petro_06 : Серік meets Қайрат ------------------------------- */
    petro_06: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: двое мужчин у одного огня. Один старше, один моложе." },
      { at: 3200, text: "Так Серік встретил Қайрата — отца Ержана." },
      { at: 6600, text: "Қайрат поверил ему. Что сердце степи нужно защитить от людей, которые снова его сломают." },
      { at: 11600, text: "" },
      { at: 12200 }
    ],

    /* ---- petro_07 : Қайрат serves Серік twenty years ----------------- */
    petro_07: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: следопыт, читающий следы на земле." },
      { at: 3000, text: "Қайрат работал на Серіка двадцать лет." },
      { at: 6000, text: "Собирал информацию. Следил за теми, кто мог найти Тас Жүрек раньше." },
      { at: 10600, text: "" },
      { at: 11200 }
    ],

    /* ---- petro_08 : the decision — take the heart, hide it ------------ */
    petro_08: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: рука, уносящая светящийся камень с поля во тьму." },
      { at: 3400, text: "Тогда он принял решение: забрать сердце степи и спрятать его — пока народ не вспомнит себя." },
      { at: 8800, text: "Это не злодейство. Это отчаяние человека, который любит слишком сильно." },
      { at: 13600, text: "" },
      { at: 14200 }
    ],

    /* ---- petro_09 : the child with the dombra (Қайрат turns) --------- */
    petro_09: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: маленький ребёнок стучит по домбре. Смеётся." },
      { at: 3400, text: "Қайрат: «А потом я увидел тебя. Тебе было три года, ты нашёл домбру и начал на ней стучать. Смеялся.»" },
      { at: 9200, text: "«И я понял — я не могу делать это дальше. Ушёл от Серіка. Он не простил.»" },
      { at: 14000, text: "" },
      { at: 14600 }
    ],

    /* ---- petro_10 : Қайрат abandoned to the steppe ------------------- */
    petro_10: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: одинокая фигура в пустой степи. Вокруг — серость." },
      { at: 3400, text: "Серік не убил его. Он просто больше не защищал." },
      { at: 7000, text: "А в степи много опасностей для тех, кто один." },
      { at: 11000, text: "" },
      { at: 11600 }
    ],

    /* ---- petro_11 : the book of cracks (forty years of record) ------- */
    petro_11: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: раскрытая книга. Страницы исписаны трещинами." },
      { at: 3400, text: "Сорок лет он записывал. Каждый год — новая трещина." },
      { at: 7200, text: "Первая запись: маленькая трещина у северного края. Последняя: семнадцать трещин. Одна — через весь камень." },
      { at: 13400, text: "" },
      { at: 14000 }
    ],

    /* ---- petro_12 : he was waiting for the son of Қайрат ------------- */
    petro_12: [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Рисунок: старик у огня. Перед ним — пустое место, как будто кого-то ждут." },
      { at: 3400, text: "Серік не украл сердце. Он подобрал осколки." },
      { at: 7000, text: "Но камень не может жить у него. Он должен жить в степи." },
      { at: 11000, text: "Он ждал того, кто знает незаконченный кюй. Он ждал сына Қайрата." },
      { at: 15800, text: "Теперь ты понимаешь его." },
      { at: 18600, text: "" },
      { at: 19200 }
    ]
  };

  /* a minimal, always-valid flashback used if an unknown id is ever passed —
     keeps Cutscene.play from receiving a bad timeline (defensive). */
  function _fallbackFlashback(id) {
    return [
      { at: 0,    cue: "theme_serik" },
      { at: 0,    text: "Древний наскальный рисунок. Память степи." },
      { at: 3000, text: "" },
      { at: 3600 }
    ];
  }

  function _ensureMemArray() {
    if (!G) return;
    if (!Array.isArray(G.memories)) G.memories = [];
  }

  return {
    /* the canonical id list (read-only convenience for chapter files) */
    IDS: IDS.slice(),

    /* true if this petroglyph is one of the 12 canonical ids */
    isPetroglyph: function (id) {
      for (var i = 0; i < IDS.length; i++) { if (IDS[i] === id) return true; }
      return false;
    },

    /* has this petroglyph already been collected? */
    has: function (id) {
      _ensureMemArray();
      if (!G || !Array.isArray(G.memories)) return false;
      return G.memories.indexOf(id) !== -1;
    },

    /* number collected, 0..12 */
    count: function () {
      _ensureMemArray();
      return (G && Array.isArray(G.memories)) ? G.memories.length : 0;
    },

    /* all 12 collected? */
    complete: function () {
      return this.count() >= IDS.length;
    },

    /* return the Cutscene timeline array for a petroglyph id (always valid) */
    flashback: function (id) {
      var tl = FLASHBACKS[id];
      if (tl && Object.prototype.toString.call(tl) === "[object Array]") {
        return tl;
      }
      return _fallbackFlashback(id);
    },

    /* collect a petroglyph: record it, play the sfx, fire the flashback.
       Idempotent — collecting an already-held id does nothing. `onDone`
       (optional) fires after the flashback (or immediately if no Cutscene). */
    collect: function (id, onDone) {
      _ensureMemArray();
      if (!G || !Array.isArray(G.memories)) {
        if (typeof onDone === "function") { try { onDone(); } catch (e) {} }
        return false;
      }
      // already have it -> no-op (but still run onDone so callers can continue)
      if (G.memories.indexOf(id) !== -1) {
        if (typeof onDone === "function") { try { onDone(); } catch (e) {} }
        return false;
      }
      G.memories.push(id);

      // petroglyph collected sting (guarded)
      if (typeof Audio !== "undefined" && Audio && typeof Audio.playCue === "function") {
        try { Audio.playCue("sfx_petroglyph"); } catch (e) {}
      }

      // signal listeners (guarded; never throws out)
      if (typeof EventBus !== "undefined" && EventBus && typeof EventBus.emit === "function") {
        try { EventBus.emit("memory:collect", { id: id, count: G.memories.length }); } catch (e) {}
      }

      // fire the scripted flashback via the Cutscene overlay (guarded — Cutscene
      // is defined in 70-ui.js which loads AFTER this file, so it always exists
      // by the time collect() can be called from a scene callback; if for any
      // reason it is missing, we just record silently and continue).
      var tl = this.flashback(id);
      if (typeof Cutscene !== "undefined" && Cutscene && typeof Cutscene.play === "function") {
        try {
          Cutscene.play(tl, function () {
            if (typeof onDone === "function") { try { onDone(); } catch (e) {} }
          });
        } catch (e) {
          if (typeof onDone === "function") { try { onDone(); } catch (e2) {} }
        }
      } else {
        if (typeof onDone === "function") { try { onDone(); } catch (e) {} }
      }
      return true;
    },

    /* list of ids still missing (for optional HUD / completion hints) */
    missing: function () {
      _ensureMemArray();
      var out = [];
      for (var i = 0; i < IDS.length; i++) {
        if (!this.has(IDS[i])) out.push(IDS[i]);
      }
      return out;
    }
  };
})();

/* ===================================================================== */
/* QUESTS — state machine + region healing on completion                 */
/* ===================================================================== */
var Quests = (function () {

  /* Quest -> region mapping. Completing a quest that has a region calls
     Decay.heal(region), restoring colour to that part of the steppe. Region
     ids match the Decay/World region ids used by the world. Quests not listed
     here simply have no region to heal (story-only quests). Chapter files
     register their own quests by id; these are the canonical region quests. */
  var QUEST_REGION = {
    // Chapter 1 — Аул Жетіқаз: the four points of the compass / dying land
    q_four_winds:     "jetiqaz",
    q_jetiqaz:        "jetiqaz",
    // Chapter 2 — Долина Кобланды: free the children, weaken Жалмауыз
    q_jalmauyz:       "koblandy",
    q_children:       "koblandy",
    q_koblandy:       "koblandy",
    // Chapter 3 — Жер Асты: release the lost spirits / put Дөнен to rest
    q_zher_asty:      "zher_asty",
    q_donen:          "zher_asty",
    // Chapter 4 — Хан Тәңірі: lift Аяулым's curse, reach Тәңір-Ана
    q_ayaulym_curse:  "khan_tangiri",
    q_khan_tangiri:   "khan_tangiri",
    // Chapter 5 — the three жузы: each alliance heals its aul's region
    q_dosan:          "uly_juz",
    q_marat:          "orta_juz",
    q_erlan:          "kishi_juz",
    // Chapter 6 — Қара Жол: the march north through the dead lands
    q_qara_jol:       "qara_jol",
    // Сарыарка central hub
    q_saryarka:       "saryarka"
  };

  function _ensureQuests() {
    if (!G) return;
    if (!G.quests || typeof G.quests !== "object") G.quests = {};
  }

  /* normalize whatever is stored to one of the three canonical strings */
  function _norm(v) {
    if (v === "active" || v === "done") return v;
    return "inactive";
  }

  return {
    /* region a quest heals on completion (or null) */
    regionFor: function (id) {
      return Object.prototype.hasOwnProperty.call(QUEST_REGION, id) ? QUEST_REGION[id] : null;
    },

    /* current state of a quest: "inactive" | "active" | "done" */
    state: function (id) {
      _ensureQuests();
      if (!G || !G.quests) return "inactive";
      return _norm(G.quests[id]);
    },

    isActive: function (id) { return this.state(id) === "active"; },
    isDone:   function (id) { return this.state(id) === "done"; },

    /* start a quest: inactive -> active. No-op if already active OR done. */
    start: function (id) {
      _ensureQuests();
      if (!G || !G.quests || !id) return;
      var cur = _norm(G.quests[id]);
      if (cur === "done" || cur === "active") return;
      G.quests[id] = "active";
      if (typeof Audio !== "undefined" && Audio && typeof Audio.playCue === "function") {
        try { Audio.playCue("sfx_select"); } catch (e) {}
      }
      if (typeof EventBus !== "undefined" && EventBus && typeof EventBus.emit === "function") {
        try { EventBus.emit("quest:start", { id: id }); } catch (e) {}
      }
    },

    /* optional progress bookkeeping. Stores a per-quest step under a private
       map; never downgrades state. Safe to call with just `id`. */
    advance: function (id, step) {
      _ensureQuests();
      if (!G || !G.quests || !id) return;
      var cur = _norm(G.quests[id]);
      if (cur === "done") return;          // finished quests don't regress
      if (cur === "inactive") { G.quests[id] = "active"; cur = "active"; }
      // keep lightweight progress on G.flags so it serializes with the save
      if (step !== undefined) {
        if (!G.flags || typeof G.flags !== "object") G.flags = {};
        G.flags["questStep_" + id] = step;
      }
      if (typeof EventBus !== "undefined" && EventBus && typeof EventBus.emit === "function") {
        try { EventBus.emit("quest:advance", { id: id, step: step }); } catch (e) {}
      }
    },

    /* read the stored step for a quest (or undefined) */
    step: function (id) {
      if (!G || !G.flags) return undefined;
      return G.flags["questStep_" + id];
    },

    /* complete a quest: -> done, play confirm, and HEAL the mapped region
       (stops + reverses decay there). Idempotent — completing twice does
       nothing the second time. */
    complete: function (id) {
      _ensureQuests();
      if (!G || !G.quests || !id) return;
      if (_norm(G.quests[id]) === "done") return;   // already done
      G.quests[id] = "done";

      if (typeof Audio !== "undefined" && Audio && typeof Audio.playCue === "function") {
        try { Audio.playCue("sfx_confirm"); } catch (e) {}
      }

      // heal the region this quest restores (guarded — Decay lives in 30-map.js)
      var region = this.regionFor(id);
      if (region && typeof Decay !== "undefined" && Decay && typeof Decay.heal === "function") {
        try { Decay.heal(region); } catch (e) {}
        // a soft heal sting for the land returning (guarded)
        if (typeof Audio !== "undefined" && Audio && typeof Audio.playCue === "function") {
          try { Audio.playCue("sfx_heal"); } catch (e) {}
        }
      }

      if (typeof EventBus !== "undefined" && EventBus && typeof EventBus.emit === "function") {
        try { EventBus.emit("quest:complete", { id: id, region: region }); } catch (e) {}
      }
    },

    /* array of currently-active quest ids (for the HUD) */
    active: function () {
      _ensureQuests();
      var out = [];
      if (!G || !G.quests) return out;
      for (var k in G.quests) {
        if (!Object.prototype.hasOwnProperty.call(G.quests, k)) continue;
        if (_norm(G.quests[k]) === "active") out.push(k);
      }
      return out;
    },

    /* array of completed quest ids */
    done: function () {
      _ensureQuests();
      var out = [];
      if (!G || !G.quests) return out;
      for (var k in G.quests) {
        if (!Object.prototype.hasOwnProperty.call(G.quests, k)) continue;
        if (_norm(G.quests[k]) === "done") out.push(k);
      }
      return out;
    }
  };
})();

/* ===================================================================== */
/* ENDINGS — deterministic three-way resolver (hidden moral weight)      */
/* ===================================================================== */
var Endings = (function () {

  /* Tunable thresholds for the hidden signals. The kill counter is NEVER
     shown in the UI — it is read only here, at resolution time. */
  var KILL_THRESHOLD = 300;   // DESIGN §8 ending A: "убил больше 300 существ"
  var TRUST_RECONCILED = 3;   // "high" Аяулым trust => reconciled (path B/C friendly)

  function _num(v) { return (typeof v === "number" && !isNaN(v)) ? v : 0; }
  function _bool(v) { return v === true; }
  function _str(v) { return (typeof v === "string") ? v : ""; }

  /* did the player use the dombra in the key scenes? We treat this as true
     when the unfinished kui has progressed past the start (the father's 8
     notes were learned, or the player banked dombra moments via flags). This
     is the "сыграл домброй во всех ключевых сценах" signal for ending B. */
  function _usedDombraInKeyScenes() {
    if (!G) return false;
    if (_num(G.dombraMelodyLearned) >= 1) return true;
    if (G.flags && (_bool(G.flags.dombraMarat) || _bool(G.flags.dombraErlan) ||
                    _bool(G.flags.playedForSerik) || _bool(G.flags.dombraUsed))) {
      return true;
    }
    return false;
  }

  /* reconciled with Аяулым: she did NOT leave AND trust is high */
  function _reconciledWithAyaulym() {
    if (!G) return false;
    return (!_bool(G.ayaulymLeft)) && (_num(G.ayaulymTrust) >= TRUST_RECONCILED);
  }

  var api = {
    id: null,   // caches the last resolved letter ("a"|"b"|"c")

    /* expose the threshold so tests / chapter authors can reason about it,
       but it is never rendered. */
    KILL_THRESHOLD: KILL_THRESHOLD,

    /* read-only views of the three signals (handy for debugging, never UI) */
    signals: function () {
      var memCount = (typeof Memory !== "undefined" && Memory && typeof Memory.count === "function")
        ? Memory.count() : ((G && Array.isArray(G.memories)) ? G.memories.length : 0);
      var memComplete = memCount >= 12;
      return {
        killCount: _num(G && G.killCount),
        memCount: memCount,
        memComplete: memComplete,
        ayaulymLeft: _bool(G && G.ayaulymLeft),
        ayaulymTrust: _num(G && G.ayaulymTrust),
        reconciled: _reconciledWithAyaulym(),
        usedDombra: _usedDombraInKeyScenes(),
        serikPath: _str(G && G.serikPath)
      };
    },

    /* Endings.resolve() -> "a" | "b" | "c".
       Deterministic priority so EXACTLY one letter is returned.

       Per DESIGN.md §8 + CONTRACT §11:
         A (БАТЫР, кровавая):  killCount > 300 AND ayaulymLeft AND memories incomplete.
         B (КҮЙШІ, музыкальная): all 12 memories AND dombra used in key scenes AND
                                 reconciled with Аяулым.
         C (ХРАНИТЕЛЬ, одинокая): the understanding/defending path with Серік
                                  (serikPath === "understand").

       Resolution order weighs the strong "canonical" signals first so the
       intended ending wins, and ties resolve toward B, then C, then A. */
    resolve: function () {
      var s = this.signals();

      // --- strongest authored signal: the full musical ending ------------
      // All 12 memories + dombra used in the key scenes + reconciled with
      // Аяулым => unambiguously КҮЙШІ. (All 12 memories strongly leans B.)
      if (s.memComplete && s.usedDombra && s.reconciled) {
        this.id = "b";
        return "b";
      }

      // --- the lonely keeper: chose understanding/defending Серік --------
      // serikPath "understand" is an explicit, deliberate dialogue lean.
      if (s.serikPath === "understand") {
        this.id = "c";
        return "c";
      }

      // --- the bloody hero: force, sent Аяулым away, ignored the memories -
      if (s.killCount > KILL_THRESHOLD && s.ayaulymLeft && !s.memComplete) {
        this.id = "a";
        return "a";
      }

      // ----- no clean A/B/C trigger: weigh the leftover signals ----------
      // The story still needs a single deterministic letter. We score each
      // ending from the partial signals and pick the highest; ties resolve
      // toward B, then C, then A (the contract's tie order).
      var scoreA = 0, scoreB = 0, scoreC = 0;

      // B accrues from the canonical/musical signals.
      if (s.memComplete) scoreB += 3;            // all memories => strong B pull
      scoreB += Math.min(s.memCount, 12) * 0.25; // partial memories nudge B
      if (s.usedDombra) scoreB += 1;
      if (s.reconciled) scoreB += 2;
      else if (!s.ayaulymLeft) scoreB += 0.5;    // at least she stayed

      // C accrues from the understanding lean toward Серік.
      if (s.serikPath === "understand") scoreC += 4;  // (already returned above, but safe)
      if (s.serikPath === "music") scoreC += 0.5;     // a soft, non-violent lean
      if (s.serikPath === "neutral") scoreC += 0.25;

      // A accrues from violence + isolation.
      scoreA += Math.min(s.killCount, 1000) / 100; // every 100 kills => +1 toward A
      if (s.ayaulymLeft) scoreA += 2;
      if (!s.memComplete) scoreA += 0.5;
      if (s.serikPath === "kill") scoreA += 3;

      // pick the max with the pinned tie order B > C > A
      var best = "b";
      var bestScore = scoreB;
      if (scoreC > bestScore) { best = "c"; bestScore = scoreC; }
      if (scoreA > bestScore) { best = "a"; bestScore = scoreA; }
      // ensure ties resolve B>C>A even if A or C merely equals current best
      if (best !== "b" && scoreB === bestScore) best = "b";
      else if (best === "a" && scoreC === bestScore) best = "c";

      this.id = best;
      return best;
    }
  };

  return api;
})();
