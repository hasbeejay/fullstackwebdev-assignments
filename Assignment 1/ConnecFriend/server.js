/*
 * ConnecFriend — OPTIONAL local WebSocket relay (classroom demonstration only).
 *
 * This file is NOT needed for the assignment's frontend-only mode. It adds real-time delivery of private
 * messages between two browsers on the same computer. It has no database, so offline recipients never
 * receive messages later, and it is NOT secure authentication: any local client can claim any demo username.
 *
 * Protocol (JSON text frames)
 *   client -> server  {type:"hello",   userId}
 *                     {type:"message", id, from, to, content, createdAt}
 *   server -> client  {type:"welcome", userId}
 *                     {type:"message", id, from, to, content, createdAt}   (only to the recipient's sockets)
 *                     {type:"ack",     id, status:"delivered"|"offline"}   (only to the sender)
 *                     {type:"error",   reason, id?}
 *
 * It also serves the static files so http://localhost:3000 works as an alternative to opening index.html.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1'; // localhost only; the relay is never exposed to the network
const ROOT = __dirname;

const DEMO_USER_IDS = new Set(['u_haseeb', 'u_raheem', 'u_taimur', 'u_aneeq', 'u_obaid', 'u_obiad']);
const MAX_CONTENT_LENGTH = 1000;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const RATE_LIMIT = { windowMs: 10000, maxMessages: 30 };
const MAX_REMEMBERED_IDS = 1000;

/* ---------- Static file server (optional convenience) ---------- */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json',
};
const PRIVATE_FILES = new Set(['server.js', 'package.json', 'package-lock.json']);

const httpServer = http.createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(ROOT, relative);
  const insideRoot = filePath.startsWith(ROOT + path.sep);
  const isPrivate = PRIVATE_FILES.has(relative) || relative.split('/').some((part) => part.startsWith('.') || part === 'node_modules');
  if (!insideRoot || isPrivate) {
    response.writeHead(404);
    return response.end('Not found');
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      return response.end('Not found');
    }
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    response.end(data);
  });
});

/* ---------- WebSocket relay ---------- */
const wss = new WebSocketServer({ server: httpServer, maxPayload: 8 * 1024 });
const socketsByUser = new Map(); // userId -> Set<WebSocket>
const deliveredIds = new Map(); // message id -> true
const pendingMessages = new Map(); // userId -> Array<message> (offline queue)

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function isValidMessage(data) {
  return (
    data && typeof data === 'object' &&
    typeof data.id === 'string' && MESSAGE_ID_PATTERN.test(data.id) &&
    typeof data.from === 'string' && typeof data.to === 'string' &&
    typeof data.content === 'string' && data.content.trim().length > 0 && data.content.length <= MAX_CONTENT_LENGTH &&
    typeof data.createdAt === 'number' && isFinite(data.createdAt)
  );
}

function withinRateLimit(socket) {
  const now = Date.now();
  socket.recentSends = (socket.recentSends || []).filter((time) => now - time < RATE_LIMIT.windowMs);
  if (socket.recentSends.length >= RATE_LIMIT.maxMessages) return false;
  socket.recentSends.push(now);
  return true;
}

function rememberDelivered(id) {
  deliveredIds.set(id, true);
  if (deliveredIds.size > MAX_REMEMBERED_IDS) deliveredIds.delete(deliveredIds.keys().next().value);
}

function broadcastPresence() {
  const onlineUsers = Array.from(socketsByUser.keys());
  const payload = { type: 'presence', onlineUsers };
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      send(client, payload);
    }
  });
}

function handleHello(socket, data) {
  if (typeof data.userId !== 'string' || !DEMO_USER_IDS.has(data.userId)) {
    return send(socket, { type: 'error', reason: 'Unknown demo account.' });
  }
  detach(socket);
  socket.userId = data.userId;
  if (!socketsByUser.has(data.userId)) socketsByUser.set(data.userId, new Set());
  socketsByUser.get(data.userId).add(socket);
  send(socket, { type: 'welcome', userId: data.userId });
  broadcastPresence();

  // Deliver any pending offline messages queued for this user
  const queue = pendingMessages.get(data.userId);
  if (queue && queue.length > 0) {
    queue.forEach((msg) => {
      send(socket, msg);
      rememberDelivered(msg.id);
    });
    pendingMessages.delete(data.userId);
  }
}

function handleTyping(socket, data) {
  if (!socket.userId || !data || typeof data.to !== 'string') return;
  const recipients = socketsByUser.get(data.to);
  if (recipients) {
    const payload = { type: 'typing', from: socket.userId, to: data.to, isTyping: Boolean(data.isTyping) };
    recipients.forEach((rc) => {
      if (rc.readyState === rc.OPEN) send(rc, payload);
    });
  }
}

function handleMessage(socket, data) {
  if (!socket.userId) return send(socket, { type: 'error', reason: 'Say hello first.', id: data && data.id });
  if (!isValidMessage(data)) return send(socket, { type: 'error', reason: 'Malformed message.', id: data && typeof data.id === 'string' ? data.id : undefined });
  if (data.from !== socket.userId) return send(socket, { type: 'error', reason: 'Sender does not match this connection.', id: data.id });
  if (!DEMO_USER_IDS.has(data.to) || data.to === data.from) return send(socket, { type: 'error', reason: 'Unknown recipient.', id: data.id });
  if (!withinRateLimit(socket)) return send(socket, { type: 'error', reason: 'Slow down — too many messages.', id: data.id });
  if (deliveredIds.has(data.id)) return send(socket, { type: 'ack', id: data.id, status: 'delivered' }); // duplicate retry

  const recipients = socketsByUser.get(data.to);
  const outgoing = { type: 'message', id: data.id, from: data.from, to: data.to, content: data.content.trim(), createdAt: data.createdAt };
  let delivered = 0;
  if (recipients && recipients.size > 0) {
    recipients.forEach((recipientSocket) => {
      if (recipientSocket.readyState === recipientSocket.OPEN) {
        send(recipientSocket, outgoing);
        delivered += 1;
      }
    });
  } else {
    // Recipient is not actively connected right now: queue in memory for instant delivery upon login
    if (!pendingMessages.has(data.to)) pendingMessages.set(data.to, []);
    pendingMessages.get(data.to).push(outgoing);
  }
  if (delivered > 0) rememberDelivered(data.id);
  // Status is 'delivered' if live or 'sent' (stored & queued)
  send(socket, { type: 'ack', id: data.id, status: delivered > 0 ? 'delivered' : 'sent' });
}

function detach(socket) {
  if (!socket.userId) return;
  const group = socketsByUser.get(socket.userId);
  if (group) {
    group.delete(socket);
    if (group.size === 0) socketsByUser.delete(socket.userId);
  }
  socket.userId = null;
  broadcastPresence();
}

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (error) {
      return send(socket, { type: 'error', reason: 'Messages must be JSON.' });
    }
    if (!data || typeof data !== 'object') return send(socket, { type: 'error', reason: 'Malformed message.' });
    if (data.type === 'hello') return handleHello(socket, data);
    if (data.type === 'message') return handleMessage(socket, data);
    if (data.type === 'typing') return handleTyping(socket, data);
    if (data.type === 'ping') return send(socket, { type: 'pong', time: Date.now() });
    return send(socket, { type: 'error', reason: 'Unknown message type.' });
  });
  socket.on('close', () => detach(socket));
  socket.on('error', () => detach(socket)); // a bad client must never crash the relay
});

// Drop connections that stopped answering so "offline" is reported honestly.
const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket.isAlive) return socket.terminate();
    socket.isAlive = false;
    socket.ping();
  });
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

httpServer.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? 'Port ' + PORT + ' is busy. Try: PORT=3100 npm start' : error.message);
  process.exit(1);
});

if (require.main === module) {
  httpServer.listen(PORT, HOST, () => {
    console.log('ConnecFriend relay running (local demo only).');
    console.log('  App:       http://localhost:' + PORT);
    console.log('  WebSocket: ws://localhost:' + PORT);
  });
}

module.exports = { httpServer, wss };
