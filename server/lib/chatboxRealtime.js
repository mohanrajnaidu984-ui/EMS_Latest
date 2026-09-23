'use strict';

const { Server } = require('socket.io');

/** @type {import('socket.io').Server | null} */
let io = null;
let openConnections = 0;

function normalizeSocketEmail(email) {
    return String(email || '')
        .toLowerCase()
        .trim()
        .replace(/@almcg\.com$/i, '@almoayyedcg.com');
}

function chatRoom(requestNo) {
    return `chat:${String(requestNo || '').trim()}`;
}

function userRoom(email) {
    return `user:${normalizeSocketEmail(email)}`;
}

/**
 * Attach Socket.IO to the HTTP server for ChatBox realtime.
 * Production uses polling behind IIS ARR — tune ping/timeouts for long-lived proxy polls.
 * @param {import('http').Server} httpServer
 */
function initChatboxRealtime(httpServer) {
    if (io) return io;

    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

    io = new Server(httpServer, {
        path: '/api/socket.io',
        cors: {
            origin: true,
            credentials: true,
        },
        // Longer pings = fewer IIS ARR long-poll cycles (EMS capacity)
        pingInterval: 25000,
        pingTimeout: 60000,
        connectTimeout: 20000,
        maxHttpBufferSize: 1e6,
        httpCompression: false,
        perMessageDeflate: false,
        allowUpgrades: !isProd,
        transports: isProd ? ['polling'] : ['polling', 'websocket'],
    });

    const maxSockets = Math.max(
        10,
        parseInt(process.env.EMS_CHATBOX_MAX_SOCKETS || '200', 10) || 200
    );
    io.use((socket, next) => {
        try {
            const n =
                typeof io.engine?.clientsCount === 'number'
                    ? io.engine.clientsCount
                    : openConnections;
            if (n >= maxSockets) {
                console.warn(
                    `[ChatBox] rejecting socket — at capacity (${n}/${maxSockets})`
                );
                return next(new Error('chatbox at capacity'));
            }
        } catch (_) {
            /* allow */
        }
        next();
    });

    io.engine.on('connection_error', (err) => {
        console.warn(
            '[ChatBox] engine connection_error',
            err?.code || '',
            err?.message || err
        );
    });

    io.on('connection', (socket) => {
        openConnections += 1;
        if (openConnections === 1 || openConnections % 25 === 0) {
            console.log(`[ChatBox] socket connections open=${openConnections}`);
        }

        socket.on('chatbox:identify', (payload = {}) => {
            try {
                const email = normalizeSocketEmail(payload.email);
                if (!email) return;
                socket.data.email = email;
                socket.join(userRoom(email));
            } catch (err) {
                console.warn('[ChatBox] identify error', err?.message || err);
            }
        });

        socket.on('chatbox:join', (payload = {}) => {
            try {
                const requestNo = String(payload.requestNo || '').trim();
                if (!requestNo) return;
                socket.join(chatRoom(requestNo));
                socket.data.requestNo = requestNo;
            } catch (err) {
                console.warn('[ChatBox] join error', err?.message || err);
            }
        });

        socket.on('chatbox:leave', (payload = {}) => {
            try {
                const requestNo = String(payload.requestNo || '').trim();
                if (!requestNo) return;
                socket.leave(chatRoom(requestNo));
                if (socket.data.requestNo === requestNo) {
                    socket.data.requestNo = null;
                }
            } catch (err) {
                console.warn('[ChatBox] leave error', err?.message || err);
            }
        });

        socket.on('error', (err) => {
            console.warn('[ChatBox] socket error', err?.message || err);
        });

        socket.on('disconnect', (reason) => {
            openConnections = Math.max(0, openConnections - 1);
            if (reason && reason !== 'client namespace' && reason !== 'transport close') {
                console.log(
                    `[ChatBox] disconnect reason=${reason} open=${openConnections}`
                );
            }
        });
    });

    console.log('[ChatBox] Socket.IO realtime ready');
    return io;
}

function getChatboxIo() {
    return io;
}

function getChatboxSocketStats() {
    const engineCount =
        io && io.engine && typeof io.engine.clientsCount === 'number'
            ? io.engine.clientsCount
            : null;
    return {
        openConnections,
        engineClients: engineCount,
        path: '/api/socket.io',
        transports:
            String(process.env.NODE_ENV || '').toLowerCase() === 'production'
                ? ['polling']
                : ['polling', 'websocket'],
    };
}

function emitChatMessagesChanged(requestNo, meta = {}) {
    if (!io || !requestNo) return;
    const { emails: metaEmails, skipRoom, ...rest } = meta || {};
    const payload = {
        requestNo: String(requestNo).trim(),
        ...rest,
        at: Date.now(),
    };
    if (!skipRoom) {
        io.to(chatRoom(requestNo)).emit('chatbox:messages-changed', payload);
    }

    const emails = Array.isArray(metaEmails) ? metaEmails : [];
    const seen = new Set();
    for (const raw of emails) {
        const email = normalizeSocketEmail(raw);
        if (!email || seen.has(email)) continue;
        seen.add(email);
        io.to(userRoom(email)).emit('chatbox:messages-changed', payload);
    }
}

function emitChatGroupsChanged(emails, meta = {}) {
    if (!io) return;
    const list = Array.isArray(emails) ? emails : [];
    const seen = new Set();
    for (const raw of list) {
        const email = normalizeSocketEmail(raw);
        if (!email || seen.has(email)) continue;
        seen.add(email);
        io.to(userRoom(email)).emit('chatbox:groups-changed', {
            requestNo: meta.requestNo ? String(meta.requestNo).trim() : null,
            at: Date.now(),
        });
    }
    if (meta.requestNo) {
        io.to(chatRoom(meta.requestNo)).emit('chatbox:groups-changed', {
            requestNo: String(meta.requestNo).trim(),
            at: Date.now(),
        });
    }
}

module.exports = {
    initChatboxRealtime,
    getChatboxIo,
    getChatboxSocketStats,
    emitChatMessagesChanged,
    emitChatGroupsChanged,
    chatRoom,
    userRoom,
    normalizeSocketEmail,
};
