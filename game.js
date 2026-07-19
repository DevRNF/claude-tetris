'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - blue
  '#ffb74d', // L - orange
  '#b0bec5', // nut - steel
  null,      // HOLE - no color, drawn as a hollow ring
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,9,8],[8,8,8]],                  // tuerca (nut)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// El hueco de la tuerca: cuenta como celda ocupada en collide()/clearLines() —
// nada puede entrar nunca en él — pero se dibuja como un anillo vacío.
const HOLE = 9;
// Extra por cada línea limpiada que contenga un hueco de tuerca.
const NUT_BONUS = 200;

// ---- Skins ----
// Each skin supplies its own palette (same indices as COLORS: null at 0 and 9)
// and its own block-drawing function, plus an optional drawHole() override.
// drawBlock() delegates to the active skin. Draw functions receive pixel
// coordinates and need not restore ctx state: drawBlock() wraps every call in
// save()/restore().

// Rounded rect with a fillRect fallback for browsers without ctx.roundRect.
// The radius is clamped so it never exceeds half of either side.
function fillRounded(context, x, y, w, h, r) {
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
    context.fill();
  } else {
    context.fillRect(x, y, w, h);
  }
}

// Default hollow ring for the nut's hole, tinted with the skin's nut color.
function baseDrawHole(context, px, py, size, color) {
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, size * 0.08);
  context.beginPath();
  context.arc(px + size / 2, py + size / 2, size * 0.3, 0, Math.PI * 2);
  context.stroke();
}

const SKINS = {
  retro: {
    palette: [...COLORS],
    draw(context, px, py, color, size) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },

  neon: {
    palette: [
      null,
      '#00e5ff', // I
      '#ffea00', // O
      '#e040fb', // T
      '#00e676', // S
      '#ff1744', // Z
      '#2979ff', // J
      '#ff9100', // L
      '#cfd8dc', // nut
      null,      // HOLE
    ],
    draw(context, px, py, color, size) {
      context.shadowBlur = size * 0.5;
      context.shadowColor = color;
      context.fillStyle = color;
      context.fillRect(px + 2, py + 2, size - 4, size - 4);
      context.shadowBlur = 0;
      context.fillStyle = 'rgba(255,255,255,0.4)';
      context.fillRect(px + 2, py + 2, size - 4, Math.max(1, size * 0.07));
    },
    drawHole(context, px, py, size, color) {
      context.shadowBlur = size * 0.4;
      context.shadowColor = color;
      baseDrawHole(context, px, py, size, color);
    },
  },

  pastel: {
    palette: [
      null,
      '#a8e6f0', // I
      '#ffe9a8', // O
      '#dcc0e8', // T
      '#b8e6c0', // S
      '#f5b8b8', // Z
      '#b0cff5', // J
      '#ffd6a8', // L
      '#d5dde2', // nut
      null,      // HOLE
    ],
    draw(context, px, py, color, size) {
      const r = Math.max(2, size * 0.24);
      context.fillStyle = color;
      fillRounded(context, px + 1, py + 1, size - 2, size - 2, r);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      fillRounded(context, px + 3, py + 3, size - 6, Math.max(2, size * 0.2), r * 0.6);
    },
  },

  pixel: {
    palette: [
      null,
      '#2ec4d6', // I
      '#e8b422', // O
      '#9c4dcc', // T
      '#4caf50', // S
      '#d32f2f', // Z
      '#1976d2', // J
      '#f57c00', // L
      '#78909c', // nut
      null,      // HOLE
    ],
    draw(context, px, py, color, size) {
      const p = Math.max(1, Math.round(size / 10)); // texture pixel unit
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      // lit top/left bevel
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(px, py, size, p);
      context.fillRect(px, py, p, size);
      // shaded bottom/right bevel
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(px, py + size - p, size, p);
      context.fillRect(px + size - p, py, p, size);
      // dithered speckles
      context.fillStyle = 'rgba(255,255,255,0.2)';
      context.fillRect(px + p * 2, py + p * 2, p, p);
      context.fillRect(px + p * 3, py + p * 4, p, p);
      context.fillStyle = 'rgba(0,0,0,0.2)';
      context.fillRect(px + size - p * 3, py + size - p * 3, p, p);
      context.fillRect(px + size - p * 4, py + size - p * 5, p, p);
    },
  },
};

const SKIN_STORAGE_KEY = 'tetris-skin';
const DEFAULT_SKIN = 'retro';
let activeSkin = DEFAULT_SKIN;
let currentSkin = SKINS[DEFAULT_SKIN];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const THEME_STORAGE_KEY = 'tetris-theme';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor = '#22222e';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  let holeRows = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      if (board[r].includes(HOLE)) holeRows++;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += ((LINE_SCORES[cleared] || 0) + holeRows * NUT_BONUS) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = currentSkin;
  const px = x * size;
  const py = y * size;
  // save/restore keeps skin-specific state (shadowBlur, lineWidth, alpha...)
  // from leaking into the rest of the frame.
  context.save();
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === HOLE) {
    (skin.drawHole || baseDrawHole)(context, px, py, size, skin.palette[8]);
  } else {
    const color = skin.palette[colorIndex];
    if (color) skin.draw(context, px, py, color, size);
  }
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // no reagendar: la partida terminó
  animId = requestAnimationFrame(loop);
}

// --grid-color depends on both the theme and the skin, so both re-read it.
function refreshGridColor() {
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
}

// Repintado manual: draw() sólo corre dentro del loop (parado en pausa y en
// game over) y drawNext() sólo se llama en spawn(). Cambiar tema o skin tiene
// que forzar el redibujado de ambos lienzos.
function repaint() {
  if (!board || !next) return; // todavía sin partida: init() dibujará
  draw();
  drawNext();
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  refreshGridColor();
  repaint();
  themeToggle.checked = theme === 'light';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    // localStorage no disponible: la preferencia simplemente no persiste
  }
}

function initTheme() {
  let theme = 'dark';
  try {
    theme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  } catch (e) {
    // localStorage no disponible: arrancar en modo oscuro por defecto
  }
  applyTheme(theme);
}

function applySkin(skin) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, skin)) skin = DEFAULT_SKIN;
  activeSkin = skin;
  currentSkin = SKINS[skin];
  document.body.dataset.skin = skin;
  refreshGridColor();
  repaint();
  skinSelect.value = skin;
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch (e) {
    // localStorage no disponible: la preferencia simplemente no persiste
  }
}

function initSkin() {
  let skin = DEFAULT_SKIN;
  try {
    skin = localStorage.getItem(SKIN_STORAGE_KEY) || DEFAULT_SKIN;
  } catch (e) {
    // localStorage no disponible: arrancar con la skin por defecto
  }
  applySkin(skin);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
  themeToggle.blur();
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur();
});

initTheme();
initSkin();
init();
