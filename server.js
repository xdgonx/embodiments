// server.js — авторитетный сервер «Воплощений».
// Отдаёт статику (index.html, картинки) и держит WebSocket.

import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.woff2':'font/woff2',
};

const httpServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, urlPath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer });
const rooms = new Map();

// ★ Очередь матчмейкинга для «Быстрой игры». Хранит ws + имя
//   игроков, ожидающих случайного противника. Пара формируется,
//   как только в очереди оказывается двое живых.
const matchQueue = [];

function removeFromQueue(ws) {
  for (let i = matchQueue.length - 1; i >= 0; i--) {
    if (matchQueue[i].ws === ws) matchQueue.splice(i, 1);
  }
  ws._queuedForMatch = false;
}

function handleQuickMatch(ws, name) {
  if (ws._room || ws._queuedForMatch) return;

  // Чистим мёртвых из головы очереди.
  while (matchQueue.length > 0) {
    const head = matchQueue[0];
    if (head.ws && head.ws.readyState === WebSocket.OPEN) break;
    matchQueue.shift();
  }

  if (matchQueue.length === 0) {
    matchQueue.push({ ws, name });
    ws._queuedForMatch = true;
    ws.send(JSON.stringify({ type: 'queueWaiting' }));
    return;
  }

  const other = matchQueue.shift();
  other.ws._queuedForMatch = false;
  ws._queuedForMatch = false;

  const newCode = makeRoomCode();
  const room = new Room(newCode, {});
  rooms.set(newCode, room);
  console.log(`[match] QUICK ${other.name} + ${name} → room ${newCode}`);

  // Порядок join'ов не важен для рандома сторон: сервер сам
  // перемешает игроков в _maybeStartGame.
  if (room.join(other.ws, other.name, {})) other.ws._room = room;
  if (room.join(ws, name, {})) ws._room = room;
}

function makeRoomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return rooms.has(s) ? makeRoomCode() : s;
}
function uid() { return Math.random().toString(36).slice(2, 10); }

const ORB_FLIGHT_MS   = 1100;
const ORB_STAGGER_MS  = 140;
const EXPLORE_PREP_MS = 450;
const EXPLORE_ORB_COUNT = 3;

// Сколько секунд держим сторону за отключившимся игроком.
const RECONNECT_GRACE_MS = 60000;

class Room {
  constructor(code, opts) {
    this.code = code;
    this.game = new Game(opts);
    this.clients = new Map();
    // ★ true — когда оба игрока подключены и стороны назначены.
    //   До этого клиенты сидят в предлобби, игра не показывается.
    this.started = false;
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients.keys()) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }
  sendTo(ws, msg) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  join(ws, name, opts = {}) {
    // ★ Реконнект имеет смысл только после старта игры, когда стороны
    //   уже назначены. До старта клиент всегда входит как новый.
    if (opts.reconnectId && this.started) {
      for (const [oldWs, c] of [...this.clients.entries()]) {
        if (c.id !== opts.reconnectId) continue;
        if (oldWs.readyState === oldWs.OPEN) {
          try { oldWs.close(); } catch {}
        }
        this.clients.delete(oldWs);
        if (c.leaveTimer) { clearTimeout(c.leaveTimer); c.leaveTimer = null; }
        c.disconnected = false;
        this.clients.set(ws, c);
        console.log(`[room ${this.code}] RECONNECT ${c.name} → ${c.side}`);
        this.sendTo(ws, {
          type: 'welcome',
          roomCode: this.code,
          yourId: c.id,
          yourSide: c.side,
          yourName: c.name,
          started: true,
          state: this.game.getState(),
          players: [...this.clients.values()]
            .filter(x => !x.disconnected && x.side !== 'spectator')
            .map(x => ({ side: x.side, name: x.name })),
        });
        for (const [otherWs, other] of this.clients) {
          if (otherWs === ws || other.disconnected) continue;
          this.sendTo(otherWs, { type: 'playerJoined', side: c.side, name: c.name });
        }
        return true;
      }
    }

    // ★ Зрителей пускаем только в уже начатую игру.
    if (opts.asSpectator) {
      if (!this.started) {
        this.sendTo(ws, { type: 'error', message: 'Игра ещё не началась' });
        return false;
      }
      const client = { id: uid(), name: name || 'Наблюдатель', side: 'spectator', disconnected: false, leaveTimer: null };
      this.clients.set(ws, client);
      this.sendTo(ws, {
        type: 'welcome',
        roomCode: this.code,
        yourId: client.id,
        yourSide: 'spectator',
        yourName: client.name,
        started: true,
        state: this.game.getState(),
        players: [...this.clients.values()]
          .filter(x => !x.disconnected && x.side !== 'spectator')
          .map(x => ({ side: x.side, name: x.name })),
      });
      return true;
    }

    // ★ Игра уже идёт — новых игроков не пускаем.
    if (this.started) {
      const reason = opts.reconnectId
        ? 'Сессия истекла, начните новую игру'
        : 'Игра уже началась';
      this.sendTo(ws, { type: 'error', message: reason });
      return false;
    }

    // ★ Сколько ещё игроков сидит в ожидании? Больше двух — нельзя.
    const waiting = [...this.clients.values()]
      .filter(c => c.side !== 'spectator' && !c.disconnected);
    if (waiting.length >= 2) {
      this.sendTo(ws, { type: 'error', message: 'В комнате уже двое игроков' });
      return false;
    }

    const client = { id: uid(), name: name || 'Игрок', side: null, disconnected: false, leaveTimer: null };
    this.clients.set(ws, client);
    console.log(`[room ${this.code}] WAIT ${client.name} (всего: ${this.clients.size})`);

    // ★ Welcome без state и без yourSide: игра ещё не началась,
    //   клиент должен показать экран ожидания.
    this.sendTo(ws, {
      type: 'welcome',
      roomCode: this.code,
      yourId: client.id,
      yourName: client.name,
      started: false,
      players: [...this.clients.values()]
        .filter(x => !x.disconnected && x.side !== 'spectator')
        .map(x => ({ name: x.name })),
    });

    // ★ Оповещаем уже сидящего в предлобби, что кто-то зашёл.
    for (const [otherWs, other] of this.clients) {
      if (otherWs === ws || other.disconnected) continue;
      if (other.side === 'spectator') continue;
      this.sendTo(otherWs, { type: 'playerJoined', name: client.name });
    }

    // ★ Если набралось 2 — стартуем игру.
    this._maybeStartGame();
    return true;
  }

  _maybeStartGame() {
    if (this.started) return;
    const players = [...this.clients.entries()]
      .filter(([ws, c]) => c.side !== 'spectator' && !c.disconnected);
    if (players.length < 2) return;

    // ★ Случайно назначаем стороны: порядок подключения не влияет
    //   на то, кто получит белых, а кто чёрных.
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled[0][1].side = 'white';
    shuffled[1][1].side = 'black';

    this.started = true;

    const playerList = players.map(([ws, c]) => ({ name: c.name, side: c.side }));
    console.log(`[room ${this.code}] START ${playerList.map(p => `${p.name}=${p.side}`).join(', ')}`);

    // ★ Рассылаем roomReady обоим игрокам. Клиент скрывает экран
    //   ожидания, показывает баннер с назначением команд и входит
    //   в игру.
    for (const [ws, c] of this.clients) {
      if (c.disconnected) continue;
      if (c.side === 'spectator') continue;
      this.sendTo(ws, {
        type: 'roomReady',
        roomCode: this.code,
        yourId: c.id,
        yourSide: c.side,
        yourName: c.name,
        players: playerList,
        state: this.game.getState(),
      });
    }
  }

  leave(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    if (client.leaveTimer) clearTimeout(client.leaveTimer);

    // ★ До старта игры никакого grace period: просто удаляем и ждём
    //   следующего. Если и этот ушёл — комната очистится.
    if (!this.started) {
      this.clients.delete(ws);
      for (const [otherWs, other] of this.clients) {
        if (other.disconnected) continue;
        this.sendTo(otherWs, { type: 'playerLeft', name: client.name, temporary: false });
      }
      if (this.clients.size === 0) rooms.delete(this.code);
      return;
    }

    // ★ После старта — стандартное окно реконнекта.
    client.disconnected = true;
    console.log(`[room ${this.code}] DISCONNECT ${client.name} (${client.side}) — ждём ${RECONNECT_GRACE_MS / 1000}с`);
    this.broadcast({ type: 'playerLeft', side: client.side, name: client.name, temporary: true });
    client.leaveTimer = setTimeout(() => {
      for (const [w, c] of [...this.clients.entries()]) {
        if (c === client) this.clients.delete(w);
      }
      console.log(`[room ${this.code}] LEAVE ${client.name} (${client.side}) (осталось: ${this.clients.size})`);
      this.broadcast({ type: 'playerLeft', side: client.side, name: client.name, temporary: false });
      if (this.clients.size === 0) rooms.delete(this.code);
    }, RECONNECT_GRACE_MS);
  }

  handleAction(ws, action) {
    const client = this.clients.get(ws);
    if (!client) return;
    // ★ До старта никакие действия не принимаются.
    if (!this.started) {
      this.sendTo(ws, { type: 'error', message: 'Игра ещё не началась' });
      return;
    }
    if (client.side === 'spectator') {
      this.sendTo(ws, { type: 'error', message: 'Наблюдатели не могут действовать' });
      return;
    }
    if (!action || typeof action !== 'object') {
      this.sendTo(ws, { type: 'error', message: 'Пустое действие' });
      return;
    }

    action = { ...action, side: client.side };
    console.log(`[room ${this.code}] ACTION ${client.side}: ${action.kind}${action.mode ? '/' + action.mode : ''}`);

    if (action.kind === 'undo') {
      this.sendTo(ws, { type: 'error', message: 'Отмена недоступна в мультиплеере' });
      return;
    }

    const result = this.game.applyAction(action);
    if (!result.ok) {
      this.sendTo(ws, { type: 'error', message: result.error, actionKind: action.kind });
      return;
    }

    const events = result.events || [];
    this.broadcast({ type: 'events', events, actor: client.side });

    const hasMight = events.some(e =>
      e.kind === 'exploreResolved' ||
      e.kind === 'powerOrbsFromCenter' ||
      e.kind === 'deathOrbFromPiece'
    );

    this._scheduleMightFromEvents(events);

    if (!hasMight) {
      this.broadcast({ type: 'state', state: this.game.getState() });
    }
  }

  _scheduleMightFromEvents(events) {
    const fallbackActor = this.game.currentTurn;
    const fallbackTurn  = this.game.halfTurn;

    const scheduleOne = (side, delayMs, reason, actorOverride, turnOverride) => {
      const useActor = actorOverride != null ? actorOverride : fallbackActor;
      const useTurn  = turnOverride  != null ? turnOverride  : fallbackTurn;
      setTimeout(() => {
        // ★ Раньше здесь был `if (this.game.gameOver) return;` —
        //   из-за него все пузырьки, летящие ПОСЛЕ добивающего
        //   (2-й и 3-й при исследовании базы, либо второй пузырёк
        //   центра), не записывались в history — и на «Хронике
        //   могущества» не хватало последних кружков/квадрата.
        //   applyMightChange корректно работает и после gameOver:
        //   _changeMight не трогает might ниже 0, а clampedAtZero
        //   в applyMightChange сам пушит запись с delta=0, чтобы
        //   событие осталось в графе. Повторный gameWon не летит —
        //   _checkVictory сам делает `if (this.gameOver) return;`.
        const res = this.game.applyMightChange(side, -1, reason, useActor, useTurn);
        if (res && res.events && res.events.length > 0) {
          this.broadcast({ type: 'events', events: res.events });
        }
        this.broadcast({ type: 'state', state: this.game.getState() });
      }, delayMs);
    };

    for (const ev of events) {
      if (ev.kind === 'exploreResolved') {
        for (let i = 0; i < EXPLORE_ORB_COUNT; i++) {
          scheduleOne(ev.enemySide,
            EXPLORE_PREP_MS + ORB_FLIGHT_MS + i * ORB_STAGGER_MS, 'explore');
        }
      } else if (ev.kind === 'powerOrbsFromCenter') {
        for (let i = 0; i < ev.count; i++) {
          scheduleOne(ev.enemySide,
            ORB_FLIGHT_MS + i * ORB_STAGGER_MS, 'location3',
            ev.actor, ev.turn);
        }
      } else if (ev.kind === 'deathOrbFromPiece') {
        scheduleOne(ev.side, ORB_FLIGHT_MS, 'death');
      }
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
	
    if (msg.type === 'quickMatch') {
      const name = ((msg.name || 'Игрок') + '').slice(0, 16) || 'Игрок';
      handleQuickMatch(ws, name);
      return;
    }

    if (msg.type === 'cancelQuickMatch') {
      removeFromQueue(ws);
      ws.send(JSON.stringify({ type: 'queueCancelled' }));
      return;
    }

    if (msg.type === 'join') {
      const code = (msg.roomCode || '').toUpperCase().trim();
      let room;
            if (!code) {
        const newCode = makeRoomCode();
        room = new Room(newCode, {
          seed:         msg.seed != null ? msg.seed : undefined,
          teamConfig:   msg.teamConfig,
          shuffleTeams: !!msg.shuffleTeams,
        });
        rooms.set(newCode, room);
      } else {
        room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Комната не найдена' }));
          ws.close();
          return;
        }
      }
      const joined = room.join(ws, msg.name, {
        asSpectator: !!msg.asSpectator,
        reconnectId: msg.reconnectId || null,
      });
      if (joined) {
        ws._room = room;
      } else {
        // room.join сам отправил клиенту конкретную причину
        // («Игра уже началась» / «В комнате уже двое» / «Игра ещё
        //  не началась» для зрителя). Держать сокет открытым нет
        // смысла: он висит «подключён, но без комнаты», и любое
        // следующее сообщение получит «Сначала join». Закрываем.
        ws.close();
      }
      return;
    }

    const room = ws._room;
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: 'Сначала join' }));
      return;
    }
    if (msg.type === 'action') room.handleAction(ws, msg.action);
    else if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
  });

  ws.on('close', () => {
    removeFromQueue(ws);
    if (ws._room) ws._room.leave(ws);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🎮 Воплощения: http://localhost:${PORT}`);
});