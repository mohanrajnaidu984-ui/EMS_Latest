import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';
import { useData } from '../../context/DataContext';
import UserModal from './UserModal';
import { useAuth } from '../../context/AuthContext';

const UserManagementModal = ({ show, onClose }) => {
    const { masters, addMaster, updateMaster, deleteMaster, updateMasters } = useData();
    const { currentUser } = useAuth();
    const [searchText, setSearchText] = useState('');
    const [showUserModal, setShowUserModal] = useState(false);
    const [modalMode, setModalMode] = useState('Add');
    const [editData, setEditData] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);

    // List of Users
    const users = masters.users || [];

    // Filtered Users
    const filteredUsers = users.filter(u =>
        (u.FullName && u.FullName.toLowerCase().includes(searchText.toLowerCase())) ||
        (u.EmailId && u.EmailId.toLowerCase().includes(searchText.toLowerCase())) ||
        (u.MobileNumber && u.MobileNumber.toLowerCase().includes(searchText.toLowerCase()))
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

    const handleUserSubmit = async (data) => {
        const payload = { ...data, ModifiedBy: currentUser?.name || 'Admin' };

        if (modalMode === 'Add') {
            const result = await addMaster('user', payload);
            if (result) {
                const newId = result.id;
                // If ID is returned (from updated backend), use it. otherwise use payload or undefined (which is the bug source, but we fixed backend).
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
                    users: prev.users.map(u => u.ID === data.ID ? payload : u)
                }));
            }
        }
        setShowUserModal(false);
    };

    return (
        <>
            <Modal
                show={show && !showDeleteConfirm}
                title="User Management"
                onClose={onClose}
                width="800px" // Wider modal
            >
                {/* Search & Add */}
                <div className="d-flex justify-content-between mb-3">
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Search users..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ maxWidth: '300px', fontSize: '13px' }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={handleAdd}>
                        <i className="bi bi-plus-lg me-1"></i> Add User
                    </button>
                </div>

                {/* Users Table */}
                <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <table className="table table-sm table-hover align-middle" style={{ fontSize: '13px' }}>
                        <thead className="table-light">
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Mobile</th>
                                <th>Designation</th>
                                <th>Department</th>
                                <th>Roles</th>
                                <th>Status</th>
                                <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.length === 0 ? (
                                <tr><td colSpan="8" className="text-center text-muted">No users found.</td></tr>
                            ) : (
                                filteredUsers.map((u, idx) => (
                                    <tr key={u.ID || idx}>
                                        <td>{u.FullName}</td>
                                        <td>{u.EmailId}</td>
                                        <td>{u.MobileNumber}</td>
                                        <td>{u.Designation}</td>
                                        <td>{u.Department}</td>
                                        <td>
                                            {Array.isArray(u.Roles) ? u.Roles.join(', ') : u.Roles}
                                        </td>
                                        <td>
                                            <span className={`badge ${u.Status === 'Active' ? 'bg-success' : 'bg-secondary'}`}>
                                                {u.Status}
                                            </span>
                                        </td>
                                        <td className="text-center">
                                            <div className="d-flex justify-content-center">
                                                <button
                                                    className="btn btn-outline-primary btn-sm py-0 px-2 me-2"
                                                    onClick={() => handleEdit(u)}
                                                    title="Edit"
                                                >
                                                    <i className="bi bi-pencil"></i>
                                                </button>
                                                <button
                                                    className="btn btn-outline-danger btn-sm py-0 px-2"
                                                    onClick={() => confirmDelete(u)}
                                                    title="Delete"
                                                >
                                                    <i className="bi bi-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
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
        </>
    );
};

export default UserManagementModal;
