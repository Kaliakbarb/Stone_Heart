/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 40-dialogue.js  (DIALOGUE SYSTEM)
   Owns: Dialogue   (per CONTRACT.md §7)
   RAW JS — concatenated after 30-map.js inside the single <script>.

   Branching dialogue overlay: bottom box (PALETTE styling, gold
   goldAccent border), speaker tag + left portrait via Sprites.draw,
   typewriter reveal at G.settings.textSpeed (skippable with Z; Z again
   advances), verbatim word-wrap of Russian/Kazakh, choices via 1..4 or
   up/down + Z, set{} patch applied to G, goto / onEnd / nested branches,
   and a dombra moment (Audio cue + icon pulse, optional Rhythm beat).

   Dialogue does NOT own the loop. A hosting scene calls Dialogue.update,
   Dialogue.render and Dialogue.onKey while Dialogue.active is true, and
   stops processing world input meanwhile. Dialogue.start(tree,onComplete)
   OVERLAYS the current scene (it never calls setScene) and fires
   onComplete at the end of the tree.

   Every cross-module call is guarded so one missing sprite/audio/scene
   key can never throw inside the 60fps loop.
   ===================================================================== */

var Dialogue = (function () {

  /* ------------------------------------------------------------------ */
  /* internal running state                                             */
  /* ------------------------------------------------------------------ */
  var S = {
    active: false,
    tree: null,          // the node map currently running
    onComplete: null,    // tree-end callback
    nodeId: null,        // current node id string
    node: null,          // current node object

    // typewriter
    full: "",            // full visible text of current node (after note merge)
    shown: 0,            // chars revealed so far (float, advanced by dt)
    revealed: false,     // true once all chars are on screen
    charDelay: 30,       // ms/char snapshot from G.settings.textSpeed

    // choices
    choices: null,       // array of normalized choice objects or null
    cursor: 0,           // selected choice index

    // dombra visual pulse
    dombraPulse: 0,      // >0 while the dombra icon pulses (ms remaining)

    // layout cache (rebuilt per node)
    wrapped: null,       // array of wrapped lines for full text
    blink: 0,            // advance-prompt blink timer

    // guard so onEnd / onComplete never fire twice for the same finish
    ending: false,

    // when a dombra Rhythm beat is in flight we pause advancement
    waitingRhythm: false
  };

  /* layout constants (800x600 logical space) -------------------------- */
  var BOX = {
    marginX: 24,
    h: 156,                 // box height
    bottomGap: 18,          // gap from canvas bottom
    pad: 16,                // inner padding
    portrait: 96,           // portrait slot size (px square)
    portraitScale: 6,       // 16x16 sprite * 6 = 96
    lineH: 24,              // text line height
    textSize: 17,           // body text size
    nameSize: 17,           // speaker name size
    noteSize: 13            // stage-direction size
  };

  /* known numeric top-level G fields: a `set` key naming one of these
     is ADDED (+=). Anything else that is NOT a known assignable G field
     is written into G.flags[key]. */
  var NUMERIC_G = {
    chapter: true,
    dombraMelodyLearned: true,
    killCount: true,
    ayaulymTrust: true,
    gameTimeMs: true,
    saveSlot: true
  };
  /* known NON-numeric top-level G fields that should be ASSIGNED (=) when
     named directly in a `set` (rather than dropped into flags). */
  var ASSIGN_G = {
    ayaulymLeft: true,
    serikPath: true,
    sceneId: true
  };

  /* ------------------------------------------------------------------ */
  /* small guarded helpers                                              */
  /* ------------------------------------------------------------------ */
  function W() { return (typeof Engine !== "undefined" && Engine.W) ? Engine.W : 800; }
  function H() { return (typeof Engine !== "undefined" && Engine.H) ? Engine.H : 600; }

  function pal(name, fallback) {
    if (typeof PALETTE !== "undefined" && PALETTE && PALETTE[name]) return PALETTE[name];
    return fallback || "#ffffff";
  }

  function textSpeed() {
    var t = 30;
    try {
      if (G && G.settings && typeof G.settings.textSpeed === "number") t = G.settings.textSpeed;
    } catch (e) {}
    if (!(t >= 0)) t = 30;       // guard NaN / negative
    return t;
  }

  function playCue(name) {
    try {
      if (typeof Audio !== "undefined" && Audio && typeof Audio.playCue === "function") {
        Audio.playCue(name);
      }
    } catch (e) {}
  }

  function drawSprite(c, key, x, y, scale, opts) {
    try {
      if (typeof Sprites !== "undefined" && Sprites && typeof Sprites.draw === "function") {
        Sprites.draw(c, key, x, y, scale, opts || {});
        return true;
      }
    } catch (e) {}
    return false;
  }

  function spriteHas(key) {
    try {
      if (typeof Sprites !== "undefined" && Sprites && typeof Sprites.has === "function") {
        return !!Sprites.has(key);
      }
    } catch (e) {}
    return false;
  }

  function emit(evt, payload) {
    try {
      if (typeof EventBus !== "undefined" && EventBus && typeof EventBus.emit === "function") {
        EventBus.emit(evt, payload);
      }
    } catch (e) {}
  }

  function callFn(fn) {
    if (typeof fn === "function") {
      try { fn(); } catch (e) {}
    }
  }

  /* clamp util — prefer the engine's, fall back to a local impl */
  function cl(v, a, b) {
    if (typeof clamp === "function") return clamp(v, a, b);
    return v < a ? a : (v > b ? b : v);
  }

  /* ------------------------------------------------------------------ */
  /* G mutation — the `set` MERGE RULE (CONTRACT.md §7)                  */
  /* ------------------------------------------------------------------ */
  function applySet(set) {
    if (!set || typeof set !== "object") return;
    if (typeof G === "undefined" || !G) return;
    for (var key in set) {
      if (!Object.prototype.hasOwnProperty.call(set, key)) continue;
      var val = set[key];
      try {
        // explicit "flags.name" form -> always into G.flags
        if (key.indexOf("flags.") === 0) {
          var fk = key.slice(6);
          if (!G.flags || typeof G.flags !== "object") G.flags = {};
          G.flags[fk] = val;
          continue;
        }
        // numeric top-level field -> ADD
        if (NUMERIC_G[key] === true) {
          var cur = (typeof G[key] === "number") ? G[key] : 0;
          var add = (typeof val === "number") ? val : 0;
          G[key] = cur + add;
          continue;
        }
        // known assignable non-numeric field -> ASSIGN
        if (ASSIGN_G[key] === true) {
          G[key] = val;
          continue;
        }
        // anything else -> story flag in G.flags
        if (!G.flags || typeof G.flags !== "object") G.flags = {};
        G.flags[key] = val;
      } catch (e) { /* never let a bad key throw in-loop */ }
    }
  }

  /* ------------------------------------------------------------------ */
  /* node normalization (defensive against malformed trees)             */
  /* ------------------------------------------------------------------ */
  function normalizeChoices(node) {
    if (!node || !node.choices) return null;
    var raw = node.choices;
    if (!_isArray(raw) || raw.length === 0) return null;
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      if (!ch || typeof ch !== "object") continue;
      out.push({
        label: (typeof ch.label === "string") ? ch.label :
               (typeof ch.text === "string") ? ch.text : "...",
        goto: (typeof ch.goto === "string") ? ch.goto : null,
        set: (ch.set && typeof ch.set === "object") ? ch.set : null,
        dombra: ch.dombra === true,
        onEnd: (typeof ch.onEnd === "function") ? ch.onEnd : null,
        // optional: a choice may carry a serikPath lean shorthand
        _raw: ch
      });
      if (out.length >= 4) break;  // engine maps only choice1..choice4
    }
    return out.length ? out : null;
  }

  function _isArray(x) { return Object.prototype.toString.call(x) === "[object Array]"; }

  /* build the full visible body text of a node (text only; note drawn
     separately). Tolerates missing/non-string text. */
  function nodeText(node) {
    if (!node) return "";
    var t = node.text;
    if (typeof t !== "string") {
      if (t == null) return "";
      try { t = String(t); } catch (e) { t = ""; }
    }
    return t;
  }

  /* ------------------------------------------------------------------ */
  /* word-wrap (verbatim — never alters glyphs; splits on spaces and on  */
  /* explicit \n; long unbreakable tokens are hard-split by width)       */
  /* ------------------------------------------------------------------ */
  function wrapText(c, str, maxW, size) {
    var lines = [];
    if (typeof str !== "string" || str.length === 0) return [""];
    c.save();
    c.font = '700 ' + size + 'px "Courier New", monospace';
    var paras = str.split("\n");
    for (var p = 0; p < paras.length; p++) {
      var words = paras[p].split(" ");
      var line = "";
      for (var i = 0; i < words.length; i++) {
        var word = words[i];
        var test = line ? (line + " " + word) : word;
        if (c.measureText(test).width <= maxW || line === "") {
          // also guard a single word longer than the box: hard-split it
          if (line === "" && c.measureText(word).width > maxW) {
            var chunk = hardSplit(c, word, maxW);
            for (var k = 0; k < chunk.length - 1; k++) lines.push(chunk[k]);
            line = chunk[chunk.length - 1];
          } else {
            line = test;
          }
        } else {
          lines.push(line);
          if (c.measureText(word).width > maxW) {
            var chunk2 = hardSplit(c, word, maxW);
            for (var k2 = 0; k2 < chunk2.length - 1; k2++) lines.push(chunk2[k2]);
            line = chunk2[chunk2.length - 1];
          } else {
            line = word;
          }
        }
      }
      lines.push(line);
    }
    c.restore();
    return lines;
  }

  /* split a single over-long token char-by-char to fit maxW */
  function hardSplit(c, word, maxW) {
    var out = [];
    var cur = "";
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      if (c.measureText(cur + ch).width > maxW && cur !== "") {
        out.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  /* count of characters in the current wrapped layout (joining wrap lines
     with a single space so the reveal counter lines up with rendering) */
  function totalChars() {
    if (!S.wrapped) return 0;
    var n = 0;
    for (var i = 0; i < S.wrapped.length; i++) {
      n += S.wrapped[i].length;
      if (i < S.wrapped.length - 1) n += 1; // the join space/newline
    }
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* dombra moment                                                      */
  /* ------------------------------------------------------------------ */
  /* Minimal guaranteed behavior (CONTRACT.md §7): play the unfinished-kui
     cue and pulse the dombra icon. If a node/choice author wants a full
     interactive beat they handle it in onEnd; we additionally offer an
     optional Rhythm beat ONLY when the source object explicitly asks for
     one via `rhythm` config, resuming the tree in onResult. */
  function dombraMoment(source, afterFn) {
    playCue("kui_erzhan_unfinished");
    S.dombraPulse = 900; // ms of visible icon pulse

    var rcfg = (source && source.rhythm && typeof source.rhythm === "object")
      ? source.rhythm : null;

    if (rcfg && typeof Rhythm !== "undefined" && Rhythm && typeof Rhythm.start === "function") {
      // a real interactive beat was requested; pause tree advancement until done
      S.waitingRhythm = true;
      var melody = _isArray(rcfg.melody) ? rcfg.melody : [];
      var bpm = (typeof rcfg.bpm === "number") ? rcfg.bpm : 90;
      try {
        Rhythm.start({
          melody: melody,
          bpm: bpm,
          onResult: function (acc) {
            S.waitingRhythm = false;
            // let the author branch on the rhythm result if they provided a hook
            if (source && typeof source.onResult === "function") {
              try { source.onResult(acc); } catch (e) {}
            }
            if (typeof afterFn === "function") { try { afterFn(acc); } catch (e) {} }
          }
        });
        return; // afterFn fires from onResult
      } catch (e) {
        S.waitingRhythm = false; // Rhythm threw -> fall through to simple path
      }
    }
    // simple path: cue + pulse already done; continue immediately
    if (typeof afterFn === "function") { try { afterFn(null); } catch (e) {} }
  }

  /* ------------------------------------------------------------------ */
  /* node lifecycle                                                     */
  /* ------------------------------------------------------------------ */
  function gotoNode(id) {
    if (!S.active || !S.tree) return;
    if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(S.tree, id)) {
      // unknown target -> end the tree gracefully (never crash)
      finishTree();
      return;
    }
    var node = S.tree[id];
    if (!node || typeof node !== "object") { finishTree(); return; }

    S.nodeId = id;
    S.node = node;
    S.full = nodeText(node);
    S.shown = 0;
    S.revealed = false;
    S.charDelay = textSpeed();
    S.choices = normalizeChoices(node);
    S.cursor = 0;
    S.wrapped = null;          // rebuilt lazily in render with live ctx metrics
    S.blink = 0;

    // a node-level `set` (CONTRACT.md §7 worked example puts set{} on a
    // plain/terminal node) is applied on ENTRY via the merge rule. Choice-
    // level set{} is applied separately in selectChoice (chosen branch only).
    if (node.set && typeof node.set === "object") {
      applySet(node.set);
    }

    // a node-level dombra fires on ENTERING the node (icon pulse + cue);
    // it does not block reveal unless it requested a Rhythm beat.
    if (node.dombra === true) {
      dombraMoment(node, null);
    }

    // empty-text node with an auto-goto: reveal instantly so it advances
    if (S.full.length === 0) {
      S.revealed = true;
    }
  }

  /* called when the player confirms past a node that has no choices */
  function advanceFromNode() {
    var node = S.node;
    if (!node) { finishTree(); return; }

    // run this node's onEnd as it is left (fires once per traversal)
    // NOTE: per contract, onEnd fires when the node "finishes". For a
    // goto-node we fire it as we leave; for a terminal node finishTree
    // handles it. To avoid double-firing we only call here for goto nodes.
    if (typeof node.goto === "string") {
      callFn(node.onEnd);
      gotoNode(node.goto);
      return;
    }
    // terminal node (no choices, no goto) -> end the tree
    finishTree();
  }

  /* select a choice by index */
  function selectChoice(idx) {
    if (!S.choices) return;
    if (idx < 0 || idx >= S.choices.length) return;
    var ch = S.choices[idx];
    if (!ch) return;

    playCue("sfx_confirm");

    // apply state patch first so any dombra/goto sees the new flags
    if (ch.set) applySet(ch.set);

    var proceed = function () {
      // a choice may carry its own onEnd (fires for this choice)
      callFn(ch.onEnd);
      if (ch.goto) {
        gotoNode(ch.goto);
      } else {
        // choice with no goto -> ends the tree after this choice
        finishTree();
      }
    };

    if (ch.dombra === true) {
      dombraMoment(ch, function () { proceed(); });
    } else {
      proceed();
    }
  }

  /* move the choice cursor */
  function moveCursor(delta) {
    if (!S.choices || S.choices.length === 0) return;
    var n = S.choices.length;
    S.cursor = ((S.cursor + delta) % n + n) % n;
    playCue("sfx_select");
  }

  /* end the whole tree: run terminal node onEnd, then onComplete */
  function finishTree() {
    if (S.ending) return;
    S.ending = true;

    var node = S.node;
    var cb = S.onComplete;

    // terminal node onEnd (only if this node had neither choices nor goto;
    // goto/choice paths already fired their onEnd before reaching here)
    if (node && typeof node.onEnd === "function" &&
        !(typeof node.goto === "string") &&
        !S.choices) {
      callFn(node.onEnd);
    }

    closeNow();
    emit("dialogue:end", { });
    callFn(cb);
  }

  /* tear down running state (does NOT touch the hosting scene) */
  function closeNow() {
    S.active = false;
    S.tree = null;
    S.onComplete = null;
    S.nodeId = null;
    S.node = null;
    S.full = "";
    S.shown = 0;
    S.revealed = false;
    S.choices = null;
    S.cursor = 0;
    S.wrapped = null;
    S.dombraPulse = 0;
    S.waitingRhythm = false;
    // S.ending left true until the next start() resets it
  }

  /* ------------------------------------------------------------------ */
  /* INPUT (driven by the hosting scene's onKey while active)           */
  /* ------------------------------------------------------------------ */
  function onKey(e) {
    if (!S.active || !e) return;
    // while a Rhythm beat is in flight the Rhythm overlay owns input
    if (S.waitingRhythm) return;
    var a = e.action;
    if (!a) return;

    // a dedicated dombra key on a node/choice context: if the current
    // node offers a dombra interaction the player can also trigger it with
    // Space; otherwise Space is ignored by dialogue (world handles it).
    if (a === "dombra") {
      if (S.node && S.node.dombra === true) {
        // re-pulse / replay the cue for feedback (no state change)
        dombraMoment(S.node, null);
      }
      return;
    }

    // CHOICE node
    if (S.choices) {
      // text must be fully revealed before choices are interactive;
      // confirm during reveal completes the typewriter first.
      if (!S.revealed) {
        if (a === "confirm") {
          S.shown = totalChars();
          S.revealed = true;
          playCue("sfx_select");
        }
        return;
      }
      if (a === "up") { moveCursor(-1); return; }
      if (a === "down") { moveCursor(1); return; }
      if (a === "choice1") { selectChoice(0); return; }
      if (a === "choice2") { selectChoice(1); return; }
      if (a === "choice3") { selectChoice(2); return; }
      if (a === "choice4") { selectChoice(3); return; }
      if (a === "confirm") { selectChoice(S.cursor); return; }
      return;
    }

    // PLAIN node (no choices)
    if (a === "confirm") {
      if (!S.revealed) {
        // first Z completes the typewriter
        S.shown = totalChars();
        S.revealed = true;
        playCue("sfx_select");
      } else {
        // second Z advances / ends
        playCue("sfx_confirm");
        advanceFromNode();
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* UPDATE (driven by the hosting scene while active)                  */
  /* ------------------------------------------------------------------ */
  function update(dt) {
    if (!S.active) return;
    if (typeof dt !== "number" || !(dt >= 0)) dt = 16;

    // dombra icon pulse decay
    if (S.dombraPulse > 0) {
      S.dombraPulse -= dt;
      if (S.dombraPulse < 0) S.dombraPulse = 0;
    }

    // a Rhythm beat is on top; pause the typewriter while it runs
    if (S.waitingRhythm) return;

    // advance-prompt blink timer
    S.blink += dt;

    // typewriter reveal
    if (!S.revealed) {
      var per = S.charDelay;
      if (per <= 0) {
        // instant text
        S.shown = totalChars();
      } else {
        S.shown += dt / per;
      }
      var tot = totalChars();
      if (S.shown >= tot) {
        S.shown = tot;
        S.revealed = true;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* RENDER (driven by the hosting scene while active)                  */
  /* ------------------------------------------------------------------ */
  function render(c) {
    if (!S.active || !c) return;

    var w = W(), h = H();
    var bx = BOX.marginX;
    var bw = w - BOX.marginX * 2;
    var bh = BOX.h;
    var by = h - bh - BOX.bottomGap;

    // ----- panel background -----
    c.save();
    // soft drop shadow under the box
    c.fillStyle = "rgba(0,0,0,0.45)";
    c.fillRect(bx + 4, by + 6, bw, bh);
    // main felt panel
    c.fillStyle = pal("caveDark", "#171826");
    c.fillRect(bx, by, bw, bh);
    // subtle inner darken at the very bottom for depth
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(bx, by + bh - 10, bw, 10);

    // ----- gold goldAccent border (double-stroke for a framed look) -----
    c.lineWidth = 3;
    c.strokeStyle = pal("goldAccent", "#C8960C");
    c.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
    c.lineWidth = 1;
    c.strokeStyle = pal("gold", "#D4A017");
    c.strokeRect(bx + 5.5, by + 5.5, bw - 11, bh - 11);

    // ----- portrait slot (left) -----
    var portrait = (S.node && typeof S.node.portrait === "string") ? S.node.portrait : null;
    var pX = bx + BOX.pad;
    var pY = by + BOX.pad;
    var pSize = BOX.portrait;
    // portrait frame
    c.fillStyle = pal("night", "#0E0F1A");
    c.fillRect(pX, pY, pSize, pSize);
    c.lineWidth = 2;
    c.strokeStyle = pal("earth", "#7D4E2A");
    c.strokeRect(pX + 1, pY + 1, pSize - 2, pSize - 2);
    if (portrait && spriteHas(portrait)) {
      // Character sprites are 16x24 with anchor "bottom" (x-centered, feet at
      // the draw point). Place feet at the slot's bottom-center so the full
      // figure fits the 96px slot: 24h * scale 4 == 96 == pSize.
      drawSprite(c, portrait, pX + (pSize >> 1), pY + pSize, 4, { alpha: 1 });
    } else if (portrait) {
      // unknown sprite key: Sprites.draw would magenta-box; keep the slot
      // tidy by leaving it blank rather than a magenta block.
      // (intentionally draw nothing extra)
    }

    // ----- speaker name tag (above text column) -----
    var textX = pX + pSize + BOX.pad;
    var textTop = by + BOX.pad;
    var textW = bx + bw - BOX.pad - textX;
    if (textW < 40) textW = 40; // guard tiny widths

    var speaker = (S.node && typeof S.node.speaker === "string") ? S.node.speaker : "";
    var lineY = textTop + 4;
    if (speaker && speaker.length) {
      // name plate
      c.font = '700 ' + BOX.nameSize + 'px "Courier New", monospace';
      var nameW = c.measureText(speaker).width + 14;
      c.fillStyle = pal("feltRed", "#C0392B");
      c.fillRect(textX - 4, textTop - 2, nameW, BOX.nameSize + 8);
      drawTextSafe(c, speaker, textX + 3, textTop + BOX.nameSize, {
        color: pal("yurtWhite", "#F5ECD7"), size: BOX.nameSize, align: "left"
      });
      lineY = textTop + BOX.nameSize + 16;
    } else {
      lineY = textTop + 8 + BOX.textSize;
    }

    // ----- body text (wrapped + typewriter) -----
    // (re)build wrap layout against the live ctx metrics
    if (!S.wrapped) {
      S.wrapped = wrapText(c, S.full, textW, BOX.textSize);
      // re-clamp shown to the freshly-measured total
      var tot0 = totalChars();
      if (S.revealed) S.shown = tot0;
      else if (S.shown > tot0) S.shown = tot0;
    }

    var shownInt = Math.floor(S.shown);
    var used = 0;
    var ty = lineY;
    var reserveForChoices = S.choices ? (S.choices.length * 22 + 8) : 0;
    // keep body text from overrunning into the choice/prompt zone
    var bodyBottom = by + bh - BOX.pad - reserveForChoices - 4;

    for (var i = 0; i < S.wrapped.length; i++) {
      var lineStr = S.wrapped[i];
      var lineLen = lineStr.length;
      var visible;
      if (used + lineLen <= shownInt) {
        visible = lineStr;            // whole line shown
      } else if (used >= shownInt) {
        visible = "";                 // not reached yet
      } else {
        visible = lineStr.slice(0, shownInt - used); // partial
      }
      if (ty <= bodyBottom + BOX.lineH) {
        if (visible.length) {
          drawTextSafe(c, visible, textX, ty, {
            color: pal("yurtWhite", "#F5ECD7"), size: BOX.textSize, align: "left"
          });
        }
      }
      used += lineLen + 1; // +1 for the join (space/newline) between lines
      ty += BOX.lineH;
    }

    // ----- stage direction (note) — subtle grey italic, bottom-left of text col -----
    var note = (S.node && typeof S.node.note === "string") ? S.node.note : "";
    if (note && note.length && S.revealed && !S.choices) {
      c.save();
      c.font = 'italic 400 ' + BOX.noteSize + 'px "Courier New", monospace';
      c.textAlign = "left";
      c.fillStyle = pal("boneGrey", "#B8B4A4");
      c.globalAlpha = 0.85;
      var noteY = by + bh - BOX.pad - 2;
      c.fillText("[" + note + "]", textX, noteY);
      c.restore();
    }

    // ----- choices -----
    if (S.choices && S.revealed) {
      var chTop = by + bh - BOX.pad - (S.choices.length * 22) + 4;
      for (var ci = 0; ci < S.choices.length; ci++) {
        var cy = chTop + ci * 22;
        var sel = (ci === S.cursor);
        var label = (ci + 1) + ". " + S.choices[ci].label;
        var hasDombra = S.choices[ci].dombra === true;
        if (sel) {
          // highlight bar
          c.fillStyle = pal("goldAccent", "#C8960C");
          c.fillRect(textX - 6, cy - 15, textW + 4, 20);
        }
        drawTextSafe(c, label, textX, cy, {
          color: sel ? pal("outline", "#1A0A00") : pal("yurtWhite", "#F5ECD7"),
          size: 15, align: "left", shadow: !sel
        });
        // dombra marker on choices that play music
        if (hasDombra) {
          drawTextSafe(c, "♪", textX + textW - 14, cy, {
            color: sel ? pal("outline", "#1A0A00") : pal("gold", "#D4A017"),
            size: 15, align: "left", shadow: !sel
          });
        }
      }
    }

    // ----- advance prompt (blinking ▼) when a plain node is fully shown -----
    if (!S.choices && S.revealed) {
      var blinkOn = (Math.floor(S.blink / 480) % 2) === 0;
      if (blinkOn) {
        drawTextSafe(c, "▼", bx + bw - BOX.pad - 6, by + bh - BOX.pad - 2, {
          color: pal("gold", "#D4A017"), size: 16, align: "right"
        });
      }
    }

    // ----- dombra icon pulse (top-right of the box) -----
    if (S.dombraPulse > 0) {
      var t = S.dombraPulse / 900;           // 1 -> 0
      var a = cl(t, 0, 1);
      var iconX = bx + bw - 40;
      var iconY = by - 30;
      // pulse glow ring
      c.save();
      c.globalAlpha = 0.35 * a;
      c.fillStyle = pal("gold", "#D4A017");
      var r = 16 + (1 - a) * 10;
      c.beginPath();
      c.arc(iconX + 14, iconY + 14, r, 0, Math.PI * 2);
      c.fill();
      c.restore();
      // the dombra icon sprite if present, else a small drawn glyph
      if (spriteHas("dombra_icon")) {
        drawSprite(c, "dombra_icon", iconX, iconY, 2, { alpha: a });
      } else {
        drawTextSafe(c, "♪", iconX + 8, iconY + 22, {
          color: pal("gold", "#D4A017"), size: 22, align: "left"
        });
      }
    }

    c.restore();
  }

  /* drawText wrapper: prefer the engine helper, fall back to raw fillText */
  function drawTextSafe(c, str, x, y, opts) {
    opts = opts || {};
    if (typeof drawText === "function") {
      try { drawText(c, str, x, y, opts); return; } catch (e) {}
    }
    // fallback
    c.save();
    c.font = '700 ' + (opts.size || 16) + 'px "Courier New", monospace';
    c.textAlign = opts.align || "left";
    if (opts.shadow !== false) {
      c.fillStyle = opts.shadowColor || pal("outline", "#1A0A00");
      c.fillText(String(str), x + 2, y + 2);
    }
    c.fillStyle = opts.color || pal("yurtWhite", "#F5ECD7");
    c.fillText(String(str), x, y);
    c.restore();
  }

  /* ------------------------------------------------------------------ */
  /* PUBLIC API (CONTRACT.md §7)                                        */
  /* ------------------------------------------------------------------ */
  function start(tree, onComplete) {
    // defensive: a malformed tree must not crash; just no-op (and fire
    // onComplete so callers that chain setScene aren't stranded).
    if (!tree || typeof tree !== "object") {
      if (typeof onComplete === "function") { try { onComplete(); } catch (e) {} }
      return;
    }
    // reset running state for a fresh tree
    S.active = true;
    S.tree = tree;
    S.onComplete = (typeof onComplete === "function") ? onComplete : null;
    S.ending = false;
    S.waitingRhythm = false;
    S.dombraPulse = 0;

    emit("dialogue:start", {});

    // entry node is "start"; if absent, fall back to the first own key,
    // and if there are none, end immediately.
    var entry = null;
    if (Object.prototype.hasOwnProperty.call(tree, "start")) {
      entry = "start";
    } else {
      for (var k in tree) {
        if (Object.prototype.hasOwnProperty.call(tree, k)) { entry = k; break; }
      }
    }
    if (entry == null) { finishTree(); return; }
    gotoNode(entry);
  }

  return {
    /* begin running a tree from node "start" (overlays current scene) */
    start: start,

    /* boolean — true while a tree is running */
    get active() { return S.active; },

    /* explicit predicate form required by the brief */
    isOpen: function () { return S.active === true; },

    /* the hosting scene drives these three while Dialogue.active */
    update: update,
    render: render,
    onKey: onKey,

    /* convenience: programmatically advance (rarely needed; cutscenes etc.) */
    advance: function () {
      if (!S.active) return;
      if (S.choices) { selectChoice(S.cursor); }
      else if (!S.revealed) { S.shown = totalChars(); S.revealed = true; }
      else { advanceFromNode(); }
    },

    /* force-close without firing onComplete (e.g. scene teardown) */
    close: function () {
      if (!S.active) return;
      S.ending = true;
      closeNow();
    },

    /* expose the set-merge rule for any module that needs to apply a
       choice-style patch consistently (read-only helper; guarded) */
    applySet: applySet
  };

})();
