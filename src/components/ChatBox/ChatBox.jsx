import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { EMS_CHATBOX_UNREAD_CHANGED } from '../../constants/chatboxEvents';
import ChatThread from './ChatThread';
import {
    joinChatboxRoom,
    leaveChatboxRoom,
    subscribeChatboxRealtime,
    isChatboxSocketConnected,
    isChatboxRealtimeEnabled,
} from '../../utils/chatboxSocket';
import './ChatBox.css';

const PROJECT_STAGES = [
    'Final Negotiation',
    'Budgetary',
    'Retendered',
    'Job on Hold',
    'Our Price is high',
    'Value Engineering required',
    ...Array.from({ length: 5 }, (_, i) => `We are L${i + 1}`),
    'We are above L5',
    ...Array.from({ length: 5 }, (_, i) => `We are H${i + 1}`),
    'Variation Quote',
    'Main contractor not awarded',
    'Management instructed to provide dry cost',
    'Main Contractor awarded',
    "Client doesn't have budget",
];

function initials(name) {
    const parts = String(name || '?')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatMsgTime(value) {
    if (!value) return '';
    try {
        const d = typeof value === 'string' ? parseISO(value) : new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        if (isToday(d)) return format(d, 'h:mm a');
        if (isYesterday(d)) return 'Yesterday';
        return format(d, 'M/d/yyyy');
    } catch {
        return '';
    }
}

function notifyUnreadChanged() {
    window.dispatchEvent(new Event(EMS_CHATBOX_UNREAD_CHANGED));
}

/** Trim + stable compare — SQL RequestNo often has trailing spaces; sockets emit trimmed. */
function normalizeRequestNo(value) {
    return String(value ?? '').trim();
}

function sameRequestNo(a, b) {
    return normalizeRequestNo(a).toLowerCase() === normalizeRequestNo(b).toLowerCase();
}

/** Stable key for matching optimistic rows to server rows. */
function messageDedupeKey(m) {
    return [
        String(m?.UserID ?? ''),
        String(m?.NoteContent ?? ''),
        String(m?.AttachmentName ?? ''),
        String(m?.ReplyToNoteID ?? ''),
    ].join('|');
}

/**
 * Apply a server message list without wiping in-flight optimistic OR realtime-pushed
 * rows that a racing/stale GET has not seen yet.
 */
function mergeServerMessages(prev, incoming) {
    const list = Array.isArray(incoming) ? incoming : [];
    const prior = Array.isArray(prev) ? prev : [];
    const serverIds = new Set(list.map((m) => String(m.ID)));
    const serverKeys = new Set(list.map(messageDedupeKey));
    const keepLocal = prior.filter((m) => {
        const id = String(m?.ID ?? '');
        if (!id || serverIds.has(id)) return false;
        const isTemp = id.startsWith('temp-') || m?._optimistic;
        const isRealtime = m?._realtime === true;
        if (!isTemp && !isRealtime) return false;
        return !serverKeys.has(messageDedupeKey(m));
    });
    if (!keepLocal.length) return list;
    const merged = [...list, ...keepLocal];
    merged.sort((a, b) => {
        const ta = new Date(a?.CreatedAt || 0).getTime();
        const tb = new Date(b?.CreatedAt || 0).getTime();
        if (ta !== tb) return ta - tb;
        return Number(a?.ID) - Number(b?.ID) || 0;
    });
    return merged;
}

/** Append / reconcile a canonical server message into the open thread. */
function upsertCanonicalMessage(prev, preview, { isOwn }) {
    const list = Array.isArray(prev) ? prev : [];
    if (!preview?.ID) return list;
    const id = String(preview.ID);
    if (list.some((m) => String(m.ID) === id)) {
        return list.map((m) =>
            String(m.ID) === id
                ? {
                      ...m,
                      ...preview,
                      IsOwn: isOwn || m.IsOwn,
                      Reactions: Array.isArray(preview.Reactions)
                          ? preview.Reactions
                          : m.Reactions || [],
                      ReceiptStatus:
                          preview.ReceiptStatus != null
                              ? preview.ReceiptStatus
                              : isOwn
                                ? m.ReceiptStatus || 'sent'
                                : m.ReceiptStatus,
                      _optimistic: false,
                      _realtime: false,
                  }
                : m
        );
    }
    const withoutTemp = list.filter(
        (m) =>
            !(
                (String(m.ID).startsWith('temp-') || m._optimistic) &&
                messageDedupeKey(m) === messageDedupeKey(preview)
            )
    );
    const next = [
        ...withoutTemp,
        {
            ...preview,
            IsOwn: Boolean(isOwn),
            Reactions: Array.isArray(preview.Reactions) ? preview.Reactions : [],
            ReceiptStatus: isOwn ? preview.ReceiptStatus || 'sent' : null,
            _optimistic: false,
            _realtime: true,
        },
    ];
    next.sort((a, b) => {
        const ta = new Date(a?.CreatedAt || 0).getTime();
        const tb = new Date(b?.CreatedAt || 0).getTime();
        if (ta !== tb) return ta - tb;
        return Number(a?.ID) - Number(b?.ID) || 0;
    });
    return next;
}

/** Patch sidebar latest-message / unread from the same realtime payload. */
function patchGroupPreview(groups, requestNo, preview, { isOwn, bumpUnread }) {
    const rn = normalizeRequestNo(requestNo);
    const stamp = preview?.CreatedAt || new Date().toISOString();
    const lastText =
        preview?.NoteContent ||
        (preview?.HasAttachment || preview?.AttachmentName ? '📷 Photo' : '');
    const previewId = preview?.ID != null ? String(preview.ID) : '';
    return (Array.isArray(groups) ? groups : []).map((g) => {
        if (!sameRequestNo(g.RequestNo, rn)) return g;
        // Avoid double-count if the same socket payload is delivered twice
        if (previewId && String(g._lastRealtimeNoteId || '') === previewId) {
            return {
                ...g,
                RequestNo: normalizeRequestNo(g.RequestNo) || g.RequestNo,
                LastMessage: lastText || g.LastMessage,
                LastMessageAt: stamp,
            };
        }
        const unread = Number(g.UnreadCount) || 0;
        return {
            ...g,
            RequestNo: normalizeRequestNo(g.RequestNo) || g.RequestNo,
            LastMessage: lastText || g.LastMessage,
            LastMessageAt: stamp,
            UnreadCount: isOwn ? 0 : bumpUnread ? unread + 1 : unread,
            _lastRealtimeNoteId: previewId || g._lastRealtimeNoteId,
        };
    });
}

/** Append auth email to chatbox asset URLs (avatar / attachments). */
function chatAssetUrl(url, email) {
    if (!url || !email) return url || null;
    const sep = String(url).includes('?') ? '&' : '?';
    return `${url}${sep}email=${encodeURIComponent(email)}`;
}

const ChatBox = ({ openRequestNo }) => {
    const { currentUser } = useAuth();
    const email = String(currentUser?.email || currentUser?.EmailId || '').trim();
    const myName = String(currentUser?.name || currentUser?.FullName || '').trim();

    const [groups, setGroups] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [detail, setDetail] = useState(null);
    const [messages, setMessages] = useState([]);
    const [searchQ, setSearchQ] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchOpen, setSearchOpen] = useState(false);
    const [savingMeta, setSavingMeta] = useState(false);
    const [addMemberEmail, setAddMemberEmail] = useState('');
    const [directory, setDirectory] = useState([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const searchTimer = useRef(null);
    const messagesFetchGen = useRef(0);
    const messagesAbortRef = useRef(null);
    const markReadTimer = useRef(null);
    const selectedIdRef = useRef(null);
    const sendingRef = useRef(false);
    const rootRef = useRef(null);
    const resizingRef = useRef(null);

    const readStoredWidth = (key, fallback) => {
        try {
            const n = Number(localStorage.getItem(key));
            return Number.isFinite(n) && n >= 160 ? n : fallback;
        } catch {
            return fallback;
        }
    };
    const [col1Width, setCol1Width] = useState(() => readStoredWidth('ems-cb-col1-w', 300));
    const [col2Width, setCol2Width] = useState(() => readStoredWidth('ems-cb-col2-w', 260));
    const [isResizing, setIsResizing] = useState(false);
    const col1WidthRef = useRef(col1Width);
    const col2WidthRef = useRef(col2Width);
    col1WidthRef.current = col1Width;
    col2WidthRef.current = col2Width;

    selectedIdRef.current = selectedId;

    const invalidateMessagesFetches = useCallback(() => {
        messagesFetchGen.current += 1;
        if (messagesAbortRef.current) {
            try {
                messagesAbortRef.current.abort();
            } catch (_) {
                /* ignore */
            }
            messagesAbortRef.current = null;
        }
    }, []);

    const memberEmails = useMemo(() => {
        const set = new Set();
        (detail?.members || []).forEach((m) => {
            const e = String(m.EmailId || '')
                .trim()
                .toLowerCase();
            if (e) set.add(e);
        });
        return set;
    }, [detail?.members]);

    const directoryOptions = useMemo(() => {
        return (directory || [])
            .filter((d) => d.EmailId && !memberEmails.has(String(d.EmailId).toLowerCase()))
            .sort((a, b) =>
                String(a.FullName || a.EmailId).localeCompare(
                    String(b.FullName || b.EmailId),
                    undefined,
                    { sensitivity: 'base' }
                )
            );
    }, [directory, memberEmails]);

    useEffect(() => {
        if (!email) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(
                    `/api/chatbox/directory?email=${encodeURIComponent(email)}`,
                    { cache: 'no-store' }
                );
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (!cancelled) setDirectory(Array.isArray(data) ? data : []);
            } catch (err) {
                console.warn('[ChatBox] directory', err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [email]);

    const loadGroups = useCallback(async () => {
        if (!email) return;
        setLoadingGroups(true);
        try {
            const res = await fetch(`/api/chatbox/groups?email=${encodeURIComponent(email)}`, {
                cache: 'no-store',
            });
            if (!res.ok) return;
            const data = await res.json();
            const rows = Array.isArray(data) ? data : [];
            // Always normalize RequestNo so socket payload IDs match the open chat
            setGroups(
                rows.map((g) => ({
                    ...g,
                    RequestNo: normalizeRequestNo(g.RequestNo),
                }))
            );
        } catch (err) {
            console.warn('[ChatBox] groups', err);
        } finally {
            setLoadingGroups(false);
        }
    }, [email]);

    const loadDetail = useCallback(
        async (requestNo) => {
            if (!email || !requestNo) return;
            try {
                const res = await fetch(
                    `/api/chatbox/groups/${encodeURIComponent(requestNo)}?email=${encodeURIComponent(email)}`,
                    { cache: 'no-store' }
                );
                if (!res.ok) {
                    setDetail(null);
                    return;
                }
                setDetail(await res.json());
            } catch (err) {
                console.warn('[ChatBox] detail', err);
            }
        },
        [email]
    );

    const loadMessages = useCallback(
        async (requestNo, { markRead = false, markDelivered = false } = {}) => {
            if (!email || !requestNo) return;
            const gen = ++messagesFetchGen.current;
            if (messagesAbortRef.current) {
                try {
                    messagesAbortRef.current.abort();
                } catch (_) {
                    /* ignore */
                }
            }
            const ac = new AbortController();
            messagesAbortRef.current = ac;
            try {
                // Soft polls must NOT markDelivered (SQL storm → pool exhaustion → API looks down).
                // markRead=1 covers delivered+read when opening a chat.
                let qs = '';
                if (markRead) qs = '&markRead=1';
                else if (markDelivered) qs = '&markDelivered=1';
                else qs = '&markDelivered=0';
                const res = await fetch(
                    `/api/chatbox/groups/${encodeURIComponent(requestNo)}/messages?email=${encodeURIComponent(email)}${qs}`,
                    { cache: 'no-store', signal: ac.signal }
                );
                if (!res.ok) return;
                // Ignore stale responses (poll/socket race) so preview is never wiped
                if (gen !== messagesFetchGen.current) return;
                const data = await res.json();
                if (gen !== messagesFetchGen.current) return;
                // Never wipe optimistic rows that a stale/racing GET has not seen yet
                setMessages((prev) => mergeServerMessages(prev, data));
                if (markRead) {
                    notifyUnreadChanged();
                    setGroups((prev) =>
                        prev.map((g) =>
                            sameRequestNo(g.RequestNo, requestNo) ? { ...g, UnreadCount: 0 } : g
                        )
                    );
                }
            } catch (err) {
                if (err?.name === 'AbortError') return;
                console.warn('[ChatBox] messages', err);
            }
        },
        [email]
    );

    const markChatReadQuiet = useCallback(
        (requestNo) => {
            if (!email || !requestNo) return;
            const rn = normalizeRequestNo(requestNo);
            if (markReadTimer.current) clearTimeout(markReadTimer.current);
            markReadTimer.current = setTimeout(async () => {
                try {
                    await fetch(`/api/chatbox/groups/${encodeURIComponent(rn)}/read`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email }),
                    });
                    notifyUnreadChanged();
                    setGroups((prev) =>
                        prev.map((g) =>
                            sameRequestNo(g.RequestNo, rn) ? { ...g, UnreadCount: 0 } : g
                        )
                    );
                    // Do NOT full-reload the thread here — that stampede shared SQL for all EMS users
                } catch (err) {
                    console.warn('[ChatBox] mark read', err);
                }
            }, 1500);
        },
        [email]
    );

    const selectGroup = useCallback(
        async (requestNo) => {
            const rn = normalizeRequestNo(requestNo);
            setSelectedId(rn);
            await Promise.all([loadDetail(rn), loadMessages(rn, { markRead: true })]);
        },
        [loadDetail, loadMessages]
    );

    const startGroup = useCallback(
        async (requestNo) => {
            if (!email || !requestNo) return;
            try {
                const res = await fetch('/api/chatbox/groups/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, requestNo }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    alert(err.error || 'Could not start chat');
                    return;
                }
                setSearchQ('');
                setSearchResults([]);
                setSearchOpen(false);
                await loadGroups();
                await selectGroup(normalizeRequestNo(requestNo));
                notifyUnreadChanged();
            } catch (err) {
                console.warn('[ChatBox] start', err);
                alert('Could not start chat');
            }
        },
        [email, loadGroups, selectGroup]
    );

    useEffect(() => {
        loadGroups();
        // Fallback only when socket is down — never poll while realtime is healthy
        const t = setInterval(() => {
            if (isChatboxRealtimeEnabled() && isChatboxSocketConnected()) return;
            void loadGroups();
        }, 90000);
        return () => clearInterval(t);
    }, [loadGroups]);

    useEffect(() => {
        if (openRequestNo) {
            void startGroup(openRequestNo);
        }
    }, [openRequestNo]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep latest callbacks in refs so the socket subscription is registered once
    // and never sees a stale selectedId / message list closure.
    const loadGroupsRef = useRef(loadGroups);
    const loadDetailRef = useRef(loadDetail);
    const loadMessagesRef = useRef(loadMessages);
    const markChatReadQuietRef = useRef(markChatReadQuiet);
    const currentUserIdRef = useRef(currentUser?.id);
    loadGroupsRef.current = loadGroups;
    loadDetailRef.current = loadDetail;
    loadMessagesRef.current = loadMessages;
    markChatReadQuietRef.current = markChatReadQuiet;
    currentUserIdRef.current = currentUser?.id;

    useEffect(() => {
        if (!email) return undefined;
        let refreshTimer = null;
        let reconnectTimer = null;
        let groupsReloadTimer = null;
        const scheduleRefresh = (requestNo, { markRead = false, immediate = false } = {}) => {
            const rn = normalizeRequestNo(requestNo);
            if (!rn || !sameRequestNo(selectedIdRef.current, rn)) return;
            if (refreshTimer) clearTimeout(refreshTimer);
            const run = () => {
                void loadMessagesRef.current(rn, { markRead });
            };
            if (immediate) run();
            else refreshTimer = setTimeout(run, 120);
        };

        const applyRealtimeMessage = (payload) => {
            const rn = normalizeRequestNo(payload?.requestNo);
            const reason = String(payload?.reason || '');
            const preview = payload?.preview;
            const myId = currentUserIdRef.current;
            const ownPreview =
                (preview && myId != null && Number(preview.UserID) === Number(myId)) ||
                (payload?.senderUserId != null &&
                    myId != null &&
                    Number(payload.senderUserId) === Number(myId));
            const isActive = rn && sameRequestNo(selectedIdRef.current, rn);

            // Same canonical event drives sidebar for EVERY listener (open or not)
            if (reason === 'message' && preview?.ID) {
                setGroups((prev) =>
                    patchGroupPreview(prev, rn, preview, {
                        isOwn: ownPreview,
                        bumpUnread: !isActive && !ownPreview,
                    })
                );
                // Only wake Header badge SQL when this chat is not open (avoid stampede)
                if (!isActive && !ownPreview) {
                    notifyUnreadChanged();
                }
            } else if (
                reason === 'message' ||
                reason === 'member-add' ||
                reason === 'member-remove'
            ) {
                void loadGroupsRef.current();
            }

            if (!isActive) return;

            // ACTIVE CHAT: push message immediately — do NOT wait for GET / poll
            if (reason === 'message' && preview?.ID) {
                setMessages((prev) =>
                    upsertCanonicalMessage(prev, preview, { isOwn: ownPreview })
                );
                if (!ownPreview) {
                    markChatReadQuietRef.current(rn);
                }
                return;
            }

            // Skip reason:'read' full refresh — was forcing every peer to rebuild the thread
            if (
                reason === 'member-add' ||
                reason === 'member-remove' ||
                reason === 'delete' ||
                reason === 'react' ||
                reason === 'avatar' ||
                reason === 'avatar-clear'
            ) {
                scheduleRefresh(rn, { markRead: false });
            }
            if (reason === 'member-add' || reason === 'member-remove') {
                markChatReadQuietRef.current(rn);
            }
        };

        const unsub = subscribeChatboxRealtime({
            email,
            onMessagesChanged: applyRealtimeMessage,
            onGroupsChanged: (payload) => {
                // Only structural list changes should hit /groups (message path uses preview patch).
                // Debounce to avoid stampedes when multiple groups events arrive together.
                if (groupsReloadTimer) clearTimeout(groupsReloadTimer);
                groupsReloadTimer = setTimeout(() => {
                    void loadGroupsRef.current();
                    const rn = normalizeRequestNo(payload?.requestNo || selectedIdRef.current);
                    if (rn && sameRequestNo(selectedIdRef.current, rn)) {
                        void loadDetailRef.current(rn);
                    }
                }, 800);
            },
            onReconnect: () => {
                // Debounce reconnect storms — many tabs reconnecting at once used to
                // stampede SQL and make the whole API look disconnected.
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(() => {
                    void loadGroupsRef.current();
                    const rn = normalizeRequestNo(selectedIdRef.current);
                    if (rn) void loadMessagesRef.current(rn, { markRead: false, markDelivered: false });
                }, 2000);
            },
        });
        return () => {
            if (refreshTimer) clearTimeout(refreshTimer);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (groupsReloadTimer) clearTimeout(groupsReloadTimer);
            unsub?.();
        };
    }, [email]);

    useEffect(() => {
        if (!selectedId || !email) return undefined;
        joinChatboxRoom(selectedId);

        const rejoin = () => joinChatboxRoom(selectedId);
        const onVis = () => {
            if (document.visibilityState === 'visible') rejoin();
        };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('focus', rejoin);
        // Rejoin less often — every join emit adds ARR/Node chatter for all chatters
        const rejoinTimer = setInterval(rejoin, 60000);

        let peekInFlight = false;
        // Peek ONLY when Socket.IO is down (or realtime kill-switched). Never while connected —
        // peek SQL used to exhaust the shared pool and slow all of EMS.
        const peekMs = isChatboxRealtimeEnabled() ? 5000 : 8000;
        const peekTimer = setInterval(async () => {
            if (sendingRef.current || peekInFlight) return;
            if (typeof document !== 'undefined' && document.hidden) return;
            if (isChatboxRealtimeEnabled() && isChatboxSocketConnected()) return;
            const rn = normalizeRequestNo(selectedIdRef.current);
            if (!rn || !sameRequestNo(rn, selectedId)) return;

            peekInFlight = true;
            try {
                const res = await fetch(
                    `/api/chatbox/groups/${encodeURIComponent(rn)}/messages/peek?email=${encodeURIComponent(email)}`,
                    { cache: 'no-store' }
                );
                if (!res.ok) return;
                const data = await res.json();
                const note = data?.note;
                if (!note?.ID) return;
                const myId = currentUserIdRef.current;
                const isOwn = myId != null && Number(note.UserID) === Number(myId);
                let added = false;
                setMessages((prev) => {
                    const list = Array.isArray(prev) ? prev : [];
                    if (list.some((m) => String(m.ID) === String(note.ID))) return list;
                    added = true;
                    return upsertCanonicalMessage(list, note, { isOwn });
                });
                if (!added) return;
                setGroups((prev) =>
                    patchGroupPreview(prev, rn, note, {
                        isOwn,
                        bumpUnread: false,
                    })
                );
                if (!isOwn) {
                    markChatReadQuietRef.current(rn);
                }
            } catch (err) {
                if (err?.name !== 'AbortError') {
                    /* ignore transient peek errors */
                }
            } finally {
                peekInFlight = false;
            }
        }, peekMs);

        const fullTimer = setInterval(() => {
            if (sendingRef.current) return;
            if (isChatboxRealtimeEnabled() && isChatboxSocketConnected()) return;
            loadMessages(selectedId, { markRead: false, markDelivered: false });
        }, 60000);

        return () => {
            leaveChatboxRoom(selectedId);
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('focus', rejoin);
            clearInterval(rejoinTimer);
            clearInterval(peekTimer);
            clearInterval(fullTimer);
            if (markReadTimer.current) clearTimeout(markReadTimer.current);
        };
    }, [selectedId, email, loadMessages]);

    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (!email || searchQ.trim().length < 2) {
            setSearchResults([]);
            return undefined;
        }
        searchTimer.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/chatbox/search?email=${encodeURIComponent(email)}&q=${encodeURIComponent(searchQ.trim())}`,
                    { cache: 'no-store' }
                );
                if (!res.ok) return;
                const data = await res.json();
                setSearchResults(Array.isArray(data) ? data : []);
                setSearchOpen(true);
            } catch (err) {
                console.warn('[ChatBox] search', err);
            }
        }, 300);
        return () => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
        };
    }, [searchQ, email]);

    const saveMeta = async (patch) => {
        if (!selectedId || !email) return;
        setSavingMeta(true);
        try {
            const res = await fetch(`/api/chatbox/groups/${encodeURIComponent(selectedId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, ...patch }),
            });
            if (!res.ok) return;
            setDetail((d) => (d ? { ...d, ...patch } : d));
            setGroups((prev) =>
                prev.map((g) => (sameRequestNo(g.RequestNo, selectedId) ? { ...g, ...patch } : g))
            );
        } catch (err) {
            console.warn('[ChatBox] save meta', err);
        } finally {
            setSavingMeta(false);
        }
    };

    const addMember = async () => {
        if (!selectedId || !addMemberEmail || !email) return;
        try {
            const res = await fetch(`/api/chatbox/groups/${encodeURIComponent(selectedId)}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, emailId: addMemberEmail }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Could not add member');
                return;
            }
            setAddMemberEmail('');
            await Promise.all([loadDetail(selectedId), loadMessages(selectedId)]);
        } catch (err) {
            console.warn('[ChatBox] add member', err);
        }
    };

    const removeMember = async (member) => {
        if (!selectedId || !email || !member?.CanRemove) return;
        const label = member.SEName || member.EmailId;
        if (!window.confirm(`Remove ${label} from this chat group?`)) return;
        try {
            const res = await fetch(`/api/chatbox/groups/${encodeURIComponent(selectedId)}/members`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    seName: member.SEName || '',
                    emailId: member.EmailId || '',
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Could not remove member');
                return;
            }
            await Promise.all([loadDetail(selectedId), loadMessages(selectedId)]);
        } catch (err) {
            console.warn('[ChatBox] remove member', err);
        }
    };

    const sendMessage = async (e, replyToNoteId, onSent, imageFile = null, contentOverride = null) => {
        e?.preventDefault?.();
        const content = String(contentOverride ?? '').trim();
        if ((!content && !imageFile) || !selectedId || !email) return;

        const requestNo = selectedId;
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimistic = {
            ID: tempId,
            NoteContent: content,
            UserName: myName,
            UserID: currentUser?.id,
            CreatedAt: new Date().toISOString(),
            IsOwn: true,
            IsDeleted: false,
            IsSystem: false,
            ReceiptStatus: 'sending',
            Reactions: [],
            ReplyToNoteID: replyToNoteId || null,
            HasAttachment: !!imageFile,
            AttachmentName: imageFile?.name || null,
            AttachmentUrl: imageFile ? URL.createObjectURL(imageFile) : null,
            _optimistic: true,
        };

        // Cancel in-flight GETs so a pre-send poll cannot overwrite the optimistic row
        invalidateMessagesFetches();
        sendingRef.current = true;
        setMessages((prev) => [...(Array.isArray(prev) ? prev : []), optimistic]);
        onSent?.();

        // Optimistic conversation preview
        setGroups((prev) => {
            const next = (Array.isArray(prev) ? prev : []).map((g) =>
                sameRequestNo(g.RequestNo, requestNo)
                    ? {
                          ...g,
                          LastMessage: content || (imageFile ? '📷 Photo' : g.LastMessage),
                          LastMessageAt: optimistic.CreatedAt,
                          UnreadCount: 0,
                      }
                    : g
            );
            return next;
        });

        // Don't block safety polls for the whole POST — optimistic row is already visible
        const releaseSending = () => {
            sendingRef.current = false;
        };
        const sendingWatchdog = setTimeout(releaseSending, 2500);

        try {
            let res;
            if (imageFile) {
                const fd = new FormData();
                fd.append('email', email);
                fd.append('content', content);
                if (replyToNoteId) fd.append('replyToNoteId', String(replyToNoteId));
                if (currentUser?.id) fd.append('userId', String(currentUser.id));
                if (myName) fd.append('userName', myName);
                const profile = currentUser?.ProfileImage || currentUser?.profileImage || null;
                if (profile) fd.append('userProfileImage', profile);
                fd.append('image', imageFile, imageFile.name || 'image.png');
                res = await fetch(`/api/chatbox/groups/${encodeURIComponent(requestNo)}/messages`, {
                    method: 'POST',
                    body: fd,
                });
            } else {
                res = await fetch(`/api/chatbox/groups/${encodeURIComponent(requestNo)}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email,
                        content,
                        replyToNoteId: replyToNoteId || null,
                        userId: currentUser?.id,
                        userName: myName,
                        userProfileImage: currentUser?.ProfileImage || currentUser?.profileImage || null,
                    }),
                });
            }
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                console.warn('[ChatBox] send failed', errBody);
                setMessages((prev) =>
                    (prev || []).map((m) =>
                        String(m.ID) === tempId
                            ? { ...m, ReceiptStatus: 'failed', _sendFailed: true }
                            : m
                    )
                );
                if (optimistic.AttachmentUrl?.startsWith('blob:')) {
                    URL.revokeObjectURL(optimistic.AttachmentUrl);
                }
                return;
            }
            const data = await res.json();
            if (optimistic.AttachmentUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(optimistic.AttachmentUrl);
            }
            // Prefer single-note upsert (fast POST); fall back to full-list merge for older responses
            invalidateMessagesFetches();
            if (sameRequestNo(selectedIdRef.current, requestNo)) {
                const note = data?.note;
                if (note?.ID) {
                    setMessages((prev) => upsertCanonicalMessage(prev, note, { isOwn: true }));
                } else {
                    const list = Array.isArray(data)
                        ? data
                        : Array.isArray(data?.messages)
                          ? data.messages
                          : null;
                    if (list) {
                        setMessages((prev) => mergeServerMessages(prev, list));
                    }
                }
            }
            void loadGroups();
            notifyUnreadChanged();
        } catch (err) {
            console.warn('[ChatBox] send', err);
            setMessages((prev) =>
                (prev || []).map((m) =>
                    String(m.ID) === tempId
                        ? { ...m, ReceiptStatus: 'failed', _sendFailed: true }
                        : m
                )
            );
            if (optimistic.AttachmentUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(optimistic.AttachmentUrl);
            }
        } finally {
            clearTimeout(sendingWatchdog);
            releaseSending();
        }
    };

    const selectedGroup = groups.find((g) => sameRequestNo(g.RequestNo, selectedId));

    useEffect(() => {
        const onMove = (e) => {
            const job = resizingRef.current;
            if (!job || !rootRef.current) return;
            const rootRect = rootRef.current.getBoundingClientRect();
            const x = e.clientX - rootRect.left;
            const c1 = col1WidthRef.current;
            const c2 = col2WidthRef.current;
            if (job.which === 1) {
                const max = Math.max(220, rootRect.width - c2 - 300);
                const next = Math.min(Math.max(x, 220), Math.min(480, max));
                setCol1Width(next);
            } else if (job.which === 2) {
                const left = c1 + 5;
                const max = Math.max(180, rootRect.width - c1 - 300);
                const next = Math.min(Math.max(x - left, 180), Math.min(420, max));
                setCol2Width(next);
            }
        };
        const onUp = () => {
            if (!resizingRef.current) return;
            resizingRef.current = null;
            setIsResizing(false);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    // Persist widths when drag ends via state settle
    useEffect(() => {
        if (isResizing) return;
        try {
            localStorage.setItem('ems-cb-col1-w', String(col1Width));
            localStorage.setItem('ems-cb-col2-w', String(col2Width));
        } catch {
            /* ignore */
        }
    }, [col1Width, col2Width, isResizing]);

    const startResize = (which) => (e) => {
        e.preventDefault();
        resizingRef.current = { which };
        setIsResizing(true);
    };

    return (
        <div className={`cb-root${isResizing ? ' is-resizing' : ''}`} ref={rootRef}>
            {/* Column 1 — groups + search to start */}
            <div className="cb-col cb-col-1" style={{ width: col1Width }}>
                <div className="cb-header">
                    <h2>Chats</h2>
                </div>
                <div className="cb-search-wrap">
                    <i className="bi bi-search" aria-hidden />
                    <input
                        className="cb-search-input"
                        type="search"
                        placeholder="Search project name to start chat…"
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        onFocus={() => searchResults.length && setSearchOpen(true)}
                        onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                    />
                    {searchOpen && searchResults.length > 0 ? (
                        <div className="cb-search-results" role="listbox">
                            {searchResults.map((r) => (
                                <button
                                    key={r.RequestNo}
                                    type="button"
                                    className="cb-search-item"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => startGroup(r.RequestNo)}
                                >
                                    <strong>{r.ProjectName || r.RequestNo}</strong>
                                    <span>
                                        #{r.RequestNo}
                                        {r.CustomerName ? ` · ${r.CustomerName}` : ''}
                                        {r.AlreadyStarted ? ' · In chats' : ' · Start chat'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
                <div className="cb-group-list">
                    {loadingGroups && !groups.length ? (
                        <div className="cb-empty">Loading…</div>
                    ) : !groups.length ? (
                        <div className="cb-empty">
                            No chats yet.
                            <br />
                            Search a project name above to start a group.
                        </div>
                    ) : (
                        groups.map((g) => {
                            const title = g.ProjectName || `Enquiry ${g.RequestNo}`;
                            const unread = Number(g.UnreadCount) || 0;
                            return (
                                <button
                                    key={g.RequestNo}
                                    type="button"
                                    className={`cb-group-item${sameRequestNo(selectedId, g.RequestNo) ? ' active' : ''}`}
                                    onClick={() => selectGroup(g.RequestNo)}
                                >
                                    <div className="cb-avatar">
                                        {g.GroupAvatarUrl ? (
                                            <img
                                                src={chatAssetUrl(g.GroupAvatarUrl, email)}
                                                alt=""
                                                className="cb-avatar-img"
                                            />
                                        ) : (
                                            initials(title)
                                        )}
                                    </div>
                                    <div className="cb-group-body">
                                        <div className="cb-group-top">
                                            <span className="cb-group-name">{title}</span>
                                            <span className="cb-group-time">
                                                {formatMsgTime(g.LastMessageAt || g.StartedAt)}
                                            </span>
                                        </div>
                                        <div className="cb-group-bottom">
                                            <span className="cb-group-preview">
                                                {g.LastMessage || 'No messages yet'}
                                            </span>
                                            {unread > 0 ? (
                                                <span className="cb-unread">{unread > 99 ? '99+' : unread}</span>
                                            ) : null}
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            <div
                className={`cb-resize${isResizing && resizingRef.current?.which === 1 ? ' is-dragging' : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize chats column"
                onMouseDown={startResize(1)}
            />

            {/* Column 2 — Project Info */}
            <div className="cb-col cb-col-2" style={{ width: col2Width }}>
                <div className="cb-header">
                    <h2>Project Info</h2>
                </div>
                {!selectedId || !detail ? (
                    <div className="cb-empty">Select a chat to view project info and members.</div>
                ) : (
                    <div className="cb-meta-body">
                        <div className="cb-meta-field">
                            <div className="cb-meta-label">Enquiry No.</div>
                            <div className="cb-meta-value">{detail.RequestNo}</div>
                        </div>

                        <div className="cb-meta-field">
                            <div className="cb-meta-label">Project Name</div>
                            <div className="cb-meta-value">{detail.ProjectName || '—'}</div>
                        </div>

                        <div className="cb-meta-field">
                            <div className="cb-meta-label">Consultant Name</div>
                            <div className="cb-meta-value-plain">{detail.ConsultantName || '—'}</div>
                        </div>

                        <div className="cb-meta-field">
                            <div className="cb-meta-label">Job In hand with</div>
                            <select
                                value={detail.ChatJobInHandWith || ''}
                                disabled={savingMeta}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setDetail((d) => (d ? { ...d, ChatJobInHandWith: v } : d));
                                    saveMeta({ ChatJobInHandWith: v });
                                }}
                            >
                                <option value="">— Select contractor —</option>
                                {(detail.quotedContractors || []).map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                                {detail.ChatJobInHandWith &&
                                !(detail.quotedContractors || []).includes(detail.ChatJobInHandWith) ? (
                                    <option value={detail.ChatJobInHandWith}>
                                        {detail.ChatJobInHandWith}
                                    </option>
                                ) : null}
                            </select>
                            {!(detail.quotedContractors || []).length ? (
                                <div className="cb-meta-hint">
                                    No quoted contractors found for this enquiry yet.
                                </div>
                            ) : null}
                        </div>

                        <div className="cb-meta-field">
                            <div className="cb-meta-label">Stage of project</div>
                            <select
                                value={detail.ChatProjectStage || ''}
                                disabled={savingMeta}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setDetail((d) => (d ? { ...d, ChatProjectStage: v } : d));
                                    saveMeta({ ChatProjectStage: v });
                                }}
                            >
                                <option value="">— Select stage —</option>
                                {PROJECT_STAGES.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="cb-meta-field">
                            <div className="cb-meta-label">Members</div>
                            <ul className="cb-member-list">
                                {(detail.members || []).map((m) => (
                                    <li key={(m.EmailId || m.SEName || '').toLowerCase()}>
                                        <span className="cb-member-dot">{initials(m.SEName)}</span>
                                        <span className="cb-member-info">
                                            <span style={{ display: 'block' }}>{m.SEName}</span>
                                            {m.EmailId &&
                                            String(m.EmailId).toLowerCase() !==
                                                String(m.SEName).toLowerCase() ? (
                                                <span className="cb-member-email">{m.EmailId}</span>
                                            ) : null}
                                        </span>
                                        {m.CanRemove ? (
                                            <button
                                                type="button"
                                                className="cb-member-remove"
                                                title="Remove from group"
                                                aria-label={`Remove ${m.SEName}`}
                                                onClick={() => removeMember(m)}
                                            >
                                                <i className="bi bi-x-lg" aria-hidden />
                                            </button>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                            <div className="cb-add-member">
                                <select
                                    value={addMemberEmail}
                                    onChange={(e) => setAddMemberEmail(e.target.value)}
                                >
                                    <option value="">Add member…</option>
                                    {directoryOptions.map((s) => (
                                        <option key={s.EmailId} value={s.EmailId}>
                                            {s.FullName || s.EmailId}
                                        </option>
                                    ))}
                                </select>
                                <button type="button" onClick={addMember} disabled={!addMemberEmail}>
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div
                className={`cb-resize cb-resize-info${isResizing && resizingRef.current?.which === 2 ? ' is-dragging' : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize project info column"
                onMouseDown={startResize(2)}
            />

            {/* Column 3 — chat */}
            <div className="cb-col cb-col-3">
                {!selectedId ? (
                    <div className="cb-placeholder-chat">
                        <i className="bi bi-chat-dots" aria-hidden />
                        <h3 style={{ color: '#41525d', fontWeight: 300 }}>EMS ChatBox</h3>
                        <p>Search a project to start a group, or open a chat from the list.</p>
                    </div>
                ) : (
                    <ChatThread
                        selectedId={selectedId}
                        detail={detail}
                        selectedGroup={selectedGroup}
                        messages={messages}
                        sendMessage={sendMessage}
                        groups={groups}
                        email={email}
                        onMessagesUpdate={setMessages}
                        notifyUnreadChanged={notifyUnreadChanged}
                        loadGroups={loadGroups}
                        loadDetail={loadDetail}
                    />
                )}
            </div>
        </div>
    );
};

export default ChatBox;
