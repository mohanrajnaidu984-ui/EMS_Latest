import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';
import { useData } from '../../context/DataContext';
import UserModal from './UserModal';
import { useAuth } from '../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const COL_WIDTHS = {
    status: 72,
    action: 128,
    prefix: 64,
    name: 140,
    email: 200,
    mobile: 150,
    designation: 180,
    division: 180,
    roles: 220,
};

const TABLE_MIN_WIDTH =
    COL_WIDTHS.status +
    COL_WIDTHS.action +
    COL_WIDTHS.prefix +
    COL_WIDTHS.name +
    COL_WIDTHS.email +
    COL_WIDTHS.mobile +
    COL_WIDTHS.designation +
    COL_WIDTHS.division +
    COL_WIDTHS.roles;

const colgroup = (
    <colgroup>
        <col style={{ width: COL_WIDTHS.status }} />
        <col style={{ width: COL_WIDTHS.action }} />
        <col style={{ width: COL_WIDTHS.prefix }} />
        <col style={{ width: COL_WIDTHS.name }} />
        <col style={{ width: COL_WIDTHS.email }} />
        <col style={{ width: COL_WIDTHS.mobile }} />
        <col style={{ width: COL_WIDTHS.designation }} />
        <col style={{ width: COL_WIDTHS.division }} />
        <col style={{ width: COL_WIDTHS.roles }} />
    </colgroup>
);

const tableBaseStyle = {
    fontSize: '13px',
    minWidth: TABLE_MIN_WIDTH,
    width: TABLE_MIN_WIDTH,
    tableLayout: 'fixed',
    marginBottom: 0,
};

const headerThStyle = {
    backgroundColor: '#f1f5f9',
    borderBottom: '1px solid #cbd5e1',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
    padding: '10px 8px',
    fontWeight: 600,
};

const UserManagementModal = ({ show, onClose }) => {
    const { masters, addMaster, updateMaster, deleteMaster, updateMasters } = useData();
    const { currentUser } = useAuth();
    const [searchText, setSearchText] = useState('');
    const [showUserModal, setShowUserModal] = useState(false);
    const [modalMode, setModalMode] = useState('Add');
    const [editData, setEditData] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [userToReset, setUserToReset] = useState(null);
    const [resetBusy, setResetBusy] = useState(false);
    const headerScrollRef = useRef(null);
    const bodyScrollRef = useRef(null);
    const syncingScrollRef = useRef(false);

    const syncHorizontalScroll = (source) => {
        if (syncingScrollRef.current) return;
        const headerEl = headerScrollRef.current;
        const bodyEl = bodyScrollRef.current;
        if (!headerEl || !bodyEl) return;
        syncingScrollRef.current = true;
        if (source === 'body') headerEl.scrollLeft = bodyEl.scrollLeft;
        else bodyEl.scrollLeft = headerEl.scrollLeft;
        requestAnimationFrame(() => {
            syncingScrollRef.current = false;
        });
    };

    // List of Users
    const users = masters.users || [];

    // Filtered Users
    const filteredUsers = users.filter(u =>
        (u.FullName && u.FullName.toLowerCase().includes(searchText.toLowerCase())) ||
        (u.EmailId && u.EmailId.toLowerCase().includes(searchText.toLowerCase())) ||
        (u.MobileNumber && u.MobileNumber.toLowerCase().includes(searchText.toLowerCase())) ||
        (u.Prefix && String(u.Prefix).toLowerCase().includes(searchText.toLowerCase()))
    );

    const handleAdd = () => {
        setModalMode('Add');
        setEditData(null);
        setShowUserModal(true);
    };

    const handleEdit = (user) => {
        setModalMode('Edit');
        setEditData(user);
        setShowUserModal(true);
    };

    const confirmDelete = (user) => {
        setUserToDelete(user);
        setShowDeleteConfirm(true);
    };

    const confirmResetPassword = (user) => {
        setUserToReset(user);
        setShowResetConfirm(true);
    };

    const handleDelete = async () => {
        if (!userToDelete) return;

        const success = await deleteMaster('user', userToDelete.ID);
        if (success) {
            updateMasters(prev => ({
                ...prev,
                users: prev.users.filter(u => u.ID !== userToDelete.ID)
            }));
            setShowDeleteConfirm(false);
            setUserToDelete(null);
        } else {
            alert('Failed to delete user.');
        }
    };

    const handleResetPassword = async () => {
        if (!userToReset?.ID) return;
        setResetBusy(true);
        try {
            const res = await fetch(`${API_BASE}/api/users/${userToReset.ID}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ModifiedBy: currentUser?.name || currentUser?.FullName || 'Admin' }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Reset failed');
            }
            setShowResetConfirm(false);
            setUserToReset(null);
            alert(`Password cleared for ${userToReset.FullName || 'user'}. They must set a new password on next login.`);
        } catch (e) {
            alert(e.message || 'Failed to reset password.');
        } finally {
            setResetBusy(false);
        }
    };

    const handleUserSubmit = async (data) => {
        const payload = { ...data, ModifiedBy: currentUser?.name || 'Admin' };

        if (modalMode === 'Add') {
            const result = await addMaster('user', payload);
            if (result) {
                const newId = result.id;
                const newUser = { ...payload, ID: newId };

                updateMasters(prev => ({
                    ...prev,
                    users: [...prev.users, newUser]
                }));
            }
        } else {
            const success = await updateMaster('user', data.ID, payload);
            if (success) {
                updateMasters(prev => ({
                    ...prev,
                    users: prev.users.map(u => u.ID === data.ID ? { ...u, ...payload } : u)
                }));
            }
        }
        setShowUserModal(false);
    };

    const otherModalOpen = showDeleteConfirm || showResetConfirm;

    return (
        <>
            <Modal
                show={show && !otherModalOpen}
                title="User Management"
                onClose={onClose}
                maxWidth="min(1180px, 96vw)"
            >
                {/* Search & Add */}
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div className="d-flex align-items-center gap-3 flex-wrap">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Search users..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            style={{ maxWidth: '300px', fontSize: '13px' }}
                        />
                        <span className="text-muted" style={{ fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                            {searchText.trim()
                                ? <>Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong></>
                                : <>Total users: <strong>{users.length}</strong></>}
                        </span>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={handleAdd}>
                        <i className="bi bi-plus-lg me-1"></i> Add User
                    </button>
                </div>

                {/* Frozen header (outside body scroll) + scrollable rows — no sticky overlap */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                    <div
                        ref={headerScrollRef}
                        onScroll={() => syncHorizontalScroll('header')}
                        style={{
                            overflowX: 'auto',
                            overflowY: 'hidden',
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                        }}
                        className="user-mgmt-header-scroll"
                    >
                        <table className="table table-sm mb-0" style={tableBaseStyle}>
                            {colgroup}
                            <thead>
                                <tr>
                                    <th style={{ ...headerThStyle, width: COL_WIDTHS.status }}>Status</th>
                                    <th style={{ ...headerThStyle, width: COL_WIDTHS.action, textAlign: 'center' }}>Action</th>
                                    <th style={{ ...headerThStyle, width: COL_WIDTHS.prefix }}>Prefix</th>
                                    <th style={{ ...headerThStyle, width: COL_WIDTHS.name }}>Name</th>
                                    <th style={{ ...headerThStyle, width: COL_WIDTHS.email }}>Email</th>
                                    <th style={{ ...headerThStyle, width: COL_WIDTHS.mobile }}>Mobile</th>
                                    <th style={{ ...headerThStyle, width: COL_WIDTHS.designation }}>Designation</th>
                                    <th style={{ ...headerThStyle, width: COL_WIDTHS.division }}>Division</th>
                                    <th style={{ ...headerThStyle, width: COL_WIDTHS.roles }}>Roles</th>
                                </tr>
                            </thead>
                        </table>
                    </div>
                    <div
                        ref={bodyScrollRef}
                        onScroll={() => syncHorizontalScroll('body')}
                        style={{ maxHeight: '380px', overflowX: 'auto', overflowY: 'auto' }}
                    >
                        <table className="table table-sm table-hover align-middle mb-0" style={tableBaseStyle}>
                            {colgroup}
                            <tbody>
                                {filteredUsers.length === 0 ? (
                                    <tr><td colSpan="9" className="text-center text-muted py-3">No users found.</td></tr>
                                ) : (
                                    filteredUsers.map((u, idx) => (
                                        <tr key={u.ID || idx}>
                                            <td>
                                                <span className={`badge ${u.Status === 'Active' ? 'bg-success' : 'bg-secondary'}`}>
                                                    {u.Status}
                                                </span>
                                            </td>
                                            <td className="text-center" style={{ verticalAlign: 'middle', paddingTop: '8px', paddingBottom: '8px' }}>
                                                <div className="d-flex justify-content-center gap-1">
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-primary btn-sm py-0 px-2"
                                                        onClick={() => handleEdit(u)}
                                                        title="Edit"
                                                    >
                                                        <i className="bi bi-pencil"></i>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-warning btn-sm py-0 px-2"
                                                        onClick={() => confirmResetPassword(u)}
                                                        title="Reset password (clear to null)"
                                                    >
                                                        <i className="bi bi-key"></i>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-danger btn-sm py-0 px-2"
                                                        onClick={() => confirmDelete(u)}
                                                        title="Delete"
                                                    >
                                                        <i className="bi bi-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{u.Prefix || '—'}</td>
                                            <td style={{ wordBreak: 'break-word' }}>{u.FullName}</td>
                                            <td style={{ wordBreak: 'break-word' }}>{u.EmailId}</td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{u.MobileNumber}</td>
                                            <td style={{ wordBreak: 'break-word' }}>{u.Designation}</td>
                                            <td style={{ wordBreak: 'break-word' }}>{u.Department}</td>
                                            <td style={{ wordBreak: 'break-word' }}>
                                                {Array.isArray(u.Roles) ? u.Roles.join(', ') : u.Roles}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <style>{`
                    .user-mgmt-header-scroll::-webkit-scrollbar { display: none; }
                `}</style>
            </Modal>

            {/* Reuse UserModal for Add/Edit */}
            <UserModal
                show={showUserModal}
                onClose={() => setShowUserModal(false)}
                mode={modalMode}
                initialData={editData}
                onSubmit={handleUserSubmit}
                allUsers={users}
                onEmailMatch={(user) => {
                    setModalMode('Edit');
                    setEditData(user);
                }}
            />

            {/* Delete Confirmation Modal - Portaled to Body */}
            {showDeleteConfirm && createPortal(
                <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10100 }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content shadow-lg">
                            <div className="modal-header bg-danger text-white">
                                <h5 className="modal-title">Confirm Deletion</h5>
                                <button type="button" className="btn-close btn-close-white" onClick={() => setShowDeleteConfirm(false)}></button>
                            </div>
                            <div className="modal-body">
                                <p className="mb-2">Are you sure you want to delete user <strong>{userToDelete?.FullName}</strong>?</p>
                                <p className="text-danger small mb-0"><i className="bi bi-exclamation-triangle-fill me-1"></i> This action cannot be undone and will remove all access for this user.</p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                                <button type="button" className="btn btn-danger" onClick={handleDelete}>Delete User</button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Reset Password Confirmation */}
            {showResetConfirm && createPortal(
                <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10100 }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content shadow-lg">
                            <div className="modal-header bg-warning">
                                <h5 className="modal-title">Reset Password</h5>
                                <button type="button" className="btn-close" onClick={() => !resetBusy && setShowResetConfirm(false)}></button>
                            </div>
                            <div className="modal-body">
                                <p className="mb-2">
                                    Clear password for <strong>{userToReset?.FullName}</strong> ({userToReset?.EmailId})?
                                </p>
                                <p className="text-muted small mb-0">
                                    <code>LoginPassword</code> will be set to <strong>NULL</strong>. On next login they must set a new password (first-login flow).
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" disabled={resetBusy} onClick={() => setShowResetConfirm(false)}>Cancel</button>
                                <button type="button" className="btn btn-warning" disabled={resetBusy} onClick={handleResetPassword}>
                                    {resetBusy ? 'Resetting…' : 'Reset Password'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default UserManagementModal;
