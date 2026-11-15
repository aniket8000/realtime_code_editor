// Live health check: connects fake users to a running server and checks
// every realtime feature plus the security rules.
//
// Usage:
//   npm run healthcheck                      (local server on :5000)
//   npm run healthcheck -- https://your-backend.onrender.com
//
// It creates one throwaway room named "healthcheck-<timestamp>".
const { io } = require('socket.io-client');
const ACTIONS = require('../src/actions/Actions');

const URL = (process.argv[2] || 'http://localhost:5000').replace(/\/$/, '');
const sockets = [];
const results = [];
let failed = 0;

function check(name, ok) {
    if (!ok) failed++;
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    return ok;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function connect() {
    return new Promise((resolve, reject) => {
        const socket = io(URL, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
            timeout: 20000,
        });
        sockets.push(socket);
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });
}

// Resolves with the event payload, or undefined if it doesn't arrive in time.
function waitFor(socket, event, ms = 3000) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(undefined), ms);
        socket.once(event, (data) => {
            clearTimeout(timer);
            resolve(data);
        });
    });
}

async function join(roomId, username, ownerToken) {
    const socket = await connect();
    const token = waitFor(socket, ACTIONS.OWNER_TOKEN, 1500);
    const joined = waitFor(socket, ACTIONS.JOINED);
    socket.emit(ACTIONS.JOIN, { roomId, username, ownerToken });
    return { socket, joined: await joined, token: (await token)?.token };
}

async function run() {
    const health = await fetch(`${URL}/health`);
    check('GET /health returns ok', health.ok && (await health.json()).status === 'ok');

    const roomId = `healthcheck-${Date.now()}`;
    const owner = await join(roomId, 'hc-owner');
    check('first user becomes owner', owner.joined?.isOwner === true);
    check('owner receives an owner token', typeof owner.token === 'string');
    const alice = owner.socket;

    const bobJoinSeen = waitFor(alice, ACTIONS.JOINED);
    const guest = await join(roomId, 'hc-guest');
    const bob = guest.socket;
    check('second user joins as non-owner', guest.joined?.isOwner === false);
    check('owner is told about the new user', (await bobJoinSeen)?.clients.length === 2);

    let received = waitFor(bob, ACTIONS.CODE_CHANGE);
    alice.emit(ACTIONS.CODE_CHANGE, { roomId, code: 'console.log(1)' });
    check('code syncs to others', (await received)?.code === 'console.log(1)');

    received = waitFor(bob, ACTIONS.CURSOR_MOVE);
    alice.emit(ACTIONS.CURSOR_MOVE, { roomId, cursor: { line: 0, ch: 3 } });
    check('cursor position broadcasts', (await received)?.username === 'hc-owner');

    received = waitFor(bob, ACTIONS.LANGUAGE_CHANGE);
    alice.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, lang: 'python' });
    check('language change syncs', (await received)?.lang === 'python');

    received = waitFor(bob, ACTIONS.CHAT_MESSAGE);
    alice.emit(ACTIONS.CHAT_MESSAGE, { roomId, message: 'hi' });
    check('chat message delivered', (await received)?.message === 'hi');

    received = waitFor(bob, ACTIONS.RUN_RESULT);
    alice.emit(ACTIONS.RUN_RESULT, { roomId, output: { stdout: 'x', exitCode: 0 } });
    check('run output shared', (await received)?.output?.stdout === 'x');

    await sleep(1200); // let the server persist the room
    const late = await connect();
    const lateCode = waitFor(late, ACTIONS.CODE_CHANGE);
    const lateChat = waitFor(late, ACTIONS.CHAT_HISTORY);
    late.emit(ACTIONS.JOIN, { roomId, username: 'hc-late' });
    check('late joiner gets saved code', (await lateCode)?.code === 'console.log(1)');
    check('late joiner gets chat history', (await lateChat)?.messages?.length >= 1);
    late.close();

    received = waitFor(alice, ACTIONS.ROOM_LOCK_STATE, 1500);
    bob.emit(ACTIONS.TOGGLE_LOCK, { roomId });
    check('non-owner cannot lock the room', (await received) === undefined);

    received = waitFor(bob, ACTIONS.ROOM_LOCK_STATE);
    alice.emit(ACTIONS.TOGGLE_LOCK, { roomId });
    check('owner can lock the room', (await received)?.locked === true);

    const outsider = await connect();
    const rejected = waitFor(outsider, ACTIONS.JOIN_REJECTED);
    outsider.emit(ACTIONS.JOIN, { roomId, username: 'hc-outsider' });
    check('locked room rejects new users', !!(await rejected));

    const impostorRejected = waitFor(outsider, ACTIONS.JOIN_REJECTED);
    outsider.emit(ACTIONS.JOIN, { roomId, username: 'hc-owner' });
    check("owner's username alone can't enter a locked room", !!(await impostorRejected));

    received = waitFor(alice, ACTIONS.CODE_CHANGE, 2000);
    outsider.emit(ACTIONS.CODE_CHANGE, { roomId, code: 'outsider' });
    const securityFixLive = check('outsider cannot edit a locked room', !(await received));

    received = waitFor(alice, ACTIONS.CHAT_MESSAGE, 2000);
    outsider.emit(ACTIONS.CHAT_MESSAGE, { roomId, message: 'outsider' });
    check('outsider cannot chat in a locked room', !(await received));

    const ownerAgain = await join(roomId, 'hc-owner', owner.token);
    check('owner token re-enters a locked room as owner', ownerAgain.joined?.isOwner === true);
    ownerAgain.socket.close();

    alice.emit(ACTIONS.TOGGLE_LOCK, { roomId });
    await sleep(500);

    const impostor = await join(roomId, 'hc-owner');
    check("owner's username alone doesn't give owner powers", impostor.joined?.isOwner === false);
    received = waitFor(alice, ACTIONS.ROOM_LOCK_STATE, 1500);
    impostor.socket.emit(ACTIONS.TOGGLE_LOCK, { roomId });
    check('impostor cannot lock the room', (await received) === undefined);

    received = waitFor(alice, ACTIONS.CHAT_MESSAGE, 1500);
    bob.emit(ACTIONS.CHAT_MESSAGE, { roomId, message: { bad: 'object' } });
    check('non-text chat messages are rejected', (await received) === undefined);

    const kicked = waitFor(bob, ACTIONS.KICKED);
    alice.emit(ACTIONS.KICK_USER, { roomId, targetSocketId: bob.id });
    check('owner can kick a user', !!(await kicked));
    received = waitFor(alice, ACTIONS.CODE_CHANGE, 2000);
    bob.emit(ACTIONS.CODE_CHANGE, { roomId, code: 'still here' });
    check('kicked user can no longer edit', !(await received));

    // On old code this would really crash the server, so only probe it
    // once the newer security fixes are confirmed to be running.
    if (securityFixLive) {
        const probe = await connect();
        for (const badId of ['__proto__', 'constructor', 'toString']) {
            probe.emit(ACTIONS.JOIN, { roomId: badId, username: 'hc-probe' });
        }
        await sleep(1500);
        let alive = false;
        try {
            alive = (await fetch(`${URL}/health`)).ok;
        } catch {}
        check('server survives special room IDs like "__proto__"', alive);
    } else {
        results.push('SKIP  crash test (server runs old code; it would really crash it)');
    }
}

run()
    .catch((err) => check(`script error: ${err.message}`, false))
    .finally(() => {
        sockets.forEach((socket) => socket.close());
        console.log(`Health check against ${URL}\n`);
        console.log(results.join('\n'));
        console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
        process.exit(failed ? 1 : 0);
    });
