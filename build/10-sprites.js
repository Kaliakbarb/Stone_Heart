/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 10-sprites.js  (SPRITE RENDERER + ART)
   Owns: Sprites  (palette-driven pixel-art renderer + every sprite/tile def).
   RAW JS — concatenated after 00-engine.js inside the single <script>.
   Contract §8: ONE pixel data format; Sprites.define / Sprites.draw / Sprites.has.
   Reads PALETTE + lerpColor + clamp + rint from the engine (00-engine.js).
   Kazakh-steppe aesthetic: felt yurts, chapan robes, braided pastur, golden
   eagle, gold ornament accents. grey_* tiles are the desaturated decay twins.
   Caches every rendered (key+frame+scale+tint+flip+alpha) to an offscreen
   canvas; integer scaling; imageSmoothingEnabled=false; unknown key -> magenta
   box (never throws inside the 60fps loop).
   ===================================================================== */

var Sprites = (function () {

  /* ----- defensive access to engine globals (never throw if reordered) ----- */
  function PAL() {
    return (typeof PALETTE !== "undefined" && PALETTE) ? PALETTE : {};
  }
  function _clamp(v, a, b) {
    if (typeof clamp === "function") return clamp(v, a, b);
    return v < a ? a : (v > b ? b : v);
  }
  function _rint(n) {
    if (typeof rint === "function") return rint(n);
    return n | 0;
  }
  /* lerp two "#rrggbb" -> "#rrggbb"; fall back to engine lerpColor when present */
  function _lerpColor(hexA, hexB, t) {
    if (typeof lerpColor === "function") return lerpColor(hexA, hexB, t);
    return hexA; /* extremely defensive — engine always provides lerpColor */
  }

  /* resolve a palette NAME to a "#rrggbb" string, or null if not a real color.
     Per contract: a map char whose value is NOT a PALETTE name draws transparent. */
  function resolveColor(name) {
    var p = PAL();
    var hex = p[name];
    if (typeof hex === "string" && hex.charAt(0) === "#" && hex.length >= 7) return hex;
    return null;
  }

  /* ----- registry of sprite definitions ----- */
  var defs = {};

  /* ----- offscreen render cache: cacheKey -> HTMLCanvasElement ----- */
  var cache = {};

  function _makeCanvas(w, h) {
    var cv;
    if (typeof document !== "undefined" && document.createElement) {
      cv = document.createElement("canvas");
    } else {
      /* environment without document (shouldn't happen in browser game) */
      cv = { width: w, height: h, getContext: function () { return null; } };
    }
    cv.width = w;
    cv.height = h;
    return cv;
  }

  /* Build a unique cache key from all parameters that affect output pixels. */
  function _cacheKey(key, frame, scale, tintName, tintAmt, flip) {
    return key + "|" + frame + "|" + scale + "|" +
           (tintName || "_") + "|" + (tintAmt ? tintAmt.toFixed(3) : "0") + "|" +
           (flip ? "1" : "0");
  }

  /* Render one frame of `def` into an offscreen canvas at integer `scale`,
     optionally tinting every opaque pixel toward PALETTE[tintName] by tintAmt,
     and/or horizontally flipping. Alpha is applied at DRAW time (globalAlpha),
     NOT baked, so alpha changes don't bust the pixel cache. */
  function _renderFrame(def, frameIndex, scale, tintName, tintAmt, flip) {
    var w = def.w, h = def.h;
    var cv = _makeCanvas(w * scale, h * scale);
    var c = cv.getContext ? cv.getContext("2d") : null;
    if (!c) return cv;
    c.imageSmoothingEnabled = false;

    var rows = def.frames[frameIndex] || def.frames[0] || [];
    var doTint = (typeof tintName === "string") && tintAmt > 0;
    var tintHex = doTint ? resolveColor(tintName) : null;
    if (!tintHex) doTint = false;

    for (var y = 0; y < h; y++) {
      var row = rows[y];
      if (typeof row !== "string") continue;
      for (var x = 0; x < w; x++) {
        if (x >= row.length) break;           /* tolerate short rows (clip) */
        var ch = row.charAt(x);
        if (ch === "." || ch === " ") continue; /* transparent */
        var base = def.map ? def.map[ch] : undefined;
        if (base === undefined) continue;       /* unknown char -> transparent */
        var hex = resolveColor(base);
        if (!hex) continue;                     /* non-palette value -> transparent */
        if (doTint) hex = _lerpColor(hex, tintHex, tintAmt);
        var dx = flip ? (w - 1 - x) : x;
        c.fillStyle = hex;
        c.fillRect(dx * scale, y * scale, scale, scale);
      }
    }
    return cv;
  }

  function _getCached(key, def, frameIndex, scale, tintName, tintAmt, flip) {
    var ck = _cacheKey(key, frameIndex, scale, tintName, tintAmt, flip);
    var cv = cache[ck];
    if (cv) return cv;
    cv = _renderFrame(def, frameIndex, scale, tintName, tintAmt, flip);
    cache[ck] = cv;
    return cv;
  }

  /* anchor offset: returns [ox, oy] in DESTINATION (already-scaled) pixels to
     subtract from the draw position so (x,y) means top-left/center/bottom. */
  function _anchorOffset(def, scale) {
    var a = def.anchor || "top";
    var w = def.w * scale, h = def.h * scale;
    if (a === "center") return [w >> 1, h >> 1];
    if (a === "bottom") return [w >> 1, h];   /* x centered, y at feet */
    return [0, 0];                            /* "top" => top-left */
  }

  /* draw a magenta "missing art" box (visible, never throws) */
  function _drawMissing(c, x, y, scale) {
    if (!c) return;
    var s = (scale && scale > 0) ? _rint(scale) : 1;
    var w = 16 * s, h = 16 * s;
    c.save();
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#FF00FF";
    c.fillRect(_rint(x), _rint(y), w, h);
    c.fillStyle = "#000000";
    c.fillRect(_rint(x) + s, _rint(y) + s, w - 2 * s, h - 2 * s);
    c.fillStyle = "#FF00FF";
    c.fillRect(_rint(x) + 3 * s, _rint(y) + 3 * s, w - 6 * s, h - 6 * s);
    c.restore();
  }

  /* pad/clip a single row string to exactly `w` chars (pad with "."). */
  function _fitRow(row, w) {
    var s = (typeof row === "string") ? row : "";
    if (s.length === w) return s;
    if (s.length > w) return s.slice(0, w);
    /* pad right with transparent */
    var pad = "";
    for (var i = s.length; i < w; i++) pad += ".";
    return s + pad;
  }

  /* normalize an array of raw frames to exactly h rows of w chars each. */
  function _normalizeFrames(raw, w, h) {
    var out = [];
    for (var f = 0; f < raw.length; f++) {
      var src = Array.isArray(raw[f]) ? raw[f] : [];
      var rows = [];
      for (var y = 0; y < h; y++) {
        rows.push(_fitRow(src[y], w));   /* missing rows -> all transparent */
      }
      out.push(rows);
    }
    if (!out.length) {
      var empty = [];
      for (var y2 = 0; y2 < h; y2++) empty.push(_fitRow("", w));
      out.push(empty);
    }
    return out;
  }

  /* ===================== PUBLIC API (contract §8) ===================== */
  var api = {

    /* register / replace a sprite definition by string key (top-level safe) */
    define: function (key, data) {
      if (typeof key !== "string" || !data) return;
      /* normalize: ensure frames is an array of frames (array of row-strings) */
      var d = {
        w: (data.w | 0) || 1,
        h: (data.h | 0) || 1,
        frames: [],
        map: data.map || {},
        anchor: data.anchor || "top"
      };
      var fr = data.frames;
      var raw = [];
      if (Array.isArray(fr) && fr.length) {
        /* a frame is an array of strings; guard against a single bare frame */
        if (typeof fr[0] === "string") {
          raw = [fr];                          /* one frame given as flat string[] */
        } else {
          for (var i = 0; i < fr.length; i++) {
            raw.push(Array.isArray(fr[i]) ? fr[i] : []);
          }
        }
      }
      if (!raw.length) raw = [[]];

      /* Normalize every frame to EXACTLY h rows of EXACTLY w chars: short rows
         are right-padded with "." (transparent), long rows are clipped, missing
         rows are filled transparent. Guarantees pixel-exact, drift-proof output
         (the renderer then never has to special-case ragged art). */
      d.frames = _normalizeFrames(raw, d.w, d.h);
      defs[key] = d;
      return d;
    },

    has: function (key) { return !!defs[key]; },

    /* frame count for a key (handy for animators); 0 if unknown */
    frameCount: function (key) {
      var d = defs[key];
      return d ? d.frames.length : 0;
    },

    /* pixel size [w,h] of a key's frame in source pixels; [0,0] if unknown */
    size: function (key) {
      var d = defs[key];
      return d ? [d.w, d.h] : [0, 0];
    },

    /* Sprites.draw(ctx, key, x, y, scale, opts)
       opts: { frame:int=0, flip:bool=false, alpha:0..1=1, tint:{toName,amt:0..1} }
       Integer pixel position, integer scale. Unknown key -> magenta box. */
    draw: function (c, key, x, y, scale, opts) {
      if (!c) return;
      opts = opts || {};
      var s = (scale && scale > 0) ? _rint(scale) : 1;

      var def = defs[key];
      if (!def) { _drawMissing(c, x, y, s); return; }

      var frame = opts.frame | 0;
      var fcount = def.frames.length;
      if (fcount > 0) {
        frame = ((frame % fcount) + fcount) % fcount; /* wrap negatives too */
      } else { frame = 0; }

      var flip = !!opts.flip;
      var alpha = (opts.alpha == null) ? 1 : _clamp(opts.alpha, 0, 1);

      var tintName = null, tintAmt = 0;
      if (opts.tint && typeof opts.tint.toName === "string") {
        tintAmt = _clamp(opts.tint.amt == null ? 0 : opts.tint.amt, 0, 1);
        if (tintAmt > 0) tintName = opts.tint.toName;
      }

      var cv = _getCached(key, def, frame, s, tintName, tintAmt, flip);
      if (!cv) { _drawMissing(c, x, y, s); return; }

      var off = _anchorOffset(def, s);
      var dx = _rint(x) - off[0];
      var dy = _rint(y) - off[1];

      c.save();
      c.imageSmoothingEnabled = false;
      if (alpha < 1) c.globalAlpha = alpha;
      try { c.drawImage(cv, dx, dy); } catch (e) { /* never break the loop */ }
      c.restore();
    },

    /* clear the render cache (e.g. on a hypothetical palette swap) */
    clearCache: function () { cache = {}; }
  };

  return api;
})();


/* =====================================================================
   SPRITE & TILE DEFINITIONS
   Pixel maps reference PALETTE names only (contract §3/§8). "." = transparent.
   Characters are authored ~16x24 (anchor "bottom" => x-centered, feet at y).
   Tiles are 16x16 (anchor "top"). grey_* tiles are the desaturated twins.
   Each char key in a frame's `map` resolves to a PALETTE color name.
   ===================================================================== */
(function () {
  if (typeof Sprites === "undefined" || !Sprites.define) return;
  var D = Sprites.define;

  /* ------------------------------------------------------------------ */
  /* CHARACTERS  (16w x 24h, anchor bottom)                              */
  /* Shared legend intent across human sprites:                          */
  /*   . transparent   o outline   s skin   h hair(dark)                 */
  /*   c chapan body    t trim/ornament(gold)   b boot/earth             */
  /*   e eye   w white/cloth   r red felt   k braid/cloth dark           */
  /* ------------------------------------------------------------------ */

  /* ERZHAN — idle. Tall, thin, dark hair in one braid behind, grey chapan,
     thin leather wristband. Two idle frames = subtle breathing (shoulders). */
  D("erzhan", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "boneGrey", h: "outline", c: "greySteppe",
      t: "gold", b: "earth", e: "outline", k: "earth", g: "goldAccent"
    },
    frames: [
      [ /* frame 0 — at rest */
        "................",
        ".....oooo.......",
        "....ohhhho......",
        "....ohhhho......",
        "....oshsho......",
        "....oseseo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...occcccco.....",
        "..occctccco.....",
        "..oscctccso.....",
        "..oscctccso.....",
        "..occctccco.....",
        "...occtcco......",
        "...occtcco......",
        "...occccco......",
        "...occccco......",
        "... occcc o.....",
        "...occ.cco......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ],
      [ /* frame 1 — breathe in: shoulders lift one px */
        "................",
        ".....oooo.......",
        "....ohhhho......",
        "....ohhhho......",
        "....oshsho......",
        "....oseseo......",
        "....osssso.......",
        "....occcco......",
        "...occccco......",
        "..occctccco.....",
        "..oscctccso.....",
        "..oscctccso.....",
        "..occctccco.....",
        "..occctccco.....",
        "...occtcco......",
        "...occtcco......",
        "...occccco......",
        "...occccco......",
        "...occccco......",
        "...occ.cco......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ]
    ]
  });

  /* ERZHAN_WALK — 4-frame walk cycle (legs alternate, braid sways). */
  D("erzhan_walk", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "boneGrey", h: "outline", c: "greySteppe",
      t: "gold", b: "earth", e: "outline"
    },
    frames: [
      [ /* step 0 — left foot fwd */
        "................",
        ".....oooo.......",
        "....ohhhho......",
        "....ohhhho......",
        "....oshsho......",
        "....oseseo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...occcccco.....",
        "..occctccco.....",
        "..oscctccso.....",
        "..oscctccso.....",
        "..occctccco.....",
        "...occtcco......",
        "...occtcco......",
        "...occccco......",
        "...occccco......",
        "..occ.ccco......",
        "..obb..cco......",
        "..obbo.bbo......",
        ".obbo..obbo.....",
        ".obbo...obbo....",
        ".ooo....ooo....."
      ],
      [ /* step 1 — passing */
        "................",
        ".....oooo.......",
        "....ohhhho......",
        "....ohhhho......",
        "....oshsho......",
        "....oseseo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...occcccco.....",
        "..occctccco.....",
        "..oscctccso.....",
        "..oscctccso.....",
        "..occctccco.....",
        "...occtcco......",
        "...occtcco......",
        "...occccco......",
        "...occccco......",
        "...occccco......",
        "...occ.cco......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ],
      [ /* step 2 — right foot fwd (mirror of 0) */
        "................",
        ".....oooo.......",
        "....ohhhho......",
        "....ohhhho......",
        "....oshsho......",
        "....oseseo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...occcccco.....",
        "..occctccco.....",
        "..oscctccso.....",
        "..oscctccso.....",
        "..occctccco.....",
        "...occtcco......",
        "...occtcco......",
        "...occccco......",
        "...occccco......",
        "...occc.cco.....",
        "...occ..bbo.....",
        "...obb.obbo.....",
        "..obbo..obbo....",
        ".obbo....obbo...",
        ".ooo......ooo..."
      ],
      [ /* step 3 — passing (same as 1) */
        "................",
        ".....oooo.......",
        "....ohhhho......",
        "....ohhhho......",
        "....oshsho......",
        "....oseseo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...occcccco.....",
        "..occctccco.....",
        "..oscctccso.....",
        "..oscctccso.....",
        "..occctccco.....",
        "...occtcco......",
        "...occtcco......",
        "...occccco......",
        "...occccco......",
        "...occccco......",
        "...occ.cco......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ]
    ]
  });

  /* АЯУЛЫМ — berkutchi. Braided hair, leather glove (raised arm where the
     eagle perches), fox-fur hat (red), determined eyes. Two idle frames. */
  D("ayaulym", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "bone", h: "outline", r: "feltRed", c: "earth",
      t: "gold", b: "outline", e: "outline", g: "goldAccent", l: "boneGrey"
    },
    frames: [
      [
        "................",
        "....orrrro......",
        "...orrrrrro.....",
        "...orhhhhro.....",
        "...oshhhhso.....",
        "...oseseso......",
        "...osssso.......",
        "....osso........",
        "...occcco.......",
        "..occctcco......",
        ".loccctccol.....",
        ".loscctccol.....",
        "..oscctccso.....",
        "..occctccco.....",
        "...occtcco......",
        "...occtcco......",
        "...occccco......",
        "...occccco......",
        "...occccco......",
        "...occ.cco......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ],
      [
        "................",
        "....orrrro......",
        "...orrrrrro.....",
        "...orhhhhro.....",
        "...oshhhhso.....",
        "...oseseso......",
        "...osssso.......",
        "....osso........",
        "...occcco.......",
        "..occctcco......",
        ".loccctccol.....",
        ".loscctccol.....",
        "..oscctccso.....",
        "..occctccco.....",
        "...occtcco......",
        "...occtcco......",
        "...occccco......",
        "...occccco......",
        "...occccco......",
        "..occc.ccc o....",
        "..obb..cbbo.....",
        "..obbo.bbo......",
        "..obbo.obbo.....",
        "..ooo...ooo....."
      ]
    ]
  });

  /* НҰРЛАН — old shaman (alive). White hair/beard, hunched, owl-feather robe,
     trembling hands (hint via slight hand shift between frames), white eyes. */
  D("nurlan", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "boneGrey", w: "bone", c: "earth", t: "gold",
      b: "outline", e: "yurtWhite", f: "boneGrey", d: "feltRed"
    },
    frames: [
      [
        "................",
        "....owwww.......",
        "...owwwwwo......",
        "...owssswo......",
        "...oseseso......",
        "...oswwwso......",
        "...owwwwwo......",
        "...owwwwwo......",
        "...owwwwwo......",
        "..occdcco.......",
        ".focctccof......",
        ".focctccof......",
        "..occtccco......",
        "..occtccco......",
        "...octcco.......",
        "...occcco.......",
        "...occcco.......",
        "...occcco.......",
        "...occcco.......",
        "...occcco.......",
        "...obbbbo.......",
        "...obbbbo.......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ],
      [
        "................",
        "....owwww.......",
        "...owwwwwo......",
        "...owssswo......",
        "...oseseso......",
        "...oswwwso......",
        "...owwwwwo......",
        "...owwwwwo......",
        "...owwwwwo......",
        "..occdcco.......",
        "fo.cctcco.f.....",
        "fo.cctcco.f.....",
        "..occtccco......",
        "..occtccco......",
        "...octcco.......",
        "...occcco.......",
        "...occcco.......",
        "...occcco.......",
        "...occcco.......",
        "...occcco.......",
        "...obbbbo.......",
        "...obbbbo.......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ]
    ]
  });

  /* НҰРЛАН — ghost (translucent, shimmering). Same silhouette, cool pale-blue
     palette; shimmer = 3 frames cycling a faint highlight. Drawn with low alpha
     by callers; the palette itself reads as a spirit. */
  D("nurlan_ghost", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "skyHigh", w: "skyWhite", s: "skyHigh", c: "waterLight",
      t: "skyWhite", e: "yurtWhite", h: "waterLight"
    },
    frames: [
      [
        "................",
        "....owwww.......",
        "...owwwwwo......",
        "...owsssho......",
        "...oseseho......",
        "...oswwwso......",
        "...owwwwwo......",
        "...owwwwwo......",
        "..occccco.......",
        "..occtcco.......",
        "..occtcco.......",
        "..occtccco......",
        "..occtccco......",
        "...octcco.......",
        "...occcco.......",
        "...occcco.......",
        "...occcco.......",
        "...occcco.......",
        "....cccc........",
        "....cc.cc.......",
        ".....c..c.......",
        "................",
        "................",
        "................"
      ],
      [
        "................",
        "....owwww.......",
        "...owwwwwo......",
        "...ohsssho......",
        "...oseseho......",
        "...oswwwso......",
        "...owwwwwo......",
        "...owwwwwo......",
        "..occtcco.......",
        "..ohcctho.......",
        "..occtcco.......",
        "..occtccho......",
        "..occtccco......",
        "...octcco.......",
        "...occcho.......",
        "...occcco.......",
        "...occcco.......",
        "...ohccco.......",
        "....cccc........",
        "....c.cc........",
        ".....c.c........",
        "................",
        "................",
        "................"
      ],
      [
        "................",
        "....owwww.......",
        "...owwwwwo......",
        "...owsssho......",
        "...oseseho......",
        "...oswwwso......",
        "...owwwwho......",
        "...owwwwwo......",
        "..ohcccco.......",
        "..occtcco.......",
        "..occtccho......",
        "..occtccco......",
        "..ohctccco......",
        "...octcco.......",
        "...occcco.......",
        "...ohccco.......",
        "...occcco.......",
        "...occcco.......",
        ".... cccc.......",
        "....cc.c........",
        ".....c..c.......",
        "................",
        "................",
        "................"
      ]
    ]
  });

  /* СЕРІК — the Dark Khan (just a tired old man). Worn dark chapan, grey beard,
     sits low; here drawn standing/seated-tall. Quiet, no ornament gold except a
     dull clasp. Two near-still frames (very slow breath). */
  D("serik", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "boneGrey", w: "ashGrey", c: "caveStone",
      t: "goldAccent", b: "outline", e: "outline", d: "bloodDark"
    },
    frames: [
      [
        "................",
        "....owwwo.......",
        "...owwwwwo......",
        "...owsssho......",
        "...oseseso......",
        "...osswso.......",
        "...owswwo.......",
        "...owwwwo.......",
        "..occccco.......",
        "..occtcco.......",
        ".docctccod......",
        ".docctccod......",
        "..occtccco......",
        "..occtccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occ..cco......",
        "..obb..bbo......",
        "..obb..bbo......",
        "..obb..bbo......",
        "..ooo..ooo......"
      ],
      [
        "................",
        "....owwwo.......",
        "...owwwwwo......",
        "...owsssho......",
        "...oseseso......",
        "...osswso.......",
        "...owswwo.......",
        "...owwwwo.......",
        "..occccco.......",
        "..occtcco.......",
        ".docctccod......",
        ".docctccod......",
        "..occtccco......",
        "..occtccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occ..cco......",
        "..obb..bbo......",
        "..obb..bbo......",
        "..obb..bbo......",
        "..ooo..ooo......"
      ]
    ]
  });

  /* ҚАЙРАТ — father's ghost (Lower world). Translucent like nurlan_ghost but
     warmer cave-fire spirit tone; identical leather wristband motif (gold).
     3 shimmer frames. Drawn with low alpha by callers. */
  D("qairat_ghost", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "caveFire", s: "bone", h: "earth", c: "deadGreen",
      t: "gold", e: "yurtWhite", g: "gold", f: "caveFire"
    },
    frames: [
      [
        "................",
        ".....hhhh.......",
        "....ohhhho......",
        "....oshsho......",
        "....oseseo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...occccco......",
        "..gocctccog.....",
        "..gocctccog.....",
        "..occctccco.....",
        "..occctccco.....",
        "...occtcco......",
        "...occtcco......",
        "...occccco......",
        "...occccco......",
        "...occccco......",
        "....cccc........",
        "....cc.cc.......",
        ".....c..c.......",
        "................",
        "................",
        "................"
      ],
      [
        "................",
        ".....hhhh.......",
        "....ohhhho......",
        "....oshsho......",
        "....oseseo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...offcffo......",
        "..gocctccog.....",
        "..goccfccog.....",
        "..occctccco.....",
        "..offctcffo.....",
        "...occtcco......",
        "...offtffo......",
        "...occccco......",
        "...offcffo......",
        "...occccco......",
        "....cfcf........",
        "....cc.cc.......",
        ".....c..c.......",
        "................",
        "................",
        "................"
      ],
      [
        "................",
        ".....hhhh.......",
        "....ohhhho......",
        "....oshsho......",
        "....oseseo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...occccco......",
        "..gofftffog.....",
        "..gocctccog.....",
        "..offctcffo.....",
        "..occctccco.....",
        "...occtcco......",
        "...occtcco......",
        "...offcffo......",
        "...occccco......",
        "...occccco......",
        "....fccf........",
        "....cc.cc.......",
        ".....c..c.......",
        "................",
        "................",
        "................"
      ]
    ]
  });

  /* GÜLNAR — Erzhan's mother. Headscarf (white), warm red dress, gentle.
     (Contract key: `mother`.) Two idle frames. */
  D("mother", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "bone", w: "yurtWhite", r: "feltRed", c: "feltRed",
      t: "gold", b: "outline", e: "outline", k: "earth"
    },
    frames: [
      [
        "................",
        "....owwwwo......",
        "...owwwwwwo.....",
        "...owsssswo.....",
        "...owseseo......",
        "...owsssso......",
        "...owssswo......",
        "....owwwo.......",
        "....occco.......",
        "...occtcco......",
        "..occctcco......",
        "..occctcco......",
        "..occctcco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occtccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..obbbbbbo......",
        "..oooooooo......"
      ],
      [
        "................",
        "....owwwwo......",
        "...owwwwwwo.....",
        "...owsssswo.....",
        "...oseseswo.....",
        "...owsssso......",
        "...owssswo......",
        "....owwwo.......",
        "....occco.......",
        "...occtcco......",
        "..occctcco......",
        "..occctcco......",
        "..occctcco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occtccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..occcccco......",
        "..obbbbbbo......",
        "..oooooooo......"
      ]
    ]
  });

  /* БЕЙСЕН — village aksakal. Tall white kalpak-ish hat, long white beard,
     warm chapan, holds nothing (the old map is a scene prop). Two idle frames. */
  D("beysen", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "boneGrey", w: "yurtWhite", c: "earth", t: "gold",
      b: "outline", e: "outline", r: "feltRed", f: "yurtWhite"
    },
    frames: [
      [
        ".....oo.........",
        "....owwo........",
        "....owwo........",
        "...owwwwo.......",
        "...owwwwo.......",
        "...oseseo.......",
        "...osssso.......",
        "...offffo.......",
        "...offffo.......",
        "..occrcco.......",
        "..occtcco.......",
        "..occtcco.......",
        "..occtcco.......",
        "..occtcco.......",
        "..occtcco.......",
        "..occcco........",
        "..occcco........",
        "..occcco........",
        "..occcco........",
        "..occcco........",
        "..obbbbo........",
        "..obb.bbo.......",
        "..obb.bbo.......",
        "..ooo.ooo......."
      ],
      [
        ".....oo.........",
        "....owwo........",
        "....owwo........",
        "...owwwwo.......",
        "...owwwwo.......",
        "...oeseso.......",
        "...osssso.......",
        "...offffo.......",
        "...offffo.......",
        "..occrcco.......",
        "..occtcco.......",
        "..occtcco.......",
        "..occtcco.......",
        "..occtcco.......",
        "..occtcco.......",
        "..occcco........",
        "..occcco........",
        "..occcco........",
        "..occcco........",
        "..occcco........",
        "..obbbbo........",
        "..obb.bbo.......",
        "..obb.bbo.......",
        "..ooo.ooo......."
      ]
    ]
  });

  /* ДОСАН — bek of the Elder Juz. Large, broad, stone-rich aul; heavy dark-red
     chapan, gold belt, square jaw, fur collar. Imposing stance. */
  D("dosan", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "boneGrey", h: "outline", c: "feltRed", t: "gold",
      b: "outline", e: "outline", f: "earth", g: "goldAccent"
    },
    frames: [
      [
        "................",
        "...ohhhhho......",
        "..ohhhhhhho.....",
        "..ohhhhhhho.....",
        "..oshsshso......",
        "..oseseseo......",
        "..ossssso.......",
        "..offffffo......",
        ".occccccco......",
        ".occctcco o.....",
        ".occctccco......",
        ".occctccco......",
        ".occgtgcco......",
        ".occggggco......",
        ".occctccco......",
        ".occctccco......",
        ".occcccco.......",
        ".occcccco.......",
        ".occcccco.......",
        ".occc.ccco......",
        ".obbb.bbbo......",
        ".obbb.bbbo......",
        ".obbb.bbbo......",
        ".oooo.oooo......"
      ],
      [
        "................",
        "...ohhhhho......",
        "..ohhhhhhho.....",
        "..ohhhhhhho.....",
        "..oshsshso......",
        "..oeseseso......",
        "..ossssso.......",
        "..offffffo......",
        ".occccccco......",
        ".occctccco......",
        ".occctccco......",
        ".occctccco......",
        ".occgtgcco......",
        ".occggggco......",
        ".occctccco......",
        ".occctccco......",
        ".occcccco.......",
        ".occcccco.......",
        ".occcccco.......",
        ".occc.ccco......",
        ".obbb.bbbo......",
        ".obbb.bbbo......",
        ".obbb.bbbo......",
        ".oooo.oooo......"
      ]
    ]
  });

  /* МАРАТ — bek of the Middle Juz (merchant). Sly smile, lighter trade-robe
     (gold/blue), beaded trim, open palms. Friendly, never straight. */
  D("marat", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "bone", h: "earth", c: "skyBlue", t: "gold",
      b: "outline", e: "outline", g: "goldAccent", w: "yurtWhite"
    },
    frames: [
      [
        "................",
        "....ohhho.......",
        "...ohhhhho......",
        "...ohsssho......",
        "...oseseo.......",
        "...ossswo.......",
        "...osssso.......",
        "....owwo........",
        "...ogccgo.......",
        "..ogcctcgo......",
        "..occctcco......",
        "..occctcco......",
        "..occgtgco......",
        "..occctcco......",
        "..occctcco......",
        "..occcccco......",
        "..occcccco......",
        "..ogcccgo.......",
        "..occccco.......",
        "..occccco.......",
        "..occ.cco.......",
        "..obb.bbo.......",
        "..obb.bbo.......",
        "..ooo.ooo......."
      ],
      [
        "................",
        "....ohhho.......",
        "...ohhhhho......",
        "...ohsssho......",
        "...oeseso.......",
        "...owssso.......",
        "...osssso.......",
        "....owwo........",
        "..gogccgog......",
        ".gocctccog......",
        "..occctcco......",
        "..occctcco......",
        "..occgtgco......",
        "..occctcco......",
        "..occctcco......",
        "..occcccco......",
        "..occcccco......",
        "..ogcccgo.......",
        "..occccco.......",
        "..occccco.......",
        "..occ.cco.......",
        "..obb.bbo.......",
        "..obb.bbo.......",
        "..ooo.ooo......."
      ]
    ]
  });

  /* ЕРЛАН — bek of the Younger Juz (young, angry, partisan). Lean, leather
     armor, spear at side, headband, fierce eyes. Two frames (grip shift). */
  D("erlan", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "boneGrey", h: "outline", c: "deadGreen", t: "gold",
      b: "outline", e: "feltRed", r: "feltRed", p: "earth", g: "boneGrey"
    },
    frames: [
      [
        ".......p........",
        ".....ohhho......",
        "....ohhhhho.....",
        "....orrrro......",
        "....oshsho......",
        "....oeseeo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...occtccop.....",
        "...occtccop.....",
        "...occtccop.....",
        "...occtgcop.....",
        "...occtccop.....",
        "...occccco p....",
        "...occccco......",
        "...occccco......",
        "...occccco......",
        "...occ.cco......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ],
      [
        "................",
        ".....ohhho..p...",
        "....ohhhhho.p...",
        "....orrrro..p...",
        "....oshsho..p...",
        "....oeseeo..p...",
        "....osssso..p...",
        ".....osso..gp...",
        "....occcco......",
        "...occtcco......",
        "...occtcco......",
        "...occtcco......",
        "...occtgco......",
        "...occtcco......",
        "...occccco......",
        "...occccco......",
        "...occccco......",
        "...occccco......",
        "...occ.cco......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ]
    ]
  });

  /* CHILD — aul child (one of those locked in the cave by Жалмауыз). Small,
     ~16x16 within the 24-tall frame (anchored bottom). Bright felt clothes. */
  D("child", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "bone", h: "outline", c: "skyBlue", t: "gold",
      b: "outline", e: "outline", r: "feltRed"
    },
    frames: [
      [
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        ".....ohho.......",
        "....ohhhho......",
        "....oshso.......",
        "....oeseo.......",
        "....osso........",
        "...occco........",
        "..occrcco.......",
        "..occtcco.......",
        "..occccco.......",
        "..occccco.......",
        "..occccco.......",
        "..occ.cco.......",
        "..obb.bbo.......",
        "..obb.bbo.......",
        "..ooo.ooo.......",
        "................",
        "................"
      ],
      [
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        ".....ohho.......",
        "....ohhhho......",
        "....oshso.......",
        "....oseeo.......",
        "....osso........",
        "...occco........",
        "..occrcco.......",
        "..occtcco.......",
        "..occccco.......",
        "..occccco.......",
        "..occccco.......",
        "..occ.cco.......",
        "..obbo.bbo......",
        "..obbo.obo......",
        "..ooo...oo......",
        "................",
        "................"
      ]
    ]
  });

  /* ------------------------------------------------------------------ */
  /* THE EAGLE — Қара Сұңқар (golden eagle / berkut)                     */
  /* ------------------------------------------------------------------ */

  /* eagle — perched. Dark brown body, golden nape, hooked beak, talons. */
  D("eagle", {
    w: 16, h: 16, anchor: "bottom",
    map: {
      o: "outline", b: "earth", g: "gold", d: "outline", y: "goldAccent",
      k: "gold", t: "boneGrey"
    },
    frames: [
      [
        "................",
        ".....oo.........",
        "....obyo........",
        "...okgddo.......",
        "...oggbbo.......",
        "..obbbbbo.......",
        "..obbbbbbo......",
        ".obbbbbbbo......",
        ".obbgggbbo......",
        ".obbbbbbbbo.....",
        "..obbbbbbbo.....",
        "..obbbbbbo......",
        "...obbbbo.......",
        "...ottoto.......",
        "...ot.o.t.......",
        "...oo...o......."
      ],
      [ /* slight head turn / settle */
        "................",
        "......oo........",
        ".....obyo.......",
        "....okgddo......",
        "...oggbbo.......",
        "..obbbbbo.......",
        "..obbbbbbo......",
        ".obbbbbbbo......",
        ".obbgggbbo......",
        ".obbbbbbbbo.....",
        "..obbbbbbbo.....",
        "..obbbbbbo......",
        "...obbbbo.......",
        "...ottoto.......",
        "...ot.o.t.......",
        "...oo...o......."
      ]
    ]
  });

  /* eagle_fly — wings spread, 3 flap frames (down / mid / up). Wide 24px. */
  D("eagle_fly", {
    w: 24, h: 16, anchor: "center",
    map: {
      o: "outline", b: "earth", g: "gold", d: "outline", y: "goldAccent", k: "gold"
    },
    frames: [
      [ /* wings DOWN (full spread, tips low) */
        "........................",
        ".........obyo...........",
        "........okgddo..........",
        ".......oggbbo...........",
        "......obbbbbo...........",
        "ooo..obbgbbbo..ooo......",
        ".ooooobbbbbbboooooo.....",
        "..oobbbbbbbbbbbboo......",
        "...obbbbgggbbbbbo.......",
        "....obbbbbbbbbbo........",
        ".....obbbbbbbo..........",
        "......obbbbbo...........",
        ".......obbbo............",
        "........oto.............",
        ".......ot.to............",
        ".......o...o............"
      ],
      [ /* wings MID (horizontal) */
        "........................",
        ".........obyo...........",
        "........okgddo..........",
        ".......oggbbo...........",
        "......obbbbbo...........",
        "......obbgbbbo..........",
        "oooooobbbbbbbboooooo....",
        "ooobbbbbbbbbbbbbbooo....",
        "...obbbbgggbbbbbo.......",
        "....obbbbbbbbbbo........",
        ".....obbbbbbbo..........",
        "......obbbbbo...........",
        ".......obbbo............",
        "........oto.............",
        ".......ot.to............",
        ".......o...o............"
      ],
      [ /* wings UP (tips high) */
        "...ooo..........ooo.....",
        "...oboo.obyo...oobo.....",
        "...obbo okgddo oobbo....",
        "....obboggbbooobbo......",
        ".....obbbbbbbbbbo.......",
        "......obbgbbbbbo........",
        "......obbbbbbbo.........",
        "......obbbbbbbo.........",
        "......obbgggbbo.........",
        ".....obbbbbbbbo.........",
        ".....obbbbbbbo..........",
        "......obbbbbo...........",
        ".......obbbo............",
        "........oto.............",
        ".......ot.to............",
        ".......o...o............"
      ]
    ]
  });

  /* ------------------------------------------------------------------ */
  /* ENEMIES                                                            */
  /* ------------------------------------------------------------------ */

  /* ЖАЛМАУЫЗ КЕМПІР — the hag of the Lower world. Hunched crone, long matted
     grey hair, single fang, claw hands, ragged dark robe, sickly green skin.
     ~24x28 (anchor bottom). 2 frames: idle sway + claw raise. */
  D("jalmauyz", {
    w: 24, h: 28, anchor: "bottom",
    map: {
      o: "outline", s: "deadGreen", h: "greySteppe", c: "caveStone",
      e: "feltRed", f: "bone", n: "outline", r: "bloodDark", k: "deadGreen"
    },
    frames: [
      [
        "........................",
        ".......hhhhhh...........",
        "......hhhhhhhh..........",
        ".....hhhhhhhhhh.........",
        ".....hsssssssh..........",
        ".....hssshsssh..........",
        ".....hseseesh...........",
        ".....hssnssh............",
        ".....hssfssh............",
        "......hsssh.............",
        ".......ohho.............",
        "......occcco............",
        ".....occccco............",
        "....occrcccco...........",
        "...koccccccok...........",
        "..kkoccccccokk..........",
        ".kk.occrccco.kk.........",
        "k...occcccco...k........",
        "....occcccco............",
        "....occcccco............",
        "....occcccco............",
        "....occcccco............",
        "....occ..cco............",
        "....obb..bbo............",
        "....obb..bbo............",
        "....obb..bbo............",
        "....ooo..ooo............",
        "........................"
      ],
      [ /* claws raised, hair lashing */
        "........................",
        "....hh.hhhhhh.hh........",
        "...hhhhhhhhhhhhh........",
        "...hhhhhhhhhhhhhh.......",
        ".....hsssssssh..........",
        ".....hssshsssh..........",
        ".....hseseesh...........",
        ".....hssnssh............",
        ".....hssfssh............",
        "......hsssh.............",
        ".kk....ohho....kk.......",
        "kk....occcco....kk......",
        "k....occccco.....k......",
        "kk..occrcccco...kk......",
        ".kk.occccccoc.kk........",
        "...koccccccok...........",
        "....occrccco............",
        "....occcccco............",
        "....occcccco............",
        "....occcccco............",
        "....occcccco............",
        "....occcccco............",
        "....occ..cco............",
        "....obb..bbo............",
        "....obb..bbo............",
        "....obb..bbo............",
        "....ooo..ooo............",
        "........................"
      ]
    ]
  });

  /* ДӨНЕН — the dead colossal war-horse with burning eyes. Skeletal/grey hide,
     hollow ember eyes, mane of dim fire, immense. ~28x24 (anchor bottom).
     2 frames: eyes pulse (the ember flickers). */
  D("donen", {
    w: 28, h: 24, anchor: "bottom",
    map: {
      o: "outline", b: "boneGrey", g: "greySteppe", e: "feltRed", f: "caveFire",
      m: "deadGreen", d: "outline", h: "ashGrey", r: "bloodDark"
    },
    frames: [
      [
        "............................",
        "................mm..........",
        "...............mmmm.........",
        "..............obbbbo........",
        ".............obbbbbbo.......",
        "............obeebbbbo.......",
        "...........obeeebbbbom......",
        "..........obbbbbbbbbomm.....",
        ".........obbbbdbbbbommm.....",
        "........obbbbbbbbbbmmm......",
        "...obbbbbbbbbbbbbbbo........",
        "..obbbbbbbbbbbbbbbbbo.......",
        ".obbbbbbbbbbbbbbbbbbbo......",
        ".obbbbbbbbbbbbbbbbbbbo......",
        ".obhbbbhbbbbbbbhbbbhbo......",
        ".obbbbbbbbbbbbbbbbbbbo......",
        ".obbbbbbbbbbbbbbbbbbbo......",
        "..ob.bo.....ob.bo...........",
        "..ob.bo.....ob.bo...........",
        "..ob.bo.....ob.bo...........",
        "..ob.bo.....ob.bo...........",
        "..oh.ho.....oh.ho...........",
        "..oo.oo.....oo.oo...........",
        "............................"
      ],
      [ /* eyes blaze brighter, embers in mane */
        "............................",
        "...............fmf..........",
        "..............fmmmf.........",
        "..............obbbbo........",
        ".............obbbbbbo.......",
        "............obffbbbbo.......",
        "...........obfffbbbbof......",
        "..........obbbbbbbbbofm.....",
        ".........obbbbdbbbbofmf.....",
        "........obbbbbbbbbbfmf......",
        "...obbbbbbbbbbbbbbbbo.......",
        "..obbbbbbbbbbbbbbbbbbo......",
        ".obbbbbbbbbbbbbbbbbbbbo.....",
        ".obbbbbbbbbbbbbbbbbbbbo.....",
        ".obhbbbhbbbbbbbhbbbhbbo.....",
        ".obbbbbbbbbbbbbbbbbbbo......",
        ".obbbbbbbbbbbbbbbbbbbo......",
        "..ob.bo.....ob.bo...........",
        "..ob.bo.....ob.bo...........",
        "..ob.bo.....ob.bo...........",
        "..ob.bo.....ob.bo...........",
        "..oh.ho.....oh.ho...........",
        "..oo.oo.....oo.oo...........",
        "............................"
      ]
    ]
  });

  /* SHADOW — Тень: a dark mirror of Ержан. Same silhouette as erzhan, filled
     with night + violet crack-light, white hollow eyes. The final boss copies
     the player. 2 frames: violet shimmer pulse. */
  D("shadow", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "crackLight", s: "night", h: "night", c: "caveDark",
      v: "crackLight", e: "yurtWhite", b: "night"
    },
    frames: [
      [
        "................",
        ".....oooo.......",
        "....ohhhho......",
        "....ohhhho......",
        "....oshsho......",
        "....oeseeo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...occcccco.....",
        "..occcvccco.....",
        "..osccvccso.....",
        "..osccvccso.....",
        "..occcvccco.....",
        "...occvcco......",
        "...occvcco......",
        "...occccco......",
        "...occccco......",
        "...occccco......",
        "...occ.cco......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ],
      [
        "................",
        ".....oooo.......",
        "....ohhhho......",
        "....ohhhho......",
        "....oshsho......",
        "....oeseeo......",
        "....osssso......",
        ".....osso.......",
        "....occcco......",
        "...occvcvco.....",
        "..occvcvcvo.....",
        "..oscvcvcso.....",
        "..oscvcvcso.....",
        "..occvcvcco.....",
        "...ocvvcvo......",
        "...occvcco......",
        "...occvcco......",
        "...occccco......",
        "...occccco......",
        "...occ.cco......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ]
    ]
  });

  /* ORDO_SOLDIER — a soldier of the Dark Ordo. Dark lamellar armor, conical
     helm with the Ordo mark (triangle-with-a-dot), spear, cold grey palette.
     2 frames: spear ready / thrust-set. */
  D("ordo_soldier", {
    w: 16, h: 24, anchor: "bottom",
    map: {
      o: "outline", s: "boneGrey", a: "caveStone", t: "goldAccent", h: "caveStone",
      e: "feltRed", p: "earth", g: "greySteppe", d: "outline"
    },
    frames: [
      [
        ".......p........",
        ".....ohtho......",
        "....ohhhhho.....",
        "....ohhhhho.....",
        "....osesso......",
        "....osssso......",
        ".....oao........",
        "....oaaaao......",
        "...oaagtaao.....",
        "..oaaagaaaop....",
        "..oaaataaaop....",
        "..oaaataaaop....",
        "..oaagtgaaop....",
        "..oaaaaaaaop....",
        "...oaaaaaop.....",
        "...oaaaaao......",
        "...oaaaaao......",
        "...oaa.aao......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ],
      [
        "........p.......",
        ".....ohtho.p....",
        "....ohhhhho.p...",
        "....ohhhhho.p...",
        "....oesso.p.....",
        "....osssso......",
        ".....oao........",
        "....oaaaao......",
        "...oaagtaao.....",
        "..oaaagaaao.....",
        "..oaaataaao.....",
        "..oaaataaao.....",
        "..oaagtgaao.....",
        "..oaaaaaaao.....",
        "...oaaaaao......",
        "...oaaaaao......",
        "...oaaaaao......",
        "...oaa.aao......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...obb.bbo......",
        "...ooo.ooo......"
      ]
    ]
  });

  /* ------------------------------------------------------------------ */
  /* TILES (16x16, anchor top). grey_* are the desaturated decay twins.  */
  /* ------------------------------------------------------------------ */

  /* grass — living steppe. Two greens + sparse blades. */
  D("grass", {
    w: 16, h: 16, anchor: "top",
    map: { a: "grassLight", b: "grassDark", l: "leaf" },
    frames: [[
      "aaaaaaaaaaaaaaaa",
      "aaaalaaaaaaaaaaa",
      "aaaaaaaaaaalaaaa",
      "abaaaaaalaaaaaaa",
      "aaaaaabaaaaaalaa",
      "aaaaaaaaaaaaaaaa",
      "alaaaaaaaalaaaaa",
      "aaaaaalaaaaaaaaa",
      "aaaaaaaaaaaaabaa",
      "aabaaaalaaaaaaaa",
      "aaaaaaaaaaalaaaa",
      "aaalaaaaaaaaaaaa",
      "aaaaaaaabaaaalaa",
      "abaaalaaaaaaaaaa",
      "aaaaaaaaaalaaaaa",
      "aaaaaaaaaaaaaaaa"
    ]]
  });

  /* grass_grey — the dying twin (used directly AND matched by tint). */
  D("grass_grey", {
    w: 16, h: 16, anchor: "top",
    map: { a: "greySteppe", b: "deadGreen", l: "ashGrey" },
    frames: [[
      "aaaaaaaaaaaaaaaa",
      "aaaalaaaaaaaaaaa",
      "aaaaaaaaaaalaaaa",
      "abaaaaaalaaaaaaa",
      "aaaaaabaaaaaalaa",
      "aaaaaaaaaaaaaaaa",
      "alaaaaaaaalaaaaa",
      "aaaaaalaaaaaaaaa",
      "aaaaaaaaaaaaabaa",
      "aabaaaalaaaaaaaa",
      "aaaaaaaaaaalaaaa",
      "aaalaaaaaaaaaaaa",
      "aaaaaaaabaaaalaa",
      "abaaalaaaaaaaaaa",
      "aaaaaaaaaalaaaaa",
      "aaaaaaaaaaaaaaaa"
    ]]
  });

  /* water — deep + light ripple. (Animatable via 2 frames.) */
  D("water", {
    w: 16, h: 16, anchor: "top",
    map: { d: "waterDeep", l: "waterLight" },
    frames: [
      [
        "dddddddddddddddd",
        "ddddllddddddllld",
        "ddddddddlldddddd",
        "ddllddddddddlldd",
        "ddddddllddddddld",
        "dlldddddddlldddd",
        "ddddddlldddddddd",
        "ddddlldddddddlld",
        "dddddddddllddddd",
        "ddlldddddddddlld",
        "ddddddddlldddddd",
        "dlldddddddddlldd",
        "ddddlldddddddddd",
        "ddddddddlldddddd",
        "ddlldddddddllddd",
        "dddddddddddddddd"
      ],
      [
        "dddddddddddddddd",
        "ddlldddddddddlld",
        "ddddddlldddddddd",
        "ddddddddlldddddd",
        "dlldddddddddlldd",
        "ddddddllddddddld",
        "ddddlldddddddlld",
        "dddddddddllddddd",
        "ddlldddddddddlld",
        "ddddddddlldddddd",
        "ddddllddddddddld",
        "dlldddddddlldddd",
        "ddddddlldddddddd",
        "ddddlldddddddlld",
        "ddddddddlldddddd",
        "dddddddddddddddd"
      ]
    ]
  });

  /* rock — grey boulder, solid. */
  D("rock", {
    w: 16, h: 16, anchor: "top",
    map: { o: "outline", a: "boneGrey", b: "greySteppe", h: "ashGrey" },
    frames: [[
      "................",
      "................",
      "....oooooo......",
      "...oaaaaabo.....",
      "..oahaaabbbo....",
      "..oaaaabbbbo....",
      ".oaahaaabbbbo...",
      ".oaaaabbbbbbo...",
      ".obaaabbbbhbo...",
      ".obbaabbbbbbo...",
      ".obbbbbbhbbbo...",
      "..obbbbbbbbo....",
      "..oobbbbbboo....",
      "...oooooooo.....",
      "................",
      "................"
    ]]
  });

  /* sand — Сарыарка yellow steppe floor; warm speckle. */
  D("sand", {
    w: 16, h: 16, anchor: "top",
    map: { a: "gold", b: "goldAccent", e: "earth", l: "boneGrey" },
    frames: [[
      "aaaaaaaaaaaaaaaa",
      "aaaaaabaaaaaaaaa",
      "aaaaaaaaaaaeaaaa",
      "aaeaaaaaaaaaaaaa",
      "aaaaaaaabaaaaaaa",
      "aaaaaeaaaaaaalaa",
      "alaaaaaaaaeaaaaa",
      "aaaaaaaaaaaaaaaa",
      "aaaaabaaaaaaaaba",
      "aaeaaaaaaalaaaaa",
      "aaaaaaaeaaaaaaaa",
      "aaaaaaaaaaaaeaaa",
      "abaaaaaaaaaaaaaa",
      "aaaaalaaaabaaaaa",
      "aaaeaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa"
    ]]
  });

  /* yurt — white felt yurt with red door and gold shanyrak crown. Living aul. */
  D("yurt", {
    w: 16, h: 16, anchor: "top",
    map: { o: "outline", w: "yurtWhite", r: "feltRed", g: "gold", b: "earth", t: "goldAccent" },
    frames: [[
      "......gg........",
      ".....gttg.......",
      "....owwwwo......",
      "...owwwwwwo.....",
      "..owwttwwwwo....",
      "..owwwwwwwwo....",
      ".owwwwwwwwwwo...",
      ".owwwwwwwwwwo...",
      ".owwwrrwwwwwo...",
      ".owwwrrwwwwwo...",
      ".owwwrrwwwwwo...",
      ".owbwrrwwbwwo...",
      ".owwwrrwwwwwo...",
      ".oowwrrwwwoo....",
      "...oorroo.......",
      "................"
    ]]
  });

  /* yurt_stone — Досан's Elder-Juz stone yurt (rich, grey stone, gold trim). */
  D("yurt_stone", {
    w: 16, h: 16, anchor: "top",
    map: { o: "outline", s: "caveStone", g: "gold", r: "feltRed", h: "boneGrey", t: "goldAccent" },
    frames: [[
      "......gg........",
      ".....gttg.......",
      "....osssso......",
      "...ossshsso.....",
      "..osshsssso.....",
      "..ossssgssso....",
      ".ossshssssso....",
      ".ossssssshso....",
      ".osssrrsssso....",
      ".oshssrrsssso...",
      ".osssrrshssso...",
      ".osssrrsssso....",
      ".osshsrrsssso...",
      ".oosssrrsssoo...",
      "...oorroo.......",
      "................"
    ]]
  });

  /* cave_floor — Жер Асты ground, dark stone with cold flecks. */
  D("cave_floor", {
    w: 16, h: 16, anchor: "top",
    map: { d: "caveDark", s: "caveStone", f: "crackLight", b: "night" },
    frames: [[
      "dddddddddddddddd",
      "ddsdddddddddsddd",
      "ddddddddsddddddd",
      "dsddddddddddddsd",
      "ddddddfddddddddd",
      "dddsddddddsddddd",
      "ddddddddddddbddd",
      "dbddddsddddddddd",
      "ddddddddddddsddd",
      "ddsddddddfdddddd",
      "ddddddbddddddddd",
      "dddddddddsdddddd",
      "dsddddddddddddbd",
      "ddddsdddddddsddd",
      "ddddddddbddddddd",
      "dddddddddddddddd"
    ]]
  });

  /* cave_wall — Жер Асты wall, solid, with violet crack-light veins. */
  D("cave_wall", {
    w: 16, h: 16, anchor: "top",
    map: { o: "outline", s: "caveStone", d: "caveDark", f: "crackLight", b: "night" },
    frames: [[
      "ssssssssssssssss",
      "sdsssdsssdssssds",
      "ssssfsssssssssss",
      "sdssssssdsssfsss",
      "ssssssssssssssss",
      "ssdsssssssdsssss",
      "sssssfssssssssfs",
      "sdsssssssssdssss",
      "ssssssdsssssssss",
      "sfssssssssssssss",
      "ssssdssssfsssdss",
      "sdssssssssssssss",
      "ssssssssdssssfss",
      "ssfsssssssssssss",
      "sdsssdsssssdssss",
      "ssssssssssssssss"
    ]]
  });

  /* sky_white — Аспан upper-world tile: bright void with the faintest motes. */
  D("sky_white", {
    w: 16, h: 16, anchor: "top",
    map: { w: "skyWhite", h: "skyHigh", b: "skyBlue" },
    frames: [[
      "wwwwwwwwwwwwwwww",
      "wwwwwwwhwwwwwwww",
      "wwhwwwwwwwwwwwww",
      "wwwwwwwwwwwhwwww",
      "wwwwwhwwwwwwwwww",
      "wwwwwwwwwwwwwwhw",
      "whwwwwwwwhwwwwww",
      "wwwwwwwwwwwwwwww",
      "wwwwwhwwwwwwwwww",
      "wwwwwwwwwhwwwwww",
      "wwhwwwwwwwwwwwhw",
      "wwwwwwwwwwwwwwww",
      "wwwwhwwwwwhwwwww",
      "wwwwwwwwwwwwwwww",
      "whwwwwwhwwwwwwww",
      "wwwwwwwwwwwwwwww"
    ]]
  });

  /* campfire — fire pit; 3 frames flame flicker. Anchor bottom so it sits on
     the ground; used both as a tile-ish prop and a scene fixture. */
  D("campfire", {
    w: 16, h: 16, anchor: "bottom",
    map: { o: "outline", r: "feltRed", y: "gold", w: "yurtWhite", e: "earth", g: "goldAccent", a: "ashGrey" },
    frames: [
      [
        "................",
        "................",
        "......y.........",
        ".....yry........",
        ".....ryr........",
        "....ryyyr.......",
        "....rywyr.......",
        "...rryywrr......",
        "...ryyyyyr......",
        "...rygygyr......",
        "..eooooooe......",
        "..eaooooae......",
        ".eooaooaooe.....",
        ".eoooaooooe.....",
        "..oeeooeeo......",
        "................"
      ],
      [
        "................",
        "......y.........",
        ".....yy.........",
        "....yryy........",
        "....ryry........",
        "...ryyyyr.......",
        "...rywwyr.......",
        "...ryygyr.......",
        "..rryyyyrr......",
        "..rygygygr......",
        "..eooooooe......",
        "..eaooooae......",
        ".eooaooaooe.....",
        ".eoooaooooe.....",
        "..oeeooeeo......",
        "................"
      ],
      [
        "................",
        ".......y........",
        "......yyy.......",
        "......yry........",
        ".....yyyr.......",
        ".....ryyyr......",
        "....ryywyr......",
        "....rywwgr......",
        "...rryygyrr.....",
        "..rrygygyrr.....",
        "..eooooooe......",
        "..eaooooae......",
        ".eooaooaooe.....",
        ".eoooaooooe.....",
        "..oeeooeeo......",
        "................"
      ]
    ]
  });

  /* tree — living steppe tree (тал / poplar). Brown trunk, green crown. */
  D("tree", {
    w: 16, h: 16, anchor: "bottom",
    map: { o: "outline", l: "leaf", g: "grassDark", a: "grassLight", e: "earth", b: "outline" },
    frames: [[
      "....oooo........",
      "...oggggo.......",
      "..oggaaggo......",
      ".ogaaaaaggo.....",
      ".oggaaaaago.....",
      "ogaagaaaaggo....",
      ".oggaaaaago.....",
      ".oggaalaggo.....",
      "..ogggaggo......",
      "...oggggo.......",
      "....oeeo........",
      "....oeeo........",
      "....oeeo........",
      "...oeeeeo.......",
      "..oeebbeeo......",
      "..oo....oo......"
    ]]
  });

  /* tree_grey — the dead/grey twin of the tree (bare, ashen). */
  D("tree_grey", {
    w: 16, h: 16, anchor: "bottom",
    map: { o: "outline", g: "deadGreen", a: "greySteppe", e: "earth", b: "ashGrey" },
    frames: [[
      "................",
      "....o..o..o.....",
      "...o.oo.o.o.....",
      "....oo.ooo......",
      ".o..o.oo..o.....",
      "..o.oooo.o......",
      "...ooaoaoo......",
      "....oaoao.......",
      "....ogago.......",
      "....oaao........",
      "....oeeo........",
      "....oeeo........",
      "....oeeo........",
      "...oeeeeo.......",
      "..oeebbeeo......",
      "..oo....oo......"
    ]]
  });

  /* grave — ancestor's grave / kulpytas stone marker at the aul cemetery. */
  D("grave", {
    w: 16, h: 16, anchor: "bottom",
    map: { o: "outline", s: "boneGrey", b: "greySteppe", g: "gold", e: "grassDark", l: "leaf" },
    frames: [[
      "................",
      ".....oooo.......",
      "....osssbo......",
      "....osgsbo......",
      "....osssbo......",
      "....osbsbo......",
      "....osgsbo......",
      "....osssbo......",
      "....osbsbo......",
      "...ossssbbo.....",
      "...obsssbbo.....",
      "..oobbbbbboo....",
      ".oeebbbbbbeeo...",
      "oelebbbbbbelle..",
      "oeeellllleeee...",
      ".oo........oo..."
    ]]
  });

  /* petroglyph — rock face with an ancestral carving (a rider on horse). When
     uncollected it glows faint gold; the deer/rider motif reads as a memory. */
  D("petroglyph", {
    w: 16, h: 16, anchor: "bottom",
    map: { o: "outline", s: "boneGrey", b: "greySteppe", g: "gold", h: "earth", d: "goldAccent" },
    frames: [
      [ /* glyph dim */
        "................",
        ".oooooooooooo...",
        ".osbsbsbsbsbo...",
        ".osbsggsbsbo....",
        ".osbgssgbsbo....",
        ".osggssggsbo....",
        ".osgsggsgsbo....",
        ".osbgssgbsbo....",
        ".osbsgsgsbbo....",
        ".osbgsgbsbbo....",
        ".osbsbsbsbbo....",
        ".obsbsbsbsbo....",
        ".oobsbsbsboo....",
        "..ohhbsbhho.....",
        "..oh.....ho.....",
        "..oo.....oo....."
      ],
      [ /* glyph pulse (carving lit brighter) */
        "................",
        ".oooooooooooo...",
        ".osbsbsbsbsbo...",
        ".osbsddsbsbo....",
        ".osbdssdbsbo....",
        ".osddssddsbo....",
        ".osdsddsdsbo....",
        ".osbdssdbsbo....",
        ".osbsdsdsbbo....",
        ".osbdsdbsbbo....",
        ".osbsbsbsbbo....",
        ".obsbsbsbsbo....",
        ".oobsbsbsboo....",
        "..ohhbsbhho.....",
        "..oh.....ho.....",
        "..oo.....oo....."
      ]
    ]
  });

  /* ------------------------------------------------------------------ */
  /* PROPS                                                              */
  /* ------------------------------------------------------------------ */

  /* dombra_icon — the two-string Kazakh lute. Wooden pear body, long neck,
     two gut strings, gold rosette. 2 frames: strings vibrate (the dombra
     "pulse" used by Dialogue/UI when music plays). */
  D("dombra_icon", {
    w: 16, h: 16, anchor: "center",
    map: { o: "outline", e: "earth", w: "boneGrey", g: "gold", s: "bone", b: "bloodDark" },
    frames: [
      [
        ".............o..",
        "............ow..",
        "...........ows..",
        "..........ows...",
        ".........ows....",
        "........ows.....",
        ".......ows......",
        "......oeso......",
        ".....oeebeo.....",
        "....oeegseeo....",
        "....oeegseeo....",
        "....oeeggeeo....",
        ".....oeebeo.....",
        "......oeeo......",
        ".......oo.......",
        "................"
      ],
      [ /* strings + body shimmer one px (vibration) */
        ".............o..",
        "............ow..",
        "...........ows..",
        "..........osw...",
        ".........ows....",
        "........osw.....",
        ".......ows......",
        "......oseo......",
        ".....oebeeo.....",
        "....oeesgeeo....",
        "....oeegseeo....",
        "....oeeggeeo....",
        ".....oebeeo.....",
        "......oeeo......",
        ".......oo.......",
        "................"
      ]
    ]
  });

  /* crack — the fissure in stone (the new cave crack; Tas Jurek fissure motif).
     Filled with the dark/violet crack-light. 2 frames: the light pulses. */
  D("crack", {
    w: 16, h: 16, anchor: "center",
    map: { o: "outline", d: "caveStone", v: "crackLight", b: "bloodDark", n: "night" },
    frames: [
      [
        "ddddddoddddddddd",
        "dddddodvoddddddd",
        "ddddodvdvodddddd",
        "dddodvbbvodddddd",
        "ddodvbnnbvoddddd",
        "ddodvbnnbvoddddd",
        "dddodvbbvodddddd",
        "ddddodvvoddddddd",
        "ddddodvodddddddd",
        "dddodvbvoddddddd",
        "ddodvbnbvodddddd",
        "ddodvbnnnbvodddd",
        "dddodvbnbvoddddd",
        "ddddodvbvodddddd",
        "dddddodvoddddddd",
        "ddddddoddddddddd"
      ],
      [ /* brighter pulse */
        "ddddddoddddddddd",
        "dddddovvvodddddd",
        "ddddovvvvvoddddd",
        "dddovvbbvvoddddd",
        "ddovvbnnbvvodddd",
        "ddovvbnnbvvodddd",
        "dddovvbbvvoddddd",
        "ddddovvvvodddddd",
        "ddddovvvoddddddd",
        "dddovvbvvodddddd",
        "ddovvbnbvvoddddd",
        "ddovvbnnnbvvoddd",
        "dddovvbnbvvodddd",
        "ddddovvbvvoddddd",
        "dddddovvvodddddd",
        "ddddddoddddddddd"
      ]
    ]
  });

})();
