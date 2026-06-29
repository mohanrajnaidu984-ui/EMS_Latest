import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { consultantTypeOptions } from '../../data/mockData';
import ValidationTooltip from '../Common/ValidationTooltip';

const CustomerModal = ({ show, onClose, mode = 'Add', initialData = null, onSubmit, fixedCategory = null }) => {
    const defaultState = {
        Category: fixedCategory || 'Contractor',
        CompanyName: '',
        Address1: '',
        Address2: '',
        Rating: '',
        Type: '',
        FaxNo: '',
        Phone1: '',
        Phone2: '',
        EmailId: '',
        Website: '',
        Status: 'Active'
    };
    const [formData, setFormData] = useState(initialData || defaultState);
    const [errors, setErrors] = useState({});
    const [isScanning, setIsScanning] = useState(false);
    const fileInputRef = React.useRef(null);

    useEffect(() => {
        setFormData(initialData || defaultState);
        setErrors({});
    }, [initialData, show]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear error when user types
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }));
        }
    };

    const processOcrFile = async (file) => {
        if (!file) return;

        setIsScanning(true);
        const data = new FormData();
        data.append('image', file);

        try {
            const res = await fetch('/api/extract-contact-ocr', {
                method: 'POST',
                body: data
            });

            if (res.ok) {
                const extracted = await res.json();
                console.log('OCR Result:', extracted);

                const digits = (s) => String(s || '').replace(/\D/g, '');
                const land = String(extracted.Phone || '').trim();
                const mob = String(extracted.Mobile1 || '').trim();
                const landD = digits(land);
                const mobD = digits(mob);
                const hasBoth = landD && mobD && landD !== mobD;

                setFormData((prev) => ({
                    ...prev,
                    CompanyName: extracted.CompanyName || prev.CompanyName,
                    EmailId: extracted.EmailId || prev.EmailId,
                    Website: extracted.Website || prev.Website,
                    Address1: extracted.Address1 || prev.Address1,
                    Address2: extracted.Address2 || prev.Address2,
                    FaxNo: extracted.FaxNo || prev.FaxNo,
                    Phone1: hasBoth ? land : land || mob || prev.Phone1,
                    Phone2: hasBoth ? mob : prev.Phone2,
                }));
                alert('Scanned successfully! Please review the auto-filled details.');
            } else {
                alert('Failed to scan image.');
            }
        } catch (err) {
            console.error(err);
            alert('Error scanning image.');
        } finally {
            setIsScanning(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleImageUpload = (e) => {
        processOcrFile(e.target.files[0]);
    };

    const handlePaste = (e) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                processOcrFile(file);
                e.preventDefault();
                return;
            }
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const newErrors = {};

        // Email validation regex, allow empty if needed but keep standard
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!formData.CompanyName) newErrors.CompanyName = 'Company Name is required';
        if (!formData.Address1) newErrors.Address1 = 'Address 1 is required';
        // Phone 1 and Email ID are optional in CCC details.
        if (formData.EmailId && !emailRegex.test(String(formData.EmailId).trim())) {
            newErrors.EmailId = 'Please enter a valid email address (e.g., user@example.com)';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        onSubmit(formData);
        onClose();
    };

    return (
        <Modal
            show={show}
            title={`CCC Details (${mode} Customer/Client/Consultant)`}
            onClose={onClose}
            footer={
                <>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                        onChange={handleImageUpload}
                    />
                    <button
                        type="button"
                        className="btn btn-success"
                        disabled={isScanning}
                        onClick={() => fileInputRef.current.click()}
                    >
                        {isScanning ? 'Scanning...' : 'Scan V-Card'}
                    </button>
                    <textarea
                        className="form-control"
                        placeholder="Paste image (Ctrl+V)"
                        rows="1"
                        style={{ width: '150px', marginLeft: '10px', marginRight: 'auto', fontSize: '12px', resize: 'none' }}
                        onPaste={handlePaste}
                    />

                    <button type="button" className="btn btn-primary" style={{ width: '80px' }} onClick={handleSubmit}>
                        {mode === 'Add' ? 'Add' : 'Update'}
                    </button>
                    <button type="button" className="btn btn-danger" style={{ width: '80px' }} onClick={onClose}>Cancel</button>
                </>
            }
        >
            <form>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Category</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Category}
                            onChange={(e) => handleChange('Category', e.target.value)}
                            disabled={!!fixedCategory}
                        >
                            <option>Contractor</option>
                            <option>Client</option>
                            <option>Consultant</option>
                        </select>
                    </div>
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Company Name<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.CompanyName} onChange={(e) => handleChange('CompanyName', e.target.value)} />
                        {errors.CompanyName && <ValidationTooltip message={errors.CompanyName} />}
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Address 1<span className="text-danger">*</span></label>
                        <textarea className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Address1} onChange={(e) => handleChange('Address1', e.target.value)} />
                        {errors.Address1 && <ValidationTooltip message={errors.Address1} />}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Address 2</label>
                        <textarea className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Address2} onChange={(e) => handleChange('Address2', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-3">
                        <label className="form-label">Rating</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Rating} onChange={(e) => handleChange('Rating', e.target.value)}>
                            <option value="">-- Select Rating --</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                        </select>
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Type</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Type} onChange={(e) => handleChange('Type', e.target.value)}>
                            <option value="">-- Select Type --</option>
                            {consultantTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Fax No.</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.FaxNo} onChange={(e) => handleChange('FaxNo', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Phone 1</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Phone1} onChange={(e) => handleChange('Phone1', e.target.value)} />
                        {errors.Phone1 && <ValidationTooltip message={errors.Phone1} />}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Phone 2</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Phone2} onChange={(e) => handleChange('Phone2', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">E-Mail ID</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.EmailId} onChange={(e) => handleChange('EmailId', e.target.value)} />
                        {errors.EmailId && <ValidationTooltip message={errors.EmailId} />}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Website</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Website} onChange={(e) => handleChange('Website', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Status</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Status} onChange={(e) => handleChange('Status', e.target.value)}>
                            <option>Active</option>
                            <option>Inactive</option>
                        </select>
                    </div>
                </div>
            </form>
        </Modal >
    );
};

export default CustomerModal;
