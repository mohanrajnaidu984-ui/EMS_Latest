import { io } from 'socket.io-client';
import { EMS_CHATBOX_UNREAD_CHANGED } from '../constants/chatboxEvents';

let socket = null;
let identifiedEmail = '';
/** @type {Set<string>} */
const joinedRooms = new Set();

let failCount = 0;
let circuitOpenUntil = 0;
let lastErrorLogAt = 0;
let subscriberCount = 0;

/** Must match server path — rides IIS /api proxy. */
export const CHATBOX_SOCKET_PATH = '/api/socket.io';

/**
 * Feature kill-switch: set VITE_CHATBOX_ENABLED=0 and rebuild to hide ChatBox nav/UI.
 */
export function isChatboxEnabled() {
    const flag = String(import.meta.env.VITE_CHATBOX_ENABLED ?? '1')
        .trim()
        .toLowerCase();
    if (flag === '0' || flag === 'false' || flag === 'no' || flag === 'off') return false;
    return true;
}

/**
 * Kill-switch: set VITE_CHATBOX_REALTIME=0 in production build to disable Socket.IO
 * entirely (ChatBox REST + peek still work; EMS never pays socket cost).
 */
export function isChatboxRealtimeEnabled() {
    const flag = String(import.meta.env.VITE_CHATBOX_REALTIME ?? '1')
        .trim()
        .toLowerCase();
    if (flag === '0' || flag === 'false' || flag === 'no' || flag === 'off') return false;
    return true;
}

function normalizeSocketEmail(email) {
    return String(email || '')
        .toLowerCase()
        .trim()
        .replace(/@almcg\.com$/i, '@almoayyedcg.com');
}

function resolveSocketUrl() {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
}

function shouldUseWebsocketUpgrade() {
    const flag = String(import.meta.env.VITE_SOCKET_IO_WEBSOCKET || '')
        .trim()
        .toLowerCase();
    if (flag === '1' || flag === 'true' || flag === 'yes') return true;
    if (flag === '0' || flag === 'false' || flag === 'no') return false;
    return Boolean(import.meta.env.DEV);
}

function isCircuitOpen() {
    return Date.now() < circuitOpenUntil;
}

/** Read-only: does NOT create a socket (safe for intervals / EMS hot paths). */
export function isChatboxSocketConnected() {
    return !!(socket && socket.connected);
}

/**
 * Tear down socket when leaving ChatBox — frees IIS/Node long-poll slots.
 */
export function disconnectChatboxSocket() {
    joinedRooms.clear();
    identifiedEmail = '';
    failCount = 0;
    circuitOpenUntil = 0;
    subscriberCount = 0;
    if (!socket) return;
    try {
        socket.removeAllListeners();
        socket.disconnect();
    } catch (_) {
        /* ignore */
    }
    socket = null;
}

function ensureSocketInstance() {
    if (typeof window === 'undefined') return null;
    if (!isChatboxRealtimeEnabled()) return null;
    if (socket) return socket;

    const useWs = shouldUseWebsocketUpgrade();
    socket = io(resolveSocketUrl(), {
        path: CHATBOX_SOCKET_PATH,
        transports: useWs ? ['polling', 'websocket'] : ['polling'],
        upgrade: useWs,
        // Connect only when ChatBox subscribes (not on accidental getChatboxSocket)
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 5000,
        reconnectionDelayMax: 60000,
        randomizationFactor: 0.5,
        timeout: 8000,
        withCredentials: true,
        closeOnBeforeunload: true,
        rememberUpgrade: false,
        forceNew: false,
    });

    socket.on('connect', () => {
        failCount = 0;
        circuitOpenUntil = 0;
        if (identifiedEmail) {
            socket.emit('chatbox:identify', { email: identifiedEmail });
        }
        for (const rn of joinedRooms) {
            socket.emit('chatbox:join', { requestNo: rn });
        }
        try {
            window.dispatchEvent(new CustomEvent('ems-chatbox-socket-reconnect'));
        } catch (_) {
            /* ignore */
        }
    });

    socket.on('connect_error', (err) => {
        failCount += 1;
        const msg = String(err?.message || err || 'error');
        const now = Date.now();
        if (now - lastErrorLogAt > 30000) {
            lastErrorLogAt = now;
            console.warn('[ChatBox] socket connect_error', msg);
        }
        // Hard stop after a few failures — do not take down EMS
        if (failCount >= 3) {
            const backoffMs = Math.min(180000, 30000 * Math.min(failCount - 2, 4));
            circuitOpenUntil = Date.now() + backoffMs;
            try {
                socket.io.opts.reconnection = false;
                socket.disconnect();
            } catch (_) {
                /* ignore */
            }
            setTimeout(() => {
                if (!socket || subscriberCount < 1 || isCircuitOpen()) return;
                try {
                    socket.io.opts.reconnection = true;
                    failCount = 0;
                    if (!socket.connected) socket.connect();
                } catch (_) {
                    /* ignore */
                }
            }, backoffMs);
        }
    });

    return socket;
}

export function getChatboxSocket() {
    return ensureSocketInstance();
}

export function identifyChatboxSocket(email) {
    const e = normalizeSocketEmail(email);
    identifiedEmail = e;
    if (!isChatboxRealtimeEnabled() || isCircuitOpen()) return socket;
    const s = ensureSocketInstance();
    if (s && e && s.connected) s.emit('chatbox:identify', { email: e });
    return s;
}

export function joinChatboxRoom(requestNo) {
    const rn = String(requestNo || '').trim();
    if (!rn) return;
    joinedRooms.add(rn);
    if (!isChatboxRealtimeEnabled() || isCircuitOpen()) return;
    const s = socket;
    if (!s || !s.connected) return;
    if (identifiedEmail) s.emit('chatbox:identify', { email: identifiedEmail });
    s.emit('chatbox:join', { requestNo: rn });
}

export function leaveChatboxRoom(requestNo) {
    const rn = String(requestNo || '').trim();
    if (!rn) return;
    joinedRooms.delete(rn);
    if (socket && socket.connected) socket.emit('chatbox:leave', { requestNo: rn });
}

/**
 * Subscribe while ChatBox is mounted. Connects socket on first subscriber;
 * disconnects when last subscriber leaves (ChatBox tab closed).
 */
export function subscribeChatboxRealtime({
    email,
    onMessagesChanged,
    onGroupsChanged,
    onReconnect,
} = {}) {
    if (!isChatboxRealtimeEnabled()) {
        return () => {};
    }

    identifyChatboxSocket(email);
    const s = ensureSocketInstance();
    if (!s) return () => {};

    subscriberCount += 1;
    if (!isCircuitOpen() && !s.connected) {
        try {
            s.io.opts.reconnection = true;
            s.connect();
        } catch (_) {
            /* ignore */
        }
    }

    const handleMessages = (payload) => {
        try {
            window.dispatchEvent(
                new CustomEvent('ems-chatbox-message', { detail: payload })
            );
        } catch (_) {
            /* ignore */
        }
        onMessagesChanged?.(payload);
    };
    const handleGroups = (payload) => {
        onGroupsChanged?.(payload);
        window.dispatchEvent(new Event(EMS_CHATBOX_UNREAD_CHANGED));
    };
    const handleReconnect = () => {
        onReconnect?.();
    };

    s.on('chatbox:messages-changed', handleMessages);
    s.on('chatbox:message', handleMessages);
    s.on('chatbox:groups-changed', handleGroups);
    window.addEventListener('ems-chatbox-socket-reconnect', handleReconnect);

    return () => {
        subscriberCount = Math.max(0, subscriberCount - 1);
        s.off('chatbox:messages-changed', handleMessages);
        s.off('chatbox:message', handleMessages);
        s.off('chatbox:groups-changed', handleGroups);
        window.removeEventListener('ems-chatbox-socket-reconnect', handleReconnect);
        // Last ChatBox view closed → free long-poll slots for the rest of EMS
        if (subscriberCount === 0) {
            disconnectChatboxSocket();
        }
    };
}

export default getChatboxSocket;
