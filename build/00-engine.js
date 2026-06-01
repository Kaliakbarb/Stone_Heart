/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 00-engine.js  (ENGINE SPINE)
   Owns: G, PALETTE, Input, Scenes, setScene, EventBus, Save, Engine,
         the rAF loop, gameTime accumulation, fade transition, pause-menu
         shell, global helpers, and a built-in fallback title + boot.
   RAW JS — concatenated first inside the single <script> of index.html.
   Self-sufficient: boots and runs alone with no other modules present.
   ===================================================================== */

/* ---------- global math / util helpers (exposed for all modules) ----- */
function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rint(n) { return n | 0; }

/* parse "#rrggbb" -> [r,g,b]; tolerant of missing # / short input */
function _hexToRgb(hex) {
  if (typeof hex !== "string") return [255, 0, 255];
  var h = hex.charAt(0) === "#" ? hex.slice(1) : hex;
  if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
  if (h.length < 6) { return [255, 0, 255]; }
  var r = parseInt(h.slice(0, 2), 16);
  var g = parseInt(h.slice(2, 4), 16);
  var b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [255, 0, 255];
  return [r, g, b];
}
function _rgbToHex(r, g, b) {
  function c(x) { x = clamp(rint(x), 0, 255).toString(16); return x.length === 1 ? "0" + x : x; }
  return "#" + c(r) + c(g) + c(b);
}
/* lerp between two hex colors -> "#rrggbb". Used by Sprites tint + World decay. */
function lerpColor(hexA, hexB, t) {
  t = clamp(t, 0, 1);
  var a = _hexToRgb(hexA), b = _hexToRgb(hexB);
  return _rgbToHex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
}

/* ---------- PALETTE (owned here) ------------------------------------- */
var PALETTE = {
  // core steppe / DESIGN.md §6.5 exact
  gold:        "#D4A017",
  goldAccent:  "#C8960C",
  feltRed:     "#C0392B",
  skyBlue:     "#2980B9",
  earth:       "#7D4E2A",
  yurtWhite:   "#F5ECD7",
  outline:     "#1A0A00",
  greySteppe:  "#8A8A7A",
  // living greens
  grassLight:  "#7CA646",
  grassDark:   "#4E7A33",
  leaf:        "#3E5F2A",
  // dying greys
  ashGrey:     "#9A9A8C",
  deadGreen:   "#6E7059",
  boneGrey:    "#B8B4A4",
  // water / sky
  waterDeep:   "#1F5E7A",
  waterLight:  "#3E86A8",
  skyWhite:    "#EDEFE6",
  skyHigh:     "#C7D6DE",
  // night / lower world
  night:       "#0E0F1A",
  caveDark:    "#171826",
  caveFire:    "#E8B25A",
  caveStone:   "#33354A",
  // accents / cracks
  bloodDark:   "#5A1E1A",
  crackLight:  "#7A3CE0",
  bone:        "#D8CFB8",
  shadow:      "#222018"
};

/* ---------- EventBus (owned here) ------------------------------------ */
var EventBus = (function () {
  var map = {};
  return {
    on: function (evt, fn) {
      if (!map[evt]) map[evt] = [];
      map[evt].push(fn);
      var self = this;
      return function () { self.off(evt, fn); };
    },
    off: function (evt, fn) {
      var arr = map[evt]; if (!arr) return;
      var i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1);
    },
    emit: function (evt, payload) {
      var arr = map[evt]; if (!arr) return;
      for (var i = 0; i < arr.length; i++) {
        try { arr[i](payload); } catch (e) { /* listener errors never break the loop */ }
      }
    }
  };
})();

/* ---------- GLOBAL STATE G (owned here) ------------------------------ */
/* G is created from Save.defaults() during boot, but we initialize a live
   object now so any top-level data references resolve; boot resets it. */
var G;  /* assigned below after Save is defined */

/* ---------- SAVE / LOAD (owned here) --------------------------------- */
var Save = (function () {
  var BASE = "tas_zhurek_save";
  function key(slot) { return BASE + "_" + (slot || 1); }

  function defaults() {
    return {
      chapter: 1,
      sceneId: "boot",
      flags: {},
      inventory: ["dombra"],
      party: ["erzhan"],
      dombraMelodyLearned: 0,
      worldDecay: {},
      killCount: 0,
      memories: [],
      quests: {},
      coalition: { dosan: false, marat: false, erlan: false },
      ayaulymTrust: 0,
      ayaulymLeft: false,
      serikPath: "neutral",
      settings: { musicVol: 0.6, sfxVol: 0.8, textSpeed: 30 },
      saveSlot: 1,
      gameTimeMs: 0
    };
  }

  /* deep-ish merge of saved object over a fresh defaults() so new fields
     added later never read as undefined for old saves */
  function mergeOverDefaults(saved) {
    var base = defaults();
    if (!saved || typeof saved !== "object") return base;
    for (var k in base) {
      if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
      if (saved[k] === undefined) continue;
      var bv = base[k], sv = saved[k];
      if (bv && typeof bv === "object" && !Array.isArray(bv) &&
          sv && typeof sv === "object" && !Array.isArray(sv)) {
        for (var kk in bv) {
          if (sv[kk] !== undefined) base[k][kk] = sv[kk];
        }
        // also copy any extra keys the save had (e.g. extra flags/quests)
        for (var k2 in sv) { base[k][k2] = sv[k2]; }
      } else {
        base[k] = sv;
      }
    }
    return base;
  }

  function lsAvailable() {
    try {
      var t = "__tz_test__";
      window.localStorage.setItem(t, "1");
      window.localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  }

  return {
    defaults: defaults,
    exists: function (slot) {
      if (!lsAvailable()) return false;
      try { return window.localStorage.getItem(key(slot)) != null; }
      catch (e) { return false; }
    },
    write: function (slot) {
      slot = slot || (G && G.saveSlot) || 1;
      if (!lsAvailable()) return false;
      try {
        var data = JSON.stringify(G);
        window.localStorage.setItem(key(slot), data);
        return true;
      } catch (e) { return false; }
    },
    read: function (slot) {
      slot = slot || 1;
      if (!lsAvailable()) return null;
      try {
        var raw = window.localStorage.getItem(key(slot));
        if (raw == null) return null;
        return mergeOverDefaults(JSON.parse(raw));
      } catch (e) { return null; }
    },
    clear: function (slot) {
      if (!lsAvailable()) return;
      try { window.localStorage.removeItem(key(slot)); } catch (e) {}
    },
    /* load a slot INTO the live G object (keeps reference stable) */
    loadInto: function (slot) {
      var data = this.read(slot);
      if (!data) return false;
      replaceG(data);
      return true;
    },
    newGame: function (slot) {
      var d = defaults();
      if (slot) d.saveSlot = slot;
      replaceG(d);
      if (typeof setScene === "function") setScene("ch1_intro");
      return true;
    }
  };
})();

/* replace all fields of the live G with those of `src` (reference stable) */
function replaceG(src) {
  if (!G) { G = src; return; }
  for (var k in G) { if (Object.prototype.hasOwnProperty.call(G, k)) delete G[k]; }
  for (var k2 in src) { if (Object.prototype.hasOwnProperty.call(src, k2)) G[k2] = src[k2]; }
}

/* initialize live G now */
G = Save.defaults();

/* ---------- ENGINE core object --------------------------------------- */
var Engine = {
  W: 800,
  H: 600,
  paused: false,
  now: 0,
  _started: false,
  /* fade primitive: fade screen toward/away from black.
     toBlack:true -> cover with black; false -> reveal. cb fires at midpoint/end. */
  fade: function (toBlack, ms, cb) {
    _fade.active = true;
    _fade.dir = toBlack ? 1 : -1;
    _fade.dur = (ms == null ? 250 : ms);
    _fade.t = 0;
    _fade.cb = (typeof cb === "function") ? cb : null;
    if (!toBlack && _fade.alpha === 0) _fade.alpha = 1; // ensure visible reveal start
  }
};

/* internal fade state */
var _fade = { active: false, alpha: 0, dir: 0, t: 0, dur: 250, cb: null };

/* ---------- canvas / ctx (created or grabbed on boot) ---------------- */
var canvas = null;
var ctx = null;

function _ensureCanvas() {
  canvas = document.getElementById("game");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "game";
    if (document.body) document.body.appendChild(canvas);
  }
  canvas.width = Engine.W;
  canvas.height = Engine.H;
  // crisp pixel scaling in CSS
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
}

/* ---------- pixel-text helper (exposed) ------------------------------ */
function drawText(c, str, x, y, opts) {
  opts = opts || {};
  var size = opts.size || 16;
  var font = opts.font || ('700 ' + size + 'px "Courier New", monospace');
  c.save();
  c.font = font;
  c.textAlign = opts.align || "left";
  c.textBaseline = opts.baseline || "alphabetic";
  if (opts.maxWidth) {
    // simple word-wrap into lines
    var words = String(str).split(" ");
    var line = "", lines = [], i;
    for (i = 0; i < words.length; i++) {
      var test = line ? (line + " " + words[i]) : words[i];
      if (c.measureText(test).width > opts.maxWidth && line) {
        lines.push(line); line = words[i];
      } else { line = test; }
    }
    if (line) lines.push(line);
    var lh = opts.lineHeight || (size + 4);
    for (i = 0; i < lines.length; i++) {
      _emitText(c, lines[i], x, y + i * lh, opts);
    }
  } else {
    _emitText(c, String(str), x, y, opts);
  }
  c.restore();
}
function _emitText(c, str, x, y, opts) {
  if (opts.shadow !== false) {
    c.fillStyle = opts.shadowColor || PALETTE.outline;
    c.fillText(str, x + 2, y + 2);
  }
  c.fillStyle = opts.color || PALETTE.yurtWhite;
  c.fillText(str, x, y);
}

/* ===================================================================== */
/* SCENES registry + setScene                                            */
/* ===================================================================== */
var Scenes = (function () {
  var registry = {};
  return {
    _registry: registry,
    register: function (id, obj) {
      registry[id] = obj || {};
      return registry[id];
    },
    get: function (id) { return registry[id]; },
    has: function (id) { return !!registry[id]; },
    current: null,
    currentId: null
  };
})();

/* fallback scene factory for unknown ids — never throws */
function _makeFallbackScene(id) {
  return {
    _id: id,
    render: function (c) {
      c.fillStyle = "#000000";
      c.fillRect(0, 0, Engine.W, Engine.H);
      drawText(c, "СЦЕНА НЕ НАЙДЕНА: " + id, Engine.W / 2, Engine.H / 2 - 10,
        { color: PALETTE.gold, size: 22, align: "center" });
      drawText(c, "Z — на главную", Engine.W / 2, Engine.H / 2 + 26,
        { color: PALETTE.boneGrey, size: 14, align: "center" });
    },
    onKey: function (e) {
      if (e && e.action === "confirm") {
        if (typeof Audio !== "undefined" && Audio.playCue) Audio.playCue("sfx_confirm");
        setScene("title");
      }
    }
  };
}

/* setScene with fade transition. Queues the latest target during a fade.
   Optional `instant` (3rd arg) commits immediately with only a fade-IN — used by
   boot for the very first scene so a throttled first frame can never strand the
   player on the black boot screen. Normal gameplay transitions omit it (fade out+in). */
var _sceneSwap = { pending: null, mid: false };

function setScene(id, params, instant) {
  params = params || {};
  _sceneSwap.pending = { id: id, params: params };
  if (instant) {
    // commit now (no fade-out), then a short fade-in reveal
    _sceneSwap.mid = true;
    _commitPendingScene();
    _sceneSwap.mid = false;
    Engine.fade(false, 200, null);
    return;
  }
  // queue if currently mid-fade-out for another scene
  if (_fade.active && _fade.dir === 1 && _sceneSwap.mid) {
    // a fade-out is already running; the new target will be picked up at midpoint
    return;
  }
  _beginSceneFadeOut();
}

function _beginSceneFadeOut() {
  _sceneSwap.mid = false;
  Engine.fade(true, 220, function () {
    _sceneSwap.mid = true;
    _commitPendingScene();
    // fade back in
    Engine.fade(false, 220, function () {
      _sceneSwap.mid = false;
    });
  });
}

function _commitPendingScene() {
  var target = _sceneSwap.pending;
  if (!target) return;
  _sceneSwap.pending = null;

  var old = Scenes.current;
  var oldId = Scenes.currentId;
  if (old && typeof old.exit === "function") {
    try { old.exit(); } catch (e) {}
  }
  EventBus.emit("scene:exit", { id: oldId });

  var next = Scenes.get(target.id);
  if (!next) next = _makeFallbackScene(target.id);

  Scenes.current = next;
  Scenes.currentId = target.id;
  G.sceneId = target.id;
  Engine.paused = false;       // never carry pause across scenes
  _pause.open = false;

  if (typeof next.enter === "function") {
    try { next.enter(target.params || {}); } catch (e) {}
  }
  EventBus.emit("scene:enter", { id: target.id, params: target.params });
}

/* ===================================================================== */
/* INPUT                                                                 */
/* ===================================================================== */
var Input = (function () {
  var keys = {};        // currently-held semantic actions
  var pressedThisFrame = {}; // edge: true the frame it went down
  var bound = false;

  function actionFor(e) {
    var k = e.key;
    var code = e.code;
    // normalize
    if (k === "ArrowUp" || code === "KeyW" || k === "w" || k === "W" || k === "ц" || k === "Ц") return "up";
    if (k === "ArrowDown" || code === "KeyS" || k === "s" || k === "S" || k === "ы" || k === "Ы") return "down";
    if (k === "ArrowLeft" || code === "KeyA" || k === "a" || k === "A" || k === "ф" || k === "Ф") return "left";
    if (k === "ArrowRight" || code === "KeyD" || k === "d" || k === "D" || k === "в" || k === "В") return "right";
    if (k === "Enter" || code === "KeyZ" || k === "z" || k === "Z" || k === "я" || k === "Я") return "confirm";
    if (k === "Escape" || code === "KeyX" || k === "x" || k === "X" || k === "ч" || k === "Ч") return "cancel";
    if (k === " " || code === "Space" || k === "Spacebar") return "dombra";
    if (k === "1" || code === "Digit1") return "choice1";
    if (k === "2" || code === "Digit2") return "choice2";
    if (k === "3" || code === "Digit3") return "choice3";
    if (k === "4" || code === "Digit4") return "choice4";
    return undefined;
  }

  function onKeyDown(e) {
    // first user gesture -> resume audio
    if (typeof Audio !== "undefined" && Audio.resume) { try { Audio.resume(); } catch (x) {} }

    var action = actionFor(e);
    e.action = action;
    if (action) {
      // prevent page scroll on arrows/space
      if (action === "up" || action === "down" || action === "left" ||
          action === "right" || action === "dombra") {
        if (e.preventDefault) e.preventDefault();
      }
      if (!keys[action]) pressedThisFrame[action] = true;
      keys[action] = true;
    }

    // ENGINE intercepts cancel/Esc for the pause menu FIRST (unless blocked)
    var scene = Scenes.current;
    var blockPause = scene && scene.blockPause === true;
    if (action === "cancel" && !blockPause) {
      _togglePause();
      return; // consumed by engine
    }
    // if pause menu is open, it handles navigation
    if (_pause.open) {
      _pauseOnKey(e);
      return;
    }
    // dispatch to active scene
    if (scene && typeof scene.onKey === "function") {
      try { scene.onKey(e); } catch (x) {}
    }
  }

  function onKeyUp(e) {
    var action = actionFor(e);
    if (action) { keys[action] = false; }
  }

  function onClick(e) {
    if (typeof Audio !== "undefined" && Audio.resume) { try { Audio.resume(); } catch (x) {} }
    var rect = canvas.getBoundingClientRect();
    var sx = Engine.W / rect.width;
    var sy = Engine.H / rect.height;
    var x = (e.clientX - rect.left) * sx;
    var y = (e.clientY - rect.top) * sy;
    if (_pause.open) { _pauseOnClick(x, y); return; }
    var scene = Scenes.current;
    if (scene && typeof scene.onClick === "function") {
      try { scene.onClick(x, y); } catch (xx) {}
    }
  }

  return {
    keys: keys,
    pressed: function (action) { return !!pressedThisFrame[action]; },
    _clearFrame: function () { for (var k in pressedThisFrame) pressedThisFrame[k] = false; },
    bind: function () {
      if (bound) return;
      bound = true;
      window.addEventListener("keydown", onKeyDown, false);
      window.addEventListener("keyup", onKeyUp, false);
      if (canvas) canvas.addEventListener("click", onClick, false);
      // safety: clear held keys when window loses focus
      window.addEventListener("blur", function () {
        for (var k in keys) keys[k] = false;
      }, false);
    }
  };
})();

/* ===================================================================== */
/* PAUSE MENU SHELL                                                      */
/* ===================================================================== */
var _pause = { open: false, idx: 0, items: ["Продолжить", "Сохранить", "Загрузить", "На главную"] };

function _togglePause() {
  _pause.open = !_pause.open;
  Engine.paused = _pause.open;
  _pause.idx = 0;
  if (typeof Audio !== "undefined" && Audio.playCue) {
    Audio.playCue(_pause.open ? "sfx_cancel" : "sfx_confirm");
  }
}

function _pauseOnKey(e) {
  var a = e.action;
  if (a === "up") {
    _pause.idx = (_pause.idx + _pause.items.length - 1) % _pause.items.length;
    if (typeof Audio !== "undefined" && Audio.playCue) Audio.playCue("sfx_select");
  } else if (a === "down") {
    _pause.idx = (_pause.idx + 1) % _pause.items.length;
    if (typeof Audio !== "undefined" && Audio.playCue) Audio.playCue("sfx_select");
  } else if (a === "cancel") {
    _togglePause();
  } else if (a === "confirm" || a === "choice1" || a === "choice2" ||
             a === "choice3" || a === "choice4") {
    var pick = _pause.idx;
    if (a === "choice1") pick = 0; else if (a === "choice2") pick = 1;
    else if (a === "choice3") pick = 2; else if (a === "choice4") pick = 3;
    _pauseSelect(pick);
  }
}

function _pauseOnClick(x, y) {
  // hit-test the menu rows
  var startY = Engine.H / 2 - 40;
  for (var i = 0; i < _pause.items.length; i++) {
    var ry = startY + i * 34;
    if (x > Engine.W / 2 - 120 && x < Engine.W / 2 + 120 && y > ry - 18 && y < ry + 10) {
      _pauseSelect(i);
      return;
    }
  }
}

function _pauseSelect(i) {
  if (typeof Audio !== "undefined" && Audio.playCue) Audio.playCue("sfx_confirm");
  if (i === 0) {                       // Продолжить
    _togglePause();
  } else if (i === 1) {                // Сохранить
    Save.write(G.saveSlot || 1);
    _pause._flash = "Сохранено";
    _pause._flashT = 1200;
  } else if (i === 2) {                // Загрузить
    if (Save.exists(G.saveSlot || 1)) {
      Save.loadInto(G.saveSlot || 1);
      _pause.open = false; Engine.paused = false;
      setScene(G.sceneId || "ch1_intro");
    } else {
      _pause._flash = "Нет сохранения";
      _pause._flashT = 1200;
    }
  } else if (i === 3) {                // На главную
    _pause.open = false; Engine.paused = false;
    if (typeof Audio !== "undefined" && Audio.stopMusic) Audio.stopMusic();
    setScene("title");
  }
}

function _renderPause(c) {
  // dim
  c.fillStyle = "rgba(8,8,12,0.78)";
  c.fillRect(0, 0, Engine.W, Engine.H);
  // panel
  var pw = 300, ph = 230;
  var px = (Engine.W - pw) / 2, py = (Engine.H - ph) / 2 - 20;
  c.fillStyle = PALETTE.caveDark;
  c.fillRect(px, py, pw, ph);
  c.strokeStyle = PALETTE.goldAccent;
  c.lineWidth = 2;
  c.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  drawText(c, "ПАУЗА", Engine.W / 2, py + 36, { color: PALETTE.gold, size: 22, align: "center" });

  var startY = Engine.H / 2 - 40;
  for (var i = 0; i < _pause.items.length; i++) {
    var ry = startY + i * 34;
    var sel = (i === _pause.idx);
    if (sel) {
      c.fillStyle = PALETTE.goldAccent;
      c.fillRect(Engine.W / 2 - 120, ry - 18, 240, 26);
    }
    drawText(c, _pause.items[i], Engine.W / 2, ry,
      { color: sel ? PALETTE.outline : PALETTE.yurtWhite, size: 16, align: "center", shadow: !sel });
  }
  if (_pause._flash && _pause._flashT > 0) {
    drawText(c, _pause._flash, Engine.W / 2, py + ph + 22,
      { color: PALETTE.gold, size: 14, align: "center" });
  }
}

/* ===================================================================== */
/* BUILT-IN FALLBACK TITLE SCENE (overridden later by 70-ui.js)         */
/* ===================================================================== */
Scenes.register("title", {
  _t: 0,
  enter: function () { this._t = 0; },
  update: function (dt) { this._t += dt; },
  render: function (c) {
    c.fillStyle = "#000000";
    c.fillRect(0, 0, Engine.W, Engine.H);
    drawText(c, "ТАС ЖҮРЕК", Engine.W / 2, Engine.H / 2 - 40,
      { color: PALETTE.gold, size: 48, align: "center" });
    drawText(c, "STONE HEART", Engine.W / 2, Engine.H / 2 + 4,
      { color: PALETTE.boneGrey, size: 20, align: "center" });
    // blinking prompt
    var blink = (Math.floor(this._t / 500) % 2) === 0;
    if (blink) {
      drawText(c, "Нажмите Z", Engine.W / 2, Engine.H / 2 + 70,
        { color: PALETTE.yurtWhite, size: 18, align: "center" });
    }
  },
  onKey: function (e) {
    if (e && e.action === "confirm") {
      if (typeof Audio !== "undefined" && Audio.playCue) Audio.playCue("sfx_confirm");
      // continue if a save exists, else fresh
      if (Save.exists(G.saveSlot || 1)) {
        Save.loadInto(G.saveSlot || 1);
        setScene(G.sceneId && Scenes.has(G.sceneId) ? G.sceneId : "ch1_intro");
      } else {
        setScene("ch1_intro");
      }
    }
  }
});

/* internal boot scene: a pure black placeholder. boot() switches to "title"
   INSTANTLY (see boot()), so this is only ever on screen for the first frame.
   It also self-advances in update() as a belt-and-suspenders fallback in case
   boot() ran before "title" was registered. */
Scenes.register("boot", {
  enter: function () { this._go = 1; },
  update: function () {
    if (this._go && Scenes.has("title") && Scenes.currentId === "boot") {
      this._go = 0; setScene("title", {}, true);
    }
  },
  render: function (c) {
    c.fillStyle = "#000000";
    c.fillRect(0, 0, Engine.W, Engine.H);
  }
});

/* ===================================================================== */
/* MAIN LOOP                                                             */
/* ===================================================================== */
var _lastTs = 0;

function _frame(ts) {
  if (!_lastTs) _lastTs = ts;
  var dt = ts - _lastTs;
  _lastTs = ts;
  Engine.now = ts;
  if (dt < 0) dt = 0;
  if (dt > 50) dt = 50; // clamp to avoid spiral-of-death after tab-switch

  // re-assert pixel mode each frame (cheap, robust against external resets)
  if (ctx) ctx.imageSmoothingEnabled = false;

  // advance time + decay only when not paused
  if (!Engine.paused) {
    G.gameTimeMs += dt;
    if (typeof Decay !== "undefined" && Decay.tick) {
      try { Decay.tick(dt); } catch (e) {}
    }
    var scene = Scenes.current;
    if (scene && typeof scene.update === "function") {
      try { scene.update(dt); } catch (e) {}
    }
  }

  // advance fade timer (runs even while paused so pause overlay can fade)
  _updateFade(dt);
  if (_pause._flashT > 0) { _pause._flashT -= dt; }

  // RENDER — always draw the active scene
  if (ctx) {
    var sc = Scenes.current;
    if (sc && typeof sc.render === "function") {
      try { sc.render(ctx); }
      catch (e) {
        // last-ditch: don't let a render crash freeze the loop
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, Engine.W, Engine.H);
      }
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, Engine.W, Engine.H);
    }
    // pause overlay on top of scene
    if (_pause.open) { _renderPause(ctx); }
    // fade overlay on very top
    if (_fade.alpha > 0) {
      ctx.fillStyle = "rgba(0,0,0," + _fade.alpha.toFixed(3) + ")";
      ctx.fillRect(0, 0, Engine.W, Engine.H);
    }
  }

  // clear per-frame edge input AFTER scene + pause have read it
  Input._clearFrame();

  requestAnimationFrame(_frame);
}

function _updateFade(dt) {
  if (!_fade.active && _fade.alpha <= 0 && _fade.dir >= 0) return;
  if (_fade.active) {
    _fade.t += dt;
    var p = clamp(_fade.t / _fade.dur, 0, 1);
    if (_fade.dir === 1) {        // fading to black
      _fade.alpha = p;
    } else if (_fade.dir === -1) { // revealing
      _fade.alpha = 1 - p;
    }
    if (p >= 1) {
      _fade.active = false;
      var cb = _fade.cb; _fade.cb = null;
      if (_fade.dir === 1) { _fade.alpha = 1; }
      else { _fade.alpha = 0; }
      _fade.dir = 0;
      if (cb) { try { cb(); } catch (e) {} }
    }
  }
}

/* ===================================================================== */
/* BOOT                                                                  */
/* ===================================================================== */
function boot() {
  if (Engine._started) return;
  Engine._started = true;

  _ensureCanvas();
  Input.bind();

  // start in the boot scene as an immediate, drawable placeholder...
  Scenes.current = Scenes.get("boot");
  Scenes.currentId = "boot";
  G.sceneId = "boot";
  if (Scenes.current && typeof Scenes.current.enter === "function") {
    try { Scenes.current.enter({}); } catch (e) {}
  }

  // kick the loop
  _lastTs = 0;
  requestAnimationFrame(_frame);

  // ...then switch to the title INSTANTLY (no fade-out), so a throttled/hidden
  // first frame can never leave the player stranded on the black boot screen.
  setScene("title", {}, true);
}

/* wire DOMContentLoaded -> boot, guarding if document is already loaded */
if (typeof document !== "undefined") {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    // already loaded (e.g. script at end of body): boot on next tick so the
    // rest of the concatenated modules finish executing first
    setTimeout(boot, 0);
  } else {
    document.addEventListener("DOMContentLoaded", boot, false);
  }
}
