'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { sql } = require('../dbConfig');
const {
    emitChatMessagesChanged,
    emitChatGroupsChanged,
} = require('../lib/chatboxRealtime');
const {
    resolveChatboxAttachmentsBase,
    resolveChatboxUploadDestination,
} = require('../lib/attachmentsRoot');

const normalizeUserEmail = (email) =>
    (email || '')
        .toString()
        .toLowerCase()
        .trim()
        .replace(/@almcg\.com$/i, '@almoayyedcg.com');

const ALLOWED_IMAGE_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
]);

const chatUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const mime = String(file.mimetype || '').toLowerCase();
        if (ALLOWED_IMAGE_MIME.has(mime)) cb(null, true);
        else cb(new Error('Only image files are allowed (JPG, PNG, GIF, WEBP)'));
    },
});

function safeChatFileName(original) {
    const base = path
        .basename(String(original || 'image.png'))
        .replace(/[^\w.\-()+ ]+/g, '_')
        .slice(0, 120);
    return base || 'image.png';
}

function extForMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('png')) return '.png';
    if (m.includes('gif')) return '.gif';
    if (m.includes('webp')) return '.webp';
    return '.jpg';
}

/**
 * Save under \\…\ems app\ChatBox\{RequestNo}\…
 * Stores relative path RequestNo/filename (relative to ChatBox root).
 */
function saveChatImageFile(requestNo, file) {
    const dir = resolveChatboxUploadDestination(requestNo);
    fs.mkdirSync(dir, { recursive: true });
    const orig = safeChatFileName(file.originalname);
    const hasExt = path.extname(orig);
    const name = `${Date.now()}-${hasExt ? orig : `${orig}${extForMime(file.mimetype)}`}`;
    const abs = path.join(dir, name);
    fs.writeFileSync(abs, file.buffer);
    const rn = path.basename(dir);
    return {
        relativePath: `${rn}/${name}`.replace(/\\/g, '/'),
        fileName: orig,
        mime: file.mimetype || 'image/jpeg',
        absolutePath: abs,
        storageRoot: resolveChatboxAttachmentsBase(),
    };
}

function resolveStoredChatAttachment(relativePath) {
    const rel = String(relativePath || '')
        .replace(/^[/\\]+/, '')
        .replace(/\.\./g, '');
    if (!rel) return null;
    // New layout: relative to ChatBox root
    const underChatbox = path.join(resolveChatboxAttachmentsBase(), rel);
    if (fs.existsSync(underChatbox)) return underChatbox;
    // Legacy local fallback: server/uploads/chatbox/...
    const legacy = path.join(__dirname, '..', 'uploads', rel.startsWith('chatbox') ? rel : path.join('chatbox', rel));
    if (fs.existsSync(legacy)) return legacy;
    return underChatbox;
}

/** Group DP under \\…\ChatBox\{RequestNo}\group-dp-… */
function saveGroupAvatarFile(requestNo, file) {
    const dir = resolveChatboxUploadDestination(requestNo);
    fs.mkdirSync(dir, { recursive: true });
    const ext = extForMime(file.mimetype);
    const name = `group-dp-${Date.now()}${ext}`;
    const abs = path.join(dir, name);
    fs.writeFileSync(abs, file.buffer);
    const rn = path.basename(dir);
    return {
        relativePath: `${rn}/${name}`.replace(/\\/g, '/'),
        mime: file.mimetype || 'image/jpeg',
        absolutePath: abs,
    };
}

function groupAvatarApiUrl(requestNo, updatedAt) {
    const rn = encodeURIComponent(String(requestNo || '').trim());
    let url = `/api/chatbox/groups/${rn}/avatar`;
    if (updatedAt) {
        const t = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
        if (!Number.isNaN(t)) url += `?v=${t}`;
    }
    return url;
}

/**
 * Notify chat peers. Room emit is immediate for <1s open-chat delivery.
 * Member user-room fan-out for messages is also immediate (cached emails).
 * Does NOT emit groups-changed on message/read (those stampeded /groups + unread SQL).
 */
const notifyFanoutTimers = new Map();
/** @type {Map<string, { at: number, emails: string[] }>} */
const memberEmailCache = new Map();
const MEMBER_EMAIL_CACHE_MS = 30000;

async function loadChatMemberEmails(requestNo) {
    const rn = String(requestNo || '').trim();
    if (!rn) return [];
    const hit = memberEmailCache.get(rn);
    if (hit && Date.now() - hit.at < MEMBER_EMAIL_CACHE_MS) {
        return hit.emails;
    }
    const emailRes = await sql.query`
        SELECT DISTINCT LTRIM(RTRIM(x.EmailId)) AS EmailId
        FROM (
            SELECT m.EmailId
            FROM ConcernedSE cs
            LEFT JOIN Master_ConcernedSE m
                ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
            WHERE cs.RequestNo = ${rn}
            UNION ALL
            SELECT cm.EmailId
            FROM dbo.EnquiryChatMembers cm
            WHERE cm.RequestNo = ${rn}
        ) x
        WHERE LTRIM(RTRIM(ISNULL(x.EmailId, N''))) <> N''
    `;
    const emails = (emailRes.recordset || [])
        .map((r) => normalizeEmailKey(r.EmailId) || normalizeUserEmail(r.EmailId))
        .filter(Boolean);
    memberEmailCache.set(rn, { at: Date.now(), emails });
    return emails;
}

async function fanoutChatNotifyToMembers(requestNo, meta = {}) {
    const rn = String(requestNo || '').trim();
    if (!rn) return;
    const reason = String(meta.reason || '');
    try {
        const emails = await loadChatMemberEmails(rn);
        if (emails.length) {
            // User-room only — room already got the immediate emit
            emitChatMessagesChanged(rn, { ...meta, emails, skipRoom: true });
        }
        // Structural / list-only events — not every message or read tick
        const needsGroups =
            reason === 'member-add' ||
            reason === 'member-remove' ||
            reason === 'avatar' ||
            reason === 'avatar-clear';
        if (needsGroups) {
            emitChatGroupsChanged(emails, { requestNo: rn });
        }
    } catch (err) {
        console.warn('[ChatBox] realtime notify members', err?.message || err);
    }
}

function notifyChatRoomAndMembers(requestNo, meta = {}) {
    const rn = String(requestNo || '').trim();
    if (!rn) return;
    // 1) Immediate room push — both open chatters must see this within ~1s
    emitChatMessagesChanged(rn, meta);

    const reason = String(meta.reason || '');
    // Receipt/react/delete: room emit is enough; avoid SQL + groups storms
    if (reason === 'read' || reason === 'react' || reason === 'delete') {
        return;
    }

    // 2) Messages: fan out to user rooms immediately (no debounce) for <1s delivery
    //    even if the peer missed chat:join. Email list is cached ~30s.
    if (reason === 'message') {
        void fanoutChatNotifyToMembers(rn, meta);
        return;
    }

    // 3) Structural events: light debounce to coalesce bursts
    const prev = notifyFanoutTimers.get(rn);
    if (prev?.timer) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
        notifyFanoutTimers.delete(rn);
        void fanoutChatNotifyToMembers(rn, meta);
    }, 300);
    notifyFanoutTimers.set(rn, { timer, meta });
}

const norm = (s) => (s || '').toString().trim();

let schemaReady = false;
let schemaEnsurePromise = null;

async function ensureChatboxSchema() {
    if (schemaReady) return;
    if (schemaEnsurePromise) return schemaEnsurePromise;
    schemaEnsurePromise = (async () => {
    const req = new sql.Request();
    await req.query(`
        IF OBJECT_ID('dbo.EnquiryChatGroups', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.EnquiryChatGroups (
                RequestNo NVARCHAR(50) NOT NULL PRIMARY KEY,
                StartedBy NVARCHAR(255) NULL,
                StartedByEmail NVARCHAR(255) NULL,
                StartedAt DATETIME NOT NULL DEFAULT GETDATE()
            );
        END

        IF OBJECT_ID('dbo.EnquiryChatMembers', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.EnquiryChatMembers (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                RequestNo NVARCHAR(50) NOT NULL,
                SEName NVARCHAR(255) NULL,
                EmailId NVARCHAR(255) NULL,
                AddedBy NVARCHAR(255) NULL,
                AddedAt DATETIME NOT NULL DEFAULT GETDATE()
            );
            CREATE INDEX IX_EnquiryChatMembers_RequestNo ON dbo.EnquiryChatMembers (RequestNo);
        END

        /* Chat-only removals — does not change ConcernedSE / enquiry assignment */
        IF OBJECT_ID('dbo.EnquiryChatMemberRemovals', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.EnquiryChatMemberRemovals (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                RequestNo NVARCHAR(50) NOT NULL,
                SEName NVARCHAR(255) NULL,
                EmailId NVARCHAR(255) NULL,
                RemovedBy NVARCHAR(255) NULL,
                RemovedAt DATETIME NOT NULL DEFAULT GETDATE()
            );
            CREATE INDEX IX_EnquiryChatMemberRemovals_RequestNo
                ON dbo.EnquiryChatMemberRemovals (RequestNo);
        END

        IF OBJECT_ID('dbo.EnquiryNoteReads', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.EnquiryNoteReads (
                RequestNo NVARCHAR(50) NOT NULL,
                UserEmail NVARCHAR(255) NOT NULL,
                UserID INT NULL,
                LastReadAt DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT PK_EnquiryNoteReads PRIMARY KEY (RequestNo, UserEmail)
            );
        END

        IF COL_LENGTH('dbo.EnquiryMaster', 'ChatProjectStage') IS NULL
            ALTER TABLE dbo.EnquiryMaster ADD ChatProjectStage NVARCHAR(100) NULL;

        IF COL_LENGTH('dbo.EnquiryMaster', 'ChatMainContractor') IS NULL
            ALTER TABLE dbo.EnquiryMaster ADD ChatMainContractor NVARCHAR(255) NULL;

        IF COL_LENGTH('dbo.EnquiryMaster', 'ChatJobInHandWith') IS NULL
            ALTER TABLE dbo.EnquiryMaster ADD ChatJobInHandWith NVARCHAR(255) NULL;

        IF COL_LENGTH('dbo.EnquiryNotes', 'ReplyToNoteID') IS NULL
            ALTER TABLE dbo.EnquiryNotes ADD ReplyToNoteID INT NULL;
        IF COL_LENGTH('dbo.EnquiryNotes', 'ForwardedFromNoteID') IS NULL
            ALTER TABLE dbo.EnquiryNotes ADD ForwardedFromNoteID INT NULL;
        IF COL_LENGTH('dbo.EnquiryNotes', 'IsDeleted') IS NULL
            ALTER TABLE dbo.EnquiryNotes ADD IsDeleted BIT NOT NULL DEFAULT 0;
        IF COL_LENGTH('dbo.EnquiryNotes', 'IsSystem') IS NULL
            ALTER TABLE dbo.EnquiryNotes ADD IsSystem BIT NOT NULL DEFAULT 0;
        IF COL_LENGTH('dbo.EnquiryNotes', 'AttachmentPath') IS NULL
            ALTER TABLE dbo.EnquiryNotes ADD AttachmentPath NVARCHAR(500) NULL;
        IF COL_LENGTH('dbo.EnquiryNotes', 'AttachmentName') IS NULL
            ALTER TABLE dbo.EnquiryNotes ADD AttachmentName NVARCHAR(255) NULL;
        IF COL_LENGTH('dbo.EnquiryNotes', 'AttachmentMime') IS NULL
            ALTER TABLE dbo.EnquiryNotes ADD AttachmentMime NVARCHAR(100) NULL;

        IF OBJECT_ID('dbo.EnquiryNoteMessageStatus', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.EnquiryNoteMessageStatus (
                NoteID INT NOT NULL,
                UserEmail NVARCHAR(255) NOT NULL,
                DeliveredAt DATETIME NULL,
                ReadAt DATETIME NULL,
                CONSTRAINT PK_EnquiryNoteMessageStatus PRIMARY KEY (NoteID, UserEmail)
            );
            CREATE INDEX IX_EnquiryNoteMessageStatus_Note ON dbo.EnquiryNoteMessageStatus (NoteID);
        END

        IF OBJECT_ID('dbo.EnquiryNoteReactions', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.EnquiryNoteReactions (
                NoteID INT NOT NULL,
                UserEmail NVARCHAR(255) NOT NULL,
                UserName NVARCHAR(255) NULL,
                Emoji NVARCHAR(32) NOT NULL,
                CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT PK_EnquiryNoteReactions PRIMARY KEY (NoteID, UserEmail)
            );
        END
    `);

    // Separate batches — SQL Server can mis-compile multi-IF ALTER ADD in one batch
    const addCol = async (col, ddl) => {
        const check = await new sql.Request().query(`
            SELECT COL_LENGTH('dbo.EnquiryChatGroups', '${col}') AS Len
        `);
        if (check.recordset?.[0]?.Len == null) {
            await new sql.Request().query(ddl);
        }
    };
    await addCol(
        'GroupAvatarPath',
        `ALTER TABLE dbo.EnquiryChatGroups ADD GroupAvatarPath NVARCHAR(500) NULL`
    );
    await addCol(
        'GroupAvatarMime',
        `ALTER TABLE dbo.EnquiryChatGroups ADD GroupAvatarMime NVARCHAR(100) NULL`
    );
    await addCol(
        'GroupAvatarUpdatedAt',
        `ALTER TABLE dbo.EnquiryChatGroups ADD GroupAvatarUpdatedAt DATETIME NULL`
    );

    schemaReady = true;
    })().finally(() => {
        if (!schemaReady) schemaEnsurePromise = null;
    });
    return schemaEnsurePromise;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function isOwnNoteRow(note, user) {
    if (!note || !user) return false;
    if (user.id != null && Number(note.UserID) === Number(user.id)) return true;
    return (
        norm(note.UserName).toLowerCase() === norm(user.fullName).toLowerCase()
    );
}

/** Set-based delivery receipts — never N+1 MERGEs (those made polls take ~30–60s). */
async function markMessagesDelivered(requestNo, userEmail, noteIds) {
    if (!userEmail) return;
    const ids = (noteIds || []).filter((id) => id != null && Number.isFinite(Number(id)));
    if (!ids.length) return;

    const CHUNK = 400;
    for (let offset = 0; offset < ids.length; offset += CHUNK) {
        const chunk = ids.slice(offset, offset + CHUNK);
        const req = new sql.Request();
        req.input('userEmail', sql.NVarChar, userEmail);
        const valuesSql = chunk
            .map((id, i) => {
                req.input(`nid${i}`, sql.Int, Number(id));
                return `(@nid${i})`;
            })
            .join(',');
        await req.query(`
            MERGE dbo.EnquiryNoteMessageStatus AS t
            USING (
                SELECT v.NoteID, @userEmail AS UserEmail
                FROM (VALUES ${valuesSql}) AS v(NoteID)
            ) AS s
            ON t.NoteID = s.NoteID AND LOWER(t.UserEmail) = LOWER(s.UserEmail)
            WHEN MATCHED AND t.DeliveredAt IS NULL THEN
                UPDATE SET DeliveredAt = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (NoteID, UserEmail, DeliveredAt, ReadAt)
                VALUES (s.NoteID, s.UserEmail, GETDATE(), NULL);
        `);
    }
}

async function insertSystemMemberNote(requestNo, actorUser, content) {
    const text = String(content || '').trim();
    if (!text || !requestNo) return;
    await sql.query`
        INSERT INTO EnquiryNotes (
            EnquiryID, UserID, UserName, UserProfileImage, NoteContent,
            ReplyToNoteID, ForwardedFromNoteID, IsDeleted, IsSystem, CreatedAt
        )
        VALUES (
            ${String(requestNo).trim()},
            ${actorUser?.id || 0},
            ${actorUser?.fullName || 'System'},
            NULL,
            ${text},
            NULL, NULL, 0, 1, GETDATE()
        )
    `;
}

/** Set-based read receipts — one MERGE for the whole thread (was N+1 per note). */
async function markMessagesRead(requestNo, userEmail, userId) {
    if (!requestNo || !userEmail) return;
    const rn = String(requestNo).trim();
    await sql.query`
        MERGE dbo.EnquiryNoteMessageStatus AS t
        USING (
            SELECT n.ID AS NoteID, ${userEmail} AS UserEmail
            FROM EnquiryNotes n
            WHERE LTRIM(RTRIM(CAST(n.EnquiryID AS NVARCHAR(50)))) = LTRIM(RTRIM(${rn}))
              AND ISNULL(n.IsDeleted, 0) = 0
              AND ISNULL(n.IsSystem, 0) = 0
        ) AS s
        ON t.NoteID = s.NoteID AND LOWER(t.UserEmail) = LOWER(s.UserEmail)
        WHEN MATCHED THEN
            UPDATE SET DeliveredAt = COALESCE(t.DeliveredAt, GETDATE()),
                       ReadAt = GETDATE()
        WHEN NOT MATCHED THEN
            INSERT (NoteID, UserEmail, DeliveredAt, ReadAt)
            VALUES (s.NoteID, s.UserEmail, GETDATE(), GETDATE());
    `;
    await sql.query`
        MERGE dbo.EnquiryNoteReads AS t
        USING (SELECT ${rn} AS RequestNo, ${userEmail} AS UserEmail) AS s
        ON t.RequestNo = s.RequestNo AND LOWER(t.UserEmail) = LOWER(s.UserEmail)
        WHEN MATCHED THEN UPDATE SET LastReadAt = GETDATE(), UserID = ${userId || null}
        WHEN NOT MATCHED THEN
            INSERT (RequestNo, UserEmail, UserID, LastReadAt)
            VALUES (s.RequestNo, s.UserEmail, ${userId || null}, GETDATE());
    `;
}

async function buildMessagesPayload(requestNo, user, { markDelivered = false, markRead = false } = {}) {
    const rn = String(requestNo || '').trim();
    const { members } = await loadEnquiryChatMemberList(rn);
    const memberEmails = members
        .map((m) => normalizeEmailKey(m.EmailId))
        .filter(Boolean);

    const notesRes = await sql.query`
        SELECT
            n.*,
            rp.NoteContent AS ReplyContent,
            rp.UserName AS ReplyUserName,
            rp.IsDeleted AS ReplyIsDeleted
        FROM EnquiryNotes n
        LEFT JOIN EnquiryNotes rp ON rp.ID = n.ReplyToNoteID
        WHERE LTRIM(RTRIM(CAST(n.EnquiryID AS NVARCHAR(50)))) = LTRIM(RTRIM(${rn}))
        ORDER BY n.CreatedAt ASC
    `;
    const notes = notesRes.recordset || [];

    if (markRead) {
        await markMessagesRead(rn, user.email, user.id);
    } else if (markDelivered) {
        const toDeliver = notes
            .filter((n) => !n.IsSystem && !isOwnNoteRow(n, user))
            .map((n) => n.ID);
        // Don't block the message list on receipt writes (was N+1 and made polls ~1 min)
        void markMessagesDelivered(rn, user.email, toDeliver).catch((err) =>
            console.warn('[ChatBox] mark delivered', err)
        );
    }

    const noteIds = notes.map((n) => n.ID).filter(Boolean);
    let statusRows = [];
    let reactionRows = [];
    if (noteIds.length) {
        const req = new sql.Request();
        const idParams = noteIds.map((id, i) => {
            req.input(`nid${i}`, sql.Int, id);
            return `@nid${i}`;
        });
        statusRows = (
            await req.query(`
                SELECT NoteID, UserEmail, DeliveredAt, ReadAt
                FROM dbo.EnquiryNoteMessageStatus
                WHERE NoteID IN (${idParams.join(',')})
            `)
        ).recordset || [];
        const req2 = new sql.Request();
        noteIds.forEach((id, i) => req2.input(`nid${i}`, sql.Int, id));
        reactionRows = (
            await req2.query(`
                SELECT NoteID, UserEmail, UserName, Emoji, CreatedAt
                FROM dbo.EnquiryNoteReactions
                WHERE NoteID IN (${idParams.join(',')})
            `)
        ).recordset || [];
    }

    const statusByNote = new Map();
    for (const s of statusRows) {
        if (!statusByNote.has(s.NoteID)) statusByNote.set(s.NoteID, []);
        statusByNote.get(s.NoteID).push({
            UserEmail: normalizeEmailKey(s.UserEmail),
            DeliveredAt: s.DeliveredAt,
            ReadAt: s.ReadAt,
        });
    }
    const reactionsByNote = new Map();
    for (const r of reactionRows) {
        if (!reactionsByNote.has(r.NoteID)) reactionsByNote.set(r.NoteID, []);
        reactionsByNote.get(r.NoteID).push(r);
    }

    const emailToName = new Map();
    members.forEach((m) => {
        const e = normalizeEmailKey(m.EmailId);
        if (e) emailToName.set(e, m.SEName);
    });

    return notes.map((n) => {
        const isSystem = !!n.IsSystem;
        const own = !isSystem && isOwnNoteRow(n, user);
        const statuses = statusByNote.get(n.ID) || [];
        const senderEmail = members.find(
            (m) => norm(m.SEName).toLowerCase() === norm(n.UserName).toLowerCase()
        )?.EmailId;
        const senderNorm = normalizeEmailKey(senderEmail);
        const recipients = memberEmails.filter((e) => e && e !== senderNorm);
        const deliveredCount = statuses.filter((s) => s.DeliveredAt && recipients.includes(s.UserEmail)).length;
        const readCount = statuses.filter((s) => s.ReadAt && recipients.includes(s.UserEmail)).length;
        const totalRecipients = recipients.length;

        let receiptStatus = null;
        if (!isSystem && own && totalRecipients > 0) {
            if (readCount >= totalRecipients) receiptStatus = 'read_all';
            else if (deliveredCount >= 1) receiptStatus = 'delivered';
            else receiptStatus = 'sent';
        } else if (!isSystem && own) {
            receiptStatus = 'sent';
        }

        const hasAttachment = !!(n.AttachmentPath && !n.IsDeleted);
        return {
            ...n,
            IsDeleted: !!n.IsDeleted,
            IsSystem: isSystem,
            IsOwn: own,
            HasAttachment: hasAttachment,
            AttachmentUrl: hasAttachment
                ? `/api/chatbox/groups/${encodeURIComponent(rn)}/messages/${n.ID}/attachment`
                : null,
            AttachmentName: n.AttachmentName || null,
            AttachmentMime: n.AttachmentMime || null,
            ReplyPreview:
                !isSystem && n.ReplyToNoteID
                    ? {
                          ID: n.ReplyToNoteID,
                          UserName: n.ReplyUserName,
                          Content: n.ReplyIsDeleted
                              ? 'This message was deleted'
                              : n.ReplyContent,
                      }
                    : null,
            Reactions: isSystem ? [] : reactionsByNote.get(n.ID) || [],
            ReceiptStatus: receiptStatus,
            DeliveredCount: deliveredCount,
            ReadCount: readCount,
            TotalRecipients: totalRecipients,
        };
    });
}

/** CC emails shown by default must not include these (still addable via Add member). */
const DEFAULT_EXCLUDED_CHAT_EMAILS = new Set([
    'lohidas@almoayyedcg.com',
    'mathews@almoayyedcg.com',
    'hala@almoayyedcg.com',
]);

function normalizeEmailKey(email) {
    return normalizeUserEmail(email);
}

function isExcludedDefaultChatEmail(email) {
    const e = normalizeEmailKey(email);
    return e && DEFAULT_EXCLUDED_CHAT_EMAILS.has(e);
}

/** Prefer one row per person (email if present, else name). */
function dedupeMembers(rows) {
    const sourceRank = { ConcernedSE: 1, CC: 2, ChatMember: 3, Creator: 4 };
    const byKey = new Map();
    for (const row of rows || []) {
        const email = normalizeEmailKey(row.EmailId || '');
        if (email && isExcludedDefaultChatEmail(email)) continue;
        const name = norm(row.SEName) || email;
        if (!name) continue;
        const key = email || name.toLowerCase();
        const rank = sourceRank[row.Source] || 9;
        const prev = byKey.get(key);
        if (!prev) {
            byKey.set(key, {
                SEName: name,
                EmailId: email || '',
                Source: row.Source || '',
                _rank: rank,
            });
            continue;
        }
        if (!prev.EmailId && email) prev.EmailId = email;
        if (name && prev.SEName === prev.EmailId && name !== email) prev.SEName = name;
        if (rank < prev._rank) {
            prev.Source = row.Source || prev.Source;
            prev._rank = rank;
            if (name) prev.SEName = name;
        }
    }
    return [...byKey.values()]
        .map(({ _rank, ...rest }) => rest)
        .sort((a, b) => a.SEName.localeCompare(b.SEName));
}

/**
 * Default members = ConcernedSE + CCMailIds (resolved), minus excluded emails.
 * Manually added EnquiryChatMembers are included too.
 */
async function loadEnquiryChatMemberList(requestNo) {
    const rn = String(requestNo || '').trim();
    const membersRes = await sql.query`
        SELECT
            LTRIM(RTRIM(x.SEName)) AS SEName,
            LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(x.EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')))) AS EmailId,
            x.Source
        FROM (
            SELECT cs.SEName, m.EmailId, N'ConcernedSE' AS Source
            FROM ConcernedSE cs
            LEFT JOIN Master_ConcernedSE m
                ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
            WHERE cs.RequestNo = ${rn}
            UNION ALL
            SELECT cm.SEName, cm.EmailId, N'ChatMember'
            FROM dbo.EnquiryChatMembers cm
            WHERE cm.RequestNo = ${rn}
        ) x
        WHERE LTRIM(RTRIM(ISNULL(x.SEName, N''))) <> N''
           OR LTRIM(RTRIM(ISNULL(x.EmailId, N''))) <> N''
    `;

    const ccRes = await sql.query`
        SELECT ISNULL(mef.CCMailIds, N'') AS CCMailIds
        FROM EnquiryFor ef
        INNER JOIN Master_EnquiryFor mef
            ON ef.ItemName = mef.ItemName
            OR ef.ItemName LIKE '%- ' + mef.ItemName
            OR ef.ItemName LIKE '%-' + mef.ItemName
        WHERE ef.RequestNo = ${rn}
    `;

    const ccEmails = [];
    const addableExcluded = [];
    for (const row of ccRes.recordset || []) {
        for (const part of String(row.CCMailIds || '').split(/[,;]/)) {
            const e = normalizeEmailKey(part);
            if (!e) continue;
            if (isExcludedDefaultChatEmail(e)) {
                if (!addableExcluded.includes(e)) addableExcluded.push(e);
                continue;
            }
            if (!ccEmails.includes(e)) ccEmails.push(e);
        }
    }

    const ccMemberRows = [];
    if (ccEmails.length) {
        const req = new sql.Request();
        const emailParams = ccEmails.map((e, i) => {
            req.input(`e${i}`, sql.NVarChar, e);
            return `@e${i}`;
        });
        const resolved = await req.query(`
            SELECT
                LTRIM(RTRIM(FullName)) AS FullName,
                LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')))) AS EmailId
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                IN (${emailParams.join(',')})
        `);
        const byEmail = new Map(
            (resolved.recordset || []).map((r) => [normalizeEmailKey(r.EmailId), r.FullName])
        );
        for (const email of ccEmails) {
            ccMemberRows.push({
                SEName: byEmail.get(email) || email,
                EmailId: email,
                Source: 'CC',
            });
        }
    }

    const removedRes = await sql.query`
        SELECT
            LTRIM(RTRIM(ISNULL(SEName, N''))) AS SEName,
            LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')))) AS EmailId
        FROM dbo.EnquiryChatMemberRemovals
        WHERE RequestNo = ${rn}
    `;
    const removedEmails = new Set();
    const removedNames = new Set();
    for (const row of removedRes.recordset || []) {
        const e = normalizeEmailKey(row.EmailId);
        if (e) removedEmails.add(e);
        const n = norm(row.SEName).toLowerCase();
        if (n) removedNames.add(n);
    }

    const isRemoved = (m) => {
        const e = normalizeEmailKey(m.EmailId);
        if (e && removedEmails.has(e)) return true;
        const n = norm(m.SEName).toLowerCase();
        if (n && removedNames.has(n)) return true;
        return false;
    };

    return {
        members: dedupeMembers([...(membersRes.recordset || []), ...ccMemberRows])
            .filter((m) => !isRemoved(m))
            .map((m) => ({
                ...m,
                /** Any chat member may remove anyone (including Concerned SE / CC) from the chat only */
                CanRemove: true,
            })),
        addableExcludedEmails: addableExcluded,
        ccEmails,
    };
}

router.use(async (_req, _res, next) => {
    try {
        await ensureChatboxSchema();
        next();
    } catch (err) {
        console.error('[ChatBox] schema ensure failed:', err);
        next(err);
    }
});

async function resolveCurrentUser(userEmail) {
    const normalizedEmail = normalizeUserEmail(userEmail);
    if (!normalizedEmail) return null;
    const userRes = await sql.query`
        SELECT TOP 1 ID, FullName, Roles, EmailId, ProfileImage
        FROM Master_ConcernedSE
        WHERE LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
            = ${normalizedEmail}
    `;
    if (!userRes.recordset?.length) return null;
    const row = userRes.recordset[0];
    const roles = String(row.Roles || '')
        .split(',')
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);
    return {
        id: row.ID,
        email: normalizedEmail,
        fullName: norm(row.FullName),
        roles,
        isAdmin: roles.includes('admin') || roles.includes('system'),
        profileImage: row.ProfileImage || null,
    };
}

/** SQL predicate: E = EnquiryMaster alias. Params: @userEmail, @userName */
function accessPredicateSql() {
    return `
        (
            @isAdmin = 1
            OR UPPER(LTRIM(RTRIM(ISNULL(E.CreatedBy, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@userName, N''))))
            OR EXISTS (
                SELECT 1 FROM ConcernedSE cs
                WHERE cs.RequestNo = E.RequestNo
                  AND UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@userName, N''))))
            )
            OR EXISTS (
                SELECT 1 FROM dbo.EnquiryChatMembers cm
                WHERE cm.RequestNo = E.RequestNo
                  AND (
                    UPPER(LTRIM(RTRIM(ISNULL(cm.SEName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@userName, N''))))
                    OR LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(cm.EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                        = LOWER(LTRIM(RTRIM(ISNULL(@userEmail, N''))))
                  )
            )
            OR EXISTS (
                SELECT 1
                FROM EnquiryFor ef
                INNER JOIN Master_EnquiryFor mef
                    ON ef.ItemName = mef.ItemName
                    OR ef.ItemName LIKE '%- ' + mef.ItemName
                    OR ef.ItemName LIKE '%-' + mef.ItemName
                WHERE ef.RequestNo = E.RequestNo
                  AND (
                    ',' + REPLACE(REPLACE(LOWER(ISNULL(mef.CCMailIds, N'')), N' ', N''), N';', N',') + ','
                        LIKE '%,' + LOWER(LTRIM(RTRIM(ISNULL(@userEmail, N'')))) + ',%'
                    OR ',' + REPLACE(REPLACE(LOWER(ISNULL(mef.CommonMailIds, N'')), N' ', N''), N';', N',') + ','
                        LIKE '%,' + LOWER(LTRIM(RTRIM(ISNULL(@userEmail, N'')))) + ',%'
                  )
            )
        )
    `;
}

function bindUser(req, user) {
    req.input('userEmail', sql.NVarChar, user.email);
    req.input('userName', sql.NVarChar, user.fullName);
    req.input('isAdmin', sql.Bit, user.isAdmin ? 1 : 0);
    req.input('userId', sql.Int, user.id != null ? user.id : null);
}

async function userCanAccessEnquiry(user, requestNo) {
    if (!user || !requestNo) return false;
    if (user.isAdmin) return true;
    const req = new sql.Request();
    bindUser(req, user);
    req.input('requestNo', sql.NVarChar, String(requestNo));
    const res = await req.query(`
        SELECT TOP 1 1 AS Ok
        FROM EnquiryMaster E
        WHERE E.RequestNo = @requestNo
          AND ${accessPredicateSql()}
    `);
    return !!(res.recordset && res.recordset[0]);
}

async function isGroupStarted(requestNo) {
    const res = await sql.query`
        SELECT TOP 1 1 AS Ok FROM dbo.EnquiryChatGroups WHERE RequestNo = ${String(requestNo)}
    `;
    return !!(res.recordset && res.recordset[0]);
}

/** Unread notes for one enquiry (exclude own notes by UserID or UserName). */
function unreadCountExpr() {
    return `
        (
            SELECT COUNT(*)
            FROM EnquiryNotes n
            WHERE LTRIM(RTRIM(CAST(n.EnquiryID AS NVARCHAR(50)))) = LTRIM(RTRIM(E.RequestNo))
              AND ISNULL(n.IsSystem, 0) = 0
              AND ISNULL(n.IsDeleted, 0) = 0
              AND (
                r.LastReadAt IS NULL
                OR n.CreatedAt > r.LastReadAt
              )
              AND NOT (
                (@userId IS NOT NULL AND n.UserID = @userId)
                OR UPPER(LTRIM(RTRIM(ISNULL(n.UserName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@userName, N''))))
              )
        )
    `;
}

// GET /api/chatbox/directory — all Master_ConcernedSE emails for Add member
router.get('/directory', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });

        const result = await sql.query`
            SELECT
                LTRIM(RTRIM(ISNULL(FullName, N''))) AS FullName,
                LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')))) AS EmailId
            FROM Master_ConcernedSE
            WHERE LTRIM(RTRIM(ISNULL(EmailId, N''))) <> N''
            ORDER BY FullName, EmailId
        `;
        const seen = new Set();
        const rows = [];
        for (const r of result.recordset || []) {
            const email = normalizeEmailKey(r.EmailId);
            if (!email || seen.has(email)) continue;
            seen.add(email);
            rows.push({
                FullName: norm(r.FullName) || email,
                EmailId: email,
            });
        }
        res.json(rows);
    } catch (err) {
        console.error('[ChatBox] directory', err);
        res.status(500).json({ error: 'Failed to load directory' });
    }
});

// GET /api/chatbox/unread-total
const unreadTotalCache = new Map(); // email -> { at, count }
const UNREAD_TOTAL_CACHE_MS = 12000;

router.get('/unread-total', async (req, res) => {
    try {
        const emailKey = String(req.query.email || '')
            .toLowerCase()
            .trim();
        const cached = emailKey ? unreadTotalCache.get(emailKey) : null;
        if (cached && Date.now() - cached.at < UNREAD_TOTAL_CACHE_MS) {
            return res.json({ count: cached.count });
        }
        const user = await resolveCurrentUser(req.query.email);
        if (!user) return res.json({ count: 0 });
        const request = new sql.Request();
        bindUser(request, user);
        const result = await request.query(`
            SELECT ISNULL(SUM(UnreadCnt), 0) AS TotalUnread
            FROM (
                SELECT ${unreadCountExpr()} AS UnreadCnt
                FROM dbo.EnquiryChatGroups g
                INNER JOIN EnquiryMaster E ON E.RequestNo = g.RequestNo
                LEFT JOIN dbo.EnquiryNoteReads r
                    ON r.RequestNo = E.RequestNo
                   AND LOWER(LTRIM(RTRIM(r.UserEmail))) = LOWER(LTRIM(RTRIM(@userEmail)))
                WHERE ${accessPredicateSql()}
            ) x
        `);
        const count = Number(result.recordset?.[0]?.TotalUnread) || 0;
        if (emailKey) {
            unreadTotalCache.set(emailKey, { at: Date.now(), count });
            if (unreadTotalCache.size > 500) {
                const cutoff = Date.now() - UNREAD_TOTAL_CACHE_MS;
                for (const [k, v] of unreadTotalCache) {
                    if (v.at < cutoff) unreadTotalCache.delete(k);
                }
            }
        }
        res.json({ count });
    } catch (err) {
        console.error('[ChatBox] unread-total', err);
        res.status(500).json({ error: 'Failed to fetch unread total' });
    }
});

// GET /api/chatbox/groups — started groups only
router.get('/groups', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const request = new sql.Request();
        bindUser(request, user);
        const result = await request.query(`
            SELECT
                E.RequestNo,
                E.ProjectName,
                E.CustomerName,
                E.ChatMainContractor,
                E.ChatProjectStage,
                g.StartedAt,
                g.StartedBy,
                g.GroupAvatarPath,
                g.GroupAvatarUpdatedAt,
                (
                    SELECT TOP 1 n.NoteContent
                    FROM EnquiryNotes n
                    WHERE LTRIM(RTRIM(CAST(n.EnquiryID AS NVARCHAR(50)))) = LTRIM(RTRIM(E.RequestNo))
                    ORDER BY n.CreatedAt DESC
                ) AS LastMessage,
                (
                    SELECT TOP 1 n.CreatedAt
                    FROM EnquiryNotes n
                    WHERE LTRIM(RTRIM(CAST(n.EnquiryID AS NVARCHAR(50)))) = LTRIM(RTRIM(E.RequestNo))
                    ORDER BY n.CreatedAt DESC
                ) AS LastMessageAt,
                ${unreadCountExpr()} AS UnreadCount,
                (
                    SELECT COUNT(DISTINCT SEName)
                    FROM (
                        SELECT LTRIM(RTRIM(cs.SEName)) AS SEName FROM ConcernedSE cs WHERE cs.RequestNo = E.RequestNo
                        UNION
                        SELECT LTRIM(RTRIM(cm.SEName)) FROM dbo.EnquiryChatMembers cm
                        WHERE cm.RequestNo = E.RequestNo AND LTRIM(RTRIM(ISNULL(cm.SEName, N''))) <> N''
                        UNION
                        SELECT LTRIM(RTRIM(E.CreatedBy)) WHERE LTRIM(RTRIM(ISNULL(E.CreatedBy, N''))) <> N''
                    ) m
                    WHERE LTRIM(RTRIM(ISNULL(SEName, N''))) <> N''
                ) AS MemberCount
            FROM dbo.EnquiryChatGroups g
            INNER JOIN EnquiryMaster E ON E.RequestNo = g.RequestNo
            LEFT JOIN dbo.EnquiryNoteReads r
                ON r.RequestNo = E.RequestNo
               AND LOWER(LTRIM(RTRIM(r.UserEmail))) = LOWER(LTRIM(RTRIM(@userEmail)))
            WHERE ${accessPredicateSql()}
            ORDER BY ISNULL(
                (
                    SELECT TOP 1 n.CreatedAt
                    FROM EnquiryNotes n
                    WHERE LTRIM(RTRIM(CAST(n.EnquiryID AS NVARCHAR(50)))) = LTRIM(RTRIM(E.RequestNo))
                    ORDER BY n.CreatedAt DESC
                ),
                g.StartedAt
            ) DESC
        `);
        const rows = (result.recordset || []).map((g) => {
            const hasDp = !!g.GroupAvatarPath;
            const requestNo = String(g.RequestNo || '').trim();
            return {
                ...g,
                RequestNo: requestNo,
                GroupAvatarUrl: hasDp
                    ? groupAvatarApiUrl(requestNo, g.GroupAvatarUpdatedAt)
                    : null,
            };
        });
        res.json(rows);
    } catch (err) {
        console.error('[ChatBox] groups', err);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// GET /api/chatbox/search?q=
router.get('/search', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const q = norm(req.query.q);
        if (q.length < 2) return res.json([]);

        const request = new sql.Request();
        bindUser(request, user);
        request.input('q', sql.NVarChar, `%${q}%`);
        const result = await request.query(`
            SELECT TOP 25
                E.RequestNo,
                E.ProjectName,
                E.CustomerName,
                CASE WHEN g.RequestNo IS NULL THEN 0 ELSE 1 END AS AlreadyStarted
            FROM EnquiryMaster E
            LEFT JOIN dbo.EnquiryChatGroups g ON g.RequestNo = E.RequestNo
            WHERE ${accessPredicateSql()}
              AND (
                E.ProjectName LIKE @q
                OR CAST(E.RequestNo AS NVARCHAR(50)) LIKE @q
              )
            ORDER BY
                CASE WHEN g.RequestNo IS NULL THEN 1 ELSE 0 END,
                E.ProjectName
        `);
        res.json(result.recordset || []);
    } catch (err) {
        console.error('[ChatBox] search', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// POST /api/chatbox/groups/start
router.post('/groups/start', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.body?.email || req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.body.requestNo || '').trim();
        if (!requestNo) return res.status(400).json({ error: 'requestNo required' });

        const allowed = await userCanAccessEnquiry(user, requestNo);
        if (!allowed) return res.status(403).json({ error: 'Not allowed to start chat for this enquiry' });

        const exists = await sql.query`
            SELECT TOP 1 RequestNo, ProjectName, CustomerName, ConsultantName,
                   ChatMainContractor, ChatProjectStage, ChatJobInHandWith, CreatedBy
            FROM EnquiryMaster WHERE RequestNo = ${requestNo}
        `;
        if (!exists.recordset?.length) return res.status(404).json({ error: 'Enquiry not found' });
        const enq = exists.recordset[0];

        await sql.query`
            IF NOT EXISTS (SELECT 1 FROM dbo.EnquiryChatGroups WHERE RequestNo = ${requestNo})
            BEGIN
                INSERT INTO dbo.EnquiryChatGroups (RequestNo, StartedBy, StartedByEmail, StartedAt)
                VALUES (${requestNo}, ${user.fullName}, ${user.email}, GETDATE())
            END
        `;

        // Seed chat members from ConcernedSE (idempotent-ish)
        await sql.query`
            INSERT INTO dbo.EnquiryChatMembers (RequestNo, SEName, EmailId, AddedBy, AddedAt)
            SELECT
                cs.RequestNo,
                LTRIM(RTRIM(cs.SEName)),
                m.EmailId,
                ${user.fullName},
                GETDATE()
            FROM ConcernedSE cs
            LEFT JOIN Master_ConcernedSE m
                ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
            WHERE cs.RequestNo = ${requestNo}
              AND LTRIM(RTRIM(ISNULL(cs.SEName, N''))) <> N''
              AND NOT EXISTS (
                SELECT 1 FROM dbo.EnquiryChatMembers cm
                WHERE cm.RequestNo = cs.RequestNo
                  AND UPPER(LTRIM(RTRIM(ISNULL(cm.SEName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
              )
        `;

        if (enq.CreatedBy) {
            await sql.query`
                IF NOT EXISTS (
                    SELECT 1 FROM dbo.EnquiryChatMembers
                    WHERE RequestNo = ${requestNo}
                      AND UPPER(LTRIM(RTRIM(ISNULL(SEName, N'')))) = UPPER(LTRIM(RTRIM(${String(enq.CreatedBy)})))
                )
                INSERT INTO dbo.EnquiryChatMembers (RequestNo, SEName, EmailId, AddedBy, AddedAt)
                SELECT ${requestNo}, ${String(enq.CreatedBy)}, m.EmailId, ${user.fullName}, GETDATE()
                FROM Master_ConcernedSE m
                WHERE UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(${String(enq.CreatedBy)})))
            `;
        }

        res.json({
            RequestNo: enq.RequestNo,
            ProjectName: enq.ProjectName,
            CustomerName: enq.CustomerName,
            ChatMainContractor: enq.ChatMainContractor || '',
            ChatJobInHandWith: enq.ChatJobInHandWith || '',
            ChatProjectStage: enq.ChatProjectStage || '',
            ConsultantName: enq.ConsultantName || '',
            started: true,
        });
    } catch (err) {
        console.error('[ChatBox] start', err);
        res.status(500).json({ error: 'Failed to start group' });
    }
});

// GET /api/chatbox/groups/:requestNo
router.get('/groups/:requestNo', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!(await isGroupStarted(requestNo))) {
            return res.status(404).json({ error: 'Chat group not started' });
        }

        const enqRes = await sql.query`
            SELECT RequestNo, ProjectName, CustomerName, ConsultantName,
                   ChatMainContractor, ChatProjectStage, ChatJobInHandWith, CreatedBy
            FROM EnquiryMaster WHERE RequestNo = ${requestNo}
        `;
        const enq = enqRes.recordset?.[0];
        if (!enq) return res.status(404).json({ error: 'Enquiry not found' });

        const avatarRes = await sql.query`
            SELECT GroupAvatarPath, GroupAvatarMime, GroupAvatarUpdatedAt
            FROM dbo.EnquiryChatGroups
            WHERE RequestNo = ${requestNo}
        `;
        const avatarRow = avatarRes.recordset?.[0] || {};

        const { members, addableExcludedEmails, ccEmails } = await loadEnquiryChatMemberList(requestNo);

        const quotedRes = await sql.query`
            SELECT DISTINCT LTRIM(RTRIM(ISNULL(EQ.ToName, N''))) AS ContractorName
            FROM EnquiryQuotes EQ
            WHERE LTRIM(RTRIM(CAST(EQ.RequestNo AS NVARCHAR(50)))) = LTRIM(RTRIM(${requestNo}))
              AND LTRIM(RTRIM(ISNULL(EQ.ToName, N''))) <> N''
            ORDER BY ContractorName
        `;
        const quotedContractors = (quotedRes.recordset || [])
            .map((r) => String(r.ContractorName || '').trim())
            .filter(Boolean);

        const hasDp = !!avatarRow.GroupAvatarPath;
        res.json({
            ...enq,
            ChatJobInHandWith: enq.ChatJobInHandWith || '',
            ChatMainContractor: enq.ChatMainContractor || '',
            GroupAvatarPath: avatarRow.GroupAvatarPath || null,
            GroupAvatarUrl: hasDp
                ? groupAvatarApiUrl(requestNo, avatarRow.GroupAvatarUpdatedAt)
                : null,
            members,
            ccEmails,
            addableExcludedEmails,
            quotedContractors,
        });
    } catch (err) {
        console.error('[ChatBox] group detail', err);
        res.status(500).json({ error: 'Failed to load group' });
    }
});

// POST /api/chatbox/groups/:requestNo/avatar — change group DP
router.post('/groups/:requestNo/avatar', (req, res, next) => {
    return chatUpload.single('avatar')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'Upload failed' });
        }
        next();
    });
}, async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.body?.email || req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!(await isGroupStarted(requestNo))) {
            return res.status(404).json({ error: 'Chat group not started' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'avatar image required' });
        }

        let saved;
        try {
            saved = saveGroupAvatarFile(requestNo, req.file);
        } catch (writeErr) {
            console.error('[ChatBox] save group avatar', writeErr);
            return res.status(500).json({
                error: 'Failed to save group photo to ChatBox share',
                detail: writeErr.message,
            });
        }

        const prev = await sql.query`
            SELECT GroupAvatarPath FROM dbo.EnquiryChatGroups WHERE RequestNo = ${requestNo}
        `;
        const oldPath = prev.recordset?.[0]?.GroupAvatarPath;
        if (oldPath && oldPath !== saved.relativePath) {
            try {
                const oldAbs = resolveStoredChatAttachment(oldPath);
                if (oldAbs && fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
            } catch (_) {
                /* ignore cleanup */
            }
        }

        await sql.query`
            UPDATE dbo.EnquiryChatGroups
            SET GroupAvatarPath = ${saved.relativePath},
                GroupAvatarMime = ${saved.mime},
                GroupAvatarUpdatedAt = GETDATE()
            WHERE RequestNo = ${requestNo}
        `;

        const updated = await sql.query`
            SELECT GroupAvatarUpdatedAt FROM dbo.EnquiryChatGroups WHERE RequestNo = ${requestNo}
        `;
        const updatedAt = updated.recordset?.[0]?.GroupAvatarUpdatedAt;

        await insertSystemMemberNote(
            requestNo,
            user,
            `${user.fullName} changed this group's icon`
        );
        void notifyChatRoomAndMembers(requestNo, { reason: 'avatar' });

        res.json({
            success: true,
            GroupAvatarUrl: groupAvatarApiUrl(requestNo, updatedAt),
        });
    } catch (err) {
        console.error('[ChatBox] post avatar', err);
        res.status(500).json({ error: 'Failed to update group photo' });
    }
});

// GET /api/chatbox/groups/:requestNo/avatar
router.get('/groups/:requestNo/avatar', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const rowRes = await sql.query`
            SELECT GroupAvatarPath, GroupAvatarMime
            FROM dbo.EnquiryChatGroups
            WHERE RequestNo = ${requestNo}
        `;
        const row = rowRes.recordset?.[0];
        if (!row?.GroupAvatarPath) {
            return res.status(404).json({ error: 'No group photo' });
        }
        const abs = resolveStoredChatAttachment(row.GroupAvatarPath);
        if (!abs || !fs.existsSync(abs)) {
            return res.status(404).json({ error: 'File missing' });
        }
        if (row.GroupAvatarMime) res.type(row.GroupAvatarMime);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.sendFile(path.resolve(abs));
    } catch (err) {
        console.error('[ChatBox] get avatar', err);
        res.status(500).json({ error: 'Failed to load group photo' });
    }
});

// DELETE /api/chatbox/groups/:requestNo/avatar — reset to initials
router.delete('/groups/:requestNo/avatar', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.body?.email || req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!(await isGroupStarted(requestNo))) {
            return res.status(404).json({ error: 'Chat group not started' });
        }

        const prev = await sql.query`
            SELECT GroupAvatarPath FROM dbo.EnquiryChatGroups WHERE RequestNo = ${requestNo}
        `;
        const oldPath = prev.recordset?.[0]?.GroupAvatarPath;
        await sql.query`
            UPDATE dbo.EnquiryChatGroups
            SET GroupAvatarPath = NULL,
                GroupAvatarMime = NULL,
                GroupAvatarUpdatedAt = GETDATE()
            WHERE RequestNo = ${requestNo}
        `;
        if (oldPath) {
            try {
                const oldAbs = resolveStoredChatAttachment(oldPath);
                if (oldAbs && fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
            } catch (_) {
                /* ignore */
            }
        }
        void notifyChatRoomAndMembers(requestNo, { reason: 'avatar-clear' });
        res.json({ success: true, GroupAvatarUrl: null });
    } catch (err) {
        console.error('[ChatBox] delete avatar', err);
        res.status(500).json({ error: 'Failed to remove group photo' });
    }
});

// PATCH /api/chatbox/groups/:requestNo
router.patch('/groups/:requestNo', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.body?.email || req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!(await isGroupStarted(requestNo))) {
            return res.status(404).json({ error: 'Chat group not started' });
        }

        const stage = req.body.ChatProjectStage != null ? String(req.body.ChatProjectStage) : null;
        const contractor = req.body.ChatMainContractor != null ? String(req.body.ChatMainContractor) : null;
        const jobInHand =
            req.body.ChatJobInHandWith != null ? String(req.body.ChatJobInHandWith) : null;

        const request = new sql.Request();
        request.input('requestNo', sql.NVarChar, requestNo);
        request.input('stage', sql.NVarChar, stage);
        request.input('contractor', sql.NVarChar, contractor);
        request.input('jobInHand', sql.NVarChar, jobInHand);
        await request.query(`
            UPDATE EnquiryMaster
            SET
                ChatProjectStage = CASE WHEN @stage IS NULL THEN ChatProjectStage ELSE @stage END,
                ChatMainContractor = CASE WHEN @contractor IS NULL THEN ChatMainContractor ELSE @contractor END,
                ChatJobInHandWith = CASE WHEN @jobInHand IS NULL THEN ChatJobInHandWith ELSE @jobInHand END
            WHERE RequestNo = @requestNo
        `);
        res.json({ success: true });
    } catch (err) {
        console.error('[ChatBox] patch group', err);
        res.status(500).json({ error: 'Failed to update group' });
    }
});

// POST /api/chatbox/groups/:requestNo/members
router.post('/groups/:requestNo/members', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.body?.email || req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!(await isGroupStarted(requestNo))) {
            return res.status(404).json({ error: 'Chat group not started' });
        }

        const seName = norm(req.body.seName || req.body.SEName);
        let emailId = normalizeUserEmail(req.body.emailId || req.body.EmailId || '');

        if (!seName && !emailId) {
            return res.status(400).json({ error: 'seName or emailId required' });
        }

        const hadChatRemoval = async (name, email) => {
            const n = norm(name);
            const e = normalizeUserEmail(email || '') || '';
            const r = await sql.query`
                SELECT TOP 1 1 AS Ok
                FROM dbo.EnquiryChatMemberRemovals
                WHERE RequestNo = ${requestNo}
                  AND (
                    (
                      ${n} <> N''
                      AND UPPER(LTRIM(RTRIM(ISNULL(SEName, N'')))) = UPPER(LTRIM(RTRIM(${n})))
                    )
                    OR (
                      ${e} <> N''
                      AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                          = ${e}
                    )
                  )
            `;
            return !!(r.recordset && r.recordset[0]);
        };

        const clearChatRemoval = async (name, email) => {
            const n = norm(name);
            const e = normalizeUserEmail(email || '') || '';
            await sql.query`
                DELETE FROM dbo.EnquiryChatMemberRemovals
                WHERE RequestNo = ${requestNo}
                  AND (
                    (
                      ${n} <> N''
                      AND UPPER(LTRIM(RTRIM(ISNULL(SEName, N'')))) = UPPER(LTRIM(RTRIM(${n})))
                    )
                    OR (
                      ${e} <> N''
                      AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                          = ${e}
                    )
                  )
            `;
        };

        const ensureChatMemberRow = async (name, email) => {
            const emailNorm = normalizeUserEmail(email || '') || '';
            const exists = await sql.query`
                SELECT TOP 1 1 AS Ok FROM dbo.EnquiryChatMembers
                WHERE RequestNo = ${requestNo}
                  AND (
                    UPPER(LTRIM(RTRIM(ISNULL(SEName, N'')))) = UPPER(LTRIM(RTRIM(${name})))
                    OR (
                      ${emailNorm} <> N''
                      AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                          = ${emailNorm}
                    )
                  )
            `;
            if (exists.recordset?.length) return false;
            await sql.query`
                INSERT INTO dbo.EnquiryChatMembers (RequestNo, SEName, EmailId, AddedBy, AddedAt)
                VALUES (${requestNo}, ${name}, ${email || null}, ${user.fullName}, GETDATE())
            `;
            return true;
        };

        let name;
        let email;

        if (!seName && emailId) {
            const lookup = await sql.query`
                SELECT TOP 1 FullName, EmailId FROM Master_ConcernedSE
                WHERE LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                    = ${emailId}
            `;
            if (!lookup.recordset?.length) return res.status(404).json({ error: 'User not found' });
            name = lookup.recordset[0].FullName;
            email = lookup.recordset[0].EmailId || emailId;
        } else {
            const mRes = await sql.query`
                SELECT TOP 1 FullName, EmailId FROM Master_ConcernedSE
                WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${seName})))
            `;
            email = emailId || (mRes.recordset?.[0]?.EmailId || null);
            name = mRes.recordset?.[0]?.FullName || seName;
        }

        const wasRemoved = await hadChatRemoval(name, email);
        const inserted = await ensureChatMemberRow(name, email);
        await clearChatRemoval(name, email);

        if (inserted || wasRemoved) {
            await insertSystemMemberNote(
                requestNo,
                user,
                `${user.fullName} added ${name}`
            );
            void notifyChatRoomAndMembers(requestNo, { reason: 'member-add' });
            return res.json({ success: true, seName: name, added: true });
        }

        res.json({ success: true, seName: name, added: false });
    } catch (err) {
        console.error('[ChatBox] add member', err);
        res.status(500).json({ error: 'Failed to add member' });
    }
});

// DELETE /api/chatbox/groups/:requestNo/members — any chat member; ConcernedSE/CC stay on enquiry
router.delete('/groups/:requestNo/members', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.body?.email || req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!(await isGroupStarted(requestNo))) {
            return res.status(404).json({ error: 'Chat group not started' });
        }

        const seName = norm(req.body?.seName || req.body?.SEName || req.query.seName);
        const emailId = normalizeUserEmail(req.body?.emailId || req.body?.EmailId || req.query.emailId || '');
        if (!seName && !emailId) {
            return res.status(400).json({ error: 'seName or emailId required' });
        }

        const { members } = await loadEnquiryChatMemberList(requestNo);
        const target = members.find((m) => {
            const nameMatch =
                seName &&
                String(m.SEName || '')
                    .toLowerCase() === seName.toLowerCase();
            const emailMatch =
                emailId && normalizeEmailKey(m.EmailId) === emailId;
            return nameMatch || emailMatch;
        });
        if (!target) return res.status(404).json({ error: 'Member not found' });

        const targetLabel = target.SEName || target.EmailId || 'member';
        const targetEmail = normalizeEmailKey(target.EmailId) || emailId || '';
        const targetName = norm(target.SEName) || seName || '';

        await sql.query`
            DELETE FROM dbo.EnquiryChatMembers
            WHERE RequestNo = ${requestNo}
              AND (
                (
                  ${targetName} <> N''
                  AND UPPER(LTRIM(RTRIM(ISNULL(SEName, N'')))) = UPPER(LTRIM(RTRIM(${targetName})))
                )
                OR (
                  ${targetEmail} <> N''
                  AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                      = ${targetEmail}
                )
              )
        `;

        const alreadyRemoved = await sql.query`
            SELECT TOP 1 1 AS Ok
            FROM dbo.EnquiryChatMemberRemovals
            WHERE RequestNo = ${requestNo}
              AND (
                (
                  ${targetName} <> N''
                  AND UPPER(LTRIM(RTRIM(ISNULL(SEName, N'')))) = UPPER(LTRIM(RTRIM(${targetName})))
                )
                OR (
                  ${targetEmail} <> N''
                  AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                      = ${targetEmail}
                )
              )
        `;
        if (!alreadyRemoved.recordset?.length) {
            await sql.query`
                INSERT INTO dbo.EnquiryChatMemberRemovals (RequestNo, SEName, EmailId, RemovedBy, RemovedAt)
                VALUES (${requestNo}, ${targetName || null}, ${targetEmail || null}, ${user.fullName}, GETDATE())
            `;
        }

        await insertSystemMemberNote(
            requestNo,
            user,
            `${user.fullName} removed ${targetLabel}`
        );

        void notifyChatRoomAndMembers(requestNo, { reason: 'member-remove' });
        res.json({ success: true });
    } catch (err) {
        console.error('[ChatBox] remove member', err);
        res.status(500).json({ error: 'Failed to remove member' });
    }
});

// POST /api/chatbox/groups/:requestNo/read
router.post('/groups/:requestNo/read', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.body?.email || req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await markMessagesRead(requestNo, user.email, user.id);
        // Receipt-only — do NOT notifyChatRoomAndMembers (that stampeded groups/unread SQL)
        emitChatMessagesChanged(requestNo, { reason: 'read' });
        res.json({ success: true });
    } catch (err) {
        console.error('[ChatBox] mark read', err);
        res.status(500).json({ error: 'Failed to mark read' });
    }
});

// GET /api/chatbox/groups/:requestNo/messages
router.get('/groups/:requestNo/messages', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!(await isGroupStarted(requestNo))) {
            return res.status(404).json({ error: 'Chat group not started' });
        }
        const markRead = req.query.markRead === '1' || req.query.markRead === 'true';
        // Default OFF — every 15s soft poll used to markDelivered and exhausted SQL under ChatBox load.
        // Opt in with markDelivered=1; markRead already covers delivered+read.
        const markDelivered =
            !markRead &&
            (req.query.markDelivered === '1' || req.query.markDelivered === 'true');
        const payload = await buildMessagesPayload(requestNo, user, {
            markDelivered,
            markRead,
        });
        // Receipt-only push: clients must refresh WITHOUT markRead to avoid loops
        if (markRead) {
            // Receipt-only; avoid emitChatGroupsChanged (Header/ChatBox SQL stampede)
            emitChatMessagesChanged(requestNo, { reason: 'read' });
        }
        res.json(payload);
    } catch (err) {
        console.error('[ChatBox] messages', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// GET /api/chatbox/groups/:requestNo/messages/peek — lightweight latest note (safety net)
/** @type {Map<string, { at: number, ok: boolean }>} */
const peekAccessCache = new Map();
const PEEK_ACCESS_TTL_MS = 60000;

router.get('/groups/:requestNo/messages/peek', async (req, res) => {
    try {
        const emailRaw = String(req.query.email || '').trim();
        const requestNo = String(req.params.requestNo || '').trim();
        if (!emailRaw || !requestNo) {
            return res.status(400).json({ error: 'email and requestNo required' });
        }
        const cacheKey = `${normalizeEmailKey(emailRaw) || emailRaw.toLowerCase()}|${requestNo}`;
        const cached = peekAccessCache.get(cacheKey);
        const cacheFresh = cached && Date.now() - cached.at < PEEK_ACCESS_TTL_MS;
        if (!cacheFresh) {
            const user = await resolveCurrentUser(emailRaw);
            if (!user) return res.status(401).json({ error: 'User not found' });
            if (!(await userCanAccessEnquiry(user, requestNo))) {
                peekAccessCache.set(cacheKey, { at: Date.now(), ok: false });
                return res.status(403).json({ error: 'Access denied' });
            }
            peekAccessCache.set(cacheKey, { at: Date.now(), ok: true });
        } else if (!cached.ok) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Single cheap query — no isGroupStarted / no full access predicate on every peek
        const noteRes = await sql.query`
            SELECT TOP 1
                ID, NoteContent, UserName, UserID, CreatedAt,
                ReplyToNoteID, ForwardedFromNoteID,
                AttachmentPath, AttachmentName, AttachmentMime,
                IsDeleted, IsSystem
            FROM EnquiryNotes
            WHERE LTRIM(RTRIM(CAST(EnquiryID AS NVARCHAR(50)))) = LTRIM(RTRIM(${requestNo}))
              AND ISNULL(IsDeleted, 0) = 0
            ORDER BY CreatedAt DESC, ID DESC
        `;
        const n = noteRes.recordset?.[0];
        if (!n) return res.json({ note: null });

        res.json({
            note: {
                ID: n.ID,
                NoteContent: n.NoteContent,
                UserName: n.UserName,
                UserID: n.UserID,
                CreatedAt: n.CreatedAt ? new Date(n.CreatedAt).toISOString() : null,
                ReplyToNoteID: n.ReplyToNoteID,
                ForwardedFromNoteID: n.ForwardedFromNoteID,
                HasAttachment: !!n.AttachmentPath,
                AttachmentName: n.AttachmentName || null,
                AttachmentMime: n.AttachmentMime || null,
                AttachmentUrl: n.AttachmentPath
                    ? `/api/chatbox/groups/${encodeURIComponent(requestNo)}/messages/${n.ID}/attachment`
                    : null,
                IsDeleted: !!n.IsDeleted,
                IsSystem: !!n.IsSystem,
                Reactions: [],
            },
        });
    } catch (err) {
        console.error('[ChatBox] messages peek', err);
        res.status(500).json({ error: 'Failed to peek message' });
    }
});

// POST /api/chatbox/groups/:requestNo/messages  (JSON or multipart with image)
router.post('/groups/:requestNo/messages', (req, res, next) => {
    const ct = String(req.headers['content-type'] || '');
    if (ct.includes('multipart/form-data')) {
        return chatUpload.single('image')(req, res, (err) => {
            if (err) {
                return res.status(400).json({ error: err.message || 'Upload failed' });
            }
            next();
        });
    }
    return next();
}, async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.body.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!(await isGroupStarted(requestNo))) {
            return res.status(404).json({ error: 'Chat group not started' });
        }

        let content = String(req.body.content || req.body.NoteContent || '').trim();
        const file = req.file || null;
        if (!content && !file) {
            return res.status(400).json({ error: 'content or image required' });
        }
        if (!content && file) {
            content = '';
        }

        let attachmentPath = null;
        let attachmentName = null;
        let attachmentMime = null;
        if (file) {
            try {
                const saved = saveChatImageFile(requestNo, file);
                attachmentPath = saved.relativePath;
                attachmentName = saved.fileName;
                attachmentMime = saved.mime;
            } catch (writeErr) {
                console.error('[ChatBox] save image to UNC', writeErr);
                return res.status(500).json({
                    error:
                        'Failed to save image to ChatBox share. Check CHATBOX_ATTACHMENTS_ROOT access.',
                    detail: writeErr.message,
                });
            }
        }

        const userId = user.id || req.body.userId || 0;
        const userName = user.fullName || req.body.userName || 'User';
        const profileImage = req.body.userProfileImage || user.profileImage || null;
        const replyToNoteId = req.body.replyToNoteId ? parseInt(req.body.replyToNoteId, 10) : null;
        const forwardFromNoteId = req.body.forwardFromNoteId
            ? parseInt(req.body.forwardFromNoteId, 10)
            : null;

        const request = new sql.Request();
        request.input('requestNo', sql.NVarChar, requestNo);
        request.input('userId', sql.Int, userId);
        request.input('userName', sql.NVarChar, userName);
        request.input('profileImage', sql.NVarChar, profileImage);
        request.input('content', sql.NVarChar, content);
        request.input('replyTo', sql.Int, replyToNoteId);
        request.input('forwardFrom', sql.Int, forwardFromNoteId);
        request.input('attPath', sql.NVarChar, attachmentPath);
        request.input('attName', sql.NVarChar, attachmentName);
        request.input('attMime', sql.NVarChar, attachmentMime);
        const insertRes = await request.query(`
            INSERT INTO EnquiryNotes (
                EnquiryID, UserID, UserName, UserProfileImage, NoteContent,
                ReplyToNoteID, ForwardedFromNoteID, IsDeleted, IsSystem,
                AttachmentPath, AttachmentName, AttachmentMime, CreatedAt
            )
            OUTPUT
                INSERTED.ID,
                INSERTED.CreatedAt,
                INSERTED.NoteContent,
                INSERTED.UserName,
                INSERTED.UserID,
                INSERTED.ReplyToNoteID,
                INSERTED.ForwardedFromNoteID,
                INSERTED.AttachmentPath,
                INSERTED.AttachmentName,
                INSERTED.AttachmentMime
            VALUES (
                @requestNo, @userId, @userName, @profileImage, @content,
                @replyTo, @forwardFrom, 0, 0,
                @attPath, @attName, @attMime, GETDATE()
            )
        `);
        const lastNote = insertRes.recordset?.[0] || null;

        const notePreview = lastNote
            ? {
                  ID: lastNote.ID,
                  NoteContent: lastNote.NoteContent,
                  UserName: lastNote.UserName,
                  UserID: lastNote.UserID,
                  CreatedAt: lastNote.CreatedAt
                      ? new Date(lastNote.CreatedAt).toISOString()
                      : new Date().toISOString(),
                  ReplyToNoteID: lastNote.ReplyToNoteID,
                  ForwardedFromNoteID: lastNote.ForwardedFromNoteID,
                  HasAttachment: !!lastNote.AttachmentPath,
                  AttachmentName: lastNote.AttachmentName || null,
                  AttachmentMime: lastNote.AttachmentMime || null,
                  AttachmentUrl: lastNote.AttachmentPath
                      ? `/api/chatbox/groups/${encodeURIComponent(requestNo)}/messages/${lastNote.ID}/attachment`
                      : null,
                  IsDeleted: false,
                  IsSystem: false,
                  Reactions: [],
              }
            : null;

        // Push immediately (room + user rooms) — do not await fan-out before HTTP response
        void notifyChatRoomAndMembers(requestNo, {
            reason: 'message',
            noteId: lastNote?.ID || null,
            senderUserId: userId,
            senderEmail: user.email || null,
            preview: notePreview,
        });

        // Receipt sync is not required for the send response — do it off the critical path
        void markMessagesRead(requestNo, user.email, user.id).catch((err) =>
            console.warn('[ChatBox] mark read after send', err)
        );

        // Confirm send instantly (client already showed optimistic row)
        res.json({
            ok: true,
            note: notePreview
                ? { ...notePreview, IsOwn: true, ReceiptStatus: 'sent' }
                : null,
            messages: notePreview
                ? [{ ...notePreview, IsOwn: true, ReceiptStatus: 'sent' }]
                : [],
        });
    } catch (err) {
        console.error('[ChatBox] post message', err);
        res.status(500).json({ error: 'Failed to post message' });
    }
});

// GET /api/chatbox/groups/:requestNo/messages/:noteId/attachment
router.get('/groups/:requestNo/messages/:noteId/attachment', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        const noteId = parseInt(req.params.noteId, 10);
        if (!noteId) return res.status(400).json({ error: 'Invalid note id' });
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const noteRes = await sql.query`
            SELECT TOP 1 AttachmentPath, AttachmentName, AttachmentMime, IsDeleted
            FROM EnquiryNotes
            WHERE ID = ${noteId}
              AND LTRIM(RTRIM(CAST(EnquiryID AS NVARCHAR(50)))) = LTRIM(RTRIM(${requestNo}))
        `;
        const note = noteRes.recordset?.[0];
        if (!note?.AttachmentPath || note.IsDeleted) {
            return res.status(404).json({ error: 'Attachment not found' });
        }

        const abs = resolveStoredChatAttachment(note.AttachmentPath);
        if (!abs || !fs.existsSync(abs)) {
            return res.status(404).json({ error: 'File missing' });
        }
        if (note.AttachmentMime) res.type(note.AttachmentMime);
        res.setHeader(
            'Content-Disposition',
            `inline; filename="${String(note.AttachmentName || 'image').replace(/"/g, '')}"`
        );
        res.sendFile(path.resolve(abs));
    } catch (err) {
        console.error('[ChatBox] attachment', err);
        res.status(500).json({ error: 'Failed to load attachment' });
    }
});

// DELETE /api/chatbox/groups/:requestNo/messages/:noteId — own messages only
router.delete('/groups/:requestNo/messages/:noteId', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.body?.email || req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        const noteId = parseInt(req.params.noteId, 10);
        if (!noteId) return res.status(400).json({ error: 'Invalid note id' });
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const noteRes = await sql.query`
            SELECT TOP 1 * FROM EnquiryNotes
            WHERE ID = ${noteId}
              AND LTRIM(RTRIM(CAST(EnquiryID AS NVARCHAR(50)))) = LTRIM(RTRIM(${requestNo}))
        `;
        const note = noteRes.recordset?.[0];
        if (!note) return res.status(404).json({ error: 'Message not found' });
        if (!isOwnNoteRow(note, user)) {
            return res.status(403).json({ error: 'You can only delete your own messages' });
        }

        // Block delete once every other group member has read the message
        const { members } = await loadEnquiryChatMemberList(requestNo);
        const memberEmails = members
            .map((m) => normalizeEmailKey(m.EmailId))
            .filter(Boolean);
        const senderEmail = members.find(
            (m) => norm(m.SEName).toLowerCase() === norm(note.UserName).toLowerCase()
        )?.EmailId;
        const senderNorm = normalizeEmailKey(senderEmail) || normalizeEmailKey(user.email);
        const recipients = memberEmails.filter((e) => e && e !== senderNorm);
        if (recipients.length > 0) {
            const statusRes = await sql.query`
                SELECT UserEmail, ReadAt
                FROM dbo.EnquiryNoteMessageStatus
                WHERE NoteID = ${noteId}
                  AND ReadAt IS NOT NULL
            `;
            const readSet = new Set(
                (statusRes.recordset || []).map((s) => normalizeEmailKey(s.UserEmail))
            );
            const allRead = recipients.every((e) => readSet.has(e));
            if (allRead) {
                return res.status(403).json({
                    error: 'Cannot delete — this message has been read by everyone',
                });
            }
        }

        await sql.query`
            UPDATE EnquiryNotes
            SET IsDeleted = 1, NoteContent = N'This message was deleted'
            WHERE ID = ${noteId}
        `;
        const payload = await buildMessagesPayload(requestNo, user);
        void notifyChatRoomAndMembers(requestNo, { reason: 'delete' });
        res.json(payload);
    } catch (err) {
        console.error('[ChatBox] delete message', err);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// POST /api/chatbox/groups/:requestNo/messages/:noteId/react
router.post('/groups/:requestNo/messages/:noteId/react', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.body.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        const noteId = parseInt(req.params.noteId, 10);
        const emoji = String(req.body.emoji || '').trim();
        if (!noteId || !emoji) return res.status(400).json({ error: 'emoji required' });
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const existing = await sql.query`
            SELECT TOP 1 Emoji FROM dbo.EnquiryNoteReactions
            WHERE NoteID = ${noteId}
              AND LOWER(UserEmail) = LOWER(${user.email})
        `;
        const prev = existing.recordset?.[0]?.Emoji;
        if (prev === emoji) {
            await sql.query`
                DELETE FROM dbo.EnquiryNoteReactions
                WHERE NoteID = ${noteId} AND LOWER(UserEmail) = LOWER(${user.email})
            `;
        } else {
            await sql.query`
                MERGE dbo.EnquiryNoteReactions AS t
                USING (SELECT ${noteId} AS NoteID, ${user.email} AS UserEmail) AS s
                ON t.NoteID = s.NoteID AND LOWER(t.UserEmail) = LOWER(s.UserEmail)
                WHEN MATCHED THEN
                    UPDATE SET Emoji = ${emoji}, UserName = ${user.fullName}, CreatedAt = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (NoteID, UserEmail, UserName, Emoji, CreatedAt)
                    VALUES (${noteId}, ${user.email}, ${user.fullName}, ${emoji}, GETDATE());
            `;
        }
        const payload = await buildMessagesPayload(requestNo, user);
        void notifyChatRoomAndMembers(requestNo, { reason: 'react' });
        res.json(payload);
    } catch (err) {
        console.error('[ChatBox] react', err);
        res.status(500).json({ error: 'Failed to react' });
    }
});

// GET /api/chatbox/groups/:requestNo/messages/:noteId/read-by
router.get('/groups/:requestNo/messages/:noteId/read-by', async (req, res) => {
    try {
        const user = await resolveCurrentUser(req.query.email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const requestNo = String(req.params.requestNo || '').trim();
        const noteId = parseInt(req.params.noteId, 10);
        if (!(await userCanAccessEnquiry(user, requestNo))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { members } = await loadEnquiryChatMemberList(requestNo);
        const noteRes = await sql.query`
            SELECT TOP 1 UserName, UserID FROM EnquiryNotes WHERE ID = ${noteId}
        `;
        const note = noteRes.recordset?.[0];
        if (!note) return res.status(404).json({ error: 'Message not found' });

        const senderEmail = members.find(
            (m) =>
                (note.UserID != null && m.UserID != null && Number(m.UserID) === Number(note.UserID)) ||
                norm(m.SEName).toLowerCase() === norm(note.UserName).toLowerCase()
        )?.EmailId;
        const senderNorm =
            normalizeEmailKey(senderEmail) ||
            (isOwnNoteRow(note, user) ? normalizeEmailKey(user.email) : '');

        const statusRes = await sql.query`
            SELECT UserEmail, DeliveredAt, ReadAt
            FROM dbo.EnquiryNoteMessageStatus
            WHERE NoteID = ${noteId}
            ORDER BY COALESCE(ReadAt, DeliveredAt) ASC
        `;

        const statusByEmail = new Map();
        for (const s of statusRes.recordset || []) {
            const email = normalizeEmailKey(s.UserEmail);
            if (!email || email === senderNorm) continue;
            statusByEmail.set(email, s);
        }

        // All other chat members — include those with no status yet
        const others = members
            .map((m) => ({
                UserName: m.SEName || m.EmailId,
                EmailId: normalizeEmailKey(m.EmailId),
            }))
            .filter((m) => m.EmailId && m.EmailId !== senderNorm);

        // Dedupe by email
        const seen = new Set();
        const uniqueOthers = others.filter((m) => {
            if (seen.has(m.EmailId)) return false;
            seen.add(m.EmailId);
            return true;
        });

        const readBy = [];
        const deliveredTo = [];
        const remaining = [];

        for (const m of uniqueOthers) {
            const st = statusByEmail.get(m.EmailId);
            if (st?.ReadAt) {
                readBy.push({
                    UserName: m.UserName,
                    EmailId: m.EmailId,
                    ReadAt: st.ReadAt,
                    DeliveredAt: st.DeliveredAt,
                });
            } else if (st?.DeliveredAt) {
                deliveredTo.push({
                    UserName: m.UserName,
                    EmailId: m.EmailId,
                    DeliveredAt: st.DeliveredAt,
                });
            } else {
                remaining.push({
                    UserName: m.UserName,
                    EmailId: m.EmailId,
                });
            }
        }

        readBy.sort((a, b) => new Date(a.ReadAt) - new Date(b.ReadAt));
        deliveredTo.sort((a, b) => new Date(a.DeliveredAt) - new Date(b.DeliveredAt));

        res.json({ deliveredTo, readBy, remaining, quickEmojis: QUICK_EMOJIS });
    } catch (err) {
        console.error('[ChatBox] read-by', err);
        res.status(500).json({ error: 'Failed to load read info' });
    }
});

module.exports = router;
