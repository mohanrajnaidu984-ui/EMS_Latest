import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { availableRoles } from '../../data/mockData';
import ValidationTooltip from '../Common/ValidationTooltip';
import { parseUserDepartments, formatUserDepartments } from '../../utils/userDepartments';

const PREFIX_OPTIONS = ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Eng.', 'Prof.'];

const defaultFormData = {
    FullName: '',
    Designation: '',
    EmailId: '',
    MobileNumber: '',
    Status: 'Active',
    Prefix: '',
    Department: [],
    Roles: []
};

const UserModal = ({ show, onClose, mode = 'Add', initialData = null, onSubmit, allUsers = [], onEmailMatch }) => {
    const [formData, setFormData] = useState(defaultFormData);
    const [newRole, setNewRole] = useState('');
    const [newDivision, setNewDivision] = useState('');
    const [errors, setErrors] = useState({});

    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState([]);

    const [divisions, setDivisions] = useState([]);

    useEffect(() => {
        fetch('/api/master/divisions')
            .then(res => res.json())
            .then(data => setDivisions(Array.isArray(data) ? data : []))
            .catch(err => console.error('Error fetching divisions:', err));
    }, []);

    useEffect(() => {
        if (initialData) {
            let roles = initialData.Roles;
            if (typeof roles === 'string') {
                roles = roles.split(',').map(r => r.trim()).filter(r => r);
            } else if (!Array.isArray(roles)) {
                roles = [];
            }

            setFormData({
                ...defaultFormData,
                ...initialData,
                Prefix: initialData.Prefix || initialData.prefix || '',
                Roles: roles,
                Department: parseUserDepartments(initialData.Department),
            });
            setNewDivision('');
        } else if (!show) {
            setFormData(defaultFormData);
            setNewRole('');
            setNewDivision('');
        }
        setErrors({});
    }, [initialData, show]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }));
        }

        if (field === 'EmailId' && mode === 'Add' && allUsers.length > 0) {
            const val = value.trim().toLowerCase();
            if (val) {
                const filtered = allUsers.filter(u => u.EmailId && u.EmailId.toLowerCase().includes(val));
                setSuggestions(filtered);
                setShowSuggestions(true);

                const existing = allUsers.find(u => u.EmailId && u.EmailId.trim().toLowerCase() === val);
                if (existing && onEmailMatch) {
                    onEmailMatch(existing);
                    setShowSuggestions(false);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }
    };

    const handleSuggestionClick = (user) => {
        setFormData(prev => ({ ...prev, EmailId: user.EmailId }));
        setShowSuggestions(false);
        if (onEmailMatch) {
            onEmailMatch(user);
        }
    };

    const handleAddRole = () => {
        if (newRole && !formData.Roles.includes(newRole)) {
            setFormData(prev => ({ ...prev, Roles: [...prev.Roles, newRole] }));
            setNewRole('');
        }
    };

    const handleRemoveRole = () => {
        if (formData.Roles.length > 0) {
            setFormData(prev => ({ ...prev, Roles: prev.Roles.slice(0, -1) }));
        }
    };

    const handleAddDivision = () => {
        const div = String(newDivision || '').trim();
        if (!div) return;
        const existing = parseUserDepartments(formData.Department);
        if (existing.some((d) => d.toLowerCase() === div.toLowerCase())) {
            setNewDivision('');
            return;
        }
        setFormData((prev) => ({
            ...prev,
            Department: [...parseUserDepartments(prev.Department), div],
        }));
        setNewDivision('');
        if (errors.Department) {
            setErrors((prev) => ({ ...prev, Department: null }));
        }
    };

    const handleRemoveDivision = () => {
        const list = parseUserDepartments(formData.Department);
        if (list.length > 0) {
            setFormData((prev) => ({ ...prev, Department: list.slice(0, -1) }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const newErrors = {};
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const deptList = parseUserDepartments(formData.Department);

        if (!formData.FullName) newErrors.FullName = 'Full Name is required';
        if (!formData.EmailId) {
            newErrors.EmailId = 'E-Mail ID is required';
        } else if (!emailRegex.test(formData.EmailId.trim())) {
            newErrors.EmailId = 'Please enter a valid email address (e.g., user@example.com)';
        }
        if (deptList.length === 0) {
            newErrors.Department = 'Select at least one Division';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const payload = {
            ...formData,
            Prefix: String(formData.Prefix || '').trim(),
            Roles: Array.isArray(formData.Roles) ? formData.Roles.join(',') : formData.Roles,
            Department: formatUserDepartments(deptList),
        };
        onSubmit(payload);
        setFormData(defaultFormData);
        setNewRole('');
        setNewDivision('');
        onClose();
    };

    const selectedDivisions = parseUserDepartments(formData.Department);
    const availableDivisionOptions = divisions.filter(
        (d) => !selectedDivisions.some((s) => s.toLowerCase() === String(d).toLowerCase())
    );

    return (
        <Modal
            show={show}
            title={`User Details (${mode} User)`}
            onClose={onClose}
            maxWidth="720px"
            footer={
                <>
                    <button type="button" className="btn btn-primary" style={{ width: '80px' }} onClick={handleSubmit}>
                        {mode === 'Add' ? 'Add' : 'Update'}
                    </button>
                    <button type="button" className="btn btn-danger" style={{ width: '80px' }} onClick={onClose}>Cancel</button>
                </>
            }
        >
            <form>
                <div className="row mb-2">
                    <div className="col-md-2">
                        <label className="form-label">Prefix</label>
                        <select
                            className="form-select"
                            style={{ fontSize: '13px' }}
                            value={formData.Prefix || ''}
                            onChange={(e) => handleChange('Prefix', e.target.value)}
                        >
                            <option value="">—</option>
                            {PREFIX_OPTIONS.map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-md-5" style={{ position: 'relative' }}>
                        <label className="form-label">Full Name<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.FullName} onChange={(e) => handleChange('FullName', e.target.value)} />
                        {errors.FullName && <ValidationTooltip message={errors.FullName} />}
                    </div>
                    <div className="col-md-5">
                        <label className="form-label">Designation</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Designation} onChange={(e) => handleChange('Designation', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">E-Mail ID<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.EmailId}
                            onChange={(e) => handleChange('EmailId', e.target.value)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            onFocus={() => {
                                if (mode === 'Add' && formData.EmailId && suggestions.length > 0) {
                                    setShowSuggestions(true);
                                }
                            }}
                        />
                        {showSuggestions && suggestions.length > 0 && (
                            <ul className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 1050, maxHeight: '150px', overflowY: 'auto' }}>
                                {suggestions.map((u, i) => (
                                    <li
                                        key={i}
                                        className="list-group-item list-group-item-action py-1 px-2"
                                        style={{ fontSize: '12px', cursor: 'pointer' }}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => handleSuggestionClick(u)}
                                    >
                                        <div className="fw-bold text-dark">{u.EmailId}</div>
                                        <div className="text-muted small">{u.FullName}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {errors.EmailId && <ValidationTooltip message={errors.EmailId} />}
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Mobile Number</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.MobileNumber} onChange={(e) => handleChange('MobileNumber', e.target.value)} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Status</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Status} onChange={(e) => handleChange('Status', e.target.value)}>
                            <option>Active</option>
                            <option>Inactive</option>
                        </select>
                    </div>
                </div>
                <div className="row mb-2 g-2">
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">
                            Division<span className="text-danger">*</span>
                            <span className="text-muted fw-normal" style={{ fontSize: '11px' }}> (multi / cross-company)</span>
                        </label>
                        <select
                            className="form-select mb-1"
                            style={{ fontSize: '13px' }}
                            value={newDivision}
                            onChange={(e) => setNewDivision(e.target.value)}
                        >
                            <option value="">-- Select Division --</option>
                            {availableDivisionOptions.map((div, index) => (
                                <option key={index} value={div}>{div}</option>
                            ))}
                        </select>
                        <div className="d-flex align-items-center mt-1">
                            <select className="form-select" multiple style={{ height: '70px', fontSize: '13px' }} readOnly>
                                {selectedDivisions.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                            <div className="d-flex flex-column ms-1">
                                <button type="button" className="btn btn-outline-success mb-1" style={{ width: '36px', padding: '0.25rem 0.5rem' }} onClick={handleAddDivision}>+</button>
                                <button type="button" className="btn btn-outline-danger" style={{ width: '36px', padding: '0.25rem 0.5rem' }} onClick={handleRemoveDivision}>-</button>
                            </div>
                        </div>
                        {errors.Department && <ValidationTooltip message={errors.Department} />}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Roles</label>
                        <select className="form-select mb-1" style={{ fontSize: '13px' }}
                            value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                            <option value="">-- Select Role --</option>
                            {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <div className="d-flex align-items-center mt-1">
                            <select className="form-select" multiple style={{ height: '70px', fontSize: '13px' }}>
                                {formData.Roles.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <div className="d-flex flex-column ms-1">
                                <button type="button" className="btn btn-outline-success mb-1" style={{ width: '36px', padding: '0.25rem 0.5rem' }} onClick={handleAddRole}>+</button>
                                <button type="button" className="btn btn-outline-danger" style={{ width: '36px', padding: '0.25rem 0.5rem' }} onClick={handleRemoveRole}>-</button>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default UserModal;
