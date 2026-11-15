const express = require('express');
const app = express();

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {Server} = require('socket.io');

const ACTIONS = require('./src/actions/Actions');
const {rooms, loadRooms, ensureRoom, scheduleSave} = require('./roomStore');

loadRooms();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || '*',
        methods: ['GET', 'POST'],
    },
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Only serve the built React app if it was built alongside this server
// (the all-in-one Docker setup). When frontend/backend are deployed as
// separate services, no build/ folder exists here, so this is skipped.
const buildPath = path.join(__dirname, 'build');
if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    app.use((req, res, next) => {
        res.sendFile(path.join(buildPath, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        const htmlContent = '<h1>Welcome to the code editor server</h1>';
        res.setHeader('Content-Type', 'text/html');
        res.send(htmlContent);
    });
}

const MAX_USERNAME_LENGTH = 50;
const MAX_CHAT_LENGTH = 1000;
const MAX_CODE_LENGTH = 500000;
const MAX_OUTPUT_LENGTH = 100000;

const userSocketMap = {};
function getAllConnectedClients(roomId) {
    // Map
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
            };
        }
    );
}

function isValidRoomId(roomId) {
    return typeof roomId === 'string' && roomId.length > 0 && roomId.length <= 100;
}

function isValidUsername(username) {
    return (
        typeof username === 'string' &&
        username.trim().length > 0 &&
        username.length <= MAX_USERNAME_LENGTH
    );
}

function isValidCode(code) {
    return typeof code === 'string' && code.length <= MAX_CODE_LENGTH;
}

function isValidLanguage(lang) {
    return typeof lang === 'string' && /^[a-z0-9-]{1,30}$/.test(lang);
}

function isPosition(pos) {
    return (
        pos != null &&
        Number.isInteger(pos.line) && pos.line >= 0 &&
        Number.isInteger(pos.ch) && pos.ch >= 0
    );
}

// Rebuild cursor data from known fields so clients never receive junk.
function sanitizeCursor(cursor) {
    if (!isPosition(cursor)) return null;
    const sel = cursor.selection;
    return {
        line: cursor.line,
        ch: cursor.ch,
        selection:
            sel && isPosition(sel.anchor) && isPosition(sel.head)
                ? {
                      anchor: {line: sel.anchor.line, ch: sel.anchor.ch},
                      head: {line: sel.head.line, ch: sel.head.ch},
                  }
                : null,
    };
}

function sanitizeOutput(output) {
    if (output == null || typeof output !== 'object') return null;
    const text = (v) =>
        typeof v === 'string' ? v.slice(0, MAX_OUTPUT_LENGTH) : undefined;
    const exitCode =
        typeof output.exitCode === 'string' || typeof output.exitCode === 'number'
            ? output.exitCode
            : undefined;
    return {stdout: text(output.stdout), stderr: text(output.stderr), exitCode};
}

// Only sockets that actually joined the room (and weren't kicked) may act on it.
function isInRoom(socket, roomId) {
    return isValidRoomId(roomId) && socket.rooms.has(roomId);
}

// Ownership is proven by the secret owner token, not by the username.
function isRoomOwner(socket, roomId) {
    return !!socket && socket.data.ownedRooms.has(roomId);
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);
    socket.data.ownedRooms = new Set();

    socket.on(ACTIONS.JOIN, ({roomId, username, ownerToken} = {}) => {
        if (!isValidRoomId(roomId) || !isValidUsername(username)) return;
        username = username.trim();
        const room = ensureRoom(roomId);

        let isOwner;
        if (room.ownerToken) {
            isOwner = typeof ownerToken === 'string' && ownerToken === room.ownerToken;
        } else {
            // A new room, or one saved before owner tokens existed: the first
            // (owner-named) joiner claims it and receives the token.
            isOwner = !room.ownerUsername || username === room.ownerUsername;
        }

        if (room.locked && !isOwner) {
            socket.emit(ACTIONS.JOIN_REJECTED, {reason: 'Room is locked by its owner'});
            return;
        }

        if (isOwner && !room.ownerToken) {
            room.ownerUsername = username;
            room.ownerToken = crypto.randomBytes(24).toString('hex');
            scheduleSave();
        }
        if (isOwner) {
            socket.data.ownedRooms.add(roomId);
            socket.emit(ACTIONS.OWNER_TOKEN, {roomId, token: room.ownerToken});
        }

        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({socketId}) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
                isOwner: isRoomOwner(io.sockets.sockets.get(socketId), roomId),
            });
        });

        if (room.code != null) {
            io.to(socket.id).emit(ACTIONS.CODE_CHANGE, {code: room.code});
        }
        if (room.language) {
            io.to(socket.id).emit(ACTIONS.LANGUAGE_CHANGE, {lang: room.language});
        }
        io.to(socket.id).emit(ACTIONS.ROOM_LOCK_STATE, {locked: room.locked});
        const history = room.chat.filter((m) => typeof m.message === 'string');
        if (history.length) {
            io.to(socket.id).emit(ACTIONS.CHAT_HISTORY, {messages: history});
        }
    });

    socket.on(ACTIONS.CODE_CHANGE, ({roomId, code} = {}) => {
        if (!isInRoom(socket, roomId) || !isValidCode(code)) return;
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, {code});
        const room = ensureRoom(roomId);
        room.code = code;
        scheduleSave();
    });

    socket.on(ACTIONS.SYNC_CODE, ({socketId, code} = {}) => {
        if (!isValidCode(code)) return;
        // Only sync code to someone who shares a room with the sender
        const target = io.sockets.sockets.get(socketId);
        if (!target) return;
        const sharesRoom = [...socket.rooms].some(
            (roomId) => roomId !== socket.id && target.rooms.has(roomId)
        );
        if (!sharesRoom) return;
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, {code});
    });

    socket.on(ACTIONS.CURSOR_MOVE, ({roomId, cursor} = {}) => {
        if (!isInRoom(socket, roomId)) return;
        const safeCursor = sanitizeCursor(cursor);
        if (!safeCursor) return;
        socket.in(roomId).emit(ACTIONS.CURSOR_MOVE, {
            socketId: socket.id,
            username: userSocketMap[socket.id],
            cursor: safeCursor,
        });
    });

    socket.on(ACTIONS.LANGUAGE_CHANGE, ({roomId, lang} = {}) => {
        if (!isInRoom(socket, roomId) || !isValidLanguage(lang)) return;
        socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, {lang});
        const room = ensureRoom(roomId);
        room.language = lang;
        scheduleSave();
    });

    socket.on(ACTIONS.RUN_RESULT, ({roomId, output} = {}) => {
        if (!isInRoom(socket, roomId)) return;
        const safeOutput = sanitizeOutput(output);
        if (!safeOutput) return;
        socket.in(roomId).emit(ACTIONS.RUN_RESULT, {output: safeOutput});
    });

    socket.on(ACTIONS.CHAT_MESSAGE, ({roomId, message} = {}) => {
        if (!isInRoom(socket, roomId)) return;
        if (typeof message !== 'string' || !message.trim()) return;
        const room = ensureRoom(roomId);
        const entry = {
            username: userSocketMap[socket.id],
            message: message.slice(0, MAX_CHAT_LENGTH),
            ts: Date.now(),
        };
        room.chat.push(entry);
        if (room.chat.length > 200) room.chat.shift();
        scheduleSave();
        io.in(roomId).emit(ACTIONS.CHAT_MESSAGE, entry);
    });

    socket.on(ACTIONS.KICK_USER, ({roomId, targetSocketId} = {}) => {
        if (!isInRoom(socket, roomId) || !isRoomOwner(socket, roomId)) return;

        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (!targetSocket || !targetSocket.rooms.has(roomId)) return;

        io.to(targetSocketId).emit(ACTIONS.KICKED, {reason: 'Removed by room owner'});
        targetSocket.leave(roomId);
        socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
            socketId: targetSocketId,
            username: userSocketMap[targetSocketId],
        });
    });

    socket.on(ACTIONS.TOGGLE_LOCK, ({roomId} = {}) => {
        if (!isInRoom(socket, roomId) || !isRoomOwner(socket, roomId)) return;
        const room = rooms[roomId];
        if (!room) return;

        room.locked = !room.locked;
        scheduleSave();
        io.in(roomId).emit(ACTIONS.ROOM_LOCK_STATE, {locked: room.locked});
    });

    socket.on('disconnecting', () => {
        const joinedRooms = [...socket.rooms];
        joinedRooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

const PORT = process.env.PORT || process.env.SERVER_PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
