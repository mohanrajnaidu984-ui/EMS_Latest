import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

const STORAGE_EMAIL_KEY = 'currentUserEmail';
const STORAGE_USER_KEY = 'currentUser';

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

/** Exact email saved at login (session-first). Use for API `userEmail` / Master_ConcernedSE match. */
export function getStoredLoginEmail() {
    return (
        sessionStorage.getItem(STORAGE_EMAIL_KEY) ||
        localStorage.getItem(STORAGE_EMAIL_KEY) ||
        ''
    ).trim();
}

export { STORAGE_EMAIL_KEY as LOGIN_EMAIL_STORAGE_KEY };

function setStoredLoginEmail(email) {
    const v = String(email || '').trim();
    if (!v) {
        sessionStorage.removeItem(STORAGE_EMAIL_KEY);
        return;
    }
    sessionStorage.setItem(STORAGE_EMAIL_KEY, v);
}

function setStoredCurrentUser(user) {
    if (!user) {
        sessionStorage.removeItem(STORAGE_USER_KEY);
        return;
    }
    sessionStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
}

function clearLegacyLocalAuth() {
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
            setStoredCurrentUser(merged);
            return merged;
        });
    }, []);

    useEffect(() => {
        const storedUser =
            sessionStorage.getItem(STORAGE_USER_KEY) ||
            localStorage.getItem(STORAGE_USER_KEY);
        const loginEmail = getStoredLoginEmail();

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
            // Migrate any legacy localStorage auth into this tab session, then drop legacy copy.
            setStoredCurrentUser(migrated);
            if (stored) setStoredLoginEmail(stored);
            clearLegacyLocalAuth();
        }

        // Older sessions: `currentUser` JSON had email but `currentUserEmail` was never set — backfill for pricing API.
        const emailFromUser = (userData?.EmailId || userData?.email || userData?.MailId || '').trim();
        if (emailFromUser && !getStoredLoginEmail()) {
            setStoredLoginEmail(emailFromUser);
        }

        const email = getStoredLoginEmail() || userData?.EmailId || userData?.email || userData?.MailId;
        if (email) {
            mergeProfileForEmail(email);
        }
    }, [mergeProfileForEmail]);

    const login = (userData) => {
        let finalUserData = applyRgiAdmin({ ...userData });
        const storedEmail = (finalUserData.EmailId || finalUserData.email || finalUserData.MailId || '').toString().trim();
        if (storedEmail) {
            finalUserData.EmailId = storedEmail;
            finalUserData.email = storedEmail;
            setStoredLoginEmail(storedEmail);
        }

        setCurrentUser(finalUserData);
        setStoredCurrentUser(finalUserData);

        if (storedEmail) {
            mergeProfileForEmail(storedEmail);
        }
    };

    const logout = () => {
        setCurrentUser(null);
        sessionStorage.removeItem(STORAGE_USER_KEY);
        sessionStorage.removeItem(STORAGE_EMAIL_KEY);
        // Prevent auto-login from older localStorage fallback on next load.
        clearLegacyLocalAuth();
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
