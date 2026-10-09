/* messaging.js — Private messaging with always-live WebSocket relay + multi-tab sync.
   Simple, clean student-level architecture for CS 301. */
(function () {
  const CF = (window.CF = window.CF || {});

  const MAX_MESSAGE_LENGTH = 1000;
  const onlineUsers = new Set();
  const typingUsers = new Map();

  /* =========================================================================
     1. Local Storage Thread & Conversation Helpers
     ========================================================================= */

  // Returns all messages exchanged between user A and user B, sorted by time
  function threadBetween(state, a, b) {
    return state.messages
      .filter((m) => (m.senderId === a && m.recipientId === b) || (m.senderId === b && m.recipientId === a))
      .sort((x, y) => x.createdAt - y.createdAt);
  }

  // Returns conversation list with last message and unread count for current user
  function listConversations(state, userId) {
    const map = new Map();
    state.messages.forEach((m) => {
      if (m.senderId !== userId && m.recipientId !== userId) return;
      const partnerId = m.senderId === userId ? m.recipientId : m.senderId;
      const entry = map.get(partnerId) || { partnerId, last: null, unread: 0 };
      if (!entry.last || m.createdAt >= entry.last.createdAt) entry.last = m;
      if (m.recipientId === userId && !m.read) entry.unread += 1;
      map.set(partnerId, entry);
    });
    return Array.from(map.values())
      .filter((entry) => CF.Friends.getUser(state, entry.partnerId))
      .sort((a, b) => b.last.createdAt - a.last.createdAt);
  }

  // Total count of unread messages across all partners
  function unreadTotal(state, userId) {
    return state.messages.filter((m) => m.recipientId === userId && !m.read).length;
  }

  // Mark messages from a specific partner as read
  function markRead(userId, partnerId) {
    CF.Store.update((state) => {
      state.messages.forEach((m) => {
        if (m.recipientId === userId && m.senderId === partnerId) m.read = true;
      });
    });
  }

  /* =========================================================================
     2. Sending & Receiving Messages
     ========================================================================= */

  function sendMessage(senderId, recipientId, content) {
    const text = String(content || '').trim();
    if (!recipientId) return { ok: false, message: 'Choose a recipient.' };
    if (!text) return { ok: false, message: 'Type a message first.' };
    if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, message: 'Message exceeds limit.' };

    const isLive = Live.isConnected();
    const created = {
      id: CF.Store.newId('m'),
      senderId,
      recipientId,
      content: text,
      createdAt: Date.now(),
      read: false,
      delivery: isLive ? 'sending' : 'local',
    };

    // 1. Save in local browser storage
    CF.Store.update((state) => {
      state.messages.push(created);
    });

    // 2. Send over WebSocket relay if connected
    if (isLive) {
      Live.sendRaw({
        type: 'message',
        id: created.id,
        from: senderId,
        to: recipientId,
        content: created.content,
        createdAt: created.createdAt,
      });
    }

    // 3. Sync instantly with any other open tabs in this browser
    if (tabSync) {
      tabSync.postMessage({ type: 'message', data: created });
    }

    sendTyping(recipientId, false);
    notifyUI();
    return { ok: true, message: created };
  }

  function setDelivery(messageId, status) {
    CF.Store.update((state) => {
      const msg = state.messages.find((m) => m.id === messageId);
      if (msg) msg.delivery = status;
    });
    notifyUI();
  }

  function receiveRemoteMessage(payload) {
    const me = CF.Auth.currentUser();
    if (!me || !payload || payload.to !== me.id) return false;

    // Avoid duplicate records if already present
    const state = CF.Store.get();
    if (state.messages.some((m) => m.id === payload.id)) return false;

    const partnerId = Live.getActivePartner();
    const isCurrentChat = payload.from === partnerId;

    CF.Store.update((draft) => {
      draft.messages.push({
        id: String(payload.id),
        senderId: payload.from,
        recipientId: me.id,
        content: String(payload.content || '').slice(0, MAX_MESSAGE_LENGTH),
        createdAt: Number(payload.createdAt) || Date.now(),
        read: isCurrentChat,
        delivery: 'delivered',
      });
    });

    if (CF.UI && CF.UI.playChime) CF.UI.playChime();
    notifyUI({ incomingFrom: payload.from, isCurrentChat });
    return true;
  }

  function retryMessage(messageId, userId) {
    const msg = CF.Store.get().messages.find((m) => m.id === messageId && m.senderId === userId);
    if (!msg) return { ok: false, message: 'Message not found.' };
    setDelivery(messageId, 'sending');
    if (Live.isConnected()) {
      Live.sendRaw({
        type: 'message',
        id: msg.id,
        from: msg.senderId,
        to: msg.recipientId,
        content: msg.content,
        createdAt: msg.createdAt,
      });
    } else {
      setDelivery(messageId, 'local');
    }
    return { ok: true };
  }

  function notifyUI(detail) {
    document.dispatchEvent(new CustomEvent('cf:messages-changed', { detail: detail || {} }));
  }

  /* =========================================================================
     3. Typing Indicators and Online Presence
     ========================================================================= */

  function sendTyping(recipientId, isTyping) {
    const me = CF.Auth.currentUser();
    if (!me || !recipientId) return;
    if (Live.isConnected()) {
      Live.sendRaw({ type: 'typing', to: recipientId, isTyping: Boolean(isTyping) });
    }
    if (tabSync) {
      tabSync.postMessage({ type: 'typing', from: me.id, to: recipientId, isTyping: Boolean(isTyping) });
    }
  }

  function handleTypingEvent(fromUserId, isTyping) {
    if (typingUsers.has(fromUserId)) clearTimeout(typingUsers.get(fromUserId));
    if (isTyping) {
      const timer = setTimeout(() => {
        typingUsers.delete(fromUserId);
        document.dispatchEvent(new CustomEvent('cf:user-typing', { detail: { from: fromUserId, isTyping: false } }));
      }, 3000);
      typingUsers.set(fromUserId, timer);
      document.dispatchEvent(new CustomEvent('cf:user-typing', { detail: { from: fromUserId, isTyping: true } }));
    } else {
      typingUsers.delete(fromUserId);
      document.dispatchEvent(new CustomEvent('cf:user-typing', { detail: { from: fromUserId, isTyping: false } }));
    }
  }

  function isUserOnline(userId) {
    if (!userId) return false;
    const me = CF.Auth.currentUser();
    if (me && me.id === userId) return true;
    if (onlineUsers.has(userId)) return true;
    const u = CF.Friends.getUser(CF.Store.get(), userId);
    return Boolean(u && u.lastLoginAt && Date.now() - u.lastLoginAt < 300000);
  }

  /* =========================================================================
     4. Multi-Tab Synchronization (BroadcastChannel)
     ========================================================================= */

  const tabSync = typeof window.BroadcastChannel === 'function' ? new BroadcastChannel('cf_tab_sync') : null;
  if (tabSync) {
    tabSync.onmessage = (e) => {
      const data = e.data;
      if (!data) return;
      const me = CF.Auth.currentUser();
      if (!me) return;

      if (data.type === 'message' && data.data && data.data.to === me.id) {
        receiveRemoteMessage(data.data);
        tabSync.postMessage({ type: 'ack', id: data.data.id, status: 'delivered', to: data.data.from });
      } else if (data.type === 'ack' && data.to === me.id) {
        setDelivery(data.id, data.status);
      } else if (data.type === 'typing' && data.to === me.id) {
        handleTypingEvent(data.from, data.isTyping);
      }
    };
  }

  /* =========================================================================
     5. Always-Live WebSocket Relay Client
     ========================================================================= */

  const SETTINGS_KEY = 'connecfriend.live';

  function defaultRelayUrl() {
    if (window.location && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return proto + '//' + (window.location.host || 'localhost:3000');
    }
    return 'ws://localhost:3000';
  }

  const Live = (function () {
    let ws = null;
    let status = 'off';
    let activePartner = null;
    const listeners = [];

    const settings = () => {
      const fallback = { enabled: true, url: defaultRelayUrl() };
      return Object.assign(fallback, CF.Store.readPref(SETTINGS_KEY, {}));
    };

    function connect() {
      const me = CF.Auth.currentUser();
      const cfg = settings();
      if (!cfg.enabled || !me || typeof window.WebSocket !== 'function') return;

      if (ws) {
        try { ws.close(); } catch (_) {}
        ws = null;
      }

      status = 'connecting';
      listeners.forEach((fn) => fn());

      try {
        ws = new WebSocket(cfg.url);
      } catch (err) {
        status = 'off';
        listeners.forEach((fn) => fn());
        return;
      }

      ws.onopen = () => {
        status = 'connected';
        ws.send(JSON.stringify({ type: 'hello', userId: me.id }));
        listeners.forEach((fn) => fn());
      };

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (_) { return; }
        if (!msg) return;

        if (msg.type === 'welcome') {
          status = 'connected';
          onlineUsers.add(me.id);
          listeners.forEach((fn) => fn());
        } else if (msg.type === 'presence' && Array.isArray(msg.onlineUsers)) {
          onlineUsers.clear();
          msg.onlineUsers.forEach((id) => onlineUsers.add(id));
          document.dispatchEvent(new CustomEvent('cf:presence-changed'));
        } else if (msg.type === 'typing') {
          handleTypingEvent(msg.from, msg.isTyping);
        } else if (msg.type === 'message') {
          receiveRemoteMessage(msg);
        } else if (msg.type === 'ack') {
          setDelivery(msg.id, msg.status === 'delivered' ? 'delivered' : 'sent');
        }
      };

      ws.onclose = () => {
        ws = null;
        status = 'off';
        listeners.forEach((fn) => fn());
        // Simple auto-reconnect after 3 seconds
        if (settings().enabled && CF.Auth.currentUser()) {
          setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        /* silent retry on close */
      };
    }

    function disconnect() {
      if (ws) {
        try { ws.close(); } catch (_) {}
        ws = null;
      }
      status = 'off';
      listeners.forEach((fn) => fn());
    }

    function configure(next) {
      const merged = Object.assign(settings(), next);
      CF.Store.writePref(SETTINGS_KEY, merged);
      if (merged.enabled) connect(); else disconnect();
    }

    function sendRaw(payload) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(JSON.stringify(payload));
        return true;
      } catch (_) {
        return false;
      }
    }

    return {
      settings,
      connect,
      disconnect,
      configure,
      sendRaw,
      isConnected: () => status === 'connected',
      getStatus: () => ({ status, error: '' }),
      onChange: (fn) => listeners.push(fn),
      setActivePartnerProvider: (fn) => { activePartner = fn; },
      getActivePartner: () => (typeof activePartner === 'function' ? activePartner() : null),
    };
  })();

  CF.Messaging = {
    MAX_MESSAGE_LENGTH,
    threadBetween,
    listConversations,
    unreadTotal,
    markRead,
    sendMessage,
    retryMessage,
    receiveRemoteMessage,
    setDelivery,
    sendTyping,
    isUserOnline,
  };
  CF.Live = Live;
})();
