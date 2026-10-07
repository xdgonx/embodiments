// game.js — логика и состояние «Воплощений». Без Three.js, без DOM.

export const BOARD_WIDTH = 20;
export const BOARD_HEIGHT = BOARD_WIDTH / 2.98;
export const IMG_W = 4080;
export const IMG_H = 1397;
export const TOKEN_RADIUS = 0.5;
export const COIN_HEIGHT = 0.22;
export const CAPTAIN_TOKEN_RADIUS = TOKEN_RADIUS * 0.7;
export const CAPTAIN_TOKEN_HEIGHT = COIN_HEIGHT * 0.6;
export const ATTACK_RANGE = 1;

export const BASE_WHITE_ID = 1;
export const BASE_BLACK_ID = 2;
export const BLUE_CELLS = [3, 4, 5];
export const LOCATION_BONUS_IDS = [1, 2, 4, 5];

export const COLOR_RED = 0xef1f1f;
export const COLOR_YELLOW = 0xffc300;
export const COLOR_RED_CSS = '#ef1f1f';
export const COLOR_YELLOW_CSS = '#ffc300';

export const EXPLORE_HIGHLIGHT_OFFSET = {
  white: { x: -0.1, z: +0.08 },
  black: { x: +0.1, z: +0.08 },
};

export const LOCATION_CELLS = {
  1: [1, 10, 11, 8],
  2: [12, 13, 14, 7, 15, 16],
  3: [3, 4, 5],
  4: [17, 18, 6, 19, 20, 21],
  5: [9, 22, 23, 2],
};
export const CELL_TO_BASE_LOCATION = {};
Object.entries(LOCATION_CELLS).forEach(([loc, cells]) => {
  cells.forEach(cellId => { CELL_TO_BASE_LOCATION[cellId] = Number(loc); });
});
export function getLocationForSide(cellId, side) {
  const base = CELL_TO_BASE_LOCATION[cellId];
  if (base === undefined) return null;
  return side === 'white' ? base : (6 - base);
}

export const RAW_POINTS = [
  { id: 1,  type: 'base-white',   x: 270,  y: 698 },
  { id: 2,  type: 'base-black',   x: 3810, y: 699 },
  { id: 3,  type: 'cell-blue',    x: 1801, y: 493 },
  { id: 4,  type: 'cell-blue',    x: 2040, y: 698 },
  { id: 5,  type: 'cell-blue',    x: 2279, y: 904 },
  { id: 6,  type: 'cell-green',   x: 3053, y: 497 },
  { id: 7,  type: 'cell-green',   x: 1027, y: 900 },
  { id: 8,  type: 'cell-special', x: 724,  y: 696 },
  { id: 9,  type: 'cell-special', x: 3356, y: 701 },
  { id: 10, type: 'cell-normal',  x: 515,  y: 577 },
  { id: 11, type: 'cell-normal',  x: 509,  y: 820 },
  { id: 12, type: 'cell-normal',  x: 1270, y: 488 },
  { id: 13, type: 'cell-normal',  x: 1149, y: 693 },
  { id: 14, type: 'cell-normal',  x: 1395, y: 700 },
  { id: 15, type: 'cell-normal',  x: 1267, y: 903 },
  { id: 16, type: 'cell-normal',  x: 1506, y: 899 },
  { id: 17, type: 'cell-normal',  x: 2574, y: 498 },
  { id: 18, type: 'cell-normal',  x: 2813, y: 494 },
  { id: 19, type: 'cell-normal',  x: 2685, y: 697 },
  { id: 20, type: 'cell-normal',  x: 2931, y: 704 },
  { id: 21, type: 'cell-normal',  x: 2810, y: 909 },
  { id: 22, type: 'cell-normal',  x: 3571, y: 577 },
  { id: 23, type: 'cell-normal',  x: 3565, y: 820 },
];
export function pxTo3D(px, py) {
  const x = (px / IMG_W) * BOARD_WIDTH - BOARD_WIDTH / 2;
  const z = (py / IMG_H) * BOARD_HEIGHT - BOARD_HEIGHT / 2;
  return { x, z };
}
export const BOARD = RAW_POINTS.map(p => {
  const { x, z } = pxTo3D(p.x, p.y);
  return { id: p.id, type: p.type, px: p.x, py: p.y, x, z };
});
export function getPoint(id) { return BOARD.find(p => p.id === id); }

export const CAPTAIN_SLOT_POSITIONS = [
  { value: 1, x: 160,  y: 225 }, { value: 2, x: 341,  y: 225 },
  { value: 3, x: 522,  y: 225 }, { value: 4, x: 703,  y: 225 },
  { value: 5, x: 884,  y: 225 }, { value: 6, x: 1065, y: 225 },
  { value: 7, x: 1246, y: 225 }, { value: 8, x: 1427, y: 225 },
  { value: 9, x: 1608, y: 225 },
  { value: 10, x: 2292, y: 225 }, { value: 9, x: 2473, y: 225 },
  { value: 8, x: 2654, y: 225 }, { value: 7, x: 2835, y: 225 },
  { value: 6, x: 3016, y: 225 }, { value: 5, x: 3197, y: 225 },
  { value: 4, x: 3378, y: 225 }, { value: 3, x: 3559, y: 225 },
  { value: 2, x: 3740, y: 225 }, { value: 1, x: 3921, y: 225 },
];
export function getCaptainSlotPosition(side, mightValue) {
  const v = Math.max(1, mightValue | 0);
  if (side === 'white') return CAPTAIN_SLOT_POSITIONS[Math.min(8, v - 1)];
  return CAPTAIN_SLOT_POSITIONS[9 + Math.min(9, Math.max(0, 10 - v))];
}

const BIDIR = [
  [10, 8], [11, 8], [8, 12], [8, 13], [8, 7],
  [12, 3], [12, 14], [12, 13],
  [13, 14], [13, 15], [13, 7],
  [14, 15], [14, 16], [14, 4],
  [7, 15], [15, 16], [16, 4], [16, 5],
  [23, 9], [22, 9], [9, 21], [9, 20], [9, 6],
  [21, 5], [21, 19], [21, 20],
  [20, 19], [20, 18], [20, 6],
  [19, 18], [19, 17], [19, 4],
  [6, 18], [18, 17], [17, 4], [17, 3],
  [3, 14], [5, 19], [10, 11], [22, 23],
];
const FROM_BASE = [[1, 10], [1, 11], [2, 23], [2, 22]];
export const CONDITIONAL = [
  { from: 10, to: 12, trigger: 8, forSide: 'white', color: COLOR_RED,    start: [620, 545],  end: [1139, 460] },
  { from: 11, to: 7,  trigger: 8, forSide: 'white', color: COLOR_RED,    start: [628, 882],  end: [896, 917] },
  { from: 23, to: 21, trigger: 9, forSide: 'black', color: COLOR_YELLOW, start: [3452, 525], end: [3179, 492] },
  { from: 22, to: 6,  trigger: 9, forSide: 'black', color: COLOR_YELLOW, start: [3458, 887], end: [2930, 939] },
];

export const PROFILES = {
  adelaide: { name: 'Аделаида', speed: 20, strength: 1, hp: 2, influence: 1, ringColor: COLOR_RED_CSS,    outlineHex: 0xffffff, sprite: 'pieces/adelaide.png', captainSprite: 'pieces/adelaide_captain.png' },
  arna:     { name: 'Арна',     speed: 20, strength: 1, hp: 2, influence: 1, ringColor: COLOR_RED_CSS,    outlineHex: 0xffffff, sprite: 'pieces/arna.png',     captainSprite: 'pieces/arna_captain.png' },
  jack:     { name: 'Джек',     speed: 10, strength: 0, hp: 4, influence: 1, ringColor: COLOR_RED_CSS,    outlineHex: 0xffffff, sprite: 'pieces/jack.png',     captainSprite: 'pieces/jack_captain.png' },
  urust:    { name: 'Уруст',    speed: 10, strength: 1, hp: 4, influence: 1, ringColor: COLOR_YELLOW_CSS, outlineHex: 0x0a0a0a, sprite: 'pieces/urust.png',    captainSprite: 'pieces/urust_captain.png' },
  polina:   { name: 'Полина',   speed: 20, strength: 1, hp: 2, influence: 1, ringColor: COLOR_YELLOW_CSS, outlineHex: 0x0a0a0a, sprite: 'pieces/polina.png',   captainSprite: 'pieces/polina_captain.png' },
  igoram:   { name: 'Игорам',   speed: 10, strength: 1, hp: 4, influence: 1, ringColor: COLOR_YELLOW_CSS, outlineHex: 0x0a0a0a, sprite: 'pieces/igoram.png',   captainSprite: 'pieces/igoram_captain.png' },
  il:       { name: 'Иль',      speed: 20, strength: 1, hp: 2, influence: 1, ringColor: COLOR_RED_CSS,    outlineHex: 0xffffff, sprite: 'pieces/il.png',       captainSprite: 'pieces/il_captain.png' },
  mite:     { name: 'Митэ',     speed: 20, strength: 1, hp: 2, influence: 1, ringColor: COLOR_YELLOW_CSS, outlineHex: 0x0a0a0a, sprite: 'pieces/mite.png',     captainSprite: 'pieces/mite_captain.png' },
};

const CARD_NAMES = {
  adelaide: { '1': 'Скрытые проходы',       '2': 'Из тени в тень',         ult: 'Помощь папочки' },
  arna:     { '1': 'Танец на углях',         '2': 'Зажжённое сердце',       ult: 'Огненная копия' },
  igoram:   { '1': 'Сковывающий ужас',       '2': 'Пир смерти',             ult: 'Несбывшаяся клятва' },
  jack:     { '1': 'Бросок руки',            '2': 'Модификация руки',       ult: 'Выбросы ртути' },
  polina:   { '1': 'Магический порыв ветра', '2': 'Быстрое перемещение',    ult: 'Полевой лазарет' },
  urust:    { '1': 'Размахивать щитом',      '2': 'Щит иллюзий',            ult: 'Вязкое болото' },
  il:       { '1': 'Паломничество',          '2': 'Принудительная молитва', ult: 'Древо жизни' },
  mite:     { '1': 'Сквозной удар',          '2': 'Рывок',                  ult: 'Бойня' },
};

const CARD_VARIANTS = [
  { variant: '1', icon: 'A' }, { variant: '1', icon: 'A' },
  { variant: '2', icon: 'B' }, { variant: '2', icon: 'B' },
  { variant: 'ult', icon: 'U' },
];

export class Game {
  static DEFAULT_TEAMS = {
    white: { captain: 'il',   members: ['adelaide', 'arna', 'jack'] },
    black: { captain: 'mite', members: ['urust', 'polina', 'igoram'] },
  };

  static generateTeams(rand) {
    const all = Object.keys(PROFILES);
    const shuffled = [...all];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const white4 = shuffled.slice(0, 4);
    const black4 = shuffled.slice(4, 8);
    const wc = white4[Math.floor(rand() * white4.length)];
    const bc = black4[Math.floor(rand() * black4.length)];
    return {
      white: { captain: wc, members: white4.filter(k => k !== wc) },
      black: { captain: bc, members: black4.filter(k => k !== bc) },
    };
  }

  constructor(opts = {}) {
    this.seed = opts.seed != null ? (opts.seed | 0) : ((Math.random() * 0x7fffffff) | 0);
    this.rngState = this.seed | 0;
    this.uidCounter = 0;

    if (opts.teamConfig) {
      this.teamConfig = JSON.parse(JSON.stringify(opts.teamConfig));
    } else if (opts.shuffleTeams) {
      this.teamConfig = Game.generateTeams(() => this.rand());
    } else {
      this.teamConfig = JSON.parse(JSON.stringify(Game.DEFAULT_TEAMS));
    }

    this.pieces = [];
    this.might = { white: 9, black: 10 };
    this.cardState = {
      white: { deck: [], hand: [], discard: [], playedThisTurn: 0 },
      black: { deck: [], hand: [], discard: [], playedThisTurn: 0 },
    };
    this.currentTurn = 'white';
    this.turnNumber = 1;
    this.locationBonusUsed = { white: this._emptyBonusMap(), black: this._emptyBonusMap() };
    this.actionTakenThisTurn = { white: false, black: false };
    this.hasDiscardedThisTurn = { white: false, black: false };
    this.revealState = { active: false, side: null, cards: [] };
    this.gameOver = false;
    this.winner = null;

    // ★ НОВОЕ: uid карты, которая только что ушла в сброс (для свечения)
    this.highlightUid = { white: null, black: null };

    this.bonusAvailabilitySnapshot = { white: {}, black: {} };
    this.pendingEndTurnAfterOrbs = false;

    this.turnSnapshot = null;

    this._initPieces();
    this._initDecks();
    // Белые начинают с полной рукой, чёрные добирают свои 5 карт
    // в момент, когда к ним переходит ход (см. _doFinishEndTurn).
    this._refillHand('white');
    this._takeBonusSnapshot('white');
    this._takeTurnSnapshot();
  }

  _emptyBonusMap() {
    const m = {};
    LOCATION_BONUS_IDS.forEach(id => m[id] = false);
    return m;
  }

  _takeBonusSnapshot(side) {
    const snap = {};
    LOCATION_BONUS_IDS.forEach(logicalLocId => {
      const physicalLoc = side === 'white' ? logicalLocId : (6 - logicalLocId);
      const myInf = this.getLocationStats(side, physicalLoc);
      const enemyInf = this.getLocationStats(side === 'white' ? 'black' : 'white', physicalLoc);
      snap[logicalLocId] = myInf > enemyInf;
    });
    this.bonusAvailabilitySnapshot[side] = snap;
  }

  hasBonusAdvantage(side, logicalLocId) {
    return !!this.bonusAvailabilitySnapshot[side][logicalLocId];
  }

  rand() {
    this.rngState = (this.rngState + 0x6D2B79F5) | 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  _initPieces() {
    const add = (profileKey, side, role) => {
      const profile = PROFILES[profileKey];
      this.pieces.push({
        id: profileKey, profileKey, profile, side, role,
        speed: profile.speed, strength: profile.strength,
        hp: profile.hp, maxHp: profile.hp, influence: profile.influence,
        name: profile.name,
        cellId: side === 'white' ? BASE_WHITE_ID : BASE_BLACK_ID,
        mirror: null, mirrorSide: null, captainBuffApplied: false,
      });
    };
    this.teamConfig.white.members.forEach(k => add(k, 'white', 'regular'));
    this.teamConfig.black.members.forEach(k => add(k, 'black', 'regular'));
  }

  _initDecks() {
    this.cardState.white.deck = this._buildDeck('white');
    this.cardState.black.deck = this._buildDeck('black');
  }

  _buildDeck(side) {
    const cards = [];
    this.teamConfig[side].members.forEach(charKey => {
      CARD_VARIANTS.forEach(v => {
        cards.push({
          uid: 'c' + (++this.uidCounter),
          charKey, charName: PROFILES[charKey].name,
          variant: v.variant, name: CARD_NAMES[charKey][v.variant],
          icon: v.icon, imgPath: `cards/${charKey}_${v.variant}.png`,
          faceUp: false,
        });
      });
    });
    return this._shuffle(cards);
  }

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _refillHand(side, events) {
    const st = this.cardState[side];
    while (st.hand.length < 5) {
      if (st.deck.length === 0) {
        if (st.discard.length === 0) break;
        st.deck = this._shuffle(st.discard);
        st.discard = [];
        if (events) events.push({ kind: 'deckReshuffled', side });
      }
      const c = st.deck.pop();
      c.faceUp = false;
      st.hand.push(c);
    }
  }

  getPiece(id) { return this.pieces.find(p => p.id === id) || null; }
  getCaptainProfileKey(side) { return this.teamConfig[side].captain; }
  getMembers(side) { return this.teamConfig[side].members; }
  getPiecesOnCell(cellId) { return this.pieces.filter(p => p.cellId === cellId); }

  isOnBase(piece) {
    const cell = getPoint(piece.cellId);
    return cell && (cell.type === 'base-white' || cell.type === 'base-black');
  }

  getCardByUid(side, uid) {
    return this.cardState[side].hand.find(c => c.uid === uid) || null;
  }

  getLocationStats(side, physicalLocId) {
    const cells = LOCATION_CELLS[physicalLocId] || [];
    let inf = 0;
    this.pieces.forEach(p => {
      if (p.side !== side) return;
      if (!cells.includes(p.cellId)) return;
      inf += (p.influence || 0);
    });
    return inf;
  }

  getCenterStats(side) {
    let inf = 0, count = 0;
    this.pieces.forEach(p => {
      if (p.side !== side) return;
      if (!BLUE_CELLS.includes(p.cellId)) return;
      inf += (p.influence || 0);
      count++;
    });
    return { inf, count };
  }

  canUseLocationBonus(side, logicalLocId) {
    if (this.gameOver) return false;
    if (this.currentTurn !== side) return false;
    if (this.actionTakenThisTurn[side]) return false;
    if (this.hasDiscardedThisTurn[side]) return false;
    if (this.locationBonusUsed[side][logicalLocId]) return false;
    if (this.revealState.active) return false;
    if (this.pendingEndTurnAfterOrbs) return false;
    if (!this.hasBonusAdvantage(side, logicalLocId)) return false;

    const st = this.cardState[side];
    if (logicalLocId === 2 && st.deck.length === 0) return false;
    if (logicalLocId === 4 && st.discard.length === 0) return false;
    if (logicalLocId === 5) {
      const cells = this._location5PhysicalCells(side);
      if (!this.pieces.some(p => p.side === side && cells.includes(p.cellId))) return false;
    }
    return true;
  }

  _location5PhysicalCells(side) {
    const physical = side === 'white' ? 5 : 1;
    return LOCATION_CELLS[physical] || [];
  }

  getNeighborsByCell(cellId, side) {
    const green = [], normal = [];
    const push = (id) => {
      const p = getPoint(id);
      const arr = (p && p.type === 'cell-green') ? green : normal;
      if (!arr.includes(id)) arr.push(id);
    };
    BIDIR.forEach(([a, b]) => { if (a === cellId) push(b); if (b === cellId) push(a); });
    FROM_BASE.forEach(([a, b]) => { if (a === cellId) push(b); });
    const enemySide = side === 'white' ? 'black' : 'white';
    CONDITIONAL.forEach(c => {
      if (c.from !== cellId) return;
      if (c.forSide !== side) return;
      const enemyThere = this.pieces.some(p => p.cellId === c.trigger && p.side === enemySide);
      if (enemyThere) push(c.to);
    });
    return [...green, ...normal];
  }

  getNeighborsForAttack(cellId) {
    const result = [];
    const push = (id) => { if (!result.includes(id)) result.push(id); };
    BIDIR.forEach(([a, b]) => { if (a === cellId) push(b); if (b === cellId) push(a); });
    FROM_BASE.forEach(([a, b]) => { if (a === cellId) push(b); if (b === cellId) push(a); });
    return result;
  }

  getReachableCells(piece) {
    const visited = new Map();
    visited.set(piece.cellId, 0);
    const queue = [piece.cellId];
    while (queue.length) {
      const cur = queue.shift();
      const d = visited.get(cur);
      if (d >= piece.speed) continue;
      const neigh = this.getNeighborsByCell(cur, piece.side);
      for (const nid of neigh) {
        if (visited.has(nid)) continue;
        if (this.pieces.some(p => p !== piece && p.cellId === nid)) continue;
        visited.set(nid, d + 1);
        queue.push(nid);
      }
    }
    visited.delete(piece.cellId);
    return new Set(visited.keys());
  }

  findPath(piece, targetId) {
    const visited = new Map();
    const parent = new Map();
    visited.set(piece.cellId, 0);
    const queue = [piece.cellId];
    while (queue.length) {
      const cur = queue.shift();
      const d = visited.get(cur);
      if (d >= piece.speed) continue;
      const neigh = this.getNeighborsByCell(cur, piece.side);
      for (const nid of neigh) {
        if (visited.has(nid)) continue;
        if (this.pieces.some(p => p !== piece && p.cellId === nid)) continue;
        visited.set(nid, d + 1);
        parent.set(nid, cur);
        queue.push(nid);
      }
    }
    if (!visited.has(targetId)) return null;
    const path = [targetId];
    let c = targetId;
    while (parent.has(c)) { c = parent.get(c); path.unshift(c); }
    return path;
  }

  getAttackTargets(attacker) {
    if (!attacker) return [];
    const visited = new Map();
    visited.set(attacker.cellId, 0);
    const queue = [attacker.cellId];
    while (queue.length) {
      const cur = queue.shift();
      const d = visited.get(cur);
      if (d >= ATTACK_RANGE) continue;
      const neigh = this.getNeighborsForAttack(cur);
      for (const nid of neigh) {
        if (visited.has(nid)) continue;
        visited.set(nid, d + 1);
        queue.push(nid);
      }
    }
    visited.delete(attacker.cellId);
    return this.pieces.filter(p => {
      if (p === attacker) return false;
      if (!visited.has(p.cellId)) return false;
      if (this.isOnBase(p)) return false;
      return true;
    });
  }

  canExploreBase(piece) {
    if (!piece) return false;
    const enemyBaseId = piece.side === 'white' ? BASE_BLACK_ID : BASE_WHITE_ID;
    return this.getNeighborsForAttack(piece.cellId).includes(enemyBaseId);
  }

  canCastSpell(piece) { return piece ? !BLUE_CELLS.includes(piece.cellId) : false; }

  getMirrorTargets(ownerPiece) {
    if (!ownerPiece) return [];
    const ownerLoc = getLocationForSide(ownerPiece.cellId, ownerPiece.side);
    if (ownerLoc === null) return [];
    const targets = [];
    this.pieces.forEach(p => {
      if (p.side !== ownerPiece.side) return;
      if (p.mirror !== null) return;
      const pLoc = getLocationForSide(p.cellId, p.side);
      if (pLoc === null) return;
      if (pLoc === 3) return;
      if (p === ownerPiece) targets.push(p);
      else if (Math.abs(pLoc - ownerLoc) <= 1) targets.push(p);
    });
    return targets;
  }

  _location5Targets(side) {
    const myCells = this._location5PhysicalCells(side);
    const excluded = new Set([...myCells, ...LOCATION_CELLS[3]]);
    const targets = new Set();
    BOARD.forEach(cell => {
      if (excluded.has(cell.id)) return;
      if (cell.type === 'base-white' || cell.type === 'base-black') return;
      if (this.pieces.some(p => p.cellId === cell.id)) return;
      targets.add(cell.id);
    });
    return targets;
  }

  applyAction(action) {
    if (!action || typeof action !== 'object') return { ok: false, error: 'Пустое действие' };
    if (this.gameOver) return { ok: false, error: 'Игра завершена' };

    const events = [];
    let result;
    try {
      switch (action.kind) {
        case 'playCard':              result = this._handlePlayCard(action, events); break;
        case 'discard':               result = this._handleDiscard(action, events); break;
        case 'endTurn':               result = this._handleEndTurn(action, events); break;
        case 'locationBonus1':        result = this._handleLocationBonus1(action, events); break;
        case 'locationBonus2Start':   result = this._handleLocationBonus2Start(action, events); break;
        case 'locationBonus2Resolve': result = this._handleLocationBonus2Resolve(action, events); break;
        case 'locationBonus4':        result = this._handleLocationBonus4(action, events); break;
        case 'locationBonus5':        result = this._handleLocationBonus5(action, events); break;
        case 'useMirror':             result = this._handleUseMirror(action, events); break;
        case 'undo':                  result = this._handleUndo(action, events); break;
        default: return { ok: false, error: `Неизвестное действие: ${action.kind}` };
      }
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
    if (!result.ok) return result;
    this._checkVictory(events);
    return { ok: true, events, state: this.getState() };
  }

    finishEndTurnAfterOrbs() {
    if (!this.pendingEndTurnAfterOrbs) return { ok: true, events: [] };
    const events = [];
    this.pendingEndTurnAfterOrbs = false;
    this._doFinishEndTurn(events);
    return { ok: true, events, state: this.getState() };
  }

  // ★ Отмена активного вскрытия (бонус 2 локации). Используется, когда
  //   игрок открывает панель завершения хода не подтверждая вскрытие.
  //   Публичный метод — чтобы в мультиплеере клиент не мутировал state
  //   напрямую, а посылал это действие.
  abortReveal() {
    if (!this.revealState.active) {
      return { ok: true, events: [], state: this.getState() };
    }
    const events = [];
    const s = this.revealState.side;
    this.revealState.cards.slice().reverse().forEach(c => {
      c.faceUp = true;
      this.cardState[s].deck.push(c);
    });
    events.push({ kind: 'revealAborted', side: s });
    this.revealState = { active: false, side: null, cards: [] };
    this._takeTurnSnapshot();
    return { ok: true, events, state: this.getState() };
  }

  applyMightChange(side, delta) {
    const events = [];
    this._changeMight(side, delta, events);
    this._checkVictory(events);
    return { ok: true, events, state: this.getState() };
  }

  applyReviveBuff(pieceId) {
    const events = [];
    const piece = this.getPiece(pieceId);
    if (!piece) return { ok: false, events };
    this._applyReviveBuff(piece, events);
    return { ok: true, events, state: this.getState() };
  }

  _handlePlayCard(action, events) {
    const { side, cardUid, mode } = action;
    if (side !== this.currentTurn) return { ok: false, error: 'Не ваш ход' };
    if (this.revealState.active) return { ok: false, error: 'Сначала завершите вскрытие карт' };
    if (this.hasDiscardedThisTurn[side]) return { ok: false, error: 'Уже сбросили карту' };
    if (this.cardState[side].playedThisTurn >= 4) return { ok: false, error: 'Все 4 карты сыграны' };

    const card = this.getCardByUid(side, cardUid);
    if (!card) return { ok: false, error: 'Карты нет в руке' };
    const piece = this.getPiece(card.charKey);
    if (!piece || piece.side !== side) return { ok: false, error: 'Персонаж не найден' };

    if (mode === 'move')    return this._playMove(side, card, piece, action.path, events);
    if (mode === 'attack')  return this._playAttack(side, card, piece, action.targetPieceId, events);
    if (mode === 'explore') return this._playExplore(side, card, piece, events);
    if (mode === 'mirror')  return this._playMirror(side, card, piece, action.targetPieceId, events);
    if (mode === 'spell')   return this._playSpell(side, card, piece, events);
    return { ok: false, error: `Неизвестный режим: ${mode}` };
  }

  _playMove(side, card, piece, path, events) {
    if (!Array.isArray(path) || path.length === 0) return { ok: false, error: 'Пустой путь' };
    if (path[0] !== piece.cellId) return { ok: false, error: 'Путь не начинается с текущей клетки' };
    if (path.length - 1 > piece.speed) return { ok: false, error: 'Путь длиннее скорости' };

    for (let i = 0; i < path.length - 1; i++) {
      const neighbors = this.getNeighborsByCell(path[i], side);
      if (!neighbors.includes(path[i + 1])) return { ok: false, error: 'Недопустимый шаг по пути' };
    }
    const dest = path[path.length - 1];
    if (this.pieces.some(p => p !== piece && p.cellId === dest)) {
      return { ok: false, error: 'Клетка занята' };
    }

    this._consumeCard(side, card, events);
    piece.cellId = dest;
    events.push({ kind: 'pieceMoved', pieceId: piece.id, path: [...path] });
    return { ok: true };
  }

  _playAttack(side, card, piece, targetPieceId, events) {
    const target = this.getPiece(targetPieceId);
    if (!target) return { ok: false, error: 'Цель не найдена' };
    const allowed = this.getAttackTargets(piece);
    if (!allowed.includes(target)) return { ok: false, error: 'Цель недосягаема' };

    this._consumeCard(side, card, events);

    const damage = Math.max(0, piece.strength);
    const hpBefore = target.hp;
    target.hp = Math.max(0, target.hp - damage);

    events.push({
      kind: 'attackResolved',
      attackerId: piece.id, targetId: target.id,
      damage, hpBefore, hpAfter: target.hp,
      maxHpBefore: target.maxHp,
    });

    if (target.hp === 0) this._killPiece(target, events);
    return { ok: true };
  }

  _playExplore(side, card, piece, events) {
    if (!this.canExploreBase(piece)) return { ok: false, error: 'Персонаж не у базы противника' };
    this._consumeCard(side, card, events);

    if (piece.mirror) {
      const c = piece.mirror;
      const owner = piece.mirrorSide || piece.side;
      this.cardState[owner].discard.push(c);
      this.highlightUid[owner] = c.uid;
      events.push({ kind: 'mirrorDropped', ownerId: piece.id, card: c });
      piece.mirror = null;
      piece.mirrorSide = null;
    }

    // ★ Сразу переводим жетон на базу в состоянии — анимацию играет view.
    const baseId = side === 'white' ? BASE_WHITE_ID : BASE_BLACK_ID;
    piece.cellId = baseId;
    piece.hp = piece.maxHp;
    this._applyReviveBuff(piece, events);

    const enemySide = side === 'white' ? 'black' : 'white';
    events.push({ kind: 'exploreResolved', pieceId: piece.id, enemySide, orbsToEnemy: 3 });
    return { ok: true };
  }

  markPieceAtBase(pieceId, baseId) {
    const piece = this.getPiece(pieceId);
    if (!piece) return { ok: false, events: [] };
    piece.cellId = baseId;
    piece.hp = piece.maxHp;
    const events = [];
    this._checkVictory(events);
    return { ok: true, events, state: this.getState() };
  }

  _playMirror(side, card, piece, targetPieceId, events) {
    const target = this.getPiece(targetPieceId);
    if (!target) return { ok: false, error: 'Цель не найдена' };
    const allowed = this.getMirrorTargets(piece);
    if (!allowed.includes(target)) return { ok: false, error: 'Нельзя передать зерцало этой цели' };
    if (target.mirror) return { ok: false, error: 'У цели уже есть зерцало' };

    // ★ Карта снимается с руки, но НЕ идёт в сброс — она отправляется
    //   сразу в зерцало. Иначе одна и та же ссылка оказывается и в
    //   discard, и в target.mirror, и при перемешивании сброса в колоду
    //   карта из зерцала «утекает» в колоду.
    //   В сброс она попадёт позже: при использовании зерцала, смерти
    //   или исследовании владельца.
    this._consumeCard(side, card, events, { toDiscard: false });

    target.mirror = card;
    target.mirrorSide = side;
    events.push({ kind: 'mirrorAttached', ownerId: target.id, card });
    return { ok: true };
  }

  _playSpell(side, card, piece, events) {
    if (!this.canCastSpell(piece)) return { ok: false, error: 'Заклинание недоступно на этой клетке' };
    this._consumeCard(side, card, events);
    events.push({ kind: 'spellResolved', pieceId: piece.id, card });
    return { ok: true };
  }

  _handleDiscard(action, events) {
    const { side, cardUid } = action;
    if (side !== this.currentTurn) return { ok: false, error: 'Не ваш ход' };
    if (this.revealState.active) return { ok: false, error: 'Нельзя сбрасывать во время вскрытия' };
    const card = this.getCardByUid(side, cardUid);
    if (!card) return { ok: false, error: 'Карты нет в руке' };
    if (this.cardState[side].hand.length <= 1) return { ok: false, error: 'Нельзя сбросить последнюю карту' };

    // _consumeCard уже установит highlightUid и playedThisTurn
    this._consumeCard(side, card, events);
    this.hasDiscardedThisTurn[side] = true;
    events.push({ kind: 'cardDiscarded', side, card });
    return { ok: true };
  }

  _handleEndTurn(action, events) {
    const { side } = action;
    if (side !== this.currentTurn) return { ok: false, error: 'Не ваш ход' };
    // ★ Защита от повторного вызова, пока летят пузырьки локации 3.
    if (this.pendingEndTurnAfterOrbs) {
      return { ok: false, error: 'Ход уже завершается' };
    }

    if (this.revealState.active) {
      const s = this.revealState.side;
      this.revealState.cards.slice().reverse().forEach(c => {
        c.faceUp = true;
        this.cardState[s].deck.push(c);
      });
      events.push({ kind: 'revealAborted', side: s });
      this.revealState = { active: false, side: null, cards: [] };
    }

    const damage = this._applyLocation3Damage(side, events);
    if (damage > 0) {
      this.pendingEndTurnAfterOrbs = true;
      events.push({ kind: 'pendingEndTurnAfterOrbs', side, damage });
      return { ok: true };
    }

    this._doFinishEndTurn(events);
    return { ok: true };
  }

  _doFinishEndTurn(events) {
    const from = this.currentTurn;
    this.highlightUid[from] = null;                           // ★
    if (this.currentTurn === 'white') this.currentTurn = 'black';
    else { this.currentTurn = 'white'; this.turnNumber++; }

    this.actionTakenThisTurn[from] = false;
    this.hasDiscardedThisTurn[from] = false;
    this.locationBonusUsed[from] = this._emptyBonusMap();

    this._refillHand(this.currentTurn, events);
    this.cardState[this.currentTurn].playedThisTurn = 0;
    this._takeBonusSnapshot(this.currentTurn);

    events.push({ kind: 'turnChanged', from, to: this.currentTurn, turnNumber: this.turnNumber });
    this._takeTurnSnapshot();
  }

  _applyLocation3Damage(side, events) {
    const enemySide = side === 'white' ? 'black' : 'white';
    const me = this.getCenterStats(side);
    const enemy = this.getCenterStats(enemySide);
    if (me.inf <= enemy.inf) return 0;
    const diff = me.inf - enemy.inf;
    const damage = Math.min(2, diff, me.count);
    if (damage <= 0) return 0;
    events.push({ kind: 'powerOrbsFromCenter', side, count: damage, enemySide });
    return damage;
  }

  _handleLocationBonus1(action, events) {
    const { side, cardUid } = action;
    if (!this.canUseLocationBonus(side, 1)) return { ok: false, error: 'Бонус недоступен' };
    const card = this.getCardByUid(side, cardUid);
    if (!card) return { ok: false, error: 'Карты нет в руке' };

    const st = this.cardState[side];
    const idx = st.hand.indexOf(card);
    st.hand.splice(idx, 1);
    st.discard.push(card);
    this.highlightUid[side] = card.uid;                       // ★

    if (st.deck.length === 0 && st.discard.length > 0) {
      st.deck = this._shuffle(st.discard);
      st.discard = [];
    }
    let drawn = null;
    if (st.deck.length > 0) {
      drawn = st.deck.pop();
      drawn.faceUp = false;
      // ★ Новая карта встаёт на место сброшенной, а не в конец руки.
      //   Так «первая у колоды» остаётся первой у колоды, и вся рука
      //   не сдвигается на одну позицию в сторону.
      st.hand.splice(idx, 0, drawn);
    }
    this.locationBonusUsed[side][1] = true;
    events.push({ kind: 'locationBonus1Applied', side, discarded: card, drawn });
    return { ok: true };
  }

  _handleLocationBonus2Start(action, events) {
    const { side } = action;
    if (!this.canUseLocationBonus(side, 2)) return { ok: false, error: 'Бонус недоступен' };
    const st = this.cardState[side];
    const count = Math.min(2, st.deck.length);
    if (count === 0) return { ok: false, error: 'Колода пуста' };

    const cards = [];
    for (let i = 0; i < count; i++) cards.push(st.deck.pop());
    this.revealState = { active: true, side, cards };
    this.locationBonusUsed[side][2] = true;
    events.push({ kind: 'locationBonus2Started', side, cards });
    return { ok: true };
  }

  _handleLocationBonus2Resolve(action, events) {
    const { side, cardUid, action: act } = action;
    if (!this.revealState.active || this.revealState.side !== side) {
      return { ok: false, error: 'Нет активного вскрытия' };
    }
    const idx = this.revealState.cards.findIndex(c => c.uid === cardUid);
    if (idx < 0) return { ok: false, error: 'Карта не в списке вскрытых' };
    if (act !== 'return' && act !== 'discard') return { ok: false, error: 'Неизвестное действие' };

    const card = this.revealState.cards.splice(idx, 1)[0];
    if (act === 'return') {
      card.faceUp = true;
      this.cardState[side].deck.push(card);
    } else {
      card.faceUp = false;
      this.cardState[side].discard.push(card);
      this.highlightUid[side] = card.uid;                     // ★
    }
    events.push({ kind: 'locationBonus2Resolved', side, card, action: act });

    if (this.revealState.cards.length === 0) {
      this.revealState = { active: false, side: null, cards: [] };
      events.push({ kind: 'revealFinished', side });
    }
    return { ok: true };
  }

  _handleLocationBonus4(action, events) {
    const { side, handCardUid, discardCardUid } = action;
    if (!this.canUseLocationBonus(side, 4)) return { ok: false, error: 'Бонус недоступен' };

    const st = this.cardState[side];
    const handCard = this.getCardByUid(side, handCardUid);
    if (!handCard) return { ok: false, error: 'Карты нет в руке' };
    const discardCard = st.discard.find(c => c.uid === discardCardUid);
    if (!discardCard) return { ok: false, error: 'Карты нет в сбросе' };

    const handIdx = st.hand.indexOf(handCard);
    st.hand.splice(handIdx, 1);
    st.discard.splice(st.discard.indexOf(discardCard), 1);
    // ★ Карта из сброса встаёт в руку на то же место, откуда ушла
    //   сброшенная — симметрично тому, как это работает в бонусе 1.
    st.hand.splice(handIdx, 0, discardCard);
    st.discard.push(handCard);
    this.highlightUid[side] = handCard.uid;                   // ★

    this.locationBonusUsed[side][4] = true;
    events.push({ kind: 'locationBonus4Applied', side, handCard, discardCard });
    return { ok: true };
  }

  _handleLocationBonus5(action, events) {
    const { side, pieceId, targetCell } = action;
    if (!this.canUseLocationBonus(side, 5)) return { ok: false, error: 'Бонус недоступен' };
    const piece = this.getPiece(pieceId);
    if (!piece || piece.side !== side) return { ok: false, error: 'Персонаж не найден' };
    const cells = this._location5PhysicalCells(side);
    if (!cells.includes(piece.cellId)) return { ok: false, error: 'Персонаж не в пятой локации' };
    const targets = this._location5Targets(side);
    if (!targets.has(targetCell)) return { ok: false, error: 'Недопустимая ячейка' };

    const fromCell = piece.cellId;
    piece.cellId = targetCell;
    this.locationBonusUsed[side][5] = true;
    events.push({ kind: 'locationBonus5Applied', side, pieceId, fromCell, toCell: targetCell });
    return { ok: true };
  }

  _handleUseMirror(action, events) {
    const { side, pieceId } = action;
    if (side !== this.currentTurn) return { ok: false, error: 'Не ваш ход' };
    const piece = this.getPiece(pieceId);
    if (!piece || piece.side !== side) return { ok: false, error: 'Персонаж не найден' };
    if (!piece.mirror) return { ok: false, error: 'Нет зерцала' };

    const card = piece.mirror;
    const owner = piece.mirrorSide || side;
    this.cardState[owner].discard.push(card);
    this.highlightUid[owner] = card.uid;                      // ★
    piece.mirror = null;
    piece.mirrorSide = null;
    this.actionTakenThisTurn[side] = true;
    events.push({ kind: 'mirrorUsed', ownerId: piece.id, card });
    return { ok: true };
  }

  _handleUndo(action, events) {
    const { side } = action;
    if (side !== this.currentTurn) return { ok: false, error: 'Не ваш ход' };
    if (!this.turnSnapshot) return { ok: false, error: 'Нет снимка хода' };
    this._restore(this.turnSnapshot);
    events.push({ kind: 'undoPerformed', side });
    return { ok: true };
  }

  // Снимает карту с руки и (по умолчанию) кладёт в сброс.
  // opts.toDiscard === false — карта уходит НЕ в сброс, а сразу
  // в другое место (например, в зерцало). Сброс в этом случае
  // произойдёт позже: когда карту сыграют из зерцала, либо когда
  // персонаж с зерцалом погибнет/исследует.
  _consumeCard(side, card, events, opts = {}) {
    const toDiscard = opts.toDiscard !== false;
    const st = this.cardState[side];
    const idx = st.hand.indexOf(card);
    if (idx < 0) throw new Error('Карты нет в руке');
    st.hand.splice(idx, 1);
    if (toDiscard) st.discard.push(card);
    st.playedThisTurn++;
    this.highlightUid[side] = card.uid;
    this.actionTakenThisTurn[side] = true;
    events.push({ kind: 'cardPlayed', side, card });
  }

  _killPiece(piece, events) {
    if (piece.mirror) {
      const card = piece.mirror;
      const owner = piece.mirrorSide || piece.side;
      this.cardState[owner].discard.push(card);
      this.highlightUid[owner] = card.uid;
      events.push({ kind: 'mirrorDropped', ownerId: piece.id, card });
      piece.mirror = null;
      piece.mirrorSide = null;
    }
    // ★ Сразу переводим жетон на базу в состоянии — анимацию играет view.
    //   Это критично для мультиплеера: состояние должно быть консистентным
    //   в момент события, а не когда клиент доиграет анимацию.
    const baseId = piece.side === 'white' ? BASE_WHITE_ID : BASE_BLACK_ID;
    piece.cellId = baseId;
    piece.hp = piece.maxHp;
    this._applyReviveBuff(piece, events);

    events.push({ kind: 'pieceDied', pieceId: piece.id });
    events.push({ kind: 'deathOrbFromPiece', pieceId: piece.id, side: piece.side });
  }

  _applyReviveBuff(piece, events) {
    if (piece.role !== 'regular') return;
    if (this.teamConfig[piece.side].captain !== 'il') return;
    if (piece.captainBuffApplied) return;
    piece.captainBuffApplied = true;
    piece.maxHp += 1;
    piece.hp += 1;
    events.push({ kind: 'captainBuffApplied', pieceId: piece.id, newMaxHp: piece.maxHp });
  }

  _changeMight(side, delta, events) {
    const from = this.might[side];
    const to = Math.max(0, from + delta);
    if (from === to) return;
    this.might[side] = to;
    events.push({ kind: 'mightChanged', side, from, to });
  }

  _checkVictory(events) {
    if (this.gameOver) return;
    if (this.might.white <= 0) {
      this.gameOver = true; this.winner = 'black';
      events.push({ kind: 'gameWon', winner: 'black' });
      return;
    }
    if (this.might.black <= 0) {
      this.gameOver = true; this.winner = 'white';
      events.push({ kind: 'gameWon', winner: 'white' });
    }
  }

  _takeTurnSnapshot() { this.turnSnapshot = this._snapshot(); }

  _snapshot() {
    return JSON.parse(JSON.stringify({
      rngState: this.rngState,
      uidCounter: this.uidCounter,
      teamConfig: this.teamConfig,
      // ★ Каждый piece разворачиваем в «плоский» объект без вложенного
      //   profile — на клиенте profile восстанавливается из PROFILES
      //   по profileKey. Это ~30% размера снапшота и убирает дублирование
      //   одного и того же объекта PROFILES[key] в каждом piece.
      pieces: this.pieces.map(p => ({
        id: p.id,
        profileKey: p.profileKey,
        side: p.side,
        role: p.role,
        speed: p.speed,
        strength: p.strength,
        hp: p.hp,
        maxHp: p.maxHp,
        influence: p.influence,
        name: p.name,
        cellId: p.cellId,
        mirror: p.mirror,
        mirrorSide: p.mirrorSide,
        captainBuffApplied: p.captainBuffApplied,
      })),
      might: this.might,
      cardState: this.cardState,
      currentTurn: this.currentTurn,
      turnNumber: this.turnNumber,
      locationBonusUsed: this.locationBonusUsed,
      actionTakenThisTurn: this.actionTakenThisTurn,
      hasDiscardedThisTurn: this.hasDiscardedThisTurn,
      revealState: this.revealState,
      gameOver: this.gameOver,
      winner: this.winner,
      bonusAvailabilitySnapshot: this.bonusAvailabilitySnapshot,
      pendingEndTurnAfterOrbs: this.pendingEndTurnAfterOrbs,
      highlightUid: this.highlightUid,
    }));
  }

  _restore(snap) {
    const s = JSON.parse(JSON.stringify(snap));
    this.rngState = s.rngState;
    this.uidCounter = s.uidCounter;
    this.teamConfig = s.teamConfig;
    // ★ Восстанавливаем profile из PROFILES по profileKey. Снапшот
    //   хранит только profileKey (см. _snapshot), сам объект профиля
    //   один и тот же — незачем гонять его по сети.
    this.pieces = (s.pieces || []).map(p => ({
      ...p,
      profile: PROFILES[p.profileKey],
    }));
    this.might = s.might;
    this.cardState = s.cardState;
    this.currentTurn = s.currentTurn;
    this.turnNumber = s.turnNumber;
    this.locationBonusUsed = s.locationBonusUsed;
    this.actionTakenThisTurn = s.actionTakenThisTurn;
    this.hasDiscardedThisTurn = s.hasDiscardedThisTurn;
    this.revealState = s.revealState;
    this.gameOver = s.gameOver;
    this.winner = s.winner;
    this.bonusAvailabilitySnapshot = s.bonusAvailabilitySnapshot;
    this.pendingEndTurnAfterOrbs = s.pendingEndTurnAfterOrbs;
    this.highlightUid = s.highlightUid || { white: null, black: null };
  }

  getState() { return this._snapshot(); }

  static fromState(state, opts = {}) {
    const g = Object.create(Game.prototype);
    g.seed = opts.seed ?? 0;
    g._restore(state);
    g.turnSnapshot = null;
    return g;
  }
}

export function computePiecePositions(pieces) {
  const result = new Map();
  const byCell = {};
  pieces.forEach(p => {
    if (!byCell[p.cellId]) byCell[p.cellId] = [];
    byCell[p.cellId].push(p);
  });
  Object.entries(byCell).forEach(([cellIdStr, list]) => {
    const cellId = parseInt(cellIdStr);
    const cell = getPoint(cellId);
    const n = list.length;
    const isBase = cell.type === 'base-white' || cell.type === 'base-black';
    const step = isBase ? 1.15 : 0.75;
    list.forEach((p, i) => {
      const offset = n > 1 ? (i - (n - 1) / 2) * step : 0;
      if (isBase) result.set(p.id, { x: cell.x, z: cell.z + offset });
      else result.set(p.id, { x: cell.x + offset, z: cell.z });
    });
  });
  return result;
}