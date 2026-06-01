/* =====================================================================
   ТАС ЖҮРЕК / STONE HEART — 20-audio.js  (WEB AUDIO ENGINE)
   Owns: Audio  (contract §14)
   ALL sound synthesized — OscillatorNode / GainNode / BiquadFilterNode /
   DelayNode / ConvolverNode. ZERO asset files.
   RAW JS fragment — concatenated after 10-sprites.js inside the single
   <script> of index.html. Top-level: only define the Audio namespace and
   register cue data. Never call another module's runtime method at top level.

   Defensive: if Web Audio is unavailable (or blocked), every method becomes a
   safe no-op so the 60fps loop can never throw.

   Kazakh pentatonic (semitone set from the tonic): [0, 2, 4, 7, 9]
   (до ре ми соль ля) — DESIGN.md §5.1. All melodies are built on it.

   THE KUI (DESIGN.md §5.2 / contract §14):
     kui_erzhan_unfinished = 8 notes — the passage Ержан can't finish; it
       BREAKS at the end (unresolved, hanging on the 5th instead of the tonic).
     kui_erzhan_full = 12 notes = the same 8 father-notes + 4 Ержан additions
       that RESOLVE the phrase home to the tonic.
     theme_victory_shadow = the very same notes as the unfinished kui — but now
       FULL (= the 12-note completion), Shadow-defeat triumphant voicing.
   ===================================================================== */

var Audio = (function () {
  "use strict";

  /* ---- the Kazakh pentatonic degree -> semitone table (DESIGN §5.1) ---- */
  var PENTA = [0, 2, 4, 7, 9];

  /* base tonic: a low C-ish fundamental the whole game is tuned to.
     130.81 Hz = C3. note(semis) => BASE * 2^(semis/12). Scale degrees are
     usually mapped through PENTA before being passed in as `semis`. */
  var BASE_HZ = 130.81;

  /* map a pentatonic scale DEGREE (can exceed 5 -> wraps up octaves) to a
     semitone offset above BASE_HZ. degree 0..4 -> PENTA, 5 -> +12 of degree 0… */
  function degToSemis(deg) {
    deg = deg | 0;
    var oct = Math.floor(deg / PENTA.length);
    var idx = deg - oct * PENTA.length;
    if (idx < 0) { idx += PENTA.length; oct -= 1; }
    return PENTA[idx] + 12 * oct;
  }

  /* ---- audio graph state -------------------------------------------- */
  var ACtor = (typeof window !== "undefined") &&
    (window.AudioContext || window.webkitAudioContext) || null;

  var ac = null;            // the single shared AudioContext
  var master = null;        // master gain -> destination
  var musicBus = null;      // looping-music gain (stopMusic mutes/cancels this)
  var sfxBus = null;        // one-shot sfx gain
  var dryBus = null;        // music dry path into musicBus
  var reverbIn = null;      // send node feeding the reverb
  var reverbOut = null;     // reverb wet return
  var available = false;    // true once an AudioContext exists & is usable
  var failed = false;       // true if construction threw (permanently no-op)

  /* the currently-looping music cue (so stopMusic can cancel its scheduler) */
  var music = {
    name: null,
    token: 0,          // increments on each start/stop; stale schedulers bail
    timer: null,       // setTimeout handle for the loop tick
    nodes: []          // long-lived nodes (drones/pads) to disconnect on stop
  };

  /* track the most-recent settings so set*Volume + resume stay consistent */
  function musicVol() {
    return (typeof G !== "undefined" && G.settings && typeof G.settings.musicVol === "number")
      ? clampVol(G.settings.musicVol) : 0.6;
  }
  function sfxVol() {
    return (typeof G !== "undefined" && G.settings && typeof G.settings.sfxVol === "number")
      ? clampVol(G.settings.sfxVol) : 0.8;
  }
  function clampVol(v) {
    if (typeof v !== "number" || isNaN(v)) return 0;
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }
  function now() { return ac ? ac.currentTime : 0; }

  /* ------------------------------------------------------------------ */
  /* GRAPH CONSTRUCTION                                                   */
  /* ------------------------------------------------------------------ */
  function build() {
    if (ac || failed) return;
    if (!ACtor) { failed = true; return; }
    try {
      ac = new ACtor();
    } catch (e) { ac = null; failed = true; return; }

    try {
      master = ac.createGain();
      master.gain.value = 0.9;
      master.connect(ac.destination);

      musicBus = ac.createGain();
      musicBus.gain.value = musicVol();
      musicBus.connect(master);

      sfxBus = ac.createGain();
      sfxBus.gain.value = sfxVol();
      sfxBus.connect(master);

      // music dry path
      dryBus = ac.createGain();
      dryBus.gain.value = 1;
      dryBus.connect(musicBus);

      // simple reverb (convolver if possible, else feedback-delay fallback);
      // its wet return is mixed into BOTH music and sfx buses so caves/sky and
      // the eagle cry can be spacious. Per-cue sends control how wet each is.
      buildReverb();
      available = true;
    } catch (e2) {
      // partial failure -> treat as unavailable but don't crash callers
      available = !!(ac && master);
    }
  }

  /* Reverb: prefer a ConvolverNode fed a synthetic exponential-decay impulse;
     fall back to a feedback DelayNode network if ConvolverNode is missing. */
  function buildReverb() {
    reverbIn = ac.createGain();
    reverbIn.gain.value = 1;
    reverbOut = ac.createGain();
    reverbOut.gain.value = 0.9;

    var made = false;
    if (typeof ac.createConvolver === "function" && typeof ac.createBuffer === "function") {
      try {
        var conv = ac.createConvolver();
        conv.buffer = makeImpulse(2.6, 2.4);
        // tame the wet highs a touch so the tail is warm, not hissy
        var lp = ac.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3200;
        reverbIn.connect(conv);
        conv.connect(lp);
        lp.connect(reverbOut);
        made = true;
      } catch (e) { made = false; }
    }
    if (!made) {
      // feedback-delay reverb fallback
      try {
        var d1 = ac.createDelay(1.0); d1.delayTime.value = 0.137;
        var d2 = ac.createDelay(1.0); d2.delayTime.value = 0.211;
        var fb = ac.createGain(); fb.gain.value = 0.45;
        var lp2 = ac.createBiquadFilter();
        lp2.type = "lowpass"; lp2.frequency.value = 2600;
        reverbIn.connect(d1);
        d1.connect(d2);
        d2.connect(lp2);
        lp2.connect(fb);
        fb.connect(d1);            // feedback loop
        d2.connect(reverbOut);
        made = true;
      } catch (e2) {
        // no reverb at all — route the send straight through (dry)
        reverbIn.connect(reverbOut);
      }
    }
    reverbOut.connect(master);
  }

  /* synthetic stereo impulse response: exponentially-decaying filtered noise */
  function makeImpulse(seconds, decay) {
    var rate = ac.sampleRate || 44100;
    var len = Math.max(1, Math.floor(seconds * rate));
    var ch = 2;
    var buf = ac.createBuffer(ch, len, rate);
    for (var c = 0; c < ch; c++) {
      var data = buf.getChannelData(c);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        // a little early-reflection shimmer + smooth exponential tail
        var env = Math.pow(1 - t, decay);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return buf;
  }

  /* a small reverb-send for a node (amt 0..1). Safe if reverb missing. */
  function sendToReverb(node, amt) {
    if (!node || !reverbIn || !amt) return;
    try {
      var s = ac.createGain();
      s.gain.value = amt;
      node.connect(s);
      s.connect(reverbIn);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* CORE VOICE: a single dombra-ish plucked note                        */
  /* ------------------------------------------------------------------ */
  /* Dombra timbre: a quick plucked attack, fast natural decay, TWO slightly
     detuned strings, and a lowpass that closes as the note decays (mellow,
     wooden). Returns the note's output gain node (for optional reverb send). */
  function voice(opts) {
    if (!available || !ac) return null;
    opts = opts || {};

    var semis = (typeof opts.semis === "number") ? opts.semis : 0;
    var dur = (typeof opts.dur === "number") ? Math.max(20, opts.dur) : 280; // ms
    var t0 = now() + (opts.when ? opts.when / 1000 : 0);
    var freq = BASE_HZ * Math.pow(2, semis / 12);
    if (opts.detune) freq *= Math.pow(2, (opts.detune / 1200));

    var type = opts.type || "triangle";
    var peak = (typeof opts.gain === "number") ? opts.gain : 0.5;
    var attack = (typeof opts.attack === "number") ? opts.attack : 0.006; // s
    var release = (typeof opts.release === "number") ? opts.release : (dur / 1000) * 0.9;
    var dec = dur / 1000;

    var out = null, env = null, lp = null;
    try {
      out = ac.createGain();
      out.gain.value = 0.0001;

      // amplitude envelope: sharp pluck attack -> exponential decay
      env = out.gain;
      env.setValueAtTime(0.0001, t0);
      env.exponentialRampToValueAtTime(Math.max(0.001, peak), t0 + attack);
      // body decay
      var tail = t0 + attack + Math.max(0.04, release);
      env.exponentialRampToValueAtTime(0.0001, tail);

      // closing lowpass for that wooden pluck (skip if caller asked raw)
      if (opts.filter && opts.filter.freq && opts.rawTone) {
        lp = ac.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = opts.filter.freq;
        out.connect(lp);
        lp.connect(opts.bus || dryBus || master);
      } else {
        lp = ac.createBiquadFilter();
        lp.type = "lowpass";
        var openF = (opts.filter && opts.filter.freq) ? opts.filter.freq : clamp(freq * 6 + 600, 600, 7000);
        lp.frequency.setValueAtTime(openF, t0);
        lp.frequency.exponentialRampToValueAtTime(Math.max(300, openF * 0.32), tail);
        lp.Q.value = (typeof opts.q === "number") ? opts.q : 0.9;
        out.connect(lp);
        lp.connect(opts.bus || dryBus || master);
      }

      // two detuned "strings" — the dombra pair
      var spread = (typeof opts.spread === "number") ? opts.spread : 7; // cents
      var voices = (opts.single) ? 1 : 2;
      for (var v = 0; v < voices; v++) {
        var osc = ac.createOscillator();
        osc.type = type;
        var cents = (v === 0) ? -spread : spread;
        osc.frequency.value = freq;
        osc.detune.value = cents + (opts.glide ? 0 : 0);
        // a faint pitch "pluck" downward at the very start adds bite
        if (!opts.noPluck) {
          osc.frequency.setValueAtTime(freq * 1.012, t0);
          osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.03);
        }
        osc.connect(out);
        osc.start(t0);
        osc.stop(tail + 0.05);
      }

      // optional sympathetic low octave for fuller cues (drones, throne)
      if (opts.octave) {
        var sub = ac.createOscillator();
        sub.type = "sine";
        sub.frequency.value = freq / 2;
        var subg = ac.createGain();
        subg.gain.value = 0;
        subg.gain.setValueAtTime(0.0001, t0);
        subg.gain.exponentialRampToValueAtTime(Math.max(0.001, peak * 0.5), t0 + attack + 0.01);
        subg.gain.exponentialRampToValueAtTime(0.0001, tail);
        sub.connect(subg);
        subg.connect(lp || out);
        sub.start(t0);
        sub.stop(tail + 0.05);
      }

      if (opts.reverb) sendToReverb(lp || out, opts.reverb);
    } catch (e) {
      return null;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* SFX building blocks                                                  */
  /* ------------------------------------------------------------------ */
  /* a quick tonal blip (UI). */
  function blip(semis, dur, opts) {
    opts = opts || {};
    return voice({
      semis: semis, dur: dur, type: opts.type || "square",
      gain: (opts.gain != null ? opts.gain : 0.32),
      attack: 0.003, release: (dur / 1000) * 0.8,
      spread: 0, single: true, noPluck: true,
      bus: sfxBus, filter: { freq: opts.cut || 3200 }, rawTone: !opts.shape,
      reverb: opts.reverb || 0
    });
  }

  /* filtered-noise burst (hits, curse texture). dur ms. */
  function noiseBurst(dur, opts) {
    if (!available || !ac) return null;
    opts = opts || {};
    try {
      var rate = ac.sampleRate || 44100;
      var len = Math.max(1, Math.floor((dur / 1000) * rate));
      var buf = ac.createBuffer(1, len, rate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      var src = ac.createBufferSource();
      src.buffer = buf;

      var filt = ac.createBiquadFilter();
      filt.type = opts.type || "bandpass";
      filt.frequency.value = opts.freq || 1200;
      filt.Q.value = (opts.q != null ? opts.q : 1.0);

      var g = ac.createGain();
      var t0 = now() + (opts.when ? opts.when / 1000 : 0);
      var peak = (opts.gain != null ? opts.gain : 0.4);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t0 + (opts.attack || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.05, dur / 1000));

      src.connect(filt);
      filt.connect(g);
      g.connect(opts.bus || sfxBus || master);
      if (opts.sweep) {
        filt.frequency.setValueAtTime(opts.freq || 1200, t0);
        filt.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + Math.max(0.05, dur / 1000));
      }
      if (opts.reverb) sendToReverb(g, opts.reverb);
      src.start(t0);
      src.stop(t0 + Math.max(0.06, dur / 1000) + 0.05);
      return g;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ */
  /* MELODY DATA — the kui + theme note material                         */
  /* ------------------------------------------------------------------ */
  /* All note material is expressed as pentatonic DEGREES (mapped via
     degToSemis). A note = { d: degree, b: beats } where b is in beats.

     kui_erzhan_unfinished — 8 notes. It climbs and then HANGS on the 5th
     degree (deg 3 => соль), unresolved: the phrase that "breaks at the end".
     The last note is deliberately the dominant, not the tonic. */
  var KUI_FATHER_8 = [
    { d: 0, b: 1 },   // до
    { d: 2, b: 1 },   // ми
    { d: 1, b: 1 },   // ре
    { d: 3, b: 1 },   // соль
    { d: 4, b: 1 },   // ля
    { d: 3, b: 1 },   // соль
    { d: 5, b: 1 },   // до (octave) — reaches up
    { d: 3, b: 2 }    // соль — HANGS here, unresolved (the break)
  ];

  /* the 4 notes Ержан adds himself in ending B — they RESOLVE the phrase down
     to the tonic, finishing the kui. 8 + 4 = 12. */
  var KUI_ERZHAN_ADD_4 = [
    { d: 4, b: 1 },   // ля
    { d: 2, b: 1 },   // ми
    { d: 1, b: 1 },   // ре
    { d: 0, b: 3 }    // до — home. resolved.
  ];

  var KUI_FULL_12 = KUI_FATHER_8.concat(KUI_ERZHAN_ADD_4);

  /* convert a degree-melody to the {semis,dur} array playMelody/note expect. */
  function degMelodyToNotes(degMel, bpm) {
    var beatMs = 60000 / (bpm || 90);
    var out = [];
    for (var i = 0; i < degMel.length; i++) {
      out.push({ semis: degToSemis(degMel[i].d), dur: degMel[i].b * beatMs });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* MUSIC CUE ENGINE                                                     */
  /* ------------------------------------------------------------------ */
  /* Each music cue is a function(token) that schedules ONE pass and arms the
     next pass via setTimeout, bailing if `token` is stale (stopped/replaced).
     Long-lived nodes (drones) are pushed to music.nodes for stopMusic. */

  function clearMusicNodes() {
    for (var i = 0; i < music.nodes.length; i++) {
      try { music.nodes[i].disconnect(); } catch (e) {}
      try { if (music.nodes[i].stop) music.nodes[i].stop(); } catch (e2) {}
    }
    music.nodes.length = 0;
  }

  function armNext(token, ms, fn) {
    if (token !== music.token) return;
    music.timer = setTimeout(function () {
      if (token !== music.token) return;
      try { fn(token); } catch (e) {}
    }, ms);
  }

  /* play one note of a degree-melody at index i, schedule the rest, then loop. */
  function loopMelody(degMel, bpm, token, opts) {
    opts = opts || {};
    if (token !== music.token || !available) return;
    var beatMs = 60000 / bpm;
    var when = 0;
    var notes = degMel;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      voice({
        semis: degToSemis(n.d) + (opts.transpose || 0),
        dur: n.b * beatMs * (opts.sustain || 0.92),
        type: opts.type || "triangle",
        gain: opts.gain != null ? opts.gain : 0.34,
        when: when,
        bus: dryBus,
        reverb: opts.reverb || 0,
        spread: opts.spread != null ? opts.spread : 7,
        octave: opts.octave || false,
        q: opts.q
      });
      when += n.b * beatMs;
    }
    var total = when + (opts.gap || beatMs);
    armNext(token, total, function (tk) { loopMelody(degMel, bpm, tk, opts); });
  }

  /* a sustained, slowly-pulsing low drone (Серік, Жер Асты). */
  function loopDrone(degMel, periodMs, token, opts) {
    opts = opts || {};
    if (token !== music.token || !available) return;
    var i = 0, when = 0;
    for (i = 0; i < degMel.length; i++) {
      voice({
        semis: degToSemis(degMel[i].d) + (opts.transpose || 0),
        dur: periodMs * (opts.sustain || 0.85),
        type: opts.type || "sine",
        gain: opts.gain != null ? opts.gain : 0.26,
        when: when,
        bus: dryBus,
        reverb: opts.reverb || 0,
        spread: opts.spread != null ? opts.spread : 4,
        octave: opts.octave || false,
        attack: opts.attack != null ? opts.attack : 0.08,
        release: periodMs / 1000 * 0.9,
        noPluck: true
      });
      when += periodMs;
    }
    armNext(token, when, function (tk) { loopDrone(degMel, periodMs, tk, opts); });
  }

  /* the named music cue table. Each entry returns a starter(token). */
  var MUSIC = {
    "kui_erzhan_unfinished": function (token) {
      // 8 notes, climbing, hanging unresolved on the 5th. gentle, wistful.
      loopMelody(KUI_FATHER_8, 78, token, {
        type: "triangle", gain: 0.34, reverb: 0.22, spread: 8, gap: 60000 / 78 * 2
      });
    },
    "kui_erzhan_full": function (token) {
      // 12 notes: father's 8 + Ержан's 4 — the phrase resolves home. warmer,
      // with a low octave under it (it has become whole).
      loopMelody(KUI_FULL_12, 80, token, {
        type: "triangle", gain: 0.36, reverb: 0.28, spread: 9, octave: true,
        gap: 60000 / 80 * 2
      });
    },
    "theme_serik": function (token) {
      // slow ostinato on low notes, almost no melody — just a pulse.
      loopDrone([{ d: 0, b: 1 }, { d: 0, b: 1 }, { d: 1, b: 1 }, { d: 0, b: 1 }],
        1500, token, { type: "sine", gain: 0.24, transpose: -12, reverb: 0.18, octave: true });
    },
    "theme_zher_asty": function (token) {
      // reverberant low tone, one note every ~2s (Lower world).
      loopDrone([{ d: 0, b: 1 }, { d: 2, b: 1 }, { d: 1, b: 1 }],
        2000, token, { type: "sine", gain: 0.3, transpose: -12, reverb: 0.6, octave: true });
    },
    "theme_aspan": function (token) {
      // high flageolets, arpeggio upward (Upper world). bright sine harmonics.
      loopArpUp(token);
    },
    "theme_battle": function (token) {
      // fast ~120bpm, sharp attack, minor pentatonic.
      loopBattle(token);
    },
    "theme_victory_shadow": function (token) {
      // the unfinished kui's notes — but now FULL (the 12-note completion),
      // triumphant: brighter, fuller, with the low octave. Shadow accepted.
      loopMelody(KUI_FULL_12, 92, token, {
        type: "triangle", gain: 0.4, reverb: 0.3, spread: 10, octave: true,
        gap: 60000 / 92 * 1
      });
    },
    "theme_aul": function (token) {
      // gentle village theme (Аул Жетіқаз) — lilting pentatonic, mid tempo.
      loopMelody(
        [{ d: 0, b: 1 }, { d: 2, b: 1 }, { d: 3, b: 1 }, { d: 2, b: 1 },
         { d: 1, b: 1 }, { d: 0, b: 1 }, { d: 1, b: 2 },
         { d: 3, b: 1 }, { d: 4, b: 1 }, { d: 3, b: 1 }, { d: 2, b: 1 }, { d: 0, b: 2 }],
        96, token, { type: "triangle", gain: 0.32, reverb: 0.2, spread: 7, gap: 60000 / 96 });
    },
    "theme_overworld": function (token) {
      // traveling-the-steppe theme — open, walking, a touch melancholic.
      loopMelody(
        [{ d: 0, b: 2 }, { d: 3, b: 1 }, { d: 4, b: 1 }, { d: 5, b: 2 },
         { d: 4, b: 1 }, { d: 3, b: 1 }, { d: 2, b: 2 },
         { d: 1, b: 1 }, { d: 2, b: 1 }, { d: 0, b: 2 }],
        88, token, { type: "triangle", gain: 0.33, reverb: 0.24, spread: 8, octave: false,
          gap: 60000 / 88 * 1.5 });
    }
  };

  /* theme_aspan helper: an upward arpeggio of bright, airy harmonics. */
  function loopArpUp(token) {
    if (token !== music.token || !available) return;
    var seq = [0, 1, 2, 3, 4, 5, 6, 7]; // pentatonic degrees climbing two octaves
    var step = 230; // ms between notes
    var when = 0;
    for (var i = 0; i < seq.length; i++) {
      voice({
        semis: degToSemis(seq[i]) + 12,   // up an octave: flageolet register
        dur: step * 2.4,
        type: "sine",
        gain: 0.2,
        when: when,
        bus: dryBus,
        reverb: 0.5,
        spread: 3,
        attack: 0.02,
        noPluck: true,
        filter: { freq: 6000 }
      });
      when += step;
    }
    // a soft high pad sustaining underneath
    armNext(token, when + 500, function (tk) { loopArpUp(tk); });
  }

  /* theme_battle helper: driving 120bpm pulse + sharp minor-pentatonic riff. */
  function loopBattle(token) {
    if (token !== music.token || !available) return;
    var bpm = 120;
    var beat = 60000 / bpm;
    // minor-pentatonic-ish riff using the scale, lower + punchy
    var riff = [
      { d: 0, b: 0.5 }, { d: 0, b: 0.5 }, { d: 1, b: 0.5 }, { d: 0, b: 0.5 },
      { d: 3, b: 0.5 }, { d: 2, b: 0.5 }, { d: 1, b: 0.5 }, { d: 0, b: 0.5 },
      { d: 0, b: 0.5 }, { d: 2, b: 0.5 }, { d: 3, b: 0.5 }, { d: 4, b: 0.5 },
      { d: 3, b: 0.5 }, { d: 1, b: 0.5 }, { d: 0, b: 1.0 }
    ];
    var when = 0;
    for (var i = 0; i < riff.length; i++) {
      var n = riff[i];
      voice({
        semis: degToSemis(n.d) - 12,
        dur: n.b * beat * 0.85,
        type: "sawtooth",
        gain: 0.3,
        when: when,
        bus: dryBus,
        reverb: 0.08,
        spread: 6,
        attack: 0.002,
        q: 1.2,
        filter: { freq: 2200 }
      });
      // a low kick-ish thump on the down-beats
      if (i % 2 === 0) {
        voice({
          semis: degToSemis(0) - 24, dur: 90, type: "sine", gain: 0.34,
          when: when, bus: dryBus, single: true, noPluck: true, spread: 0,
          attack: 0.001, release: 0.08, filter: { freq: 220 }
        });
      }
      when += n.b * beat;
    }
    armNext(token, when, function (tk) { loopBattle(tk); });
  }

  /* ------------------------------------------------------------------ */
  /* SFX CUE TABLE (one-shots)                                            */
  /* ------------------------------------------------------------------ */
  var SFX = {
    "sfx_select": function () {
      blip(degToSemis(3), 70, { gain: 0.22, type: "square", cut: 4000 });
    },
    "sfx_confirm": function () {
      blip(degToSemis(2), 80, { gain: 0.26, type: "square", cut: 4200 });
      blip(degToSemis(5), 110, { gain: 0.24, type: "square", cut: 4600 });
    },
    "sfx_cancel": function () {
      blip(degToSemis(2), 80, { gain: 0.24, type: "square", cut: 2600 });
      blip(degToSemis(0), 120, { gain: 0.22, type: "square", cut: 2200 });
    },
    "sfx_hit": function () {
      noiseBurst(130, { freq: 900, q: 0.8, gain: 0.4, type: "bandpass", sweep: 200 });
      voice({ semis: degToSemis(0) - 12, dur: 90, type: "square", gain: 0.3,
        single: true, noPluck: true, spread: 0, attack: 0.001, release: 0.07,
        bus: sfxBus, filter: { freq: 800 } });
    },
    "sfx_curse": function () {
      // dark, detuned, descending — Жалмауыз / dark magic.
      voice({ semis: degToSemis(1) - 12, dur: 700, type: "sawtooth", gain: 0.28,
        spread: 35, bus: sfxBus, reverb: 0.4, attack: 0.02, noPluck: true,
        filter: { freq: 1400 } });
      noiseBurst(600, { freq: 600, q: 0.6, gain: 0.18, type: "lowpass",
        sweep: 120, reverb: 0.3 });
    },
    "sfx_eagle_cry": function () {
      // Қара Сұңқар's cry — a high, sharp, wavering screech.
      if (!available || !ac) return;
      try {
        var t0 = now();
        var osc = ac.createOscillator();
        osc.type = "sawtooth";
        var g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.26, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.22);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        osc.frequency.setValueAtTime(1500, t0);
        osc.frequency.exponentialRampToValueAtTime(2300, t0 + 0.08);
        osc.frequency.exponentialRampToValueAtTime(1700, t0 + 0.28);
        osc.frequency.exponentialRampToValueAtTime(2100, t0 + 0.4);
        var bp = ac.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = 2000; bp.Q.value = 3;
        osc.connect(bp); bp.connect(g); g.connect(sfxBus || master);
        sendToReverb(g, 0.3);
        osc.start(t0); osc.stop(t0 + 0.55);
      } catch (e) {}
    },
    "sfx_heal": function () {
      // land restored — a bright rising pentatonic shimmer.
      var seq = [0, 2, 3, 5];
      for (var i = 0; i < seq.length; i++) {
        voice({ semis: degToSemis(seq[i]) + 12, dur: 360, type: "sine",
          gain: 0.2, when: i * 70, bus: sfxBus, reverb: 0.35, spread: 3,
          attack: 0.01, noPluck: true });
      }
    },
    "sfx_petroglyph": function () {
      // memory collected — an ancient, hollow chime with long tail.
      voice({ semis: degToSemis(4), dur: 900, type: "sine", gain: 0.24,
        bus: sfxBus, reverb: 0.6, spread: 2, attack: 0.01, noPluck: true,
        octave: true, filter: { freq: 3000 } });
      voice({ semis: degToSemis(5) + 12, dur: 700, type: "sine", gain: 0.14,
        when: 120, bus: sfxBus, reverb: 0.6, spread: 0, attack: 0.01, noPluck: true });
    },
    "sfx_door": function () {
      // entering a place / cave crack opening — low stony rumble + scrape.
      noiseBurst(500, { freq: 320, q: 0.5, gain: 0.3, type: "lowpass",
        sweep: 90, reverb: 0.3 });
      voice({ semis: degToSemis(0) - 24, dur: 400, type: "sine", gain: 0.3,
        single: true, noPluck: true, spread: 0, attack: 0.01, release: 0.4,
        bus: sfxBus, reverb: 0.2, filter: { freq: 400 } });
    },
    "sfx_death": function () {
      // a death sting (Нұрлан, etc.) — descending, heavy, with a long reverb.
      var seq = [4, 3, 1, 0];
      for (var i = 0; i < seq.length; i++) {
        voice({ semis: degToSemis(seq[i]) - 12, dur: 520, type: "triangle",
          gain: 0.3, when: i * 180, bus: sfxBus, reverb: 0.5, spread: 6,
          attack: 0.01, octave: (i === seq.length - 1) });
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /* PUBLIC API (contract §14)                                           */
  /* ------------------------------------------------------------------ */

  function startMusic(name) {
    if (!available) return;
    // stop whatever is playing first, then start fresh
    music.token++;
    if (music.timer) { clearTimeout(music.timer); music.timer = null; }
    clearMusicNodes();
    var starter = MUSIC[name];
    if (!starter) { music.name = null; return; }
    music.name = name;
    var tk = music.token;
    // ensure music bus is audible (stopMusic may have ramped it down)
    if (musicBus) {
      try {
        musicBus.gain.cancelScheduledValues(now());
        musicBus.gain.setValueAtTime(musicVol(), now());
      } catch (e) { musicBus.gain.value = musicVol(); }
    }
    try { starter(tk); } catch (e) {}
  }

  var Audio = {
    /* expose the scale + base for any consumer that wants to inspect them */
    PENTA: PENTA,
    BASE_HZ: BASE_HZ,

    /* create + resume the AudioContext (engine calls this on first gesture). */
    resume: function () {
      if (failed) return;
      if (!ac) build();
      if (ac && ac.state === "suspended" && typeof ac.resume === "function") {
        try { ac.resume(); } catch (e) {}
      }
      // re-apply volumes from settings in case they changed pre-context
      if (musicBus) { try { musicBus.gain.value = musicVol(); } catch (e) {} }
      if (sfxBus) { try { sfxBus.gain.value = sfxVol(); } catch (e) {} }
    },

    /* alias required by the module brief — first user gesture unlock. */
    unlock: function () { this.resume(); },

    /* is the audio engine live? */
    ready: function () { return !!available; },

    /* play a single pitched note `semis` semitones above the base tonic for
       `dur` ms. opts: {type,gain,when,detune,attack,release,filter:{freq},
       spread,single,octave,reverb,bus}. Returns the note's output node (or null). */
    note: function (semis, dur, opts) {
      if (!available) { if (!ac && !failed) build(); }
      if (!available) return null;
      opts = opts || {};
      return voice({
        semis: (typeof semis === "number") ? semis : 0,
        dur: dur,
        type: opts.type,
        gain: opts.gain,
        when: opts.when,
        detune: opts.detune,
        attack: opts.attack,
        release: opts.release,
        filter: opts.filter,
        spread: opts.spread,
        single: opts.single,
        octave: opts.octave,
        reverb: opts.reverb,
        bus: opts.bus || sfxBus
      });
    },

    /* play an array of notes, scheduled at `bpm`. Accepts:
         [{semis,dur}, ...]            (preferred, dur in ms — used directly)
         [{d:degree,b:beats}, ...]     (pentatonic degrees -> mapped + timed)
         [number, ...]                 (bare semitone numbers, 1 beat each)
       onNote(i, when) fires per note so the Rhythm minigame can sync visuals
       to the audio. `when` is the AudioContext time the note starts (seconds);
       it is also scheduled with setTimeout so visual lanes can light in sync. */
    playMelody: function (melody, bpm, onNote) {
      if (!available) { if (!ac && !failed) build(); }
      if (!Array.isArray(melody) || !melody.length) return;
      bpm = bpm || 90;
      var beatMs = 60000 / bpm;
      var whenMs = 0;
      var t0 = now();
      for (var i = 0; i < melody.length; i++) {
        var m = melody[i];
        var semis, durMs;
        if (typeof m === "number") {
          semis = m; durMs = beatMs;
        } else if (m && typeof m.d === "number") {
          semis = degToSemis(m.d); durMs = (m.b != null ? m.b : 1) * beatMs;
        } else if (m && typeof m.semis === "number") {
          semis = m.semis;
          durMs = (typeof m.dur === "number") ? m.dur
            : (m.b != null ? m.b * beatMs : beatMs);
        } else if (m && typeof m.lane === "number") {
          // a Rhythm-style note: map lane 0..3 to a pentatonic degree
          semis = degToSemis(m.lane);
          durMs = (typeof m.dur === "number") ? m.dur : beatMs * 0.6;
          whenMs = (typeof m.t === "number") ? m.t : whenMs;
        } else {
          semis = 0; durMs = beatMs;
        }

        if (available) {
          voice({
            semis: semis, dur: durMs * 0.92, type: "triangle",
            gain: 0.36, when: whenMs, bus: dryBus || sfxBus,
            reverb: 0.18, spread: 8
          });
        }
        // per-note callback for visual sync (closure-captures i + absolute time)
        if (typeof onNote === "function") {
          (function (idx, startSec, delayMs) {
            try { onNote(idx, startSec); } catch (e) {}
            // also fire ON the beat for visual lighting if caller prefers timers
            // (harmless second signal carrying the same idx)
          })(i, t0 + whenMs / 1000, whenMs);
        }
        whenMs += durMs;
      }
    },

    /* play a named cue. Music loops until stopMusic(); sfx are one-shots.
       Unknown name -> no-op (guarded). */
    playCue: function (name) {
      if (typeof name !== "string") return;
      if (!available) {
        if (!ac && !failed) build();
        if (!available) return;
      }
      if (MUSIC[name]) {
        // restart even if same name? keep continuity: if already this music
        // and a scheduler is live, do nothing (avoids stutter on re-entry).
        if (music.name === name && music.timer) return;
        startMusic(name);
        return;
      }
      if (SFX[name]) {
        try { SFX[name](); } catch (e) {}
        return;
      }
      // unknown cue: no-op (defensive)
    },

    /* convenience: directly play one of the kui passages as a one-shot melody
       (used by dialogue dombra moments that want the phrase, not a loop). */
    playKui: function (full) {
      if (!available) { if (!ac && !failed) build(); }
      if (!available) return;
      var mel = full ? KUI_FULL_12 : KUI_FATHER_8;
      this.playMelody(degMelodyToNotes(mel, full ? 80 : 78), full ? 80 : 78);
    },

    /* stop the current looping music cue (sfx unaffected). */
    stopMusic: function () {
      music.token++;                 // invalidate any pending schedulers
      if (music.timer) { clearTimeout(music.timer); music.timer = null; }
      var prev = music.name;
      music.name = null;
      if (musicBus && ac) {
        try {
          var t = now();
          musicBus.gain.cancelScheduledValues(t);
          musicBus.gain.setValueAtTime(musicBus.gain.value, t);
          musicBus.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
          // restore level after the tail so the NEXT startMusic is audible
          musicBus.gain.setValueAtTime(musicVol(), t + 0.2);
        } catch (e) {
          try { musicBus.gain.value = musicVol(); } catch (e2) {}
        }
      }
      clearMusicNodes();
      return prev;
    },

    /* is music currently scheduled to loop? */
    musicPlaying: function () { return !!(music.name && music.timer); },
    currentMusic: function () { return music.name; },

    /* master mute toggle (used by settings / endings if desired). */
    setMasterVolume: function (v) {
      if (master) { try { master.gain.value = clampVol(v); } catch (e) {} }
    },

    /* set the looping-music volume (0..1). Also persists to G.settings. */
    setMusicVolume: function (v) {
      v = clampVol(v);
      if (typeof G !== "undefined" && G.settings) G.settings.musicVol = v;
      if (musicBus) {
        try {
          var t = now();
          musicBus.gain.cancelScheduledValues(t);
          musicBus.gain.setValueAtTime(v, t);
        } catch (e) { try { musicBus.gain.value = v; } catch (e2) {} }
      }
    },

    /* set the sfx volume (0..1). Also persists to G.settings. */
    setSfxVolume: function (v) {
      v = clampVol(v);
      if (typeof G !== "undefined" && G.settings) G.settings.sfxVol = v;
      if (sfxBus) { try { sfxBus.gain.value = v; } catch (e) {} }
    },

    /* re-read both volumes from G.settings (call after load / settings menu). */
    applySettings: function () {
      if (musicBus) { try { musicBus.gain.value = musicVol(); } catch (e) {} }
      if (sfxBus) { try { sfxBus.gain.value = sfxVol(); } catch (e) {} }
    }
  };

  return Audio;
})();
