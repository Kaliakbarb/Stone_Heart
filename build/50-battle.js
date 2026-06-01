/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 50-battle.js  (BATTLE + DOMBRA RHYTHM)
   Owns: Battle, Rhythm   (per CONTRACT.md §9)
   RAW JS — concatenated after 40-dialogue.js inside the single <script>.

   Battle.start(cfg)  : a battle scene with enemy sprite, HP bars, and the
                        action menu (Атака / Домбра / Предмет) for meleeable
                        foes. The dombra rhythm minigame WEAKENS an enemy so
                        melee lands; rhythm-only bosses (canMelee:false) are
                        resolved PURELY by clearing the rhythm at the needed
                        accuracy. theme_battle plays; onWin/onLose fire; lethal
                        wins increment the HIDDEN G.killCount.

   Rhythm.start(cfg)  : falling-arrow minigame across 4 lanes to a hit-line;
                        Perfect/Good/Miss timing windows; accuracy %; >90% =
                        maximum effect; lane flashes synced via Audio.playMelody.
                        Clean & readable at 800x600.

   Everything cross-module is GUARDED so a single absent sprite/audio/scene key
   can never throw inside the 60fps loop — it no-ops gracefully instead.
   Only registers a scene at top-level; no other module's runtime method is
   called at top-level (CONTRACT §1 / §18).
   ===================================================================== */

/* ---------- tiny local helpers (self-sufficient; never assume engine util
   helpers beyond those the contract guarantees: clamp/lerp/lerpColor/rint/
   drawText). All are guarded so this module runs even in isolation. -------- */
var _BW = (typeof Engine !== "undefined" && Engine.W) ? Engine.W : 800;
var _BH = (typeof Engine !== "undefined" && Engine.H) ? Engine.H : 600;

function _bClamp(v, a, b) {
  if (typeof clamp === "function") return clamp(v, a, b);
  return v < a ? a : (v > b ? b : v);
}
function _bLerp(a, b, t) {
  if (typeof lerp === "function") return lerp(a, b, t);
  return a + (b - a) * t;
}
function _bRint(n) {
  if (typeof rint === "function") return rint(n);
  return n | 0;
}
/* palette lookup with a safe fallback so a missing PALETTE never throws */
function _pal(name, fallback) {
  if (typeof PALETTE !== "undefined" && PALETTE && PALETTE[name]) return PALETTE[name];
  return fallback || "#D4A017";
}
/* engine text helper with a built-in fallback (so module is drawable alone) */
function _bText(c, str, x, y, opts) {
  opts = opts || {};
  if (typeof drawText === "function") { drawText(c, str, x, y, opts); return; }
  c.save();
  c.font = opts.font || ('700 ' + (opts.size || 16) + 'px "Courier New", monospace');
  c.textAlign = opts.align || "left";
  c.textBaseline = opts.baseline || "alphabetic";
  if (opts.shadow !== false) {
    c.fillStyle = opts.shadowColor || _pal("outline", "#1A0A00");
    c.fillText(String(str), x + 2, y + 2);
  }
  c.fillStyle = opts.color || _pal("yurtWhite", "#F5ECD7");
  c.fillText(String(str), x, y);
  c.restore();
}
/* guarded one-shot / music cue */
function _cue(name) {
  if (typeof Audio !== "undefined" && Audio && Audio.playCue) {
    try { Audio.playCue(name); } catch (e) {}
  }
}
function _stopMusic() {
  if (typeof Audio !== "undefined" && Audio && Audio.stopMusic) {
    try { Audio.stopMusic(); } catch (e) {}
  }
}
/* guarded sprite draw — Sprites itself magenta-boxes unknown keys, but we
   still guard the whole call so an absent Sprites namespace is a no-op. */
function _spr(c, key, x, y, scale, opts) {
  if (typeof Sprites !== "undefined" && Sprites && Sprites.draw) {
    try { Sprites.draw(c, key, x, y, scale, opts); return true; }
    catch (e) { return false; }
  }
  return false;
}
function _sprHas(key) {
  if (typeof Sprites !== "undefined" && Sprites && Sprites.has) {
    try { return !!Sprites.has(key); } catch (e) { return false; }
  }
  return false;
}
/* read the player's edge-press for an action, guarded */
function _pressed(action) {
  if (typeof Input !== "undefined" && Input && Input.pressed) {
    try { return !!Input.pressed(action); } catch (e) { return false; }
  }
  return false;
}

/* ---------- shared rounded-panel + bar drawing (used by both systems) --- */
function _panel(c, x, y, w, h, fill, border) {
  c.save();
  c.fillStyle = fill || _pal("caveDark", "#171826");
  c.fillRect(x, y, w, h);
  c.strokeStyle = border || _pal("goldAccent", "#C8960C");
  c.lineWidth = 2;
  c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  c.restore();
}
/* an HP bar that lerps green->red by fill ratio */
function _hpBar(c, x, y, w, h, ratio, labelColor) {
  ratio = _bClamp(ratio, 0, 1);
  c.save();
  // frame
  c.fillStyle = _pal("outline", "#1A0A00");
  c.fillRect(x - 2, y - 2, w + 4, h + 4);
  c.fillStyle = "#2a2a2a";
  c.fillRect(x, y, w, h);
  // fill color: red(empty) -> gold(half) -> green(full)
  var col;
  if (typeof lerpColor === "function") {
    col = ratio > 0.5
      ? lerpColor(_pal("gold", "#D4A017"), _pal("grassLight", "#7CA646"), (ratio - 0.5) * 2)
      : lerpColor(_pal("feltRed", "#C0392B"), _pal("gold", "#D4A017"), ratio * 2);
  } else {
    col = ratio > 0.4 ? _pal("grassLight", "#7CA646") : _pal("feltRed", "#C0392B");
  }
  c.fillStyle = col;
  c.fillRect(x, y, _bRint(w * ratio), h);
  // subtle top highlight
  c.fillStyle = "rgba(255,255,255,0.18)";
  c.fillRect(x, y, _bRint(w * ratio), 2);
  c.restore();
}

/* =====================================================================
   RHYTHM  — the falling-arrow dombra minigame (CONTRACT §9)
   Used inside Battle for bosses AND by dialogues/scenes for "play dombra
   to convince" moments. Draws itself as an overlay scene while active and
   restores control on completion via onResult(accuracyPct 0..100).
   ===================================================================== */
var Rhythm = (function () {

  /* timing windows (ms), per contract: ±120 = hit, ±60 = perfect */
  var WIN_HIT = 120;
  var WIN_PERFECT = 60;

  /* lane geometry */
  var LANES = 4;
  var LANE_KEY = ["left", "down", "up", "right"];   // arrow mapping per contract
  var LANE_NUM = ["choice1", "choice2", "choice3", "choice4"]; // 1 2 3 4 alternates
  var LANE_GLYPH = ["←", "↓", "↑", "→"];   // ← ↓ ↑ →
  var LANE_COLOR = ["feltRed", "skyBlue", "gold", "grassLight"];

  /* layout: a tall play-field centered on screen */
  var FIELD = { x: 250, y: 40, w: 300, h: 470 };
  var HIT_Y = FIELD.y + FIELD.h - 70;   // the hit line near the bottom
  var FALL_MS = 1900;                    // ms a note takes to fall the full field
  var ARROW_R = 22;                      // arrow half-size (px)

  /* runtime state */
  var st = {
    active: false,
    notes: [],          // [{lane, t, hit:false, judged:false, result:"", flashT:0}]
    bpm: 90,
    onResult: null,
    elapsed: 0,
    startDelay: 1100,   // lead-in so the first note isn't instantly upon the player
    lastT: 0,           // time of last note (+ tail) -> when we resolve
    laneFlash: [0, 0, 0, 0], // per-lane glow timers (audio-synced + on press)
    judgements: [],     // floating "PERFECT/GOOD/MISS" popups
    counts: { perfect: 0, good: 0, miss: 0 },
    total: 0,
    score: 0,           // weighted accuracy points (perfect=1, good=0.6)
    finished: false,
    resolveT: 0,        // small linger before reporting result
    prevId: null,       // scene id to restore (we overlay via setScene)
    title: ""           // optional caption for the moment
  };

  /* convert a melody entry into {lane,t} robustly. Accept {lane,t} as the
     canonical form; tolerate {semis,...} by mapping it onto a lane. */
  function _normMelody(melody) {
    var out = [];
    if (!melody || !melody.length) return out;
    var run = 0;
    for (var i = 0; i < melody.length; i++) {
      var m = melody[i];
      if (m == null) continue;
      var lane, t;
      if (typeof m === "number") {
        lane = ((m % LANES) + LANES) % LANES;
        t = run; run += 480;
      } else {
        if (typeof m.t === "number") { t = m.t; }
        else { t = run; run += (m.dur || 480); }
        if (typeof m.lane === "number") {
          lane = ((m.lane | 0) % LANES + LANES) % LANES;
        } else if (typeof m.semis === "number") {
          lane = ((m.semis | 0) % LANES + LANES) % LANES;
        } else {
          lane = i % LANES;
        }
      }
      out.push({ lane: lane, t: t, hit: false, judged: false, result: "", flashT: 0 });
    }
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  /* build the {semis,dur} array for Audio.playMelody from notes, mapping each
     lane to a pentatonic degree so lane flashes sync to real pitches. */
  var PENTA = [0, 2, 4, 7, 9];
  function _audioMelody(notes) {
    var out = [];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var nxt = (i + 1 < notes.length) ? notes[i + 1].t : (n.t + 480);
      var dur = _bClamp(nxt - n.t, 140, 640);
      // lanes 0..3 -> low->high pentatonic degrees (+ a 5th note for variety)
      var semis = PENTA[n.lane % PENTA.length];
      out.push({ semis: semis, dur: dur, _at: n.t });
    }
    return out;
  }

  function _judge(note, dtAbs) {
    if (dtAbs <= WIN_PERFECT) return "PERFECT";
    if (dtAbs <= WIN_HIT) return "GOOD";
    return "MISS";
  }

  function _addPopup(text, lane, color) {
    st.judgements.push({
      text: text, color: color,
      x: FIELD.x + (lane + 0.5) * (FIELD.w / LANES),
      y: HIT_Y - 30, life: 620, max: 620
    });
  }

  function _tryHit(lane) {
    if (!st.active || st.finished) return;
    // flash the lane on any press (responsive feel)
    st.laneFlash[lane] = Math.max(st.laneFlash[lane], 120);
    // find the nearest un-judged note in this lane within the hit window
    var songT = st.elapsed - st.startDelay;
    var best = -1, bestDt = WIN_HIT + 1;
    for (var i = 0; i < st.notes.length; i++) {
      var n = st.notes[i];
      if (n.judged || n.lane !== lane) continue;
      var dt = Math.abs(n.t - songT);
      if (dt < bestDt) { bestDt = dt; best = i; }
    }
    if (best < 0 || bestDt > WIN_HIT) {
      // a press with no note in range — a small mistimed tick (no penalty to
      // accuracy total; only real notes count toward total).
      _cue("sfx_select");
      return;
    }
    var note = st.notes[best];
    note.judged = true;
    note.hit = true;
    var res = _judge(note, bestDt);
    note.result = res;
    if (res === "PERFECT") {
      st.counts.perfect++; st.score += 1.0;
      _cue("sfx_confirm");
      _addPopup("PERFECT", lane, _pal("gold", "#D4A017"));
    } else if (res === "GOOD") {
      st.counts.good++; st.score += 0.6;
      _cue("sfx_hit");
      _addPopup("GOOD", lane, _pal("grassLight", "#7CA646"));
    } else {
      st.counts.miss++;
      _cue("sfx_cancel");
      note.hit = false;
      _addPopup("MISS", lane, _pal("feltRed", "#C0392B"));
    }
    st.laneFlash[lane] = 180;
  }

  function _missNote(note) {
    if (note.judged) return;
    note.judged = true;
    note.hit = false;
    note.result = "MISS";
    st.counts.miss++;
    _addPopup("MISS", note.lane, _pal("feltRed", "#C0392B"));
  }

  function _accuracy() {
    if (st.total <= 0) return 100;
    return _bClamp(Math.round((st.score / st.total) * 100), 0, 100);
  }

  /* ---- the overlay scene Rhythm installs while running ---- */
  var SCENE_ID = "__rhythm__";
  var scene = {
    blockPause: true,   // no pause menu mid-minigame
    enter: function () {},
    exit: function () {},

    update: function (dt) {
      if (!st.active) return;
      st.elapsed += dt;

      // lane-flash + popup decay
      for (var L = 0; L < LANES; L++) {
        if (st.laneFlash[L] > 0) st.laneFlash[L] = Math.max(0, st.laneFlash[L] - dt);
      }
      for (var p = st.judgements.length - 1; p >= 0; p--) {
        st.judgements[p].life -= dt;
        st.judgements[p].y -= dt * 0.03;
        if (st.judgements[p].life <= 0) st.judgements.splice(p, 1);
      }

      var songT = st.elapsed - st.startDelay;

      // auto-miss notes that have fallen past the hit window
      for (var i = 0; i < st.notes.length; i++) {
        var n = st.notes[i];
        if (!n.judged && (songT - n.t) > WIN_HIT) {
          _missNote(n);
        }
      }

      // poll edge presses for all lanes (works alongside onKey for redundancy)
      for (var k = 0; k < LANES; k++) {
        if (_pressed(LANE_KEY[k]) || _pressed(LANE_NUM[k])) { _tryHit(k); }
      }

      // resolve when every note has been judged AND the song tail has elapsed
      if (!st.finished) {
        var allJudged = true;
        for (var j = 0; j < st.notes.length; j++) {
          if (!st.notes[j].judged) { allJudged = false; break; }
        }
        if (allJudged && songT > (st.lastT + 350)) {
          st.finished = true;
          st.resolveT = 850; // linger to show the final grade
        }
      } else {
        st.resolveT -= dt;
        if (st.resolveT <= 0) { _finish(); }
      }
    },

    render: function (c) {
      // backdrop
      c.fillStyle = _pal("caveDark", "#171826");
      c.fillRect(0, 0, _BW, _BH);
      // subtle starscape so it reads as a focused minigame
      c.fillStyle = "rgba(255,255,255,0.04)";
      for (var s = 0; s < 40; s++) {
        var sx = (s * 97 + 13) % _BW;
        var sy = (s * 53 + 29) % _BH;
        c.fillRect(sx, sy, 2, 2);
      }

      // title / instruction
      if (st.title) {
        _bText(c, st.title, _BW / 2, 28,
          { color: _pal("gold", "#D4A017"), size: 18, align: "center" });
      }

      // play-field frame
      _panel(c, FIELD.x - 6, FIELD.y - 6, FIELD.w + 12, FIELD.h + 12,
        _pal("night", "#0E0F1A"), _pal("goldAccent", "#C8960C"));

      var laneW = FIELD.w / LANES;
      var songT = st.elapsed - st.startDelay;

      // lane columns + flashes
      for (var L = 0; L < LANES; L++) {
        var lx = FIELD.x + L * laneW;
        // column separators
        c.strokeStyle = "rgba(255,255,255,0.07)";
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(lx + 0.5, FIELD.y); c.lineTo(lx + 0.5, FIELD.y + FIELD.h); c.stroke();
        // lane flash glow
        if (st.laneFlash[L] > 0) {
          var fa = (st.laneFlash[L] / 180) * 0.30;
          c.fillStyle = _hexAlpha(_pal(LANE_COLOR[L], "#D4A017"), fa);
          c.fillRect(lx, FIELD.y, laneW, FIELD.h);
        }
      }

      // hit-line (the target zone)
      c.fillStyle = _pal("gold", "#D4A017");
      c.fillRect(FIELD.x, HIT_Y - 2, FIELD.w, 4);
      // target rings at the hit-line
      for (var T = 0; T < LANES; T++) {
        var cx = FIELD.x + (T + 0.5) * laneW;
        _drawArrow(c, cx, HIT_Y, ARROW_R, T, true,
          st.laneFlash[T] > 0 ? 1 : 0.55);
      }

      // falling notes
      for (var i = 0; i < st.notes.length; i++) {
        var n = st.notes[i];
        if (n.judged && !n.hit && (songT - n.t) > 260) continue; // faded miss
        if (n.judged && n.hit) continue;                          // consumed
        // position: at n.t the arrow is exactly on HIT_Y; before, it's higher
        var prog = (songT - n.t) / FALL_MS;             // -1..0 as it approaches
        var y = HIT_Y + prog * (FIELD.h - 60);
        if (y < FIELD.y - ARROW_R || y > FIELD.y + FIELD.h + ARROW_R) {
          if (y < FIELD.y - ARROW_R) {
            // still above the field — clamp so it appears at the top edge fading in
          } else {
            continue;
          }
        }
        var cx2 = FIELD.x + (n.lane + 0.5) * laneW;
        var alpha = 1;
        if (n.judged && !n.hit) alpha = _bClamp(1 - (songT - n.t) / 260, 0, 1);
        _drawArrow(c, cx2, y, ARROW_R, n.lane, false, alpha);
      }

      // key hints under each lane
      for (var H = 0; H < LANES; H++) {
        var hx = FIELD.x + (H + 0.5) * laneW;
        _bText(c, LANE_GLYPH[H], hx, FIELD.y + FIELD.h + 26,
          { color: _pal(LANE_COLOR[H], "#D4A017"), size: 22, align: "center" });
        _bText(c, String(H + 1), hx, FIELD.y + FIELD.h + 46,
          { color: _pal("boneGrey", "#B8B4A4"), size: 12, align: "center" });
      }

      // floating judgement popups
      for (var p = 0; p < st.judgements.length; p++) {
        var jd = st.judgements[p];
        var ja = _bClamp(jd.life / jd.max, 0, 1);
        c.save(); c.globalAlpha = ja;
        _bText(c, jd.text, jd.x, jd.y, { color: jd.color, size: 16, align: "center" });
        c.restore();
      }

      // live accuracy readout
      var acc = _accuracy();
      _panel(c, 20, 20, 150, 64, _pal("night", "#0E0F1A"), _pal("goldAccent", "#C8960C"));
      _bText(c, "ТОЧНОСТЬ", 95, 42, { color: _pal("boneGrey", "#B8B4A4"), size: 12, align: "center" });
      _bText(c, acc + "%", 95, 70, {
        color: acc >= 90 ? _pal("gold", "#D4A017") : _pal("yurtWhite", "#F5ECD7"),
        size: 24, align: "center"
      });

      // hit tally
      _bText(c,
        "PERFECT " + st.counts.perfect + "   GOOD " + st.counts.good + "   MISS " + st.counts.miss,
        _BW / 2, _BH - 14, { color: _pal("boneGrey", "#B8B4A4"), size: 12, align: "center" });

      // lead-in / final overlays
      if (songT < 0) {
        var cnt = Math.ceil(-songT / 1000) + 1;
        _bText(c, "Слушай...", _BW / 2, _BH / 2,
          { color: _pal("gold", "#D4A017"), size: 26, align: "center" });
      }
      if (st.finished) {
        c.fillStyle = "rgba(8,8,12,0.55)";
        c.fillRect(0, _BH / 2 - 60, _BW, 120);
        var fa2 = _accuracy();
        var grade = fa2 >= 90 ? "ПРЕКРАСНО" : (fa2 >= 60 ? "ХОРОШО" : "СНОВА");
        _bText(c, grade, _BW / 2, _BH / 2 - 8,
          { color: fa2 >= 90 ? _pal("gold", "#D4A017") : _pal("yurtWhite", "#F5ECD7"), size: 30, align: "center" });
        _bText(c, fa2 + "%", _BW / 2, _BH / 2 + 28,
          { color: _pal("boneGrey", "#B8B4A4"), size: 18, align: "center" });
      }
    },

    onKey: function (e) {
      if (!st.active || !e) return;
      var a = e.action;
      // map arrows / number keys to lanes
      if (a === "left") _tryHit(0);
      else if (a === "down") _tryHit(1);
      else if (a === "up") _tryHit(2);
      else if (a === "right") _tryHit(3);
      else if (a === "choice1") _tryHit(0);
      else if (a === "choice2") _tryHit(1);
      else if (a === "choice3") _tryHit(2);
      else if (a === "choice4") _tryHit(3);
      else if (a === "confirm" && st.finished) {
        // allow skipping the linger
        _finish();
      }
    },

    onClick: function (x, y) {
      if (!st.active) return;
      // clicking within a lane near the hit-line registers a hit (touch/mouse)
      if (y > FIELD.y && y < FIELD.y + FIELD.h && x > FIELD.x && x < FIELD.x + FIELD.w) {
        var laneW = FIELD.w / LANES;
        var lane = _bClamp(Math.floor((x - FIELD.x) / laneW), 0, LANES - 1);
        _tryHit(lane);
      }
    }
  };

  function _finish() {
    if (!st.active) return;
    st.active = false;
    var acc = _accuracy();
    var cb = st.onResult;
    st.onResult = null;
    _stopMusic(); // melody one-shot done; stop any looped accompaniment
    // hand control back: the callback decides where to go. If it doesn't move
    // scenes, restore the scene we overlaid.
    var prev = st.prevId;
    var moved = false;
    if (typeof cb === "function") {
      // detect scene change by snapshotting currentId
      var before = (typeof Scenes !== "undefined") ? Scenes.currentId : null;
      try { cb(acc); } catch (e) {}
      var after = (typeof Scenes !== "undefined") ? Scenes.currentId : null;
      moved = (after !== SCENE_ID) && (after !== before || before !== SCENE_ID);
      // if the callback already navigated away from our overlay, respect it
      if (after !== SCENE_ID) { return; }
    }
    // no navigation happened inside the callback -> return to previous scene
    if (typeof setScene === "function" && prev && prev !== SCENE_ID) {
      setScene(prev);
    }
  }

  /* register the overlay scene once at top-level (registration is top-level
     safe per CONTRACT §1/§17). We never CALL it here. */
  if (typeof Scenes !== "undefined" && Scenes.register) {
    Scenes.register(SCENE_ID, scene);
  }

  return {
    /* Rhythm.start({melody,bpm,onResult,title}) */
    start: function (cfg) {
      cfg = cfg || {};
      st.notes = _normMelody(cfg.melody);
      st.bpm = cfg.bpm || 90;
      st.onResult = (typeof cfg.onResult === "function") ? cfg.onResult : null;
      st.title = cfg.title || "Сыграй кюй";
      st.elapsed = 0;
      st.startDelay = (cfg.leadIn != null) ? cfg.leadIn : 1100;
      st.laneFlash = [0, 0, 0, 0];
      st.judgements = [];
      st.counts = { perfect: 0, good: 0, miss: 0 };
      st.total = st.notes.length;
      st.score = 0;
      st.finished = false;
      st.resolveT = 0;
      st.lastT = st.notes.length ? st.notes[st.notes.length - 1].t : 0;
      st.active = true;

      // remember where to return; only if we're not already the overlay
      var cur = (typeof Scenes !== "undefined") ? Scenes.currentId : null;
      if (cur !== SCENE_ID) st.prevId = cur;

      // schedule the audio so lane flashes line up with pentatonic notes.
      // playMelody's onNote(i, when) flashes lane on each note for audio sync.
      if (typeof Audio !== "undefined" && Audio && Audio.playMelody && st.notes.length) {
        var am = _audioMelody(st.notes);
        try {
          Audio.playMelody(am, st.bpm, function (idx) {
            var nn = st.notes[idx];
            if (nn) { st.laneFlash[nn.lane] = Math.max(st.laneFlash[nn.lane], 160); }
          });
        } catch (e) {}
      }

      // overlay ourselves as the active scene (engine fades handle the swap)
      if (typeof setScene === "function") setScene(SCENE_ID);
    },
    get active() { return st.active; },
    /* exposed for hosts that prefer to drive Rhythm from their own loop */
    update: function (dt) { scene.update(dt); },
    render: function (c) { scene.render(c); },
    onKey: function (e) { scene.onKey(e); },
    _sceneId: SCENE_ID
  };

  /* ---- drawing primitives (closure-local) ---- */
  function _drawArrow(c, cx, cy, r, lane, isTarget, alpha) {
    alpha = (alpha == null) ? 1 : alpha;
    var col = _pal(LANE_COLOR[lane], "#D4A017");
    c.save();
    c.globalAlpha = alpha;
    c.translate(cx, cy);
    // rotate a base "up" triangle to the lane direction
    var rot = [Math.PI / 2, Math.PI, 0, -Math.PI / 2][lane]; // left,down,up,right
    c.rotate(rot);
    if (isTarget) {
      // hollow ring target
      c.strokeStyle = col;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, -r);
      c.lineTo(r * 0.85, r * 0.7);
      c.lineTo(-r * 0.85, r * 0.7);
      c.closePath();
      c.stroke();
    } else {
      // filled arrow with dark outline
      c.fillStyle = _pal("outline", "#1A0A00");
      c.beginPath();
      c.moveTo(0, -r - 2);
      c.lineTo(r * 0.95, r * 0.78);
      c.lineTo(-r * 0.95, r * 0.78);
      c.closePath();
      c.fill();
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(0, -r);
      c.lineTo(r * 0.78, r * 0.62);
      c.lineTo(-r * 0.78, r * 0.62);
      c.closePath();
      c.fill();
      // inner shine
      c.fillStyle = "rgba(255,255,255,0.28)";
      c.beginPath();
      c.moveTo(0, -r * 0.6);
      c.lineTo(r * 0.32, r * 0.1);
      c.lineTo(-r * 0.32, r * 0.1);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  function _hexAlpha(hex, a) {
    var rgb = _safeRgb(hex);
    return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a.toFixed(3) + ")";
  }
  function _safeRgb(hex) {
    if (typeof hex !== "string") return [212, 160, 23];
    var h = hex.charAt(0) === "#" ? hex.slice(1) : hex;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length < 6) return [212, 160, 23];
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return [212, 160, 23];
    return [r, g, b];
  }
})();

/* =====================================================================
   BATTLE  — the combat scene/overlay (CONTRACT §9)
   Battle.start(cfg) installs its own internal battle scene as the active
   scene, then returns to the caller scene on win/lose via onWin/onLose.
   ===================================================================== */
var Battle = (function () {

  var SCENE_ID = "__battle__";

  /* default action menu for meleeable foes (verbatim Russian labels) */
  var ACTIONS = ["Атака", "Домбра", "Предмет"];

  var st = {
    active: false,
    cfg: null,
    enemyKey: "",
    name: "",
    hpMax: 1,
    hp: 1,
    playerHpMax: 20,
    playerHp: 20,
    canMelee: true,
    countsAsKill: true,
    music: "theme_battle",
    rhythm: null,           // {melody,bpm,accuracyNeeded}
    onWin: null,
    onLose: null,
    prevId: null,

    // menu / phase
    phase: "intro",         // intro | menu | melee | enemyTurn | result | (rhythm handled by Rhythm overlay)
    menuIdx: 0,
    introT: 0,

    // weaken model
    weakenStacks: 0,        // remaining empowered melee hits
    weakenMult: 1,          // damage multiplier from the last dombra pass
    lastAccuracy: 0,

    // melee reticle
    reticleT: 0,            // sweeps 0..1; confirm locks a hit; center = best
    reticleDir: 1,

    // feedback
    shakeT: 0,
    flashT: 0,
    floats: [],             // damage numbers
    log: "",                // one-line battle log
    logT: 0,
    resultWin: false,
    resultT: 0,
    enemyBob: 0,
    enemyHurtT: 0,
    pendingRhythm: false    // set when launching the Rhythm overlay so we resume
  };

  function _log(s, ms) { st.log = s; st.logT = (ms == null ? 2200 : ms); }

  function _float(text, x, y, color) {
    st.floats.push({ text: text, x: x, y: y, life: 900, max: 900, color: color || _pal("feltRed", "#C0392B") });
  }

  /* enemy layout (centered upper area) */
  var ENEMY = { x: _BW / 2, y: 230, scale: 6 };

  function _enemyScaleFor(key) {
    // bosses are big; rough auto-fit so the sprite reads at 800x600
    if (key === "donen") return 7;
    if (key === "shadow") return 8;
    if (key === "jalmauyz") return 7;
    return 6;
  }

  /* ---------- damage / win / lose ---------- */
  function _enemyTakeDamage(amount, kind) {
    amount = Math.max(0, _bRint(amount));
    if (amount <= 0) return;
    st.hp = _bClamp(st.hp - amount, 0, st.hpMax);
    st.enemyHurtT = 260;
    st.shakeT = 220;
    _float("-" + amount, ENEMY.x + (Math.random() * 40 - 20), ENEMY.y - 30,
      kind === "dombra" ? _pal("gold", "#D4A017") : _pal("feltRed", "#C0392B"));
    _cue("sfx_hit");
    if (st.hp <= 0) { _win(); }
  }

  function _win() {
    if (!st.active || st.phase === "result") return;
    st.phase = "result";
    st.resultWin = true;
    st.resultT = 1700;
    // HIDDEN kill counter: only lethal, "real" kills count. Rhythm-only bosses
    // pass countsAsKill:false (Жалмауыз crumbles, Дөнен sleeps, Тень absorbed).
    if (st.countsAsKill && typeof G !== "undefined" && G) {
      G.killCount = (G.killCount | 0) + 1;
    }
    if (typeof EventBus !== "undefined" && EventBus.emit) {
      try { EventBus.emit("battle:win", { name: st.name, key: st.enemyKey }); } catch (e) {}
    }
    _stopMusic();
    _cue(st.countsAsKill ? "sfx_confirm" : "sfx_heal");
  }

  function _lose() {
    if (!st.active || st.phase === "result") return;
    st.phase = "result";
    st.resultWin = false;
    st.resultT = 1700;
    if (typeof EventBus !== "undefined" && EventBus.emit) {
      try { EventBus.emit("battle:lose", { name: st.name, key: st.enemyKey }); } catch (e) {}
    }
    _stopMusic();
    _cue("sfx_death");
  }

  function _finishBattle() {
    st.active = false;
    var win = st.resultWin;
    var onWin = st.onWin, onLose = st.onLose;
    st.onWin = null; st.onLose = null;
    var prev = st.prevId;

    // call the outcome callback; it normally navigates (setScene). If it does
    // not, we fall back to the scene we came from so the player is never stuck.
    var before = (typeof Scenes !== "undefined") ? Scenes.currentId : null;
    var cb = win ? onWin : onLose;
    if (typeof cb === "function") {
      try { cb(); } catch (e) {}
    }
    var after = (typeof Scenes !== "undefined") ? Scenes.currentId : null;
    if (after === SCENE_ID) {
      // callback did not move us off the battle overlay
      if (typeof setScene === "function" && prev && prev !== SCENE_ID) {
        setScene(prev);
      }
    }
  }

  /* ---------- dombra pass (rhythm) ---------- */
  function _startDombra() {
    if (st.phase === "result") return;
    // launch the Rhythm overlay; on result, apply weaken / boss-resolve.
    var melody = (st.rhythm && st.rhythm.melody) ? st.rhythm.melody : _defaultMelody();
    var bpm = (st.rhythm && st.rhythm.bpm) ? st.rhythm.bpm : 96;
    var need = (st.rhythm && st.rhythm.accuracyNeeded != null) ? st.rhythm.accuracyNeeded : 90;
    st.pendingRhythm = true;
    if (typeof Rhythm !== "undefined" && Rhythm.start) {
      Rhythm.start({
        melody: melody,
        bpm: bpm,
        title: st.canMelee ? ("Ослабь: " + st.name) : st.name,
        onResult: function (acc) { _onDombraResult(acc, need); }
      });
    } else {
      // Rhythm unavailable -> degrade gracefully: treat as a modest pass so the
      // battle can never deadlock. (Defensive; CONTRACT guarantees Rhythm.)
      _onDombraResult(70, need);
    }
  }

  function _onDombraResult(acc, need) {
    acc = _bClamp(acc | 0, 0, 100);
    st.lastAccuracy = acc;
    st.pendingRhythm = false;

    if (!st.canMelee) {
      /* RHYTHM-ONLY BOSS: resolved purely by clearing the rhythm at the needed
         accuracy. >= need  => the boss yields (win, countsAsKill already false).
         Below need => the player must try again (no melee phase exists). */
      if (acc >= need) {
        // return to our battle overlay to play the "release" beat, then win.
        _resumeBattleOverlay();
        st.hp = 0;
        _bossReleaseLog();
        _win();
      } else {
        _resumeBattleOverlay();
        st.phase = "menu";
        st.menuIdx = 0;
        _log("Мелодия не дошла до сердца. Сыграй снова. (" + acc + "%)", 2600);
      }
      return;
    }

    /* MELEEABLE FOE: a rhythm pass WEAKENS the enemy:
       - immediately removes a chunk of HP proportional to accuracy
       - sets a weaken multiplier (1 + acc/100) for the next few melee hits */
    _resumeBattleOverlay();
    var chunk = Math.round((st.hpMax * 0.18) * (acc / 100)); // up to ~18% on a max pass
    if (acc >= need) chunk += Math.round(st.hpMax * 0.10);   // bonus for >90%
    st.weakenMult = 1 + acc / 100;
    st.weakenStacks = acc >= need ? 4 : (acc >= 60 ? 3 : 2);
    _log("Домбра ослабила врага! Точность " + acc + "%", 2400);
    if (chunk > 0) {
      _enemyTakeDamage(chunk, "dombra");
    }
    if (st.hp > 0) {
      st.phase = "menu";
      st.menuIdx = 0;
    }
  }

  /* when the Rhythm overlay's onResult ran, the active scene is still the
     Rhythm overlay (it hasn't navigated). Re-install the battle overlay so the
     player sees the battle again. Guarded; Rhythm._finish then sees we moved. */
  function _resumeBattleOverlay() {
    if (typeof setScene === "function") {
      var cur = (typeof Scenes !== "undefined") ? Scenes.currentId : null;
      if (cur !== SCENE_ID) setScene(SCENE_ID);
    }
  }

  function _bossReleaseLog() {
    // a soft, lore-true line for each rhythm-only boss release.
    if (st.enemyKey === "jalmauyz") {
      _log("Жалмауыз рассыпается в пыль...", 2200);
    } else if (st.enemyKey === "donen") {
      _log("Дөнен медленно ложится на камень. Засыпает.", 2200);
    } else if (st.enemyKey === "shadow") {
      _log("Тень растворяется в тебе...", 2200);
    } else {
      _log("Сердце врага раскрылось.", 2000);
    }
  }

  /* a fallback dombra melody on the pentatonic if a battle didn't supply one
     (meleeable foes may omit rhythm). 8-beat phrase across the 4 lanes. */
  function _defaultMelody() {
    var base = [0, 2, 1, 3, 2, 0, 3, 1];
    var out = [];
    var t = 0;
    for (var i = 0; i < base.length; i++) {
      out.push({ lane: base[i], t: t });
      t += 460;
    }
    return out;
  }

  /* ---------- melee reticle ---------- */
  function _beginMelee() {
    if (!st.canMelee) {
      // sword passes through rhythm-only bosses
      _log("Удар проходит сквозь. Меч здесь бессилен.", 2200);
      _cue("sfx_cancel");
      st.shakeT = 120;
      return;
    }
    st.phase = "melee";
    st.reticleT = 0;
    st.reticleDir = 1;
  }

  function _resolveMelee() {
    // accuracy of the swing: center (0.5) = best
    var off = Math.abs(st.reticleT - 0.5) * 2; // 0 best .. 1 worst
    var quality = 1 - off;                     // 1 best
    var base = 4;                              // base melee = 4 HP (contract)
    var dmg = base * (0.5 + quality);          // 2..4 by timing
    if (st.weakenStacks > 0) {
      dmg *= st.weakenMult;
      st.weakenStacks--;
    }
    dmg = Math.max(1, Math.round(dmg));
    _log(quality > 0.8 ? "Точный удар!" : "Удар.", 1400);
    _enemyTakeDamage(dmg, "melee");
    if (st.hp > 0) {
      // enemy retaliates after the player's melee
      st.phase = "enemyTurn";
      st.enemyTurnT = 650;
    }
  }

  /* ---------- enemy turn ---------- */
  function _enemyAttack() {
    // damage scales gently with remaining enemy HP ratio so a near-dead enemy
    // is less dangerous; rhythm-only bosses also "attack" the player's resolve.
    var ratio = st.hp / st.hpMax;
    var dmg = Math.round(2 + ratio * 4);      // 2..6
    dmg = _bClamp(dmg, 1, st.playerHpMax);
    st.playerHp = _bClamp(st.playerHp - dmg, 0, st.playerHpMax);
    st.shakeT = 240;
    st.flashT = 200;
    _float("-" + dmg, _BW / 2, _BH - 150, _pal("feltRed", "#C0392B"));
    _cue(st.enemyKey === "jalmauyz" ? "sfx_curse" : "sfx_hit");
    if (st.playerHp <= 0) { _lose(); return; }
    st.phase = "menu";
    st.menuIdx = 0;
  }

  /* ---------- menu actions ---------- */
  function _useItem() {
    // heal a little using a notional remedy; always available, lightly limited
    var heal = Math.round(st.playerHpMax * 0.35);
    if (st.playerHp >= st.playerHpMax) {
      _log("Здоровье уже полно.", 1400);
      _cue("sfx_cancel");
      return;
    }
    st.playerHp = _bClamp(st.playerHp + heal, 0, st.playerHpMax);
    _float("+" + heal, _BW / 2, _BH - 150, _pal("grassLight", "#7CA646"));
    _cue("sfx_heal");
    _log("Ты перевёл дух. (+" + heal + ")", 1600);
    // using an item passes the turn to the enemy
    st.phase = "enemyTurn";
    st.enemyTurnT = 600;
  }

  function _selectMenu(i) {
    st.menuIdx = _bClamp(i, 0, ACTIONS.length - 1);
    _cue("sfx_confirm");
    if (st.menuIdx === 0) {            // Атака
      _beginMelee();
    } else if (st.menuIdx === 1) {     // Домбра
      _startDombra();
    } else {                          // Предмет
      _useItem();
    }
  }

  /* ===================== the battle overlay scene ===================== */
  var scene = {
    blockPause: false,   // allow pause during a battle (engine handles it)
    enter: function () {
      // (re)entering: if we're resuming from the Rhythm overlay, keep state.
      if (!st.active) return;
      if (st.music && typeof Audio !== "undefined" && Audio.playCue) {
        try { Audio.playCue(st.music); } catch (e) {}
      }
    },
    exit: function () {},

    update: function (dt) {
      if (!st.active) return;

      // timers
      if (st.shakeT > 0) st.shakeT = Math.max(0, st.shakeT - dt);
      if (st.flashT > 0) st.flashT = Math.max(0, st.flashT - dt);
      if (st.enemyHurtT > 0) st.enemyHurtT = Math.max(0, st.enemyHurtT - dt);
      if (st.logT > 0) st.logT = Math.max(0, st.logT - dt);
      st.enemyBob += dt * 0.004;

      for (var f = st.floats.length - 1; f >= 0; f--) {
        st.floats[f].life -= dt;
        st.floats[f].y -= dt * 0.04;
        if (st.floats[f].life <= 0) st.floats.splice(f, 1);
      }

      if (st.phase === "intro") {
        st.introT += dt;
        if (st.introT > 1100 || _pressed("confirm")) {
          st.phase = "menu";
          st.menuIdx = 0;
        }
        return;
      }

      if (st.phase === "menu") {
        // arrow navigation + confirm; number keys jump directly
        if (_pressed("up")) { st.menuIdx = (st.menuIdx + ACTIONS.length - 1) % ACTIONS.length; _cue("sfx_select"); }
        if (_pressed("down")) { st.menuIdx = (st.menuIdx + 1) % ACTIONS.length; _cue("sfx_select"); }
        if (_pressed("dombra")) { _startDombra(); return; }
        if (_pressed("confirm")) { _selectMenu(st.menuIdx); return; }
        if (_pressed("choice1")) { _selectMenu(0); return; }
        if (_pressed("choice2")) { _selectMenu(1); return; }
        if (_pressed("choice3")) { _selectMenu(2); return; }
        return;
      }

      if (st.phase === "melee") {
        // sweep the reticle back and forth; confirm locks the swing
        st.reticleT += st.reticleDir * dt * 0.0016;
        if (st.reticleT >= 1) { st.reticleT = 1; st.reticleDir = -1; }
        if (st.reticleT <= 0) { st.reticleT = 0; st.reticleDir = 1; }
        if (_pressed("confirm") || _pressed("choice1") || _pressed("dombra")) {
          _resolveMelee();
        }
        return;
      }

      if (st.phase === "enemyTurn") {
        st.enemyTurnT -= dt;
        if (st.enemyTurnT <= 0) { _enemyAttack(); }
        return;
      }

      if (st.phase === "result") {
        st.resultT -= dt;
        if (st.resultT <= 0 || _pressed("confirm")) {
          _finishBattle();
        }
        return;
      }
    },

    render: function (c) {
      if (!st.active) { c.fillStyle = "#000"; c.fillRect(0, 0, _BW, _BH); return; }

      // shake offset
      var sx = 0, sy = 0;
      if (st.shakeT > 0) {
        var mag = (st.shakeT / 240) * 6;
        sx = (Math.random() * 2 - 1) * mag;
        sy = (Math.random() * 2 - 1) * mag;
      }
      c.save();
      c.translate(sx, sy);

      // background — dark battle stage with a horizon band
      c.fillStyle = _pal("night", "#0E0F1A");
      c.fillRect(-8, -8, _BW + 16, _BH + 16);
      // ground band
      c.fillStyle = _pal("caveDark", "#171826");
      c.fillRect(-8, _BH - 220, _BW + 16, 220);
      c.strokeStyle = _pal("caveStone", "#33354A");
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, _BH - 220); c.lineTo(_BW, _BH - 220); c.stroke();

      // faint vignette focus on the enemy
      var grad = c.createRadialGradient(ENEMY.x, ENEMY.y + 20, 30, ENEMY.x, ENEMY.y + 20, 360);
      grad.addColorStop(0, "rgba(232,178,90,0.10)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = grad;
      c.fillRect(0, 0, _BW, _BH);

      // ---- enemy sprite ----
      var bob = Math.sin(st.enemyBob) * 6;
      var sc = ENEMY.scale;
      var ew = _enemyW() * sc, eh = _enemyH() * sc;
      var ex = ENEMY.x - ew / 2;
      var ey = ENEMY.y - eh / 2 + bob;
      // shadow under enemy
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.beginPath();
      c.ellipse(ENEMY.x, _BH - 232, ew * 0.42, 14, 0, 0, Math.PI * 2);
      c.fill();
      // hurt flash tint toward white/red on hit
      var eopts = {};
      if (st.enemyHurtT > 0) {
        eopts.tint = { toName: "feltRed", amt: (st.enemyHurtT / 260) * 0.6 };
        if ((Math.floor(st.enemyHurtT / 60) % 2) === 0) eopts.alpha = 0.85;
      }
      var drew = _spr(c, st.enemyKey, _bRint(ex), _bRint(ey), sc, eopts);
      if (!drew) {
        // graceful placeholder silhouette if the sprite is missing
        c.fillStyle = _pal("crackLight", "#7A3CE0");
        c.fillRect(_bRint(ex), _bRint(ey), ew, eh);
        c.strokeStyle = _pal("outline", "#1A0A00");
        c.strokeRect(_bRint(ex) + 0.5, _bRint(ey) + 0.5, ew - 1, eh - 1);
      }

      // ---- enemy HP bar + name ----
      var barW = 360, barH = 16;
      var barX = (_BW - barW) / 2, barY = 40;
      _bText(c, st.name, barX, barY - 8, { color: _pal("gold", "#D4A017"), size: 18, align: "left" });
      _hpBar(c, barX, barY, barW, barH, st.hp / st.hpMax);
      _bText(c, st.hp + " / " + st.hpMax, barX + barW, barY - 8,
        { color: _pal("boneGrey", "#B8B4A4"), size: 13, align: "right" });
      if (!st.canMelee) {
        _bText(c, "Меч бессилен — только домбра", barX, barY + barH + 16,
          { color: _pal("crackLight", "#7A3CE0"), size: 12, align: "left" });
      } else if (st.weakenStacks > 0) {
        _bText(c, "ОСЛАБЛЕН x" + st.weakenStacks + " (x" + st.weakenMult.toFixed(2) + ")", barX, barY + barH + 16,
          { color: _pal("gold", "#D4A017"), size: 12, align: "left" });
      }

      // ---- player HP bar (battle-local resource) ----
      var pbW = 220, pbH = 14;
      var pbX = 30, pbY = _BH - 60;
      _bText(c, "ЕРЖАН", pbX, pbY - 8, { color: _pal("yurtWhite", "#F5ECD7"), size: 14, align: "left" });
      _hpBar(c, pbX, pbY, pbW, pbH, st.playerHp / st.playerHpMax);
      _bText(c, st.playerHp + " / " + st.playerHpMax, pbX + pbW + 8, pbY + 11,
        { color: _pal("boneGrey", "#B8B4A4"), size: 12, align: "left" });

      // ---- floating numbers ----
      for (var fi = 0; fi < st.floats.length; fi++) {
        var fl = st.floats[fi];
        var fa = _bClamp(fl.life / fl.max, 0, 1);
        c.save(); c.globalAlpha = fa;
        _bText(c, fl.text, fl.x, fl.y, { color: fl.color, size: 20, align: "center" });
        c.restore();
      }

      // ---- battle log line ----
      if (st.logT > 0 && st.log) {
        _panel(c, _BW / 2 - 280, _BH - 122, 560, 30, _pal("caveDark", "#171826"), _pal("goldAccent", "#C8960C"));
        _bText(c, st.log, _BW / 2, _BH - 102, { color: _pal("yurtWhite", "#F5ECD7"), size: 14, align: "center" });
      }

      // ---- phase-specific UI ----
      if (st.phase === "intro") {
        c.fillStyle = "rgba(8,8,12,0.45)";
        c.fillRect(0, 0, _BW, _BH);
        _bText(c, st.name, _BW / 2, _BH / 2 - 6, { color: _pal("feltRed", "#C0392B"), size: 34, align: "center" });
        _bText(c, "— Z, чтобы начать —", _BW / 2, _BH / 2 + 30, { color: _pal("boneGrey", "#B8B4A4"), size: 14, align: "center" });
      }

      if (st.phase === "menu") {
        _renderMenu(c);
      }

      if (st.phase === "melee") {
        _renderMeleeBar(c);
      }

      if (st.phase === "result") {
        c.fillStyle = "rgba(8,8,12,0.6)";
        c.fillRect(0, 0, _BW, _BH);
        if (st.resultWin) {
          _bText(c, st.countsAsKill ? "ПОБЕДА" : "СЕРДЦЕ РАСКРЫТО", _BW / 2, _BH / 2 - 4,
            { color: _pal("gold", "#D4A017"), size: 36, align: "center" });
        } else {
          _bText(c, "ПОРАЖЕНИЕ", _BW / 2, _BH / 2 - 4,
            { color: _pal("feltRed", "#C0392B"), size: 36, align: "center" });
        }
        _bText(c, "— Z —", _BW / 2, _BH / 2 + 34, { color: _pal("boneGrey", "#B8B4A4"), size: 14, align: "center" });
      }

      c.restore();

      // hurt flash (drawn outside the shake transform, fullscreen)
      if (st.flashT > 0) {
        c.fillStyle = "rgba(192,57,43," + ((st.flashT / 200) * 0.35).toFixed(3) + ")";
        c.fillRect(0, 0, _BW, _BH);
      }
    },

    onKey: function (e) {
      if (!st.active || !e) return;
      // most input is polled in update() via Input.pressed for steady feel,
      // but we also accept onKey so a single tap never gets missed.
      var a = e.action;
      if (st.phase === "intro") {
        if (a === "confirm") { st.phase = "menu"; st.menuIdx = 0; }
        return;
      }
      if (st.phase === "result") {
        if (a === "confirm") { _finishBattle(); }
        return;
      }
      if (st.phase === "menu") {
        if (a === "up") { st.menuIdx = (st.menuIdx + ACTIONS.length - 1) % ACTIONS.length; _cue("sfx_select"); }
        else if (a === "down") { st.menuIdx = (st.menuIdx + 1) % ACTIONS.length; _cue("sfx_select"); }
        else if (a === "dombra") { _startDombra(); }
        else if (a === "confirm") { _selectMenu(st.menuIdx); }
        else if (a === "choice1") { _selectMenu(0); }
        else if (a === "choice2") { _selectMenu(1); }
        else if (a === "choice3") { _selectMenu(2); }
        return;
      }
      if (st.phase === "melee") {
        if (a === "confirm" || a === "choice1" || a === "dombra") { _resolveMelee(); }
        return;
      }
    },

    onClick: function (x, y) {
      if (!st.active) return;
      if (st.phase === "intro") { st.phase = "menu"; st.menuIdx = 0; return; }
      if (st.phase === "result") { _finishBattle(); return; }
      if (st.phase === "melee") { _resolveMelee(); return; }
      if (st.phase === "menu") {
        // hit-test the action rows
        var bx = _BW / 2 - 150, by = _BH - 96, bw = 300, rh = 26;
        for (var i = 0; i < ACTIONS.length; i++) {
          var ry = by + i * rh;
          if (x > bx && x < bx + bw && y > ry - 2 && y < ry + rh - 4) {
            _selectMenu(i);
            return;
          }
        }
      }
    }
  };

  function _renderMenu(c) {
    var bx = _BW / 2 - 150, by = _BH - 100, bw = 300, bh = 92;
    _panel(c, bx - 6, by - 8, bw + 12, bh + 12, _pal("caveDark", "#171826"), _pal("goldAccent", "#C8960C"));
    var rh = 26;
    for (var i = 0; i < ACTIONS.length; i++) {
      var ry = by + i * rh;
      var sel = (i === st.menuIdx);
      var label = ACTIONS[i];
      // grey out melee for rhythm-only bosses but keep it selectable (shows the
      // "sword passes through" line) so the lesson lands.
      var col = _pal("yurtWhite", "#F5ECD7");
      if (sel) {
        c.fillStyle = _pal("goldAccent", "#C8960C");
        c.fillRect(bx, ry - 2, bw, rh - 4);
        col = _pal("outline", "#1A0A00");
      } else if (i === 0 && !st.canMelee) {
        col = _pal("deadGreen", "#6E7059");
      }
      _bText(c, (sel ? "▶ " : "  ") + label, bx + 14, ry + 16,
        { color: col, size: 16, align: "left", shadow: !sel });
      // hotkey hint
      _bText(c, String(i + 1), bx + bw - 18, ry + 16,
        { color: sel ? _pal("outline", "#1A0A00") : _pal("boneGrey", "#B8B4A4"), size: 12, align: "left", shadow: !sel });
    }
  }

  function _renderMeleeBar(c) {
    // a timing bar: hit when the marker is centered
    var bw = 340, bh = 26;
    var bx = _BW / 2 - bw / 2, by = _BH - 96;
    _panel(c, bx - 6, by - 30, bw + 12, bh + 44, _pal("caveDark", "#171826"), _pal("goldAccent", "#C8960C"));
    _bText(c, "Z — удар в центр", _BW / 2, by - 12, { color: _pal("gold", "#D4A017"), size: 13, align: "center" });
    // track
    c.fillStyle = _pal("outline", "#1A0A00");
    c.fillRect(bx, by, bw, bh);
    // sweet-spot zone (center)
    var zoneW = bw * 0.18;
    c.fillStyle = _pal("grassDark", "#4E7A33");
    c.fillRect(bx + bw / 2 - zoneW / 2, by, zoneW, bh);
    c.fillStyle = _pal("grassLight", "#7CA646");
    c.fillRect(bx + bw / 2 - zoneW / 4, by, zoneW / 2, bh);
    // marker
    var mx = bx + st.reticleT * bw;
    c.fillStyle = _pal("feltRed", "#C0392B");
    c.fillRect(_bRint(mx) - 3, by - 4, 6, bh + 8);
    c.fillStyle = _pal("yurtWhite", "#F5ECD7");
    c.fillRect(_bRint(mx) - 1, by - 4, 2, bh + 8);
  }

  /* enemy sprite dimensions (so HP-bar/positioning fit). We can't read a
     sprite's w/h through the public API, so use sensible defaults per the
     authored 16x16 enemy convention, with bosses a touch larger. */
  function _enemyW() {
    if (st.enemyKey === "donen") return 24;
    if (st.enemyKey === "shadow") return 18;
    return 16;
  }
  function _enemyH() {
    if (st.enemyKey === "donen") return 20;
    if (st.enemyKey === "shadow") return 22;
    return 16;
  }

  /* register the battle overlay scene at top-level (registration only). */
  if (typeof Scenes !== "undefined" && Scenes.register) {
    Scenes.register(SCENE_ID, scene);
  }

  return {
    /* Battle.start(cfg) — see CONTRACT §9 for the full config shape. */
    start: function (cfg) {
      cfg = cfg || {};
      st.cfg = cfg;
      st.enemyKey = cfg.enemyKey || "ordo_soldier";
      st.name = cfg.name || "Враг";
      st.hpMax = Math.max(1, cfg.hp | 0 || 20);
      st.hp = st.hpMax;
      st.canMelee = (cfg.canMelee === false) ? false : true;
      // countsAsKill: default true for meleeable, false for rhythm-only bosses,
      // but always honor an explicit flag from the caller (chapters pass false
      // for Жалмауыз / Дөнен / Тень).
      if (typeof cfg.countsAsKill === "boolean") {
        st.countsAsKill = cfg.countsAsKill;
      } else {
        st.countsAsKill = st.canMelee; // meleeable -> counts; rhythm-only -> not
      }
      st.music = cfg.music || "theme_battle";
      st.rhythm = cfg.rhythm || null;
      st.onWin = (typeof cfg.onWin === "function") ? cfg.onWin : null;
      st.onLose = (typeof cfg.onLose === "function") ? cfg.onLose : null;

      st.playerHpMax = (cfg.playerHp | 0) || 20;
      st.playerHp = st.playerHpMax;

      st.phase = "intro";
      st.introT = 0;
      st.menuIdx = 0;
      st.weakenStacks = 0;
      st.weakenMult = 1;
      st.lastAccuracy = 0;
      st.reticleT = 0; st.reticleDir = 1;
      st.shakeT = 0; st.flashT = 0;
      st.floats = [];
      st.log = ""; st.logT = 0;
      st.enemyHurtT = 0; st.enemyBob = 0;
      st.enemyTurnT = 0;
      st.pendingRhythm = false;
      st.resultWin = false; st.resultT = 0;

      ENEMY.scale = _enemyScaleFor(st.enemyKey);

      st.active = true;

      // remember the caller scene to return to (unless we're somehow already it)
      var cur = (typeof Scenes !== "undefined") ? Scenes.currentId : null;
      if (cur !== SCENE_ID && cur !== "__rhythm__") st.prevId = cur;

      // overlay the battle scene; engine handles the fade. The scene's enter()
      // starts the battle music.
      if (typeof setScene === "function") setScene(SCENE_ID);
    },
    get active() { return st.active; },
    /* read-only HUD hook for 70-ui.js (CONTRACT §9): the in-battle player HP.
       Returns {hp,hpMax} ONLY while a battle is active, else null — so the HUD
       draws no global HP bar out of battle (death is narrative). The in-battle
       resource defaults to 20. Pure getter: no state mutation, no side effects. */
    hud: function () {
      if (!st.active) return null;
      return { hp: st.playerHp, hpMax: st.playerHpMax };
    },
    _sceneId: SCENE_ID,
    /* expose for hosts that drive battle from their own loop (optional) */
    update: function (dt) { scene.update(dt); },
    render: function (c) { scene.render(c); },
    onKey: function (e) { scene.onKey(e); }
  };
})();
