/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 70-ui.js  (HUD + CUTSCENE + SYSTEM SCENES)
   Owns: UI, Cutscene.
   OVERRIDES the engine fallback "title"; ADDS "menu", "ending_a",
   "ending_b", "ending_c".
   RAW JS fragment — concatenated 8th inside the single <script> tag.
   Depends ONLY on documented APIs of earlier modules (engine + Sprites +
   Audio + World/Decay + Memory/Quests/Endings). Every cross-module call is
   GUARDED so a missing sprite/cue/scene never throws in the 60fps loop.
   All in-game text is reproduced VERBATIM from DESIGN.md.
   ===================================================================== */

/* ---------- tiny local guards (do NOT redefine engine helpers) -------- */
function _ui_audio(name) {
  if (typeof Audio !== "undefined" && Audio && typeof Audio.playCue === "function") {
    try { Audio.playCue(name); } catch (e) {}
  }
}
function _ui_stopMusic() {
  if (typeof Audio !== "undefined" && Audio && typeof Audio.stopMusic === "function") {
    try { Audio.stopMusic(); } catch (e) {}
  }
}
function _ui_sprite(c, key, x, y, scale, opts) {
  if (typeof Sprites !== "undefined" && Sprites && typeof Sprites.draw === "function") {
    try { Sprites.draw(c, key, x, y, scale, opts); } catch (e) {}
  }
}
function _ui_hasSprite(key) {
  return (typeof Sprites !== "undefined" && Sprites && typeof Sprites.has === "function" && Sprites.has(key));
}
function _ui_restoredPct() {
  // contract: Decay.restoredPercent() -> 0..100. Tolerate a restoredPct alias too.
  if (typeof Decay !== "undefined" && Decay) {
    try {
      if (typeof Decay.restoredPercent === "function") return clamp(Decay.restoredPercent() | 0, 0, 100);
      if (typeof Decay.restoredPct === "function") return clamp(Decay.restoredPct() | 0, 0, 100);
    } catch (e) {}
  }
  return 0;
}
function _ui_activeQuests() {
  if (typeof Quests !== "undefined" && Quests && typeof Quests.active === "function") {
    try { var a = Quests.active(); return Array.isArray(a) ? a : []; } catch (e) {}
  }
  return [];
}
function _ui_memCount() {
  if (typeof Memory !== "undefined" && Memory && typeof Memory.count === "function") {
    try { return Memory.count() | 0; } catch (e) {}
  }
  return (G && Array.isArray(G.memories)) ? G.memories.length : 0;
}

/* human-readable label for a quest id (the HUD never invents new lore;
   it falls back to a tidied form of the raw id if a quest is unknown). */
var _UI_QUEST_LABELS = {
  "four_winds":       "Четыре стороны света",
  "follow_tracks":    "Идти по следу",
  "save_children":    "Спасти детей из пещеры",
  "find_father":      "Найти отца в Нижнем мире",
  "free_eagle":       "Снять проклятие беркута",
  "sky_power":        "Сила Неба",
  "unite_juzes":      "Объединить три жуза",
  "dosan_son":        "Найти сына Досана",
  "march_ordo":       "Поход на Тёмный Ордо",
  "final_kui":        "Закончить кюй"
};
function _ui_questLabel(id) {
  if (_UI_QUEST_LABELS[id]) return _UI_QUEST_LABELS[id];
  // tidy fallback: "ch5_marat" -> "Ch5 Marat" is ugly; just strip underscores.
  var s = String(id || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "Задание";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- soft panel primitive (gold-accent pixel frame) ------------ */
function _ui_panel(c, x, y, w, h, opts) {
  opts = opts || {};
  c.save();
  c.fillStyle = opts.fill || "rgba(14,15,22,0.82)";
  c.fillRect(x, y, w, h);
  c.lineWidth = opts.lineWidth || 2;
  c.strokeStyle = opts.stroke || PALETTE.goldAccent;
  c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (opts.inner !== false) {
    c.lineWidth = 1;
    c.strokeStyle = opts.innerStroke || "rgba(212,160,23,0.25)";
    c.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
  }
  c.restore();
}

/* ---------- gold corner ornaments (steppe diamonds) ------------------- */
function _ui_corners(c, x, y, w, h, col, sz) {
  sz = sz || 5;
  col = col || PALETTE.gold;
  c.save();
  c.fillStyle = col;
  function diamond(cx, cy) {
    c.beginPath();
    c.moveTo(cx, cy - sz); c.lineTo(cx + sz, cy);
    c.lineTo(cx, cy + sz); c.lineTo(cx - sz, cy);
    c.closePath(); c.fill();
  }
  diamond(x, y); diamond(x + w, y); diamond(x, y + h); diamond(x + w, y + h);
  c.restore();
}

/* =====================================================================
   UI  — HUD over explore/battle + chapter title cards + shared widgets
   ===================================================================== */
var UI = (function () {

  /* chapter title card state (МЕСТО / ВРЕМЯ banner) */
  var _card = {
    active: false,
    place: "",
    time: "",
    t: 0,
    dur: 3600,        // total lifetime (ms): fade-in, hold, fade-out
    onDone: null
  };

  /* a generic transient toast (e.g. "Сохранено", "+ воспоминание") */
  var _toast = { msg: "", t: 0, dur: 0 };

  /* dombra-hint pulse phase (purely cosmetic) */
  var _pulse = 0;

  /* -------- HUD: top-left player line (HP + name) ------------------- */
  function _drawPlayerBar(c) {
    var hp = _battleHp();      // number 0..max while in battle; null otherwise
    var x = 12, y = 12;
    var w = 196, h = (hp == null) ? 30 : 46;
    _ui_panel(c, x, y, w, h);
    // portrait chip
    var px = x + 8, py = y + 8;
    if (_ui_hasSprite("erzhan")) {
      _ui_sprite(c, "erzhan", px, py, 1, {});
    } else {
      c.fillStyle = PALETTE.earth; c.fillRect(px, py, 14, 14);
    }
    drawText(c, "ЕРЖАН", x + 30, y + 20, { color: PALETTE.gold, size: 14, align: "left" });

    if (hp != null) {
      // battle HP bar (the only time the player has a numeric HP, per contract §9)
      var max = _battleHpMax() || 20;
      var bx = x + 10, by = y + 28, bw = w - 20, bh = 10;
      c.fillStyle = PALETTE.outline; c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      c.fillStyle = PALETTE.bloodDark; c.fillRect(bx, by, bw, bh);
      var frac = clamp(hp / max, 0, 1);
      c.fillStyle = (frac > 0.35) ? PALETTE.feltRed : PALETTE.gold;
      c.fillRect(bx, by, Math.round(bw * frac), bh);
      drawText(c, "HP " + Math.max(0, Math.round(hp)) + "/" + max, bx + 4, by + bh - 1,
        { color: PALETTE.yurtWhite, size: 10, align: "left", shadow: true });
    }
  }

  /* Battle exposes no formal HUD hook; we read it defensively if present.
     The contract says out-of-battle the player has no global HP bar (death is
     narrative), so we ONLY show HP when Battle advertises an active value. */
  function _battleHp() {
    if (typeof Battle !== "undefined" && Battle) {
      try {
        if (typeof Battle.playerHp === "function") return Battle.playerHp();
        if (typeof Battle.playerHp === "number") return Battle.playerHp;
        if (typeof Battle.hud === "function") { var h = Battle.hud(); if (h && typeof h.hp === "number") return h.hp; }
      } catch (e) {}
    }
    return null;
  }
  function _battleHpMax() {
    if (typeof Battle !== "undefined" && Battle) {
      try {
        if (typeof Battle.playerHpMax === "function") return Battle.playerHpMax();
        if (typeof Battle.playerHpMax === "number") return Battle.playerHpMax;
        if (typeof Battle.hud === "function") { var h = Battle.hud(); if (h && typeof h.hpMax === "number") return h.hpMax; }
      } catch (e) {}
    }
    return 20;
  }

  /* -------- HUD: active quest line (top-right) ---------------------- */
  function _drawQuests(c) {
    var quests = _ui_activeQuests();
    if (!quests.length) return;
    var lines = [];
    for (var i = 0; i < quests.length && i < 3; i++) {
      lines.push(_ui_questLabel(quests[i]));
    }
    var w = 232;
    var rowH = 18;
    var h = 26 + lines.length * rowH;
    var x = Engine.W - w - 12, y = 12;
    _ui_panel(c, x, y, w, h);
    drawText(c, "ҚИССА", x + 12, y + 20, { color: PALETTE.gold, size: 13, align: "left" });
    drawText(c, "ЗАДАНИЯ", x + w - 12, y + 20, { color: PALETTE.boneGrey, size: 11, align: "right" });
    for (var j = 0; j < lines.length; j++) {
      var ly = y + 24 + (j + 1) * rowH - 4;
      // bullet diamond
      c.fillStyle = PALETTE.gold;
      var bx = x + 14, by = ly - 4;
      c.beginPath();
      c.moveTo(bx, by - 3); c.lineTo(bx + 3, by); c.lineTo(bx, by + 3); c.lineTo(bx - 3, by);
      c.closePath(); c.fill();
      drawText(c, lines[j], x + 24, ly, { color: PALETTE.yurtWhite, size: 12, align: "left", maxWidth: w - 36 });
    }
  }

  /* -------- HUD: world-restoration % (bottom-left) ----------------- */
  function _drawRestoration(c) {
    var pct = _ui_restoredPct();
    var x = 12, y = Engine.H - 34, w = 196, h = 22;
    _ui_panel(c, x, y, w, h);
    drawText(c, "СТЕПЬ", x + 10, y + 16, { color: PALETTE.gold, size: 12, align: "left" });
    var bx = x + 64, by = y + 7, bw = w - 110, bh = 8;
    c.fillStyle = PALETTE.outline; c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    c.fillStyle = PALETTE.greySteppe; c.fillRect(bx, by, bw, bh);
    var frac = clamp(pct / 100, 0, 1);
    // returning color: grey -> living green by restoration
    c.fillStyle = (typeof lerpColor === "function")
      ? lerpColor(PALETTE.greySteppe, PALETTE.grassLight, frac)
      : PALETTE.grassLight;
    c.fillRect(bx, by, Math.round(bw * frac), bh);
    drawText(c, pct + "%", x + w - 10, y + 16, { color: PALETTE.yurtWhite, size: 12, align: "right" });
  }

  /* -------- HUD: dombra prompt hint (bottom-right) ----------------- */
  function _drawDombraHint(c) {
    var x = Engine.W - 168, y = Engine.H - 34, w = 156, h = 22;
    _ui_panel(c, x, y, w, h);
    // pulsing dombra icon
    var pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(_pulse / 380));
    var ix = x + 8, iy = y + 4;
    if (_ui_hasSprite("dombra_icon")) {
      _ui_sprite(c, "dombra_icon", ix, iy, 1, { alpha: pulse });
    } else {
      c.save(); c.globalAlpha = pulse;
      c.fillStyle = PALETTE.earth; c.fillRect(ix, iy, 6, 14);
      c.fillStyle = PALETTE.gold; c.fillRect(ix + 1, iy + 1, 4, 4);
      c.restore();
    }
    drawText(c, "ПРОБЕЛ — домбра", x + 26, y + 16, { color: PALETTE.gold, size: 11, align: "left" });
  }

  /* -------- chapter title card (МЕСТО / ВРЕМЯ) --------------------- */
  function _renderCard(c) {
    if (!_card.active) return;
    var t = _card.t, dur = _card.dur;
    var fadeIn = 600, fadeOut = 700;
    var a;
    if (t < fadeIn) a = t / fadeIn;
    else if (t > dur - fadeOut) a = Math.max(0, (dur - t) / fadeOut);
    else a = 1;
    a = clamp(a, 0, 1);
    if (a <= 0) return;

    c.save();
    c.globalAlpha = a;
    // letterbox bands
    var bandH = 86;
    var cy = Engine.H / 2;
    c.fillStyle = "rgba(8,8,12,0.86)";
    c.fillRect(0, cy - bandH, Engine.W, bandH * 2);
    // gold rules
    c.strokeStyle = PALETTE.goldAccent; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, cy - bandH + 0.5); c.lineTo(Engine.W, cy - bandH + 0.5); c.stroke();
    c.beginPath(); c.moveTo(0, cy + bandH - 0.5); c.lineTo(Engine.W, cy + bandH - 0.5); c.stroke();

    // place (МЕСТО) — large gold
    drawText(c, _card.place, Engine.W / 2, cy - 14,
      { color: PALETTE.gold, size: 30, align: "center" });
    // separator dot row
    c.fillStyle = PALETTE.goldAccent;
    var midY = cy + 4;
    for (var i = -2; i <= 2; i++) {
      var dx = Engine.W / 2 + i * 16;
      c.beginPath();
      c.moveTo(dx, midY - 2); c.lineTo(dx + 2, midY); c.lineTo(dx, midY + 2); c.lineTo(dx - 2, midY);
      c.closePath(); c.fill();
    }
    // time (ВРЕМЯ) — smaller, muted
    drawText(c, _card.time, Engine.W / 2, cy + 34,
      { color: PALETTE.boneGrey, size: 16, align: "center" });
    c.restore();
  }

  /* -------- transient toast (e.g. save flash) --------------------- */
  function _renderToast(c) {
    if (_toast.dur <= 0) return;
    var a = clamp(_toast.t < 200 ? _toast.t / 200
              : (_toast.dur - _toast.t < 300 ? (_toast.dur - _toast.t) / 300 : 1), 0, 1);
    if (a <= 0) return;
    c.save(); c.globalAlpha = a;
    var w = 8 + (_toast.msg.length * 9) + 16;
    if (w < 120) w = 120;
    var x = (Engine.W - w) / 2, y = Engine.H - 92, h = 30;
    _ui_panel(c, x, y, w, h, { fill: "rgba(14,15,22,0.92)" });
    drawText(c, _toast.msg, Engine.W / 2, y + 20, { color: PALETTE.gold, size: 14, align: "center" });
    c.restore();
  }

  return {
    /* ----- ticking (a hosting scene calls UI.update(dt) each frame) --- */
    update: function (dt) {
      dt = dt || 0;
      _pulse += dt;
      if (_card.active) {
        _card.t += dt;
        if (_card.t >= _card.dur) {
          _card.active = false;
          var cb = _card.onDone; _card.onDone = null;
          if (typeof cb === "function") { try { cb(); } catch (e) {} }
        }
      }
      if (_toast.dur > 0) {
        _toast.t += dt;
        if (_toast.t >= _toast.dur) { _toast.dur = 0; _toast.t = 0; _toast.msg = ""; }
      }
    },

    /* ----- the standard explore/battle HUD (call from scene.render) --- */
    hud: function (c, opts) {
      if (!c) return;
      opts = opts || {};
      c.save();
      if (opts.quests !== false) _drawQuests(c);
      if (opts.player !== false) _drawPlayerBar(c);
      if (opts.restoration !== false) _drawRestoration(c);
      if (opts.dombra !== false) _drawDombraHint(c);
      c.restore();
      // overlays that float above the HUD bars
      _renderCard(c);
      _renderToast(c);
    },

    /* ----- only the floating overlays (card + toast), no bars -------- */
    overlays: function (c) {
      if (!c) return;
      _renderCard(c);
      _renderToast(c);
    },

    /* ----- chapter title card: МЕСТО / ВРЕМЯ banner ----------------- */
    /* UI.titleCard(place, time, onDone) — shows e.g.
       UI.titleCard("АУЛ ЖЕТІҚАЗ", "РАССВЕТ"). onDone fires when it finishes. */
    titleCard: function (place, time, onDone) {
      _card.active = true;
      _card.place = (place == null) ? "" : String(place);
      _card.time = (time == null) ? "" : String(time);
      _card.t = 0;
      _card.dur = 3600;
      _card.onDone = (typeof onDone === "function") ? onDone : null;
      return _card;
    },
    /* true while a chapter title card is on screen */
    cardActive: function () { return _card.active; },
    /* dismiss the card early (e.g. on player input) */
    skipCard: function () {
      if (!_card.active) return;
      _card.active = false;
      var cb = _card.onDone; _card.onDone = null;
      if (typeof cb === "function") { try { cb(); } catch (e) {} }
    },

    /* ----- transient toast ----------------------------------------- */
    toast: function (msg, ms) {
      _toast.msg = (msg == null) ? "" : String(msg);
      _toast.dur = (ms == null) ? 1300 : ms;
      _toast.t = 0;
    },

    /* ----- shared widgets other modules may reuse ------------------- */
    panel: _ui_panel,
    corners: _ui_corners,

    /* a gold-accented vertical menu list. Returns nothing; pure draw.
       items: array of strings; idx: selected index; cx/y0/rowH layout. */
    menuList: function (c, items, idx, cx, y0, rowH, opts) {
      if (!c || !items) return;
      opts = opts || {};
      rowH = rowH || 36;
      var fontSize = opts.size || 18;
      var w = opts.width || 280;
      for (var i = 0; i < items.length; i++) {
        var ry = y0 + i * rowH;
        var sel = (i === idx);
        var label = items[i];
        var disabled = !!(opts.disabled && opts.disabled[i]);
        if (sel && !disabled) {
          c.fillStyle = PALETTE.goldAccent;
          c.fillRect(cx - w / 2, ry - fontSize, w, fontSize + 12);
          // selection chevrons
          c.fillStyle = PALETTE.outline;
          drawText(c, "‹", cx - w / 2 + 14, ry, { color: PALETTE.outline, size: fontSize, align: "left", shadow: false });
          drawText(c, "›", cx + w / 2 - 14, ry, { color: PALETTE.outline, size: fontSize, align: "right", shadow: false });
        }
        var col = disabled ? PALETTE.deadGreen : (sel ? PALETTE.outline : PALETTE.yurtWhite);
        drawText(c, label, cx, ry, { color: col, size: fontSize, align: "center", shadow: !sel });
      }
    }
  };
})();

/* =====================================================================
   CUTSCENE  — scripted, time-based cinematic overlay (contract §12)
   Cutscene.play(timeline, onDone): runs a sorted array of cue objects.
   Each beat may carry: { at, cue, text, do }. `do` runs every frame from
   its `at` until the next `do` beat. Registers an internal scene so the
   engine drives update/render; suppresses the pause menu (blockPause).
   ===================================================================== */
var Cutscene = (function () {

  var state = {
    active: false,
    timeline: [],
    t: 0,
    end: 0,
    caption: "",
    captionT: 0,           // ms the current caption has been visible (for fade-in)
    curDo: null,           // the active {do} function for this stretch
    onDone: null,
    fired: [],             // per-beat one-shot guard
    returnScene: null,     // scene id to restore if onDone does not setScene
    fadeFlash: 0           // brief white/black flash request (0..1 alpha), set by helpers
  };

  /* normalize + sort the timeline by `at`; clone so callers can't mutate mid-run */
  function _prep(tl) {
    var out = [];
    if (Array.isArray(tl)) {
      for (var i = 0; i < tl.length; i++) {
        var b = tl[i];
        if (!b || typeof b !== "object") continue;
        out.push({
          at: (typeof b.at === "number") ? b.at : 0,
          cue: b.cue,
          text: (b.text !== undefined) ? b.text : undefined,
          fn: (typeof b.do === "function") ? b.do : null,
          _i: i
        });
      }
    }
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  function _start(timeline, onDone, returnScene) {
    state.timeline = _prep(timeline);
    state.t = 0;
    state.caption = "";
    state.captionT = 0;
    state.curDo = null;
    state.onDone = (typeof onDone === "function") ? onDone : null;
    state.returnScene = returnScene || null;
    state.fired = [];
    state.fadeFlash = 0;
    // end time = last beat's `at` + a small tail so the final caption/do is seen
    var last = 0;
    for (var i = 0; i < state.timeline.length; i++) {
      if (state.timeline[i].at > last) last = state.timeline[i].at;
    }
    state.end = last + 900;
    state.active = true;
  }

  function _finish() {
    if (!state.active) return;
    state.active = false;
    _ui_stopMusic();
    var cb = state.onDone; state.onDone = null;
    var ret = state.returnScene; state.returnScene = null;
    if (typeof cb === "function") {
      try { cb(); } catch (e) {}
    } else if (ret) {
      if (typeof setScene === "function") setScene(ret);
    }
  }

  /* advance the timeline by dt; fire cue/text once, track active `do` */
  function _tick(dt) {
    if (!state.active) return;
    var prevT = state.t;
    state.t += dt;
    state.captionT += dt;

    for (var i = 0; i < state.timeline.length; i++) {
      var b = state.timeline[i];
      if (b.at <= state.t && b.at > prevT - 0.0001 && !state.fired[i]) {
        // a beat newly crossed
        if (b.at <= state.t) {
          state.fired[i] = true;
          if (b.cue) _ui_audio(b.cue);
          if (b.text !== undefined) {
            state.caption = String(b.text);
            state.captionT = 0;
          }
          if (b.fn) { state.curDo = b.fn; }
        }
      } else if (b.at <= state.t && !state.fired[i]) {
        // fallback (large dt jumps): fire any not-yet-fired past beats in order
        state.fired[i] = true;
        if (b.cue) _ui_audio(b.cue);
        if (b.text !== undefined) { state.caption = String(b.text); state.captionT = 0; }
        if (b.fn) { state.curDo = b.fn; }
      }
    }
    if (state.fadeFlash > 0) {
      state.fadeFlash -= dt / 600;
      if (state.fadeFlash < 0) state.fadeFlash = 0;
    }
    if (state.t >= state.end) { _finish(); }
  }

  /* draw the cinematic: black field, the active `do` painter, caption box */
  function _render(c) {
    if (!c) return;
    // base field (cinematics own the screen)
    c.fillStyle = "#000000";
    c.fillRect(0, 0, Engine.W, Engine.H);

    // the active animated beat paints the world for this stretch
    if (state.curDo) {
      try { state.curDo(c, _progress(), state.t); } catch (e) { /* never break the loop */ }
    }

    // optional flash overlay (set by helper timelines via Cutscene.flash)
    if (state.fadeFlash > 0) {
      c.fillStyle = "rgba(237,239,230," + clamp(state.fadeFlash, 0, 1).toFixed(3) + ")";
      c.fillRect(0, 0, Engine.W, Engine.H);
    }

    // caption (cinematic subtitle), centered low with a soft band
    if (state.caption) {
      var a = clamp(state.captionT / 350, 0, 1);
      c.save();
      c.globalAlpha = a;
      var bandH = 78;
      c.fillStyle = "rgba(8,8,12,0.72)";
      c.fillRect(0, Engine.H - bandH, Engine.W, bandH);
      c.strokeStyle = PALETTE.goldAccent; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, Engine.H - bandH + 0.5); c.lineTo(Engine.W, Engine.H - bandH + 0.5); c.stroke();
      drawText(c, state.caption, Engine.W / 2, Engine.H - bandH / 2 + 6,
        { color: PALETTE.yurtWhite, size: 18, align: "center", maxWidth: Engine.W - 120, lineHeight: 22 });
      c.restore();
    }

    // subtle "press Z to skip" hint
    drawText(c, "Z / X — пропустить", Engine.W - 14, 22,
      { color: "rgba(216,207,184,0.5)", size: 11, align: "right", shadow: false });
  }

  function _progress() {
    if (state.end <= 0) return 1;
    return clamp(state.t / state.end, 0, 1);
  }

  /* internal scene the engine drives while a cutscene runs */
  var _cutsceneScene = {
    blockPause: true,           // suppress the pause menu during cinematics
    enter: function () {},
    exit: function () {},
    update: function (dt) { _tick(dt); },
    render: function (c) { _render(c); },
    onKey: function (e) {
      if (!e) return;
      if (e.action === "confirm" || e.action === "cancel") {
        // fast-forward to the end (fire remaining cues so audio state is sane)
        if (typeof Audio !== "undefined" && Audio && typeof Audio.stopMusic === "function") {
          // do not blast every cue; just jump and stop music
        }
        _finish();
      }
    }
  };
  Scenes.register("_cutscene", _cutsceneScene);

  return {
    /* Cutscene.play(timeline, onDone[, returnScene]) — run a cinematic.
       It takes over as the active scene; onDone (or returnScene) restores
       control when the last beat elapses or the player skips. */
    play: function (timeline, onDone, returnScene) {
      _start(timeline, onDone, returnScene);
      if (typeof setScene === "function") setScene("_cutscene");
    },
    active: function () { return state.active; },

    /* request a brief white flash (used by eagle-to-sky, deaths). */
    flash: function (amt) { state.fadeFlash = clamp(amt == null ? 1 : amt, 0, 1); },

    /* expose the painter helpers so chapter/memory timelines can reuse the
       game's cinematic vocabulary without re-implementing it. Each returns a
       `do` function (c, progress, t) suitable for a beat's `do:`. */
    paint: {
      /* fill the screen with a flat palette color */
      fill: function (paletteName) {
        return function (c) {
          c.fillStyle = (PALETTE[paletteName] || paletteName || "#000000");
          c.fillRect(0, 0, Engine.W, Engine.H);
        };
      },
      /* the eagle flight: a pixel world that shrinks and dissolves to white.
         `p01(t)` should map cutscene-local time to 0..1 over the beat; we
         instead derive shrink from the time since this painter became active
         using a closure timer so it is self-contained. */
      eagleToSky: function (durationMs) {
        var dur = durationMs || 5000;
        var t0 = -1;
        return function (c, prog, tnow) {
          if (t0 < 0) t0 = tnow;
          var p = clamp((tnow - t0) / dur, 0, 1);
          // sky gradient from steppe-blue up to white void
          var top = PALETTE.skyWhite, bot = (typeof lerpColor === "function")
            ? lerpColor(PALETTE.skyBlue, PALETTE.skyWhite, p) : PALETTE.skyBlue;
          c.fillStyle = bot; c.fillRect(0, 0, Engine.W, Engine.H);
          // the shrinking pixel world (a little green steppe tile cluster)
          var scale = lerp(1, 0.04, p);
          var cw = 320 * scale, ch = 200 * scale;
          var cx = Engine.W / 2 - cw / 2, cy = Engine.H / 2 - ch / 2 + lerp(40, -180, p);
          c.save();
          c.globalAlpha = clamp(1 - p * 1.05, 0, 1);
          // ground
          c.fillStyle = PALETTE.grassDark; c.fillRect(cx, cy + ch * 0.55, cw, ch * 0.45);
          c.fillStyle = PALETTE.grassLight; c.fillRect(cx, cy + ch * 0.55, cw, ch * 0.12);
          // a river
          c.fillStyle = PALETTE.waterLight; c.fillRect(cx + cw * 0.2, cy + ch * 0.6, cw * 0.6, ch * 0.06);
          // a couple of yurts
          c.fillStyle = PALETTE.yurtWhite;
          c.fillRect(cx + cw * 0.3, cy + ch * 0.5, cw * 0.08, ch * 0.08);
          c.fillRect(cx + cw * 0.58, cy + ch * 0.52, cw * 0.07, ch * 0.07);
          c.restore();
          // the eagle silhouette, rising toward the void
          var ex = Engine.W / 2, ey = lerp(Engine.H * 0.7, Engine.H * 0.28, p);
          var esc = Math.max(1, Math.round(lerp(6, 3, p)));
          if (_ui_hasSprite("eagle_fly")) {
            _ui_sprite(c, "eagle_fly", ex - 8 * esc, ey, esc, {});
          } else if (_ui_hasSprite("eagle")) {
            _ui_sprite(c, "eagle", ex - 8 * esc, ey, esc, {});
          } else {
            c.fillStyle = PALETTE.outline;
            c.beginPath();
            c.moveTo(ex - 22, ey); c.lineTo(ex, ey - 8); c.lineTo(ex + 22, ey);
            c.lineTo(ex, ey + 4); c.closePath(); c.fill();
          }
          // white bloom near the top as it dissolves
          if (p > 0.6) {
            c.save();
            c.globalAlpha = clamp((p - 0.6) / 0.4, 0, 1);
            c.fillStyle = PALETTE.skyWhite;
            c.fillRect(0, 0, Engine.W, Engine.H);
            c.restore();
          }
        };
      },
      /* illusion labyrinth: a too-perfect green steppe that shimmers and
         (optionally) cracks apart. `cracking` true draws the dissolve. */
      illusion: function (cracking) {
        var t0 = -1;
        return function (c, prog, tnow) {
          if (t0 < 0) t0 = tnow;
          var dt = tnow - t0;
          // impossibly green, calm steppe
          c.fillStyle = PALETTE.skyHigh; c.fillRect(0, 0, Engine.W, Engine.H * 0.5);
          c.fillStyle = PALETTE.grassLight; c.fillRect(0, Engine.H * 0.5, Engine.W, Engine.H * 0.5);
          c.fillStyle = PALETTE.grassDark; c.fillRect(0, Engine.H * 0.62, Engine.W, Engine.H * 0.38);
          // a warm sun
          c.fillStyle = PALETTE.gold;
          c.beginPath(); c.arc(Engine.W * 0.78, Engine.H * 0.22, 26, 0, Math.PI * 2); c.fill();
          // two warm figures (mother + father), gently bobbing
          var bob = Math.sin(dt / 600) * 3;
          c.fillStyle = PALETTE.feltRed;
          c.fillRect(Engine.W * 0.42, Engine.H * 0.5 + bob, 18, 40);
          c.fillStyle = PALETTE.earth;
          c.fillRect(Engine.W * 0.52, Engine.H * 0.5 - bob, 18, 40);
          // shimmer overlay
          c.save();
          c.globalAlpha = 0.06 + 0.04 * (0.5 + 0.5 * Math.sin(dt / 220));
          c.fillStyle = PALETTE.yurtWhite; c.fillRect(0, 0, Engine.W, Engine.H);
          c.restore();
          if (cracking) {
            // violet cracks spider across as the illusion shatters
            var p = clamp(dt / 1800, 0, 1);
            c.save();
            c.strokeStyle = PALETTE.crackLight; c.lineWidth = 2;
            c.globalAlpha = p;
            for (var k = 0; k < 7; k++) {
              var sx = (Engine.W / 6) * k;
              c.beginPath();
              c.moveTo(sx, 0);
              c.lineTo(sx + Math.sin(k * 1.3) * 60 * p, Engine.H * p);
              c.lineTo(sx + Math.cos(k) * 40 * p, Engine.H);
              c.stroke();
            }
            // fading to black underneath
            c.globalAlpha = p * 0.7;
            c.fillStyle = "#000000"; c.fillRect(0, 0, Engine.W, Engine.H);
            c.restore();
          }
        };
      },
      /* a death beat: the screen drains color to grey, then darkens. */
      death: function () {
        var t0 = -1;
        return function (c, prog, tnow) {
          if (t0 < 0) t0 = tnow;
          var p = clamp((tnow - t0) / 2400, 0, 1);
          c.fillStyle = (typeof lerpColor === "function")
            ? lerpColor(PALETTE.caveDark, "#000000", p) : "#000000";
          c.fillRect(0, 0, Engine.W, Engine.H);
          // a guttering fire that fades
          c.save();
          c.globalAlpha = clamp(1 - p, 0, 1);
          var fy = Engine.H / 2 + 30;
          c.fillStyle = PALETTE.caveFire;
          c.fillRect(Engine.W / 2 - 8, fy, 16, 18 - Math.round(p * 14));
          c.restore();
        };
      },
      /* a single NPC vignette card for the final-titles montage. */
      vignette: function (spriteKey, label) {
        return function (c) {
          c.fillStyle = PALETTE.night; c.fillRect(0, 0, Engine.W, Engine.H);
          // soft vignette glow
          c.save();
          var sc = 7;
          var sw = 16 * sc;
          var x = Engine.W / 2, y = Engine.H / 2 - 30;
          if (spriteKey && _ui_hasSprite(spriteKey)) {
            _ui_sprite(c, spriteKey, x - sw / 2, y - sw / 2, sc, {});
          } else {
            c.fillStyle = PALETTE.earth; c.fillRect(x - 24, y - 24, 48, 48);
          }
          c.restore();
          if (label) {
            drawText(c, label, Engine.W / 2, y + 90, { color: PALETTE.gold, size: 18, align: "center", maxWidth: Engine.W - 120, lineHeight: 24 });
          }
        };
      }
    }
  };
})();

/* =====================================================================
   SYSTEM SCENE: title  (OVERRIDES engine fallback — same id, last wins)
   No intro splash. ТАС ЖҮРЕК / Stone Heart in gold, the steppe-is-memory
   epigraph, New Game / Continue (if a save exists) / Settings.
   ===================================================================== */
(function () {

  var EPIGRAPH = "Степь — это не земля. Степь — это память. Когда народ забывает — степь умирает первой.";
  var EPIGRAPH_BY = "— Нұрлан-бақсы, Глава I";

  /* settings sub-panel rows */
  function _fmtPct(v) { return Math.round(clamp(v, 0, 1) * 100) + "%"; }

  var titleScene = {
    t: 0,
    idx: 0,
    items: [],          // built in enter() depending on save existence
    actions: [],        // parallel array of action keys
    mode: "menu",       // "menu" | "settings"
    setIdx: 0,
    started: false,

    _build: function () {
      var hasSave = false;
      try { hasSave = (typeof Save !== "undefined" && Save && Save.exists && Save.exists((G && G.saveSlot) || 1)); } catch (e) {}
      this.items = [];
      this.actions = [];
      this.items.push("Новая игра");      this.actions.push("new");
      if (hasSave) { this.items.push("Продолжить"); this.actions.push("continue"); }
      this.items.push("Настройки");       this.actions.push("settings");
      if (this.idx >= this.items.length) this.idx = 0;
    },

    enter: function () {
      this.t = 0;
      this.idx = 0;
      this.mode = "menu";
      this.setIdx = 0;
      this._build();
      // gentle steppe theme under the menu (guarded; loops till we leave)
      _ui_audio("theme_aul");
    },
    exit: function () { /* music is stopped by whatever scene we go to, or below */ },

    update: function (dt) {
      this.t += dt;
      if (typeof UI !== "undefined" && UI && UI.update) UI.update(dt);
    },

    render: function (c) {
      // background: dawn steppe — sky gradient + grey-greening land + sun
      var p = 0.5 + 0.5 * Math.sin(this.t / 2600);
      c.fillStyle = PALETTE.night; c.fillRect(0, 0, Engine.W, Engine.H);
      // sky bands
      c.fillStyle = (typeof lerpColor === "function") ? lerpColor(PALETTE.night, PALETTE.skyBlue, 0.5) : PALETTE.skyBlue;
      c.fillRect(0, 0, Engine.W, Engine.H * 0.55);
      c.fillStyle = (typeof lerpColor === "function") ? lerpColor(PALETTE.skyBlue, PALETTE.gold, 0.35) : PALETTE.gold;
      c.fillRect(0, Engine.H * 0.34, Engine.W, Engine.H * 0.21);
      // distant sun
      c.fillStyle = PALETTE.gold;
      c.beginPath(); c.arc(Engine.W * 0.5, Engine.H * 0.52, 46 + p * 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = (typeof lerpColor === "function") ? lerpColor(PALETTE.gold, PALETTE.yurtWhite, 0.4) : PALETTE.yurtWhite;
      c.beginPath(); c.arc(Engine.W * 0.5, Engine.H * 0.52, 30, 0, Math.PI * 2); c.fill();
      // land — dying grey near the horizon, earthy below
      c.fillStyle = PALETTE.greySteppe; c.fillRect(0, Engine.H * 0.55, Engine.W, Engine.H * 0.18);
      c.fillStyle = PALETTE.earth; c.fillRect(0, Engine.H * 0.70, Engine.W, Engine.H * 0.30);
      // a lone figure (Ержан) on the horizon with a dombra
      var hx = Engine.W * 0.5, hy = Engine.H * 0.55;
      if (_ui_hasSprite("erzhan")) {
        _ui_sprite(c, "erzhan", Math.round(hx - 16), Math.round(hy - 30), 2, {});
      } else {
        c.fillStyle = PALETTE.outline; c.fillRect(hx - 6, hy - 28, 12, 28);
      }

      // darkening scrim for legibility of the title block
      c.fillStyle = "rgba(8,8,12,0.34)";
      c.fillRect(0, 0, Engine.W, Engine.H);

      // ----- title block -----
      drawText(c, "ТАС ЖҮРЕК", Engine.W / 2, 130,
        { color: PALETTE.gold, size: 58, align: "center", shadowColor: PALETTE.outline });
      drawText(c, "STONE HEART", Engine.W / 2, 168,
        { color: PALETTE.boneGrey, size: 22, align: "center" });
      // gold rule under the title
      c.strokeStyle = PALETTE.goldAccent; c.lineWidth = 2;
      c.beginPath(); c.moveTo(Engine.W / 2 - 180, 186.5); c.lineTo(Engine.W / 2 + 180, 186.5); c.stroke();

      // epigraph
      drawText(c, EPIGRAPH, Engine.W / 2, 214,
        { color: PALETTE.yurtWhite, size: 14, align: "center", maxWidth: 560, lineHeight: 20 });
      drawText(c, EPIGRAPH_BY, Engine.W / 2, 276,
        { color: PALETTE.gold, size: 12, align: "center" });

      if (this.mode === "menu") {
        UI.menuList(c, this.items, this.idx, Engine.W / 2, 350, 42, { width: 300, size: 20 });
        drawText(c, "Z — выбрать    ↑↓ — листать", Engine.W / 2, Engine.H - 28,
          { color: PALETTE.boneGrey, size: 12, align: "center" });
      } else {
        this._renderSettings(c);
      }
    },

    _settingsRows: function () {
      var s = (G && G.settings) ? G.settings : { musicVol: 0.6, sfxVol: 0.8, textSpeed: 30 };
      return [
        { label: "Музыка",        value: _fmtPct(s.musicVol) },
        { label: "Звуки",         value: _fmtPct(s.sfxVol) },
        { label: "Скорость текста", value: (s.textSpeed | 0) + " мс/символ" },
        { label: "Назад",         value: "" }
      ];
    },

    _renderSettings: function (c) {
      var rows = this._settingsRows();
      var x = Engine.W / 2 - 180, y0 = 336, w = 360, rowH = 40;
      _ui_panel(c, x, y0 - 30, w, rows.length * rowH + 36);
      drawText(c, "НАСТРОЙКИ", Engine.W / 2, y0 - 4, { color: PALETTE.gold, size: 18, align: "center" });
      for (var i = 0; i < rows.length; i++) {
        var ry = y0 + 26 + i * rowH;
        var sel = (i === this.setIdx);
        if (sel) {
          c.fillStyle = PALETTE.goldAccent;
          c.fillRect(x + 8, ry - 20, w - 16, 30);
        }
        var lc = sel ? PALETTE.outline : PALETTE.yurtWhite;
        drawText(c, rows[i].label, x + 24, ry, { color: lc, size: 16, align: "left", shadow: !sel });
        if (rows[i].value) {
          drawText(c, "‹ " + rows[i].value + " ›", x + w - 24, ry, { color: sel ? PALETTE.outline : PALETTE.gold, size: 16, align: "right", shadow: !sel });
        }
      }
      drawText(c, "←→ — менять   Z — назад", Engine.W / 2, Engine.H - 28,
        { color: PALETTE.boneGrey, size: 12, align: "center" });
    },

    _applyMusicVol: function () {
      if (typeof Audio !== "undefined" && Audio && Audio.setMusicVolume && G && G.settings) {
        try { Audio.setMusicVolume(G.settings.musicVol); } catch (e) {}
      }
    },
    _applySfxVol: function () {
      if (typeof Audio !== "undefined" && Audio && Audio.setSfxVolume && G && G.settings) {
        try { Audio.setSfxVolume(G.settings.sfxVol); } catch (e) {}
      }
    },

    _select: function () {
      var act = this.actions[this.idx];
      _ui_audio("sfx_confirm");
      if (act === "new") {
        _ui_stopMusic();
        if (typeof Save !== "undefined" && Save && typeof Save.newGame === "function") {
          // Save.newGame() resets G to defaults and setScene("ch1_intro")
          Save.newGame((G && G.saveSlot) || 1);
        } else if (typeof setScene === "function") {
          setScene("ch1_intro");
        }
      } else if (act === "continue") {
        _ui_stopMusic();
        var slot = (G && G.saveSlot) || 1;
        if (typeof Save !== "undefined" && Save && Save.loadInto && Save.loadInto(slot)) {
          var dest = (G.sceneId && typeof Scenes !== "undefined" && Scenes.has && Scenes.has(G.sceneId)) ? G.sceneId : "ch1_intro";
          if (typeof setScene === "function") setScene(dest);
        } else if (typeof setScene === "function") {
          setScene("ch1_intro");
        }
      } else if (act === "settings") {
        this.mode = "settings";
        this.setIdx = 0;
      }
    },

    onKey: function (e) {
      if (!e || !e.action) return;
      var a = e.action;
      if (this.mode === "menu") {
        if (a === "up") { this.idx = (this.idx + this.items.length - 1) % this.items.length; _ui_audio("sfx_select"); }
        else if (a === "down") { this.idx = (this.idx + 1) % this.items.length; _ui_audio("sfx_select"); }
        else if (a === "confirm" || a === "choice1" || a === "choice2" || a === "choice3") {
          if (a === "choice1") this.idx = 0;
          else if (a === "choice2" && this.items.length > 1) this.idx = 1;
          else if (a === "choice3" && this.items.length > 2) this.idx = 2;
          this._select();
        }
      } else { // settings
        var rows = this._settingsRows();
        if (a === "up") { this.setIdx = (this.setIdx + rows.length - 1) % rows.length; _ui_audio("sfx_select"); }
        else if (a === "down") { this.setIdx = (this.setIdx + 1) % rows.length; _ui_audio("sfx_select"); }
        else if (a === "left" || a === "right") {
          var dir = (a === "right") ? 1 : -1;
          if (!G.settings) G.settings = { musicVol: 0.6, sfxVol: 0.8, textSpeed: 30 };
          if (this.setIdx === 0) { G.settings.musicVol = clamp((G.settings.musicVol || 0) + dir * 0.1, 0, 1); this._applyMusicVol(); _ui_audio("sfx_select"); }
          else if (this.setIdx === 1) { G.settings.sfxVol = clamp((G.settings.sfxVol || 0) + dir * 0.1, 0, 1); this._applySfxVol(); _ui_audio("sfx_select"); }
          else if (this.setIdx === 2) { G.settings.textSpeed = clamp((G.settings.textSpeed || 30) + dir * 5, 5, 90); _ui_audio("sfx_select"); }
        }
        else if (a === "confirm" || a === "cancel") {
          if (this.setIdx === rows.length - 1 || a === "cancel") {
            _ui_audio("sfx_cancel");
            this.mode = "menu";
          } else {
            _ui_audio("sfx_confirm");
          }
        }
      }
    },

    onClick: function (x, y) {
      if (this.mode === "menu") {
        // hit-test the menu rows
        var y0 = 350, rowH = 42;
        for (var i = 0; i < this.items.length; i++) {
          var ry = y0 + i * rowH;
          if (x > Engine.W / 2 - 150 && x < Engine.W / 2 + 150 && y > ry - 22 && y < ry + 14) {
            this.idx = i; this._select(); return;
          }
        }
      }
    }
  };

  if (typeof Scenes !== "undefined" && Scenes && Scenes.register) {
    Scenes.register("title", titleScene);
  }
})();

/* =====================================================================
   SYSTEM SCENE: menu  (a full pause/menu scene — resume/save/load/quit)
   The engine also has an inline pause OVERLAY; this is a dedicated scene
   reachable via setScene("menu", { from: "<sceneId>" }) if a chapter wants
   a full-screen menu. It restores `from` on resume.
   ===================================================================== */
(function () {
  var menuScene = {
    blockPause: true,          // we ARE the menu; no nested pause
    from: null,
    idx: 0,
    items: ["Продолжить", "Сохранить", "Загрузить", "Настройки", "На главную"],
    flash: "",
    flashT: 0,
    t: 0,

    enter: function (params) {
      params = params || {};
      this.from = params.from || (G && G.sceneId) || "ch1_intro";
      this.idx = 0;
      this.flash = ""; this.flashT = 0;
      this.t = 0;
    },
    update: function (dt) {
      this.t += dt;
      if (this.flashT > 0) this.flashT -= dt;
    },
    render: function (c) {
      // dim a frozen-ish backdrop
      c.fillStyle = PALETTE.night; c.fillRect(0, 0, Engine.W, Engine.H);
      c.fillStyle = "rgba(8,8,12,0.55)"; c.fillRect(0, 0, Engine.W, Engine.H);
      // ornament
      drawText(c, "ТОҚТА", Engine.W / 2, 120, { color: PALETTE.gold, size: 34, align: "center" });
      drawText(c, "ПАУЗА", Engine.W / 2, 152, { color: PALETTE.boneGrey, size: 16, align: "center" });
      c.strokeStyle = PALETTE.goldAccent; c.lineWidth = 2;
      c.beginPath(); c.moveTo(Engine.W / 2 - 140, 170.5); c.lineTo(Engine.W / 2 + 140, 170.5); c.stroke();

      UI.menuList(c, this.items, this.idx, Engine.W / 2, 240, 44, { width: 300, size: 19 });

      // chapter/progress footer
      var pct = _ui_restoredPct();
      var mem = _ui_memCount();
      drawText(c, "Глава " + ((G && G.chapter) || 1) + "    Степь " + pct + "%    Память " + mem + "/12",
        Engine.W / 2, Engine.H - 60, { color: PALETTE.boneGrey, size: 13, align: "center" });
      if (this.flash && this.flashT > 0) {
        drawText(c, this.flash, Engine.W / 2, Engine.H - 34, { color: PALETTE.gold, size: 14, align: "center" });
      }
      drawText(c, "Z — выбрать   ↑↓ — листать", Engine.W / 2, Engine.H - 14, { color: PALETTE.boneGrey, size: 11, align: "center" });
    },
    _doFlash: function (m) { this.flash = m; this.flashT = 1300; },
    _select: function () {
      _ui_audio("sfx_confirm");
      var i = this.idx;
      var slot = (G && G.saveSlot) || 1;
      if (i === 0) {              // Продолжить
        if (typeof setScene === "function") setScene(this.from);
      } else if (i === 1) {      // Сохранить
        var ok = (typeof Save !== "undefined" && Save && Save.write) ? Save.write(slot) : false;
        this._doFlash(ok ? "Сохранено" : "Не удалось сохранить");
      } else if (i === 2) {      // Загрузить
        if (typeof Save !== "undefined" && Save && Save.exists && Save.exists(slot)) {
          if (Save.loadInto && Save.loadInto(slot)) {
            var dest = (G.sceneId && typeof Scenes !== "undefined" && Scenes.has && Scenes.has(G.sceneId)) ? G.sceneId : "ch1_intro";
            if (typeof setScene === "function") setScene(dest);
          } else { this._doFlash("Не удалось загрузить"); }
        } else { this._doFlash("Нет сохранения"); }
      } else if (i === 3) {      // Настройки
        _ui_audio("sfx_select");
        if (typeof setScene === "function") setScene("title");  // title hosts settings
      } else if (i === 4) {      // На главную
        _ui_stopMusic();
        if (typeof setScene === "function") setScene("title");
      }
    },
    onKey: function (e) {
      if (!e || !e.action) return;
      var a = e.action;
      if (a === "up") { this.idx = (this.idx + this.items.length - 1) % this.items.length; _ui_audio("sfx_select"); }
      else if (a === "down") { this.idx = (this.idx + 1) % this.items.length; _ui_audio("sfx_select"); }
      else if (a === "cancel") { _ui_audio("sfx_cancel"); if (typeof setScene === "function") setScene(this.from); }
      else if (a === "confirm") { this._select(); }
      else if (a === "choice1") { this.idx = 0; this._select(); }
      else if (a === "choice2") { this.idx = 1; this._select(); }
      else if (a === "choice3") { this.idx = 2; this._select(); }
      else if (a === "choice4") { this.idx = 3; this._select(); }
    },
    onClick: function (x, y) {
      var y0 = 240, rowH = 44;
      for (var i = 0; i < this.items.length; i++) {
        var ry = y0 + i * rowH;
        if (x > Engine.W / 2 - 150 && x < Engine.W / 2 + 150 && y > ry - 22 && y < ry + 16) {
          this.idx = i; this._select(); return;
        }
      }
    }
  };
  if (typeof Scenes !== "undefined" && Scenes && Scenes.register) {
    Scenes.register("menu", menuScene);
  }
})();

/* =====================================================================
   ENDING SCENES — Chapter 8 (three endings).
   Each ending: a cutscene montage (verbatim epilogue quotes + NPC
   vignettes) then a quiet final card. Built on Cutscene + scene render.
   Verbatim text from DESIGN.md §8.
   ===================================================================== */

/* shared helper: a slow scrolling/holding ending screen with a final
   epigraph card. We build each as a small scene that plays an internal
   Cutscene montage on enter, then shows the final still + quote. */
function _makeEndingScene(cfg) {
  return {
    t: 0,
    phase: "montage",       // "montage" -> "final"
    quoteShown: false,
    _gotoFinal: false,      // one-shot: set by the montage's onDone before re-entry
    _launch: false,         // defer Cutscene.play to the first update tick

    enter: function () {
      this.t = 0;
      this.quoteShown = false;
      // If the montage just finished and handed control back to us, render the
      // final still directly — do NOT replay the cinematic (avoids a re-enter loop).
      if (this._gotoFinal) {
        this._gotoFinal = false;
        this.phase = "final";
        this._launch = false;
        if (cfg.finalCue) _ui_audio(cfg.finalCue);
        return;
      }
      this.phase = "montage";
      _ui_stopMusic();
      // Do NOT call setScene from inside enter() (we are mid-commit). Defer the
      // Cutscene.play hand-off to the first update tick, when this scene is the
      // genuinely-committed current scene and no fade-commit is in flight.
      this._launch = true;
    },

    exit: function () {
      // leaving for a non-final destination (e.g. back to title) — clear the
      // one-shot so a fresh playthrough replays the montage.
      if (this.phase === "final") this._gotoFinal = false;
    },

    update: function (dt) {
      this.t += dt;
      if (this._launch) {
        this._launch = false;
        var self = this;
        if (typeof Cutscene !== "undefined" && Cutscene && Cutscene.play) {
          Cutscene.play(cfg.timeline(), function () {
            // flag the final phase, then re-enter THIS scene to draw it
            self._gotoFinal = true;
            if (typeof setScene === "function") setScene(cfg.id);
          });
        } else {
          this.phase = "final";
          if (cfg.finalCue) _ui_audio(cfg.finalCue);
        }
      }
    },

    render: function (c) {
      if (this.phase !== "final") {
        // while the montage runs the cutscene scene is active; if we are ever
        // rendered during montage (e.g. re-entry), draw a calm field.
        c.fillStyle = PALETTE.night; c.fillRect(0, 0, Engine.W, Engine.H);
        return;
      }
      // ----- FINAL STILL -----
      if (cfg.finalPaint) { try { cfg.finalPaint(c, this.t); } catch (e) {} }
      else { c.fillStyle = PALETTE.night; c.fillRect(0, 0, Engine.W, Engine.H); }

      // title of the ending
      var a = clamp(this.t / 800, 0, 1);
      c.save(); c.globalAlpha = a;
      drawText(c, cfg.titleRu, Engine.W / 2, 92, { color: PALETTE.gold, size: 30, align: "center" });
      drawText(c, cfg.titleSub, Engine.W / 2, 122, { color: PALETTE.boneGrey, size: 15, align: "center" });
      c.restore();

      // the verbatim epilogue quote, fading in after a beat
      var qa = clamp((this.t - 900) / 1200, 0, 1);
      if (qa > 0) {
        c.save(); c.globalAlpha = qa;
        // quote band
        var by = Engine.H - 168;
        _ui_panel(c, 70, by, Engine.W - 140, 116, { fill: "rgba(8,8,12,0.78)" });
        drawText(c, cfg.quote, Engine.W / 2, by + 44,
          { color: PALETTE.yurtWhite, size: 17, align: "center", maxWidth: Engine.W - 200, lineHeight: 24 });
        if (cfg.quoteBy) {
          drawText(c, cfg.quoteBy, Engine.W / 2, by + 96,
            { color: PALETTE.gold, size: 13, align: "center" });
        }
        c.restore();
      }

      // prompt to return to title
      if (this.t > 2600) {
        var blink = (Math.floor(this.t / 600) % 2) === 0;
        if (blink) {
          drawText(c, "Z — на главную", Engine.W / 2, Engine.H - 22,
            { color: PALETTE.boneGrey, size: 13, align: "center" });
        }
      }
    },

    onKey: function (e) {
      if (!e) return;
      if (this.phase === "final" && (e.action === "confirm" || e.action === "cancel") && this.t > 1400) {
        _ui_audio("sfx_confirm");
        _ui_stopMusic();
        if (typeof setScene === "function") setScene("title");
      }
    }
  };
}

/* ---------- ENDING A: БАТЫР (кровавая) ------------------------------- */
(function () {
  var sceneCfg = {
    id: "ending_a",
    titleRu: "БАТЫР",
    titleSub: "КРОВАВАЯ КОНЦОВКА",
    finalCue: "theme_overworld",
    quote: "Победа — это не конец битвы. Это начало следующей.",
    quoteBy: "",
    /* final still: an old Ержан, alone, grey grass returning at the roadside */
    finalPaint: function (c, t) {
      c.fillStyle = PALETTE.caveDark; c.fillRect(0, 0, Engine.W, Engine.H);
      // a window with grey grass beyond
      var wx = Engine.W / 2 - 120, wy = 180, ww = 240, wh = 150;
      c.fillStyle = PALETTE.skyHigh; c.fillRect(wx, wy, ww, wh * 0.6);
      c.fillStyle = PALETTE.greySteppe; c.fillRect(wx, wy + wh * 0.6, ww, wh * 0.4);
      // grey roadside grass tufts
      c.fillStyle = PALETTE.deadGreen;
      for (var i = 0; i < 8; i++) { c.fillRect(wx + 12 + i * 28, wy + wh - 14, 4, 12); }
      c.strokeStyle = PALETTE.earth; c.lineWidth = 6; c.strokeRect(wx, wy, ww, wh);
      // the old hero, seated, with a dombra he still cannot finish
      var hx = Engine.W / 2, hy = Engine.H - 150;
      if (_ui_hasSprite("erzhan")) { _ui_sprite(c, "erzhan", hx - 16, hy - 32, 2, { tint: { toName: "greySteppe", amt: 0.5 } }); }
      else { c.fillStyle = PALETTE.outline; c.fillRect(hx - 8, hy - 30, 16, 30); }
      if (_ui_hasSprite("dombra_icon")) { _ui_sprite(c, "dombra_icon", hx + 18, hy - 16, 2, {}); }
    },
    timeline: function () {
      return [
        { at: 0,     cue: "theme_battle" },
        { at: 0,     text: "Ержан убивает Серіка. Берёт Тас Жүрек.", do: Cutscene.paint.fill("bloodDark") },
        { at: 2600,  text: "Камень светится — но трещины остаются." },
        { at: 5000,  cue: "sfx_heal", text: "Степь зеленеет — быстро, за несколько дней.",
                     do: (function () {
                        var t0 = -1;
                        return function (c, prog, tnow) {
                          if (t0 < 0) t0 = tnow;
                          var p = clamp((tnow - t0) / 3000, 0, 1);
                          c.fillStyle = (typeof lerpColor === "function") ? lerpColor(PALETTE.greySteppe, PALETTE.grassLight, p) : PALETTE.grassLight;
                          c.fillRect(0, 0, Engine.W, Engine.H);
                          c.fillStyle = PALETTE.grassDark; c.fillRect(0, Engine.H * 0.6, Engine.W, Engine.H * 0.4);
                        };
                      })() },
        { at: 8200,  text: "Ержана чествуют как героя." },
        { at: 10800, text: "Через десять лет.", do: Cutscene.paint.fill("caveDark") },
        { at: 12800, text: "За окном — снова серая трава у дороги." },
        { at: 15200, text: "Он берёт домбру. Пробует тот пассаж. До сих пор не может закончить." },
        { at: 18400, text: "" }
      ];
    }
  };
  sceneCfg.finalPaintRef = sceneCfg.finalPaint; // keep ref stable
  var scene = _makeEndingScene(sceneCfg);
  if (typeof Scenes !== "undefined" && Scenes && Scenes.register) Scenes.register("ending_a", scene);
})();

/* ---------- ENDING B: КҮЙШІ (каноническая — музыкальная) ------------ */
(function () {
  var sceneCfg = {
    id: "ending_b",
    titleRu: "КҮЙШІ",
    titleSub: "КАНОНИЧЕСКАЯ КОНЦОВКА",
    finalCue: "kui_erzhan_full",
    quote: "Жерің болса — жетімсіз. Елің болса — елімсіз.",
    quoteBy: "— Мать Ержана, финальная сцена",
    /* final still: Ержан alone by a river, playing his own new kui */
    finalPaint: function (c, t) {
      c.fillStyle = (typeof lerpColor === "function") ? lerpColor(PALETTE.skyBlue, PALETTE.gold, 0.2) : PALETTE.skyBlue;
      c.fillRect(0, 0, Engine.W, Engine.H * 0.5);
      c.fillStyle = PALETTE.grassLight; c.fillRect(0, Engine.H * 0.5, Engine.W, Engine.H * 0.5);
      c.fillStyle = PALETTE.grassDark; c.fillRect(0, Engine.H * 0.62, Engine.W, Engine.H * 0.38);
      // a river catching light
      c.fillStyle = PALETTE.waterLight; c.fillRect(0, Engine.H * 0.7, Engine.W, 40);
      c.fillStyle = PALETTE.waterDeep; c.fillRect(0, Engine.H * 0.74, Engine.W, 18);
      // shimmer of notes on the water
      var sh = (typeof lerpColor === "function") ? lerpColor(PALETTE.waterLight, PALETTE.gold, 0.4) : PALETTE.gold;
      c.fillStyle = sh;
      for (var i = 0; i < 6; i++) {
        var nx = ((i * 140 + (t / 30)) % (Engine.W + 40)) - 20;
        c.fillRect(nx, Engine.H * 0.71 + (i % 2) * 6, 3, 3);
      }
      // Ержан, seated, playing
      var hx = Engine.W / 2, hy = Engine.H * 0.7 - 6;
      if (_ui_hasSprite("erzhan")) { _ui_sprite(c, "erzhan", hx - 16, hy - 32, 2, {}); }
      else { c.fillStyle = PALETTE.outline; c.fillRect(hx - 8, hy - 30, 16, 30); }
      if (_ui_hasSprite("dombra_icon")) { _ui_sprite(c, "dombra_icon", hx + 16, hy - 16, 2, {}); }
    },
    timeline: function () {
      return [
        { at: 0,     cue: "kui_erzhan_unfinished" },
        { at: 0,     text: "Ержан не убивает Серіка. Он садится рядом с ним у огня.",
                     do: Cutscene.paint.fill("caveDark") },
        { at: 2800,  text: "Берёт домбру. И играет — всё. Тот пассаж, что не мог закончить." },
        { at: 5600,  cue: "kui_erzhan_full", text: "8 нот от отца. И финал — 4 ноты, которые Ержан добавляет сам. Впервые. Кюй становится полным." },
        { at: 9000,  cue: "sfx_heal", text: "Тас Жүрек начинает светиться. Трещины затягиваются — не все, но большинство.",
                     do: (function () {
                        var t0 = -1;
                        return function (c, prog, tnow) {
                          if (t0 < 0) t0 = tnow;
                          var p = clamp((tnow - t0) / 3200, 0, 1);
                          c.fillStyle = PALETTE.caveDark; c.fillRect(0, 0, Engine.W, Engine.H);
                          // the glowing stone heart, cracks (violet) sealing to gold
                          var cx = Engine.W / 2, cy = Engine.H / 2;
                          var R = 70;
                          c.fillStyle = (typeof lerpColor === "function") ? lerpColor(PALETTE.crackLight, PALETTE.gold, p) : PALETTE.gold;
                          c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
                          c.fillStyle = (typeof lerpColor === "function") ? lerpColor(PALETTE.bloodDark, PALETTE.gold, p) : PALETTE.gold;
                          c.beginPath(); c.arc(cx, cy, R * (1 - p * 0.5), 0, Math.PI * 2); c.fill();
                          // ascend/descend glow
                          c.save(); c.globalAlpha = 0.3 * p; c.fillStyle = PALETTE.gold;
                          c.fillRect(cx - 6, 0, 12, Engine.H); c.restore();
                        };
                      })() },
        { at: 12600, text: "Камень поднимается в воздух и уходит вниз, сквозь пол, в землю. Серік закрывает глаза и медленно растворяется — не умирает, именно растворяется." },
        { at: 16000, cue: "theme_aspan", text: "Степь зеленеет медленно. За несколько недель. Потом за месяц. Потом — всё.",
                     do: Cutscene.paint.fill("grassLight") },
        // final-titles montage: each NPC in a new life
        { at: 19000, text: "Аяулым — на горе, с орлом, свободная.", do: Cutscene.paint.vignette("ayaulym", "Аяулым") },
        { at: 21800, text: "Мать Ержана — у огня, смотрит на восток, но уже не с тревогой.", do: Cutscene.paint.vignette("mother", "Гүлнар") },
        { at: 24600, text: "Три бека — сидят вместе за одним дастарханом впервые за 20 лет.", do: Cutscene.paint.vignette("dosan", "Досан · Марат · Ерлан") },
        { at: 27400, text: "Аксакал Бейсен — спит.", do: Cutscene.paint.vignette("beysen", "Бейсен") },
        { at: 30200, text: "Ержан сидит один у реки. Играет на домбре. Не тот кюй — новый. Какой-то его собственный.",
                     do: Cutscene.paint.vignette("erzhan", "Ержан") },
        { at: 34000, text: "Никто не слушает. Это не важно." },
        { at: 37000, text: "" }
      ];
    }
  };
  var scene = _makeEndingScene(sceneCfg);
  if (typeof Scenes !== "undefined" && Scenes && Scenes.register) Scenes.register("ending_b", scene);
})();

/* ---------- ENDING C: ХРАНИТЕЛЬ (одинокая) -------------------------- */
(function () {
  var sceneCfg = {
    id: "ending_c",
    titleRu: "ХРАНИТЕЛЬ",
    titleSub: "ОДИНОКАЯ КОНЦОВКА",
    finalCue: "theme_serik",
    quote: "Степь — это то, что мы помним о земле. Пока помним — она живёт.",
    quoteBy: "— Серік Байұлы, Глава VII",
    /* final still: an old Ержан at the fire of the Ordo, with the stone — the
       circle closed, a young shepherd at the entrance */
    finalPaint: function (c, t) {
      c.fillStyle = PALETTE.caveDark; c.fillRect(0, 0, Engine.W, Engine.H);
      // the great yurt interior, a fire at center
      c.fillStyle = PALETTE.night; c.fillRect(40, 60, Engine.W - 80, Engine.H - 120);
      // fire
      var fx = Engine.W / 2, fy = Engine.H / 2 + 30;
      var flick = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t / 180));
      c.save(); c.globalAlpha = flick;
      c.fillStyle = PALETTE.caveFire; c.beginPath(); c.arc(fx, fy, 26, 0, Math.PI * 2); c.fill();
      c.fillStyle = PALETTE.gold; c.beginPath(); c.arc(fx, fy, 14, 0, Math.PI * 2); c.fill();
      c.restore();
      // old Ержан, seated by the fire with Tas Jurek glowing on his knees
      var hx = fx - 70, hy = fy + 6;
      if (_ui_hasSprite("erzhan")) { _ui_sprite(c, "erzhan", hx - 16, hy - 32, 2, {}); }
      else { c.fillStyle = PALETTE.outline; c.fillRect(hx - 8, hy - 30, 16, 30); }
      c.fillStyle = (typeof lerpColor === "function") ? lerpColor(PALETTE.crackLight, PALETTE.gold, 0.5) : PALETTE.gold;
      c.fillRect(hx - 4, hy - 6, 12, 8);
      // the young shepherd at the entrance (a silhouette)
      var sx = Engine.W / 2 + 150;
      if (_ui_hasSprite("child")) { _ui_sprite(c, "child", sx - 12, fy - 24, 2, { tint: { toName: "outline", amt: 0.4 } }); }
      else { c.fillStyle = PALETTE.outline; c.fillRect(sx - 6, fy - 22, 12, 24); }
    },
    timeline: function () {
      return [
        { at: 0,     cue: "theme_serik" },
        { at: 0,     text: "Ержан остаётся. Серік передаёт ему Тас Жүрек и задачу хранителя.",
                     do: Cutscene.paint.fill("caveDark") },
        { at: 3000,  text: "Уходит — просто уходит пешком на север.",
                     do: (function () {
                        var t0 = -1;
                        return function (c, prog, tnow) {
                          if (t0 < 0) t0 = tnow;
                          var p = clamp((tnow - t0) / 3000, 0, 1);
                          c.fillStyle = PALETTE.greySteppe; c.fillRect(0, 0, Engine.W, Engine.H * 0.6);
                          c.fillStyle = PALETTE.earth; c.fillRect(0, Engine.H * 0.6, Engine.W, Engine.H * 0.4);
                          // a small figure walking away north (up + smaller)
                          var fx = Engine.W / 2, fy = lerp(Engine.H * 0.62, Engine.H * 0.4, p);
                          var sc = Math.max(1, Math.round(lerp(3, 1, p)));
                          if (_ui_hasSprite("serik")) { _ui_sprite(c, "serik", fx - 8 * sc, fy, sc, {}); }
                          else { c.fillStyle = PALETTE.outline; c.fillRect(fx - 4 * sc, fy, 8 * sc, 14 * sc); }
                        };
                      })() },
        { at: 6200,  cue: "sfx_heal", text: "Степь зеленеет. Жузы возвращаются домой.",
                     do: Cutscene.paint.fill("grassLight") },
        { at: 9000,  text: "Аяулым улетает с орлом. Мать думает, что сын вернётся.",
                     do: Cutscene.paint.vignette("ayaulym", "Аяулым") },
        { at: 12000, text: "Проходят годы.", do: Cutscene.paint.fill("caveDark") },
        { at: 14400, text: "Новый молодой пастух приходит к Ордо. Видит старика у огня — Ержана." },
        { at: 17600, text: "И старик говорит: «Садись. Чай будешь?»" },
        { at: 20800, text: "Круг замкнулся." },
        { at: 23400, text: "" }
      ];
    }
  };
  var scene = _makeEndingScene(sceneCfg);
  if (typeof Scenes !== "undefined" && Scenes && Scenes.register) Scenes.register("ending_c", scene);
})();

/* =====================================================================
   END 70-ui.js
   ===================================================================== */
