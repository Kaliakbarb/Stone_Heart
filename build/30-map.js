/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 30-map.js  (TILEMAP + CAMERA + COLLISION
   + PORTALS + WORLD-DECAY)
   Owns: World, Decay   (per CONTRACT.md §10)
   RAW JS — concatenated after 20-audio.js inside the single <script>.
   Authoritative interface obeyed exactly. Every cross-module call is
   guarded so one absent sprite/audio/scene key never throws in the loop.
   World DATA is authored by chapter modules; this file is the ENGINE that
   runs it: registry, follow-camera tile renderer, collision grid, NPC
   layer, Z-to-interact, walk-on exits/portals, free-roam explore scene
   factory (4-dir walk + camera + bump-to-talk + dombra footprints +
   pause), and the per-region world-decay model.
   ===================================================================== */

/* ===================================================================== */
/* DECAY — per-region world-rot model (CONTRACT §10)                     */
/*   level 0..1 per regionId, stored in G.worldDecay. Engine loop calls  */
/*   Decay.tick(dt) every frame (guarded). Every 5 in-game minutes one    */
/*   not-yet-healed location darkens by +0.10. Healed regions are frozen  */
/*   and stepped back toward 0. World starts ~80% grey (chapters seed).   */
/* ===================================================================== */
var Decay = (function () {

  /* tunables pinned by the contract / design */
  var TICK_MS = 5 * 60 * 1000;   // 5 in-game minutes between decay steps
  var STEP    = 0.10;            // +10% per step on one location
  var HEAL_PER_SEC = 0.35;       // how fast a healed region returns color

  /* internal state (NOT serialized — lives outside G; G.worldDecay is truth) */
  var _acc = 0;                  // accumulated ms toward the next decay step
  var _healed = {};              // regionId -> true once healed (frozen + reversing)
  var _order = [];               // round-robin cursor over known regions
  var _cursor = 0;

  function _g() {
    /* always read the live global; create the bag if a module nuked it */
    if (typeof G === "undefined" || !G) return null;
    if (!G.worldDecay || typeof G.worldDecay !== "object") G.worldDecay = {};
    return G.worldDecay;
  }

  /* make sure a region id is tracked in the round-robin order list */
  function _track(regionId) {
    if (typeof regionId !== "string" || !regionId) return;
    if (_order.indexOf(regionId) < 0) _order.push(regionId);
  }

  return {
    /* set/override the initial decay level of a region (chapter setup).
       Top-level safe (only touches G + local state). */
    seed: function (regionId, level) {
      var bag = _g(); if (!bag) return;
      if (typeof regionId !== "string" || !regionId) return;
      var v = (typeof level === "number" && isFinite(level)) ? level : 0.8;
      bag[regionId] = clamp(v, 0, 1);
      _track(regionId);
    },

    /* current decay 0..1 for a region; 0 if unknown (defensive). */
    levelFor: function (regionId) {
      var bag = _g(); if (!bag) return 0;
      var v = bag[regionId];
      if (typeof v !== "number" || !isFinite(v)) return 0;
      return clamp(v, 0, 1);
    },

    /* freeze a region's decay AND begin reversing it toward 0 (quest reward).
       Idempotent. */
    heal: function (regionId) {
      var bag = _g(); if (!bag) return;
      if (typeof regionId !== "string" || !regionId) return;
      _track(regionId);
      if (bag[regionId] === undefined) bag[regionId] = 0;
      _healed[regionId] = true;
      try { if (typeof EventBus !== "undefined" && EventBus.emit) EventBus.emit("decay:heal", { region: regionId }); } catch (e) {}
    },

    /* is a region currently healed/frozen? */
    isHealed: function (regionId) { return !!_healed[regionId]; },

    /* engine loop drives this every frame (guarded by the engine).
       - reverse any healed regions smoothly toward 0
       - accumulate game time; each full TICK_MS darken ONE unhealed location
         by +STEP, round-robin across known regions. */
    tick: function (dt) {
      var bag = _g(); if (!bag) return;
      if (typeof dt !== "number" || !isFinite(dt) || dt < 0) dt = 0;

      /* 1) heal-back: ease healed regions toward fully alive */
      var dSec = dt / 1000;
      for (var rid in _healed) {
        if (!Object.prototype.hasOwnProperty.call(_healed, rid)) continue;
        if (!_healed[rid]) continue;
        var cur = bag[rid];
        if (typeof cur !== "number" || !isFinite(cur)) cur = 0;
        if (cur > 0) {
          cur = clamp(cur - HEAL_PER_SEC * dSec, 0, 1);
          bag[rid] = cur;
        }
      }

      /* 2) decay accrual: one unhealed location darkens per TICK_MS */
      _acc += dt;
      while (_acc >= TICK_MS) {
        _acc -= TICK_MS;
        _stepOne(bag);
      }

      try { if (typeof EventBus !== "undefined" && EventBus.emit) EventBus.emit("decay:tick", { dt: dt }); } catch (e2) {}
    },

    /* overall world health 0..100 used by the endings' final map.
       100 = every known region fully alive (level 0). With no regions
       tracked yet, report a fully-grey world per the dying-steppe premise. */
    restoredPercent: function () {
      var bag = _g(); if (!bag) return 0;
      var ids = [];
      var k;
      for (k = 0; k < _order.length; k++) { if (ids.indexOf(_order[k]) < 0) ids.push(_order[k]); }
      for (k in bag) { if (Object.prototype.hasOwnProperty.call(bag, k) && ids.indexOf(k) < 0) ids.push(k); }
      if (ids.length === 0) return 0;
      var sum = 0;
      for (k = 0; k < ids.length; k++) {
        var v = bag[ids[k]];
        if (typeof v !== "number" || !isFinite(v)) v = 0;
        sum += clamp(v, 0, 1);
      }
      var avgDecay = sum / ids.length;          // 0 alive .. 1 grey
      return clamp(Math.round((1 - avgDecay) * 100), 0, 100);
    },

    /* expose the round-robin region list (read-only-ish helper for chapters) */
    regions: function () { return _order.slice(); }
  };

  /* darken exactly one not-yet-healed region by +STEP, round-robin.
     Skips fully-grey and healed regions; if all are maxed/healed, no-op. */
  function _stepOne(bag) {
    if (_order.length === 0) return;
    var tries = _order.length;
    while (tries-- > 0) {
      if (_cursor >= _order.length) _cursor = 0;
      var rid = _order[_cursor];
      _cursor = (_cursor + 1) % _order.length;
      if (_healed[rid]) continue;
      var cur = bag[rid];
      if (typeof cur !== "number" || !isFinite(cur)) cur = 0;
      if (cur >= 1) continue;
      bag[rid] = clamp(cur + STEP, 0, 1);
      return; // one location per tick
    }
  }
})();


/* ===================================================================== */
/* MAP — location registry + tilemap engine (CONTRACT §10)               */
/* ===================================================================== */
var World = (function () {

  var TILE  = 16;   // authored tile pixel size
  var SCALE = 2;    // integer upscale -> 32px tiles on the 800x600 canvas

  /* default blocking tile keys if a location omits `solid` */
  var DEFAULT_SOLID = ["water", "rock", "yurt", "yurt_stone",
                       "cave_wall", "tree", "tree_grey", "grave"];

  var registry = {};   // id -> normalized location object

  /* ---- live runtime state for the ACTIVE map ---------------------- */
  var active   = null;            // normalized location currently loaded
  var grid     = null;            // 2D array [y][x] of tile-key strings
  var solidSet = {};              // { tileKey: true } for fast collision lookup
  var npcs     = [];              // live NPC entities for the active map
  var exits    = [];              // live exit/portal descriptors

  /* player entity (tile + pixel position; pixel drives the camera) */
  var player = {
    x: 0, y: 0,                   // tile coords (integer-ish; pixel is source of truth)
    px: 0, py: 0,                 // pixel position (top-left of the tile-sized sprite cell)
    dir: "down",                  // facing: up/down/left/right
    moving: false,
    animT: 0,                     // walk-cycle timer (ms)
    speed: 96                     // pixels / second
  };

  var camX = 0, camY = 0;         // camera top-left in world pixels

  /* dombra "footprint trail" effect: transient glowing tracks revealed
     when the player plays the dombra in the overworld (design §4.1). */
  var trails = [];                // { wx, wy, life, max, kind }
  var trailPulse = 0;             // global pulse timer for glow shimmer

  /* ---------- helpers --------------------------------------------- */

  function _isStr(s) { return typeof s === "string" && s.length > 0; }

  /* Build a normalized 2D tile grid from either `tiles` (2D array) or
     `grid`+`legend` (string rows). `grid` wins if present (per contract). */
  function _buildGrid(loc) {
    var h = loc.h | 0, w = loc.w | 0;
    var out = [], y, x, row;

    if (Array.isArray(loc.grid) && loc.legend) {
      for (y = 0; y < h; y++) {
        var src = (typeof loc.grid[y] === "string") ? loc.grid[y] : "";
        row = [];
        for (x = 0; x < w; x++) {
          var ch = x < src.length ? src.charAt(x) : " ";
          var key = loc.legend[ch];
          row.push(_isStr(key) ? key : null);  // null = empty/transparent cell
        }
        out.push(row);
      }
      return out;
    }

    if (Array.isArray(loc.tiles)) {
      for (y = 0; y < h; y++) {
        var srcRow = Array.isArray(loc.tiles[y]) ? loc.tiles[y] : [];
        row = [];
        for (x = 0; x < w; x++) {
          var t = srcRow[x];
          row.push(_isStr(t) ? t : null);
        }
        out.push(row);
      }
      return out;
    }

    /* no tile data at all — produce an empty grey field so nothing throws */
    for (y = 0; y < h; y++) {
      row = [];
      for (x = 0; x < w; x++) row.push("grass_grey");
      out.push(row);
    }
    return out;
  }

  /* normalize a registered location into a stable internal shape */
  function _normalize(loc) {
    var n = {};
    n.id    = _isStr(loc.id) ? loc.id : ("loc_" + (Object.keys(registry).length));
    n.name  = _isStr(loc.name) ? loc.name : "";
    n.region = _isStr(loc.region) ? loc.region
             : (_isStr(loc.decayRegion) ? loc.decayRegion : n.id);
    n.decayRegion = _isStr(loc.decayRegion) ? loc.decayRegion : n.region;
    n.w = Math.max(1, loc.w | 0 || (Array.isArray(loc.grid) && loc.grid[0] ? loc.grid[0].length : 1));
    n.h = Math.max(1, loc.h | 0 || (Array.isArray(loc.grid) ? loc.grid.length :
                                   (Array.isArray(loc.tiles) ? loc.tiles.length : 1)));
    /* keep raw inputs for grid building */
    n.tiles = loc.tiles; n.grid = loc.grid; n.legend = loc.legend;
    n.solid = Array.isArray(loc.solid) ? loc.solid.slice() : DEFAULT_SOLID.slice();
    n.spawns = (loc.spawns && typeof loc.spawns === "object") ? loc.spawns : {};
    if (!n.spawns["default"]) {
      n.spawns["default"] = { x: clamp((n.w / 2) | 0, 0, n.w - 1),
                              y: clamp((n.h / 2) | 0, 0, n.h - 1) };
    }
    n.npcs  = Array.isArray(loc.npcs)  ? loc.npcs  : [];
    n.exits = Array.isArray(loc.exits) ? loc.exits : [];
    /* optional per-location music cue + ambient bg color */
    n.music = _isStr(loc.music) ? loc.music : null;
    n.bg    = _isStr(loc.bg) ? loc.bg : null;        // palette name for letterbox/void
    n.onEnter = (typeof loc.onEnter === "function") ? loc.onEnter : null;
    n.onExit  = (typeof loc.onExit === "function") ? loc.onExit : null;
    return n;
  }

  /* center camera on the player, clamped to map bounds (letterbox small maps) */
  function _updateCamera() {
    if (!active) return;
    var mapPxW = active.w * TILE * SCALE;
    var mapPxH = active.h * TILE * SCALE;
    var halfW = Engine.W / 2, halfH = Engine.H / 2;
    var cx = player.px + (TILE * SCALE) / 2;
    var cy = player.py + (TILE * SCALE) / 2;
    camX = cx - halfW;
    camY = cy - halfH;
    if (mapPxW <= Engine.W) camX = (mapPxW - Engine.W) / 2;   // center small maps
    else camX = clamp(camX, 0, mapPxW - Engine.W);
    if (mapPxH <= Engine.H) camY = (mapPxH - Engine.H) / 2;
    else camY = clamp(camY, 0, mapPxH - Engine.H);
  }

  /* tile at (tx,ty) or null if OOB / empty */
  function _tileAt(tx, ty) {
    if (!grid) return null;
    if (ty < 0 || ty >= grid.length) return null;
    var r = grid[ty];
    if (!r || tx < 0 || tx >= r.length) return null;
    return r[tx];
  }

  /* is the tile at (tx,ty) blocking? OOB counts as solid (walls of the world) */
  function _solidAt(tx, ty) {
    if (!active) return true;
    if (tx < 0 || ty < 0 || tx >= active.w || ty >= active.h) return true;
    var t = _tileAt(tx, ty);
    if (t == null) return false;          // empty cell is walkable
    return !!solidSet[t];
  }

  /* AABB-vs-tilegrid: can the player's tile-sized box occupy pixel (nx,ny)? */
  function _canStand(nx, ny) {
    var size = TILE * SCALE;
    var pad = 3 * SCALE;                  // small inset so corners feel fair
    var left   = nx + pad;
    var right  = nx + size - 1 - pad;
    var top    = ny + pad;
    var bottom = ny + size - 1 - pad;
    var cs = TILE * SCALE;
    var tlx = Math.floor(left / cs),  tly = Math.floor(top / cs);
    var trx = Math.floor(right / cs), bly = Math.floor(bottom / cs);
    if (_solidAt(tlx, tly)) return false;
    if (_solidAt(trx, tly)) return false;
    if (_solidAt(tlx, bly)) return false;
    if (_solidAt(trx, bly)) return false;
    return true;
  }

  /* tile in front of the player given facing (for interaction / exits) */
  function _frontTile() {
    var tx = Math.round(player.px / (TILE * SCALE));
    var ty = Math.round(player.py / (TILE * SCALE));
    if (player.dir === "up") ty -= 1;
    else if (player.dir === "down") ty += 1;
    else if (player.dir === "left") tx -= 1;
    else if (player.dir === "right") tx += 1;
    return { x: tx, y: ty };
  }

  /* find an NPC adjacent to (or under-front of) the player to interact with */
  function _npcInFront() {
    var ptx = Math.round(player.px / (TILE * SCALE));
    var pty = Math.round(player.py / (TILE * SCALE));
    var f = _frontTile();
    var best = null;
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (!n) continue;
      var dx = Math.abs(n.x - ptx), dy = Math.abs(n.y - pty);
      var adjacent = (dx + dy) === 1;                 // 4-neighbour
      var inFront = (n.x === f.x && n.y === f.y);
      if (inFront) return n;                          // facing it directly = best
      if (adjacent && !best) best = n;                // otherwise any neighbour
    }
    return best;
  }

  /* trigger an exit if the player's tile is an exit tile */
  function _checkExits() {
    var ptx = Math.round(player.px / (TILE * SCALE));
    var pty = Math.round(player.py / (TILE * SCALE));
    for (var i = 0; i < exits.length; i++) {
      var ex = exits[i];
      if (!ex) continue;
      if (ex.x === ptx && ex.y === pty) {
        _fireExit(ex);
        return true;
      }
    }
    return false;
  }

  function _fireExit(ex) {
    /* door sfx (guarded) */
    try { if (typeof Audio !== "undefined" && Audio.playCue) Audio.playCue("sfx_door"); } catch (e) {}
    /* custom handler wins if provided */
    if (typeof ex.onEnter === "function") {
      try { ex.onEnter(); } catch (e2) {}
      return;
    }
    var target = _isStr(ex.to) ? ex.to : null;
    var spawn  = _isStr(ex.toSpawn) ? ex.toSpawn : "default";
    if (!target) return;
    /* if the target is a registered MAP location, hot-swap the map in place
       (chapter exits typically map a tile to another map within one scene).
       Otherwise treat the target as a SCENE id and switch scenes. */
    if (registry[target]) {
      load(target, spawn);
    } else if (typeof setScene === "function") {
      setScene(target, { spawn: spawn });
    }
  }

  /* ---------- live NPC / exit binding on load --------------------- */
  function _bindEntities() {
    npcs = [];
    var i, src;
    for (i = 0; i < active.npcs.length; i++) {
      src = active.npcs[i];
      if (!src) continue;
      npcs.push({
        key: _isStr(src.key) ? src.key : null,
        x: src.x | 0,
        y: src.y | 0,
        name: _isStr(src.name) ? src.name : "",
        dir: _isStr(src.dir) ? src.dir : "down",
        onInteract: (typeof src.onInteract === "function") ? src.onInteract : null,
        bobT: Math.random() * 1000
      });
    }
    exits = [];
    for (i = 0; i < active.exits.length; i++) {
      src = active.exits[i];
      if (!src) continue;
      exits.push({
        x: src.x | 0, y: src.y | 0,
        to: _isStr(src.to) ? src.to : null,
        toSpawn: _isStr(src.toSpawn) ? src.toSpawn : "default",
        onEnter: (typeof src.onEnter === "function") ? src.onEnter : null
      });
    }
  }

  /* place the player at a named spawn (tile coords) */
  function _placeAtSpawn(spawnName) {
    var sp = active.spawns[spawnName] || active.spawns["default"];
    var tx = sp && typeof sp.x === "number" ? sp.x : 0;
    var ty = sp && typeof sp.y === "number" ? sp.y : 0;
    tx = clamp(tx | 0, 0, active.w - 1);
    ty = clamp(ty | 0, 0, active.h - 1);
    player.x = tx; player.y = ty;
    player.px = tx * TILE * SCALE;
    player.py = ty * TILE * SCALE;
    player.dir = (sp && _isStr(sp.dir)) ? sp.dir : "down";
    player.moving = false;
    player.animT = 0;
    _updateCamera();
  }

  /* ---------- rendering ------------------------------------------- */

  /* draw one tile through Sprites with decay tint (guarded). Falls back to a
     flat palette rect if Sprites is unavailable or the key is unknown-but-known
     here, so the world is never blank. */
  function _drawTile(c, key, sx, sy, amt) {
    if (key == null) return;
    var size = TILE * SCALE;
    if (typeof Sprites !== "undefined" && Sprites.draw && Sprites.has && Sprites.has(key)) {
      try {
        Sprites.draw(c, key, sx, sy, SCALE, { tint: { toName: "greySteppe", amt: amt } });
        return;
      } catch (e) { /* fall through to flat fill */ }
    }
    /* defensive flat fill: pick a sensible base color for known tile names */
    var base = _fallbackTileColor(key);
    var col = base;
    try { if (typeof lerpColor === "function") col = lerpColor(base, PALETTE.greySteppe, amt); } catch (e2) {}
    c.fillStyle = col;
    c.fillRect(sx, sy, size, size);
  }

  function _fallbackTileColor(key) {
    switch (key) {
      case "grass":      return PALETTE.grassLight;
      case "grass_grey": return PALETTE.deadGreen;
      case "water":      return PALETTE.waterLight;
      case "rock":       return PALETTE.caveStone;
      case "sand":       return PALETTE.boneGrey;
      case "yurt":       return PALETTE.yurtWhite;
      case "yurt_stone": return PALETTE.caveStone;
      case "cave_floor": return PALETTE.caveDark;
      case "cave_wall":  return PALETTE.caveStone;
      case "sky_white":  return PALETTE.skyWhite;
      case "campfire":   return PALETTE.caveFire;
      case "tree":       return PALETTE.leaf;
      case "tree_grey":  return PALETTE.deadGreen;
      case "grave":      return PALETTE.boneGrey;
      case "petroglyph": return PALETTE.earth;
      default:           return PALETTE.grassDark;
    }
  }

  function render(c) {
    if (!active || !grid) {
      c.fillStyle = "#000000";
      c.fillRect(0, 0, Engine.W, Engine.H);
      return;
    }
    _updateCamera();

    var amt = Decay.levelFor(active.region);
    var size = TILE * SCALE;

    /* background void (palette-named or black), greyed by decay */
    var bgName = active.bg || "night";
    var bgCol;
    try { bgCol = (PALETTE[bgName] || "#000000"); } catch (e) { bgCol = "#000000"; }
    c.fillStyle = bgCol;
    c.fillRect(0, 0, Engine.W, Engine.H);

    /* visible tile window (only draw what the camera shows) */
    var startTx = Math.floor(camX / size) - 1;
    var startTy = Math.floor(camY / size) - 1;
    var endTx = Math.ceil((camX + Engine.W) / size) + 1;
    var endTy = Math.ceil((camY + Engine.H) / size) + 1;
    startTx = clamp(startTx, 0, active.w);
    startTy = clamp(startTy, 0, active.h);
    endTx = clamp(endTx, 0, active.w);
    endTy = clamp(endTy, 0, active.h);

    var ty, tx;
    for (ty = startTy; ty < endTy; ty++) {
      for (tx = startTx; tx < endTx; tx++) {
        var key = _tileAt(tx, ty);
        if (key == null) continue;
        var sx = rint(tx * size - camX);
        var sy = rint(ty * size - camY);
        _drawTile(c, key, sx, sy, amt);
      }
    }

    /* dombra footprint trails (under entities) */
    _renderTrails(c);

    /* exit markers (subtle gold chevron on the floor so portals are findable) */
    for (var ei = 0; ei < exits.length; ei++) {
      var ex = exits[ei];
      var exX = rint(ex.x * size - camX);
      var exY = rint(ex.y * size - camY);
      if (exX < -size || exX > Engine.W || exY < -size || exY > Engine.H) continue;
      var blink = 0.35 + 0.25 * Math.sin(trailPulse / 260 + ex.x + ex.y);
      c.save();
      c.globalAlpha = blink;
      c.fillStyle = PALETTE.gold;
      var mxc = exX + size / 2;
      c.fillRect(mxc - 6, exY + size - 8, 12, 3);
      c.fillRect(mxc - 3, exY + size - 12, 6, 3);
      c.restore();
    }

    /* NPCs + player, sorted by world-y so lower sprites overlap higher ones */
    var drawList = [];
    var i, n;
    for (i = 0; i < npcs.length; i++) {
      n = npcs[i];
      drawList.push({ y: n.y, kind: "npc", ref: n });
    }
    drawList.push({ y: player.py / size, kind: "player", ref: player });
    drawList.sort(function (a, b) { return a.y - b.y; });

    for (i = 0; i < drawList.length; i++) {
      if (drawList[i].kind === "npc") _renderNpc(c, drawList[i].ref, size, amt);
      else _renderPlayer(c, size);
    }

    /* interaction hint: floating "Z" prompt over an interactable NPC */
    var target = _npcInFront();
    if (target && !(typeof Dialogue !== "undefined" && Dialogue.active)) {
      var hx = rint(target.x * size - camX) + size / 2;
      var hy = rint(target.y * size - camY) - 6;
      var pulse = 0.6 + 0.4 * Math.sin(trailPulse / 200);
      c.save();
      c.globalAlpha = pulse;
      drawText(c, "Z", hx, hy, { color: PALETTE.gold, size: 16, align: "center" });
      c.restore();
    }

    /* location name plate (top-left), faint */
    if (active.name) {
      c.save();
      c.globalAlpha = 0.85;
      drawText(c, active.name, 14, 26, { color: PALETTE.gold, size: 14, align: "left" });
      c.restore();
    }
  }

  function _spriteShadow(c, sx, sy, size) {
    c.save();
    c.globalAlpha = 0.28;
    c.fillStyle = PALETTE.shadow;
    var sw = size * 0.6;
    c.fillRect(sx + (size - sw) / 2, sy + size - 5, sw, 4);
    c.restore();
  }

  function _renderNpc(c, n, size, amt) {
    var sx = rint(n.x * size - camX);
    var sy = rint(n.y * size - camY);
    if (sx < -size || sx > Engine.W || sy < -size || sy > Engine.H) return;
    n.bobT += 16;
    var bob = Math.round(Math.sin(n.bobT / 600) * 1);
    _spriteShadow(c, sx, sy + bob, size);
    if (n.key && typeof Sprites !== "undefined" && Sprites.draw && Sprites.has && Sprites.has(n.key)) {
      try { Sprites.draw(c, n.key, sx, sy + bob, SCALE, {}); return; }
      catch (e) {}
    }
    /* fallback NPC marker so a missing sprite is visible but not a crash */
    c.fillStyle = PALETTE.feltRed;
    c.fillRect(sx + size * 0.25, sy + size * 0.15, size * 0.5, size * 0.7);
  }

  function _renderPlayer(c, size) {
    var sx = rint(player.px - camX);
    var sy = rint(player.py - camY);
    _spriteShadow(c, sx, sy, size);

    /* choose sprite: walk sheet while moving, idle otherwise; flip for left */
    var key = "erzhan";
    var frame = 0;
    var flip = false;
    if (player.moving) {
      if (typeof Sprites !== "undefined" && Sprites.has && Sprites.has("erzhan_walk")) {
        key = "erzhan_walk";
        frame = (Math.floor(player.animT / 140) % 2);
      }
    }
    if (player.dir === "left") flip = true;

    if (typeof Sprites !== "undefined" && Sprites.draw && Sprites.has && Sprites.has(key)) {
      try { Sprites.draw(c, key, sx, sy, SCALE, { frame: frame, flip: flip }); return; }
      catch (e) {}
    }
    /* fallback player marker */
    c.fillStyle = PALETTE.skyBlue;
    c.fillRect(sx + size * 0.25, sy + size * 0.12, size * 0.5, size * 0.76);
  }

  function _renderTrails(c) {
    if (trails.length === 0) return;
    var size = TILE * SCALE;
    c.save();
    for (var i = 0; i < trails.length; i++) {
      var t = trails[i];
      var a = clamp(t.life / t.max, 0, 1);
      var sx = rint(t.wx - camX);
      var sy = rint(t.wy - camY);
      var glow = 0.5 + 0.5 * Math.sin(trailPulse / 160 + i);
      c.globalAlpha = a * 0.7 * glow;
      c.fillStyle = PALETTE.gold;
      var r = 3 + a * 3;
      c.fillRect(sx - r / 2 + size / 2, sy - r / 2 + size / 2, r, r);
    }
    c.restore();
  }

  /* ---------- update ---------------------------------------------- */

  function update(dt) {
    if (!active) return;
    trailPulse += dt;

    /* age out trails */
    if (trails.length) {
      for (var i = trails.length - 1; i >= 0; i--) {
        trails[i].life -= dt;
        if (trails[i].life <= 0) trails.splice(i, 1);
      }
    }

    /* don't move the world while a dialogue is on screen */
    if (typeof Dialogue !== "undefined" && Dialogue.active) {
      player.moving = false;
      return;
    }

    var ix = 0, iy = 0;
    if (typeof Input !== "undefined" && Input.keys) {
      if (Input.keys.left)  ix -= 1;
      if (Input.keys.right) ix += 1;
      if (Input.keys.up)    iy -= 1;
      if (Input.keys.down)  iy += 1;
    }

    /* face direction (prefer horizontal for diagonal so flip reads cleanly) */
    if (ix < 0) player.dir = "left";
    else if (ix > 0) player.dir = "right";
    else if (iy < 0) player.dir = "up";
    else if (iy > 0) player.dir = "down";

    var moving = (ix !== 0 || iy !== 0);
    player.moving = moving;

    if (moving) {
      player.animT += dt;
      var step = player.speed * (dt / 1000) * SCALE;
      /* normalize diagonal so it isn't faster */
      if (ix !== 0 && iy !== 0) step *= 0.7071;

      /* move axis-separately so we slide along walls */
      var nx = player.px + ix * step;
      if (_canStand(nx, player.py)) player.px = nx;
      var ny = player.py + iy * step;
      if (_canStand(player.px, ny)) player.py = ny;

      /* keep the integer tile coords in sync (used by interaction/exits) */
      player.x = Math.round(player.px / (TILE * SCALE));
      player.y = Math.round(player.py / (TILE * SCALE));

      _updateCamera();
      _checkExits();
    } else {
      player.animT = 0;
    }

    /* Z near an NPC -> interact (poll the edge so it fires once) */
    if (typeof Input !== "undefined" && Input.pressed && Input.pressed("confirm")) {
      interact();
    }
  }

  /* explicit interaction: talk to the NPC in front / adjacent (if any) */
  function interact() {
    if (typeof Dialogue !== "undefined" && Dialogue.active) return false;
    var n = _npcInFront();
    if (n && n.onInteract) {
      try { n.onInteract(n); } catch (e) {}
      return true;
    }
    return false;
  }

  /* dombra in the overworld: reveal glowing "tracks" from the player outward
     toward exits & NPCs (design §4.1 "следы"), play the unfinished kui, and
     (the decay-slow is conveyed by the act of playing — Decay already freezes
     healed regions; here we surface the audiovisual). Guarded throughout. */
  function dombra() {
    if (!active) return;
    try { if (typeof Audio !== "undefined" && Audio.playCue) Audio.playCue("kui_erzhan_unfinished"); } catch (e) {}
    var size = TILE * SCALE;
    var ox = player.px, oy = player.py;
    var i, t;
    /* trail toward each exit */
    for (i = 0; i < exits.length; i++) {
      _emitTrailLine(ox, oy, exits[i].x * size, exits[i].y * size);
    }
    /* trail toward each NPC */
    for (i = 0; i < npcs.length; i++) {
      _emitTrailLine(ox, oy, npcs[i].x * size, npcs[i].y * size);
    }
    /* a small ring of sparks around the player even with no targets */
    for (i = 0; i < 8; i++) {
      var ang = (i / 8) * Math.PI * 2;
      trails.push({
        wx: ox + Math.cos(ang) * size * 0.8,
        wy: oy + Math.sin(ang) * size * 0.8,
        life: 1400, max: 1400
      });
    }
  }

  function _emitTrailLine(x0, y0, x1, y1) {
    var steps = 10;
    for (var s = 1; s <= steps; s++) {
      var f = s / steps;
      trails.push({
        wx: lerp(x0, x1, f),
        wy: lerp(y0, y1, f),
        life: 1600 + s * 60,
        max: 1600 + s * 60
      });
    }
  }

  /* ---------- public load ----------------------------------------- */

  function load(id, spawnName) {
    var loc = registry[id];
    if (!loc) return false;        // unknown id -> graceful no-op (no throw)
    /* let the previous map run its onExit hook */
    if (active && active.onExit) { try { active.onExit(); } catch (e) {} }

    active = loc;
    grid = _buildGrid(loc);
    solidSet = {};
    for (var i = 0; i < loc.solid.length; i++) {
      if (_isStr(loc.solid[i])) solidSet[loc.solid[i]] = true;
    }
    _bindEntities();
    _placeAtSpawn(_isStr(spawnName) ? spawnName : "default");
    trails = [];

    /* make sure this region is tracked by Decay so the world-rot timer and
       restoredPercent know about it (does not change its level) */
    if (typeof Decay !== "undefined" && Decay.levelFor) {
      Decay.levelFor(active.region);                       // touch (no-op read)
      if (Decay.seed && G && G.worldDecay && G.worldDecay[active.region] === undefined) {
        /* register the region into the round-robin without altering an
           author-seeded value: seed only if totally unknown, at 0 */
        Decay.seed(active.region, 0);
      }
    }

    /* optional location music (guarded) */
    if (active.music) {
      try { if (typeof Audio !== "undefined" && Audio.playCue) Audio.playCue(active.music); } catch (e2) {}
    }
    if (active.onEnter) { try { active.onEnter(); } catch (e3) {} }
    return true;
  }

  /* ---------- explore scene factory -------------------------------- */
  /* Returns a ready Scene object (enter/update/render/onKey) for a free-roam
     location. Chapter files register it directly, e.g.:
       Scenes.register("ch1_aul", World.makeExploreScene("aul_jetiqaz")); */
  function makeExploreScene(locId, opts) {
    opts = opts || {};
    var spawnDefault = _isStr(opts.spawn) ? opts.spawn : "default";
    return {
      _locId: locId,
      enter: function (params) {
        params = params || {};
        var sp = _isStr(params.spawn) ? params.spawn : spawnDefault;
        load(locId, sp);
        if (typeof opts.onEnter === "function") { try { opts.onEnter(params); } catch (e) {} }
      },
      exit: function () {
        if (typeof opts.onExit === "function") { try { opts.onExit(); } catch (e) {} }
      },
      update: function (dt) {
        /* drive any active dialogue first; otherwise the world */
        if (typeof Dialogue !== "undefined" && Dialogue.active) {
          if (Dialogue.update) { try { Dialogue.update(dt); } catch (e) {} }
          return;
        }
        update(dt);
        if (typeof opts.onUpdate === "function") { try { opts.onUpdate(dt); } catch (e2) {} }
      },
      render: function (c) {
        render(c);
        if (typeof opts.onRender === "function") { try { opts.onRender(c); } catch (e) {} }
        /* dialogue overlay on top of the world */
        if (typeof Dialogue !== "undefined" && Dialogue.active && Dialogue.render) {
          try { Dialogue.render(c); } catch (e2) {}
        }
        /* tiny control hint along the bottom (only when free-roaming) */
        if (!(typeof Dialogue !== "undefined" && Dialogue.active)) {
          c.save();
          c.globalAlpha = 0.5;
          drawText(c, "WASD — идти   Z — говорить   Space — домбра   X — меню",
            Engine.W / 2, Engine.H - 12,
            { color: PALETTE.boneGrey, size: 11, align: "center" });
          c.restore();
        }
      },
      onKey: function (e) {
        if (!e) return;
        /* dialogue consumes input while active */
        if (typeof Dialogue !== "undefined" && Dialogue.active) {
          if (Dialogue.onKey) { try { Dialogue.onKey(e); } catch (er) {} }
          return;
        }
        if (e.action === "confirm") {
          interact();
        } else if (e.action === "dombra") {
          dombra();
        }
        if (typeof opts.onKey === "function") { try { opts.onKey(e); } catch (er2) {} }
      }
    };
  }

  /* ---------- public API ------------------------------------------ */
  return {
    TILE: TILE,
    SCALE: SCALE,

    register: function (loc) {
      if (!loc || typeof loc !== "object") return null;
      var n = _normalize(loc);
      registry[n.id] = n;
      /* seed the decay region into the round-robin so the world-rot timer
         and restoredPercent know it exists (level untouched if already set).
         Top-level safe: only reads/writes G + Decay's local order list. */
      if (typeof Decay !== "undefined" && Decay.levelFor) {
        if (G && G.worldDecay && G.worldDecay[n.region] === undefined && Decay.seed) {
          Decay.seed(n.region, 0.8);   // dying-steppe default per DESIGN §1.2
        } else if (Decay.seed) {
          /* ensure tracked even if level already present */
          Decay.seed(n.region, Decay.levelFor(n.region));
        }
      }
      return n;
    },

    get: function (id) { return registry[id]; },
    has: function (id) { return !!registry[id]; },

    load: load,
    update: update,
    render: render,
    interact: interact,
    dombra: dombra,

    makeExploreScene: makeExploreScene,

    /* read-only-ish accessors for other modules / scenes */
    player: player,
    active: function () { return active; },
    camera: function () { return { x: camX, y: camY }; },
    tileAt: _tileAt,
    isSolidAt: _solidAt,
    npcs: function () { return npcs.slice(); },

    /* convert tile<->pixel for chapter code that wants to place things */
    tileToPx: function (tx, ty) { return { x: tx * TILE * SCALE, y: ty * TILE * SCALE }; },
    pxToTile: function (px, py) { return { x: Math.round(px / (TILE * SCALE)), y: Math.round(py / (TILE * SCALE)) }; }
  };
})();
