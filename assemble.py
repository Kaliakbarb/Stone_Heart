#!/usr/bin/env python3
"""Assemble the Tas Zhurek modules (build/*.js) into a single index.html in load order."""
import os, sys

ROOT = "/Users/kaliakbar/Desktop/tas-zhurek"
BUILD = os.path.join(ROOT, "build")
ORDER = [
    "00-engine.js", "10-sprites.js", "20-audio.js", "30-map.js",
    "40-dialogue.js", "50-battle.js", "60-memory.js", "70-ui.js",
    "80-ch1-2.js", "81-ch3-4.js", "82-ch5-6.js", "83-ch7-8.js",
]

HEAD = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ТАС ЖҮРЕК — Stone Heart</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' fill='%230E0F1A'/><path d='M8 3l4 3v4l-4 3-4-3V6z' fill='%23C8960C'/></svg>">
<style>
  html, body { margin: 0; height: 100%; background: #0E0F1A; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  #game {
    image-rendering: pixelated; image-rendering: crisp-edges;
    background: #0E0F1A; box-shadow: 0 0 60px rgba(0,0,0,0.9);
    max-width: 100vw; max-height: 100vh;
  }
</style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
"use strict";
"""

TAIL = """
</script>
</body>
</html>
"""

def main():
    parts = [HEAD]
    missing, present, total_lines = [], [], 0
    for name in ORDER:
        path = os.path.join(BUILD, name)
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            missing.append(name)
            parts.append("\n/* ===== %s : MISSING ===== */\n" % name)
            continue
        with open(path, "r", encoding="utf-8") as f:
            code = f.read()
        lines = code.count("\n") + 1
        total_lines += lines
        present.append((name, lines, os.path.getsize(path)))
        parts.append("\n/* ============================================================ */\n"
                     "/* ===== %s (%d lines) ===== */\n"
                     "/* ============================================================ */\n" % (name, lines))
        parts.append(code)
        if not code.endswith("\n"):
            parts.append("\n")
    parts.append(TAIL)

    out = os.path.join(ROOT, "index.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write("".join(parts))

    print("Assembled -> %s" % out)
    print("Total JS lines: %d   |   index.html bytes: %d" % (total_lines, os.path.getsize(out)))
    print("\nPresent modules:")
    for name, lines, size in present:
        print("  %-16s %5d lines  %7d B" % (name, lines, size))
    if missing:
        print("\n!!! MISSING modules (%d): %s" % (len(missing), ", ".join(missing)))
        sys.exit(2)
    print("\nAll %d modules present." % len(ORDER))

if __name__ == "__main__":
    main()
