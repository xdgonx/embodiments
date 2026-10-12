// net.js — WebSocket-клиент. Связывает браузер с сервером.

export class Net {
  constructor(url, game) {
    this.url = url;
    this.game = game;
    this.ws = null;
    this.connected = false;
    this.mySide = null;
    this.myId = null;
    this.roomCode = null;
    this.players = [];

    this.onAction = null;
    this.onState = null;
    this.onWelcome = null;
    this.onRoomReady = null;
    this.onError = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onDisconnect = null;
    this.onQueueWaiting = null;
    this.onQueueCancelled = null;

    this._intentional = false;
    this._reconnectAttempts = 0;
    this._joinArgs = null;
  }

  connect({ roomCode, name, seed, teamConfig, shuffleTeams, asSpectator, reconnectId }) {
    this._joinArgs = { roomCode, name, seed, teamConfig, shuffleTeams, asSpectator, reconnectId };
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };

      try { this.ws = new WebSocket(this.url); }
      catch (e) { reject(e); return; }

      this.ws.addEventListener('open', () => {
        this.connected = true;
        this._reconnectAttempts = 0;
        this.ws.send(JSON.stringify({ type: 'join', ...this._joinArgs }));
        // ★ Периодический ping каждые 20 секунд — заставляет сетевые
        //   прокси и мобильные браузеры дольше держать соединение
        //   открытым. Само по себе решает часть «микро-разрывов»,
        //   когда вкладка ушла в фон на несколько секунд.
        if (this._pingTimer) clearInterval(this._pingTimer);
        this._pingTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch {}
          }
        }, 20000);
      });

      this.ws.addEventListener('message', (e) => {
        let msg; try { msg = JSON.parse(e.data); } catch { return; }
        switch (msg.type) {
          case 'welcome':
            // ★ yourSide может отсутствовать — игра ещё не началась.
            if (msg.yourSide) this.mySide = msg.yourSide;
            this.myId = msg.yourId;
            this.roomCode = msg.roomCode;
            this.players = msg.players || [];
            // ★ state приходит только когда игра уже идёт
            //   (реконнект или зритель). До старта state нет.
            if (msg.state) this._rehydrate(msg.state);
            if (this.onWelcome) this.onWelcome(msg);
            done(resolve, msg);
            break;
          case 'roomReady':
            // ★ Оба игрока подключились, стороны назначены, игра
            //   началась. Приходит вместо welcome второму игроку и
            //   как апдейт первому.
            this.mySide = msg.yourSide;
            this.myId = msg.yourId;
            this.roomCode = msg.roomCode;
            this.players = msg.players || [];
            if (msg.state) this._rehydrate(msg.state);
            if (this.onRoomReady) this.onRoomReady(msg);
            break;
          case 'state':
            this._rehydrate(msg.state);
            if (this.onState) this.onState(msg.state);
            break;
          case 'events':
            if (this.onAction) this.onAction({ ok: true, events: msg.events });
            break;
          case 'error':
            console.warn('[net] server error:', msg.message);
            if (this.onError) this.onError(msg.message, msg.actionKind);
            done(reject, new Error(msg.message));
            break;
          case 'playerJoined':
            if (this.onPlayerJoined) this.onPlayerJoined(msg.side, msg.name);
            break;
          case 'playerLeft':
            if (this.onPlayerLeft) this.onPlayerLeft(msg.side, msg.name, !!msg.temporary);
            break;
          case 'queueWaiting':
            if (this.onQueueWaiting) this.onQueueWaiting();
            break;
          case 'queueCancelled':
            if (this.onQueueCancelled) this.onQueueCancelled();
            break;
          case 'pong': break;
        }
      });

      this.ws.addEventListener('close', () => {
        this.connected = false;
        if (this.onDisconnect) this.onDisconnect();
        if (!this._intentional) this._scheduleReconnect();
      });

      this.ws.addEventListener('error', () => {
        done(reject, new Error('Не удалось подключиться'));
      });
    });
  }

  send(action) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'action', action }));
  }

  quickMatch(name) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'quickMatch', name }));
  }

  cancelQuickMatch() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'cancelQuickMatch' }));
  }

  close() {
    this._intentional = true;
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    if (this.ws) this.ws.close();
  }

  _rehydrate(state) {
    if (this.game && typeof this.game._restore === 'function') {
      this.game._restore(state);
    }
  }

  _scheduleReconnect() {
    // ★ Раньше эти проверки отсутствовали, и был реальный race:
    //   если close() вызван ПОКА уже висит отложенный реконнект
    //   (setTimeout от предыдущего разрыва), таймер всё равно
    //   срабатывал и connect() уходил на сервер вопреки
    //   пользовательскому «закрыть». Стреляло на victory-restart
    //   (net.close() + location.reload()) и на любой будущей
    //   кнопке «выйти в лобби». Проверяем _intentional дважды:
    //   один раз при постановке таймера, второй — в самом колбэке
    //   (пользователь мог нажать close() между schedule и fire).
    //   Защита от null в _joinArgs — оборонительная: сейчас
    //   недостижима, потому что connect() присваивает _joinArgs
    //   до создания сокета, а _scheduleReconnect дёргается только
    //   из close-события уже существующего сокета.
    if (this._intentional) return;
    if (!this._joinArgs) return;
    if (this._reconnectAttempts >= 5) return;
    const delay = Math.min(1000 * 2 ** this._reconnectAttempts, 8000);
    this._reconnectAttempts++;
    setTimeout(() => {
      if (this._intentional) return;
      console.log('[net] reconnect attempt', this._reconnectAttempts);
      this.connect(this._joinArgs).catch(() => {});
    }, delay);
  }
}