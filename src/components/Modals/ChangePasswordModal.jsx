import React, { useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../../context/AuthContext';

const ChangePasswordModal = ({ show, onClose }) => {
    const { currentUser } = useAuth();
    const passwordPolicyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
    const passwordPolicyMessage = 'Password must be at least 10 characters and include uppercase, lowercase, number, and special character.';
    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
            setError('All fields are required');
            return;
        }

        if (formData.newPassword !== formData.confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        if (!passwordPolicyRegex.test(formData.newPassword)) {
            setError(passwordPolicyMessage);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.id,
                    currentPassword: formData.currentPassword,
                    newPassword: formData.newPassword
                })
            });

            const data = await res.json();

            if (res.ok) {
                setSuccess('Password changed successfully');
                setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                setTimeout(() => {
                    onClose();
                    setSuccess('');
                }, 1500);
            } else {
                setError(data.message || 'Failed to change password');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            show={show}
            title="Change Password"
            onClose={onClose}
            footer={
                <>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>
                </>
            }
        >
            <form onSubmit={handleSubmit}>
                {error && <div className="alert alert-danger py-2">{error}</div>}
                {success && <div className="alert alert-success py-2">{success}</div>}

                <div className="mb-3">
                    <label className="form-label">Current Password</label>
                    <input
                        type="password"
                        className="form-control"
                        name="currentPassword"
                        value={formData.currentPassword}
                        onChange={handleChange}
                    />
                </div>
                <div className="mb-3">
                    <label className="form-label">New Password</label>
                    <input
                        type="password"
                        className="form-control"
                        name="newPassword"
                        value={formData.newPassword}
                        onChange={handleChange}
                    />
                </div>
                <div className="mb-3">
                    <label className="form-label">Confirm New Password</label>
                    <input
                        type="password"
                        className="form-control"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                    />
                </div>
            </form>
        </Modal>
    );
};

export default ChangePasswordModal;
