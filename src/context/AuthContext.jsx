import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

const STORAGE_EMAIL_KEY = 'currentUserEmail';
const STORAGE_USER_KEY = 'currentUser';
const STORAGE_REMEMBER_KEY = 'emsRememberMe';
/** Email kept for the login form after logout when Remember me was used (not a live session). */
const STORAGE_REMEMBERED_EMAIL_KEY = 'emsRememberedEmail';

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

/**
 * Email saved for this tab only. Closing the tab ends the login;
 * a new tab must sign in again. Remember me does not keep a live session.
 */
export function getStoredLoginEmail() {
    return (sessionStorage.getItem(STORAGE_EMAIL_KEY) || '').trim();
}

/** Prefill helpers for the login screen (survives logout). */
export function getRememberMePreference() {
    return localStorage.getItem(STORAGE_REMEMBER_KEY) === '1';
}

export function getRememberedLoginEmail() {
    return (localStorage.getItem(STORAGE_REMEMBERED_EMAIL_KEY) || '').trim();
}

export { STORAGE_EMAIL_KEY as LOGIN_EMAIL_STORAGE_KEY };

function setRememberMePreference(enabled, email = '') {
    if (enabled) {
        localStorage.setItem(STORAGE_REMEMBER_KEY, '1');
        const v = String(email || '').trim();
        if (v) localStorage.setItem(STORAGE_REMEMBERED_EMAIL_KEY, v);
    } else {
        localStorage.removeItem(STORAGE_REMEMBER_KEY);
        localStorage.removeItem(STORAGE_REMEMBERED_EMAIL_KEY);
    }
}

/** Drop a live login left in localStorage by older Remember-me sessions. */
function clearPersistedLiveSession() {
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_EMAIL_KEY);
}

function setStoredLoginEmail(email) {
    const v = String(email || '').trim();
    clearPersistedLiveSession();
    if (!v) {
        sessionStorage.removeItem(STORAGE_EMAIL_KEY);
        return;
    }
    sessionStorage.setItem(STORAGE_EMAIL_KEY, v);
}

function setStoredCurrentUser(user) {
    clearPersistedLiveSession();
    if (!user) {
        sessionStorage.removeItem(STORAGE_USER_KEY);
        return;
    }
    sessionStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
}

/** End the signed-in session. Keeps Remember-me checkbox + email for the next login form. */
function clearSessionAuthStorage() {
    sessionStorage.removeItem(STORAGE_USER_KEY);
    sessionStorage.removeItem(STORAGE_EMAIL_KEY);
    clearPersistedLiveSession();
}

async function fetchProfileByEmail(email) {
    const e = (email || '').trim();
    if (!e) return null;
    try {
        const res = await fetch(`/api/auth/profile?email=${encodeURIComponent(e)}`);
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

function applyRgiAdmin(u) {
    if (!u) return u;
    if (u.EmailId?.toLowerCase() === 'ranigovardhan@gmail.com' || u.email?.toLowerCase() === 'ranigovardhan@gmail.com') {
        return { ...u, Roles: 'Admin', role: 'Admin' };
    }
    return u;
}

/** Merge Master_ConcernedSE profile (by EmailId) into client user shape. Department is authoritative from DB. */
function applyProfileMerge(base, profile) {
    if (!profile) return base;
    /** Prefer in-session user (header / `currentUser`) over the login-page storage key so quote/pricing identity matches the UI. */
    const storedLogin = getStoredLoginEmail();
    const fromSession = (base.email || base.EmailId || base.MailId || '').trim();
    const emailIdentity =
        fromSession ||
        storedLogin ||
        (profile.EmailId || '').trim() ||
        '';
    return {
        ...base,
        id: profile.ID ?? base.id,
        name: profile.FullName ?? base.name,
        email: emailIdentity,
        EmailId: emailIdentity,
        role: profile.Roles ?? base.role,
        Roles: profile.Roles ?? base.Roles,
        Department: profile.Department,
        // Keep DivisionName as Department CSV for legacy readers; prefer parseUserDepartments at use sites
        DivisionName: profile.Department ?? base.DivisionName,
        Designation: profile.Designation,
        RequestNo: profile.RequestNo,
        ProfileImage: profile.ProfileImage ?? base.ProfileImage,
        MobileNumber: profile.MobileNumber
    };
}

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);

    const mergeProfileForEmail = useCallback(async (email) => {
        const profile = await fetchProfileByEmail(email);
        if (!profile) return;
        setCurrentUser((prev) => {
            const base = prev || {};
            const merged = applyRgiAdmin(applyProfileMerge(base, profile));
            setStoredCurrentUser(merged);
            return merged;
        });
    }, []);

    useEffect(() => {
        // A new tab has no sessionStorage. Never revive a login from localStorage.
        clearPersistedLiveSession();
        const storedUser = sessionStorage.getItem(STORAGE_USER_KEY);

        let userData = null;
        if (storedUser) {
            try {
                userData = JSON.parse(storedUser);
            } catch {
                userData = null;
            }
        }

        if (userData) {
            const stored = getStoredLoginEmail();
            const patched = stored
                ? { ...userData, EmailId: stored, email: stored }
                : userData;
            const migrated = applyRgiAdmin(patched);
            setCurrentUser(migrated);
            setStoredCurrentUser(migrated);
            if (stored) setStoredLoginEmail(stored);
        }

        // Older sessions: `currentUser` JSON had email but `currentUserEmail` was never set — backfill for pricing API.
        const emailFromUser = (userData?.EmailId || userData?.email || userData?.MailId || '').trim();
        if (emailFromUser && !getStoredLoginEmail()) {
            setStoredLoginEmail(emailFromUser);
        }

        const email = getStoredLoginEmail() || (userData ? (userData.EmailId || userData.email || userData.MailId) : '');
        if (email && userData) {
            mergeProfileForEmail(email);
        }
    }, [mergeProfileForEmail]);

    // Presence heartbeat for Admin Usage page (online users) — all roles
    useEffect(() => {
        if (!currentUser) return undefined;
        const email = String(
            currentUser.email || currentUser.EmailId || getStoredLoginEmail() || ''
        ).trim();
        if (!email) return undefined;

        const sendHeartbeat = () => {
            const payload = {
                email,
                name: currentUser.name || currentUser.FullName || '',
                department: currentUser.Department || currentUser.DivisionName || '',
                roles: currentUser.Roles || currentUser.role || '',
            };
            void fetch('/api/usage/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true,
            }).catch(() => {});
        };

        sendHeartbeat();
        // 60s — presence also updates from API activity middleware; avoid chat-era request storms
        const t = setInterval(sendHeartbeat, 60000);
        const onVis = () => {
            if (document.visibilityState === 'visible') sendHeartbeat();
        };
        window.addEventListener('focus', sendHeartbeat);
        document.addEventListener('visibilitychange', onVis);
        return () => {
            clearInterval(t);
            window.removeEventListener('focus', sendHeartbeat);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [currentUser]);

    const login = (userData, options = {}) => {
        const persistent = !!options.rememberMe;

        let finalUserData = applyRgiAdmin({ ...userData });
        const storedEmail = (finalUserData.EmailId || finalUserData.email || finalUserData.MailId || '').toString().trim();
        setRememberMePreference(persistent, storedEmail);

        if (storedEmail) {
            finalUserData.EmailId = storedEmail;
            finalUserData.email = storedEmail;
            setStoredLoginEmail(storedEmail);
        }

        setCurrentUser(finalUserData);
        setStoredCurrentUser(finalUserData);

        if (storedEmail) {
            mergeProfileForEmail(storedEmail);
            // Register online immediately (don't wait for useEffect)
            void fetch('/api/usage/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: storedEmail,
                    name: finalUserData.name || finalUserData.FullName || '',
                    department: finalUserData.Department || finalUserData.DivisionName || '',
                    roles: finalUserData.Roles || finalUserData.role || '',
                }),
                keepalive: true,
            }).catch(() => {});
        }
    };

    const logout = () => {
        const email = String(
            currentUser?.email || currentUser?.EmailId || getStoredLoginEmail() || ''
        ).trim();
        if (email) {
            try {
                void fetch('/api/usage/goodbye', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                    keepalive: true,
                });
            } catch (_) {
                /* ignore */
            }
        }
        setCurrentUser(null);
        // Keep emsRememberMe + emsRememberedEmail so the login checkbox/email stay filled.
        clearSessionAuthStorage();
        window.location.href = '/';
    };

    const updateProfileImage = async (userId, base64) => {
        try {
            await fetch('/api/auth/update-profile-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, imageBase64: base64 })
            });
            if (currentUser) {
                const updatedUser = { ...currentUser, ProfileImage: base64 };
                setCurrentUser(updatedUser);
                setStoredCurrentUser(updatedUser);
            }
        } catch (err) {
            console.error('Failed to update profile image:', err);
        }
    };

    const storedLoginEmail = React.useMemo(() => getStoredLoginEmail(), [currentUser]);

    const authValue = React.useMemo(() => ({
        currentUser,
        login,
        logout,
        updateProfileImage,
        isAuthenticated: !!currentUser,
        /** Exact email string persisted at login (`currentUserEmail`); same value sent as pricing `userEmail` when set. */
        storedLoginEmail,
        /** Refresh Department / profile from Master_ConcernedSE using stored login email */
        refreshUserProfile: () => {
            const e = getStoredLoginEmail() || currentUser?.EmailId || currentUser?.email;
            if (e) return mergeProfileForEmail(e);
            return Promise.resolve();
        }
    }), [currentUser, mergeProfileForEmail, storedLoginEmail]);

    return (
        <AuthContext.Provider value={authValue}>
            {children}
        </AuthContext.Provider>
    );
};
