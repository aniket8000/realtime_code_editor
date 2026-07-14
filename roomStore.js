const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');

const rooms = {};

function loadRooms() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    try {
        if (fs.existsSync(DATA_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            Object.assign(rooms, parsed);
        }
    } catch (err) {
        console.warn('Failed to load persisted rooms, starting fresh:', err.message);
    }
}

function ensureRoom(roomId) {
    if (!rooms[roomId]) {
        rooms[roomId] = {
            code: null,
            language: null,
            ownerUsername: null,
            locked: false,
            chat: [],
        };
    }
    return rooms[roomId];
}

let saveTimer = null;
function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        fs.writeFile(DATA_FILE, JSON.stringify(rooms), (err) => {
            if (err) console.warn('Failed to persist rooms:', err.message);
        });
    }, 1000);
}

module.exports = { rooms, loadRooms, ensureRoom, scheduleSave };
