import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import ValidationTooltip from '../Common/ValidationTooltip';

const ContactModal = ({ show, onClose, mode = 'Add', initialData = null, onSubmit, companyNameReadOnly = false }) => {
    const defaultState = {
        Category: 'Contractor',
        CompanyName: '',
        Prefix: 'Mr',
        ContactName: '',
        Designation: '',
        CategoryOfDesignation: 'Technical',
        Address1: '',
        Address2: '',
        FaxNo: '',
        Phone: '',
        Mobile1: '',
        Mobile2: '',
        EmailId: ''
    };
    const [formData, setFormData] = useState(initialData || defaultState);
    const [errors, setErrors] = useState({});
    const [isScanning, setIsScanning] = useState(false);
    const fileInputRef = React.useRef(null);

    useEffect(() => {
        if (initialData) {
            setFormData({ ...defaultState, ...initialData, Prefix: initialData.Prefix || 'Mr' });
        } else {
            setFormData(defaultState);
        }
        setErrors({});
    }, [initialData, show]);

    const handleChange = (field, value) => {
        if (companyNameReadOnly && field === 'CompanyName') return;
        setFormData(prev => ({ ...prev, [field]: value }));
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

                // Merge OCR fields; keep Company Name when already set (enquiry context).
                setFormData(prev => {
                    const hadCompany = Boolean(prev.CompanyName && prev.CompanyName.trim());
                    const keepCompany = companyNameReadOnly || hadCompany;
                    return {
                        ...prev,
                        ContactName: extracted.ContactName || prev.ContactName,
                        CompanyName: keepCompany ? prev.CompanyName : (extracted.CompanyName || prev.CompanyName),
                        Mobile1: extracted.Mobile1 || prev.Mobile1,
                        EmailId: extracted.EmailId || prev.EmailId,
                        Designation: extracted.Designation || prev.Designation,
                        Address1: extracted.Address1 || prev.Address1,
                        Address2: extracted.Address2 || prev.Address2,
                        Phone: extracted.Phone || prev.Phone,
                        FaxNo: extracted.FaxNo || prev.FaxNo,
                    };
                });
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

        // Email validation regex, allow empty if not sure but it is validation rule from before
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!formData.CompanyName) newErrors.CompanyName = 'Company Name is required';
        if (!formData.ContactName) newErrors.ContactName = 'Contact Person Name is required';
        if (!formData.Mobile1) newErrors.Mobile1 = 'Mobile 1 is required';
        if (!formData.EmailId) {
            newErrors.EmailId = 'E-Mail ID is required';
        } else if (!emailRegex.test(formData.EmailId.trim())) {
            newErrors.EmailId = 'Please enter a valid email address (e.g., user@example.com)';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const finalData = {
            ...formData,
            Prefix: formData.Prefix || 'Mr'
        };

        onSubmit(finalData);
        onClose();
    };

    return (
        <Modal
            show={show}
            title={`Contact Person Details (${mode} Contact Person)`}
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
                            value={formData.Category} onChange={(e) => handleChange('Category', e.target.value)}>
                            <option>Contractor</option>
                            <option>Client</option>
                            <option>Consultant</option>
                        </select>
                    </div>
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Company Name<span className="text-danger">*</span></label>
                        <input
                            type="text"
                            className="form-control"
                            style={{
                                fontSize: '13px',
                                ...(companyNameReadOnly
                                    ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' }
                                    : {}),
                            }}
                            value={formData.CompanyName}
                            readOnly={companyNameReadOnly}
                            onChange={(e) => handleChange('CompanyName', e.target.value)}
                        />
                        {errors.CompanyName && <ValidationTooltip message={errors.CompanyName} />}
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-2">
                        <label className="form-label">Prefix</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Prefix || 'Mr'} onChange={(e) => handleChange('Prefix', e.target.value)}>
                            <option>Mr</option>
                            <option>Mrs</option>
                            <option>Miss</option>
                        </select>
                    </div>
                    <div className="col-md-4" style={{ position: 'relative' }}>
                        <label className="form-label">Contact Person Name<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.ContactName} onChange={(e) => handleChange('ContactName', e.target.value)} />
                        {errors.ContactName && <ValidationTooltip message={errors.ContactName} />}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Designation</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Designation} onChange={(e) => handleChange('Designation', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Category of Designation</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.CategoryOfDesignation} onChange={(e) => handleChange('CategoryOfDesignation', e.target.value)}>
                            <option>Technical</option>
                            <option>General</option>
                        </select>
                    </div>
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Address 1</label>
                        <textarea className="form-control" style={{ fontSize: '13px', fontFamily: 'inherit' }}
                            value={formData.Address1} onChange={(e) => handleChange('Address1', e.target.value)} />
                        {errors.Address1 && <ValidationTooltip message={errors.Address1} />}
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Address 2</label>
                        <textarea className="form-control" style={{ fontSize: '13px', fontFamily: 'inherit' }}
                            value={formData.Address2} onChange={(e) => handleChange('Address2', e.target.value)} />
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Fax No.</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.FaxNo} onChange={(e) => handleChange('FaxNo', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Phone</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Phone} onChange={(e) => handleChange('Phone', e.target.value)} />
                    </div>
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Mobile 1<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Mobile1} onChange={(e) => handleChange('Mobile1', e.target.value)} />
                        {errors.Mobile1 && <ValidationTooltip message={errors.Mobile1} />}
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Mobile 2</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Mobile2} onChange={(e) => handleChange('Mobile2', e.target.value)} />
                    </div>
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">E-Mail ID<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.EmailId} onChange={(e) => handleChange('EmailId', e.target.value)} />
                        {errors.EmailId && <ValidationTooltip message={errors.EmailId} />}
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default ContactModal;
