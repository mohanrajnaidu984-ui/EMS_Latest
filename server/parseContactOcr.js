/**
 * Parse Tesseract OCR text from business cards / signatures into contact fields.
 * Tuned for: personal vs company email/phone, Tel vs Fax vs Mobile, pipe-delimited footers.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

const COMPANY_HINTS =
    /\b(ltd|limited|w\.?\s*l\.?\s*l\.?|llc|inc|plc|group|contracting|construction|development|trading|services|solutions|technologies|engineering|company|bank|authority|agency|commission)\b/i;

const ADDRESS_HINTS =
    /\b(p\.?\s*o\.?\s*box|p\.?\s*o\s*b|post\s*box|manama|bahrain|kingdom|kindg|kingd|harbour|harbor|block|bldg|building|road|r\.d|avenue|ave\.?|street|st\.?|tower|floor|flat|shop|suite|plot|way|area|zone|alqudaybiyah|muharraq|riffa|isa\s+town|diplomatic|seef|juffair|mahooz|diplomatic\s+area)\b/i;

const ADDRESS_FIELD_STOP = /^(?:website|email|e[-\s]?mail|mobile|landline|tel|phone|fax|smart)\b/i;

const BRAND_SUFFIX_HINTS =
    /\b(real\s+estate|properties|holdings|contracting|construction|development|trading|group|services|solutions|security\s+and\s+safety|security|safety)\b/i;

const LOGO_BRAND_LINE = /^[A-Z][A-Z0-9\s&'.-]{2,28}$/;

const JOB_TITLE_LINE =
    /\b(manager|engineer|director|consultant|executive|officer|head|lead|specialist|technician|supervisor|coordinator|president|partner|sales)\b/i;

/** Known email-domain / website host → display company (CCC / signature scans). */
const DOMAIN_COMPANY_MAP = {
    askre: 'ASK Real Estate',
    almoayyedcg: 'Almoayyed Contracting Group',
    almcg: 'Almoayyed Contracting Group',
    smart: 'SMART Security and Safety',
    efsme: 'EFS Facilities Services Bahrain W.L.L.',
    bfharbour: 'EFS Facilities Services Bahrain W.L.L.',
};

/** Org unit lines (not job titles like "… - Procurement"). */
const DEPT_ORG_LINE = /\b(directorate|department|division|business\s+unit)\b/i;

const GENERIC_EMAIL_FIRST = /^(info|sales|contact|admin|office|hr|noreply|enquir|enquiry|enquiries|marketing|support|media|general|projects|help|service)\b/i;

function normalizeSpaces(s) {
    return String(s).replace(/\s+/g, ' ').trim();
}

/** Fix common OCR breaks in email-like fragments before extraction. */
function repairTextForEmailScan(text) {
    let t = String(text || '');
    // Whole local-part before @ (do not use (\S)+@ — it strips the last letter of the name).
    t = t.replace(/\b([a-z0-9._%+-]{2,})\s+@\s*/gi, '$1@');
    t = t.replace(/@\s+([a-z0-9._-])/gi, '@$1');
    // Glue "@domain .tld" only (do not merge "@domain.com" + "Al" from the next word).
    t = t.replace(/(@[a-z0-9._+-]+)\s+(\.\s*[a-z]{2,6})\b/gi, '$1$2');
    // Common gov / country TLD splits: "cbb gov bh", "domain com sa"
    t = t.replace(
        /(@[a-z0-9._+-]+)\s+(gov|com|org|net|edu)\s+([a-z]{2})\b/gi,
        (_, a, b, c) => `${a}.${b}.${c}`
    );
    t = t.replace(/\b([a-z0-9._%+-]{2,})\s+@\s*(\w+)\s+gov\s+([a-z]{2})\b/gi, '$1@$2.gov.$3');
    // "user @ cbb . gov . bh" → user@cbb.gov.bh
    t = t.replace(
        /\b([a-z0-9._%+-]{2,})\s+@\s*([a-z0-9-]+(?:\s*\.\s*[a-z0-9-]+)*)\s*\.\s*([a-z]{2})\b/gi,
        (_, u, dom, tld) => `${u}@${dom.replace(/\s*\.\s*/g, '.')}.${tld}`
    );
    // "user@cbb.gov . bh" → user@cbb.gov.bh (OCR gap before final ccTLD)
    t = t.replace(/(@[a-z0-9._+-]+(?:\.[a-z0-9-]+)+)\s+\.\s*([a-z]{2})\b/gi, '$1.$2');
    // "user@cbb. gov . bh" → user@cbb.gov.bh (repeat for chained splits)
    let prev;
    do {
        prev = t;
        t = t.replace(
            /\b([a-z0-9._%+-]+@[a-z0-9._+-]+)\.(\s+)([a-z0-9-]+)\s+\.\s*([a-z]{2})\b/gi,
            '$1.$3.$4'
        );
    } while (t !== prev);
    t = t.replace(/\b([a-z0-9._%+-]{2,})\s+at\s+([a-z0-9-]+)\s*\.?\s*(bh|com|net|org|ae|sa)\b/gi, '$1@$2.$3');
    t = t.replace(/@([a-z0-9][-a-z0-9]*)\s+(bh|com|net|org|ae|sa)\b/gi, '@$1.$2');
    t = t.replace(/\bE\s*[-_]?\s*mail\b/gi, 'Email');
    t = t.replace(/\bW\s*[-_]?\s*ebsite\b/gi, 'Website');
    t = t.replace(
        /\b([a-z0-9]{2,})\s*\.\s*([a-z0-9._%+-]{2,})\s*@\s*([a-z0-9-]+)\s*\.?\s*(bh|com|net|org|ae|sa)\b/gi,
        '$1.$2@$3.$4'
    );
    // E shikhin@domain.comW www.other.com — email glued to website label
    t = t.replace(/\.(com|bh|net|org|ae|sa)W\s*(?=(?:www\.)?[a-z0-9])/gi, '.$1 W ');
    t = t.replace(/\.(com|bh|net|org|ae|sa)W\s*(www\.)/gi, '.$1 W $2');
    return t;
}

function repairTextForWebsiteScan(text) {
    let t = String(text || '');
    t = t.replace(/\.(com|bh|net|org|ae|sa)W\s*(?=(?:www\.)?[a-z0-9])/gi, '.$1 W ');
    t = t.replace(/\.(com|bh|net|org|ae|sa)W\s*(www\.)/gi, '.$1 W $2');
    t = t.replace(/\bw\s*[wvv][wvv]?\s*\./gi, 'www.');
    t = t.replace(/\b(w\s*w\s*w)\s*\./gi, 'www.');
    t = t.replace(/\b([a-z0-9][-a-z0-9]{1,})\s+\.\s+(bh|com|net|org|ae|sa)\b/gi, '$1.$2');
    t = t.replace(/\bW\s*[-_]?\s*ebsite\b/gi, 'Website');
    return t;
}

function repairOcrBlob(rawText) {
    const t = repairTextForWebsiteScan(repairTextForEmailScan(rawText || ''));
    return t;
}

/** e.g. "user @ agency gov bh" from noisy OCR */
function recoverEmailsFromLoosePatterns(text) {
    const found = [];
    const seen = new Set();
    const blob = repairOcrBlob(text);

    const add = (e) => {
        const k = e.toLowerCase();
        if (!seen.has(k)) {
            seen.add(k);
            found.push(e);
        }
    };

    const gov = /\b([a-z0-9._%+-]{2,})\s*@\s*([a-z0-9-]+)\s+gov\s+([a-z]{2})\b/gi;
    let m;
    while ((m = gov.exec(blob)) !== null) {
        add(`${m[1]}@${m[2]}.gov.${m[3]}`);
    }

    const ccTld = /\b([a-z0-9._%+-]{2,})\s*@\s*([a-z0-9-]+)\s+(bh|com|net|org|ae|sa)\b/gi;
    while ((m = ccTld.exec(blob)) !== null) {
        add(`${m[1]}@${m[2]}.${m[3]}`);
    }

    const spacedLocal = /\b([a-z0-9][a-z0-9._%+-]{1,})\s*\.\s*([a-z0-9._%+-]{1,})\s*@\s*([a-z0-9-]+)\s*\.?\s*(bh|com|net|org)\b/gi;
    while ((m = spacedLocal.exec(blob)) !== null) {
        add(`${m[1]}.${m[2]}@${m[3]}.${m[4]}`);
    }

    return found;
}

function recoverEmailsFromMultiline(lines) {
    const found = [];
    const seen = new Set();
    const add = (e) => {
        const k = e.toLowerCase();
        if (!seen.has(k)) {
            seen.add(k);
            found.push(e);
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const next = lines[i + 1] || '';
        const merged = repairOcrBlob(`${line} ${next}`);

        if (/^e[-\s]?mail\b/i.test(line) || /\bemail\b/i.test(line)) {
            const em = firstEmailOnLine(merged) || firstEmailOnLine(next);
            if (em) add(em);
        }

        if (/^[a-z0-9._%+-]+$/i.test(line) && /^@[a-z0-9.-]+\.[a-z]{2,}$/i.test(next)) {
            add(`${line}${next}`);
        }
        if (/^[a-z0-9._%+-]+@?$/i.test(line) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(next)) {
            add(line.includes('@') ? `${line}${next}` : `${line}@${next}`);
        }
    }
    return found;
}

function inferEmailFromContactAndDomain(contactName, website, lines, rawText) {
    if (!contactName) return '';
    let host = '';
    if (website) {
        host = website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[\s/]/)[0];
    }
    if (!host) {
        for (const line of lines) {
            const dm = line.match(/\b([a-z0-9][-a-z0-9]*\.(?:bh|com|net|org|ae|sa))\b/i);
            if (dm && !line.includes('@')) {
                host = dm[1];
                break;
            }
        }
    }
    if (!host) return '';

    const blob = repairOcrBlob(rawText).toLowerCase();
    const hostEsc = host.replace(/\./g, '\\.');
    const fullRe = new RegExp(`[a-z0-9._%+-]+@${hostEsc}`, 'i');
    const full = blob.match(fullRe);
    if (full) return full[0];

    const first = contactName.toLowerCase().split(/\s+/)[0];
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (!lower.includes(first)) continue;
        const localM = line.match(/[a-z0-9][a-z0-9._%+-]{2,}/i);
        if (localM && !localM[0].includes('@')) {
            return `${localM[0]}@${host}`;
        }
    }
    return '';
}

function inferWebsiteFromEmail(emailId) {
    if (!emailId || !emailId.includes('@')) return '';
    const host = emailId.split('@')[1];
    if (!host) return '';
    return host.startsWith('www.') ? host : `www.${host}`;
}

/** Last-resort: any +973 / 973 … block not on a fax line */
function extractBahrainPhoneFromText(text, faxDigits) {
    const blob = String(text || '').replace(/\s+/g, ' ');
    const re = /(?:\+|00\s*)?973[\s.\-]?\d(?:[\d\s().-]{6,}\d)/g;
    let best = '';
    let bestLen = 0;
    let m;
    while ((m = re.exec(blob)) !== null) {
        let s = normalizeSpaces(m[0].replace(/^00\s*/, '+'));
        const d = s.replace(/\D/g, '');
        if (d.length < 10 || d.length > 13) continue;
        if (faxDigits && d === faxDigits) continue;
        if (d.length >= bestLen) {
            bestLen = d.length;
            best = d.startsWith('973') ? `+${d}` : s.startsWith('+') ? s : `+${d}`;
        }
    }
    return normalizeSpaces(best);
}

function uniqueEmailsInOrder(text) {
    const seen = new Set();
    const out = [];
    let m;
    const re = new RegExp(EMAIL_RE.source, 'gi');
    while ((m = re.exec(text)) !== null) {
        const e = m[0];
        const key = e.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            out.push(e);
        }
    }
    return out;
}

function isGenericEmail(email) {
    const local = email.split('@')[0] || '';
    const firstToken = local.split('.')[0] || '';
    return GENERIC_EMAIL_FIRST.test(firstToken + 'x') || GENERIC_EMAIL_FIRST.test(local);
}

function pickContactEmail(emails, lines) {
    if (!emails.length) return '';

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes('www.') && !line.includes('@')) continue;
        const onLine = emails.filter((e) => line.toLowerCase().includes(e.toLowerCase()));
        const personalOnLine = onLine.filter((e) => !isGenericEmail(e));
        if (personalOnLine.length && /\d/.test(line)) {
            return personalOnLine[0];
        }
        if (personalOnLine.length && !COMPANY_HINTS.test(line)) {
            return personalOnLine[0];
        }
    }

    const nonGeneric = emails.filter((e) => !isGenericEmail(e));
    if (nonGeneric.length) return nonGeneric[0];

    return emails[0];
}

function digitsComparable(s) {
    return (s || '').replace(/\D/g, '');
}

/** Prefer +973 … display (Bahrain mobile/landline). */
function normalizeIntlPhone(s) {
    if (!s || !String(s).trim()) return '';
    const d = String(s).replace(/\D/g, '');
    if (d.length < 8 || d.length > 15) return normalizeSpaces(s);
    if (d.startsWith('00')) return normalizeIntlPhone(`+${d.slice(2)}`);
    if (d.startsWith('973') && d.length === 11) {
        return `+973 ${d.slice(3, 7)} ${d.slice(7)}`;
    }
    if (d.startsWith('973')) return normalizeSpaces(`+${d}`);
    if (String(s).trim().startsWith('+')) return normalizeSpaces(s);
    return normalizeSpaces(`+${d}`);
}

function firstEmailOnLine(line) {
    const m = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
    return m ? m[0] : '';
}

function extractEmailsFromSignatureLabels(lines) {
    const found = [];
    const seen = new Set();
    for (const line of lines) {
        const chunk = repairOcrBlob(line);
        const patterns = [
            /(?:^|[\s,;|/])E\.?\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
            /\bemail[:\s]+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
            /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        ];
        for (const re of patterns) {
            const m = chunk.match(re);
            if (!m) continue;
            const e = m[1];
            const k = e.toLowerCase();
            if (!seen.has(k)) {
                seen.add(k);
                found.push(e);
            }
        }
    }
    return found;
}

/** E / W footer lines (EFS-style): email and website on one row without space. */
function extractEmailWebsiteFromFooter(lines, rawText) {
    let email = '';
    let website = '';
    const blob = repairOcrBlob(rawText || '');

    const scanChunk = (chunk) => {
        const repaired = repairOcrBlob(chunk);
        if (!email) {
            const em =
                repaired.match(/(?:^|[\s])E\.?\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i) ||
                repaired.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
            if (em) email = (em[1] || em[0]).trim();
        }
        if (!website) {
            const web = repaired.match(
                /(?:^|[\s])W\.?\s+((?:https?:\/\/)?(?:www\.)?[a-z0-9][-a-z0-9.]*\.[a-z]{2,})/i
            );
            if (web) website = web[1].trim();
        }
    };

    for (const line of lines) {
        if (/[@]|(?:^|[\s])E\s|(?:^|[\s])W\s|www\./i.test(line)) scanChunk(line);
    }
    scanChunk(blob);

    if (!website) {
        const sites = [];
        const re = /(?:https?:\/\/)?(?:www\.)?([a-z0-9][-a-z0-9]*\.(?:com|bh|net|org|ae|sa))/gi;
        let m;
        const emailHost = email ? email.split('@')[1]?.toLowerCase() : '';
        while ((m = re.exec(blob)) !== null) {
            const host = m[0].replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
            if (emailHost && host === emailHost.replace(/^www\./, '')) continue;
            if (emailHost && host === emailHost) continue;
            sites.push(m[0].startsWith('www') || m[0].startsWith('http') ? m[0] : `www.${host}`);
        }
        if (sites.length) website = sites[sites.length - 1];
    }

    return { email, website };
}

function inferWebsiteFromCompany(company, lines, rawText) {
    if (!company) return '';
    const c = company.toLowerCase();
    if (/\befs\b|efsme|facilities\s+services/i.test(c)) return 'www.efsme.com';

    for (const line of lines) {
        const web = repairOcrBlob(line).match(
            /(?:^|[\s])W\.?\s+((?:www\.)?[a-z0-9][-a-z0-9.]*\.[a-z]{2,})/i
        );
        if (web) {
            const u = web[1].trim();
            return u.startsWith('www.') ? u : `www.${u}`;
        }
    }

    const blob = repairOcrBlob(rawText || '');
    const efs = blob.match(/(?:www\.)?efsme\.com/i);
    if (efs && /\befs\b/i.test(c)) {
        return efs[0].startsWith('www') ? efs[0] : `www.${efs[0]}`;
    }
    return '';
}

function getDomainKey(emailOrUrl) {
    if (!emailOrUrl) return '';
    let s = String(emailOrUrl).trim().toLowerCase();
    if (s.includes('@')) s = s.split('@')[1] || '';
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
    s = s.split(/[\s/]/)[0] || '';
    s = s.replace(/\.(com|bh|net|org|co\.uk|ae|sa|info|biz)$/i, '');
    const base = s.split('.').filter(Boolean).pop() || s;
    return base.length >= 2 ? base : '';
}

function lineLooksLikePersonName(line, contactName) {
    const plain = normalizeSpaces(line);
    if (!plain) return false;
    if (contactName && plain.toLowerCase() === contactName.toLowerCase()) return true;
    if (plain.includes('@') || /https?:\/\//i.test(plain) || /\bwww\./i.test(plain)) return false;
    if (JOB_TITLE_LINE.test(plain)) return false;
    if (COMPANY_HINTS.test(plain) || BRAND_SUFFIX_HINTS.test(plain)) return false;
    if (ADDRESS_HINTS.test(plain) && plain.split(/\s+/).length > 4) return false;
    if (/^\+?\d/.test(plain)) return false;
    if (/^(?:tel|phone|mobile|mob|email|fax|ext|landline|website|address)\s*:/i.test(plain)) return false;
    if (/:\s*\+?\d/.test(plain)) return false;

    const words = plain.replace(/[^a-zA-Z\s.'-]/g, '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 4) return false;

    if (words.length === 1) {
        const w = words[0];
        if (w.length < 3 || w.length > 28) return false;
        if (w === w.toUpperCase() && w.length <= 8) return false;
        if (/^[A-Z][a-z]{2,}$/.test(w)) return true;
    }
    if (words.length >= 2) {
        if (COMPANY_HINTS.test(plain) || BRAND_SUFFIX_HINTS.test(plain)) return false;
        if (
            /\b(conditioning|contracting|estate|security|safety|solutions|services|group|limited|ltd|trading|development|construction|bank|air)\b/i.test(
                plain
            )
        )
            return false;
    }
    if (words.length === 2 && words.every((w) => /^[A-Z][a-z]{2,}$/.test(w))) return true;
    if (words.length === 3 && words.every((w) => /^[A-Z][a-z]{2,}$/.test(w))) return true;
    if (/^[A-Z][a-z]{2,}\s+[A-Z][a-z]+(?:\.[A-Z]\.?)?$/i.test(plain)) return true;
    return false;
}

function companyMatchesPerson(company, contactName) {
    if (!company || !contactName) return false;
    const c = normalizeSpaces(company).toLowerCase();
    const n = normalizeSpaces(contactName).toLowerCase();
    return c === n || c.startsWith(`${n} `) || c.endsWith(` ${n}`);
}

/** Logo block: SMART + SECURITY AND SAFETY (business cards). */
function pickLogoBrandCompany(lines, usedLines, contactName) {
    let brandLine = '';
    let suffixLine = '';

    for (const line of lines) {
        if (usedLines.has(line)) continue;
        if (lineLooksLikePersonName(line, contactName)) continue;
        if (line.includes('@') || /\bwww\./i.test(line)) continue;
        const trimmed = line.trim();
        if (LOGO_BRAND_LINE.test(trimmed) && trimmed.length <= 12 && !ADDRESS_HINTS.test(line)) {
            brandLine = trimmed;
        }
        if (/\bsecurity\s+and\s+safety\b/i.test(line) && line.length < 80) {
            suffixLine = line;
        } else if (/\bsecurity\s+and\s+safety\b/i.test(line) === false && BRAND_SUFFIX_HINTS.test(line) && line.length < 80) {
            if (!suffixLine || /security/i.test(line)) suffixLine = line;
        }
    }

    if (brandLine && suffixLine) return normalizeSpaces(`${brandLine} ${suffixLine}`);
    if (brandLine) return brandLine;
    if (suffixLine && brandLine) return normalizeSpaces(`${brandLine} ${suffixLine}`);
    return '';
}

function inferCompanyFromDomain(domainKey, lines) {
    if (!domainKey) return '';
    if (DOMAIN_COMPANY_MAP[domainKey]) return DOMAIN_COMPANY_MAP[domainKey];

    const hasSecurity = lines.some((l) => /\bsecurity\s+and\s+safety\b/i.test(l));
    if (domainKey === 'smart' && hasSecurity) return 'SMART Security and Safety';

    for (const line of lines) {
        if (lineLooksLikePersonName(line, '')) continue;
        if (new RegExp(`\\b${domainKey}\\b`, 'i').test(line) && line.length < 60 && !line.includes('@')) {
            if (LOGO_BRAND_LINE.test(line.trim()) || BRAND_SUFFIX_HINTS.test(line)) {
                return normalizeSpaces(line);
            }
        }
    }

    if (/^[a-z]{3,30}$/.test(domainKey)) {
        return domainKey.charAt(0).toUpperCase() + domainKey.slice(1);
    }
    return '';
}

function inferCompanyFromEmail(email) {
    return inferCompanyFromDomain(getDomainKey(email), []);
}

/** Logo + tagline blocks (e.g. "ask" + "REAL ESTATE") — never use a person's name. */
function pickBrandCompanyName(lines, usedLines, contactName = '') {
    let brandWord = '';
    let suffixLine = '';

    for (const line of lines) {
        if (usedLines.has(line)) continue;
        if (lineLooksLikePersonName(line, contactName)) continue;
        if (line.includes('@') || /https?:\/\//i.test(line)) continue;
        if (ADDRESS_HINTS.test(line) && line.split(/\s+/).length > 4) continue;
        const lower = line.toLowerCase();
        if (['regards', 'best regards', 'sincerely', 'thanks', 'follow us'].some((s) => lower.includes(s)))
            continue;

        const words = line.trim().split(/\s+/);
        if (
            words.length === 1 &&
            words[0].length >= 2 &&
            words[0].length <= 24 &&
            /^[A-Za-z&'.-]+$/.test(words[0]) &&
            !ADDRESS_HINTS.test(line)
        ) {
            const w = words[0];
            const isCapsBrand = w === w.toUpperCase() && w.length <= 12;
            if (isCapsBrand) {
                brandWord = w;
                continue;
            }
            if (!brandWord || lineLooksLikePersonName(brandWord, contactName)) {
                if (!lineLooksLikePersonName(line, contactName)) brandWord = w;
            }
            continue;
        }

        if (BRAND_SUFFIX_HINTS.test(line) && line.length < 80 && !line.includes('@')) {
            suffixLine = line;
        }
    }

    if (brandWord && suffixLine) return normalizeSpaces(`${brandWord} ${suffixLine}`);
    if (suffixLine && BRAND_SUFFIX_HINTS.test(suffixLine)) return suffixLine;
    return brandWord && !lineLooksLikePersonName(brandWord, contactName) ? brandWord : '';
}

function resolveCompanyName({ lines, usedLines, contactName, emailId, website }) {
    const domainKey = getDomainKey(emailId) || getDomainKey(website);

    let company = pickLogoBrandCompany(lines, usedLines, contactName);
    if (!company && domainKey) company = inferCompanyFromDomain(domainKey, lines);
    if (!company) company = pickCompanyName(lines, usedLines);
    if (!company) company = pickBrandCompanyName(lines, usedLines, contactName);
    if (!company && domainKey) company = inferCompanyFromDomain(domainKey, lines);
    if (!company && emailId) company = inferCompanyFromEmail(emailId);

    if (company && companyMatchesPerson(company, contactName)) company = '';
    if (company && domainKey) {
        const fromDomain = inferCompanyFromDomain(domainKey, lines);
        if (fromDomain && !companyMatchesPerson(fromDomain, contactName)) company = fromDomain;
    }

    return company;
}

function extractWebsites(text, lines) {
    const seen = new Set();
    const out = [];

    const add = (raw) => {
        let u = normalizeSpaces(raw).replace(/[.,;]+$/, '');
        if (!u) return;
        if (u.includes('@')) return;
        if (!/\./.test(u)) return;
        if (!/^https?:\/\//i.test(u)) u = `www.${u.replace(/^www\./i, '')}`;
        const key = u.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            out.push(u);
        }
    };

    const captureDomain = (chunk) => {
        const repaired = repairTextForWebsiteScan(chunk);
        const m = repaired.match(
            /(?:https?:\/\/)?(?:www\.)?([a-z0-9][-a-z0-9]*\.(?:bh|com|net|org|ae|sa|co\.uk)(?:\.[a-z]{2})?)/i
        );
        if (m) add(m[0].startsWith('http') ? m[0] : m[0].startsWith('www') ? m[0] : m[1]);
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const label = line.match(
            /\bwebsite[:\s]+((?:https?:\/\/)?(?:www\.)?[a-z0-9][-a-z0-9.]*\.[a-z]{2,}(?:\.[a-z]{2})?)/i
        );
        if (label) add(label[1]);

        const wLabel = repairOcrBlob(line).match(
            /(?:^|[\s])W\.?\s+((?:https?:\/\/)?(?:www\.)?[a-z0-9][-a-z0-9.]*\.[a-z]{2,})/i
        );
        if (wLabel) add(wLabel[1]);

        if (/^website\b/i.test(line)) {
            captureDomain(line.replace(/^website\s*:?\s*/i, ''));
            if (i + 1 < lines.length) captureDomain(lines[i + 1]);
            if (i + 2 < lines.length) captureDomain(`${lines[i + 1]} ${lines[i + 2]}`);
        }
    }

    const blob = repairTextForWebsiteScan(text || '');
    const re =
        /(?:https?:\/\/)?(?:www\.)?([a-z0-9][-a-z0-9]*\.(?:bh|com|net|org|ae|sa|co\.uk)(?:\.[a-z]{2})?)/gi;
    let m;
    while ((m = re.exec(blob)) !== null) {
        add(m[0].startsWith('http') ? m[0] : m[0]);
    }

    const domainOnly = /\b([a-z0-9][-a-z0-9]{2,}\.(?:bh|com|net|org|ae|sa))\b/gi;
    while ((m = domainOnly.exec(blob)) !== null) {
        if (!blob.includes(`@${m[1]}`)) add(m[1]);
    }

    return out;
}

function cleanAddressLine(s) {
    return normalizeSpaces(
        String(s || '')
            .replace(/^address[:\s]+/i, '')
            .replace(/^A\s+(?=(?:level|p\.?\s*o|suite|floor|harbour|tower|manama|kingdom|road|block|flat|shop|bldg)\b)/i, '')
    ).replace(/,\s*$/, '');
}

function lineIsAddressFragment(line) {
    const plain = normalizeSpaces(line);
    if (!plain || plain.includes('@') || /\bwww\./i.test(plain)) return false;
    if (ADDRESS_FIELD_STOP.test(plain)) return false;
    if (/^\+?\d/.test(plain)) return false;
    if (JOB_TITLE_LINE.test(plain) && !ADDRESS_HINTS.test(plain)) return false;
    if (lineLooksLikePersonName(plain, '')) return false;
    return (
        /^address\b/i.test(plain) ||
        ADDRESS_HINTS.test(plain) ||
        /\b(flat\/shop|bldg|block\s*\d|road\s*\d|po\s*box)\b/i.test(plain)
    );
}

/** Address label + following lines; fallback PO Box…Bahrain span in raw OCR. */
function extractLabeledAddress(lines, rawText) {
    const parts = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/^address\b/i.test(line) && !/\baddress[:\s]+/i.test(line)) continue;

        const onLabel = cleanAddressLine(line.replace(/^address\s*:?\s*/i, ''));
        if (onLabel) parts.push(onLabel);

        for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
            const next = lines[j];
            if (ADDRESS_FIELD_STOP.test(next)) break;
            if (lineIsAddressFragment(next)) {
                parts.push(cleanAddressLine(next));
                continue;
            }
            if (
                next.length < 100 &&
                !next.includes('@') &&
                /\b(block|road|bldg|flat|shop|alqudaybiyah|bahrain)\b/i.test(next)
            ) {
                parts.push(cleanAddressLine(next));
            } else {
                break;
            }
        }
        break;
    }

    if (parts.length) return normalizeSpaces(parts.join(', '));

    const blob = normalizeSpaces(repairOcrBlob(rawText || ''));
    const labeled = blob.match(
        /\baddress[:\s]+(p\.?\s*o\.?\s*box[^.]*?(?:bahrain|kingdom\s+of\s+bahrain))\b/i
    );
    if (labeled) return cleanAddressLine(labeled[1]);

    const poSpan = blob.match(
        /\b(p\.?\s*o\.?\s*box\s*\d+[^@]{0,220}?\bbahrain)\b/i
    );
    if (poSpan) return cleanAddressLine(poSpan[1]);

    return '';
}

function mergeAddressFragments(lines, usedLines) {
    const parts = [];
    for (const line of lines) {
        if (usedLines.has(line)) continue;
        if (!lineIsAddressFragment(line)) continue;
        const cleaned = cleanAddressLine(line);
        if (cleaned && !parts.some((p) => p.toLowerCase() === cleaned.toLowerCase())) {
            parts.push(cleaned);
        }
    }
    if (!parts.length) return '';
    return normalizeSpaces(parts.join(', '));
}

function extractLabeledPhones(lines) {
    let mobile = '';
    let phone = '';
    let fax = '';

    for (const line of lines) {
        const lower = line.toLowerCase();

        const faxM = line.match(/\bfax[.\s:]*([+]?\d[\d\s().-]{6,})/i);
        if (faxM && !fax) fax = normalizeSpaces(faxM[1]);

        // Signature footer: M. +973 … | P. +973 … (not "Mr.")
        const mDot = line.match(/(?:^|[\s,;|/])M\.\s*:?\s*(\+?\d[\d\s().-]{7,}\d)/i);
        if (mDot && !mobile) mobile = normalizeSpaces(mDot[1]);

        const pDot = line.match(/(?:^|[\s,;|/])P\.\s*:?\s*(\+?\d[\d\s().-]{7,}\d)/i);
        if (pDot && !phone) phone = normalizeSpaces(pDot[1]);

        const pLabel = line.match(/(?:^|[\s])P\s+(\+?\d[\d\s().-]{8,}\d)/i);
        if (pLabel && !phone) phone = normalizeSpaces(pLabel[1]);

        const fLabel = line.match(/(?:^|[\s])F\s+(\+?\d[\d\s().-]{8,}\d)/i);
        if (fLabel && !fax) fax = normalizeSpaces(fLabel[1]);

        const fDot = line.match(/(?:^|[\s,;|/])F\.\s*:?\s*(\+?\d[\d\s().-]{7,}\d)/i);
        if (fDot && !fax) fax = normalizeSpaces(fDot[1]);

        const mLabel = line.match(/(?:^|[\s])M\s+(\+?\d[\d\s().-]{8,}\d)/i);
        if (mLabel && !mobile) mobile = normalizeSpaces(mLabel[1]);

        const mobM = line.match(/\b(?:mobile|mob(?!ile)|cell|cellular|gsm|m\/s|whatsapp)[.\s:]*([+]?\d[\d\s().-]{6,})/i);
        if (mobM && !mobile) mobile = normalizeSpaces(mobM[1]);

        const landM = line.match(/\b(?:landline|land\s*line)[.\s:]*([+]?\d[\d\s().-]{7,}\d)/i);
        if (landM && !phone) phone = normalizeSpaces(landM[1]);

        // "T +973 …", "T 973 …" (OCR drops '+'), "I/l/1/| +973" (T misread)
        const tStrict = line.match(/(?:^|[\s,;|/])T(?![a-z]{2})\s*(\+?\d[\d\s().-]{6,}\d)/i);
        if (tStrict && !phone) {
            const raw = normalizeSpaces(tStrict[1]);
            const d = raw.replace(/\D/g, '');
            if (d.length >= 9)
                phone = raw.startsWith('+') ? raw : `+${d}`;
        }
        if (!phone) {
            const tLoose = line.match(
                /(?:^|[\s,;|/])[TIl1|]\s*((?:\+|00\s*)?9(?:73|71|70)\s*[\d\s().-]{5,}\d)/i
            );
            if (tLoose) {
                const d = tLoose[1].replace(/\D/g, '');
                if (d.length >= 9 && d.length <= 13) phone = normalizeSpaces(`+${d}`);
            }
        }

        const telM = line.match(
            /\b(?:tel|telephone|phone|direct|switch\s*board)[.\s:]*([+]?\d[\d\s().-]{6,})/i
        );
        if (telM && !lower.includes('mobile') && !phone) phone = normalizeSpaces(telM[1]);
    }

    return { mobile, phone, fax };
}

function numbersOnLine(line) {
    const stripped = line
        .replace(/(?:^|[\s,;|/])(?:T|I|l|\|)\s+(?=[+\d])/i, ' ')
        .replace(/(?:^|[\s,;|/])T\s+(?=[+\d])/i, ' ');
    const out = [];
    const matches = stripped.matchAll(/\+?\d[\d\s().-]{6,}\d/g);
    for (const m of matches) {
        const n = normalizeSpaces(m[0]);
        const digits = n.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 16) out.push(n);
    }
    return out;
}

function splitNameAndDesignation(line) {
    const plain = normalizeSpaces(line);
    const tail = plain.match(
        /\s+((?:Senior|Junior|Chief|Deputy|Assistant|Lead|Principal|Acting|FM|AM|GM)\s+)*(?:(?:Mechanical|Electrical|Civil|Structural|Software|Project|Site|Sales|Marketing|Technical|IT|HR|General|Financial|Legal|Operations|Business|FM|Procurement)\s+)?(Engineer|Manager|Director|Consultant|Executive|Specialist|Coordinator|Supervisor|Technician|Partner|Associate|Architect|President|Officer|Head|Analyst|Developer|Designer|Representative)\s*$/i
    );
    if (tail && tail.index > 1) {
        return {
            name: plain.slice(0, tail.index).trim(),
            designation: plain.slice(tail.index).trim()
        };
    }
    return { name: plain, designation: '' };
}

function lineLooksLikeCompany(line) {
    const lower = line.toLowerCase();
    if (lower.includes('@')) return false;
    return COMPANY_HINTS.test(line) && line.length > 8;
}

function pickCompanyName(lines, usedLines) {
    let best = '';
    for (const line of lines) {
        if (usedLines.has(line)) continue;
        if (!lineLooksLikeCompany(line)) continue;
        if (ADDRESS_HINTS.test(line) && !COMPANY_HINTS.test(line)) continue;
        if (line.length > best.length) best = line;
    }
    return best;
}

function pickAddress(lines, usedLines) {
    let best = '';
    for (const line of lines) {
        if (usedLines.has(line)) continue;
        if (!ADDRESS_HINTS.test(line)) continue;
        if (lineLooksLikeCompany(line) && /w\.?\s*l\.?\s*l/i.test(line)) continue;
        if (line.length < 12) continue;
        if (line.length > best.length) best = line;
    }
    return best;
}

/** Max chars for Address 1 before overflow goes to Address 2 (CCC form layout). */
const ADDRESS1_MAX_LEN = 52;

/**
 * Split a long single-line address across Address 1 / Address 2.
 * Prefers breaks before city/country (Manama, Kingdom of Bahrain, etc.).
 */
function splitAddressForForm(address1, address2) {
    let a1 = normalizeSpaces(address1 || '');
    let a2 = normalizeSpaces(address2 || '');

    if (!a1 || a1.length <= ADDRESS1_MAX_LEN) {
        return { address1: a1, address2: a2 };
    }

    const split = splitAddressAtNaturalBoundary(a1);
    a1 = split.address1;
    const overflow = split.address2;

    if (!overflow) {
        return { address1: a1, address2: a2 };
    }

    if (!a2) {
        a2 = overflow;
    } else if (!a2.toLowerCase().includes(overflow.toLowerCase().slice(0, 12))) {
        a2 = `${overflow}, ${a2}`;
    }

    return { address1: a1, address2: a2 };
}

function splitAddressAtNaturalBoundary(full) {
    const s = normalizeSpaces(full);
    if (s.length <= ADDRESS1_MAX_LEN) {
        return { address1: s, address2: '' };
    }

    const manamaKingdom = s.match(/^(.+?)\s+Manama\s*,\s*(Kingdom\s+Of\s+Bahrain.*)$/i);
    if (manamaKingdom && manamaKingdom[1].length >= 12) {
        return {
            address1: manamaKingdom[1].replace(/,\s*$/, '').trim(),
            address2: `Manama, ${manamaKingdom[2].trim()}`,
        };
    }

    const cityCountryMarkers = [
        /,\s*Block\s+\d+/i,
        /,\s*Alqudaybiyah\b/i,
        /,\s*Al\s*Qudaybiyah\b/i,
        /,\s*Manama\b/i,
        /\s+Manama\s*,/i,
        /,\s*Kingdom\s+Of\s+Bahrain/i,
        /,\s*Kingdom\s+of\s+Bahrain/i,
        /,\s*State\s+of\s+Bahrain/i,
        /,\s*Bahrain\.?$/i,
        /,\s*UAE\b/i,
        /,\s*United\s+Arab\s+Emirates/i,
        /,\s*Dubai\b/i,
        /,\s*Abu\s+Dhabi\b/i,
        /,\s*Riyadh\b/i,
        /,\s*Saudi\s+Arabia/i,
        /,\s*Kuwait\b/i,
        /,\s*Doha\b/i,
        /,\s*Qatar\b/i,
    ];

    for (const re of cityCountryMarkers) {
        const m = s.match(re);
        if (m && m.index != null && m.index >= 12) {
            return {
                address1: s.slice(0, m.index).replace(/,\s*$/, '').trim(),
                address2: s.slice(m.index).replace(/^,\s*/, '').trim(),
            };
        }
    }

    const parts = s.split(/,\s*/).filter(Boolean);
    if (parts.length >= 2) {
        let line1 = '';
        let i = 0;
        for (; i < parts.length; i++) {
            const next = line1 ? `${line1}, ${parts[i]}` : parts[i];
            if (next.length > ADDRESS1_MAX_LEN && line1) break;
            line1 = next;
        }
        if (line1 && i < parts.length) {
            return {
                address1: line1,
                address2: parts.slice(i).join(', '),
            };
        }
        if (parts.length >= 3) {
            const head = parts.slice(0, -1).join(', ');
            if (head.length >= 12 && head.length <= ADDRESS1_MAX_LEN + 15) {
                return {
                    address1: head,
                    address2: parts[parts.length - 1],
                };
            }
        }
    }

    const cut = s.lastIndexOf(' ', ADDRESS1_MAX_LEN);
    if (cut > 18) {
        return {
            address1: s.slice(0, cut).trim(),
            address2: s.slice(cut).trim(),
        };
    }

    return { address1: s, address2: '' };
}

function parseContactCardFromOcrText(rawText) {
    const text = repairOcrBlob(rawText || '');
    const processed = text.replace(/\|/g, '\n');
    const lines = processed
        .split(/\n/)
        .map((l) => normalizeSpaces(l))
        .filter((l) => l.length > 0);

    let emails = uniqueEmailsInOrder(text);
    for (const e of recoverEmailsFromLoosePatterns(rawText)) {
        if (!emails.some((x) => x.toLowerCase() === e.toLowerCase())) emails.push(e);
    }
    for (const e of extractEmailsFromSignatureLabels(lines)) {
        if (!emails.some((x) => x.toLowerCase() === e.toLowerCase())) emails.push(e);
    }
    for (const e of recoverEmailsFromMultiline(lines)) {
        if (!emails.some((x) => x.toLowerCase() === e.toLowerCase())) emails.push(e);
    }
    let emailId = pickContactEmail(emails, lines);

    const websites = extractWebsites(text, lines);
    let website = websites[0] || '';

    let { mobile, phone, fax } = extractLabeledPhones(lines);

    const usedLines = new Set();

    if (emailId) {
        for (const line of lines) {
            if (!line.toLowerCase().includes(emailId.toLowerCase())) continue;
            if (/\bfax\b/i.test(line) || /\b(?:tel|telephone)\b/i.test(line)) continue;
            // "T +973 … user@…" is usually desk phone; number is captured as Phone, not Mobile1.
            if (/(?:^|[\s,;|/])[TIl1|]\s*\+/i.test(line)) continue;
            const nums = numbersOnLine(line);
            const personal = nums.find((n) => {
                const d = n.replace(/\D/g, '');
                return d.length >= 8 && d.length <= 15;
            });
            if (personal && !mobile) {
                mobile = personal;
                usedLines.add(line);
                break;
            }
        }
    }

    if (!mobile) {
        for (const line of lines) {
            const lower = line.toLowerCase();
            const em = firstEmailOnLine(line);
            if (lower.includes('@') && em && !isGenericEmail(em)) {
                if (/(?:^|[\s,;|/])[TIl1|]\s*\+/i.test(line)) continue;
                const nums = numbersOnLine(line);
                const pick = nums.find((n) => !phone || digitsComparable(n) !== digitsComparable(phone));
                if (pick) {
                    mobile = pick;
                    break;
                }
            }
        }
    }

    if (!mobile) {
        for (const line of lines) {
            const lower = line.toLowerCase();
            if (lower.startsWith('+') || /^\+?\d[\d\s-]{8,}$/.test(line)) {
                if (/\bfax\b/i.test(lower) || /\b(?:tel|telephone)\b/i.test(lower)) continue;
                const m = line.match(/(\+?\d[\d\s().-]{8,})/);
                if (m) {
                    mobile = normalizeSpaces(m[1]);
                    break;
                }
            }
        }
    }

    let name = '';
    let designation = '';

    const skipNameLine = (lower) =>
        ['regards', 'best regards', 'sincerely', 'thanks', 'thank you'].some((sw) => lower.includes(sw));

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (skipNameLine(lower)) continue;
        if (lineLooksLikePersonName(line, '')) {
            name = line;
            designation = '';
            usedLines.add(line);
            break;
        }
    }

    if (!name) {
        for (const line of lines) {
            const lower = line.toLowerCase();
            if (skipNameLine(lower)) continue;
            if (line.includes('@')) continue;
            if (/^https?:\/\//i.test(line) || lower.includes('www.')) continue;
            if (lower.includes('follow us')) continue;
            if (JOB_TITLE_LINE.test(line)) continue;
            if (ADDRESS_HINTS.test(line) && line.split(/\s+/).length > 6) continue;
            if (lineLooksLikeCompany(line) && line.split(/\s+/).length > 4) continue;
            if (BRAND_SUFFIX_HINTS.test(line)) continue;
            if (/^[A-Z][A-Z\s&'.-]{2,50}$/.test(line) && BRAND_SUFFIX_HINTS.test(line)) continue;

            const alphaTokens = line.replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
            if (alphaTokens.length < 2) continue;
            if (alphaTokens.every((t) => t.length <= 3 && t === t.toUpperCase())) continue;

            const { name: n, designation: d } = splitNameAndDesignation(line);
            if (n.length >= 3 && /^[a-zA-Z\s.'-]+$/i.test(n.replace(/\s+/g, ' '))) {
                name = n;
                designation = d;
                usedLines.add(line);
                break;
            }
        }
    }

    if (!designation) {
        for (const line of lines) {
            if (line === name) continue;
            if (JOB_TITLE_LINE.test(line) && !line.includes('@') && line.length < 80) {
                designation = line;
                usedLines.add(line);
                break;
            }
        }
    }

    let company = resolveCompanyName({ lines, usedLines, contactName: name, emailId, website });
    if (company) usedLines.add(company);

    let fullAddress =
        extractLabeledAddress(lines, rawText) ||
        cleanAddressLine(pickAddress(lines, usedLines)) ||
        mergeAddressFragments(lines, usedLines);

    if (!fullAddress) {
        for (const line of lines) {
            if (line.includes('@')) continue;
            if (line === name || line === company) continue;
            if (/\bwebsite\b/i.test(line)) continue;
            if (ADDRESS_HINTS.test(line) || /^address[:\s]/i.test(line)) {
                fullAddress = cleanAddressLine(line);
                break;
            }
        }
    }

    let address1 = fullAddress;
    let address2 = '';
    for (const line of lines) {
        if (usedLines.has(line)) continue;
        if (line.includes('@') || /https?:\/\//i.test(line) || /www\./i.test(line.toLowerCase())) continue;
        if (!DEPT_ORG_LINE.test(line) || line.length < 10 || line.length > 200) continue;
        if (lineLooksLikeCompany(line) && !DEPT_ORG_LINE.test(line)) continue;
        address2 = line;
        usedLines.add(line);
        if (!address1) {
            address1 = company ? `${line}, ${company}` : line;
        }
        break;
    }

    if (fax && mobile && digitsComparable(fax) === digitsComparable(mobile)) {
        fax = '';
    }

    // Single-number cards: copy landline to mobile; keep M./P. pairs separate when both set.
    if (!mobile && phone) {
        mobile = phone;
    } else if (mobile && phone && digitsComparable(mobile) === digitsComparable(phone)) {
        phone = '';
    }

    const faxDigits = fax ? digitsComparable(fax) : '';
    if (!phone && !mobile) {
        const bh = extractBahrainPhoneFromText(text, faxDigits);
        if (bh) {
            phone = bh;
            mobile = bh;
        }
    }

    if (!emailId) {
        const again = uniqueEmailsInOrder(repairOcrBlob(rawText));
        for (const e of again) {
            if (!emails.some((x) => x.toLowerCase() === e.toLowerCase())) emails.push(e);
        }
        for (const e of recoverEmailsFromLoosePatterns(rawText)) {
            if (!emails.some((x) => x.toLowerCase() === e.toLowerCase())) emails.push(e);
        }
        for (const e of recoverEmailsFromMultiline(lines)) {
            if (!emails.some((x) => x.toLowerCase() === e.toLowerCase())) emails.push(e);
        }
        emailId = pickContactEmail(emails, lines);
    }

    const footerEw = extractEmailWebsiteFromFooter(lines, rawText);
    if (!emailId && footerEw.email) emailId = footerEw.email;
    if (!website && footerEw.website) website = footerEw.website;

    if (!emailId && (website || name)) {
        const inferred = inferEmailFromContactAndDomain(name, website, lines, rawText);
        if (inferred) emailId = inferred;
    }

    if (!website && company) website = inferWebsiteFromCompany(company, lines, rawText);
    if (!website && emailId) {
        const emailHost = (emailId.split('@')[1] || '').toLowerCase();
        const companyDomain = company && /\befs\b|efsme/i.test(company) ? 'efsme.com' : '';
        if (!companyDomain || emailHost === companyDomain) {
            website = inferWebsiteFromEmail(emailId);
        }
    }

    if (name && emails.length) {
        const first = name.toLowerCase().split(/\s+/)[0];
        const better = emails.find(
            (e) =>
                e.toLowerCase().startsWith(`${first}.`) ||
                e.toLowerCase().startsWith(`${first}@`) ||
                e.toLowerCase().includes(`.${first}@`)
        );
        if (better) emailId = better;
    }

    mobile = normalizeIntlPhone(mobile);
    phone = normalizeIntlPhone(phone);
    fax = fax ? normalizeIntlPhone(fax) : '';

    const splitAddr = splitAddressForForm(address1, address2);
    address1 = splitAddr.address1;
    address2 = splitAddr.address2;

    return {
        ContactName: name,
        CompanyName: company,
        Mobile1: mobile,
        Phone: phone,
        FaxNo: fax,
        EmailId: emailId,
        Website: website,
        Designation: designation,
        Address1: address1,
        Address2: address2
    };
}

module.exports = { parseContactCardFromOcrText };
