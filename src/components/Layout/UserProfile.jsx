import React, { useState, useRef, useEffect } from 'react';
import { useAuth, getStoredLoginEmail } from '../../context/AuthContext';
import ProfileImageModal from '../Modals/ProfileImageModal';
import ChangePasswordModal from '../Modals/ChangePasswordModal';
import UserManagementModal from '../Modals/UserManagementModal';
import {
    SignatureVaultModal,
    loadSignatureLibrary,
    loadDefaultSignatureId,
    saveDefaultSignatureId,
    EMS_QUOTE_PLACE_STAMP_EVENT,
    migrateLocalSignatureLibraryToServer,
    resolveSignatureStampPrefs,
} from '../Quote/QuoteDigitalSignature';
import { fetchUserSignatureLibrary } from '../../utils/quoteSignatureApi';

import { QUOTE_TAB_B2B } from '../../utils/quoteNav';

/** `activeTab` used so Place on page in the dropdown only works on Quote B2B (same event QuoteForm listens for). */
const UserProfile = ({ activeTab = '' }) => {
    const { currentUser, logout, updateProfileImage } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showUserManagementModal, setShowUserManagementModal] = useState(false);
    const [showSignatureVault, setShowSignatureVault] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [signatureQuickList, setSignatureQuickList] = useState([]);
    const [defaultSignatureId, setDefaultSignatureId] = useState('');
    const [placePageIndex, setPlacePageIndex] = useState(0);
    const [quotePageCount, setQuotePageCount] = useState(1);
    const dropdownRef = useRef(null);

    const handleImageSave = (base64) => {
        updateProfileImage(currentUser.id, base64);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                const dropdownEl = document.getElementById('user-profile-dropdown');
                if (dropdownEl && dropdownEl.contains(event.target)) {
                    return;
                }
                setDropdownOpen(false);
            }
        };

        if (dropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [dropdownOpen]);

    /** Session profile first (same source as Pricing `userEmail`); then login-stored fallback. */
    const displayEmail =
        (currentUser?.EmailId || currentUser?.email || currentUser?.MailId || '').trim()
        || getStoredLoginEmail()
        || '';

    useEffect(() => {
        if (!dropdownOpen || !displayEmail) return;
        let cancelled = false;
        (async () => {
            try {
                let master = await migrateLocalSignatureLibraryToServer(displayEmail);
                if (!master) master = await fetchUserSignatureLibrary(displayEmail);
                if (cancelled) return;
                const sigs = master?.signatures?.length ? master.signatures : loadSignatureLibrary(displayEmail);
                setSignatureQuickList(sigs);
                setDefaultSignatureId(
                    master?.defaultSignatureId || loadDefaultSignatureId(displayEmail) || sigs[0]?.id || ''
                );
            } catch {
                if (!cancelled) {
                    setSignatureQuickList(loadSignatureLibrary(displayEmail));
                    setDefaultSignatureId(loadDefaultSignatureId(displayEmail) || '');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [dropdownOpen, displayEmail]);

    useEffect(() => {
        if (!dropdownOpen) return;
        const n =
            typeof window !== 'undefined' && Number(window.__EMS_QUOTE_PREVIEW_TOTAL_PAGES) > 0
                ? Number(window.__EMS_QUOTE_PREVIEW_TOTAL_PAGES)
                : 1;
        setQuotePageCount(n);
        setPlacePageIndex((p) => Math.min(Math.max(0, p), Math.max(0, n - 1)));
    }, [dropdownOpen, activeTab]);

    if (!currentUser) return null;

    // Check Admin Role
    const roleString = currentUser.role || currentUser.Roles || '';
    const userRoles = typeof roleString === 'string'
        ? roleString.split(',').map(r => r.trim().toLowerCase())
        : (Array.isArray(roleString) ? roleString.map(r => r.trim().toLowerCase()) : []);
    const isAdmin = userRoles.includes('admin');

    return (
        <div ref={dropdownRef} className="d-flex align-items-center position-relative">
            {/* User Name & Dropdown Toggle */}
            <div
                className="d-flex align-items-center profile-trigger"
                style={{
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.2s ease',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    marginLeft: '-4px' // Offset padding to keep alignment
                }}
                onClick={() => setDropdownOpen(!dropdownOpen)}
            >
                {/* Profile Image - Clickable */}
                <div
                    className="rounded-circle border d-flex align-items-center justify-content-center overflow-hidden me-2 profile-image-container"
                    style={{
                        width: '32px',
                        height: '32px',
                        backgroundColor: '#f0f2f5',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease'
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowModal(true);
                    }}
                    title="Click to update profile picture"
                >
                    {currentUser.ProfileImage ? (
                        <img
                            src={currentUser.ProfileImage}
                            alt="Profile"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <i className="bi bi-person-fill text-secondary" style={{ fontSize: '1rem' }}></i>
                    )}
                </div>

                <div className="d-flex align-items-center profile-text-group">
                    <span className={`fw-medium ${(dropdownOpen) ? 'text-primary' : 'text-secondary'}`} style={{ fontSize: '12px', transition: 'color 0.2s ease' }}>
                        {displayEmail || currentUser.name}
                    </span>
                    <i className="bi bi-chevron-down ms-1 text-secondary" style={{ fontSize: '0.85rem', transition: 'transform 0.2s ease' }}></i>
                </div>
            </div>

            {/* Dropdown Menu */}
            {dropdownOpen && (
                <div
                    id="user-profile-dropdown"
                    className="position-absolute bg-white shadow-lg rounded py-2"
                    style={{
                        top: '120%',
                        right: '0',
                        minWidth: '280px',
                        zIndex: 10000,
                        border: '1px solid #e0e0e0',
                        marginTop: '10px',
                        animation: 'fadeIn 0.2s ease-out'
                    }}
                >
                    <div className="px-3 py-2 border-bottom mb-1">
                        <div className="fw-bold text-dark" style={{ fontSize: '0.85rem' }}>{currentUser.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{displayEmail}</div>
                    </div>

                    <button
                        type="button"
                        className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0 border-0"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDropdownOpen(false);
                            setShowModal(true);
                        }}
                        style={{ fontSize: '0.9rem', cursor: 'pointer', background: 'transparent' }}
                    >
                        <i className="bi bi-camera me-2"></i>
                        Update Photo
                    </button>

                    <button
                        type="button"
                        className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0 border-0"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDropdownOpen(false);
                            setShowPasswordModal(true);
                        }}
                        style={{ fontSize: '0.9rem', cursor: 'pointer', background: 'transparent' }}
                    >
                        <i className="bi bi-key me-2"></i>
                        Change Password
                    </button>

                    <div
                        className="px-3 py-2 border-top"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-muted text-uppercase mb-1" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                            Quote digital signature
                        </div>
                        {signatureQuickList.length === 0 ? (
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                No saved signatures. Use Manage to draw or upload.
                            </div>
                        ) : (
                            <>
                                <label className="form-label mb-1" style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '2px' }}>
                                    Signature
                                </label>
                                <select
                                    className="form-select form-select-sm"
                                    value={defaultSignatureId}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        saveDefaultSignatureId(displayEmail, v || null);
                                        setDefaultSignatureId(v);
                                    }}
                                    aria-label="Signature to use on quote"
                                >
                                    <option value="">Select signature…</option>
                                    {signatureQuickList.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
                                    <label className="small text-muted mb-0" style={{ whiteSpace: 'nowrap' }}>
                                        Page
                                    </label>
                                    <select
                                        className="form-select form-select-sm"
                                        style={{ width: 'auto', minWidth: '72px' }}
                                        value={placePageIndex}
                                        onChange={(e) => setPlacePageIndex(Number(e.target.value))}
                                        disabled={activeTab !== QUOTE_TAB_B2B}
                                        aria-label="Quote page for stamp"
                                    >
                                        {Array.from({ length: quotePageCount }, (_, i) => (
                                            <option key={i} value={i}>
                                                {i + 1}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-primary flex-grow-1"
                                        style={{ minWidth: '120px' }}
                                        disabled={
                                            activeTab !== QUOTE_TAB_B2B ||
                                            !defaultSignatureId ||
                                            !signatureQuickList.some((s) => s.id === defaultSignatureId)
                                        }
                                        title={
                                            activeTab !== QUOTE_TAB_B2B
                                                ? 'Open Quote → B2B first'
                                                : !defaultSignatureId
                                                  ? 'Choose a signature above'
                                                  : 'Adds stamp to the quote preview — then drag it where you need'
                                        }
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const sig = signatureQuickList.find((s) => s.id === defaultSignatureId);
                                            if (!sig || activeTab !== QUOTE_TAB_B2B) return;
                                            const prefs = resolveSignatureStampPrefs(sig);
                                            window.dispatchEvent(
                                                new CustomEvent(EMS_QUOTE_PLACE_STAMP_EVENT, {
                                                    detail: {
                                                        imageDataUrl: sig.imageDataUrl,
                                                        sheetIndex: placePageIndex,
                                                        displayName: (currentUser.FullName || currentUser.name || '').trim(),
                                                        designation: (currentUser.Designation || '').trim(),
                                                        showNameOnStamp: prefs.showNameOnStamp,
                                                        showDateTimeOnStamp: prefs.showDateTimeOnStamp,
                                                    },
                                                })
                                            );
                                            setDropdownOpen(false);
                                        }}
                                    >
                                        Place on page
                                    </button>
                                </div>
                                <div className="text-muted mt-2" style={{ fontSize: '0.68rem', lineHeight: 1.35 }}>
                                    On <strong>Quote</strong>: pick signature and page, then Place — drag the stamp on the preview (not ×). Other
                                    tabs: use Manage only.
                                </div>
                            </>
                        )}
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-primary w-100 mt-2"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDropdownOpen(false);
                                setShowSignatureVault(true);
                            }}
                        >
                            <i className="bi bi-pen me-1"></i>
                            Manage signatures…
                        </button>
                    </div>

                    {isAdmin && (
                        <button
                            type="button"
                            className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0 border-0"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDropdownOpen(false);
                                setShowUserManagementModal(true);
                            }}
                            style={{ fontSize: '0.9rem', cursor: 'pointer', background: 'transparent' }}
                        >
                            <i className="bi bi-gear me-2"></i>
                            User Management
                        </button>
                    )}

                    <div className="dropdown-divider mx-2"></div>

                    <button
                        type="button"
                        className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0 border-0 text-danger"
                        onClick={(e) => {
                            console.log("Logout Clicked");
                            e.preventDefault();
                            e.stopPropagation();
                            setDropdownOpen(false);
                            logout();
                        }}
                        style={{ fontSize: '0.9rem', cursor: 'pointer', background: 'transparent' }}
                    >
                        <i className="bi bi-box-arrow-right me-2"></i>
                        Logout
                    </button>
                </div>
            )}
            <style>
                {`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                #user-profile-dropdown .btn-light:hover {
                    background-color: #f8f9fa !important;
                }
                .profile-trigger:hover {
                    background-color: rgba(13, 110, 253, 0.05);
                }
                .profile-trigger:hover .text-secondary {
                    color: #0d6efd !important;
                }
                .profile-trigger:hover .bi-chevron-down {
                    transform: translateY(2px);
                    color: #0d6efd !important;
                }
                .profile-image-container:hover {
                    transform: scale(1.05);
                    border-color: #0d6efd !important;
                }
                `}
            </style>

            <ProfileImageModal
                show={showModal}
                onClose={() => setShowModal(false)}
                onSave={handleImageSave}
            />

            <ChangePasswordModal
                show={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
            />

            <UserManagementModal
                show={showUserManagementModal}
                onClose={() => setShowUserManagementModal(false)}
            />

            <SignatureVaultModal
                open={showSignatureVault}
                onClose={() => {
                    setShowSignatureVault(false);
                    if (displayEmail) {
                        void fetchUserSignatureLibrary(displayEmail).then((master) => {
                            const sigs = master.signatures?.length
                                ? master.signatures
                                : loadSignatureLibrary(displayEmail);
                            setSignatureQuickList(sigs);
                            setDefaultSignatureId(
                                master.defaultSignatureId ||
                                    loadDefaultSignatureId(displayEmail) ||
                                    sigs[0]?.id ||
                                    ''
                            );
                        });
                    }
                }}
                userEmail={displayEmail}
                placementEnabled={false}
            />
        </div>
    );
};

export default UserProfile;
