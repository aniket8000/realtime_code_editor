const express = require('express');
const app = express();

const http = require('http');
const path = require('path');
const {Server} = require('socket.io');

const ACTIONS = require('./src/actions/Actions');
const {rooms, loadRooms, ensureRoom, scheduleSave} = require('./roomStore');

loadRooms();

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('build'));
app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

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

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, ({roomId, username}) => {
        const room = ensureRoom(roomId);

        if (room.locked && username !== room.ownerUsername) {
            socket.emit(ACTIONS.JOIN_REJECTED, {reason: 'Room is locked by its owner'});
            return;
        }

        if (!room.ownerUsername) {
            room.ownerUsername = username;
            scheduleSave();
        }

        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({socketId, username: recipientUsername}) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
                isOwner: recipientUsername === room.ownerUsername,
            });
        });

        if (room.code != null) {
            io.to(socket.id).emit(ACTIONS.CODE_CHANGE, {code: room.code});
        }
        if (room.language) {
            io.to(socket.id).emit(ACTIONS.LANGUAGE_CHANGE, {lang: room.language});
        }
        io.to(socket.id).emit(ACTIONS.ROOM_LOCK_STATE, {locked: room.locked});
        if (room.chat.length) {
            io.to(socket.id).emit(ACTIONS.CHAT_HISTORY, {messages: room.chat});
        }
    });

    socket.on(ACTIONS.CODE_CHANGE, ({roomId, code}) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, {code});
        const room = ensureRoom(roomId);
        room.code = code;
        scheduleSave();
    });

    socket.on(ACTIONS.SYNC_CODE, ({socketId, code}) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, {code});
    });

    socket.on(ACTIONS.CURSOR_MOVE, ({roomId, cursor}) => {
        socket.in(roomId).emit(ACTIONS.CURSOR_MOVE, {
            socketId: socket.id,
            username: userSocketMap[socket.id],
            cursor,
        });
    });

    socket.on(ACTIONS.LANGUAGE_CHANGE, ({roomId, lang}) => {
        socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, {lang});
        const room = ensureRoom(roomId);
        room.language = lang;
        scheduleSave();
    });

    socket.on(ACTIONS.RUN_RESULT, ({roomId, output}) => {
        socket.in(roomId).emit(ACTIONS.RUN_RESULT, {output});
    });

    socket.on(ACTIONS.CHAT_MESSAGE, ({roomId, message}) => {
        const room = ensureRoom(roomId);
        const entry = {
            username: userSocketMap[socket.id],
            message,
            ts: Date.now(),
        };
        room.chat.push(entry);
        if (room.chat.length > 200) room.chat.shift();
        scheduleSave();
        io.in(roomId).emit(ACTIONS.CHAT_MESSAGE, entry);
    });

    socket.on(ACTIONS.KICK_USER, ({roomId, targetSocketId}) => {
        const room = rooms[roomId];
        if (!room) return;
        if (userSocketMap[socket.id] !== room.ownerUsername) return;

        io.to(targetSocketId).emit(ACTIONS.KICKED, {reason: 'Removed by room owner'});
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
            targetSocket.leave(roomId);
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: targetSocketId,
                username: userSocketMap[targetSocketId],
            });
        }
    });

    socket.on(ACTIONS.TOGGLE_LOCK, ({roomId}) => {
        const room = rooms[roomId];
        if (!room) return;
        if (userSocketMap[socket.id] !== room.ownerUsername) return;

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

// Serve response in production
app.get('/', (req, res) => {
    const htmlContent = '<h1>Welcome to the code editor server</h1>';
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
});

const PORT = process.env.SERVER_PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));