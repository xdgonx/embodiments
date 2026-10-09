// ============================================================================
// view.js — слой отображения. Three.js + DOM. Без игровой логики.
// ============================================================================

import * as THREE from 'three';
import {
  BOARD, BOARD_WIDTH, BOARD_HEIGHT,
  TOKEN_RADIUS, COIN_HEIGHT, CAPTAIN_TOKEN_RADIUS, CAPTAIN_TOKEN_HEIGHT,
  BASE_WHITE_ID, BASE_BLACK_ID, BLUE_CELLS,
  COLOR_RED, COLOR_YELLOW,
  LOCATION_BONUS_IDS, LOCATION_CELLS,
  CONDITIONAL,
  PROFILES, getPoint, pxTo3D, getCaptainSlotPosition,
  computePiecePositions,
  EXPLORE_HIGHLIGHT_OFFSET,
} from './game.js';

const VIRTUAL_W = 1920;
const VIRTUAL_H = 1080;
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches
              || window.matchMedia('(hover: none)').matches;
const IS_MOBILE = IS_TOUCH && window.matchMedia('(max-width: 1200px)').matches;
document.documentElement.classList.toggle('is-touch', IS_TOUCH);
document.documentElement.classList.toggle('is-mobile', IS_MOBILE);

const MOBILE_BONUS_Y_OFFSET = 10;
const MOBILE_MIRROR_Y_LIFT = 18;
const LOCATION_BONUS_POSITIONS = {
  white: { 1:{x:400,y:1220}, 2:{x:1150,y:1220}, 4:{x:2630,y:1220}, 5:{x:3380,y:1220} },
  black: { 1:{x:3680,y:1220}, 2:{x:2930,y:1220}, 4:{x:1450,y:1220}, 5:{x:700,y:1220} },
};
const LOCATION_ORDINALS = { 1:'первой', 2:'второй', 4:'четвёртой', 5:'пятой' };

// ★ Цвет кольца «убийственного» пузырька могущества — того, который
//   довёл могущество жертвы до 0. Меняется в одном месте; см. также
//   функцию getKillerRingColor ниже. Обычные пузырьки используют
//   свой цвет по команде-жертве, он задан в _launch*Orbs.
const KILLER_RING_COLOR = {
  white: '#000000',  // обнулил могущество БЕЛОЙ команды → чёрное кольцо
  black: '#ffffff',  // обнулил могущество ЧЁРНОЙ команды → белое кольцо
};

// ★ Возвращает цвет кольца для пузырька с заданной стороной-жертвой.
//   side — сторона, чьё могущество упало ('white' | 'black').
//   isKiller — довёл ли этот пузырёк могущество до 0.
//   baseRingCss — «обычный» цвет для этой стороны, если пузырёк не убийца.
function getKillerRingColor(side, isKiller, baseRingCss) {
  return isKiller ? KILLER_RING_COLOR[side] : baseRingCss;
}
const MIRROR_BADGE_CROP = { yTop: 0.15, sideFrac: 1.0 };
const MIRROR_BADGE_SIZE = 0.60;
const MIRROR_BADGE_OFFSET_Z = 0.6;
const MIRROR_BADGE_HEIGHT = 0.35;
const MIRROR_BADGE_TILT_DEG = 20;
const MIRROR_SHIMMER_INTERVAL = 4.0;
const MIRROR_SHIMMER_DURATION = 1.4;

const HEARTS_LAYOUT_DEFAULT = { topPercent: 82.805, leftPercent: 6.47, slotWidthPercent: 10, gapPercent: 1, count: 8 };
const HEARTS_LAYOUTS = {};
const HEART_ICONS = { filled: 'tablets/hearts/filled.png', dark: 'tablets/hearts/dark.png', max: 'tablets/hearts/max.png' };
const STAT_POSITIONS_DEFAULT = {
  strength: { xPercent: 76.2, yPercent: 27, rotateDeg: -8 },
  speed:    { xPercent: 92,   yPercent: 27, rotateDeg: -8 },
};
const STAT_POSITIONS_BY_CHAR = {};
const CAPTAIN_ABILITY_TEXT = { il: 'Здоровье увеличивается даже при исследовании базы' };

// ============================================================
// Утилиты
// ============================================================

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Не загружено: ' + src));
    img.src = src;
  });
}

function colorToRgba(hex, a) {
  let n = hex;
  if (typeof n === 'string') n = n.startsWith('#') ? parseInt(n.slice(1), 16) : parseInt(n, 16);
  return `rgba(${(n>>16)&0xff},${(n>>8)&0xff},${n&0xff},${a})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShapePath(ctx, cx, cy, r, shape) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else if (shape === 'square') {
    const half = r * 0.85, rad = half * 0.22;
    roundRectPath(ctx, cx - half, cy - half, half * 2, half * 2, rad);
  } else if (shape === 'star5') {
    const spikes = 5, outer = r, inner = r * 0.42;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      const rad = (i % 2 === 0) ? outer : inner;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (shape === 'blob') {
    const points = 40;
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const wobble = 1 + 0.10 * Math.sin(a * 3 + 0.7) + 0.06 * Math.cos(a * 5 + 1.3);
      const rad = r * wobble;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

function drawHeartShape(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.85);
  ctx.bezierCurveTo(cx - r * 1.35, cy - r * 0.15, cx - r * 0.6, cy - r * 1.05, cx, cy - r * 0.3);
  ctx.bezierCurveTo(cx + r * 0.6, cy - r * 1.05, cx + r * 1.35, cy - r * 0.15, cx, cy + r * 0.85);
  ctx.closePath();
}

// ============================================================
// Фабрики текстур
// ============================================================

function createShapeTexture(shape, fillColor, ringColor, opts = {}) {
  const S = 256, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const cx = S/2, cy = S/2, r = S/2 - 10;
  const ringWidth = opts.ringWidth ?? 14, fillAlpha = opts.fillAlpha ?? 0.55;
  const ringAlpha = opts.ringAlpha ?? 0.95, underlayBlack = opts.underlayBlack ?? false;
  const innerShape = opts.innerShape ?? null, innerColor = opts.innerColor ?? ringColor;
  const innerAlpha = opts.innerAlpha ?? 1.0, innerSizeFrac = opts.innerSizeFrac ?? 0.42;
  if (underlayBlack) {
    ctx.save();
    drawShapePath(ctx, cx, cy, r - ringWidth/2, shape);
    ctx.strokeStyle = 'rgba(20,8,28,0.9)'; ctx.lineWidth = ringWidth + 20;
    ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  }
  ctx.save();
  drawShapePath(ctx, cx, cy, r, shape);
  ctx.fillStyle = colorToRgba(fillColor, fillAlpha); ctx.fill(); ctx.restore();
  if (innerShape) {
    ctx.save();
    drawShapePath(ctx, cx, cy, r * innerSizeFrac + 0.03 * r, innerShape);
    ctx.fillStyle = 'rgba(15,8,25,0.85)'; ctx.fill();
    drawShapePath(ctx, cx, cy, r * innerSizeFrac, innerShape);
    ctx.fillStyle = colorToRgba(innerColor, innerAlpha); ctx.fill(); ctx.restore();
  }
  ctx.save();
  drawShapePath(ctx, cx, cy, r - ringWidth/2, shape);
  ctx.strokeStyle = colorToRgba(ringColor, ringAlpha);
  ctx.lineWidth = ringWidth; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

function createDashedRingTexture(colorHex, opts = {}) {
  const S = 256, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const cx = S/2, cy = S/2, r = S/2 - 16;
  const shape = opts.shape || 'circle', underlay = opts.underlayBlack ?? false;
  const dashes = 16, dashArc = (Math.PI*2/dashes) * 0.55;
  function seg(a0, a1, lw, col) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  }
  if (underlay) for (let i = 0; i < dashes; i++) {
    const a0 = (i/dashes)*Math.PI*2; seg(a0, a0+dashArc, 23, 'rgba(20,8,28,0.9)');
  }
  for (let i = 0; i < dashes; i++) {
    const a0 = (i/dashes)*Math.PI*2; seg(a0, a0+dashArc, 9, colorToRgba(colorHex, 1.0));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

function createSelectorRingTexture(colorHex) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const r = (colorHex >> 16) & 0xff, g = (colorHex >> 8) & 0xff, b = colorHex & 0xff;
  const base = `rgba(${r},${g},${b},0.95)`;
  const dotR = Math.min(255,r+50), dotG = Math.min(255,g+50), dotB = Math.min(255,b+50);
  const dot = `rgba(${dotR},${dotG},${dotB},1)`;
  const mid = `rgba(${r},${g},${b},0.5)`;
  ctx.beginPath(); ctx.arc(128,128,118,0,Math.PI*2);
  ctx.strokeStyle = 'rgba(20,8,28,0.9)'; ctx.lineWidth = 22; ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i/12)*Math.PI*2;
    ctx.beginPath(); ctx.arc(128+Math.cos(a)*110, 128+Math.sin(a)*110, 11, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(20,8,28,0.9)'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(128,128,118,0,Math.PI*2);
  ctx.strokeStyle = base; ctx.lineWidth = 10; ctx.stroke();
  ctx.beginPath(); ctx.arc(128,128,100,0,Math.PI*2);
  ctx.strokeStyle = mid; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i/12)*Math.PI*2;
    ctx.beginPath(); ctx.arc(128+Math.cos(a)*110, 128+Math.sin(a)*110, 6, 0, Math.PI*2);
    ctx.fillStyle = dot; ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTeleportRingTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const purple = 'rgba(105,25,180,1)', bright = 'rgba(170,70,230,1)';
  ctx.beginPath(); ctx.arc(128,128,118,0,Math.PI*2);
  ctx.strokeStyle = 'rgba(20,8,28,0.9)'; ctx.lineWidth = 15; ctx.stroke();
  ctx.beginPath(); ctx.arc(128,128,105,0,Math.PI*2);
  ctx.strokeStyle = 'rgba(20,8,28,0.9)'; ctx.lineWidth = 15;
  ctx.setLineDash([12,10]); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(128,128,92,0,Math.PI*2);
  ctx.strokeStyle = 'rgba(20,8,28,0.9)'; ctx.lineWidth = 15; ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i/6)*Math.PI*2;
    const cx = 128+Math.cos(a)*105, cy = 128+Math.sin(a)*105;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0,-18); ctx.lineTo(14,0); ctx.lineTo(0,18); ctx.lineTo(-14,0);
    ctx.closePath(); ctx.fillStyle = 'rgba(20,8,28,0.9)'; ctx.fill(); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(128,128,118,0,Math.PI*2);
  ctx.strokeStyle = purple; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); ctx.arc(128,128,105,0,Math.PI*2);
  ctx.strokeStyle = purple; ctx.lineWidth = 5;
  ctx.setLineDash([12,10]); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(128,128,92,0,Math.PI*2);
  ctx.strokeStyle = purple; ctx.lineWidth = 5; ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i/6)*Math.PI*2;
    const cx = 128+Math.cos(a)*105, cy = 128+Math.sin(a)*105;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(8,0); ctx.lineTo(0,12); ctx.lineTo(-8,0);
    ctx.closePath(); ctx.fillStyle = bright; ctx.fill(); ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================
// Меш фигур
// ============================================================

function createPieceMesh(teamColorHex, outlineColorHex, tokenTexture, opts = {}) {
  const radius = opts.radius ?? TOKEN_RADIUS;
  const height = opts.height ?? COIN_HEIGHT;
  const withSelector = opts.withSelector !== false;
  const group = new THREE.Group();

  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 48),
    new THREE.MeshStandardMaterial({
      color: teamColorHex, roughness: 0.55, metalness: 0.35,
      emissive: teamColorHex, emissiveIntensity: 0.15,
    })
  );
  coin.position.y = height / 2;
  coin.castShadow = true;
  coin.receiveShadow = true;
  group.add(coin);

  const edgeMat = new THREE.MeshStandardMaterial({
    color: outlineColorHex, roughness: 0.4, metalness: 0.3,
    emissive: outlineColorHex, emissiveIntensity: 0.15,
  });
  const topEdge = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 8, 48), edgeMat);
  topEdge.rotation.x = Math.PI / 2; topEdge.position.y = height; group.add(topEdge);

  const bottomEdge = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 8, 48), edgeMat);
  bottomEdge.rotation.x = Math.PI / 2; bottomEdge.position.y = 0.001; group.add(bottomEdge);

  const top = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.99, 48),
    new THREE.MeshBasicMaterial({
      map: tokenTexture, transparent: true, depthWrite: true, side: THREE.FrontSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = height + 0.005;
  top.renderOrder = 3;
  group.add(top);

  if (withSelector) {
    const ringTex = createSelectorRingTexture(teamColorHex);
    const selectorRing = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2.6, radius * 2.6),
      new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
    );
    selectorRing.rotation.x = -Math.PI / 2;
    selectorRing.position.y = height + 0.03;
    selectorRing.renderOrder = 200;
    selectorRing.visible = false;
    group.add(selectorRing);
  }
  return group;
}

// ============================================================
// HP-полоска и спрайт
// ============================================================

let HEART_IMG = null, HEART_DARK_IMG = null;
let EXPLORE_ICON_IMG = null, DEATH_ICON_IMG = null, MID_ICON_IMG = null;

function drawHpBar(canvas, hp, maxHp, opts = {}) {
  const tight = !!opts.tightFit;
  const baseSize = 150, baseCount = 4;
  const heartSize = tight ? Math.max(50, Math.round(baseSize*baseCount/Math.max(1,maxHp))) : baseSize;
  const gap = Math.round(-heartSize / 6);
  const totalW = maxHp*heartSize + (maxHp-1)*gap;
  const padding = 20;
  if (tight) {
    canvas.width = Math.ceil(totalW + padding);
    canvas.height = Math.round(heartSize + 20);
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const startX = (canvas.width - totalW) / 2;
  const cy = canvas.height / 2;

  for (let i = maxHp - 1; i >= 0; i--) {
    const cx = startX + i * (heartSize + gap) + heartSize / 2;
    const filled = i < hp;
    if (HEART_IMG) {
      const size = heartSize + 20;
      const src = filled ? HEART_IMG : (HEART_DARK_IMG || HEART_IMG);
      const backR = size * 0.34;
      ctx.save();
      drawHeartShape(ctx, cx, cy - backR * 0.1, backR);
      ctx.fillStyle = filled ? 'rgba(180,25,70,0.95)' : 'rgba(0,0,0,0.95)';
      ctx.strokeStyle = filled ? 'rgba(255,140,180,1)' : 'rgba(190,190,210,0.95)';
      ctx.fill(); ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
      if (filled) {
        ctx.save();
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size*0.48);
        g.addColorStop(0, 'rgba(255,105,180,0.95)');
        g.addColorStop(0.55, 'rgba(255,105,180,0.55)');
        g.addColorStop(1, 'rgba(255,105,180,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx-size/2, cy-size/2, size, size);
        ctx.restore();
      }
      ctx.drawImage(src, cx-size/2, cy-size/2, size, size);
    } else {
      ctx.save();
      drawHeartShape(ctx, cx, cy, heartSize * 0.4);
      ctx.fillStyle = filled ? '#ff69b4' : '#333';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
}

function createHpSprite(maxHp) {
  const canvas = document.createElement('canvas');
  canvas.width = 1500; canvas.height = 180;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.0, 0.36, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 300;
  sprite.visible = false;
  sprite.userData.maxHp = maxHp;
  return sprite;
}

// ============================================================
// Токен фигуры (текстура)
// ============================================================

function createTokenTexture(img, outlineCss) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size/2;
  const outerR = size/2 - 4;
  const imgR = outerR - 6;
  ctx.beginPath(); ctx.arc(center, center, outerR, 0, Math.PI*2);
  ctx.fillStyle = '#0a0a14'; ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(center, center, imgR, 0, Math.PI*2); ctx.clip();
  const scale = Math.max((imgR*2)/img.width, (imgR*2)/img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, center - w/2, center - h/2, w, h);
  ctx.restore();
  ctx.beginPath(); ctx.arc(center, center, outerR - 2, 0, Math.PI*2);
  ctx.strokeStyle = outlineCss; ctx.lineWidth = 6; ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ============================================================
// Пузырьки могущества
// ============================================================

function createOrbSprite(colorCss, iconImage, opts = {}) {
  const size = 128;
  // ★ opts.shape: 'circle' (по умолчанию) или 'square'. Квадрат —
  //   для убийственного пузырька, чтобы игрок сразу видел, какой
  //   именно удар стал решающим. Квадрат рисуется со скруглением,
  //   чтобы читался как «пузырёк-квадрат», а не как UI-панель.
  const shape = opts.shape === 'square' ? 'square' : 'circle';
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size/2, cy = size/2, r = size/2 - 8;

  // ★ Хелпер: рисует контур пузырька нужной формы с «радиусом» rad
  //   (для квадрата rad — это полусторона, т.е. расстояние от центра
  //   до середины каждой стороны).
  const shapePath = (rad) => {
    ctx.beginPath();
    if (shape === 'square') {
      const rr = rad * 0.30;
      roundRectPath(ctx, cx - rad, cy - rad, rad * 2, rad * 2, rr);
    } else {
      ctx.arc(cx, cy, rad, 0, Math.PI*2);
    }
  };

  // Внешнее мягкое свечение.
  const grad = ctx.createRadialGradient(cx, cy, r*0.5, cx, cy, r);
  grad.addColorStop(0, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); shapePath(r); ctx.fillStyle = grad; ctx.fill(); ctx.restore();

  // Тёмная заливка.
  ctx.save(); shapePath(r*0.82); ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fill(); ctx.restore();

  // ★ Цветная подсветка внутри, под иконкой.
  //   opts.innerGlow — hex-строка ('#ff8800'). Если не задана — нет.
  const innerGlow = opts.innerGlow || null;
  if (innerGlow) {
    const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r*0.82);
    innerGrad.addColorStop(0.00, colorToRgba(innerGlow, 0.85));
    innerGrad.addColorStop(0.55, colorToRgba(innerGlow, 0.35));
    innerGrad.addColorStop(1.00, colorToRgba(innerGlow, 0));
    ctx.save();
    shapePath(r*0.82);
    ctx.clip();
    ctx.fillStyle = innerGrad; ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  // Кольцо по форме.
  ctx.save();
  shapePath(r*0.82);
  ctx.strokeStyle = colorCss; ctx.lineWidth = 8; ctx.stroke();
  ctx.restore();

  // Иконка поверх.
  if (iconImage) {
    const iconSize = r * 1.35;
    ctx.drawImage(iconImage, cx-iconSize/2, cy-iconSize/2, iconSize, iconSize);
  } else {
    ctx.strokeStyle = colorCss; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cx-8, cy-8, r*0.34, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+r*0.16, cy+r*0.16); ctx.lineTo(cx+r*0.5, cy+r*0.5); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.75, 0.75, 1);
  sprite.renderOrder = 400;
  return sprite;
}

// ============================================================
// View
// ============================================================

export class View {
  constructor(opts = {}) {
    this.opts = opts;
    this.game = null;
    this.net = null;

    this.ui = {
      selectedCardUid: null,
      selectedPieceId: null,
      pendingMode: null,
      plannedPath: [],
      selectedAttackTargetId: null,
      selectedMirrorTargetId: null,
      selectedExploreBase: null,
      discardMode: false,
      discardPickUid: null,
      discardLocked: false,
      endTurnPanelOpen: false,
      activePanel: null,
      bonus4Phase: null,
      bonus4HandUid: null,
      bonus4DiscardUid: null,
      bonus5Phase: null,
      bonus5PieceId: null,
      bonus5TargetCell: null,
      loc1SelectedUid: null,
    };

    this.animating = null;
    this.powerOrbs = [];
    this.captainBreakAnimations = [];
    this.captainVictoryMoves = new Map();
    this.attackOverrides = new Map();
    this.queuedRevives = [];
    this.revivingIds = new Set();
    this._eventQueue = [];
    this._pendingStateSync = false;

    // ★ Сколько карт прямо сейчас «в полёте» к колоде. Пока > 0,
    //   _renderDeckVisuals показывает прежний размер и прежний топ;
    //   каждое прилётие ghost'а уменьшает счётчик на 1 и «раскрывает»
    //   следующую карту наверху.
    this._pendingDeckReturns = { white: 0, black: 0 };

    this._pendingDeathAfterAttack = null;
    this._pendingDeathOrbFromAttack = null;

    this.stadiumHighlights = [];

    this.hpBlink = {
      pieceId: null, realHp: 0, predictedHp: 0,
      phase: 0, timer: 0, interval: 0.45, locked: false,
    };

    this.extrasVisible = false;

    this.pieceMeshes = new Map();
    this.captainMeshes = { white: null, black: null };
    this.mirrorMeshes = new Map();
    this.mirrorState = new Map();
    this.locationBonusButtons = {};
    this.mirrorFieldReminders = new Map();

    this.pieceTextures = new Map();
    this.mirrorTextures = new Map();
    this.shimmerTexture = null;
    this.preloaded = false;
    this._preloadImgs = [];

    this.ctrlPressed = false;
    this.hoveredPieceId = null;
    this.hoveredCaptainSide = null;
    this.hoveredBadgeCard = null;
    this.hoveredCard = null;
    this.hoveredTabletCard = null;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.overlayShownCardUid = null;

    this.longPressTimer = null;
    this.longPressActive = false;
    this.longPressStartX = 0;
    this.longPressStartY = 0;
    this.lastTouchX = 0;
    this.lastTouchY = 0;
    this.suppressNextClick = false;

    this.debugShowAllBonuses = false;
    this.revealCardElements = [];
    this.fsRequested = false;

    // ★ Защита от даблклика по кнопке «Подготовка к завершению хода»,
    //   пока идёт последовательный возврат карт вскрытия (2 resolve'а
    //   с задержкой 120 мс). Явно объявлен, чтобы не полагаться на
    //   неявный undefined.
    this._abortingReveal = false;
	
    // ★ Зум/пан поля. zoom = 1 — «вписать в экран», больше — приближение.
    //   camTarget — точка на плоскости стола, куда смотрит камера;
    //   двигается пан-жестом. Ничего в игровой логике не меняет —
    //   только двигает камеру.
    this._zoom = 1;
    this._zoomMin = 1;
    this._zoomMax = 2.0;
    this._camTarget = { x: 0, z: 0 };
    this._vw = 0;
    this._vh = 0;
    this._pinch = null;
    // ★ Не даём «фантомному» клику после pinch-жеста сработать
    //   на канвас (браузер иногда стреляет click после мультитача).
    this._suppressClickUntil = 0;
	
    // ★ Сколько пузырьков прямо сейчас в полёте к капитану каждой
    //   стороны. Нужно, чтобы при создании нового пузырька предсказать,
    //   окажется ли он убийственным. Пузырьки летят строго
    //   последовательно (прилетел → might−1 → следующий), поэтому
    //   предсказание точное. При прилёте счётчик уменьшается
    //   (см. _updatePowerOrbs).
    this._pendingMightLoss = { white: 0, black: 0 };

    // Слой для ghost-карт (анимации полёта карт между UI-элементами).
    this.flyLayer = document.getElementById('fly-cards-layer');
    if (!this.flyLayer) {
      this.flyLayer = document.createElement('div');
      this.flyLayer.id = 'fly-cards-layer';
      document.body.appendChild(this.flyLayer);
    }

    // Очередь карт, которые надо анимировать «из колоды в руку»
    // после ближайшего rAF (тогда DOM уже актуален).
    this._pendingHandAnims = [];

    // ★ uid-ы карт, для которых стандартную анимацию «из колоды в руку»
    //   запускать не нужно — они приедут из сброса (бонус 4).
    this._suppressHandAnimUids = new Set();

    this._buildScene();
    this._buildDomRefs();
    this._wireInput();
    this._startRenderLoop();

    this.preloadAllImages();
  }

  async init() {
    await this._preloadAllTextures();
    this.preloaded = true;
  }

  setGame(game) {
    this.game = game;
    if (this.preloaded) {
      this._updateConditionalArrows();
      this.syncFromGame();
    }
  }

  setNet(net) {
    this.net = net;
    if (net) {
      net.onAction = (result) => {
        if (result.ok) this.playEvents(result.events || []);
      };
      net.onState = () => {
        // ★ Если играет анимация или ждут события — не сношаем сцену.
        //   Сначала домотаем локальную очередь, потом догоним state.
        //   Иначе жетоны в анимации дёрнутся, HP-спрайты моргнут, а
        //   trail от ghost'а останется висеть в воздухе.
        if (this.animating || this._eventQueue.length > 0) {
          this._pendingStateSync = true;
          return;
        }
        this.syncFromGame();
      };
    }
  }

  dispatch(action) {
    // В сетевом режиме всегда отправляем на сервер — очередью анимаций
    // и валидностью действия занимается сервер, а не view. Локальный
    // guard `if (this.animating)` нужен только для сингла, чтобы
    // спам-клики не мутировали состояние посреди анимации.
    if (this.net) { this.net.send(action); return; }
    if (this.animating) return;
    if (!this.game) return;

    // ★ Захватываем позицию карты в руке ДО того, как логика её уберёт.
    const flyCtx = this._captureFlyForAction(action);

    const result = this.game.applyAction(action);
    if (!result.ok) { console.warn('Action rejected:', result.error, action); return; }
    this.playEvents(result.events || []);
    this.syncFromGame();

    // ★ Запускаем полёт из старой позиции в новую.
    if (flyCtx) this._launchFlyForAction(flyCtx, action);
  }

  // События, которые стартуют анимацию. Если такое приходит, пока
  // играет другая анимация — ждём её завершения. Все остальные события
  // (markers, no-op, победа) обрабатываются сразу.
  static BLOCKING_EVENTS = new Set([
    'pieceMoved',
    'attackResolved',
    'powerOrbsFromCenter',
    'exploreResolved',
    'locationBonus5Applied',
    'turnChanged',
  ]);

  playEvents(events) {
    if (events && events.length > 0) {
      for (const ev of events) this._eventQueue.push(ev);
    }
    this._drainEventQueue();
  }

  _drainEventQueue() {
    while (this._eventQueue.length > 0) {
      const next = this._eventQueue[0];
      if (this.animating && View.BLOCKING_EVENTS.has(next.kind)) break;
      this._eventQueue.shift();
      try {
        this.playEvent(next);
      } catch (err) {
        console.error('playEvent error:', next && next.kind, err);
      }
    }
    this.syncFromGame();
    // ★ Если за время обработки сервер прислал state — сбрасываем флаг.
    this._pendingStateSync = false;
  }

  syncFromGame() {
    if (!this.game) return;
    // Если прелоад не закончился — ставим флаг, `init()` перерисует
    // после завершения (см. `setGame`). Иначе при загрузке страницы
    // state может прийти раньше, чем текстуры готовы.
    if (!this.preloaded) {
      this._pendingStateSync = true;
      return;
    }
    this.renderAll();
  }

  // ----------------------------------------------------------
  // Предзагрузка
  // ----------------------------------------------------------

  preloadAllImages() {
    const paths = new Set();
    paths.add('board.png');
    paths.add('cards/back.png');
    [
      'ui/move.png', 'ui/attack.png', 'ui/explore.png', 'ui/spell.png',
      'ui/mirror.png', 'ui/reset.png', 'ui/death.png', 'ui/mid.png',
      'ui/hearts/heart.png', 'ui/hearts/heart_dark.png',
    ].forEach(p => paths.add(p));
    ['filled', 'dark', 'max'].forEach(v => paths.add(`tablets/hearts/${v}.png`));
    ['white', 'black'].forEach(side => {
      LOCATION_BONUS_IDS.forEach(id => paths.add(`ui/${side}_loc${id}.png`));
    });
    Object.keys(PROFILES).forEach(key => {
      paths.add(`pieces/${key}.png`);
      paths.add(`pieces/${key}_captain.png`);
      paths.add(`tablets/${key}_front.png`);
      paths.add(`tablets/${key}_back.png`);
      ['1', '2', 'ult'].forEach(v => paths.add(`cards/${key}_${v}.png`));
    });
    paths.forEach(src => {
      const img = new Image();
      img.src = src;
      this._preloadImgs.push(img);
    });
  }

  async _preloadAllTextures() {
    const tasks = [];

    tasks.push(loadImage('ui/hearts/heart.png').then(i => HEART_IMG = i).catch(() => {}));
    tasks.push(loadImage('ui/hearts/heart_dark.png').then(i => HEART_DARK_IMG = i).catch(() => {}));
    tasks.push(loadImage('ui/explore.png').then(i => EXPLORE_ICON_IMG = i).catch(() => {}));
    tasks.push(loadImage('ui/death.png').then(i => DEATH_ICON_IMG = i).catch(() => {}));
    tasks.push(loadImage('ui/mid.png').then(i => MID_ICON_IMG = i).catch(() => {}));

    ['filled', 'dark', 'max'].forEach(v => {
      tasks.push(
        loadImage(`tablets/hearts/${v}.png`)
          .then(img => img.decode ? img.decode().catch(() => {}) : null)
          .catch(() => {})
      );
    });

    const profileKeys = Object.keys(PROFILES);
    for (const key of profileKeys) {
      for (const kind of ['regular', 'captain']) {
        for (const side of ['white', 'black']) {
          const src = kind === 'captain' ? PROFILES[key].captainSprite : PROFILES[key].sprite;
          const outlineCss = side === 'white' ? '#ffffff' : '#0a0a0a';
          const texKey = `${key}_${kind}_${side}`;
          tasks.push(
            loadImage(src)
              .then(img => { this.pieceTextures.set(texKey, createTokenTexture(img, outlineCss)); })
              .catch(() => {
                const c = document.createElement('canvas');
                c.width = 256; c.height = 256;
                const cx = c.getContext('2d');
                cx.fillStyle = PROFILES[key].ringColor;
                cx.fillRect(0, 0, 256, 256);
                const tex = new THREE.CanvasTexture(c);
                tex.colorSpace = THREE.SRGBColorSpace;
                this.pieceTextures.set(texKey, tex);
              })
          );
        }
      }
    }

    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0.00, 'rgba(255,255,255,0)');
    grad.addColorStop(0.42, 'rgba(255,255,255,0.05)');
    grad.addColorStop(0.50, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.58, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 512);
    const shimmer = new THREE.CanvasTexture(c);
    shimmer.colorSpace = THREE.SRGBColorSpace;
    shimmer.wrapS = THREE.RepeatWrapping;
    shimmer.wrapT = THREE.ClampToEdgeWrapping;
    this.shimmerTexture = shimmer;

    await Promise.all(tasks);
  }

  _getPieceTexture(profileKey, side, kind) {
    const key = `${profileKey}_${kind}_${side}`;
    return this.pieceTextures.get(key);
  }

  // ----------------------------------------------------------
  // Сцена
  // ----------------------------------------------------------

  _buildScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000008);

    this.camera = new THREE.PerspectiveCamera(50, VIRTUAL_W / VIRTUAL_H, 0.1, 2000);
    this.camera.position.set(0, 14, 9);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    const dpr = window.devicePixelRatio || 1;
    const capped = Math.min(dpr, 3);
    this.renderer.setPixelRatio(capped);
    this.renderer.setSize(VIRTUAL_W, VIRTUAL_H);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 15, 8); dir.castShadow = true; this.scene.add(dir);
    const fill = new THREE.PointLight(0x6688ff, 0.7, 40);
    fill.position.set(0, -3, 2); this.scene.add(fill);

    const sg = new THREE.BufferGeometry();
    const COUNT = 2500;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const r = 300 + Math.random() * 400;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
      pos[i*3+1] = r * Math.sin(ph) * Math.sin(th);
      pos[i*3+2] = r * Math.cos(ph);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0.9,
    }));
    this.scene.add(this.stars);

    this.floatGroup = new THREE.Group();
    this.scene.add(this.floatGroup);
    this.hpSpriteGroup = new THREE.Group();
    this.floatGroup.add(this.hpSpriteGroup);

    this.condArrowsGroup = new THREE.Group();
    this.floatGroup.add(this.condArrowsGroup);
    this.condArrows = [];
    CONDITIONAL.forEach(c => {
      const start3D = pxTo3D(c.start[0], c.start[1]);
      const end3D = pxTo3D(c.end[0], c.end[1]);
      const dx = end3D.x - start3D.x, dz = end3D.z - start3D.z;
      const len = Math.hypot(dx, dz);
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(dx / len, 0, dz / len),
        new THREE.Vector3(start3D.x, 0.05, start3D.z),
        len - 0.1, c.color, 0.32, 0.20
      );
      arrow.visible = false;
      this.condArrowsGroup.add(arrow);
      this.condArrows.push({ arrow, data: c });
    });

    this.reachableGroup      = new THREE.Group(); this.floatGroup.add(this.reachableGroup);
    this.plannedPathGroup    = new THREE.Group(); this.floatGroup.add(this.plannedPathGroup);
    this.attackTargetsGroup  = new THREE.Group(); this.floatGroup.add(this.attackTargetsGroup);
    this.attackSelectedGroup = new THREE.Group(); this.floatGroup.add(this.attackSelectedGroup);
    this.mirrorTargetsGroup  = new THREE.Group(); this.floatGroup.add(this.mirrorTargetsGroup);
    this.mirrorSelectedGroup = new THREE.Group(); this.floatGroup.add(this.mirrorSelectedGroup);
    this.exploreTargetsGroup = new THREE.Group(); this.floatGroup.add(this.exploreTargetsGroup);
    this.exploreSelectedGroup= new THREE.Group(); this.floatGroup.add(this.exploreSelectedGroup);

    const tex = new THREE.TextureLoader().load('board.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_WIDTH, BOARD_HEIGHT),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide })
    );
    board.rotation.x = -Math.PI / 2;
    board.receiveShadow = true;
    this.floatGroup.add(board);

    this.clickTargets = [];
    BOARD.forEach(p => {
      const hit = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 24),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false })
      );
      hit.rotation.x = -Math.PI / 2;
      hit.position.set(p.x, 0.04, p.z);
      hit.renderOrder = -1;
      hit.userData = { cellId: p.id };
      this.floatGroup.add(hit);
      this.clickTargets.push(hit);
    });
	
	    // ★ Невидимая увеличенная зона клика для исследования базы.
    //   Появляется только в режиме explore (см. _updateHighlights),
    //   позиционируется ровно под визуальной стадион-подсветкой базы
    //   и позволяет игроку чуть-чуть промахнуться мимо её края — клик
    //   всё равно засчитается как попадание в базу. Никакого влияния
    //   на визуал и на другие режимы: пока visible=false, меш не
    //   участвует ни в рендере, ни в raycast'ах.
    this.exploreHitMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 4.2),
      new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, depthTest: false,
      })
    );
    this.exploreHitMesh.rotation.x = -Math.PI / 2;
    this.exploreHitMesh.position.y = 0.05;
    this.exploreHitMesh.renderOrder = -2;
    this.exploreHitMesh.visible = false;
    this.exploreHitMesh.userData = { exploreHit: true, cellId: null };
    this.floatGroup.add(this.exploreHitMesh);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.spinningHighlights = [];

    const refit = () => {
      this._fitBody();
      setTimeout(() => this._fitBody(), 80);
      setTimeout(() => this._fitBody(), 250);
      setTimeout(() => this._fitBody(), 600);
    };

    // Начальная подгонка — multi-shot: браузер может отдать корректные
    // размеры не сразу (особенно на iOS при загрузке в ландшафте).
    refit();

    window.addEventListener('resize', refit);
    if (screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener('change', refit);
    }
    window.addEventListener('orientationchange', refit);

    // visualViewport — самый надёжный источник размеров на мобильных.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', refit);
      window.visualViewport.addEventListener('scroll', refit);
    }

    // Страховка: ещё раз после полной загрузки страницы и после pageshow
    // (iOS Safari иногда уточняет размеры только к этому моменту).
    window.addEventListener('load', refit);
    window.addEventListener('pageshow', refit);

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this._fitBody());
      ro.observe(document.documentElement);
    }
    document.addEventListener('fullscreenchange', () => this._fitBody());
    document.addEventListener('webkitfullscreenchange', () => this._fitBody());
  }

  _fitBody() {
    // На мобильных визуальный вьюпорт надёжнее innerWidth/innerHeight:
    // последние могут быть «промежуточными» сразу после загрузки в
    // необычной ориентации или при показе/скрытии адресной строки.
    // visualViewport.width/height всегда отражают видимую область.
    const vv = window.visualViewport;
    const vw = (vv && vv.width)  || window.innerWidth;
    const vh = (vv && vv.height)
             || document.documentElement.clientHeight
             || window.innerHeight;
    const scale = Math.min(vw / VIRTUAL_W, vh / VIRTUAL_H);
    const ox = (vw - VIRTUAL_W * scale) / 2;
    const oy = (vh - VIRTUAL_H * scale) / 2;
    document.body.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
    const canvas = this.renderer.domElement;
    canvas.style.left = (-ox / scale) + 'px';
    canvas.style.top = (-oy / scale) + 'px';
    canvas.style.width = (vw / scale) + 'px';
    canvas.style.height = (vh / scale) + 'px';
    const dpr = window.devicePixelRatio || 1;
    const capped = Math.min(dpr, 3);
    this.renderer.setPixelRatio(capped);
    this.renderer.setSize(vw, vh, false);
    const ASPECT = VIRTUAL_W / VIRTUAL_H;
    const vA = vw / vh;
    let fov;
    if (vA >= ASPECT) fov = 50;
    else fov = 2 * Math.atan(Math.tan(50 * Math.PI / 360) * ASPECT / vA) * 180 / Math.PI;
    this.camera.fov = fov;
    this.camera.aspect = vA;
    this.camera.updateProjectionMatrix();
	
    // ★ Запоминаем размеры вьюпорта — нужны при pinch-пане, чтобы
    //   пересчитывать пиксели в мировые единицы.
    this._vw = vw;
    this._vh = vh;
    // ★ Пересчитываем позицию камеры с учётом текущего зума/пана.
    //   После ресайза окна/ориентации игрок остаётся на том же зуме.
    this._applyCameraTransform();

    const dimEl = document.getElementById('discard-dim-overlay');
    if (dimEl) {
      dimEl.style.left = (-ox / scale) + 'px';
      dimEl.style.top = (-oy / scale) + 'px';
      dimEl.style.right = 'auto';
      dimEl.style.bottom = 'auto';
      dimEl.style.width = (vw / scale) + 'px';
      dimEl.style.height = (vh / scale) + 'px';
    }

    const bottomLeftEl  = document.getElementById('bottom-left');
    const bottomRightEl = document.getElementById('bottom-right');
    if (IS_MOBILE && ox > 0.5) {
      const comp = (-ox / scale) + 'px';
      if (bottomLeftEl)  bottomLeftEl.style.left  = comp;
      if (bottomRightEl) bottomRightEl.style.right = comp;
    } else {
      if (bottomLeftEl)  bottomLeftEl.style.left  = '';
      if (bottomRightEl) bottomRightEl.style.right = '';
    }
  }
  
  // ★ Позиционирует камеру по текущему зуму и пану. Камера «стоит»
  //   на вертикальной дуге над точкой this._camTarget: чем больше
  //   zoom, тем ближе она к столу. Базовое смещение (0, 14, 9) при
  //   zoom = 1 даёт ровно тот же вид, что и раньше.
  _applyCameraTransform() {
    const z = Math.max(0.0001, this._zoom);
    const tx = this._camTarget.x;
    const tz = this._camTarget.z;
    const oy = 14 / z;
    const oz = 9 / z;
    this.camera.position.set(tx, oy, tz + oz);
    this.camera.lookAt(tx, 0, tz);
  }

  // ★ Ограничивает пан, чтобы не уехать за пределы доски. При zoom = 1
  //   пан запрещён (и так видно всё поле), при бо́льшем зуме разрешён
  //   ровно настолько, чтобы дойти до края доски, и ни пикселем дальше.
  _clampCamTarget() {
    const z = Math.max(1, this._zoom);
    const slack = 1 - 1 / z;                 // 0 при z=1, → 1 при z→∞
    const maxX = (BOARD_WIDTH  / 2) * slack;
    const maxZ = (BOARD_HEIGHT / 2) * slack;
    if (this._camTarget.x >  maxX) this._camTarget.x =  maxX;
    if (this._camTarget.x < -maxX) this._camTarget.x = -maxX;
    if (this._camTarget.z >  maxZ) this._camTarget.z =  maxZ;
    if (this._camTarget.z < -maxZ) this._camTarget.z = -maxZ;
  }

  _bodyRectOf(el) {
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const vw = (vv && vv.width) || window.innerWidth;
    const vh = (vv && vv.height) || document.documentElement.clientHeight || window.innerHeight;
    const scale = Math.min(vw / VIRTUAL_W, vh / VIRTUAL_H);
    const ox = (vw - VIRTUAL_W * scale) / 2;
    const oy = (vh - VIRTUAL_H * scale) / 2;
    const toB = (x, y) => ({ x: (x - ox) / scale, y: (y - oy) / scale });
    const tl = toB(r.left, r.top), br = toB(r.right, r.bottom);
    return { left: tl.x, top: tl.y, right: br.x, bottom: br.y, width: br.x - tl.x, height: br.y - tl.y };
  }

  // ============================================================
  // Анимации полёта карт (ghost)
  // ============================================================

  // Пробивает точку в 3D-объекте на экран в body-координаты.
  _threeToBodyCenter(obj3d) {
    if (!obj3d || !this.camera || !this.renderer) return null;
    const pos = new THREE.Vector3();
    obj3d.getWorldPosition(pos);
    const v = pos.clone().project(this.camera);
    const canvas = this.renderer.domElement;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const xVP = (v.x * 0.5 + 0.5) * r.width + r.left;
    const yVP = (-v.y * 0.5 + 0.5) * r.height + r.top;
    const bodyRect = this._bodyRectOf(canvas);
    if (!bodyRect.width) return null;
    const scale = bodyRect.width / r.width;
    return {
      x: bodyRect.left + (xVP - r.left) * scale,
      y: bodyRect.top  + (yVP - r.top)  * scale,
    };
  }

  // Универсальный ghost: летит из fromRect в toRect, затухает/масштабируется.
  // opts.onDone — вызовется после завершения анимации (даже если она
  // не запустилась из-за нулевых размеров, чтобы вызвать колбэк).
  _flyCard(fromRect, toRect, card, opts = {}) {
    const done = () => { if (typeof opts.onDone === 'function') opts.onDone(); };
    if (!fromRect || !toRect || !this.flyLayer) { done(); return; }

    const side = opts.side === 'black' ? 'black' : 'white';
    const duration = opts.duration ?? 380;
    const delay = opts.delay ?? 0;
    const startScale = opts.startScale ?? 1.05;
    // По умолчанию — растягиваем ghost до размера цели. Для случаев
    // «карта уходит в сброс/зерцало» endScale задаётся явно (0.55–0.7).
    const endScale = (opts.endScale != null)
      ? opts.endScale
      : (toRect.width > 0 ? toRect.width / fromRect.width : 1);
    const endOpacity = opts.endOpacity ?? 0.0;

    const w = fromRect.width, h = fromRect.height;
    if (w <= 0 || h <= 0) { done(); return; }

    const el = document.createElement('div');
    el.className = 'fly-card ' + side + '-card';
    el.style.width = w + 'px';
    el.style.height = h + 'px';

    const img = document.createElement('img');
    img.src = (card && card.imgPath) ? card.imgPath : 'cards/back.png';
    el.appendChild(img);
    this.flyLayer.appendChild(el);

    const startCX = fromRect.left + w / 2;
    const startCY = fromRect.top + h / 2;
    const endCX = toRect.left + toRect.width / 2;
    const endCY = toRect.top + toRect.height / 2;

    const startTX = startCX - w / 2;
    const startTY = startCY - h / 2;
    const endTX = endCX - w / 2;
    const endTY = endCY - h / 2;

    el.style.transform = `translate(${startTX}px, ${startTY}px) scale(${startScale})`;
    el.style.opacity = '1';

    void el.offsetWidth;

    el.style.transition =
      `transform ${duration}ms cubic-bezier(.25,.6,.35,1) ${delay}ms, ` +
      `opacity ${duration}ms ease-out ${delay}ms`;

    el.style.transform = `translate(${endTX}px, ${endTY}px) scale(${endScale})`;
    el.style.opacity = String(endOpacity);


    const totalMs = duration + delay;
    const t0 = performance.now();
    let fired = false;

    const tick = () => {
      const elapsed = performance.now() - t0;
      if (!fired && elapsed >= totalMs) {
        fired = true;
        done();
        setTimeout(() => {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 40);
        return;
      }
      if (!fired) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Захват позиции карты в руке ДО того, как логика её уберёт.
  _captureFlyForAction(action) {
    if (!action || !this.game) return null;
    const kind = action.kind;
    if (kind !== 'playCard' && kind !== 'discard'
        && kind !== 'locationBonus1' && kind !== 'locationBonus4') return null;
    const side = action.side;
    if (!side) return null;
    const uid = action.cardUid || action.handCardUid;
    if (!uid) return null;

    const container = side === 'white' ? this.refs.whiteHandSlots : this.refs.blackHandSlots;
    if (!container) return null;
    let el = null;
    Array.from(container.children).forEach(c => {
      if (c.dataset && c.dataset.uid === uid) el = c;
    });
    if (!el) return null;

    const st = this.game.cardState[side];
    const card = st.hand.find(c => c.uid === uid);
    if (!card) return null;

    const fromRect = this._bodyRectOf(el);
    return { side, uid, card, fromRect };
  }

  // Запуск полёта ПОСЛЕ того, как state и DOM уже обновились.
  _launchFlyForAction(ctx, action) {
    let targetRect = null;
    let endOpacity = 0.15;
    let endScale = 0.7;
    let duration = 380;

    if (action.kind === 'playCard' && action.mode === 'mirror') {
      // Карта летит не в сброс, а к бейджу зерцала на жетоне-цели.
      // В момент запуска меша-бейджа ещё может не быть — _refreshMirrorBadge
      // грузит текстуру асинхронно. Поэтому целимся в точку, где бейдж
      // появится: позиция жетона + оффсеты MIRROR_BADGE_HEIGHT / _OFFSET_Z.
      const targetPieceId = action.targetPieceId;
      const targetEntry = this.pieceMeshes.get(targetPieceId);
      if (targetEntry && targetEntry.mesh) {
        const pos = targetEntry.mesh.position.clone();
        pos.y += MIRROR_BADGE_HEIGHT;
        pos.z += MIRROR_BADGE_OFFSET_Z;
        const center = this._threeToBodyCenter({ getWorldPosition: (v) => v.copy(pos) });
        if (center) {
          const size = 44;
          targetRect = {
            left: center.x - size / 2,
            top:  center.y - size / 2,
            width: size, height: size,
          };
          // ★ endOpacity = 0: ghost должен полностью раствориться до
          //   удаления из DOM. С 0.55 он оставался бы видимым поверх
          //   бейджа и его удаление выглядело бы как вспышка яркости.
          endOpacity = 0;
          endScale = 0.55;
          duration = 520;
        }
      }
    }

    if (!targetRect) {
      const panelId = ctx.side === 'white' ? 'discard-left' : 'discard-right';
      const panel = document.getElementById(panelId);
      if (!panel) return;
      targetRect = this._bodyRectOf(panel);
    }

    this._flyCard(ctx.fromRect, targetRect, ctx.card, {
      side: ctx.side,
      duration,
      startScale: 1.05,
      endScale,
      endOpacity,
    });
  }

  // Решаффл: несколько карт-рубашек летят из сброса в колоду.
  // Бонус 2: карты вскрываются из колоды и разлетаются по своим местам.
  // Бонус 4: карта возвращается из сброса в руку.
  _animateBonus4(ev) {
    const side = ev.side;
    const newHandCard = ev.discardCard;   // карта, которая переезжает в руку
    if (!newHandCard) { this._hideLocationPanel(); return; }

    const panelId = side === 'white' ? 'discard-left' : 'discard-right';
    const panel = document.getElementById(panelId);
    // Ищем конкретную mini-карту в сбросе по uid — иначе ghost создастся
    // размером со всю панель сброса и вырастет до её габаритов.
    let fromRect = null;
    if (panel) {
      let srcEl = null;
      panel.querySelectorAll('.discard-mini').forEach(c => {
        if (c.dataset && c.dataset.uid === newHandCard.uid) srcEl = c;
      });
      fromRect = this._bodyRectOf(srcEl || panel);
    }

    // Помечаем uid — стандартная анимация из колоды не запустится.
    this._suppressHandAnimUids.add(newHandCard.uid);

    // Скрываем панель — renderHands создаст новую карту с opacity: 0.
    this._hideLocationPanel();

    if (!fromRect || fromRect.width <= 0) {
      // Не смогли измерить сброс — просто раскрываем карту.
      this._suppressHandAnimUids.delete(newHandCard.uid);
      return;
    }

    requestAnimationFrame(() => {
      const container = side === 'white' ? this.refs.whiteHandSlots : this.refs.blackHandSlots;
      let el = null;
      Array.from(container.children).forEach(c => {
        if (c.dataset && c.dataset.uid === newHandCard.uid) el = c;
      });
      if (!el) { this._suppressHandAnimUids.delete(newHandCard.uid); return; }

      const toRect = this._bodyRectOf(el);
      if (!toRect || toRect.width <= 0) { el.style.opacity = '1'; return; }

      this._flyCard(fromRect, toRect, newHandCard, {
        side,
        duration: 400,
        startScale: 0.75,
        // endScale не задаём — _flyCard подгонит ghost под размер
        // карты в руке (toRect.width / fromRect.width).
        endOpacity: 1,
        onDone: () => {
          if (!el.isConnected) return;
          el.style.transition = 'none';
          el.style.opacity = '1';
          requestAnimationFrame(() => { el.style.transition = ''; });
        },
      });
    });
  }

  // Бонус 2: карты вскрываются из колоды и разлетаются по своим местам.
  _animateBonus2Reveal(side, cards) {
    if (!this.revealCardElements.length) return;
    const deckEl = side === 'white' ? this.refs.whiteDeckVisual : this.refs.blackDeckVisual;
    if (!deckEl) return;
    const deckRect = this._bodyRectOf(deckEl);
    if (!deckRect || deckRect.width <= 0) return;

    // Прячем карты до прилёта ghost'ов.
    this.revealCardElements.forEach(el => { el.style.opacity = '0'; });

    const elements = this.revealCardElements.slice();
    const cardsArr = (cards || []).slice();

    requestAnimationFrame(() => {
      elements.forEach((el, i) => {
        if (!el.isConnected) return;
        const toRect = this._bodyRectOf(el);
        const card = cardsArr[i];
        if (!toRect || toRect.width <= 0 || !card) {
          el.style.opacity = '1';
          return;
        }
        this._flyCard(deckRect, toRect, card, {
          side,
          duration: 420,
          delay: i * 120,
          startScale: 0.5,
          endScale: 1,
          endOpacity: 1,
          onDone: () => {
            if (!el.isConnected) return;
            el.style.transition = 'none';
            el.style.opacity = '1';
            requestAnimationFrame(() => { el.style.transition = ''; });
          },
        });
      });
    });
  }

  // Бонус 2: карта разрешается — либо на верх колоды, либо в сброс.
  _animateBonus2Resolve(ev) {
    const { side, card, action } = ev;
    if (!card) { this._renderLocation2Panel(); return; }

    // Найти DOM-элемент до того, как панель перерисуется.
    let fromEl = null;
    for (const el of this.revealCardElements) {
      if (el.dataset && el.dataset.cardUid === card.uid) { fromEl = el; break; }
    }
    const fromRect = fromEl ? this._bodyRectOf(fromEl) : null;

    // ★ Точечно убираем этот эл. из слоя вскрытых и из массива.
    //   Никакого _renderLocation2Panel с полной перерисовкой панели —
    //   именно она тормозила основной поток настолько, что первый
    //   ghost успевал «дождаться» второго. В обычном одиночном
    //   возврате разница незаметна, а в end-turn с двумя картами
    //   подряд — критична.
    if (fromEl && fromEl.parentNode) fromEl.parentNode.removeChild(fromEl);
    this.revealCardElements = this.revealCardElements.filter(el => el !== fromEl);

    // ★ Обновляем только кнопочный список и переставляем оставшиеся
    //   карты вскрытия. Слой `revealLayer` НЕ пересоздаём — иначе
    //   оставшиеся карты визуально прыгнули бы на новые позиции.
    if (this.game.revealState.active) {
      this._renderLocation2ButtonsOnly();
      if (this.revealCardElements.length > 0) {
        this._positionRevealCards(side);
      }
    }

    if (!fromRect || fromRect.width <= 0) return;

    let toRect = null;
    if (action === 'return') {
      const deckEl = side === 'white' ? this.refs.whiteDeckVisual : this.refs.blackDeckVisual;
      toRect = deckEl ? this._bodyRectOf(deckEl) : null;
    } else {
      const panelId = side === 'white' ? 'discard-left' : 'discard-right';
      const panel = document.getElementById(panelId);
      toRect = panel ? this._bodyRectOf(panel) : null;
    }
    if (!toRect) return;

    if (action === 'return') {
      this._pendingDeckReturns[side] += 1;
      this._renderDeckVisuals();
    }

    this._flyCard(fromRect, toRect, card, {
      side,
      duration: 420,
      startScale: 1,
      endScale: 0.6,
      endOpacity: 0,
      onDone: () => {
        if (action !== 'return') return;
        this._pendingDeckReturns[side] = Math.max(0, this._pendingDeckReturns[side] - 1);
        this._renderDeckVisuals();
      },
    });
  }
  
  // Решаффл: несколько карт-рубашек летят из сброса в колоду.
  _animateDeckReshuffle(side) {
    const discardEl = side === 'white'
      ? this.refs.whiteDiscardSlots
      : this.refs.blackDiscardSlots;
    const deckEl = side === 'white'
      ? this.refs.whiteDeckVisual
      : this.refs.blackDeckVisual;
    if (!discardEl || !deckEl) return;

    const deckRect = this._bodyRectOf(deckEl);
    if (!deckRect) return;

    const fromCards = Array.from(discardEl.querySelectorAll('.discard-mini'));
    const sources = fromCards.slice(0, 6);

    if (sources.length === 0) {
      const panel = document.getElementById(side === 'white' ? 'discard-left' : 'discard-right');
      if (!panel) return;
      const fromRect = this._bodyRectOf(panel);
      this._flyCard(fromRect, deckRect, null, {
        side, duration: 460, startScale: 1, endScale: 0.55, endOpacity: 0.15,
      });
      return;
    }

    sources.forEach((srcEl, i) => {
      const fromRect = this._bodyRectOf(srcEl);
      this._flyCard(fromRect, deckRect, null, {
        side,
        duration: 420,
        delay: i * 40,
        startScale: 1,
        endScale: 0.6,
        endOpacity: 0.15,
      });
    });
  }

  // ----------------------------------------------------------
  // DOM-ссылки
  // ----------------------------------------------------------

  _buildDomRefs() {
    const $ = id => document.getElementById(id);
    this.refs = {
      cardOverlay: $('card-overlay'),
      cardOverlayContent: document.querySelector('#card-overlay .overlay-content'),
      tabletOverlay: $('tablet-overlay'),
      tabletOverlayContent: document.querySelector('#tablet-overlay .tablet-overlay-content'),
      deckOverlay: $('deck-overlay'),
      deckOverlayContent: document.querySelector('#deck-overlay .deck-overlay-content'),
      victoryOverlay: $('victory-overlay'),

      cardActions: $('card-actions'),
      mirrorAction: $('mirror-action'),
      moveBtn: document.querySelector('[data-action="move"]'),
      attackBtn: document.querySelector('[data-action="attack"]'),
      exploreBtn: document.querySelector('[data-action="explore"]'),
      spellBtn: document.querySelector('[data-action="spell"]'),
      mirrorBtn: document.querySelector('[data-action="mirror"]'),

      whiteHand: $('hand-white'),
      blackHand: $('hand-black'),
      whiteHandSlots: $('hand-white-slots'),
      blackHandSlots: $('hand-black-slots'),
      whitePlayed: $('white-played'),
      blackPlayed: $('black-played'),
      whiteHandHeader: $('white-hand-header'),
      blackHandHeader: $('black-hand-header'),

      whiteDeck: $('white-deck'),
      blackDeck: $('black-deck'),
      whiteDeckVisual: $('white-deck-visual'),
      blackDeckVisual: $('black-deck-visual'),
      whiteDiscardSlots: $('white-discard-slots'),
      blackDiscardSlots: $('black-discard-slots'),
      whiteDiscardCount: $('white-discard-count'),
      blackDiscardCount: $('black-discard-count'),

      turnPanel: $('turn-panel'),
      turnLabel: $('turn-label'),
      turnNumber: $('turn-number'),
      endTurnBtn: $('end-turn'),

      endTurnConfirm: $('end-turn-confirm'),
      etcConfirmBtn: $('etc-confirm'),
      discardTrigger: $('discard-trigger'),

      locationBonusPanel: $('location-bonus-panel'),
      locationBonusIcon: $('location-bonus-icon'),
      lbpMiniCards: $('lbp-mini-cards'),
      lbpPieceChoice: $('lbp-piece-choice'),
      lbpPieceTitle: $('lbp-piece-title'),
      lbpPieceOptions: $('lbp-piece-options'),
      lbpDiscardCards: $('lbp-discard-cards'),
      lbpPendingDiscard: $('lbp-pending-discard'),
      lbpConfirm: $('lbp-confirm'),
      lbpRevealColumns: $('lbp-reveal-columns'),
      lbpRevealList: $('lbp-reveal-list'),

      exploreConfirm: $('explore-confirm'),
      ecSub: $('ec-sub'),
      ecPieceOptions: $('ec-piece-options'),
      ecConfirm: $('ec-confirm'),

      moveConfirm: $('move-confirm'),
      mcSub: $('mc-sub'),
      mcPieceOptions: $('mc-piece-options'),
      mcConfirm: $('mc-confirm'),

      attackConfirm: $('attack-confirm'),
      acSub: $('ac-sub'),
      acAttacker: $('ac-attacker-options'),
      acTarget: $('ac-target-options'),
      acResultSection: $('ac-result-section'),
      acResultBefore: $('ac-result-before'),
      acResultAfter: $('ac-result-after'),
      acConfirm: $('ac-confirm'),

      mirrorConfirm: $('mirror-confirm'),
      mirrorSub: $('mirror-sub'),
      mirrorCardPreview: $('mirror-card-preview'),
      mirrorTargetOptions: $('mirror-target-options'),
      mirrorConfirmBtn: $('mirror-confirm-btn'),

      bonus2Confirm: $('bonus2-confirm'),
      b2cConfirmBtn: $('b2c-confirm'),

      locationBonusContainer: $('location-bonuses'),
      mirrorFieldReminders: $('mirror-field-reminders'),
      discardDim: $('discard-dim-overlay'),
      discardPickBtn: $('discard-pick-btn'),
      revealLayer: $('reveal-cards-layer'),
    };
    this.refs.lbpTitle = this.refs.locationBonusPanel.querySelector('.lbp-title');
    this.refs.lbpSub = this.refs.locationBonusPanel.querySelector('.lbp-sub');
  }

  // ==========================================================
  // РЕНДЕР
  // ==========================================================

  renderAll() {
    if (!this.game) return;
    this._renderPieces();
    this._updateConditionalArrows();
    this._renderCaptains();
    this._renderHands();
    this._renderDeckVisuals();
    this._renderDiscards();
    this._renderTurnPanel();
    this._renderLocationBonusButtons();
    this._updateHighlights();
    this._updateDiscardDim();
    this._updateDiscardPickBtn();
    this._updateEndTurnPanel();
    this._updateMirrorFieldReminders();
    this._updateMirrorShimmerDimming();
  }

  _renderPieces() {
    const game = this.game;
    const wanted = new Set(game.pieces.map(p => p.id));

    for (const [id, entry] of [...this.pieceMeshes.entries()]) {
      if (!wanted.has(id)) {
        this.floatGroup.remove(entry.mesh);
        this.hpSpriteGroup.remove(entry.hpSprite);
        this.pieceMeshes.delete(id);
        this._removeMirrorMeshes(id);
        this.mirrorState.delete(id);
      }
    }

    for (const piece of game.pieces) {
      if (this.pieceMeshes.has(piece.id)) continue;
      const teamColorHex = piece.side === 'white' ? COLOR_RED : COLOR_YELLOW;
      // ★ Обводка определяется ТОЛЬКО стороной, а не профилем персонажа.
      //   Раньше здесь стоял piece.profile.outlineHex, а в PROFILES он
      //   прописан жёстко за каждым персонажем (Джек всегда белый,
      //   Уруст всегда чёрный и т.д.). Из-за этого при перемешивании
      //   команд (shuffleTeams или ?teams=...) обводка не совпадала
      //   с текущей стороной жетона. Капитаны не были затронуты, потому
      //   что в _renderCaptains цвет уже считался от side — теперь оба
      //   места работают одинаково.
      const outlineHex = piece.side === 'white' ? 0xffffff : 0x0a0a0a;
      const tex = this._getPieceTexture(piece.profileKey, piece.side, 'regular');
      const mesh = createPieceMesh(teamColorHex, outlineHex, tex);
      mesh.userData.pieceId = piece.id;
      [0, 1, 2, 3].forEach(i => { if (mesh.children[i]) mesh.children[i].userData.pieceId = piece.id; });
      this.floatGroup.add(mesh);

      const hpSprite = createHpSprite(piece.maxHp);
      this.hpSpriteGroup.add(hpSprite);

      const bonus5Ring = this._createBonus5Ring();
      mesh.add(bonus5Ring);
      bonus5Ring.visible = false;

      this.pieceMeshes.set(piece.id, { mesh, hpSprite, bonus5Ring });
    }

    const positions = computePiecePositions(game.pieces);
    for (const piece of game.pieces) {
      const entry = this.pieceMeshes.get(piece.id);
      const pos = positions.get(piece.id);
      if (!pos) continue;

      const inAnim = this.animating && (
        this.animating.pieceId === piece.id
        || (this.animating.kind === 'attack'
            && (this.animating.attackerId === piece.id
                || this.animating.targetId === piece.id))
      );
      const inRevive = this.revivingIds.has(piece.id);
      if (!inAnim && !inRevive) {
        entry.mesh.position.set(pos.x, 0, pos.z);
      }
      this._updateHpDisplay(piece.id);

      const curMirrorUid = piece.mirror ? piece.mirror.uid : null;
      const lastMirrorUid = this.mirrorState.get(piece.id) ?? null;
      if (curMirrorUid !== lastMirrorUid) {
        this.mirrorState.set(piece.id, curMirrorUid);
        this._refreshMirrorBadge(piece);
      }
    }
  }

  _createBonus5Ring() {
    const tex = createTeleportRingTexture();
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(TOKEN_RADIUS * 2.6, TOKEN_RADIUS * 2.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = COIN_HEIGHT + 0.032;
    ring.renderOrder = 201;
    return ring;
  }

  _updateHpDisplay(pieceId) {
    const piece = this.game.getPiece(pieceId);
    const entry = this.pieceMeshes.get(pieceId);
    if (!piece || !entry) return;

    if (this.revivingIds.has(pieceId)) {
      entry.hpSprite.visible = false;
      return;
    }

    // ★ game.js переводит убитый жетон на базу сразу (для консистентности
    //   состояния в мультиплеере). Пока играет анимация атаки — держим
    //   HP-спрайт видимым и рисуем снимок из attackOverrides.
    const inAttack = this.attackOverrides.has(pieceId);
    const onBase = this.game.isOnBase(piece);
    entry.hpSprite.visible = !onBase || inAttack;
    if (onBase && !inAttack) return;

    let hpToDraw = piece.hp;
    let maxHpToDraw = piece.maxHp;
    if (this.attackOverrides.has(pieceId)) {
      const ov = this.attackOverrides.get(pieceId);
      hpToDraw = ov.hp;
      maxHpToDraw = ov.maxHp;
    } else if (this.hpBlink.pieceId === pieceId) {
      if (this.hpBlink.locked) hpToDraw = this.hpBlink.realHp;
      else hpToDraw = this.hpBlink.phase === 1 ? this.hpBlink.predictedHp : this.hpBlink.realHp;
    }

    // ★ Перерисовываем canvas ТОЛЬКО если реально изменились hp/maxHp.
    //   Раньше это делалось на каждом кадре движения/атаки, потому что
    //   _updateHpDisplay вызывался из tick() — а canvas 1500×180 +
    //   needsUpdate = перезалив текстуры в GPU каждый кадр. Это и давало
    //   микро-фризы при движении.
    const prevHp = entry.hpSprite.userData.lastHp;
    const prevMax = entry.hpSprite.userData.lastMaxHp;
    if (prevHp !== hpToDraw || prevMax !== maxHpToDraw) {
      const canvas = entry.hpSprite.material.map.image;
      drawHpBar(canvas, hpToDraw, maxHpToDraw);
      entry.hpSprite.userData.lastHp = hpToDraw;
      entry.hpSprite.userData.lastMaxHp = maxHpToDraw;
      entry.hpSprite.userData.maxHp = maxHpToDraw;
      entry.hpSprite.material.map.needsUpdate = true;
    }

    this._syncHpSpritePosition(pieceId);
  }

  // ★ Синхронизация позиции HP-спрайта с жетоном — без перерисовки.
  //   Вызывается каждый кадр из анимаций движения/атаки: дёшево, потому
  //   что только меняет x/z у mesh, без касания canvas и текстуры.
  _syncHpSpritePosition(pieceId) {
    const entry = this.pieceMeshes.get(pieceId);
    if (!entry) return;
    const p = entry.mesh.position;
    if (entry.hpSprite.parent === entry.mesh) {
      entry.hpSprite.position.set(0, COIN_HEIGHT + 0.10, -0.08);
    } else {
      entry.hpSprite.position.set(p.x, COIN_HEIGHT + 0.10, p.z - 0.08);
    }
  }

  _startHpBlink(target) {
    if (!target || !this.ui.selectedPieceId) { this._stopHpBlink(); return; }
    const attacker = this.game.getPiece(this.ui.selectedPieceId);
    if (!attacker) { this._stopHpBlink(); return; }

    const damage = Math.max(0, attacker.strength);
    const predicted = Math.max(0, target.hp - damage);
    if (predicted === target.hp) { this._stopHpBlink(); return; }

    if (this.hpBlink.pieceId && this.hpBlink.pieceId !== target.id) {
      const oldId = this.hpBlink.pieceId;
      this.hpBlink.pieceId = null;
      this._updateHpDisplay(oldId);
    }

    this.hpBlink.pieceId = target.id;
    this.hpBlink.realHp = target.hp;
    this.hpBlink.predictedHp = predicted;
    this.hpBlink.phase = 0;
    this.hpBlink.timer = 0;
    this.hpBlink.locked = false;

    this._updateHpDisplay(target.id);
  }

  _lockHpBlinkHot() {
    if (!this.hpBlink.pieceId) return;
    this.hpBlink.locked = true;
    this.hpBlink.phase = 0;
    this.hpBlink.timer = 0;
    this._updateHpDisplay(this.hpBlink.pieceId);
  }

  _stopHpBlink() {
    const id = this.hpBlink.pieceId;
    this.hpBlink.pieceId = null;
    this.hpBlink.phase = 0;
    this.hpBlink.timer = 0;
    this.hpBlink.locked = false;
    if (id) this._updateHpDisplay(id);
  }

  _updateHpBlink(dt) {
    const id = this.hpBlink.pieceId;
    if (!id) return;
    const piece = this.game.getPiece(id);
    if (!piece) { this._stopHpBlink(); return; }
    if (this.ui.selectedAttackTargetId !== id || piece.hp <= 0) {
      this._stopHpBlink();
      return;
    }
    if (this.hpBlink.locked) return;
    this.hpBlink.timer += dt;
    if (this.hpBlink.timer >= this.hpBlink.interval) {
      this.hpBlink.timer = 0;
      this.hpBlink.phase = 1 - this.hpBlink.phase;
      this._updateHpDisplay(id);
    }
  }

  // ==========================================================
  // REVIVE
  // ==========================================================

  _startReviveSink(pieceId, opts = {}) {
    const piece = this.game.getPiece(pieceId);
    if (!piece) return;

    const entry = this.pieceMeshes.get(pieceId);
    if (!entry) return;

    if (this.queuedRevives.some(r => r.pieceId === pieceId)) return;
    if (this.animating && this.animating.kind === 'revive' && this.animating.pieceId === pieceId) return;

    const startPos = entry.mesh.position.clone();
    const baseId = piece.side === 'white' ? BASE_WHITE_ID : BASE_BLACK_ID;
    const basePoint = getPoint(baseId);
    const endPos = new THREE.Vector3(basePoint.x, 0, basePoint.z);

    const waitDuration = opts.waitDuration ?? 0;
    // ★ Фиксируем автора и полуход В МОМЕНТ вызова _startReviveSink
    //   (то есть когда жетон только начал тонуть), а не когда
    //   пузырёк фактически вылетит — иначе при смене хода между
    //   этими событиями он уедет не в ту колонку на графике.
    const actor = opts.actor != null ? opts.actor : this.game.currentTurn;
    const turn  = opts.turn  != null ? opts.turn  : this.game.halfTurn;

    this.revivingIds.add(pieceId);
    entry.hpSprite.visible = false;

    const sel = entry.mesh.children[4];
    if (sel) sel.visible = false;
    if (entry.bonus5Ring) entry.bonus5Ring.visible = false;

    this.queuedRevives.push({
      pieceId, startPos, endPos, baseId,
      phase: waitDuration > 0 ? 'wait' : 'sink',
      elapsed: 0,
      waitDuration,
      sinkDuration: 1.0,
      emergeDuration: 0,
      launchExploreOrbs: !!opts.launchExploreOrbs,
      launchDeathOrb: !!opts.launchDeathOrb,
      orbsLaunched: false,
      needsEmerge: false,
      actor,
      turn,
    });
  }

  _markReviveEmerge(pieceId) {
    let task = this.queuedRevives.find(r => r.pieceId === pieceId);
    if (!task && this.animating && this.animating.kind === 'revive' && this.animating.pieceId === pieceId) {
      task = this.animating;
    }
    if (task) { task.needsEmerge = true; return; }

    const piece = this.game.getPiece(pieceId);
    if (!piece) return;
    const baseId = piece.side === 'white' ? BASE_WHITE_ID : BASE_BLACK_ID;
    const basePoint = getPoint(baseId);
    this.revivingIds.add(pieceId);
    const entry = this.pieceMeshes.get(pieceId);
    if (entry) {
      entry.mesh.position.set(basePoint.x, -0.4, basePoint.z);
      entry.hpSprite.visible = false;
    }
    this.queuedRevives.push({
      pieceId,
      startPos: new THREE.Vector3(basePoint.x, -0.4, basePoint.z),
      endPos: new THREE.Vector3(basePoint.x, 0, basePoint.z),
      baseId, phase: 'emerge', elapsed: 0,
      waitDuration: 0,
      sinkDuration: 0, emergeDuration: 0,
      launchExploreOrbs: false, launchDeathOrb: false,
      orbsLaunched: true, needsEmerge: true,
    });
  }

  _updateReviveTask(task, dt) {
    const piece = this.game.getPiece(task.pieceId);
    const entry = this.pieceMeshes.get(task.pieceId);
    if (!piece || !entry) {
      this.revivingIds.delete(task.pieceId);
      return true;
    }

    task.elapsed += dt;

    if (task.phase === 'wait') {
      if (task.elapsed >= task.waitDuration) {
        task.phase = 'sink';
        task.elapsed = 0;
      }
      return false;
    }

    if (task.phase === 'sink') {
      if ((task.launchExploreOrbs || task.launchDeathOrb) && !task.orbsLaunched) {
        task.orbsLaunched = true;
        if (task.launchExploreOrbs) {
          const enemySide = piece.side === 'white' ? 'black' : 'white';
          this._launchExploreOrbs(task.startPos, piece.side, enemySide, task.actor, task.turn);
        }
        if (task.launchDeathOrb) {
          this._launchDeathOrb(task.startPos, piece.side, task.actor, task.turn);
        }
      }
      const frac = Math.min(task.elapsed / task.sinkDuration, 1);
      entry.mesh.position.set(task.startPos.x, -0.4 * frac, task.startPos.z);
      if (frac >= 1) {
        entry.mesh.position.set(task.endPos.x, -0.4, task.endPos.z);
        entry.mesh.rotation.set(0, 0, 0);
        task.startPos = new THREE.Vector3(task.endPos.x, -0.4, task.endPos.z);
        task.elapsed = 0;
        task.phase = 'emerge';
      }
      return false;
    }

    if (task.phase === 'emerge') {
      if (task.emergeDuration <= 0) {
        entry.mesh.position.set(task.endPos.x, 0, task.endPos.z);
        entry.mesh.rotation.set(0, 0, 0);
        this.revivingIds.delete(task.pieceId);
        this._updateHpDisplay(task.pieceId);
        this._updateConditionalArrows();
        return true;
      }
      const frac = Math.min(task.elapsed / task.emergeDuration, 1);
      entry.mesh.position.set(task.endPos.x, -0.4 + 0.4 * frac, task.endPos.z);
      if (frac >= 1) {
        entry.mesh.position.set(task.endPos.x, 0, task.endPos.z);
        entry.mesh.rotation.set(0, 0, 0);
        this.revivingIds.delete(task.pieceId);
        this._updateHpDisplay(task.pieceId);
        this._updateConditionalArrows();
        return true;
      }
      return false;
    }

    return false;
  }

  // ==========================================================
  // КАПИТАНЫ
  // ==========================================================

  _renderCaptains() {
    const game = this.game;
    for (const side of ['white', 'black']) {
      const profileKey = game.getCaptainProfileKey(side);
      const mightVal = game.might[side];
      const slot = getCaptainSlotPosition(side, Math.max(1, mightVal));
      const pos = pxTo3D(slot.x, slot.y);

      let entry = this.captainMeshes[side];
      if (!entry || entry.profileKey !== profileKey) {
        if (entry) this.floatGroup.remove(entry.mesh);
        const teamColorHex = side === 'white' ? COLOR_RED : COLOR_YELLOW;
        const outlineHex = side === 'white' ? 0xffffff : 0x0a0a0a;
        const tex = this._getPieceTexture(profileKey, side, 'captain');
        const mesh = createPieceMesh(teamColorHex, outlineHex, tex, {
          radius: CAPTAIN_TOKEN_RADIUS, height: CAPTAIN_TOKEN_HEIGHT, withSelector: false,
        });
        mesh.userData.captainSide = side;
        [0, 1, 2, 3].forEach(i => { if (mesh.children[i]) mesh.children[i].userData.captainSide = side; });
        mesh.position.set(pos.x, 0, pos.z);
        this.floatGroup.add(mesh);
        entry = { mesh, profileKey, targetPos: new THREE.Vector3(pos.x, 0, pos.z) };
        this.captainMeshes[side] = entry;
      }

      const isVictoryMove = this.captainVictoryMoves.has(side);
      const isBreaking    = this.captainBreakAnimations.some(a => a.side === side);
      entry.mesh.visible = mightVal > 0 || isVictoryMove || isBreaking;

      // Как в indexOld: всегда поддерживаем актуальную целевую позицию.
      // Плавное движение к ней делает _updateCaptainMovement() каждый кадр.
      if (!entry.targetPos) entry.targetPos = new THREE.Vector3();
      entry.targetPos.set(pos.x, 0, pos.z);
    }
  }

  // ==========================================================
  // РУКИ / КОЛОДЫ / СБРОС
  // ==========================================================

  _renderHands() {
    const game = this.game;
    const whiteActive = game.currentTurn === 'white' && !game.gameOver;
    const blackActive = game.currentTurn === 'black' && !game.gameOver;

    for (const side of ['white', 'black']) {
      const st = game.cardState[side];
      const container = side === 'white' ? this.refs.whiteHandSlots : this.refs.blackHandSlots;
      const isActive = side === 'white' ? whiteActive : blackActive;
      this._renderHandFor(side, container, isActive);

      const playedEl = side === 'white' ? this.refs.whitePlayed : this.refs.blackPlayed;
      playedEl.textContent = st.playedThisTurn;

      const block = side === 'white' ? this.refs.whiteHand : this.refs.blackHand;
      block.classList.toggle('inactive', !isActive);
    }

    this.refs.whiteHandHeader.querySelector('.played-info').style.display = whiteActive ? '' : 'none';
    this.refs.blackHandHeader.querySelector('.played-info').style.display = whiteActive ? 'none' : '';

    this._updateMirrorShimmerDimming();
    this._updateMirrorFieldReminders();
    this._renderLocationBonusButtons();
    this._updateDiscardPickBtn();
    this._updateEndTurnPanel();
  }

  _renderHandFor(side, container, isActive) {
    const game = this.game;
    const st = game.cardState[side];
    const inDiscard = isActive && this.ui.discardMode;
    const warningShown = isActive && this.ui.endTurnPanelOpen;
    const canPlay = isActive && !inDiscard && !this.ui.discardLocked && !game.revealState.active
                  && st.playedThisTurn < 4 && !this.animating && !game.gameOver;
    const canDiscard = inDiscard && st.hand.length > 1 && !this.animating;
    const enabled = canPlay || canDiscard;

    const existing = new Map();
    Array.from(container.children).forEach(el => {
      if (el.dataset && el.dataset.uid) existing.set(el.dataset.uid, el);
    });

    const wantedUids = new Set(st.hand.map(c => c.uid));
    Array.from(container.children).forEach(el => {
      if (!el.dataset.uid || !wantedUids.has(el.dataset.uid)) {
        container.removeChild(el);
      }
    });

    st.hand.forEach((card, idx) => {
      let el = existing.get(card.uid);
      const isNewCard = !el;
      if (!el) {
        el = document.createElement('div');
        el.dataset.uid = card.uid;
        const fb = document.createElement('div');
        fb.className = 'fallback';
        fb.innerHTML = `<div class="icon">${card.icon}</div><div class="name">${card.name}</div><div class="char">${card.charName}</div>`;
        el.appendChild(fb);
        const img = document.createElement('img');
        img.src = card.imgPath;
        img.onerror = () => img.remove();
        el.appendChild(img);
        this._attachHoverToElement(el, card);

		// ★ Новая карта невидима, пока до неё не долетит ghost из колоды.
        //   Иначе она «появляется» мгновенно, а анимация летит поверх неё.
        el.style.opacity = '0';
        el.style.transition = 'opacity 120ms ease-out';
      }
      // Существующие карты opacity не трогаем — им управляет анимация
      // (или фолбэк-таймер через 1.2 с). Если сбросить здесь в '1',
      // повторный вызов _renderHandFor раскрывает карты до того, как
      // до них долетел ghost, — получается «карты уже лежат, потом
      // ещё и анимация».

      const isSelected = this.ui.selectedCardUid === card.uid;
      const isPicked = inDiscard && this.ui.discardPickUid === card.uid;
      el.className = 'hand-card ' + (side === 'white' ? 'white-card' : 'black-card');
      if (card.variant === 'ult') el.classList.add('ult');
      if (isSelected) el.classList.add('selected');
      if (isPicked) el.classList.add('discard-pick');
      if (!enabled) el.classList.add('disabled');
      if (inDiscard && st.hand.length > 1 && !isPicked) el.classList.add('trembling');

      if (canDiscard) {
        el.onclick = (e) => { e.stopPropagation(); this._onDiscardCardClick(side, idx, card); };
        el.title = isPicked
          ? `${card.charName} — ${card.name} (клик ещё раз — сбросить)`
          : `${card.charName} — ${card.name} (клик — выбрать для сброса)`;
      } else if (canPlay && warningShown) {
        el.onclick = (e) => {
          e.stopPropagation();
          this._closeEndTurnPanel();
          this._onCardClick(side, idx, card);
        };
        el.title = `${card.charName} — ${card.name}`;
      } else if (canPlay) {
        el.onclick = (e) => { e.stopPropagation(); this._onCardClick(side, idx, card); };
        el.title = `${card.charName} — ${card.name}`;
      } else {
        el.onclick = null;
        el.title = `${card.charName} — ${card.name} (неактивна)`;
      }

      const currentAtIndex = container.children[idx];
      if (currentAtIndex !== el) {
        container.insertBefore(el, currentAtIndex || null);
      }

      // ★ Новая карта — планируем анимацию «из колоды в руку» после rAF.
      if (isNewCard) {
        const deckEl = side === 'white'
          ? this.refs.whiteDeckVisual
          : this.refs.blackDeckVisual;
        const deckRect = deckEl ? this._bodyRectOf(deckEl) : null;

        // Страховка: если анимация почему-то не запустится — карта
        // всё равно станет видимой через 1.2 с. Иначе она осталась бы
        // навсегда невидимой. Instant reveal — без transition, чтобы
        // не было паразитного fade-in.
        const elRef = el;
        setTimeout(() => {
          if (elRef.isConnected && elRef.style.opacity === '0') {
            elRef.style.transition = 'none';
            elRef.style.opacity = '1';
            requestAnimationFrame(() => { elRef.style.transition = ''; });
          }
        }, 1200);

        // ★ Подавляем стандартную анимацию «из колоды в руку» для карт,
        //   которые прилетят из сброса (бонус 4). Карта уже создана с
        //   opacity: 0 — её раскроет ghost из сброса.
        if (this._suppressHandAnimUids.has(card.uid)) {
          this._suppressHandAnimUids.delete(card.uid);
          return;
        }

        if (deckRect) {
          this._pendingHandAnims.push({
            el, card, side, deckRect, delay: idx * 55,
          });
        } else {
          // Не можем анимировать — просто раскрываем карту.
          el.style.opacity = '1';
        }
      }
    });

    // ★ Запускаем все запланированные анимации одним rAF.
    if (this._pendingHandAnims.length > 0) {
      const queue = this._pendingHandAnims;
      this._pendingHandAnims = [];
      requestAnimationFrame(() => {
        for (const item of queue) {
          if (!item.el.isConnected) continue;
          const toRect = this._bodyRectOf(item.el);
          if (!toRect || !item.deckRect
              || toRect.width <= 0 || item.deckRect.width <= 0) {
            // Layout ещё не готов — раскрываем карту сразу.
            item.el.style.opacity = '1';
            continue;
          }
          this._flyCard(item.deckRect, toRect, item.card, {
            side: item.side,
            duration: 320,
            delay: item.delay,
            startScale: 0.5,
            // endScale НЕ задаём — _flyCard растянет ghost ровно
            // до размера карты в руке.
            endOpacity: 1,
            onDone: () => {
              // Ghost улетел и стоит ровно на месте карты с opacity: 1.
              // Открываем настоящую карту моментально — без transition,
              // иначе в момент между удалением ghost и полным появлением
              // карты виден короткий провал прозрачности.
              if (!item.el.isConnected) return;
              item.el.style.transition = 'none';
              item.el.style.opacity = '1';
              requestAnimationFrame(() => { item.el.style.transition = ''; });
            },
          });
        }
      });
    }
  }

  _renderDeckVisuals() {
    for (const side of ['white', 'black']) {
      const st = this.game.cardState[side];
      const container = side === 'white' ? this.refs.whiteDeckVisual : this.refs.blackDeckVisual;
      const countEl = side === 'white' ? this.refs.whiteDeck : this.refs.blackDeck;

      // ★ Пока есть карты «в полёте» к колоде, показываем её прежний
      //   размер (realCount - pending). Это и даёт эффект «колода
      //   выросла ровно на 1 карту в момент прилёта ghost'а».
      //   Верх колоды — карта на позиции (virtualCount - 1), т.е.
      //   последняя из уже «доехавших». При нескольких прилётах подряд
      //   виртуальный топ сам двигается вверх по массиву st.deck —
      //   изображение меняется на каждом шаге.
      const pending = this._pendingDeckReturns[side] || 0;
      const realCount = st.deck.length;
      const virtualCount = Math.max(0, realCount - pending);

      countEl.textContent = virtualCount;
      container.innerHTML = '';

      if (virtualCount === 0) {
        const layer = document.createElement('div');
        layer.className = 'deck-layer empty ' + side;
        container.appendChild(layer);
        container.onclick = (e) => this._onDeckPanelClick(e, side);
        continue;
      }

      const maxLayers = Math.min(virtualCount, 12);
      const offset = 2;
      for (let i = 0; i < maxLayers; i++) {
        const layer = document.createElement('div');
        layer.className = 'deck-layer ' + side;
        layer.style.bottom = (i * offset) + 'px';
        layer.style.zIndex = i + 1;
        container.appendChild(layer);
      }

      const topCard = st.deck[virtualCount - 1];
      if (topCard && topCard.faceUp) {
        const topLayer = document.createElement('div');
        topLayer.className = 'deck-layer faceup ' + side;
        topLayer.style.bottom = ((maxLayers - 1) * offset) + 'px';
        topLayer.style.zIndex = 200;
        // background-image вместо <img>: рисуется из кэша в тот же
        // кадр, без единого кадра просвета рубашки в момент смены арта.
        topLayer.style.backgroundImage = `url('${topCard.imgPath}')`;
        topLayer.style.backgroundSize = 'cover';
        topLayer.style.backgroundPosition = 'center';
        container.appendChild(topLayer);
      }

      container.onclick = (e) => this._onDeckPanelClick(e, side);
    }
  }

  _onDeckPanelClick(e, side) {
    e.stopPropagation();
    if (this.animating || this.game.gameOver) return;
    if (this.ui.activePanel || !this.refs.bonus2Confirm.classList.contains('hidden')) {
      this._hideLocationPanel();
    }
    if (this.ui.endTurnPanelOpen) this._cancelEndTurnConfirm();
    this._hideExplorePanel();
    this._resetSelectionLocal();
    this._showDeckOverlay(side);
  }

  _renderDiscards() {
    for (const side of ['white', 'black']) {
      const st = this.game.cardState[side];
      const container = side === 'white' ? this.refs.whiteDiscardSlots : this.refs.blackDiscardSlots;
      const countEl = side === 'white' ? this.refs.whiteDiscardCount : this.refs.blackDiscardCount;
      countEl.textContent = st.discard.length;
      container.innerHTML = '';
      // ★ Порядок стопок берём из game.getDisplayOrder — единый
      //   источник правды для «как команда отображается». Иначе
      //   правило «у чёрных зеркально» живёт в двух местах (CSS
      //   для руки + JS для сброса) и легко разъезжается.
      const charOrder = this.game.getDisplayOrder(side);
      const grouped = {};
      charOrder.forEach(k => grouped[k] = []);
      st.discard.forEach(c => { if (grouped[c.charKey]) grouped[c.charKey].push(c); });

      const MAX = 5, OFFSET = 32, CARD_H = 92;
      charOrder.forEach(charKey => {
        const stack = document.createElement('div');
        stack.className = 'discard-stack';
        const list = grouped[charKey];
        const visible = list.slice(Math.max(0, list.length - MAX));
        visible.forEach((card, i) => {
          const el = document.createElement('div');
          el.className = 'discard-mini ' + (side === 'white' ? 'white-card' : 'black-card');
          el.dataset.uid = card.uid;
          const img = document.createElement('img');
          img.src = card.imgPath;
          img.onerror = () => img.remove();
          el.appendChild(img);
          el.style.bottom = (i * OFFSET) + 'px';
          el.style.zIndex = i + 1;
          el.title = `${card.charName} — ${card.name}`;
          if (this.game.highlightUid && this.game.highlightUid[side] === card.uid) {
            el.classList.add('just-played');
          }
          this._attachHoverToElement(el, card);
          stack.appendChild(el);
        });
        const h = CARD_H + Math.max(0, visible.length - 1) * OFFSET;
        stack.style.height = h + 'px';
        container.appendChild(stack);
      });

      const panel = side === 'white'
        ? document.getElementById('discard-left')
        : document.getElementById('discard-right');
      if (panel) {
        panel.onclick = (e) => {
          e.stopPropagation();
          if (this.animating || this.game.gameOver) return;
          if (this.ui.activePanel || !this.refs.bonus2Confirm.classList.contains('hidden')) this._hideLocationPanel();
          if (this.ui.endTurnPanelOpen) this._cancelEndTurnConfirm();
          this._resetSelectionLocal();
          this._showDiscardOverlay(side);
        };
      }
    }
  }

  _renderTurnPanel() {
    const turn = this.game.currentTurn;
    this.refs.turnPanel.classList.toggle('white-turn', turn === 'white');
    this.refs.turnPanel.classList.toggle('black-turn', turn === 'black');
    this.refs.turnLabel.classList.toggle('white', turn === 'white');
    this.refs.turnLabel.classList.toggle('black', turn === 'black');
    this.refs.turnLabel.textContent = turn === 'white' ? '● Ход белых' : '● Ход чёрных';
    this.refs.turnNumber.textContent = 'Ход №' + this.game.turnNumber;
  }

  // ==========================================================
  // УСЛОВНЫЕ СТРЕЛКИ
  // ==========================================================

  _updateConditionalArrows() {
    if (!this.condArrows) return;
    // game.js обновляет piece.cellId мгновенно (для консистентности
    // состояния в мультиплеере), а view ещё играет анимацию. Стрелки
    // должны загораться/гаснуть только когда жетон визуально доехал,
    // поэтому во время анимаций и активных revive пропускаем пересчёт.
    // В конце каждой анимации _updateConditionalArrows вызывается явно.
    if (this.animating || this.revivingIds.size > 0) return;
    this.condArrows.forEach(({ arrow, data }) => {
      const enemySide = data.forSide === 'white' ? 'black' : 'white';
      const enemyThere = this.game.pieces.some(
        p => p.cellId === data.trigger && p.side === enemySide
      );
      arrow.visible = enemyThere;
    });
  }

  // ==========================================================
  // КНОПКИ ЛОКАЦИОННЫХ БОНУСОВ
  // ==========================================================

  _renderLocationBonusButtons() {
    const game = this.game;
    for (const side of ['white', 'black']) {
      for (const locId of LOCATION_BONUS_IDS) {
        const key = `${side}_${locId}`;
        let btn = this.locationBonusButtons[key];
        if (!btn) {
          btn = document.createElement('div');
          btn.className = 'location-bonus-btn hidden';
          btn.dataset.side = side;
          btn.dataset.locId = locId;
          btn.innerHTML = `<img class="lb-icon" src="ui/${side}_loc${locId}.png" alt="" onerror="this.outerHTML='<span class=&quot;lb-icon lb-icon-fallback&quot;>🎁</span>'">`;
          btn.title = this._locationBonusTooltip(locId);
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.classList.contains('disabled')) return;
            this._onLocationBonusClick(side, locId);
          });
          this.refs.locationBonusContainer.appendChild(btn);
          this.locationBonusButtons[key] = btn;
        }

        const inDiscardPhase = this.ui.discardMode;
        const locked = this.ui.discardLocked;

        let natural;
        if (locId === 2) {
          natural = side === game.currentTurn
            && !game.locationBonusUsed[side][2]
            && !game.actionTakenThisTurn[side]
            && game.hasBonusAdvantage(side, 2);
        } else {
          natural = game.canUseLocationBonus(side, locId);
        }

        if (locId === 5 && natural) {
          const targets = this._getLocation5Targets(side);
          if (targets.size === 0) natural = false;
        }

        let visible = natural;
        let enabled = true;

        if (this.debugShowAllBonuses) {
          visible = true;
          enabled = true;
        } else {
          if (locId === 2) enabled = visible && game.cardState[side].deck.length > 0;
          else if (locId === 4) enabled = visible && game.cardState[side].discard.length > 0;

          if (inDiscardPhase && !locked) enabled = false;
          if (locked) visible = false;

          const revealActive = game.revealState.active && game.revealState.side === side && locId === 2;
          if (revealActive) visible = true;
          if (game.revealState.active && !revealActive) enabled = false;
        }

        const active = !!(this.ui.activePanel
          && this.ui.activePanel.side === side
          && this.ui.activePanel.locId === locId);
        if (active) visible = true;

        btn.classList.toggle('hidden', !visible);
        btn.classList.toggle('active', active);
        btn.classList.toggle('disabled', visible && !enabled);
        btn.classList.toggle('white-team', side === 'white');
        btn.classList.toggle('black-team', side === 'black');
      }
    }
    this._projectLocationBonusButtons();
  }

  _locationBonusTooltip(locId) {
    if (locId === 2) return 'Бонус локации: вскрыть 2 карты из колоды';
    if (locId === 4) return 'Бонус локации: сбросить карту, взять из сброса';
    if (locId === 5) return 'Бонус локации: телепортировать персонажа';
    return 'Бонус локации: сбросить карту, взять новую';
  }

  _projectLocationBonusButtons() {
    const rect = this._bodyRectOf(this.renderer.domElement);
    const yOff = IS_MOBILE ? MOBILE_BONUS_Y_OFFSET : 0;
    for (const side of ['white', 'black']) {
      for (const locId of LOCATION_BONUS_IDS) {
        const btn = this.locationBonusButtons[`${side}_${locId}`];
        if (!btn) continue;
        const pos = LOCATION_BONUS_POSITIONS[side][locId];
        if (!pos) continue;
        const { x: wx, z: wz } = pxTo3D(pos.x, pos.y);
        const vec = new THREE.Vector3(wx, 0.5, wz).project(this.camera);
        const sx = (vec.x * 0.5 + 0.5) * rect.width + rect.left;
        const sy = (-vec.y * 0.5 + 0.5) * rect.height + rect.top;
        btn.style.left = sx + 'px';
        btn.style.top = (sy + yOff) + 'px';
      }
    }
  }

  // ==========================================================
  // ЛОКАЦИОННЫЕ БОНУСЫ
  // ==========================================================

  _onLocationBonusClick(side, locId) {
    const game = this.game;
    if (this.animating || game.gameOver) return;
    if (side !== game.currentTurn) return;
    if (this.ui.discardMode || this.ui.discardLocked) return;
    if (game.revealState.active) return;

    if (this.ui.endTurnPanelOpen) this._cancelEndTurnConfirm();
    this._resetSelectionLocal();

    const active = this.ui.activePanel;
    if (active && active.side === side && active.locId === locId) {
      this._hideLocationPanel();
      return;
    }
    if (active) this._hideLocationPanel();
    if (!this.refs.bonus2Confirm.classList.contains('hidden')) {
      this.refs.bonus2Confirm.classList.add('hidden');
    }

    if (locId === 2) {
      if (game.cardState[side].deck.length === 0) return;
      if (game.locationBonusUsed[side][2]) return;
      if (!game.hasBonusAdvantage(side, 2)) return;
      this._openLocation2(side);
      return;
    }
    if (!game.canUseLocationBonus(side, locId)) return;

    if (locId === 5) {
      if (!this._getLocation5Piece(side)) return;
      this._openLocation5(side);
      return;
    }
    if (locId === 4) {
      if (game.cardState[side].discard.length === 0) return;
      this._openLocation4(side);
      return;
    }
    this._openLocation1(side);
  }

  _hideLocationPanel() {
    if (this.game && this.game.revealState && this.game.revealState.active) {
      return;
    }

    this.ui.activePanel = null;
    this.ui.loc1SelectedUid = null;
    this.ui.bonus4Phase = null;
    this.ui.bonus4HandUid = null;
    this.ui.bonus4DiscardUid = null;
    this.ui.bonus5Phase = null;
    this.ui.bonus5PieceId = null;
    this.ui.bonus5TargetCell = null;

    this.refs.locationBonusPanel.classList.add('hidden');
    this.refs.locationBonusPanel.classList.remove('white-turn', 'black-turn');
    this.refs.bonus2Confirm.classList.add('hidden');
    this.refs.bonus2Confirm.classList.remove('white-turn', 'black-turn');

    const btn = this.refs.lbpConfirm;
    btn.classList.add('hidden');
    btn.classList.remove('enabled');
    btn.disabled = true;
    btn.onclick = null;

    this.refs.locationBonusIcon.style.display = '';
    this.refs.locationBonusIcon.classList.remove('active');

    this.refs.lbpMiniCards.innerHTML = '';
    this.refs.lbpMiniCards.classList.add('hidden');
    this.refs.lbpPieceChoice.classList.add('hidden');
    this.refs.lbpPieceOptions.innerHTML = '';
    this.refs.lbpDiscardCards.innerHTML = '';
    this.refs.lbpDiscardCards.classList.add('hidden');
    const pd = this.refs.lbpPendingDiscard;
    if (pd) {
      pd.classList.add('hidden');
      const pdCards = pd.querySelector('.lpd-cards');
      if (pdCards) pdCards.innerHTML = '';
    }
    this.refs.lbpRevealColumns.classList.add('hidden');
    this.refs.lbpRevealList.innerHTML = '';

    this._clearGroup(this.reachableGroup);
    this._clearGroup(this.plannedPathGroup);
    for (const [, entry] of this.pieceMeshes.entries()) {
      const sel = entry.mesh.children[4];
      if (sel) sel.visible = false;
      if (entry.bonus5Ring) entry.bonus5Ring.visible = false;
    }

    this._clearRevealCards();

    this._renderLocationBonusButtons();
    this._updateHighlights();
    this._renderHands();
    this._renderDeckVisuals();
  }

  _openLocation1(side) {
    if (this.ui.endTurnPanelOpen) this._cancelEndTurnConfirm();
    this.ui.activePanel = { kind: 'loc1', side, locId: 1 };
    this.ui.loc1SelectedUid = null;

    this.refs.locationBonusPanel.classList.remove('hidden');
    this.refs.locationBonusPanel.classList.toggle('white-turn', side === 'white');
    this.refs.locationBonusPanel.classList.toggle('black-turn', side === 'black');
    this.refs.lbpTitle.textContent = `🎁 Бонус ${LOCATION_ORDINALS[1]} локации`;
    this.refs.lbpSub.textContent = 'Выберите мини-карту, чтобы сбросить её и взять новую из колоды. Это действие необратимо.';

    this.refs.locationBonusIcon.style.display = 'none';
    this.refs.lbpPieceChoice.classList.add('hidden');
    this.refs.lbpDiscardCards.classList.add('hidden');
    this.refs.lbpPendingDiscard.classList.add('hidden');
    this.refs.lbpRevealColumns.classList.add('hidden');
    this.refs.bonus2Confirm.classList.add('hidden');

    this._renderLocation1Cards();
    this._updateLbpConfirmVisibility();
    this._renderLocationBonusButtons();
  }

  _renderLocation1Cards() {
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc1') return;
    const side = panel.side;
    const st = this.game.cardState[side];
    const mc = this.refs.lbpMiniCards;
    mc.classList.remove('hidden');
    mc.classList.toggle('black-side', side === 'black');
    mc.innerHTML = '';

    st.hand.forEach((card) => {
      const el = document.createElement('div');
      el.className = 'discard-mini ' + (side === 'white' ? 'white-card' : 'black-card');
      if (this.ui.loc1SelectedUid === card.uid) el.classList.add('selected');
      const img = document.createElement('img');
      img.src = card.imgPath; img.onerror = () => img.remove();
      el.appendChild(img);
      el.title = `${card.charName} — ${card.name} (клик — выбрать, повторный клик — подтвердить)`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.ui.loc1SelectedUid === card.uid) {
          this._confirmLocation1();
        } else {
          this.ui.loc1SelectedUid = card.uid;
          this._renderLocation1Cards();
          this._updateLbpConfirmVisibility();
        }
      });
      this._attachHoverToElement(el, card);
      mc.appendChild(el);
    });
  }

  _confirmLocation1() {
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc1') return;
    const uid = this.ui.loc1SelectedUid;
    if (!uid) return;
    this.dispatch({ kind: 'locationBonus1', side: panel.side, cardUid: uid });
    this._hideLocationPanel();
  }

  _openLocation2(side) {
    if (this.ui.endTurnPanelOpen) this._cancelEndTurnConfirm();
    this.ui.activePanel = { kind: 'loc2', side, locId: 2 };
    const b2 = this.refs.bonus2Confirm;
    b2.classList.remove('hidden');
    b2.classList.toggle('white-turn', side === 'white');
    b2.classList.toggle('black-turn', side === 'black');
    this.refs.locationBonusPanel.classList.add('hidden');
    this._renderLocationBonusButtons();
  }

  _activateLocation2() {
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc2') return;
    const side = panel.side;
    this.refs.bonus2Confirm.classList.add('hidden');
    this.dispatch({ kind: 'locationBonus2Start', side });
  }

  _renderLocation2Panel() {
    const game = this.game;
    if (!game.revealState.active) {
      this._hideLocationPanel();
      return;
    }
    const side = game.revealState.side;
    this.ui.activePanel = { kind: 'loc2', side, locId: 2 };

    this._renderLocation2ButtonsOnly();
    this._renderRevealCards(side);
    this._renderLocationBonusButtons();
  }

  // ★ Обновляет только кнопки «Вернуть»/«Сбросить» и заголовки панели
  //   бонуса 2. НЕ трогает слой вскрытых карт (`revealLayer`) — это
  //   позволяет вызывать его посреди анимации resolve, не пересоздавая
  //   оставшиеся карты вскрытия (иначе они визуально прыгают на новые
  //   позиции).
  _renderLocation2ButtonsOnly() {
    const game = this.game;
    const side = game.revealState.side;

    this.refs.locationBonusPanel.classList.remove('hidden');
    this.refs.locationBonusPanel.classList.toggle('white-turn', side === 'white');
    this.refs.locationBonusPanel.classList.toggle('black-turn', side === 'black');
    this.refs.lbpTitle.textContent = '🎁 Бонус второй локации';
    this.refs.lbpSub.textContent = 'Верните карту на верх колоды или сбросьте её.';

    this.refs.locationBonusIcon.style.display = 'none';
    this.refs.lbpMiniCards.classList.add('hidden');
    this.refs.lbpPieceChoice.classList.add('hidden');
    this.refs.lbpDiscardCards.classList.add('hidden');
    this.refs.lbpPendingDiscard.classList.add('hidden');
    const pdCards = this.refs.lbpPendingDiscard.querySelector('.lpd-cards');
    if (pdCards) pdCards.innerHTML = '';
    this.refs.lbpRevealColumns.classList.remove('hidden');
    this.refs.lbpConfirm.classList.add('hidden');

    const list = this.refs.lbpRevealList;
    list.innerHTML = '';
    const cards = game.revealState.cards;
    for (let i = cards.length - 1; i >= 0; i--) {
      const card = cards[i];
      const wrap = document.createElement('div');
      wrap.className = 'lbp-reveal-item';

      const btnR = document.createElement('button');
      btnR.className = 'lbp-reveal-btn return-btn';
      btnR.textContent = 'Вернуть';
      btnR.onclick = (e) => {
        e.stopPropagation();
        this.dispatch({ kind: 'locationBonus2Resolve', side, cardUid: card.uid, action: 'return' });
      };
      wrap.appendChild(btnR);

      const cardEl = document.createElement('div');
      cardEl.className = 'discard-mini ' + (side === 'white' ? 'white-card' : 'black-card');
      const img = document.createElement('img');
      img.src = card.imgPath; img.onerror = () => img.remove();
      cardEl.appendChild(img);
      cardEl.title = `${card.charName} — ${card.name}`;
      this._attachHoverToElement(cardEl, card);
      wrap.appendChild(cardEl);

      const btnD = document.createElement('button');
      btnD.className = 'lbp-reveal-btn discard-btn';
      btnD.textContent = 'Сбросить';
      btnD.onclick = (e) => {
        e.stopPropagation();
        this.dispatch({ kind: 'locationBonus2Resolve', side, cardUid: card.uid, action: 'discard' });
      };
      wrap.appendChild(btnD);
      list.appendChild(wrap);
    }
  }

  _renderRevealCards(side) {
    const layer = this.refs.revealLayer;
    layer.innerHTML = '';
    this.revealCardElements = [];
    const game = this.game;
    if (!game.revealState.active) return;

    layer.classList.toggle('white-team', side === 'white');
    layer.classList.toggle('black-team', side === 'black');

    game.revealState.cards.forEach(card => {
      const el = document.createElement('div');
      el.className = 'reveal-card';
      el.dataset.cardUid = card.uid;
      const img = document.createElement('img');
      img.src = card.imgPath;
      img.onerror = () => img.remove();
      el.appendChild(img);
      el.addEventListener('click', (e) => e.stopPropagation());
      this._attachHoverToElement(el, card);
      layer.appendChild(el);
      this.revealCardElements.push(el);
    });

    this._positionRevealCards(side);
  }

  _positionRevealCards(side) {
    if (this.revealCardElements.length === 0) return;
    const deckEl = side === 'white' ? this.refs.whiteDeckVisual : this.refs.blackDeckVisual;
    if (!deckEl) return;

    const rect = this._bodyRectOf(deckEl);
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const scale = Math.min(window.innerWidth / VIRTUAL_W, vh / VIRTUAL_H);
    const firstRect = this.revealCardElements[0].getBoundingClientRect();
    const cardW = (firstRect.width || 110) / scale;
    const cardH = (firstRect.height || 156) / scale;
    const gap = Math.max(6, cardW * 0.11);

    const cx = rect.left + rect.width / 2;
    const startX = cx - cardW / 2;
    const baseY = rect.top - cardH * 0.4;

    const n = this.revealCardElements.length;
    this.revealCardElements.forEach((el, i) => {
      el.style.left = startX + 'px';
      el.style.top  = (baseY - cardH * (n - i) - gap * (n - i - 1)) + 'px';
    });
  }

  _clearRevealCards() {
    if (this.refs.revealLayer) this.refs.revealLayer.innerHTML = '';
    this.revealCardElements = [];
  }

  _openLocation4(side) {
    if (this.ui.endTurnPanelOpen) this._cancelEndTurnConfirm();
    this.ui.activePanel = { kind: 'loc4', side, locId: 4 };
    this.ui.bonus4Phase = 'pick-hand';
    this.ui.bonus4HandUid = null;
    this.ui.bonus4DiscardUid = null;

    this.refs.locationBonusPanel.classList.remove('hidden');
    this.refs.locationBonusPanel.classList.toggle('white-turn', side === 'white');
    this.refs.locationBonusPanel.classList.toggle('black-turn', side === 'black');
    this.refs.lbpTitle.textContent = `🎁 Бонус ${LOCATION_ORDINALS[4]} локации`;
    this.refs.lbpSub.textContent = 'Выберите мини-карту, чтобы сбросить её и взять другую карту из сброса.';

    this.refs.locationBonusIcon.style.display = 'none';
    this.refs.lbpPieceChoice.classList.add('hidden');
    this.refs.lbpDiscardCards.classList.add('hidden');
    this.refs.lbpPendingDiscard.classList.add('hidden');
    this.refs.lbpRevealColumns.classList.add('hidden');

    this._renderLocation4HandPhase();
    this._renderLocationBonusButtons();
  }

  _renderLocation4HandPhase() {
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc4') return;
    const side = panel.side;
    const st = this.game.cardState[side];
    const mc = this.refs.lbpMiniCards;
    mc.classList.remove('hidden');
    mc.classList.toggle('black-side', side === 'black');
    mc.innerHTML = '';

    st.hand.forEach((card) => {
      const el = document.createElement('div');
      el.className = 'discard-mini ' + (side === 'white' ? 'white-card' : 'black-card');
      const img = document.createElement('img');
      img.src = card.imgPath; img.onerror = () => img.remove();
      el.appendChild(img);
      el.title = `${card.charName} — ${card.name}`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ui.bonus4HandUid = card.uid;
        this.ui.bonus4Phase = 'pick-discard';
        this._renderLocation4DiscardPhase();
      });
      this._attachHoverToElement(el, card);
      mc.appendChild(el);
    });

    this._updateLbpConfirmVisibility();
    this._renderLocationBonusButtons();
  }

  _renderLocation4DiscardPhase() {
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc4') return;
    const side = panel.side;
    const st = this.game.cardState[side];

    this.refs.lbpSub.textContent = 'Выберите карту из сброса, чтобы вернуть её в руку.';
    this.refs.lbpMiniCards.classList.add('hidden');

    const dc = this.refs.lbpDiscardCards;
    dc.classList.remove('hidden');
    dc.innerHTML = '';

    if (st.discard.length === 0) {
      dc.classList.add('hidden');
    } else {
      st.discard.forEach((card) => {
        const el = document.createElement('div');
        el.className = 'discard-mini ' + (side === 'white' ? 'white-card' : 'black-card');
        if (this.ui.bonus4DiscardUid === card.uid) el.classList.add('selected');
        const img = document.createElement('img');
        img.src = card.imgPath; img.onerror = () => img.remove();
        el.appendChild(img);
        el.title = `${card.charName} — ${card.name} (клик — выбрать, повторный клик — подтвердить)`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.ui.bonus4DiscardUid === card.uid) {
            this._completeLocation4(card.uid);
            return;
          }
          this.ui.bonus4DiscardUid = card.uid;
          this._renderLocation4DiscardPhase();
        });
        this._attachHoverToElement(el, card);
        dc.appendChild(el);
      });
    }

    this._renderLocation4PendingDiscard();
    this._updateLbpConfirmVisibility();
    this._renderLocationBonusButtons();
  }

  _renderLocation4PendingDiscard() {
    const pd = this.refs.lbpPendingDiscard;
    const cards = pd.querySelector('.lpd-cards');
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc4') return;
    const side = panel.side;
    const handUid = this.ui.bonus4HandUid;
    const handCard = handUid ? this.game.cardState[side].hand.find(c => c.uid === handUid) : null;
    if (!handCard) {
      pd.classList.add('hidden');
      cards.innerHTML = '';
      return;
    }
    pd.classList.remove('hidden');
    cards.innerHTML = '';

    const el = document.createElement('div');
    el.className = 'discard-mini ' + (side === 'white' ? 'white-card' : 'black-card');
    el.style.cursor = 'default';
    const img = document.createElement('img');
    img.src = handCard.imgPath; img.onerror = () => img.remove();
    el.appendChild(img);
    el.title = `${handCard.charName} — ${handCard.name}`;
    this._attachHoverToElement(el, handCard);
    cards.appendChild(el);

    const back = document.createElement('div');
    back.className = 'lpd-back-btn';
    back.textContent = '↺';
    back.title = 'Вернуться к выбору карты для сброса';
    back.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = this.ui.activePanel;
      if (!panel || panel.kind !== 'loc4') return;
      this._openLocation4(panel.side);
    });
    cards.appendChild(back);
  }

  _completeLocation4(discardUid) {
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc4') return;
    const handUid = this.ui.bonus4HandUid;
    if (!handUid || !discardUid) return;
    this.dispatch({
      kind: 'locationBonus4', side: panel.side,
      handCardUid: handUid, discardCardUid: discardUid,
    });
    this._hideLocationPanel();
  }

  _getLocation5PhysicalCells(side) {
    const physical = side === 'white' ? 5 : 1;
    return LOCATION_CELLS[physical] || [];
  }

  _getLocation5Piece(side) {
    const cells = this._getLocation5PhysicalCells(side);
    return this.game.pieces.find(p => p.side === side && cells.includes(p.cellId));
  }

  _getLocation5Targets(side) {
    const myCells = this._getLocation5PhysicalCells(side);
    const excluded = new Set([...myCells, ...LOCATION_CELLS[3]]);
    const targets = new Set();
    BOARD.forEach(cell => {
      if (excluded.has(cell.id)) return;
      if (cell.type === 'base-white' || cell.type === 'base-black') return;
      if (this.game.pieces.some(p => p.cellId === cell.id)) return;
      targets.add(cell.id);
    });
    return targets;
  }

  _renderLocation5Highlights() {
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc5') return;
    if (this.ui.bonus5Phase !== 'pick-cell') return;

    const side = panel.side;
    this._clearGroup(this.reachableGroup);
    this._clearGroup(this.plannedPathGroup);

    const hasTarget = this.ui.bonus5TargetCell !== null
                   && this.ui.bonus5TargetCell !== undefined;

    const myCells = this._getLocation5PhysicalCells(side);
    const excluded = new Set([...myCells, ...BLUE_CELLS]);

    BOARD.forEach(cell => {
      if (excluded.has(cell.id)) return;
      if (cell.type === 'base-white' || cell.type === 'base-black') return;
      if (this.game.pieces.some(p => p.cellId === cell.id)) return;
      if (hasTarget && cell.id === this.ui.bonus5TargetCell) return;

      this.reachableGroup.add(this._createHighlightAt(cell.x, cell.z, {
        color:       hasTarget ? 0x18181c : 0x5a18a0,
        colorRing:   0x9a4fff,
        opacity:     hasTarget ? 0.65 : 0.7,
        ringOpacity: hasTarget ? 0.95 : 0.9,
        radius: 0.52, ringWidth: 0.08, y: 0.07, shape: 'blob',
      }));
    });

    if (hasTarget) {
      const p = getPoint(this.ui.bonus5TargetCell);
      this.plannedPathGroup.add(this._createFinalHighlightAt(p.x, p.z, {
        y: 0.15, shape: 'blob',
      }));
    }
  }

  _openLocation5(side) {
    if (this.ui.endTurnPanelOpen) this._cancelEndTurnConfirm();
    const cells = this._getLocation5PhysicalCells(side);
    const candidates = this.game.pieces.filter(p => p.side === side && cells.includes(p.cellId));
    if (candidates.length === 0) return;

    this.ui.activePanel = { kind: 'loc5', side, locId: 5 };
    this.ui.bonus5Phase = candidates.length === 1 ? 'pick-cell' : 'pick-piece';
    this.ui.bonus5PieceId = candidates.length === 1 ? candidates[0].id : null;
    this.ui.bonus5TargetCell = null;

    this.refs.locationBonusPanel.classList.remove('hidden');
    this.refs.locationBonusPanel.classList.toggle('white-turn', side === 'white');
    this.refs.locationBonusPanel.classList.toggle('black-turn', side === 'black');
    this.refs.lbpTitle.textContent = `🎁 Бонус ${LOCATION_ORDINALS[5]} локации`;

    this.refs.locationBonusIcon.style.display = 'none';
    this.refs.lbpMiniCards.classList.add('hidden');
    this.refs.lbpDiscardCards.classList.add('hidden');
    this.refs.lbpPendingDiscard.classList.add('hidden');
    this.refs.lbpRevealColumns.classList.add('hidden');

    this._renderLocation5PieceChoice();

    if (this.ui.bonus5Phase === 'pick-cell') {
      this._openLocation5CellPick(side, this.ui.bonus5PieceId);
    } else {
      this.refs.lbpSub.textContent = 'Выберите персонажа для перемещения.';
      this.refs.lbpPieceChoice.classList.remove('hidden');
    }

    this._renderLocationBonusButtons();
  }

  _renderLocation5PieceChoice() {
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc5') return;
    const side = panel.side;
    const cells = this._getLocation5PhysicalCells(side);
    const candidates = this.game.pieces.filter(p => p.side === side && cells.includes(p.cellId));

    const wrap = this.refs.lbpPieceChoice;
    wrap.classList.remove('hidden');

    if (this.ui.bonus5Phase === 'pick-cell') {
      this.refs.lbpPieceTitle.style.display = '';
      this.refs.lbpPieceTitle.textContent = 'ПЕРЕМЕСТИТСЯ:';
    } else {
      this.refs.lbpPieceTitle.style.display = 'none';
      this.refs.lbpPieceTitle.textContent = '';
    }

    const opts = this.refs.lbpPieceOptions;
    opts.innerHTML = '';

    candidates.forEach(piece => {
      const el = document.createElement('div');
      el.className = 'piece-option ' + side;
      el.dataset.pieceId = piece.id;
      el.style.backgroundImage = `url('${piece.profile.sprite}')`;
      el.title = `${piece.name} — клетка ${piece.cellId}`;
      if (this.ui.bonus5Phase === 'pick-cell' && this.ui.bonus5PieceId === piece.id) {
        el.classList.add('selected');
      }
      if (candidates.length === 1) el.classList.add('inactive');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (candidates.length === 1) return;
        if (this.ui.bonus5Phase === 'pick-cell' && this.ui.bonus5PieceId === piece.id) return;

        if (this.ui.bonus5Phase === 'pick-cell') {
          this.ui.bonus5PieceId = piece.id;
          for (const [, en] of this.pieceMeshes.entries()) {
            if (en.bonus5Ring) en.bonus5Ring.visible = false;
          }
          const entry = this.pieceMeshes.get(piece.id);
          if (entry && entry.bonus5Ring) {
            entry.bonus5Ring.visible = true;
          }
          this._renderLocation5PieceChoice();
          this._renderLocation5Highlights();
          return;
        }

        this.ui.bonus5PieceId = piece.id;
        this._openLocation5CellPick(side, piece.id);
      });
      opts.appendChild(el);
    });
  }

  _openLocation5CellPick(side, pieceId) {
    this.ui.bonus5Phase = 'pick-cell';
    this.ui.bonus5PieceId = pieceId;
    this.ui.bonus5TargetCell = null;

    this.refs.lbpSub.textContent = 'Выберите ячейку для перемещения.';
    this.refs.lbpPieceChoice.classList.remove('hidden');
    this._renderLocation5PieceChoice();

    for (const [, en] of this.pieceMeshes.entries()) {
      if (en.bonus5Ring) en.bonus5Ring.visible = false;
    }
    const entry = this.pieceMeshes.get(pieceId);
    if (entry && entry.bonus5Ring) {
      entry.bonus5Ring.visible = true;
    }

    this._renderLocation5Highlights();
    this._updateLbpConfirmVisibility();
  }

  _onLoc5CellPick(cellId) {
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc5') return false;
    if (this.ui.bonus5Phase !== 'pick-cell') return false;
    const side = panel.side;
    const pieceId = this.ui.bonus5PieceId;
    if (!pieceId) return false;

    const targets = this._getLocation5Targets(side);
    if (!targets.has(cellId)) return false;

    if (this.ui.bonus5TargetCell === cellId) { this._confirmLocation5(); return true; }

    this.ui.bonus5TargetCell = cellId;
    this.refs.lbpSub.textContent = 'Ячейка выбрана, персонаж будет перемещён в неё.';

    this._renderLocation5Highlights();
    this._updateLbpConfirmVisibility();
    return true;
  }

  _confirmLocation5() {
    const panel = this.ui.activePanel;
    if (!panel || panel.kind !== 'loc5') return;
    if (this.ui.bonus5Phase !== 'pick-cell') return;
    const pieceId = this.ui.bonus5PieceId;
    const targetCell = this.ui.bonus5TargetCell;
    if (!pieceId || targetCell === null || targetCell === undefined) return;
    for (const [, e] of this.pieceMeshes.entries()) {
      const sel = e.mesh.children[4];
      if (sel) { sel.visible = false; sel.rotation.z = 0; sel.scale.set(1,1,1); }
      if (e.bonus5Ring) { e.bonus5Ring.visible = false; e.bonus5Ring.rotation.z = 0; e.bonus5Ring.scale.set(1,1,1); }
      e.mesh.rotation.set(0, 0, 0);
    }
    this.dispatch({ kind: 'locationBonus5', side: panel.side, pieceId, targetCell });
    this._hideLocationPanel();
  }

  _updateLbpConfirmVisibility() {
    const btn = this.refs.lbpConfirm;
    if (!btn) return;

    const panel = this.ui.activePanel;
    if (!panel) {
      btn.classList.add('hidden');
      btn.classList.remove('enabled');
      btn.disabled = true;
      btn.onclick = null;
      return;
    }

    let showBtn = false;
    let enabled = false;

    if (panel.kind === 'loc1') {
      showBtn = true;
      enabled = !!this.ui.loc1SelectedUid;
      btn.onclick = (e) => {
        e.stopPropagation();
        if (!this.ui.loc1SelectedUid) return;
        this._confirmLocation1();
      };
    } else if (panel.kind === 'loc4') {
      showBtn = (this.ui.bonus4Phase === 'pick-discard');
      enabled = showBtn && !!this.ui.bonus4DiscardUid;
      btn.onclick = (e) => {
        e.stopPropagation();
        if (!this.ui.bonus4DiscardUid) return;
        this._completeLocation4(this.ui.bonus4DiscardUid);
      };
    } else if (panel.kind === 'loc5') {
      showBtn = (this.ui.bonus5Phase === 'pick-cell' && this.ui.bonus5TargetCell !== null);
      enabled = showBtn;
      btn.onclick = (e) => {
        e.stopPropagation();
        if (this.ui.bonus5TargetCell === null) return;
        this._confirmLocation5();
      };
    }

    btn.classList.toggle('hidden', !showBtn);
    btn.classList.toggle('enabled', enabled);
    btn.disabled = !enabled;
  }

  // ==========================================================
  // ЗЕРЦАЛА
  // ==========================================================

  _refreshMirrorBadge(piece) {
    this._removeMirrorMeshes(piece.id);
    const mirror = piece.mirror;
    if (!mirror) return;

    if (!this.mirrorTextures.has(mirror.uid)) {
      const img = new Image();
      img.onload = () => {
        const W = img.width, H = img.height;
        const sidePx = W * MIRROR_BADGE_CROP.sideFrac;
        const sx = (W - sidePx) / 2;
        const sy = H * MIRROR_BADGE_CROP.yTop;
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const R = 34, B = 8, G = 3;
        const cardSide = this._cardSideOf(mirror);
        const borderColor = cardSide === 'white' ? '#ef1f1f' : '#ffc300';
        roundRectPath(ctx, 0, 0, 256, 256, R); ctx.fillStyle = borderColor; ctx.fill();
        roundRectPath(ctx, B, B, 256-2*B, 256-2*B, R-B); ctx.fillStyle = '#000'; ctx.fill();
        const innerPad = B + G;
        const innerSize = 256 - 2*innerPad;
        const innerR = Math.max(0, R - innerPad);
        ctx.save();
        roundRectPath(ctx, innerPad, innerPad, innerSize, innerSize, innerR);
        ctx.clip();
        ctx.drawImage(img, sx, sy, sidePx, sidePx, innerPad, innerPad, innerSize, innerSize);
        const gloss = ctx.createLinearGradient(0, innerPad, 0, innerPad + innerSize*0.5);
        gloss.addColorStop(0.00, 'rgba(255,255,255,0.40)');
        gloss.addColorStop(0.30, 'rgba(255,255,255,0.12)');
        gloss.addColorStop(0.60, 'rgba(255,255,255,0.02)');
        gloss.addColorStop(1.00, 'rgba(255,255,255,0)');
        ctx.fillStyle = gloss; ctx.fillRect(innerPad, innerPad, innerSize, innerSize);
        ctx.restore();
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        this.mirrorTextures.set(mirror.uid, tex);
        this._refreshMirrorBadge(piece);
      };
      img.src = mirror.imgPath;
      return;
    }

    const tex = this.mirrorTextures.get(mirror.uid);
    const entry = this.pieceMeshes.get(piece.id);
    if (!entry) return;
    const group = entry.mesh;
    const tilt = THREE.MathUtils.degToRad(MIRROR_BADGE_TILT_DEG);
    const rotX = -Math.PI / 2 + tilt;

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(MIRROR_BADGE_SIZE * 1.05, MIRROR_BADGE_SIZE * 1.05),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.02, MIRROR_BADGE_OFFSET_Z);
    shadow.renderOrder = 220;
    group.add(shadow);

    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(MIRROR_BADGE_SIZE, MIRROR_BADGE_SIZE),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: true, toneMapped: false })
    );
    badge.rotation.x = rotX;
    badge.position.set(0, MIRROR_BADGE_HEIGHT, MIRROR_BADGE_OFFSET_Z);
    badge.renderOrder = 221;
    badge.userData = { pieceId: piece.id, badgeCard: mirror };
    group.add(badge);

    const shimTex = this.shimmerTexture.clone();
    shimTex.needsUpdate = true;
    shimTex.wrapS = THREE.RepeatWrapping;
    shimTex.wrapT = THREE.ClampToEdgeWrapping;
    shimTex.repeat.set(1, 1);
    shimTex.offset.set(-1, 0);
    const shim = new THREE.Mesh(
      new THREE.PlaneGeometry(MIRROR_BADGE_SIZE, MIRROR_BADGE_SIZE),
      new THREE.MeshBasicMaterial({
        map: shimTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, opacity: 0, toneMapped: false,
      })
    );
    shim.rotation.x = rotX;
    shim.position.set(0, MIRROR_BADGE_HEIGHT + 0.001, MIRROR_BADGE_OFFSET_Z);
    shim.renderOrder = 222;
    shim.userData = { pieceId: piece.id, phaseOffset: Math.random() * MIRROR_SHIMMER_INTERVAL, disabled: false };
    group.add(shim);

    this.mirrorMeshes.set(piece.id, { badge, shimmer: shim, shadow });
  }

  _removeMirrorMeshes(pieceId) {
    const m = this.mirrorMeshes.get(pieceId);
    if (!m) return;
    if (m.badge.parent) m.badge.parent.remove(m.badge);
    if (m.shimmer.parent) m.shimmer.parent.remove(m.shimmer);
    if (m.shadow.parent) m.shadow.parent.remove(m.shadow);
    m.badge.geometry.dispose(); m.badge.material.dispose();
    m.shimmer.geometry.dispose();
    if (m.shimmer.material.map) m.shimmer.material.map.dispose();
    m.shimmer.material.dispose();
    m.shadow.geometry.dispose(); m.shadow.material.dispose();
    this.mirrorMeshes.delete(pieceId);
  }

  _cardSideOf(card) {
    const game = this.game;
    if (game.teamConfig.white.members.includes(card.charKey) || game.teamConfig.white.captain === card.charKey) return 'white';
    return 'black';
  }

  _updateMirrorShimmerDimming() {
    for (const [, entry] of this.mirrorMeshes.entries()) {
      const pieceId = entry.badge.userData.pieceId;
      const piece = this.game.getPiece(pieceId);
      if (!piece) continue;
      const dim = piece.side !== this.game.currentTurn
               || this.ui.discardMode
               || this.ui.discardLocked
               || this.game.revealState.active;
      entry.badge.material.color.setHex(dim ? 0xb0b0b0 : 0xffffff);
      entry.badge.material.opacity = dim ? 0.9 : 1;
      entry.shimmer.userData.disabled = dim;
      if (dim) entry.shimmer.material.opacity = 0;
    }
  }

  _updateMirrorFieldReminders() {
    const container = this.refs.mirrorFieldReminders;
    if (!container) return;

    const side = this.game.currentTurn;
    const active = this.ui.discardMode && !this.ui.discardLocked;

    const wanted = new Set();
    if (active) {
      this.game.pieces.forEach(p => {
        if (p.side === side && p.mirror) wanted.add(p.id);
      });
    }

    for (const [id, el] of this.mirrorFieldReminders.entries()) {
      if (!wanted.has(id)) { el.remove(); this.mirrorFieldReminders.delete(id); }
    }

    wanted.forEach(id => {
      const piece = this.game.getPiece(id);
      if (!piece || !piece.mirror) return;
      let el = this.mirrorFieldReminders.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'mirror-field-reminder';
        const img = document.createElement('img');
        img.src = piece.mirror.imgPath;
        img.onerror = () => img.remove();
        el.appendChild(img);
        el.addEventListener('mousemove', (ev) => {
          this.lastMouseX = ev.clientX; this.lastMouseY = ev.clientY;
          if (this.ctrlPressed) {
            this._checkHoverAt(ev.clientX, ev.clientY);
            this._updateTabletOverlay();
            this._updateCardOverlay();
          }
        });
        el.addEventListener('mouseleave', () => {
          this.hoveredPieceId = null; this.hoveredCaptainSide = null; this.hoveredBadgeCard = null;
          this._updateTabletOverlay();
          this._updateCardOverlay();
        });
        el.addEventListener('click', (ev) => ev.stopPropagation());
        container.appendChild(el);
        this.mirrorFieldReminders.set(id, el);
      }
      const img = el.querySelector('img');
      if (img && img.getAttribute('src') !== piece.mirror.imgPath) img.setAttribute('src', piece.mirror.imgPath);
      el.classList.add('visible');
    });
  }

  // ==========================================================
  // ПОДСВЕТКИ
  // ==========================================================

  _clearGroup(group) {
    while (group.children.length > 0) {
      const c = group.children[0];
      if (c.userData && c.userData.stadiumState) {
        const s = c.userData.stadiumState;
        const idx = this.stadiumHighlights.indexOf(s);
        if (idx >= 0) this.stadiumHighlights.splice(idx, 1);
      }
      c.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      group.remove(c);
    }
  }

  _updateHighlights() {
    const game = this.game;
    if (!game) return;
    const mode = this.ui.pendingMode;
    const selectedId = this.ui.selectedPieceId;
	// ★ Гасим невидимую зону клика по базе; включим её ниже — но
    //   только если mode === 'explore'. Так зона не «залипнет»
    //   после выхода из режима исследования.
    if (this.exploreHitMesh) this.exploreHitMesh.visible = false;

    let previewId = null;
    if (this.ui.selectedCardUid) {
      const card = game.getCardByUid('white', this.ui.selectedCardUid)
                || game.getCardByUid('black', this.ui.selectedCardUid);
      if (card) previewId = card.charKey;
    }

    this._clearGroup(this.reachableGroup);
    this._clearGroup(this.plannedPathGroup);
    this._clearGroup(this.attackTargetsGroup);
    this._clearGroup(this.attackSelectedGroup);
    this._clearGroup(this.mirrorTargetsGroup);
    this._clearGroup(this.mirrorSelectedGroup);
    this._clearGroup(this.exploreTargetsGroup);
    this._clearGroup(this.exploreSelectedGroup);

    for (const [id, entry] of this.pieceMeshes.entries()) {
      const isSelected = (id === selectedId);
      const isPreview  = (id === previewId);
      const coin = entry.mesh.children[0];
      if (coin && coin.material) {
        if (isSelected)      coin.material.emissiveIntensity = 0.65;
        else if (isPreview)  coin.material.emissiveIntensity = 0.40;
        else                 coin.material.emissiveIntensity = 0.15;
      }
      const sel = entry.mesh.children[4];
      if (sel) sel.visible = (isSelected || isPreview) && mode !== 'mirror';
    }

    if (!selectedId || !mode) {
      if (!this.ui.selectedAttackTargetId) this._stopHpBlink();
      return;
    }
    const piece = game.getPiece(selectedId);
    if (!piece) return;

    if (mode === 'move') {
      const reachable = game.getReachableCells(piece);
      const inPath = new Set(this.ui.plannedPath);
      const hasPath = this.ui.plannedPath.length > 0;
      reachable.forEach(cellId => {
        if (inPath.has(cellId)) return;
        const p = getPoint(cellId);
        this.reachableGroup.add(this._createHighlightAt(p.x, p.z, {
          color: hasPath ? 0x18181c : 0x22cc44, colorRing: 0x88ff99,
          opacity: 0.65, ringOpacity: 0.95, radius: 0.5, ringWidth: 0.08, y: 0.13, shape: 'circle',
        }));
      });
      this.ui.plannedPath.forEach((cellId, i) => {
        const p = getPoint(cellId);
        const last = i === this.ui.plannedPath.length - 1;
        if (last) {
          this.plannedPathGroup.add(this._createFinalHighlightAt(p.x, p.z, { y: 0.13, shape: 'circle' }));
        } else {
          this.plannedPathGroup.add(this._createHighlightAt(p.x, p.z, {
            color: 0x22cc44, colorRing: 0x88ff99,
            opacity: 0.65, ringOpacity: 0.95, radius: 0.5, ringWidth: 0.08, y: 0.13, shape: 'circle',
          }));
        }
      });
    }

    if (mode === 'attack') {
      const targets = game.getAttackTargets(piece);
      targets.forEach(t => {
        const cell = getPoint(t.cellId);
        const isEnemy = t.side !== piece.side;
        this.attackTargetsGroup.add(this._createHighlightAt(cell.x, cell.z, {
          color: isEnemy ? 0xff7700 : 0x1e88ff,
          colorRing: isEnemy ? 0xffbb44 : 0x8ccfff,
          opacity: 0.75, ringOpacity: 1.0,
          radius: isEnemy ? 0.62 : 0.60, ringWidth: 0.07,
          y: COIN_HEIGHT + 0.012, shape: 'star5',
          innerShape: isEnemy ? 'star5' : 'circle',
          innerColor: isEnemy ? 0xffbb44 : 0x8ccfff,
          innerAlpha: 1.0, innerSizeFrac: isEnemy ? 0.28 : 0.20,
        }));
      });
      if (this.ui.selectedAttackTargetId) {
        const t = game.getPiece(this.ui.selectedAttackTargetId);
        if (t) {
          const cell = getPoint(t.cellId);
          const isEnemy = t.side !== piece.side;
          this.attackSelectedGroup.add(this._createFinalHighlightAt(cell.x, cell.z, {
            y: COIN_HEIGHT + 0.08, shape: 'star5',
            innerShape: isEnemy ? 'star5' : 'circle',
            innerAlpha: 1.0, innerSizeFrac: isEnemy ? 0.28 : 0.20,
          }));
          this._startHpBlink(t);
        } else this._stopHpBlink();
      } else this._stopHpBlink();
    } else {
      this._stopHpBlink();
    }

    if (mode === 'mirror') {
      const targets = game.getMirrorTargets(piece);
      targets.forEach(t => {
        const entry = this.pieceMeshes.get(t.id);
        if (!entry) return;
        const p = entry.mesh.position;
        this.mirrorTargetsGroup.add(this._createHighlightAt(p.x, p.z, {
          color: 0x00ccbb, colorRing: 0x44ffee, opacity: 0.65, ringOpacity: 1.0,
          radius: 0.60, ringWidth: 0.07, y: COIN_HEIGHT + 0.012, shape: 'square',
        }));
      });
      if (this.ui.selectedMirrorTargetId) {
        const t = game.getPiece(this.ui.selectedMirrorTargetId);
        if (t) {
          const entry = this.pieceMeshes.get(t.id);
          if (entry) {
            const p = entry.mesh.position;
            this.mirrorSelectedGroup.add(this._createFinalHighlightAt(p.x, p.z, {
              y: COIN_HEIGHT + 0.08, shape: 'square',
            }));
          }
        }
      }
    }

    if (mode === 'explore') {
      const enemyBaseId = piece.side === 'white' ? BASE_BLACK_ID : BASE_WHITE_ID;
      const cell = getPoint(enemyBaseId);
      const off = EXPLORE_HIGHLIGHT_OFFSET[piece.side];

      // ★ Включаем невидимую увеличенную зону клика ровно под
      //   визуальным стадионом — её центр и есть центр подсветки.
      if (this.exploreHitMesh) {
        const outwardSign = enemyBaseId === BASE_BLACK_ID ? +1 : -1;
        const SHIFT = 0.45;
        this.exploreHitMesh.visible = true;
        this.exploreHitMesh.position.x = cell.x + off.x + outwardSign * SHIFT;
        this.exploreHitMesh.position.z = cell.z + off.z;
        this.exploreHitMesh.userData.cellId = enemyBaseId;
      }

      this.exploreTargetsGroup.add(this._createStadiumHighlightAt(cell.x + off.x, cell.z + off.z, {
        width: 1.3, height: 3.4, y: 0.10,
        fillColor: 0xff2ec4, fillAlpha: 0.6,
        borderColor: 0xff8ce0, borderAlpha: 1.0, borderThickness: 6,
        useDashes: false, animate: false,
      }));

      if (this.ui.selectedExploreBase !== null) {
        this.exploreSelectedGroup.add(this._createStadiumHighlightAt(cell.x + off.x, cell.z + off.z, {
          width: 1.3, height: 3.4, y: 0.15,
          fillColor: 0xb8a8ff, fillAlpha: 0.42,
          borderColor: 0xb8a8ff, borderAlpha: 1.0, borderThickness: 4,
          dashLength: 34, dashGap: 24, dashWidth: 12, dashSpeed: 90,
          useDashes: true, animate: true,
        }));
      }
    }
  }

  _createHighlightAt(x, z, opts = {}) {
    const {
      color, colorRing, opacity = 0.55, ringOpacity = 0.95,
      radius = 0.5, ringWidth = 0.08, y = COIN_HEIGHT + 0.012, shape = 'circle',
      innerShape = null, innerColor = null, innerAlpha = 1.0, innerSizeFrac = 0.42,
    } = opts;
    const group = new THREE.Group();
    const tex = createShapeTexture(shape, color, colorRing ?? color, {
      fillAlpha: opacity, ringAlpha: ringOpacity,
      ringWidth: Math.max(8, ringWidth * 256 * 0.9),
      innerShape, innerColor, innerAlpha, innerSizeFrac,
    });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 100;
    group.add(mesh);
    return group;
  }

  _createFinalHighlightAt(x, z, opts = {}) {
    const {
      radius = 0.55, y = COIN_HEIGHT + 0.08, shape = 'circle',
      innerShape = null, innerColor = null, innerAlpha = 1.0, innerSizeFrac = 0.42,
    } = opts;
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const FINAL = '#b8a8ff';
    const baseTex = createShapeTexture(shape, FINAL, FINAL, {
      fillAlpha: 0.38, ringAlpha: 1.0, ringWidth: 11, underlayBlack: true,
      innerShape, innerColor, innerAlpha, innerSizeFrac,
    });
    const baseMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({ map: baseTex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
    );
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.renderOrder = 110;
    group.add(baseMesh);

    const dashTex = createDashedRingTexture(FINAL, { underlayBlack: true, shape });
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2.5, radius * 2.5),
      new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.y = 0.005;
    dash.renderOrder = 111;
    group.add(dash);
    this.spinningHighlights.push({ mesh: dash, speed: 1.4 });
    return group;
  }

  _createStadiumHighlightAt(x, z, opts = {}) {
    const {
      width = 2.2, height = 4.2, y = 0.13,
      fillColor = 0xff7000, fillAlpha = 0.6,
      borderColor = 0x3a5fff, borderAlpha = 0.95, borderThickness = 4,
      dashLength = 32, dashGap = 22, dashWidth = 13, dashSpeed = 90,
      useDashes = false, animate = false,
    } = opts;
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const aspect = width / height;
    const canvasH = 512, canvasW = Math.round(canvasH * aspect);
    const canvas = document.createElement('canvas');
    canvas.width = canvasW; canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    const state = {
      canvasW, canvasH, ctx,
      fillColor, fillAlpha, borderColor, borderAlpha, borderThickness,
      dashLength, dashGap, dashWidth,
      phase: 0, dashSpeed, useDashes,
    };

    function redraw() {
      ctx.clearRect(0, 0, canvasW, canvasH);
      const pad = 14, w = canvasW - pad*2, h = canvasH - pad*2;
      const cx = canvasW/2, cy = canvasH/2, r = w/2, halfH = h/2;
      function path() {
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - halfH + r);
        ctx.arc(cx, cy - halfH + r, r, Math.PI, 2*Math.PI, false);
        ctx.lineTo(cx + r, cy + halfH - r);
        ctx.arc(cx, cy + halfH - r, r, 0, Math.PI, false);
        ctx.closePath();
      }
      const underlayWidth = useDashes ? (dashWidth + 12) : (borderThickness + 10);
      ctx.save(); path();
      ctx.strokeStyle = 'rgba(15,8,25,0.92)';
      ctx.lineWidth = underlayWidth; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
      if (fillAlpha > 0) {
        ctx.save(); path();
        ctx.fillStyle = colorToRgba(fillColor, fillAlpha); ctx.fill(); ctx.restore();
      }
      ctx.save(); path();
      ctx.strokeStyle = colorToRgba(borderColor, borderAlpha * 0.9);
      ctx.lineWidth = borderThickness; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
      if (useDashes) {
        ctx.save(); path();
        ctx.setLineDash([dashLength, dashGap]);
        ctx.lineDashOffset = state.phase;
        ctx.strokeStyle = colorToRgba(borderColor, 1.0);
        ctx.lineWidth = dashWidth;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.stroke(); ctx.restore();
      }
      if (state.tex) state.tex.needsUpdate = true;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    state.tex = tex;
    redraw();

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 5;
    group.add(mesh);

    if (animate && useDashes) {
      state.redraw = redraw;
      this.stadiumHighlights.push(state);
      group.userData.stadiumState = state;
    }
    return group;
  }

  // ==========================================================
  // ПАНЕЛЬ ЗАВЕРШЕНИЯ ХОДА
  // ==========================================================

  _updateEndTurnPanel() {
    const game = this.game;
    const refs = this.refs;
    const side = game.currentTurn;
    const st = game.cardState[side];
    const panel = refs.endTurnConfirm;

    if (!this.ui.endTurnPanelOpen) {
      panel.classList.add('hidden');
      panel.classList.remove('white-turn', 'black-turn');
    } else {
      panel.classList.remove('hidden');
      panel.classList.toggle('white-turn', side === 'white');
      panel.classList.toggle('black-turn', side === 'black');

      const title = panel.querySelector('.etc-title');
      const sub = panel.querySelector('.etc-sub');

      const mirrorExists = game.pieces.some(p => p.side === side && p.mirror);
      const allActionsDone = st.playedThisTurn >= 4 && (!mirrorExists || this.ui.discardLocked);
      const noCardsToDiscard = st.hand.length <= 1 || this.ui.discardLocked;

      if (this.ui.discardMode && st.hand.length > 1) {
        title.textContent = '⚠ Остались несброшенные карты';
        sub.textContent = 'Выберите карту в руке, чтобы сбросить её.';
      } else if (this.ui.discardMode && this.ui.discardLocked) {
        title.textContent = '✓ Все доступные действия совершены';
        sub.textContent = 'Завершите ход кнопкой «Завершить ход».';
      } else if (mirrorExists && noCardsToDiscard) {
        title.textContent = '⚠ Остались карты в зерцале';
        sub.textContent = 'Вы можете сыграть их если хотите или завершить ход.';
      } else if (allActionsDone) {
        title.textContent = '✓ Все доступные действия совершены';
        sub.textContent = '\u00A0';
      } else {
        title.textContent = '⚠ Остались неразыгранные карты';
        sub.textContent = 'Нажмите, чтобы перейти в режим сброса карт.';
      }
    }

    this._updateDiscardTriggerUI();
  }

  _updateDiscardTriggerUI() {
    const side = this.game.currentTurn;
    const st = this.game.cardState[side];

    const warningVisible = this.ui.endTurnPanelOpen;
    const visible = warningVisible && st.hand.length > 1;

    const el = this.refs.discardTrigger;
    el.classList.toggle('hidden', !visible);
    el.classList.toggle('active', this.ui.discardMode);
    el.classList.toggle('locked', this.ui.discardLocked);
    el.title = this.ui.discardLocked
      ? 'Фаза сброса — необратима'
      : (this.ui.discardMode ? 'Выйти из режима сброса' : 'Сбросить карты');

    this.refs.discardDim.classList.toggle('visible', !!this.ui.discardMode);

    if (this.refs.endTurnBtn) {
      this.refs.endTurnBtn.classList.toggle(
        'end-turn-locked',
        !!this.ui.discardMode || !!this.ui.discardLocked
      );
    }
  }

  _openEndTurnPanel() {
    if (this.ui.activePanel || !this.refs.bonus2Confirm.classList.contains('hidden')) {
      this._hideLocationPanel();
    }
    this.ui.endTurnPanelOpen = true;
    this._updateEndTurnPanel();
    this._renderHands();
    this._renderLocationBonusButtons();
  }

  _closeEndTurnPanel() {
    this.ui.endTurnPanelOpen = false;
    this.ui.discardMode = false;
    this.ui.discardPickUid = null;
    this.ui.discardLocked = false;
    this._updateEndTurnPanel();
    this._updateDiscardDim();
    this._renderHands();
    this._renderLocationBonusButtons();
  }

  _cancelEndTurnConfirm() {
    if (this.ui.discardMode || this.ui.discardLocked) return;
    this.ui.endTurnPanelOpen = false;
    this.ui.discardPickUid = null;
    this._updateEndTurnPanel();
    this._updateDiscardDim();
    this._renderHands();
    this._renderLocationBonusButtons();
  }

  _updateDiscardDim() {
    this.refs.discardDim.classList.toggle('visible', !!this.ui.discardMode);
  }

  _updateDiscardPickBtn() {
    const btn = this.refs.discardPickBtn;
    const uid = this.ui.discardPickUid;
    if (!uid || !this.ui.discardMode) { btn.classList.add('hidden'); return; }
    const side = this.game.currentTurn;
    const st = this.game.cardState[side];
    const idx = st.hand.findIndex(c => c.uid === uid);
    if (idx < 0) { btn.classList.add('hidden'); return; }
    const container = side === 'white' ? this.refs.whiteHandSlots : this.refs.blackHandSlots;
    const el = container.children[idx];
    if (!el) { btn.classList.add('hidden'); return; }
    const rect = this._bodyRectOf(el);
    btn.classList.remove('hidden');
    btn.style.left = (rect.left + rect.width / 2) + 'px';
    btn.style.top = (rect.bottom + 6) + 'px';
  }

  _onDiscardCardClick(side, idx, card) {
    if (this.animating || this.game.gameOver) return;
    if (side !== this.game.currentTurn) return;
    if (!this.ui.discardMode) return;
    if (this.game.cardState[side].hand.length <= 1) return;

    if (this.ui.discardPickUid === card.uid) {
      this.ui.discardPickUid = null;
      this.ui.discardLocked = true;
      this.dispatch({ kind: 'discard', side, cardUid: card.uid });
      this._updateEndTurnPanel();
      this._renderHands();
    } else {
      this.ui.discardPickUid = card.uid;
      this._renderHands();
      this._updateDiscardPickBtn();
    }
  }

  // ==========================================================
  // КЛИК ПО КАРТЕ
  // ==========================================================

  _onCardClick(side, index, card) {
    if (side !== this.game.currentTurn) return;
    if (this.animating || this.game.gameOver) return;
    if (this.ui.discardMode) return;
    if (this.game.revealState.active) return;

    if (this.ui.activePanel || !this.refs.bonus2Confirm.classList.contains('hidden')) {
      this._hideLocationPanel();
    }
    if (this.ui.selectedCardUid === card.uid) return;

    if (this.ui.selectedCardUid || this.ui.pendingMode) this._resetSelectionLocal();
    this.ui.selectedCardUid = card.uid;
    this._renderHands();
    this._showActionPanel(card, side);
    this._updateHighlights();
  }

  _showActionPanel(card, side) {
    const game = this.game;
    const piece = game.getPiece(card.charKey);
    const r = this.refs;

    r.cardActions.classList.toggle('black-team', side === 'black');
    r.mirrorAction.classList.toggle('black-team', side === 'black');

    r.moveBtn.classList.toggle('disabled', !piece || game.getReachableCells(piece).size === 0);
    r.attackBtn.classList.toggle('disabled', !piece || game.getAttackTargets(piece).length === 0);
    r.exploreBtn.classList.toggle('disabled', !piece || !game.canExploreBase(piece));
    r.spellBtn.classList.toggle('disabled', !piece || !game.canCastSpell(piece));
    r.mirrorBtn.classList.toggle('disabled', !piece || game.getMirrorTargets(piece).length === 0);

    const container = side === 'white' ? r.whiteHandSlots : r.blackHandSlots;
    const idx = game.cardState[side].hand.findIndex(c => c.uid === card.uid);
    const el = container.children[idx];
    if (!el) return;
    const rect = this._bodyRectOf(el);

    r.cardActions.classList.add('visible');
    const pW = r.cardActions.offsetWidth || 200;
    const pH = r.cardActions.offsetHeight || 100;
    let left = rect.left + rect.width / 2 - pW / 2;
    const minL = IS_MOBILE ? -300 : 8;
    const maxL = IS_MOBILE ? (VIRTUAL_W + 300 - pW) : (VIRTUAL_W - pW - 8);
    left = Math.max(minL, Math.min(maxL, left));
    r.cardActions.style.left = left + 'px';
    r.cardActions.style.top = Math.max(8, rect.top - pH - 10) + 'px';

    r.mirrorAction.classList.add('visible');
    r.mirrorAction.style.left = (rect.left + rect.width / 2) + 'px';
    const mirrorY = rect.bottom + 8 - (IS_MOBILE ? MOBILE_MIRROR_Y_LIFT : 0);
    r.mirrorAction.style.top = mirrorY + 'px';
  }

  _hideActionPanel() {
    this.refs.cardActions.classList.remove('visible');
    this.refs.mirrorAction.classList.remove('visible');
  }

  _onActionButton(mode) {
    const game = this.game;
    const cardUid = this.ui.selectedCardUid;
    if (!cardUid) return;
    const side = game.currentTurn;
    const card = game.getCardByUid(side, cardUid);
    if (!card) return;
    const piece = game.getPiece(card.charKey);
    if (!piece) return;

    if (mode === 'move'    && game.getReachableCells(piece).size === 0) return;
    if (mode === 'attack'  && game.getAttackTargets(piece).length === 0) return;
    if (mode === 'explore' && !game.canExploreBase(piece)) return;
    if (mode === 'spell'   && !game.canCastSpell(piece)) return;
    if (mode === 'mirror'  && game.getMirrorTargets(piece).length === 0) return;

    const r = this.refs;

    if (this.ui.pendingMode === mode) {
      this.ui.pendingMode = null;
      this.ui.selectedPieceId = null;
      this.ui.plannedPath = [];
      this.ui.selectedAttackTargetId = null;
      this.ui.selectedMirrorTargetId = null;
      this.ui.selectedExploreBase = null;

      r.moveBtn.classList.remove('active');
      r.attackBtn.classList.remove('active');
      r.exploreBtn.classList.remove('active');
      r.mirrorBtn.classList.remove('active');

      this._hideMovePanel();
      this._hideAttackPanel();
      this._hideExplorePanel();
      this._hideMirrorPanel();
      this._updateHighlights();
      this._renderHands();
      return;
    }

    this._hideMovePanel();
    this._hideAttackPanel();
    this._hideExplorePanel();
    this._hideMirrorPanel();
    r.moveBtn.classList.remove('active');
    r.attackBtn.classList.remove('active');
    r.exploreBtn.classList.remove('active');
    r.mirrorBtn.classList.remove('active');

    this.ui.pendingMode = mode;
    this.ui.selectedPieceId = piece.id;
    this.ui.plannedPath = [];
    this.ui.selectedAttackTargetId = null;
    this.ui.selectedMirrorTargetId = null;
    this.ui.selectedExploreBase = null;

    if (mode === 'move')    { this._showMovePanel(piece);         r.moveBtn.classList.add('active');    }
    if (mode === 'attack')  { this._showAttackPanel(piece);       r.attackBtn.classList.add('active');  }
    if (mode === 'explore') { this._showExplorePanel(piece);      r.exploreBtn.classList.add('active'); }
    if (mode === 'mirror')  { this._showMirrorPanel(piece, card); r.mirrorBtn.classList.add('active');  }

    this._updateHighlights();
  }

  _showMovePanel(piece) {
    const r = this.refs;
    r.moveConfirm.classList.remove('hidden');
    r.moveConfirm.classList.toggle('white-turn', piece.side === 'white');
    r.moveConfirm.classList.toggle('black-turn', piece.side === 'black');
    r.mcPieceOptions.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'piece-option ' + piece.side + ' selected inactive';
    el.dataset.pieceId = piece.id;
    el.style.backgroundImage = `url('${piece.profile.sprite}')`;
    r.mcPieceOptions.appendChild(el);
    this._updateMovePanelText();
  }

  _hideMovePanel() { this.refs.moveConfirm.classList.add('hidden'); }

  _updateMovePanelText() {
    const r = this.refs;
    const has = this.ui.plannedPath.length > 0;
    r.mcSub.textContent = has ? 'Передвинуться в выбранную ячейку.' : 'Выберите ячейку для передвижения.';
    r.mcConfirm.classList.toggle('enabled', has);
    r.mcConfirm.disabled = !has;
  }

  _confirmMove() {
    const game = this.game;
    const piece = game.getPiece(this.ui.selectedPieceId);
    if (!piece || this.ui.plannedPath.length === 0) return;
    const path = [piece.cellId, ...this.ui.plannedPath];
    const action = { kind: 'playCard', side: game.currentTurn, cardUid: this.ui.selectedCardUid, mode: 'move', path };
    this._hideMovePanel();
    this._hideActionPanel();
    this._resetSelectionLocal();
    this.dispatch(action);
  }

  _showAttackPanel(piece) {
    const r = this.refs;
    r.attackConfirm.classList.remove('hidden');
    r.attackConfirm.classList.toggle('white-turn', piece.side === 'white');
    r.attackConfirm.classList.toggle('black-turn', piece.side === 'black');
    this._renderAttackPanelPieces(piece);
    this._renderAttackResult();
    this._updateAttackPanelState();
  }

  _hideAttackPanel() {
    this.refs.attackConfirm.classList.add('hidden');
    this.refs.acAttacker.innerHTML = '';
    this.refs.acTarget.innerHTML = '';
  }

  _renderAttackPanelPieces(attacker) {
    const game = this.game;
    const r = this.refs;
    r.acAttacker.innerHTML = '';
    r.acTarget.innerHTML = '';
    const aEl = document.createElement('div');
    aEl.className = 'piece-option ' + attacker.side + ' selected inactive';
    aEl.dataset.pieceId = attacker.id;
    aEl.style.backgroundImage = `url('${attacker.profile.sprite}')`;
    r.acAttacker.appendChild(aEl);

    const all = game.getAttackTargets(attacker);
    const sorted = [
      ...all.filter(t => t.side !== attacker.side),
      ...all.filter(t => t.side === attacker.side),
    ];
    sorted.forEach(t => {
      const el = document.createElement('div');
      el.className = 'piece-option ' + t.side;
      el.dataset.pieceId = t.id;
      if (this.ui.selectedAttackTargetId === t.id) el.classList.add('selected');
      el.style.backgroundImage = `url('${t.profile.sprite}')`;
      el.title = `${t.name} — HP: ${t.hp}/${t.maxHp}`;
      el.onclick = (e) => {
        e.stopPropagation();
        if (this.ui.selectedAttackTargetId === t.id) { this._confirmAttack(t); return; }
        this.ui.selectedAttackTargetId = t.id;
        this._renderAttackPanelPieces(attacker);
        this._renderAttackResult();
        this._updateAttackPanelState();
        this._updateHighlights();
      };
      r.acTarget.appendChild(el);
    });
  }

  _renderAttackResult() {
    const game = this.game;
    const r = this.refs;
    const attacker = game.getPiece(this.ui.selectedPieceId);
    const target = this.ui.selectedAttackTargetId ? game.getPiece(this.ui.selectedAttackTargetId) : null;
    if (!attacker || !target) { r.acResultSection.style.display = 'none'; return; }
    r.acResultSection.style.display = '';
    const damage = Math.max(0, attacker.strength);
    const predicted = Math.max(0, target.hp - damage);
    drawHpBar(r.acResultBefore, target.hp, target.maxHp, { tightFit: true });
    drawHpBar(r.acResultAfter, predicted, target.maxHp, { tightFit: true });
  }

  _updateAttackPanelState() {
    const r = this.refs;
    const has = !!this.ui.selectedAttackTargetId;
    r.acSub.textContent = has ? 'Атаковать выбранную цель.' : 'Выберите цель для атаки.';
    r.acConfirm.classList.toggle('enabled', has);
    r.acConfirm.disabled = !has;
  }

  _confirmAttack(target) {
    const game = this.game;
    const action = { kind: 'playCard', side: game.currentTurn, cardUid: this.ui.selectedCardUid, mode: 'attack', targetPieceId: target.id };
    this._hideAttackPanel();
    this._hideActionPanel();
    this._lockHpBlinkHot();
    this.attackOverrides.set(target.id, { hp: target.hp, maxHp: target.maxHp });
    this._resetSelectionLocal();
    this.dispatch(action);
  }

  _showExplorePanel(piece) {
    const r = this.refs;
    r.exploreConfirm.classList.remove('hidden');
    r.exploreConfirm.classList.toggle('white-turn', piece.side === 'white');
    r.exploreConfirm.classList.toggle('black-turn', piece.side === 'black');
    r.ecPieceOptions.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'piece-option ' + piece.side + ' selected inactive';
    el.dataset.pieceId = piece.id;
    el.style.backgroundImage = `url('${piece.profile.sprite}')`;
    r.ecPieceOptions.appendChild(el);
    this._updateExplorePanelState();
  }

  _hideExplorePanel() {
    this.refs.exploreConfirm.classList.add('hidden');
    this.refs.ecPieceOptions.innerHTML = '';
    this.ui.selectedExploreBase = null;
  }

  _updateExplorePanelState() {
    const r = this.refs;
    const has = this.ui.selectedExploreBase !== null;
    r.ecSub.textContent = has ? 'Исследовать базу оппонента. Персонаж вернётся на базу.' : 'Выберите базу для исследования.';
    r.ecConfirm.classList.toggle('enabled', has);
    r.ecConfirm.disabled = !has;
  }

  _confirmExplore() {
    const action = { kind: 'playCard', side: this.game.currentTurn, cardUid: this.ui.selectedCardUid, mode: 'explore' };
    this._hideExplorePanel();
    this._hideActionPanel();
    this._resetSelectionLocal();
    this.dispatch(action);
  }

  _showMirrorPanel(ownerPiece, card) {
    const game = this.game;
    const r = this.refs;
    r.mirrorConfirm.classList.remove('hidden');
    r.mirrorConfirm.classList.toggle('white-turn', ownerPiece.side === 'white');
    r.mirrorConfirm.classList.toggle('black-turn', ownerPiece.side === 'black');

    r.mirrorCardPreview.innerHTML = '';
    const cardEl = document.createElement('div');
    cardEl.className = 'discard-mini ' + (ownerPiece.side === 'white' ? 'white-card' : 'black-card');
    cardEl.style.cursor = 'default';
    const img = document.createElement('img');
    img.src = card.imgPath;
    img.onerror = () => img.remove();
    cardEl.appendChild(img);
    cardEl.title = `${card.charName} — ${card.name}`;
    this._attachHoverToElement(cardEl, card);
    r.mirrorCardPreview.appendChild(cardEl);

    r.mirrorTargetOptions.innerHTML = '';
    const targets = game.getMirrorTargets(ownerPiece);
    targets.forEach(t => {
      const el = document.createElement('div');
      el.className = 'piece-option ' + t.side;
      el.dataset.pieceId = t.id;
      if (this.ui.selectedMirrorTargetId === t.id) el.classList.add('selected');
      el.style.backgroundImage = `url('${t.profile.sprite}')`;
      el.title = t.name;
      el.onclick = (e) => {
        e.stopPropagation();
        if (this.ui.selectedMirrorTargetId === t.id) { this._confirmMirror(t); return; }
        this.ui.selectedMirrorTargetId = t.id;
        this._showMirrorPanel(ownerPiece, card);
        this._updateMirrorPanelState();
        this._updateHighlights();
      };
      r.mirrorTargetOptions.appendChild(el);
    });
    this._updateMirrorPanelState();
  }

  _hideMirrorPanel() {
    this.refs.mirrorConfirm.classList.add('hidden');
    this.refs.mirrorCardPreview.innerHTML = '';
    this.refs.mirrorTargetOptions.innerHTML = '';
  }

  _updateMirrorPanelState() {
    const r = this.refs;
    const has = !!this.ui.selectedMirrorTargetId;
    r.mirrorSub.textContent = has ? 'Эта карта отправится в зерцало этому персонажу.' : 'Выберите персонажа, который возьмет эту карту в зерцало.';
    r.mirrorConfirmBtn.classList.toggle('enabled', has);
    r.mirrorConfirmBtn.disabled = !has;
  }

  _confirmMirror(target) {
    const action = { kind: 'playCard', side: this.game.currentTurn, cardUid: this.ui.selectedCardUid, mode: 'mirror', targetPieceId: target.id };
    this._hideMirrorPanel();
    this._hideActionPanel();
    this._resetSelectionLocal();
    this.dispatch(action);
  }

  _confirmSpell() {
    const action = { kind: 'playCard', side: this.game.currentTurn, cardUid: this.ui.selectedCardUid, mode: 'spell' };
    this._hideActionPanel();
    this._resetSelectionLocal();
    this.dispatch(action);
  }

  _resetSelectionLocal() {
    this._stopHpBlink();
    this.ui.selectedCardUid = null;
    this.ui.selectedPieceId = null;
    this.ui.pendingMode = null;
    this.ui.plannedPath = [];
    this.ui.selectedAttackTargetId = null;
    this.ui.selectedMirrorTargetId = null;
    this.ui.selectedExploreBase = null;
    this._hideActionPanel();
    this._hideMovePanel();
    this._hideAttackPanel();
    this._hideExplorePanel();
    this._hideMirrorPanel();

    const r = this.refs;
    if (r && r.moveBtn)    r.moveBtn.classList.remove('active');
    if (r && r.attackBtn)  r.attackBtn.classList.remove('active');
    if (r && r.exploreBtn) r.exploreBtn.classList.remove('active');
    if (r && r.mirrorBtn)  r.mirrorBtn.classList.remove('active');

    for (const [, entry] of this.pieceMeshes.entries()) {
      const coin = entry.mesh.children[0];
      if (coin && coin.material) coin.material.emissiveIntensity = 0.15;
      const sel = entry.mesh.children[4];
      if (sel) sel.visible = false;
    }

    this._updateHighlights();
    this._renderHands();
  }

  // ==========================================================
  // ОВЕРЛЕИ
  // ==========================================================

  _showDeckOverlay(side) {
    const st = this.game.cardState[side];
    const content = this.refs.deckOverlayContent;
    content.innerHTML = '';
    content.classList.remove('white-team', 'black-team');
    content.classList.add(side === 'white' ? 'white-team' : 'black-team');
    const header = document.createElement('div');
    header.className = 'deck-overlay-header';
    header.textContent = `Колода ${side === 'white' ? 'белых' : 'чёрных'} — карт: ${st.deck.length}`;
    content.appendChild(header);
    const row = document.createElement('div');
    row.className = 'deck-overlay-cards';
    if (st.deck.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'deck-overlay-empty';
      empty.textContent = '— колода пуста —';
      row.appendChild(empty);
    } else {
      st.deck.forEach(card => {
        const el = document.createElement('div');
        el.className = 'deck-overlay-card ' + (side === 'white' ? 'white-card' : 'black-card');
        const img = document.createElement('img');
        img.src = card.faceUp ? card.imgPath : 'cards/back.png';
        el.appendChild(img);
        el.title = card.faceUp ? `${card.charName} — ${card.name}` : 'Рубашкой вверх';
        if (card.faceUp) this._attachHoverToElement(el, card);
        row.appendChild(el);
      });
    }
    content.appendChild(row);
    this.refs.deckOverlay.classList.add('visible');
  }

  _showDiscardOverlay(side) {
    const st = this.game.cardState[side];
    const content = this.refs.deckOverlayContent;
    content.innerHTML = '';
    content.classList.remove('white-team', 'black-team');
    content.classList.add(side === 'white' ? 'white-team' : 'black-team');
    const header = document.createElement('div');
    header.className = 'deck-overlay-header';
    header.textContent = `Сброс ${side === 'white' ? 'белых' : 'чёрных'} — карт: ${st.discard.length}`;
    content.appendChild(header);
    const row = document.createElement('div');
    row.className = 'deck-overlay-cards';
    if (st.discard.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'deck-overlay-empty';
      empty.textContent = '— сброс пуст —';
      row.appendChild(empty);
    } else {
      st.discard.forEach(card => {
        const el = document.createElement('div');
        el.className = 'deck-overlay-card ' + (side === 'white' ? 'white-card' : 'black-card');
        const img = document.createElement('img');
        img.src = card.imgPath;
        el.appendChild(img);
        el.title = `${card.charName} — ${card.name}`;
        this._attachHoverToElement(el, card);
        row.appendChild(el);
      });
    }
    content.appendChild(row);
    this.refs.deckOverlay.classList.add('visible');
  }

  _hideDeckOverlay() {
    this.refs.deckOverlay.classList.remove('visible');
    this.refs.deckOverlayContent.innerHTML = '';
  }

  _attachHoverToElement(el, card) {
    el.__card = card;
    el.addEventListener('mouseenter', () => { this.hoveredCard = { card, element: el }; this._updateCardOverlay(); });
    el.addEventListener('mouseleave', () => { if (this.hoveredCard && this.hoveredCard.element === el) { this.hoveredCard = null; this._updateCardOverlay(); } });
  }

  _updateCardOverlay() {
    if (!this.ctrlPressed) {
      if (this.refs.cardOverlay.classList.contains('visible')) this._hideCardOverlay();
      return;
    }
    const target = this.hoveredCard ? this.hoveredCard.card : (this.hoveredBadgeCard || this.hoveredTabletCard || null);
    if (!target) {
      if (this.refs.cardOverlay.classList.contains('visible')) this._hideCardOverlay();
      return;
    }
    if (this.overlayShownCardUid === target.uid) return;
    this._showCardOverlay(target);
  }

  _showCardOverlay(card) {
    const content = this.refs.cardOverlayContent;
    content.innerHTML = '';
    const cardSide = this._cardSideOf(card);
    content.classList.remove('white-team', 'black-team');
    content.classList.add(cardSide === 'white' ? 'white-team' : 'black-team');
    content.classList.toggle('extras-off', !this.extrasVisible);

    const placeholder = document.createElement('div');
    placeholder.className = 'overlay-card-placeholder';
    placeholder.innerHTML = `<div class="slot-icon">◇</div><div>Слот для дополнений</div>`;
    content.appendChild(placeholder);

    const img = document.createElement('img');
    img.className = 'overlay-card-image';
    img.src = card.imgPath;
    content.appendChild(img);

    this.refs.cardOverlay.classList.add('visible');
    this.overlayShownCardUid = card.uid;
  }

  _hideCardOverlay() {
    this.refs.cardOverlay.classList.remove('visible');
    this.refs.cardOverlayContent.innerHTML = '';
    this.overlayShownCardUid = null;
  }

  // ==========================================================
  // ПЛАНШЕТ
  // ==========================================================

  _getHeartsLayout(pieceId) { return HEARTS_LAYOUTS[pieceId] || HEARTS_LAYOUT_DEFAULT; }

  _buildHeartsOverlay(piece, wrapper) {
    const layout = this._getHeartsLayout(piece.id);
    const heartsOverlay = document.createElement('div');
    heartsOverlay.className = 'hearts-overlay';

    void wrapper.offsetWidth;
    const W = wrapper.clientWidth || wrapper.offsetWidth || 0;
    const H = wrapper.clientHeight || wrapper.offsetHeight || 0;

    const slotW = Math.round(W * layout.slotWidthPercent / 100);
    const gapW  = Math.round(W * layout.gapPercent      / 100);
    const left0 = Math.round(W * layout.leftPercent     / 100);
    const topPx = Math.round(H * layout.topPercent      / 100);

    for (let i = 0; i < layout.count; i++) {
      const slot = document.createElement('div');
      slot.className = 'heart-slot';
      slot.style.left = '0';
      slot.style.top = '0';
      slot.style.width = slotW + 'px';
      slot.style.height = slotW + 'px';
      slot.style.aspectRatio = 'auto';
      slot.style.transform = `translate(${left0 + i * (slotW + gapW)}px, ${topPx}px)`;

      let iconSrc = null, fallbackColor = null;
      if (i < piece.hp) { iconSrc = HEART_ICONS.filled; fallbackColor = '#ff69b4'; }
      else if (i < piece.maxHp) { iconSrc = HEART_ICONS.dark; fallbackColor = '#333333'; }
      else if (i === piece.maxHp) { iconSrc = HEART_ICONS.max; fallbackColor = '#000000'; }
      if (iconSrc) {
        const img = document.createElement('img');
        img.src = iconSrc; img.alt = '';
        img.onerror = () => {
          img.remove();
          const fb = document.createElement('div');
          fb.className = 'heart-fallback';
          fb.style.background = fallbackColor;
          slot.appendChild(fb);
        };
        slot.appendChild(img);
      }
      heartsOverlay.appendChild(slot);
    }
    return heartsOverlay;
  }

  _getStatPositions(pieceId) {
    const override = STAT_POSITIONS_BY_CHAR[pieceId] || {};
    return {
      strength: override.strength || STAT_POSITIONS_DEFAULT.strength,
      speed:    override.speed    || STAT_POSITIONS_DEFAULT.speed,
    };
  }

  _buildStatsOverlay(piece) {
    const overlay = document.createElement('div');
    overlay.className = 'stats-overlay';
    const positions = this._getStatPositions(piece.id);
    const startStrength = PROFILES[piece.id].strength;
    const startSpeed = PROFILES[piece.id].speed;
    const makeBadge = (current, startValue, posCfg) => {
      if (current === startValue) return;
      const span = document.createElement('span');
      span.className = 'stat-badge changed';
      const smallX = document.createElement('span');
      smallX.className = 'x'; smallX.textContent = 'x';
      span.appendChild(smallX);
      span.appendChild(document.createTextNode(String(current)));
      span.style.left = posCfg.xPercent + '%';
      span.style.top = posCfg.yPercent + '%';
      span.style.setProperty('--rot', (posCfg.rotateDeg || 0) + 'deg');
      overlay.appendChild(span);
    };
    makeBadge(piece.strength, startStrength, positions.strength);
    makeBadge(piece.speed, startSpeed, positions.speed);
    return overlay.childElementCount > 0 ? overlay : null;
  }

  _showTabletOverlay(piece) {
    this._hideCardOverlay();
    const content = this.refs.tabletOverlayContent;
    content.innerHTML = '';
    content.classList.remove('white-team', 'black-team');
    content.classList.add(piece.side === 'white' ? 'white-team' : 'black-team');
    content.classList.toggle('extras-off', !this.extrasVisible);
    this.refs.tabletOverlay.dataset.pieceId = piece.id;

    const sidePanel = document.createElement('div');
    sidePanel.className = 'tablet-side-panel';
    sidePanel.innerHTML = `<div class="slot-icon">◇</div><div>Слот для дополнений</div>`;
    content.appendChild(sidePanel);

    const wrapper = document.createElement('div');
    wrapper.className = 'tablet-wrapper';
    wrapper.style.opacity = '0';

    const front = document.createElement('img');
    front.className = 'tablet-image';
    front.alt = piece.name + ' — планшет';
    front.onerror = () => {
      const fb = document.createElement('div');
      fb.className = 'tablet-fallback';
      fb.innerHTML = `<div class="icon">${piece.side === 'white' ? 'W' : 'B'}</div>
                      <div class="name">${piece.name}</div>
                      <div class="stats">HP: ${piece.maxHp} · Скорость: ${piece.speed} · Сила: ${piece.strength}</div>
                      <div class="label">Лицевая сторона</div>`;
      wrapper.replaceWith(fb);
    };
    wrapper.appendChild(front);

    let tabletReady = false;
    const onTabletReady = () => {
      if (tabletReady) return;
      tabletReady = true;
      wrapper.appendChild(this._buildHeartsOverlay(piece, wrapper));
      const statsOverlay = this._buildStatsOverlay(piece);
      if (statsOverlay) wrapper.appendChild(statsOverlay);
      void wrapper.offsetWidth;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          wrapper.style.opacity = '1';
        });
      });
    };

    front.addEventListener('load', onTabletReady, { once: true });
    if (front.complete && front.naturalWidth > 0) onTabletReady();
    front.src = `tablets/${piece.id}_front.png`;

    if (piece.mirror) {
      const mini = document.createElement('div');
      mini.className = 'tablet-mirror-card';
      mini.title = `${piece.mirror.charName} — ${piece.mirror.name}`;
      const mimg = document.createElement('img');
      mimg.src = piece.mirror.imgPath; mimg.alt = '';
      mini.appendChild(mimg);
      mini.addEventListener('mouseenter', () => { this.hoveredTabletCard = piece.mirror; this._updateCardOverlay(); });
      mini.addEventListener('mouseleave', () => { if (this.hoveredTabletCard === piece.mirror) { this.hoveredTabletCard = null; this._updateCardOverlay(); } });
      wrapper.appendChild(mini);
    }
    content.appendChild(wrapper);
    this.refs.tabletOverlay.classList.add('visible');
  }

  _showCaptainTabletOverlay(side) {
    this._hideCardOverlay();
    const game = this.game;
    const profileKey = game.getCaptainProfileKey(side);
    const profile = PROFILES[profileKey];
    const content = this.refs.tabletOverlayContent;
    content.innerHTML = '';
    content.classList.remove('white-team', 'black-team');
    content.classList.add(side === 'white' ? 'white-team' : 'black-team');
    content.classList.toggle('extras-off', !this.extrasVisible);
    this.refs.tabletOverlay.dataset.pieceId = 'cap_' + side;

    const sidePanel = document.createElement('div');
    sidePanel.className = 'tablet-side-panel';
    const ability = CAPTAIN_ABILITY_TEXT[profileKey];
    sidePanel.innerHTML = ability
      ? `<div class="slot-icon">✦</div><div class="ability-text">${ability}</div>`
      : `<div class="slot-icon">◇</div><div>Слот для дополнений</div>`;
    content.appendChild(sidePanel);

    const wrapper = document.createElement('div');
    wrapper.className = 'tablet-wrapper';
    const back = document.createElement('img');
    back.className = 'tablet-image';
    back.src = `tablets/${profileKey}_back.png`;
    back.onerror = () => {
      const fb = document.createElement('div');
      fb.className = 'tablet-fallback';
      fb.innerHTML = `<div class="icon">${side === 'white' ? 'W' : 'B'}</div>
                      <div class="name">${profile.name}</div>
                      <div class="stats">Капитан команды</div>
                      <div class="label">Обратная сторона</div>`;
      wrapper.replaceWith(fb);
    };
    wrapper.appendChild(back);
    content.appendChild(wrapper);
    this.refs.tabletOverlay.classList.add('visible');
  }

  _hideTabletOverlay() {
    this.refs.tabletOverlay.classList.remove('visible');
    this.refs.tabletOverlayContent.innerHTML = '';
    this.refs.tabletOverlayContent.classList.remove('white-team', 'black-team');
    delete this.refs.tabletOverlay.dataset.pieceId;
    this.hoveredTabletCard = null;
  }

  _toggleExtras() {
    this.extrasVisible = !this.extrasVisible;
    if (this.refs.cardOverlay.classList.contains('visible')) {
      const card = this.hoveredTabletCard || this.hoveredBadgeCard || (this.hoveredCard && this.hoveredCard.card);
      if (card) this._showCardOverlay(card);
    }
    if (this.refs.tabletOverlay.classList.contains('visible')) {
      if (this.hoveredCaptainSide) this._showCaptainTabletOverlay(this.hoveredCaptainSide);
      else if (this.hoveredPieceId) {
        const p = this.game.getPiece(this.hoveredPieceId);
        if (p) this._showTabletOverlay(p);
      }
    }
  }

  _checkHoverAt(clientX, clientY) {
    if (!this.ctrlPressed) {
      this.hoveredPieceId = null;
      this.hoveredCaptainSide = null;
      this.hoveredBadgeCard = null;
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      this.hoveredPieceId = null;
      this.hoveredCaptainSide = null;
      this.hoveredBadgeCard = null;
      return;
    }
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const badgeMeshes = [];
    for (const [, m] of this.mirrorMeshes.entries()) badgeMeshes.push(m.badge);
    if (badgeMeshes.length > 0) {
      const hits = this.raycaster.intersectObjects(badgeMeshes, false);
      if (hits.length > 0 && hits[0].object.userData.badgeCard) {
        this.hoveredBadgeCard = hits[0].object.userData.badgeCard;
        this.hoveredPieceId = null;
        this.hoveredCaptainSide = null;
        return;
      }
    }
    this.hoveredBadgeCard = null;

    const capMeshes = [];
    for (const side of ['white', 'black']) {
      const c = this.captainMeshes[side];
      if (c && c.mesh.visible) capMeshes.push(c.mesh.children[0], c.mesh.children[3]);
    }
    if (capMeshes.length > 0) {
      const hits = this.raycaster.intersectObjects(capMeshes, false);
      if (hits.length > 0 && hits[0].object.userData.captainSide) {
        this.hoveredCaptainSide = hits[0].object.userData.captainSide;
        this.hoveredPieceId = null;
        return;
      }
    }
    this.hoveredCaptainSide = null;

    const pieceMeshes = [];
    for (const [, m] of this.pieceMeshes.entries()) {
      for (let i = 0; i < 4; i++) if (m.mesh.children[i]) pieceMeshes.push(m.mesh.children[i]);
    }
    const hits = this.raycaster.intersectObjects(pieceMeshes, false);
    this.hoveredPieceId = hits.length > 0 ? hits[0].object.userData.pieceId : null;
  }

  _updateTabletOverlay() {
    if (!this.ctrlPressed) {
      if (this.refs.tabletOverlay.classList.contains('visible')) this._hideTabletOverlay();
      return;
    }
    if (this.hoveredCaptainSide) {
      const key = 'cap_' + this.hoveredCaptainSide;
      if (this.refs.tabletOverlay.dataset.pieceId !== key) {
        this._showCaptainTabletOverlay(this.hoveredCaptainSide);
      }
      return;
    }
    if (this.hoveredPieceId) {
      if (this.refs.tabletOverlay.dataset.pieceId !== this.hoveredPieceId) {
        const p = this.game.getPiece(this.hoveredPieceId);
        if (p) this._showTabletOverlay(p);
      }
    } else {
      if (this.refs.tabletOverlay.classList.contains('visible')) this._hideTabletOverlay();
    }
  }

  // ==========================================================
  // ВВОД
  // ==========================================================

  _wireInput() {
    const r = this.refs;

    r.moveBtn.onclick = (e) => {
      e.stopPropagation();
      if (r.moveBtn.classList.contains('disabled')) return;
      this._onActionButton('move');
    };
    r.attackBtn.onclick = (e) => {
      e.stopPropagation();
      if (r.attackBtn.classList.contains('disabled')) return;
      this._onActionButton('attack');
    };
    r.exploreBtn.onclick = (e) => {
      e.stopPropagation();
      if (r.exploreBtn.classList.contains('disabled')) return;
      this._onActionButton('explore');
    };
    r.spellBtn.onclick = (e) => {
      e.stopPropagation();
      if (r.spellBtn.classList.contains('disabled')) return;
      if (this.animating || this.game.gameOver) return;
      if (!this.ui.selectedCardUid) return;
      this._confirmSpell();
    };
    r.mirrorBtn.onclick = (e) => {
      e.stopPropagation();
      if (r.mirrorBtn.classList.contains('disabled')) return;
      this._onActionButton('mirror');
    };

    r.mcConfirm.onclick = (e) => { e.stopPropagation(); if (!r.mcConfirm.disabled) this._confirmMove(); };
    r.acConfirm.onclick = (e) => { e.stopPropagation(); if (!r.acConfirm.disabled) this._confirmAttack(this.game.getPiece(this.ui.selectedAttackTargetId)); };
    r.ecConfirm.onclick = (e) => { e.stopPropagation(); if (!r.ecConfirm.disabled) this._confirmExplore(); };
    r.mirrorConfirmBtn.onclick = (e) => { e.stopPropagation(); if (!r.mirrorConfirmBtn.disabled) this._confirmMirror(this.game.getPiece(this.ui.selectedMirrorTargetId)); };

    r.etcConfirmBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.animating || this.game.gameOver) return;
      this._closeEndTurnPanel();
      this.dispatch({ kind: 'endTurn', side: this.game.currentTurn });
      this.ui.discardLocked = false;
    };

    r.endTurnBtn.onclick = async (e) => {
      e.stopPropagation();
      if (this.animating || this.game.gameOver) return;

      // ★ Защита от даблклика: пока идёт последовательный возврат карт
      //   вскрытия, повторный клик игнорируется. Иначе второй клик
      //   запустил бы параллельный цикл и отправил лишние action'ы.
      if (this.game.revealState.active && !this._abortingReveal) {
        this._abortingReveal = true;
        try {
          const side = this.game.revealState.side;
          const uids = this.game.revealState.cards.slice().reverse().map(c => c.uid);
          for (let i = 0; i < uids.length; i++) {
            this.dispatch({ kind: 'locationBonus2Resolve', side, cardUid: uids[i], action: 'return' });
            if (i < uids.length - 1) await new Promise(res => setTimeout(res, 120));
          }
        } finally {
          this._abortingReveal = false;
        }
      }

      if (this.ui.endTurnPanelOpen) { this._cancelEndTurnConfirm(); return; }
      if (this.ui.activePanel || !r.bonus2Confirm.classList.contains('hidden')) {
        this._hideLocationPanel();
      }
      this._resetSelectionLocal();
      this._openEndTurnPanel();
    };

    r.discardTrigger.onclick = (e) => {
      e.stopPropagation();
      if (this.animating || this.game.gameOver) return;
      if (this.ui.discardLocked) return;
      this.ui.discardMode = !this.ui.discardMode;
      this.ui.discardPickUid = null;
      if (this.ui.discardMode) this._resetSelectionLocal();
      this._updateEndTurnPanel();
      this._renderHands();
      this._renderLocationBonusButtons();
    };

    r.discardPickBtn.onclick = (e) => {
      e.stopPropagation();
      const uid = this.ui.discardPickUid;
      if (!uid) return;
      const side = this.game.currentTurn;
      const st = this.game.cardState[side];
      const idx = st.hand.findIndex(c => c.uid === uid);
      if (idx < 0) return;
      const card = st.hand[idx];
      this.ui.discardPickUid = null;
      this.ui.discardLocked = true;
      this.dispatch({ kind: 'discard', side, cardUid: card.uid });
      this._updateEndTurnPanel();
      this._renderHands();
      this._renderLocationBonusButtons();
    };

    if (r.b2cConfirmBtn) {
      r.b2cConfirmBtn.onclick = (e) => {
        e.stopPropagation();
        this._activateLocation2();
      };
    }

    r.locationBonusIcon.onclick = (e) => {
      e.stopPropagation();
      if (this.game.revealState && this.game.revealState.active) {
        this.dispatch({ kind: 'abortReveal', side: this.game.revealState.side });
      }
      if (this.ui.activePanel || !r.bonus2Confirm.classList.contains('hidden')) {
        this._hideLocationPanel();
      }
    };

    r.endTurnConfirm.addEventListener('click', (e) => e.stopPropagation());
    r.attackConfirm.addEventListener('click', (e) => e.stopPropagation());
    r.moveConfirm.addEventListener('click', (e) => e.stopPropagation());
    r.mirrorConfirm.addEventListener('click', (e) => e.stopPropagation());
    r.exploreConfirm.addEventListener('click', (e) => e.stopPropagation());

    r.deckOverlay.addEventListener('click', (e) => {
      if (e.target === r.deckOverlay) this._hideDeckOverlay();
    });

    this.renderer.domElement.addEventListener('click', (e) => this._onCanvasClick(e));

    document.addEventListener('click', (e) => {
      if (this.ui.discardPickUid && this.ui.discardMode) {
        const cardEl = e.target.closest && e.target.closest('.hand-card');
        if (!cardEl || cardEl.dataset.uid !== this.ui.discardPickUid) {
          this.ui.discardPickUid = null;
          this._renderHands();
          this._updateDiscardPickBtn();
        }
      }

      if (this.ui.endTurnPanelOpen) {
        if (!r.endTurnConfirm.contains(e.target) && e.target !== r.endTurnBtn) {
          this._cancelEndTurnConfirm();
        }
      }
      if (this.ui.activePanel || !r.bonus2Confirm.classList.contains('hidden')) {
        if (r.locationBonusPanel.contains(e.target)) return;
        if (r.bonus2Confirm.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.location-bonus-btn')) return;
        if (e.target === this.renderer.domElement) return;
        this._hideLocationPanel();
      }
    });

    document.addEventListener('touchstart', () => this._tryEnterFullscreen(), { once: true });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.refs.deckOverlay.classList.contains('visible')) { this._hideDeckOverlay(); return; }
        if (this.ui.activePanel || !this.refs.bonus2Confirm.classList.contains('hidden')) {
          this._hideLocationPanel();
          return;
        }
        this._resetSelectionLocal();
        this._cancelEndTurnConfirm();
        return;
      }
      if ((e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') && !e.repeat) {
        this._toggleExtras();
        return;
      }
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        this.debugShowAllBonuses = !this.debugShowAllBonuses;
        this._renderLocationBonusButtons();
        return;
      }
      if (e.key === 'Control' && !this.ctrlPressed) {
        this.ctrlPressed = true;
        document.body.classList.add('ctrl-mode');
        this._checkHoverAt(this.lastMouseX, this.lastMouseY);
        const el = document.elementFromPoint(this.lastMouseX, this.lastMouseY);
        const pieceEl = el && el.closest && el.closest('.piece-option[data-piece-id]');
        if (pieceEl) {
          const p = this.game.getPiece(pieceEl.dataset.pieceId);
          if (p) {
            this.hoveredPieceId = p.id;
            this.hoveredCaptainSide = null;
            this.hoveredBadgeCard = null;
          }
        }
        this._updateTabletOverlay();
        this._updateCardOverlay();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Control' && this.ctrlPressed) {
        this.ctrlPressed = false;
        document.body.classList.remove('ctrl-mode');
        this._hideTabletOverlay();
        this._hideCardOverlay();
        this.hoveredPieceId = null;
        this.hoveredCaptainSide = null;
      }
    });
    window.addEventListener('blur', () => {
      this.ctrlPressed = false;
      document.body.classList.remove('ctrl-mode');
      this._hideTabletOverlay();
      this._hideCardOverlay();
      this.hoveredPieceId = null;
      this.hoveredCaptainSide = null;
    });

    document.addEventListener('mousemove', (e) => {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    let mouseMoveScheduled = false;
    let pendingMouseX = 0, pendingMouseY = 0;
    this.renderer.domElement.addEventListener('mousemove', (e) => {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      if (!this.ctrlPressed) return;
      pendingMouseX = e.clientX;
      pendingMouseY = e.clientY;
      if (mouseMoveScheduled) return;
      mouseMoveScheduled = true;
      requestAnimationFrame(() => {
        mouseMoveScheduled = false;
        this._checkHoverAt(pendingMouseX, pendingMouseY);
        this._updateTabletOverlay();
        this._updateCardOverlay();
      });
    });
    this.renderer.domElement.addEventListener('mouseleave', () => {
      this.hoveredPieceId = null;
      this.hoveredCaptainSide = null;
      this.hoveredBadgeCard = null;
      this._updateTabletOverlay();
      this._updateCardOverlay();
    });

    document.addEventListener('dragstart', (e) => {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
    });

    document.addEventListener('mouseover', (e) => {
      if (!this.ctrlPressed) return;
      const el = e.target.closest && e.target.closest('.piece-option[data-piece-id]');
      if (!el) return;
      const p = this.game.getPiece(el.dataset.pieceId);
      if (!p) return;
      this.hoveredPieceId = p.id;
      this.hoveredCaptainSide = null;
      this.hoveredBadgeCard = null;
      this._updateTabletOverlay();
      this._updateCardOverlay();
    });
    document.addEventListener('mouseout', (e) => {
      const el = e.target.closest && e.target.closest('.piece-option[data-piece-id]');
      if (!el) return;
      if (this.hoveredPieceId === el.dataset.pieceId) {
        this.hoveredPieceId = null;
        this._updateTabletOverlay();
        this._updateCardOverlay();
      }
    });

    document.addEventListener('touchstart', (e) => {
      // ★ Второй палец — это уже pinch-жест, а не long-press.
      //   Гасим таймер, и если ctrl-режим уже был включён (первым
      //   пальцем успел сработать long-press) — выходим из него.
      //   Иначе во время pinch-зума висят подсветки под пальцем.
      if (e.touches.length !== 1) {
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
        if (this.longPressActive) this._longPressExit();
        return;
      }
      if (this.longPressActive) return;
      if (this._isUiControl(e.target)) return;
      const t = e.touches[0];
      this.longPressStartX = t.clientX;
      this.longPressStartY = t.clientY;
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        this._longPressEnter(this.lastTouchX, this.lastTouchY);
      }, 450);
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (!t) return;
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
      if (this.longPressActive) {
        this._longPressUpdate(t.clientX, t.clientY);
        e.preventDefault();
      }
    }, { passive: false });

    document.addEventListener('touchend', () => {
      if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
      if (this.longPressActive) { this.suppressNextClick = true; this._longPressExit(); }
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
      if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
      this._longPressExit();
    });

    document.addEventListener('click', (e) => {
      if (this.suppressNextClick) { this.suppressNextClick = false; e.stopPropagation(); e.preventDefault(); }
    }, true);

    ['gesturestart', 'gesturechange', 'gestureend'].forEach(n =>
      document.addEventListener(n, (e) => e.preventDefault(), { passive: false })
    );
    document.addEventListener('contextmenu', (e) => {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
    });
	
    // ★ Pinch-to-zoom + колесо мыши.
    this._wirePinchZoom();
  }
  
  
  // ★ Pinch-to-zoom двумя пальцами + панорамирование тем же жестом.
  //   Плюс — колесо мыши на десктопе. Работает только на канвасе, не
  //   мешает кликам по DOM-панелям и картам. Ничего в game не мутирует.
  _wirePinchZoom() {
    const el = this.renderer.domElement;
    const active = new Map();   // identifier → {x, y}

    const getDist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const getMid  = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const beginPinch = () => {
      if (active.size < 2) { this._pinch = null; return; }
      const [a, b] = [...active.values()];
      const mid = getMid(a, b);
      this._pinch = {
        dist: getDist(a, b),
        zoom: this._zoom,
        targetX: this._camTarget.x,
        targetZ: this._camTarget.z,
        midX: mid.x,
        midY: mid.y,
      };
    };

    el.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        active.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (active.size >= 2) {
        // ★ Второй палец — это уже жест, а не long-press. Гасим таймер
        //   и выходим из ctrl-режима (если он успел включиться первым
        //   пальцем): во время pinch-зума подсветки не показываем.
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
        if (this.longPressActive) this._longPressExit();
        // ★ Гасим браузерный pinch-zoom страницы и подавляем следующий
        //   click — иначе после жеста по полю прилетит «фантомный» тап.
        this._suppressClickUntil = performance.now() + 400;
        e.preventDefault();
        beginPinch();
      }
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (active.has(t.identifier)) {
          active.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      }
      if (active.size < 2) return;
      e.preventDefault();
      if (!this._pinch) { beginPinch(); return; }

      const [a, b] = [...active.values()];
      const newDist = getDist(a, b);
      const newMid  = getMid(a, b);
      if (this._pinch.dist <= 1) return;

      // ★ Масштаб
      const factor = newDist / this._pinch.dist;
      let newZoom = this._pinch.zoom * factor;
      newZoom = Math.max(this._zoomMin, Math.min(this._zoomMax, newZoom));
      this._zoom = newZoom;

      // ★ Пан: смещение мидпоинта в пикселях → сдвиг цели камеры в
      //   мировых единицах. Конверсия — грубая, но стабильная:
      //   при zoom = 1 доска занимает около 90 % вьюпорта по ширине
      //   и около 45 % по высоте.
      const vw = this._vw || window.innerWidth;
      const vh = this._vh || window.innerHeight;
      const z = Math.max(0.0001, this._zoom);
      const pxToWorldX = (BOARD_WIDTH  * 1.1) / (vw * z);
      const pxToWorldZ = (BOARD_HEIGHT * 2.2) / (vh * z);
      const dx = newMid.x - this._pinch.midX;
      const dy = newMid.y - this._pinch.midY;

      this._camTarget.x = this._pinch.targetX - dx * pxToWorldX;
      this._camTarget.z = this._pinch.targetZ - dy * pxToWorldZ;

      this._clampCamTarget();
      this._applyCameraTransform();
    }, { passive: false });

    const endTouch = (e) => {
      for (const t of e.changedTouches) active.delete(t.identifier);
      if (active.size < 2) this._pinch = null;
      else beginPinch();
    };
    el.addEventListener('touchend', endTouch);
    el.addEventListener('touchcancel', endTouch);

    // ★ Колесо мыши — бонус для десктопа, не мешает мобильной логике.
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
	        // ★ Если в момент прокрутки зажат Ctrl (активен ctrl-режим и
      //   висит планшет под курсором) — прячем оверлеи на время
      //   зума. Прокрутка = «навигация по полю», не «осмотр жетона».
      if (this.ctrlPressed) {
        this._hideTabletOverlay();
        this._hideCardOverlay();
        this.hoveredPieceId = null;
        this.hoveredCaptainSide = null;
        this.hoveredBadgeCard = null;
      }
      const factor = Math.exp(-e.deltaY * 0.0015);
      let newZoom = this._zoom * factor;
      newZoom = Math.max(this._zoomMin, Math.min(this._zoomMax, newZoom));
      if (newZoom === this._zoom) return;
      this._zoom = newZoom;
      if (this._zoom <= 1.0001) {
        // Полный откат — вернуть камеру в центр поля.
        this._camTarget.x = 0;
        this._camTarget.z = 0;
      }
      this._clampCamTarget();
      this._applyCameraTransform();
    }, { passive: false });
  }

  _tryEnterFullscreen() {
    if (this.fsRequested) return;
    this.fsRequested = true;
    const el = document.documentElement;
    const fn = el.requestFullscreen
      || el.webkitRequestFullscreen
      || el.mozRequestFullScreen
      || el.msRequestFullscreen;
    if (fn) { try { fn.call(el); } catch (e) {} }
    if (screen.orientation && screen.orientation.lock) {
      try {
        const p = screen.orientation.lock('landscape');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {}
    }
  }

  _isUiControl(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      'button, a, input, select, textarea, ' +
      '#end-turn, #turn-panel, #discard-trigger, #location-bonus-icon, ' +
      '.panel-confirm, .action-btn, .discard-pick-btn, ' +
      '.lbp-reveal-btn, .lpd-back-btn, .location-bonus-btn, ' +
      '#victory-restart, .deck-visual, #discard-left, #discard-right'
    );
  }

  _longPressUpdate(x, y) {
    const el = document.elementFromPoint(x, y);
    const pieceEl = el && el.closest && el.closest('.piece-option[data-piece-id]');
    if (pieceEl) {
      const p = this.game.getPiece(pieceEl.dataset.pieceId);
      if (p) {
        this.hoveredPieceId = p.id;
        this.hoveredCaptainSide = null;
        this.hoveredBadgeCard = null;
        this.hoveredCard = null;
        this._updateTabletOverlay();
        this._updateCardOverlay();
        return;
      }
    }
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.__card) {
        this.hoveredCard = { card: cur.__card, element: cur };
        this.hoveredPieceId = null;
        this.hoveredCaptainSide = null;
        this.hoveredBadgeCard = null;
        this._updateTabletOverlay();
        this._updateCardOverlay();
        return;
      }
      cur = cur.parentElement;
    }
    this.hoveredCard = null;
    if (!this.refs.deckOverlay.classList.contains('visible')) {
      this._checkHoverAt(x, y);
    }
    this._updateTabletOverlay();
    this._updateCardOverlay();
  }

  _longPressEnter(x, y) {
    this.longPressActive = true;
    this.ctrlPressed = true;
    document.body.classList.add('ctrl-mode');
    void document.body.offsetHeight;
    this._longPressUpdate(x, y);
  }

  _longPressExit() {
    if (!this.longPressActive) return;
    this.longPressActive = false;
    this.ctrlPressed = false;
    document.body.classList.remove('ctrl-mode');
    this._hideTabletOverlay();
    this._hideCardOverlay();
    this.hoveredPieceId = null;
    this.hoveredCaptainSide = null;
  }

  _onCanvasClick(e) {
    const game = this.game;
    if (!game || game.gameOver || this.animating) return;
	    // ★ Не реагируем на click, прилетевший сразу после pinch-жеста:
    //   некоторые браузеры шлют «фантомный» клик по центру жеста.
    if (performance.now() < this._suppressClickUntil) return;
    if (this.ui.discardMode || this.ui.discardLocked) return;
    if (game.revealState.active) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.ui.activePanel && this.ui.activePanel.kind === 'loc5') {
      const hits = this.raycaster.intersectObjects(this.clickTargets, false);
      if (hits.length > 0 && this._onLoc5CellPick(hits[0].object.userData.cellId)) return;
      this._hideLocationPanel();
      return;
    }

    if (this.ui.activePanel) {
      this._hideLocationPanel();
      return;
    }

    // При открытой панели завершения хода клик по полю только закрывает
    // её — никаких действий (зерцало, жетон, клетка) не выполняется.
    if (this.ui.endTurnPanelOpen) {
      this._cancelEndTurnConfirm();
      return;
    }

    const badgeMeshes = [];
    for (const [, m] of this.mirrorMeshes.entries()) badgeMeshes.push(m.badge);
    if (badgeMeshes.length > 0) {
      const hits = this.raycaster.intersectObjects(badgeMeshes, false);
      if (hits.length > 0 && hits[0].object.userData.badgeCard) {
        if (this.ui.selectedCardUid) {
          this._resetSelectionLocal();
          return;
        }
        const pieceId = hits[0].object.userData.pieceId;
        const piece = game.getPiece(pieceId);
        if (piece && piece.side === game.currentTurn && piece.mirror) {
          this.dispatch({ kind: 'useMirror', side: piece.side, pieceId });
        }
        return;
      }
    }

    const pieceMeshes = [];
    for (const [, m] of this.pieceMeshes.entries()) {
      for (let i = 0; i < 4; i++) if (m.mesh.children[i]) pieceMeshes.push(m.mesh.children[i]);
    }
    const pHits = this.raycaster.intersectObjects(pieceMeshes, false);
    if (pHits.length > 0 && pHits[0].object.userData.pieceId) {
      this._onPieceClick(pHits[0].object.userData.pieceId);
      return;
    }

    // ★ Расширенная зона клика по базе в режиме исследования.
    //   Проверяется ПОСЛЕ жетонов — клик по своему же жетону сначала
    //   должен обрабатываться как клик по жетону (например, чтобы
    //   отменить выбор), а не как подтверждение исследования. Но
    //   ДО обычных клеток — именно чтобы «промах» рядом с базой
    //   засчитался как попадание в базу.
    if (this.exploreHitMesh && this.exploreHitMesh.visible) {
      const eHits = this.raycaster.intersectObject(this.exploreHitMesh, false);
      if (eHits.length > 0 && this.exploreHitMesh.userData.cellId != null) {
        this._onCellClick(this.exploreHitMesh.userData.cellId);
        return;
      }
    }

    const cHits = this.raycaster.intersectObjects(this.clickTargets, false);
    if (cHits.length > 0) {
      this._onCellClick(cHits[0].object.userData.cellId);
      return;
    }

    if (this.ui.pendingMode || this.ui.selectedCardUid) this._resetSelectionLocal();
  }

  _onPieceClick(pieceId) {
    const game = this.game;
    const mode = this.ui.pendingMode;

    if (!mode) {
      if (this.ui.selectedCardUid || this.ui.selectedPieceId) this._resetSelectionLocal();
      return;
    }

    if (mode === 'attack') {
      const attacker = game.getPiece(this.ui.selectedPieceId);
      const targets = game.getAttackTargets(attacker);
      const t = game.getPiece(pieceId);
      if (!targets.includes(t)) { this._resetSelectionLocal(); return; }
      if (this.ui.selectedAttackTargetId === pieceId) this._confirmAttack(t);
      else {
        this.ui.selectedAttackTargetId = pieceId;
        this._renderAttackPanelPieces(attacker);
        this._renderAttackResult();
        this._updateAttackPanelState();
        this._updateHighlights();
      }
      return;
    }

    if (mode === 'mirror') {
      const owner = game.getPiece(this.ui.selectedPieceId);
      const targets = game.getMirrorTargets(owner);
      const t = game.getPiece(pieceId);
      if (!targets.includes(t)) { this._resetSelectionLocal(); return; }
      if (this.ui.selectedMirrorTargetId === pieceId) this._confirmMirror(t);
      else {
        this.ui.selectedMirrorTargetId = pieceId;
        const card = game.getCardByUid(game.currentTurn, this.ui.selectedCardUid);
        if (card) this._showMirrorPanel(owner, card);
        this._updateHighlights();
      }
      return;
    }

    if (mode === 'explore') {
      const sp = game.getPiece(this.ui.selectedPieceId);
      if (!sp) { this._resetSelectionLocal(); return; }
      const enemyBaseId = sp.side === 'white' ? BASE_BLACK_ID : BASE_WHITE_ID;
      const clicked = game.getPiece(pieceId);
      if (clicked.cellId === enemyBaseId) {
        if (this.ui.selectedExploreBase === enemyBaseId) { this._confirmExplore(); return; }
        this.ui.selectedExploreBase = enemyBaseId;
        this._updateExplorePanelState();
        this._updateHighlights();
      } else {
        this._resetSelectionLocal();
      }
      return;
    }

    this._resetSelectionLocal();
  }

  _onCellClick(cellId) {
    const game = this.game;
    const mode = this.ui.pendingMode;

    if (!mode) {
      if (this.ui.selectedCardUid || this.ui.selectedPieceId) this._resetSelectionLocal();
      return;
    }

    if (mode === 'move') {
      const piece = game.getPiece(this.ui.selectedPieceId);
      if (!piece) { this._resetSelectionLocal(); return; }
      const reachable = game.getReachableCells(piece);
      const idx = this.ui.plannedPath.indexOf(cellId);

      if (idx >= 0) {
        if (idx === this.ui.plannedPath.length - 1) { this._confirmMove(); return; }
        this.ui.plannedPath = this.ui.plannedPath.slice(0, idx + 1);
        this._updateMovePanelText();
        this._updateHighlights();
        return;
      }
      if (this.ui.plannedPath.length > 0) {
        const last = this.ui.plannedPath[this.ui.plannedPath.length - 1];
        const neighbors = game.getNeighborsByCell(last, piece.side);
        if (neighbors.includes(cellId) && reachable.has(cellId)
            && this.ui.plannedPath.length + 1 <= piece.speed) {
          this.ui.plannedPath.push(cellId);
          this._updateMovePanelText();
          this._updateHighlights();
          return;
        }
      }
      if (!reachable.has(cellId)) { this._resetSelectionLocal(); return; }
      const path = game.findPath(piece, cellId);
      if (!path) { this._resetSelectionLocal(); return; }
      this.ui.plannedPath = path.slice(1);
      this._updateMovePanelText();
      this._updateHighlights();
      return;
    }

    if (mode === 'explore') {
      const sp = game.getPiece(this.ui.selectedPieceId);
      if (!sp) { this._resetSelectionLocal(); return; }
      const enemyBaseId = sp.side === 'white' ? BASE_BLACK_ID : BASE_WHITE_ID;
      if (cellId === enemyBaseId) {
        if (this.ui.selectedExploreBase === enemyBaseId) { this._confirmExplore(); return; }
        this.ui.selectedExploreBase = enemyBaseId;
        this._updateExplorePanelState();
        this._updateHighlights();
      } else {
        this._resetSelectionLocal();
      }
      return;
    }

    this._resetSelectionLocal();
  }

  // ==========================================================
  // АНИМАЦИИ / СОБЫТИЯ
  // ==========================================================

  playEvent(ev) {
    switch (ev.kind) {
      case 'pieceMoved':           this._animateMove(ev); break;
      case 'attackResolved':       this._animateAttack(ev); break;

      case 'pieceDied':
        if (this.animating && this.animating.kind === 'attack'
            && this.animating.targetId === ev.pieceId) {
          this._pendingDeathAfterAttack = ev.pieceId;
        } else {
          this._startReviveSink(ev.pieceId, {
            launchDeathOrb: true,
            actor: this.game.currentTurn,
            turn: this.game.halfTurn,
          });
        }
        break;

      case 'deathOrbFromPiece':
        if (this.animating && this.animating.kind === 'attack'
            && this.animating.targetId === ev.pieceId) {
          this._pendingDeathOrbFromAttack = ev;
        } else if (this.queuedRevives.some(r => r.pieceId === ev.pieceId && r.launchDeathOrb)
                || (this.animating && this.animating.kind === 'revive'
                    && this.animating.pieceId === ev.pieceId && this.animating.launchDeathOrb)) {
          // пузырёк уже запустится внутри revive-таска
        } else {
          this._animateDeathOrb(ev);
        }
        break;

      case 'mightChanged':         break;
      case 'powerOrbsFromCenter':  this._animateOrbsFromCenter(ev); break;
      case 'exploreResolved':
        this._startReviveSink(ev.pieceId, {
          waitDuration: 0.45,
          launchExploreOrbs: true,
          actor: this.game.currentTurn,
          turn: this.game.halfTurn,
        });
        break;
      case 'turnChanged':          this._onTurnChanged(ev); break;
      case 'deckReshuffled':       this._animateDeckReshuffle(ev.side); break;
      case 'locationBonus5Applied':this._animateTeleport(ev); break;
      case 'gameWon':              this._showVictory(ev.winner); break;
      case 'captainBuffApplied':   this._updateHpDisplay(ev.pieceId); break;
      case 'revealFinished':       this._hideLocationPanel(); break;
      case 'locationBonus2Started':
        this._renderLocation2Panel();
        this._animateBonus2Reveal(ev.side, ev.cards);
        break;
      case 'locationBonus2Resolved':
        this._animateBonus2Resolve(ev);
        break;
      case 'locationBonus1Applied':this._hideLocationPanel(); break;
      case 'locationBonus4Applied': this._animateBonus4(ev); break;
      case 'revealAborted':
        // В штатном UI abort больше не вызывается (end-turn теперь
        // разрешает карты по одной). На случай внешнего abort'а
        // (например, из мультиплеера) просто перерисовываем колоду.
        this._renderDeckVisuals();
        break;
      case 'mirrorAttached':       break;
      case 'mirrorUsed':           break;
      case 'mirrorDropped':        break;
      case 'cardPlayed':           break;
      case 'cardDiscarded':        break;
      case 'spellResolved':        break;
      case 'undoPerformed':        break;
    }
  }

  _animateMove(ev) {
    const path = ev.path;
    if (!path || path.length < 2) return;
    const entry = this.pieceMeshes.get(ev.pieceId);
    if (!entry) return;
    const waypoints = path.map(cid => { const p = getPoint(cid); return { x: p.x, z: p.z }; });
    const duration = 0.22 * (waypoints.length - 1) * 1000;
    const t0 = performance.now();
    this.animating = { kind: 'move', pieceId: ev.pieceId };
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / duration);
      const total = waypoints.length - 1;
      const pos = t * total;
      const segIdx = Math.min(Math.floor(pos), total - 1);
      const segFrac = pos - segIdx;
      const p0 = waypoints[segIdx], p1 = waypoints[segIdx + 1];
      entry.mesh.position.x = p0.x + (p1.x - p0.x) * segFrac;
      entry.mesh.position.z = p0.z + (p1.z - p0.z) * segFrac;
      this._syncHpSpritePosition(ev.pieceId);
      if (t < 1) requestAnimationFrame(tick);
      else {
        this.animating = null;
        this._updateHpDisplay(ev.pieceId);
        this._updateConditionalArrows();
        this.renderAll();
      }
    };
    requestAnimationFrame(tick);
  }

  _animateAttack(ev) {
    const attacker = this.pieceMeshes.get(ev.attackerId);
    const target = this.pieceMeshes.get(ev.targetId);
    if (!attacker || !target) return;

    this.attackOverrides.set(ev.targetId, { hp: ev.hpBefore, maxHp: ev.maxHpBefore });
    this._stopHpBlink();
    this._updateHpDisplay(ev.targetId);

    const startPos = attacker.mesh.position.clone();
    const targetPos = target.mesh.position.clone();
    const dx = targetPos.x - startPos.x, dz = targetPos.z - startPos.z;
    const len = Math.hypot(dx, dz) || 1;
    const approach = Math.max(0.1, len - 0.7);
    const peak = new THREE.Vector3(
      startPos.x + dx / len * approach, 0,
      startPos.z + dz / len * approach
    );
    const t0 = performance.now();
    const outDur = 220, backDur = 250;
    this.animating = {
      kind: 'attack',
      pieceId: ev.attackerId,
      attackerId: ev.attackerId,
      targetId: ev.targetId,
    };
    let impacted = false;

    const tick = () => {
      const elapsed = performance.now() - t0;

      if (elapsed < outDur) {
        const f = elapsed / outDur;
        attacker.mesh.position.set(
          startPos.x + (peak.x - startPos.x) * f,
          Math.sin(f * Math.PI) * 0.35,
          startPos.z + (peak.z - startPos.z) * f
        );
        this._syncHpSpritePosition(ev.attackerId);
        requestAnimationFrame(tick);
        return;
      }

      if (!impacted) {
        impacted = true;
        this.attackOverrides.delete(ev.targetId);
        this._updateHpDisplay(ev.targetId);

        if (this._pendingDeathAfterAttack === ev.targetId) {
          this._pendingDeathAfterAttack = null;
          this._startReviveSink(ev.targetId, {
            launchDeathOrb: true,
            actor: this.game.currentTurn,
            turn: this.game.halfTurn,
          });
          this._pendingDeathOrbFromAttack = null;
        } else if (this._pendingDeathOrbFromAttack) {
          this._animateDeathOrb(this._pendingDeathOrbFromAttack);
          this._pendingDeathOrbFromAttack = null;
        }
      }

      if (elapsed < outDur + backDur) {
        const f = (elapsed - outDur) / backDur;
        attacker.mesh.position.set(
          peak.x + (startPos.x - peak.x) * f,
          Math.sin(f * Math.PI) * 0.2,
          peak.z + (startPos.z - peak.z) * f
        );
        this._syncHpSpritePosition(ev.attackerId);
        requestAnimationFrame(tick);
        return;
      }

      attacker.mesh.position.set(startPos.x, 0, startPos.z);
      this.animating = null;
      this._updateConditionalArrows();
      this.renderAll();
    };
    requestAnimationFrame(tick);
  }

  _animateOrbsFromCenter(ev) {
    const enemySide = ev.side === 'white' ? 'black' : 'white';
    const enemyEntry = this.captainMeshes[enemySide];
    if (!enemyEntry) return;
    const target = enemyEntry.mesh.position.clone();
    target.y = 0.5;
    const center = getPoint(4);
    const colorCss = ev.side === 'white' ? '#ef1f1f' : '#ffc300';
    // ★ actor/turn приходят прямо из события — они зафиксированы в
    //   game.js в момент _applyLocation3Damage, то есть ДО _doFinish-
    //   EndTurn, который инкрементит halfTurn. Раньше здесь читался
    //   this.game.halfTurn уже после инкремента, и пузырьки центра
    //   попадали в колонку следующего раунда. Fallback — на случай
    //   событий из старого снапшота, где этих полей ещё нет.
    const actor = ev.actor != null ? ev.actor : ev.side;
    const turn = ev.turn != null ? ev.turn : this.game.halfTurn;

        for (let i = 0; i < ev.count; i++) {
      // ★ Из 1–2 пузырьков жертву убьёт только тот, что по счёту
      //   совпадает с остатком могущества (см. комментарий в
      //   _launchExploreOrbs).
      const remaining = this.game.might[enemySide] - this._pendingMightLoss[enemySide];
      const isKiller = remaining === 1;
      this._pendingMightLoss[enemySide]++;

      // ★ Убийственный пузырёк — с белым/чёрным кольцом по цвету
      //   команды, чьё могущество он обнуляет.
      // ★ Обнулил могущество БЕЛОЙ команды — чёрное кольцо,
      //   ЧЁРНОЙ — белое.
      const ringCss = getKillerRingColor(enemySide, isKiller, colorCss);

      const sprite = createOrbSprite(ringCss, EXPLORE_ICON_IMG, {
        innerGlow: '#ff2ec4',
        shape: isKiller ? 'square' : 'circle',
      });
      const angle = (i / Math.max(1, ev.count)) * Math.PI * 2;
      sprite.position.set(center.x + Math.cos(angle) * 0.35, 0.55, center.z + Math.sin(angle) * 0.35);
      this.floatGroup.add(sprite);
      this.powerOrbs.push({
        sprite, target, start: sprite.position.clone(),
        elapsed: 0, delay: i * 0.14, duration: 1.1,
        affectedSide: enemySide,
        kind: 'location3',
        actor,
        turn,
        isKiller,
      });
    }
  }

  _launchExploreOrbs(fromPos, side, enemySide, actor, turn) {
    const enemyEntry = this.captainMeshes[enemySide];
    if (!enemyEntry) return;
    const target = enemyEntry.mesh.position.clone(); target.y = 0.5;
    const start = new THREE.Vector3(fromPos.x, 0.55, fromPos.z);
    const colorCss = enemySide === 'white' ? '#ef1f1f' : '#ffc300';
    // ★ actor/turn приходят из revive-таска, где были зафиксированы
    //   в момент старта анимации. Fallback — если не заданы.
        const actorFixed = actor != null ? actor : side;
    const turnFixed  = turn  != null ? turn  : this.game.halfTurn;
    for (let i = 0; i < 3; i++) {
      // ★ Из трёх пузырьков жертву убьёт только тот, что по счёту
      //   совпадает с остатком могущества. Например, при might = 3
      //   убийственный — третий (i=2). При might = 1 — первый (i=0).
      const remaining = this.game.might[enemySide] - this._pendingMightLoss[enemySide];
      const isKiller = remaining === 1;
      this._pendingMightLoss[enemySide]++;

      // ★ Убийственный пузырёк — с белым/чёрным кольцом по цвету
      //   команды, чьё могущество он обнуляет.
      // ★ Обнулил могущество БЕЛОЙ команды — чёрное кольцо,
      //   ЧЁРНОЙ — белое.
      const ringCss = getKillerRingColor(enemySide, isKiller, colorCss);

      const sprite = createOrbSprite(ringCss, MID_ICON_IMG, {
        innerGlow: '#3a8fff',
        shape: isKiller ? 'square' : 'circle',
      });
      const angle = (i / 3) * Math.PI * 2;
      sprite.position.set(start.x + Math.cos(angle) * 0.35, start.y, start.z + Math.sin(angle) * 0.35);
      this.floatGroup.add(sprite);
      this.powerOrbs.push({
        sprite, target, start: sprite.position.clone(),
        elapsed: 0, delay: i * 0.14, duration: 1.1,
        affectedSide: enemySide,
        kind: 'explore',
        actor: actorFixed,
        turn: turnFixed,
        isKiller,
      });
    }
  }

  _animateDeathOrb(ev) {
    const pieceEntry = this.pieceMeshes.get(ev.pieceId);
    if (!pieceEntry) return;
    // ★ actor — тот, чей сейчас ход (тот, кто «выбил» могущество).
    //   turn — номер ПОЛУхода (halfTurn), а не раунда.
    this._launchDeathOrb(
      pieceEntry.mesh.position.clone(),
      ev.side,
      this.game.currentTurn,
      this.game.halfTurn
    );
  }

  _launchDeathOrb(fromPos, side, actor, turn) {
    const tokenEntry = this.captainMeshes[side];
    if (!tokenEntry) return;
    const target = tokenEntry.mesh.position.clone(); target.y = 0.5;
    const start = new THREE.Vector3(fromPos.x, 0.55, fromPos.z);
        // ★ Убийственный пузырёк отличаем ЦВЕТОМ кольца, а не размером:
    //   у него кольцо белое (если урон получила белая команда) или
    //   чёрное (если чёрная). Цвет остальных пузырьков — как раньше.
    const remaining = this.game.might[side] - this._pendingMightLoss[side];
    const isKiller = remaining === 1;
    this._pendingMightLoss[side]++;

    const baseRingCss = side === 'white' ? '#ffc300' : '#ef1f1f';
    const ringCss = getKillerRingColor(side, isKiller, baseRingCss);

    const sprite = createOrbSprite(ringCss, DEATH_ICON_IMG, {
      innerGlow: '#ff8800',
      shape: isKiller ? 'square' : 'circle',
    });
    sprite.position.copy(start);
    this.floatGroup.add(sprite);
    this.powerOrbs.push({
      sprite, target, start, elapsed: 0, delay: 0, duration: 1.1,
      affectedSide: side,
      kind: 'death',
      actor: actor != null ? actor : this.game.currentTurn,
      turn:  turn  != null ? turn  : this.game.halfTurn,
      isKiller,
    });
  }

  _updatePowerOrbs(dt) {
    for (let i = this.powerOrbs.length - 1; i >= 0; i--) {
      const o = this.powerOrbs[i];
      if (o.delay > 0) { o.delay -= dt; continue; }
      o.elapsed += dt;
      const frac = Math.min(o.elapsed / o.duration, 1);
      const eased = frac < 0.5 ? 2*frac*frac : 1 - Math.pow(-2*frac+2, 2)/2;
      const x = o.start.x + (o.target.x - o.start.x) * eased;
      const z = o.start.z + (o.target.z - o.start.z) * eased;
      const y = o.start.y + (o.target.y - o.start.y) * eased + Math.sin(frac * Math.PI) * 0.55;
      o.sprite.position.set(x, y, z);
      // ★ Размер у всех пузырьков одинаковый — убийственный отличается
      //   только цветом кольца (см. _launch*Orbs / _drawGraphBubble).
      const s = 0.75 + Math.sin(frac * Math.PI * 6) * 0.08;
      o.sprite.scale.set(s, s, 1);

      if (frac >= 1) {
        if (o.sprite.parent) o.sprite.parent.remove(o.sprite);
        if (o.sprite.material.map) o.sprite.material.map.dispose();
        o.sprite.material.dispose();
        this.powerOrbs.splice(i, 1);

        // ★ Пузырёк прилетел — уменьшаем счётчик «в полёте» для его
        //   жертвы. Делаем это ДО `if (this.net) continue`, иначе
        //   в мультиплеере счётчик не сбрасывался бы.
        if (o.affectedSide && this._pendingMightLoss[o.affectedSide] > 0) {
          this._pendingMightLoss[o.affectedSide]--;
        }

        if (this.net) continue;
        // o.kind — 'location3' | 'explore' | 'death';
        // o.actor и o.turn зафиксированы в момент выпуска пузырька.
        const res = this.game.applyMightChange(
          o.affectedSide, -1, o.kind, o.actor, o.turn
        );
        if (res && res.events) {
          for (const ev of res.events) {
            try { this.playEvent(ev); } catch (err) { console.error('playEvent error:', ev && ev.kind, err); }
          }
        }
        if (this.game.gameOver) {
          this.powerOrbs.length = 0;
          this.renderAll();
          return;
        }
        this._renderCaptains();
        this._renderTurnPanel();
      }
    }
  }

  _animateTeleport(ev) {
    const entry = this.pieceMeshes.get(ev.pieceId);
    if (!entry) return;
    const start = entry.mesh.position.clone();
    const end = getPoint(ev.toCell);
    const t0 = performance.now();
    const dur = 550;
    this.animating = { kind: 'teleport', pieceId: ev.pieceId };

    if (entry.hpSprite && entry.hpSprite.parent !== entry.mesh) {
      if (entry.hpSprite.parent) entry.hpSprite.parent.remove(entry.hpSprite);
      entry.mesh.add(entry.hpSprite);
      entry.hpSprite.position.set(0, COIN_HEIGHT + 0.10, -0.08);
    }

    const resetRings = () => {
      entry.mesh.rotation.set(0, 0, 0);
      const sel = entry.mesh.children[4];
      if (sel) { sel.visible = false; sel.rotation.z = 0; sel.scale.set(1,1,1); }
      if (entry.bonus5Ring) { entry.bonus5Ring.visible = false; entry.bonus5Ring.rotation.z = 0; entry.bonus5Ring.scale.set(1,1,1); }
    };

    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const eased = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
      entry.mesh.position.x = start.x + (end.x - start.x) * eased;
      entry.mesh.position.z = start.z + (end.z - start.z) * eased;
      entry.mesh.position.y = Math.sin(t * Math.PI) * 1.3;
      resetRings();
      if (t < 1) requestAnimationFrame(tick);
      else {
        entry.mesh.position.y = 0;
        resetRings();
        if (entry.hpSprite && entry.hpSprite.parent === entry.mesh) {
          entry.mesh.remove(entry.hpSprite);
          this.hpSpriteGroup.add(entry.hpSprite);
        }
        this.animating = null;
        this._updateConditionalArrows();
        this.renderAll();
      }
    };
    requestAnimationFrame(tick);
  }

  _onTurnChanged(ev) {
    this._stopHpBlink();
    this.attackOverrides.clear();
    this._pendingDeathAfterAttack = null;
    this._pendingDeathOrbFromAttack = null;
    this.ui.discardMode = false;
    this.ui.discardLocked = false;
    this.ui.discardPickUid = null;
    this.ui.endTurnPanelOpen = false;
    // ★ Сбрасываем override топа колоды — на новом ходу промежуточные
    //   картинки из abort бонуса 2 больше не актуальны.
    this._pendingDeckReturns = { white: 0, black: 0 };
    this._abortingReveal = false;
    this._resetSelectionLocal();
    this._updateConditionalArrows();
    this._renderLocationBonusButtons();
  }

  // ==========================================================
  // ПОБЕДА + РАСКОЛ ЖЕТОНА КАПИТАНА
  // ==========================================================

  _showVictory(winner) {
    this.queuedRevives.length = 0;
    this.revivingIds.clear();
    this.attackOverrides.clear();
    this._pendingDeckReturns = { white: 0, black: 0 };
    if (this.animating && this.animating.kind === 'attack') {
      this.animating = null;
    }

    this.ui.endTurnPanelOpen = false;
    this.ui.discardMode = false;
    this.ui.discardLocked = false;
    this.ui.discardPickUid = null;
    this.ui.activePanel = null;
    this.ui.pendingMode = null;
    this.ui.plannedPath = [];
    this.ui.selectedAttackTargetId = null;
    this.ui.selectedMirrorTargetId = null;
    this.ui.selectedExploreBase = null;
    this._hideActionPanel();
    this._hideMovePanel();
    this._hideAttackPanel();
    this._hideExplorePanel();
    this._hideMirrorPanel();
    this._hideCardOverlay();
    this._hideTabletOverlay();
    this._stopHpBlink();
    this.refs.locationBonusPanel.classList.add('hidden');
    this.refs.bonus2Confirm.classList.add('hidden');
    this.refs.endTurnConfirm.classList.add('hidden');
    this.refs.discardDim.classList.remove('visible');
    this._clearRevealCards();

    // ★ До того как стереть пузырьки, которые ещё в полёте, применяем
    //   их эффекты в game. Иначе последние 1–2 пузырька не попадут
    //   в history — и в «Хронике могущества» не будет отражено, что
    //   могущество упало.
    if (!this.net) {
      for (const o of this.powerOrbs) {
        try {
          this.game.applyMightChange(o.affectedSide, -1, o.kind, o.actor, o.turn);
        } catch (e) {
          console.error('applyMightChange on victory failed:', e);
        }
      }
    }
    for (const o of this.powerOrbs) {
      if (o.sprite.parent) o.sprite.parent.remove(o.sprite);
      if (o.sprite.material.map) o.sprite.material.map.dispose();
      o.sprite.material.dispose();
    }
    this.powerOrbs.length = 0;
    if (this.refs.endTurnBtn) this.refs.endTurnBtn.disabled = true;

    const overlay = this.refs.victoryOverlay;
    const panel = overlay.querySelector('.victory-panel');
    const title = overlay.querySelector('.victory-title');
    panel.classList.remove('white-team', 'black-team');
    panel.classList.add(winner === 'white' ? 'white-team' : 'black-team');
    title.textContent = winner === 'white' ? '🏆 Победа белых!' : '🏆 Победа чёрных!';

    document.getElementById('victory-restart').onclick = () => {
      if (window.restartWithShuffle) window.restartWithShuffle();
      else location.reload();
    };

    const loser = winner === 'white' ? 'black' : 'white';
    const entry = this.captainMeshes[loser];
    if (entry) {
      const slot1 = getCaptainSlotPosition(loser, 1);
      const pos1 = pxTo3D(slot1.x, slot1.y);
      entry.mesh.visible = true;
      this.captainVictoryMoves.set(loser, {
        start: entry.mesh.position.clone(),
        target: pos1,
        t0: performance.now(),
        dur: 600,
        onDone: () => {
          entry.mesh.position.set(pos1.x, 0, pos1.z);
          this._startCaptainBreakAnimation(loser);
          this.captainVictoryMoves.delete(loser);
        },
      });
    }

    // ★ Рисуем график до показа оверлея — чтобы он уже был готов.
    this._drawVictoryGraph();

    setTimeout(() => {
      overlay.classList.remove('hidden');
    }, 850);
  }

  // ★ «Хроника могущества» в панели победы.
  //   Горизонтальная ось, на ней — колонки по ходам.
  //   Над осью — пузырьки, которые ходящий «выбил» из оппонента.
  //   Под осью — пузырьки, которые ходящий потерял сам
  //   (например, убил свою же фигуру).
  //   В одной стопке не больше 3 пузырьков; при переполнении —
  //   следующий столбик сбоку, на той же высоте.
  //   Пузырёк рисуется как в игре: тёмный фон, цветное кольцо
  //   (цвет команды, потерявшей могущество), иконка причины внутри.
  _drawVictoryGraph() {
    const canvas = document.getElementById('victory-graph');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const history = this.game.history || [];

    // ★ Колонка графика = один РАУНД (ход белых + ход чёрных), а не
    //   полуход. Внутри колонки сверху — пузырьки за действия белых,
    //   снизу — за действия чёрных, и на колонку одна подпись «Ход N».
    //   Раньше белые и чёрные одного раунда получали две отдельные
    //   колонки с одинаковой подписью, что выглядело как дублирование.
    //
    //   Группируем по ACTOR (кто «заработал» пузырёк), а не по жертве:
    //   friendly fire (свой убил своего) должен остаться в колонке
    //   актора, а не жертвы.
    const byRound = new Map();
    history.forEach(h => {
      const round = Math.ceil((h.turn || 1) / 2);
      if (!byRound.has(round)) byRound.set(round, { white: [], black: [] });
      const bucket = byRound.get(round);
      const actor = h.actor || h.side;
      if (actor === 'white') bucket.white.push(h);
      else bucket.black.push(h);
    });

    const totalRounds = byRound.size > 0
      ? Math.max(...byRound.keys())
      : 1;

    const padL = 30, padR = 30;
    const axisY = H / 2;
    const plotW = W - padL - padR;
    const colW = plotW / totalRounds;
    // 0.22 вместо 0.30 — колонка теперь вдвое «шире» (в ней живут две
    // команды), и пузырьки того же размера уже не слипаются.
    const bubbleR = Math.max(10, Math.min(18, colW * 0.22));
    const bubbleGap = 6;
    const stackSize = 3;
    const groupOffsetX = bubbleR * 2 + 8;

    // Фон
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, W, H);

    // Разделители колонок
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= totalRounds; r++) {
      const x = padL + r * colW;
      ctx.beginPath();
      ctx.moveTo(x, 16);
      ctx.lineTo(x, H - 16);
      ctx.stroke();
    }

    // Горизонтальная ось
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padL, axisY);
    ctx.lineTo(W - padR, axisY);
    ctx.stroke();

    // Подписи по краям
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(200,200,220,0.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('▲ действия белых', padL + 6, 22);
    ctx.fillText('▼ действия чёрных', padL + 6, H - 20);

    // Колонки — по одной на раунд
    for (let r = 1; r <= totalRounds; r++) {
      const cx = padL + (r - 0.5) * colW;

      // ★ Одна подпись на раунд, цвет — нейтральный светло-серый.
      //   Раньше подпись красилась в цвет одной из команд, но теперь
      //   в колонке могут быть пузырьки обеих, и красить её в цвет
      //   одной из них некорректно. Обводка чёрным — чтобы читалась
      //   поверх линии оси.
      const label = 'Ход ' + r;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.95)';
      ctx.strokeText(label, cx, axisY);
      ctx.fillStyle = 'rgba(220,220,235,0.92)';
      ctx.fillText(label, cx, axisY);

      const bucket = byRound.get(r) || { white: [], black: [] };
      // direction = -1 — вверх от оси, +1 — вниз.
      this._drawBubbleStack(ctx, cx, axisY, bubbleR, bubbleGap, stackSize, groupOffsetX, bucket.white, -1);
      this._drawBubbleStack(ctx, cx, axisY, bubbleR, bubbleGap, stackSize, groupOffsetX, bucket.black, +1);
    }

    // ★ Легенда причин внизу — по центру.
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const legendItems = [
      { icon: DEATH_ICON_IMG,   label: 'смерть' },
      { icon: MID_ICON_IMG,     label: 'центр' },
      { icon: EXPLORE_ICON_IMG, label: 'база' },
    ];
    const itemWidths = legendItems.map(it =>
      26 + ctx.measureText(it.label).width + 16
    );
    const totalLegendW = itemWidths.reduce((a, b) => a + b, 0) - 16;
    let legendX = (W - totalLegendW) / 2;
    const legendY = H - 10;
    legendItems.forEach((it, i) => {
      if (it.icon) ctx.drawImage(it.icon, legendX, legendY - 7, 14, 14);
      ctx.fillStyle = 'rgba(220,220,235,0.85)';
      ctx.fillText(it.label, legendX + 20, legendY);
      legendX += itemWidths[i];
    });
  }
  
    // ★ Рисует «стопку» пузырьков одной команды над (direction=-1) или
  //   под (direction=+1) осью. Группы по stackSize пузырьков центри-
  //   руются относительно центра колонки — раньше каждая следующая
  //   группа съезжала вправо на фиксированный offset, и пара групп
  //   выглядела криво.
  _drawBubbleStack(ctx, cx, axisY, bubbleR, bubbleGap, stackSize, groupOffsetX, events, direction) {
    if (!events || events.length === 0) return;
    const numGroups = Math.ceil(events.length / stackSize);
    const totalWidth = (numGroups - 1) * groupOffsetX;
    const startX = cx - totalWidth / 2;

    events.forEach((h, i) => {
      const group = Math.floor(i / stackSize);
      const inGroup = i % stackSize;
      const x = startX + group * groupOffsetX;
      const y = axisY + direction * (34 + bubbleR + inGroup * (bubbleR * 2 + bubbleGap));
      this._drawGraphBubble(ctx, x, y, bubbleR, h);
    });
  }

  _drawGraphBubble(ctx, cx, cy, r, h) {
    // ★ Цвет свечения — «кому выгодно»: противник жертвы.
    //   h.side === 'white' → белые потеряли → выгода чёрным (жёлтый).
    //   h.side === 'black' → чёрные потеряли → выгода белым (красный).
    const winColor = h.side === 'black' ? '#ef1f1f' : '#ffc300';

    // ★ Цвет кольца — общий помощник. Для убийственного пузырька
    //   он даёт цвет из KILLER_RING_COLOR, для остальных — winColor.
    const ringColor = getKillerRingColor(h.side, h.isKiller, winColor);
    const iconFor = (kind) => {
      if (kind === 'death')     return DEATH_ICON_IMG;
      if (kind === 'location3') return MID_ICON_IMG;
      if (kind === 'explore')   return EXPLORE_ICON_IMG;
      return null;
    };
    const glowFor = (kind) => {
      if (kind === 'death')     return '#ff8800';
      if (kind === 'location3') return '#3a8fff';
      if (kind === 'explore')   return '#ff2ec4';
      return null;
    };
    const icon = iconFor(h.reason);
    const glowColor = glowFor(h.reason);

    // ★ Убийственный пузырёк рисуем квадратом со скруглёнными углами —
    //   той же формы, что и в полёте (см. createOrbSprite). Так игрок
    //   и в игре, и на графике видит один и тот же визуальный маркер.
    const shapePath = (rad) => {
      ctx.beginPath();
      if (h.isKiller) {
        const rr = rad * 0.30;
        roundRectPath(ctx, cx - rad, cy - rad, rad * 2, rad * 2, rr);
      } else {
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      }
    };

    // Мягкое свечение вокруг пузырька — цветом победителя.
    const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.9);
    glow.addColorStop(0, colorToRgba(winColor, 0.55));
    glow.addColorStop(1, colorToRgba(winColor, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
    ctx.fill();

    // Тёмный фон пузырька — по форме.
    shapePath(r);
    ctx.fillStyle = 'rgba(10,10,20,0.95)';
    ctx.fill();

    // ★ Внутреннее свечение — цвет по причине, как в игровых пузырьках.
    if (glowColor) {
      const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.95);
      innerGrad.addColorStop(0.00, colorToRgba(glowColor, 0.80));
      innerGrad.addColorStop(0.55, colorToRgba(glowColor, 0.30));
      innerGrad.addColorStop(1.00, colorToRgba(glowColor, 0));
      ctx.save();
      shapePath(r * 0.95);
      ctx.clip();
      ctx.fillStyle = innerGrad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    }

    // Иконка причины поверх свечения.
    if (icon) {
      const iconSize = r * 1.35;
      ctx.save();
      shapePath(r * 0.95);
      ctx.clip();
      ctx.drawImage(icon, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
      ctx.restore();
    }

    // Кольцо по форме.
    shapePath(r);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  _createHalfCircleTexture(sourceCanvas, side) {
    const srcW = sourceCanvas.width, srcH = sourceCanvas.height;
    const c = document.createElement('canvas');
    c.width = srcW; c.height = srcH;
    const ctx = c.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0, srcW, srcH);
    if (side === 'left') ctx.clearRect(srcW / 2, 0, srcW / 2, srcH);
    else ctx.clearRect(0, 0, srcW / 2, srcH);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  _startCaptainBreakAnimation(side) {
    const entry = this.captainMeshes[side];
    if (!entry) return;
    const group = entry.mesh;
    const topMesh = group.children[3];
    if (!topMesh || !topMesh.material || !topMesh.material.map || !topMesh.material.map.image) {
      group.visible = false;
      return;
    }
    const srcCanvas = topMesh.material.map.image;

    const leftTex  = this._createHalfCircleTexture(srcCanvas, 'left');
    const rightTex = this._createHalfCircleTexture(srcCanvas, 'right');

    const leftMat  = new THREE.MeshBasicMaterial({ map: leftTex, transparent: true, side: THREE.DoubleSide });
    const rightMat = new THREE.MeshBasicMaterial({ map: rightTex, transparent: true, side: THREE.DoubleSide });

    const leftMesh  = new THREE.Mesh(topMesh.geometry, leftMat);
    const rightMesh = new THREE.Mesh(topMesh.geometry, rightMat);

    leftMesh.position.copy(topMesh.position);
    leftMesh.rotation.copy(topMesh.rotation);
    leftMesh.renderOrder = topMesh.renderOrder;
    rightMesh.position.copy(topMesh.position);
    rightMesh.rotation.copy(topMesh.rotation);
    rightMesh.renderOrder = topMesh.renderOrder;

    const leftGroup  = new THREE.Group();
    const rightGroup = new THREE.Group();
    leftGroup.position.copy(group.position);
    rightGroup.position.copy(group.position);
    leftGroup.add(leftMesh);
    rightGroup.add(rightMesh);

    this.floatGroup.add(leftGroup);
    this.floatGroup.add(rightGroup);

    group.visible = false;

    this.captainBreakAnimations.push({
      side,
      upper: leftGroup,
      lower: rightGroup,
      startPos: group.position.clone(),
      elapsed: 0,
      duration: 2.4,
    });
  }

  _updateCaptainBreakAnimation(dt) {
    for (let i = this.captainBreakAnimations.length - 1; i >= 0; i--) {
      const a = this.captainBreakAnimations[i];
      a.elapsed += dt;
      const frac = Math.min(a.elapsed / a.duration, 1);

      const dx = 0.55 * frac;
      const dy = 0.10 * frac;
      const rot = 0.5 * frac;

      a.upper.position.set(
        a.startPos.x - dx,
        a.startPos.y - dy,
        a.startPos.z
      );
      a.lower.position.set(
        a.startPos.x + dx,
        a.startPos.y - dy,
        a.startPos.z
      );
      a.upper.rotation.z =  rot;
      a.lower.rotation.z = -rot;

      let opacity = 1;
      if (frac > 0.6) opacity = 1 - (frac - 0.6) / 0.4;
      opacity = Math.max(0, Math.min(1, opacity));

      a.upper.traverse(ch => { if (ch.material) ch.material.opacity = opacity; });
      a.lower.traverse(ch => { if (ch.material) ch.material.opacity = opacity; });

      if (frac >= 1) {
        this.floatGroup.remove(a.upper);
        this.floatGroup.remove(a.lower);
        a.upper.traverse(ch => {
          if (ch.material) {
            if (ch.material.map) ch.material.map.dispose();
            ch.material.dispose();
          }
        });
        a.lower.traverse(ch => {
          if (ch.material) {
            if (ch.material.map) ch.material.map.dispose();
            ch.material.dispose();
          }
        });
        this.captainBreakAnimations.splice(i, 1);
      }
    }
  }

  _updateCaptainVictoryMoves() {
    const now = performance.now();
    for (const [side, mv] of [...this.captainVictoryMoves.entries()]) {
      const entry = this.captainMeshes[side];
      if (!entry) { this.captainVictoryMoves.delete(side); continue; }
      const t = Math.min(1, (now - mv.t0) / mv.dur);
      const eased = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
      entry.mesh.position.x = mv.start.x + (mv.target.x - mv.start.x) * eased;
      entry.mesh.position.z = mv.start.z + (mv.target.z - mv.start.z) * eased;
      if (t >= 1) {
        entry.mesh.position.set(mv.target.x, 0, mv.target.z);
        const onDone = mv.onDone;
        this.captainVictoryMoves.delete(side);
        if (onDone) onDone();
      }
    }
  }

  // Постоянное движение жетона к entry.targetPos — как updateCaptainTokenMovement
  // в indexOld.html. Вызывается каждый кадр из главного цикла.
  _updateCaptainMovement(dt) {
    const SPEED = 2.5;
    for (const side of ['white', 'black']) {
      const entry = this.captainMeshes[side];
      if (!entry || !entry.targetPos) continue;
      if (!entry.mesh.visible) continue;
      // Победа: сначала доезд до позиции 1 своим твином, потом раскол.
      if (this.captainVictoryMoves.has(side)) continue;
      // Раскол: жетон скрыт, отдельные группы-половинки двигаются сами.
      if (this.captainBreakAnimations.some(a => a.side === side)) continue;

      const dx = entry.targetPos.x - entry.mesh.position.x;
      const dz = entry.targetPos.z - entry.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.002) {
        entry.mesh.position.x = entry.targetPos.x;
        entry.mesh.position.z = entry.targetPos.z;
        continue;
      }
      const step = Math.min(dist, dt * SPEED);
      entry.mesh.position.x += (dx / dist) * step;
      entry.mesh.position.z += (dz / dist) * step;
    }
  }

  // ==========================================================
  // ОСНОВНОЙ ЦИКЛ
  // ==========================================================

  _startRenderLoop() {
    const clock = new THREE.Clock();
    let firstFrame = true;
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = firstFrame ? 0 : clock.getDelta();
      firstFrame = false;
      const t = clock.getElapsedTime();

      if (!this.animating && this.queuedRevives.length > 0 && !this.game.gameOver) {
        const task = this.queuedRevives.shift();
        this.animating = { kind: 'revive', ...task };
      }
      if (this.animating && this.animating.kind === 'revive') {
        const done = this._updateReviveTask(this.animating, dt);
        if (done) { this.animating = null; this.syncFromGame(); }
      }

      // Анимация закончилась — если в очереди ждут события, обрабатываем.
      if (!this.animating && this._eventQueue.length > 0) {
        this._drainEventQueue();
      }

      // ★ Или, если сервер прислал новый state, пока мы играли
      //   анимацию, — теперь, когда всё успокоилось, применяем его.
      if (!this.animating && this._eventQueue.length === 0
          && this._pendingStateSync) {
        this._pendingStateSync = false;
        this.syncFromGame();
      }

      if (this.stars) this.stars.rotation.y = t * 0.01;
      if (this.floatGroup) this.floatGroup.position.y = Math.sin(t * 0.8) * 0.05;

      for (const [, entry] of this.pieceMeshes.entries()) {
        const sel = entry.mesh.children[4];
        if (sel && sel.visible) {
          sel.rotation.z = t * 1.4;
          const pulse = 1.0 + Math.sin(t * 5) * 0.07;
          sel.scale.set(pulse, pulse, pulse);
        }
        if (entry.bonus5Ring && entry.bonus5Ring.visible) {
          entry.bonus5Ring.rotation.z = t * 1.4;
          const pulse = 1.0 + Math.sin(t * 5) * 0.07;
          entry.bonus5Ring.scale.set(pulse, pulse, pulse);
        }
      }

      for (let i = this.spinningHighlights.length - 1; i >= 0; i--) {
        const s = this.spinningHighlights[i];
        if (s.mesh.parent) s.mesh.rotation.z = t * s.speed;
        else this.spinningHighlights.splice(i, 1);
      }

      for (const s of this.stadiumHighlights) {
        s.phase = (s.phase + dt * s.dashSpeed) % 100000;
        if (s.redraw) s.redraw();
      }

      for (const [, m] of this.mirrorMeshes.entries()) {
        if (m.shimmer.userData.disabled) { m.shimmer.material.opacity = 0; continue; }
        const local = (t + m.shimmer.userData.phaseOffset) % MIRROR_SHIMMER_INTERVAL;
        if (local < MIRROR_SHIMMER_DURATION) {
          const frac = local / MIRROR_SHIMMER_DURATION;
          m.shimmer.material.opacity = Math.sin(frac * Math.PI) * 0.95;
          m.shimmer.material.map.offset.x = -1 + frac * 2;
        } else m.shimmer.material.opacity = 0;
      }

      this._updateHpBlink(dt);
      this._updateCaptainMovement(dt);
      this._updatePowerOrbs(dt);
      this._updateCaptainVictoryMoves();
      this._updateCaptainBreakAnimation(dt);

      if (this.mirrorFieldReminders.size > 0) {
        const rect = this._bodyRectOf(this.renderer.domElement);
        for (const [id, el] of this.mirrorFieldReminders.entries()) {
          const entry = this.pieceMeshes.get(id);
          if (!entry || !el.classList.contains('visible')) continue;
          const pos = entry.mesh.position.clone();
          pos.y += MIRROR_BADGE_HEIGHT;
          pos.z += MIRROR_BADGE_OFFSET_Z;
          const vec = pos.project(this.camera);
          el.style.left = ((vec.x * 0.5 + 0.5) * rect.width + rect.left) + 'px';
          el.style.top = ((-vec.y * 0.5 + 0.5) * rect.height + rect.top) + 'px';
        }
      }

      if (this.game) {
        this._projectLocationBonusButtons();
        if (this.revealCardElements.length > 0 && this.game.revealState.active) {
          this._positionRevealCards(this.game.revealState.side);
        }
      }

      if (this.refs && this.refs.endTurnBtn) {
        const blocked = !!this.animating
          || !!(this.game && this.game.gameOver);

        this.refs.endTurnBtn.disabled = blocked;

        const lockedLook = !!(this.game && (this.ui.discardMode
                                         || this.ui.discardLocked));
        this.refs.endTurnBtn.classList.toggle('end-turn-locked', lockedLook);
      }

      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
}