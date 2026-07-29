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

/** Exact email saved at login (session-first, then persistent remember-me). Use for API `userEmail`. */
export function getStoredLoginEmail() {
    return (
        sessionStorage.getItem(STORAGE_EMAIL_KEY) ||
        localStorage.getItem(STORAGE_EMAIL_KEY) ||
        ''
    ).trim();
}

/** Prefill helpers for the login screen (survives logout). */
export function getRememberMePreference() {
    return localStorage.getItem(STORAGE_REMEMBER_KEY) === '1';
}

export function getRememberedLoginEmail() {
    return (localStorage.getItem(STORAGE_REMEMBERED_EMAIL_KEY) || '').trim();
}

export { STORAGE_EMAIL_KEY as LOGIN_EMAIL_STORAGE_KEY };

function isRememberMeEnabled() {
    return localStorage.getItem(STORAGE_REMEMBER_KEY) === '1';
}

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

function setStoredLoginEmail(email, { persistent = false } = {}) {
    const v = String(email || '').trim();
    if (!v) {
        sessionStorage.removeItem(STORAGE_EMAIL_KEY);
        localStorage.removeItem(STORAGE_EMAIL_KEY);
        return;
    }
    sessionStorage.setItem(STORAGE_EMAIL_KEY, v);
    if (persistent) localStorage.setItem(STORAGE_EMAIL_KEY, v);
    else localStorage.removeItem(STORAGE_EMAIL_KEY);
}

function setStoredCurrentUser(user, { persistent = false } = {}) {
    if (!user) {
        sessionStorage.removeItem(STORAGE_USER_KEY);
        localStorage.removeItem(STORAGE_USER_KEY);
        return;
    }
    const json = JSON.stringify(user);
    sessionStorage.setItem(STORAGE_USER_KEY, json);
    if (persistent) localStorage.setItem(STORAGE_USER_KEY, json);
    else localStorage.removeItem(STORAGE_USER_KEY);
}

/** End the signed-in session. Keeps Remember-me checkbox + email for the next login form. */
function clearSessionAuthStorage() {
    sessionStorage.removeItem(STORAGE_USER_KEY);
    sessionStorage.removeItem(STORAGE_EMAIL_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_EMAIL_KEY);
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
        // Keep DivisionName aligned with DB department for code that still reads DivisionName
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
            setStoredCurrentUser(merged, { persistent: isRememberMeEnabled() });
            return merged;
        });
    }, []);

    useEffect(() => {
        const persistent = isRememberMeEnabled();
        const storedUser =
            sessionStorage.getItem(STORAGE_USER_KEY) ||
            (persistent ? localStorage.getItem(STORAGE_USER_KEY) : null);

        let userData = null;
        if (storedUser) {
            try {
                userData = JSON.parse(storedUser);
            } catch {
                userData = null;
            }
        }

        // Stale local user without remember-me flag — drop it (session-only policy).
        if (!persistent && !sessionStorage.getItem(STORAGE_USER_KEY)) {
            localStorage.removeItem(STORAGE_USER_KEY);
            localStorage.removeItem(STORAGE_EMAIL_KEY);
        }

        if (userData) {
            const stored = getStoredLoginEmail();
            const patched = stored
                ? { ...userData, EmailId: stored, email: stored }
                : userData;
            const migrated = applyRgiAdmin(patched);
            setCurrentUser(migrated);
            setStoredCurrentUser(migrated, { persistent });
            if (stored) setStoredLoginEmail(stored, { persistent });
        }

        // Older sessions: `currentUser` JSON had email but `currentUserEmail` was never set — backfill for pricing API.
        const emailFromUser = (userData?.EmailId || userData?.email || userData?.MailId || '').trim();
        if (emailFromUser && !getStoredLoginEmail()) {
            setStoredLoginEmail(emailFromUser, { persistent });
        }

        const email = getStoredLoginEmail() || userData?.EmailId || userData?.email || userData?.MailId;
        if (email) {
            mergeProfileForEmail(email);
        }
    }, [mergeProfileForEmail]);

    const login = (userData, options = {}) => {
        const persistent = !!options.rememberMe;

        let finalUserData = applyRgiAdmin({ ...userData });
        const storedEmail = (finalUserData.EmailId || finalUserData.email || finalUserData.MailId || '').toString().trim();
        setRememberMePreference(persistent, storedEmail);

        if (storedEmail) {
            finalUserData.EmailId = storedEmail;
            finalUserData.email = storedEmail;
            setStoredLoginEmail(storedEmail, { persistent });
        }

        setCurrentUser(finalUserData);
        setStoredCurrentUser(finalUserData, { persistent });

        if (storedEmail) {
            mergeProfileForEmail(storedEmail);
        }
    };

    const logout = () => {
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
                setStoredCurrentUser(updatedUser, { persistent: isRememberMeEnabled() });
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
