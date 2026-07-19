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
const scoresPanel = document.getElementById('scores-panel');
const scoresBody = document.getElementById('scores-body');
const scoresBests = document.getElementById('scores-bests');
const nameForm = document.getElementById('name-form');
const playerNameInput = document.getElementById('player-name');
const resetScoresBtn = document.getElementById('reset-scores-btn');

const THEME_STORAGE_KEY = 'tetris-theme';
const HIGHSCORES_STORAGE_KEY = 'tetris-highscores';
const MAX_HIGHSCORES = 5;
const MAX_NAME_LENGTH = 12;
const DEFAULT_NAME = 'Anónimo';
// Combo chain bonus: only awarded from the second consecutive clear onwards.
const COMBO_BONUS = 50;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo;
// The game does not run until the player presses "Jugar" on the start screen.
let started = false;
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
  return cleared;
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
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    if (combo > 1) score += combo * COMBO_BONUS * level;
    if (combo > maxCombo) maxCombo = combo;
    updateHUD();
  } else {
    combo = 0;
  }
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

function drawHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = COLORS[8];
  context.lineWidth = Math.max(2, size * 0.08);
  context.beginPath();
  context.arc(x * size + size / 2, y * size + size / 2, size * 0.3, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  if (colorIndex === HOLE) {
    drawHole(context, x, y, size, alpha);
    return;
  }
  const color = COLORS[colorIndex];
  if (!color) return;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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

/* ---------- Highscore table (localStorage) ---------- */

function sanitizeName(value) {
  const clean = String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return clean || DEFAULT_NAME;
}

function toCount(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function isValidEntry(entry) {
  return !!entry
    && typeof entry === 'object'
    && typeof entry.name === 'string'
    && Number.isFinite(entry.score);
}

// Never throws: a missing or corrupt localStorage degrades to an empty list.
function loadHighscores() {
  let raw = null;
  try {
    raw = localStorage.getItem(HIGHSCORES_STORAGE_KEY);
  } catch (e) {
    return [];
  }
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isValidEntry)
    .map(entry => ({
      name: sanitizeName(entry.name),
      score: toCount(entry.score),
      lines: toCount(entry.lines),
      maxCombo: toCount(entry.maxCombo),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HIGHSCORES);
}

function saveHighscores(list) {
  try {
    localStorage.setItem(HIGHSCORES_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    // localStorage unavailable: highscores simply do not persist
  }
}

function qualifiesForHighscores(value) {
  const list = loadHighscores();
  return list.length < MAX_HIGHSCORES || value > list[list.length - 1].score;
}

// Returns the new entry's rank in the top list, or -1 if it did not make it.
function addHighscore(entry) {
  const list = loadHighscores();
  list.push(entry);
  // Array.prototype.sort is stable: on a tie the new entry stays behind the old one.
  list.sort((a, b) => b.score - a.score);
  const rank = list.indexOf(entry);
  saveHighscores(list.slice(0, MAX_HIGHSCORES));
  return rank < MAX_HIGHSCORES ? rank : -1;
}

function appendCell(row, text, withTooltip) {
  const cell = document.createElement('td');
  // Always textContent: the name is player-supplied input.
  cell.textContent = text;
  if (withTooltip) cell.title = text;
  row.appendChild(cell);
}

function renderHighscores(highlightIndex) {
  const list = loadHighscores();
  scoresBody.textContent = '';

  if (!list.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-row';
    cell.textContent = 'Todavía no hay records';
    row.appendChild(cell);
    scoresBody.appendChild(row);
    scoresBests.textContent = '';
    return;
  }

  list.forEach((entry, i) => {
    const row = document.createElement('tr');
    if (i === highlightIndex) row.className = 'highlight';
    appendCell(row, String(i + 1));
    appendCell(row, entry.name, true);
    appendCell(row, entry.score.toLocaleString());
    appendCell(row, String(entry.lines));
    appendCell(row, String(entry.maxCombo));
    scoresBody.appendChild(row);
  });

  const bestCombo = list.reduce((max, e) => Math.max(max, e.maxCombo), 0);
  const bestLines = list.reduce((max, e) => Math.max(max, e.lines), 0);
  scoresBests.textContent = `Mejor combo: ${bestCombo} · Máx. líneas: ${bestLines}`;
}

function showStartScreen() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = 'Pulsa Jugar para empezar';
  restartBtn.textContent = 'Jugar';
  nameForm.classList.add('hidden');
  scoresPanel.classList.remove('hidden');
  renderHighscores(-1);
  overlay.classList.remove('hidden');
}

function saveCurrentScore() {
  const entry = {
    name: sanitizeName(playerNameInput.value),
    score,
    lines,
    maxCombo,
  };
  const rank = addHighscore(entry);
  nameForm.classList.add('hidden');
  renderHighscores(rank);
}

function resetHighscores() {
  if (!window.confirm('¿Seguro que quieres borrar todos los records?')) return;
  try {
    localStorage.removeItem(HIGHSCORES_STORAGE_KEY);
  } catch (e) {
    // localStorage unavailable: there is nothing persisted to clear
  }
  nameForm.classList.add('hidden');
  renderHighscores(-1);
}

/* ---------------------------------------------------- */

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent =
    `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Mejor combo: ${maxCombo}`;
  restartBtn.textContent = 'Reiniciar';
  scoresPanel.classList.remove('hidden');

  const qualifies = qualifiesForHighscores(score);
  nameForm.classList.toggle('hidden', !qualifies);
  renderHighscores(-1);
  overlay.classList.remove('hidden');
  // Keep whatever name was typed before: repeat players do not retype it.
  if (qualifies) playerNameInput.focus();
}

function togglePause() {
  if (!started || gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    restartBtn.textContent = 'Reiniciar';
    scoresPanel.classList.add('hidden');
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

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
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

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  started = true;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  // Reset the overlay before spawn(): spawn() may call endGame(), which shows it again.
  restartBtn.textContent = 'Reiniciar';
  scoresPanel.classList.add('hidden');
  nameForm.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  spawn();
  updateHUD();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Do not steal keystrokes while the player types a name into the highscore form.
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (!started || paused || gameOver) return;
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

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  saveCurrentScore();
});

resetScoresBtn.addEventListener('click', resetHighscores);

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
  themeToggle.blur();
});

initTheme();
showStartScreen();
