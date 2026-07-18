# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris in vanilla JavaScript on HTML5 Canvas. No dependencies, no `package.json`, no bundler, no transpiler, no tests, no lint config. Three source files: `index.html`, `style.css`, `game.js`.

## Running

Open `index.html` directly (`start index.html` on Windows), or serve statically:

```bash
python3 -m http.server 8000   # or: npx serve .
```

There is no build step and no test suite — verification means loading the page in a browser and playing.

## Architecture (`game.js`)

Single global script (`'use strict'`, no modules). All state lives in module-level `let` bindings (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `dropAccum`, `animId`); `init()` resets every one of them and is also the restart-button handler.

Key coupling to keep in mind when editing:

- **Piece type index doubles as color index.** `PIECES[n]` is a square matrix whose non-zero cells all hold the value `n`, and `COLORS[n]` is that piece's color. Both arrays start with a `null` at index 0 so index 0 means "empty cell". Adding or reordering a piece requires keeping `PIECES`, `COLORS`, the cell values inside the matrix, and the `Math.floor(Math.random() * 7) + 1` in `randomPiece()` in sync.
- **Board cells store the color index**, not a piece object — `merge()` writes `current.shape[r][c]` straight into `board`.
- **Rotation has no SRS kick table.** `rotateCW()` transposes+reverses; `tryRotate()` retries the rotated shape at x-offsets `[0, -1, 1, -2, 2]` and silently drops the rotation if all collide.
- **Canvas dimensions are hardcoded in `index.html`.** `<canvas id="board">` is `300 × 600`, which must equal `COLS * BLOCK` × `ROWS * BLOCK`. Changing `COLS`, `ROWS`, or `BLOCK` in `game.js` requires editing the HTML attributes too. Likewise `#next-canvas` is `120 × 120` and `drawNext()` centers the piece inside a fixed 4×4 grid of 30px blocks.
- **Game loop** (`loop`) is `requestAnimationFrame`-driven, accumulating `dt` into `dropAccum` and stepping one row when it exceeds `dropInterval`. Pause cancels the frame and resets `lastTime` on resume, so paused time does not count toward the drop.
- **Level/speed**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms. Line score = `LINE_SCORES[cleared] * level`; hard drop adds 2/cell, soft drop 1/row.
- **Ghost piece** reuses `ghostY()`, which is also what `hardDrop()` uses to find the landing row.

## UI text

User-facing strings (README, HTML labels, overlay text) are in Spanish. Keep new user-facing text in Spanish; code identifiers and comments are English.
