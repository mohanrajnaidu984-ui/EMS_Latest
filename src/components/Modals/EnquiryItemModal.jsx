import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import ValidationTooltip from '../Common/ValidationTooltip';
import { useData } from '../../context/DataContext';

const EnquiryItemModal = ({ show, onClose, mode = 'Add', initialData = null, onSubmit, onModeChange }) => {
    const [formData, setFormData] = useState({
        ItemName: '',
        CompanyName: '',
        DepartmentName: '',
        Status: 'Active',
        CommonMailIds: [],
        CCMailIds: [],
        DivisionCode: '',
        DepartmentCode: '',
        Phone: '',
        Address: '',
        FaxNo: '',
        CompanyLogo: ''
    });

    const [newCommonMail, setNewCommonMail] = useState('');
    const [newCCMail, setNewCCMail] = useState('');
    const [selectedCommonMails, setSelectedCommonMails] = useState([]);
    const [selectedCCMails, setSelectedCCMails] = useState([]);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (show) {
            if (mode === 'Edit' && initialData) {
                const common = Array.isArray(initialData.CommonMailIds)
                    ? initialData.CommonMailIds
                    : (initialData.CommonMailIds ? initialData.CommonMailIds.split(',') : []);
                const cc = Array.isArray(initialData.CCMailIds)
                    ? initialData.CCMailIds
                    : (initialData.CCMailIds ? initialData.CCMailIds.split(',') : []);

                setFormData({
                    ...initialData,
                    CommonMailIds: common,
                    CCMailIds: cc
                });
            } else {
                setFormData({
                    ItemName: '',
                    CompanyName: '',
                    DepartmentName: '',
                    Status: 'Active',
                    CommonMailIds: [],
                    CCMailIds: [],
                    DivisionCode: '',
                    DepartmentCode: '',
                    Phone: '',
                    Address: '',
                    FaxNo: '',
                    CompanyLogo: ''
                });
            }
            setNewCommonMail('');
            setNewCCMail('');
            setSelectedCommonMails([]);
            setSelectedCCMails([]);
            setErrors({});
        }
    }, [show, mode, initialData]);

    const { masters } = useData();

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }));
        }

        // Auto-fill and Update prompt logic for ItemName in Add mode
        if (mode === 'Add' && field === 'ItemName' && value.trim()) {
            const match = masters.enqItems.find(i =>
                (i.ItemName || '').toLowerCase() === value.trim().toLowerCase()
            );

            if (match) {
                const shouldUpdate = window.confirm(`"${value.trim()}" already exists. Would you like to update its details?`);
                if (shouldUpdate) {
                    const common = Array.isArray(match.CommonMailIds)
                        ? match.CommonMailIds
                        : (match.CommonMailIds ? match.CommonMailIds.split(',') : []);
                    const cc = Array.isArray(match.CCMailIds)
                        ? match.CCMailIds
                        : (match.CCMailIds ? match.CCMailIds.split(',') : []);

                    setFormData({
                        ...match,
                        CommonMailIds: common,
                        CCMailIds: cc
                    });

                    if (onModeChange) {
                        onModeChange('Edit', match);
                    }
                }
            }
        }
    };

    const handleAddList = (field, value, setter) => {
        // Email validation regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!value || value.trim() === '') {
            alert('Please enter an email address');
            return;
        }

        if (!emailRegex.test(value.trim())) {
            alert('Please enter a valid email address (e.g., user@example.com)');
            return;
        }

        if (formData[field].includes(value.trim())) {
            alert('This email is already in the list');
            return;
        }

        setFormData(prev => ({ ...prev, [field]: [...prev[field], value.trim()] }));
        setter('');
    };

    const handleRemoveList = (field, selectedItems, setSelectedItems) => {
        if (selectedItems.length > 0) {
            setFormData(prev => ({
                ...prev,
                [field]: prev[field].filter(item => !selectedItems.includes(item))
            }));
            setSelectedItems([]);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formDataObj = new FormData();
        formDataObj.append('logo', file);

        try {
            const res = await fetch('/api/upload/logo', {
                method: 'POST',
                body: formDataObj
            });
            const data = await res.json();
            if (res.ok) {
                setFormData(prev => ({ ...prev, CompanyLogo: data.filePath }));
            } else {
                alert('Failed to upload logo: ' + data.message);
            }
        } catch (err) {
            console.error('Error uploading logo:', err);
            alert('Error uploading logo');
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const newErrors = {};
        if (!formData.ItemName) newErrors.ItemName = 'Item Name is required';
        if (formData.CommonMailIds.length === 0) newErrors.CommonMailIds = 'At least one Common Mail ID is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        // Convert arrays to comma-separated strings for the backend
        const payload = {
            ...formData,
            CommonMailIds: Array.isArray(formData.CommonMailIds) ? formData.CommonMailIds.join(',') : formData.CommonMailIds,
            CCMailIds: Array.isArray(formData.CCMailIds) ? formData.CCMailIds.join(',') : formData.CCMailIds
        };
        onSubmit(payload);
        onClose();
    };

    return (
        <Modal
            show={show}
            title={`Enquiry For Item Details (${mode} Item)`}
            onClose={onClose}
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
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Item Name<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.ItemName} onChange={(e) => handleChange('ItemName', e.target.value)} />
                        {errors.ItemName && <ValidationTooltip message={errors.ItemName} />}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Department Name</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.CompanyName} onChange={(e) => handleChange('CompanyName', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-3">
                        <label className="form-label">Division Name</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.DepartmentName} onChange={(e) => handleChange('DepartmentName', e.target.value)} />
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
                <div className="row mb-2">
                    <div className="col-md-3">
                        <label className="form-label">Division Code</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.DivisionCode || ''} onChange={(e) => handleChange('DivisionCode', e.target.value)} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Department Code</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.DepartmentCode || ''} onChange={(e) => handleChange('DepartmentCode', e.target.value)} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Phone</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Phone || ''} onChange={(e) => handleChange('Phone', e.target.value)} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Fax No</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.FaxNo || ''} onChange={(e) => handleChange('FaxNo', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-12">
                        <label className="form-label">Address</label>
                        <textarea className="form-control" style={{ fontSize: '13px' }} rows="2"
                            value={formData.Address || ''} onChange={(e) => handleChange('Address', e.target.value)}></textarea>
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Company Logo</label>
                        <input type="file" className="form-control" style={{ fontSize: '13px' }} accept="image/*"
                            onChange={handleFileChange} />
                        {formData.CompanyLogo && (
                            <div className="mt-1">
                                <img src={`/${formData.CompanyLogo}`} alt="Logo Preview" style={{ height: '40px' }} />
                                <small className="ms-2 text-muted">Uploaded</small>
                            </div>
                        )}
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Common mail ID<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }} placeholder="Enter email"
                            value={newCommonMail} onChange={(e) => setNewCommonMail(e.target.value)} />
                        {errors.CommonMailIds && <ValidationTooltip message={errors.CommonMailIds} />}
                        <div className="d-flex align-items-center mt-1">
                            <select
                                className="form-select"
                                multiple
                                style={{ height: '75px', fontSize: '13px' }}
                                value={selectedCommonMails}
                                onChange={(e) => setSelectedCommonMails(Array.from(e.target.selectedOptions, option => option.value))}
                            >
                                {formData.CommonMailIds.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <div className="d-flex flex-column ms-1">
                                <button type="button" className="btn btn-outline-success mb-1" style={{ width: '36px', padding: '0.25rem 0.5rem' }}
                                    onClick={() => handleAddList('CommonMailIds', newCommonMail, setNewCommonMail)}>+</button>
                                <button type="button" className="btn btn-outline-danger" style={{ width: '36px', padding: '0.25rem 0.5rem' }}
                                    onClick={() => handleRemoveList('CommonMailIds', selectedCommonMails, setSelectedCommonMails)}>-</button>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">CC mail ID</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }} placeholder="Enter email"
                            value={newCCMail} onChange={(e) => setNewCCMail(e.target.value)} />
                        <div className="d-flex align-items-center mt-1">
                            <select
                                className="form-select"
                                multiple
                                style={{ height: '75px', fontSize: '13px' }}
                                value={selectedCCMails}
                                onChange={(e) => setSelectedCCMails(Array.from(e.target.selectedOptions, option => option.value))}
                            >
                                {formData.CCMailIds.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <div className="d-flex flex-column ms-1">
                                <button type="button" className="btn btn-outline-success mb-1" style={{ width: '36px', padding: '0.25rem 0.5rem' }}
                                    onClick={() => handleAddList('CCMailIds', newCCMail, setNewCCMail)}>+</button>
                                <button type="button" className="btn btn-outline-danger" style={{ width: '36px', padding: '0.25rem 0.5rem' }}
                                    onClick={() => handleRemoveList('CCMailIds', selectedCCMails, setSelectedCCMails)}>-</button>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default EnquiryItemModal;
