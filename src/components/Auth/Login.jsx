import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import emsoLogo from '../../assets/ems_logo2.png';
import { getAcgBrandLogoSrc } from '../../utils/acgBrandLogo';
import { readApiJson } from '../../utils/apiJson';
import './Login.css';

const Login = () => {
    const { login } = useAuth();
    const passwordPolicyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
    const passwordPolicyMessage = 'Password must be at least 10 characters and include uppercase, lowercase, number, and special character.';

    // Steps: 'email', 'password', 'setup', 'forgot'
    const [step, setStep] = useState('email');

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        newPassword: '',
        confirmPassword: '',
        rememberMe: false
    });

    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        setError('');
    };

    // Step 1: Check Email
    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        if (!formData.email) {
            setError('Please enter your email address');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/check-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email })
            });
            const { ok, data, invalidJson } = await readApiJson(res);
            if (invalidJson || (!ok && !Object.keys(data).length)) {
                setError('Server error. Please try again.');
                return;
            }
            if (!ok) {
                setError(data.message || `Server error (${res.status})`);
                return;
            }

            if (data.exists) {
                if (data.isFirstLogin) {
                    setStep('setup');
                } else {
                    setStep('password');
                }
            } else {
                setError('Email not found. Please contact administrator.');
            }
        } catch (err) {
            console.error(err);
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Login
    const handleLogin = async (e) => {
        e.preventDefault();
        if (!formData.password) {
            setError('Please enter your password');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password
                }),
            });

            const { ok, data, invalidJson } = await readApiJson(response);
            if (invalidJson) {
                setError('Server error. Please try again.');
                return;
            }

            if (ok) {
                console.log('Login Success! User:', data.user);
                /** Typed address on this screen — must drive `currentUserEmail` / pricing `userEmail` (DB EmailId can differ). */
                const typedEmail = (formData.email || '').trim();
                const loginEmail = typedEmail || (data.user.EmailId || data.user.MailId || '').trim();
                login({
                    id: data.user.UserID || data.user.ID, // Fallback if ID field name varies
                    name: data.user.FullName,
                    email: loginEmail,
                    EmailId: loginEmail,
                    role: data.user.Roles || data.user.Role || 'User',
                    Department: data.user.Department,
                    RequestNo: data.user.RequestNo,
                    DivisionName: data.user.DivisionName,
                    ProfileImage: data.user.ProfileImage
                });
            } else {
                setError(data.message || 'Login failed');
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Step 3: Set Password (First Time)
    const handleSetPassword = async (e) => {
        e.preventDefault();
        if (!formData.newPassword || !formData.confirmPassword) {
            setError('Please fill all fields');
            return;
        }
        if (formData.newPassword !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (!passwordPolicyRegex.test(formData.newPassword)) {
            setError(passwordPolicyMessage);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/set-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    newPassword: formData.newPassword
                })
            });

            if (res.ok) {
                // Auto login after setting password
                // Reuse handleLogin logic but with new password
                setFormData(prev => ({ ...prev, password: prev.newPassword }));
                // We need to trigger login, can't verify state update immediately, so call login API directly
                const loginRes = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: formData.email,
                        password: formData.newPassword
                    }),
                });
                const loginParsed = await readApiJson(loginRes);
                const loginData = loginParsed.data;
                if (loginParsed.ok && !loginParsed.invalidJson) {
                    const typedEmail = (formData.email || '').trim();
                    const loginEmail =
                        typedEmail ||
                        (loginData.user.EmailId || loginData.user.MailId || '').trim();
                    login({
                        id: loginData.user.UserID || loginData.user.ID,
                        name: loginData.user.FullName,
                        email: loginEmail,
                        EmailId: loginEmail,
                        role: loginData.user.Roles || 'User',
                        Department: loginData.user.Department,
                        RequestNo: loginData.user.RequestNo,
                        DivisionName: loginData.user.DivisionName,
                        ProfileImage: loginData.user.ProfileImage
                    });
                } else {
                    setStep('password');
                    setError('Password set, but auto-login failed. Please sign in.');
                }
            } else {
                setError('Failed to set password');
            }
        } catch (err) {
            setError('Error setting password');
        } finally {
            setLoading(false);
        }
    };

    // Step 4: Forgot Password
    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email })
            });
            const { ok, data, invalidJson } = await readApiJson(res);
            if (invalidJson) {
                setError('Server error. Please try again.');
                return;
            }
            if (ok) {
                setSuccessMsg(data.message || 'Reset link sent to your email.');
                setTimeout(() => {
                    setStep('password');
                    setSuccessMsg('');
                }, 3000);
            } else {
                setError(data.message || 'Failed to process request');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 'email':
                return (
                    <form onSubmit={handleEmailSubmit} className="login-form">
                        <div className="form-group">
                            <label htmlFor="email"><i className="bi bi-envelope me-2"></i>Email Address</label>
                            <input type="email" id="email" name="email" className="form-control"
                                placeholder="Enter your email" value={formData.email} onChange={handleChange} disabled={loading} autoFocus />
                        </div>
                        <button type="submit" className="btn btn-primary btn-login login-page-submit" disabled={loading}>
                            {loading ? 'Checking...' : 'Next'}
                        </button>
                    </form>
                );

            case 'password':
                return (
                    <form onSubmit={handleLogin} className="login-form">
                        <div className="mb-3 text-start">
                            <span className="badge bg-light text-dark border">{formData.email}</span>
                            <button type="button" className="btn btn-link btn-sm p-0 ms-2" onClick={() => { setStep('email'); setError(''); }}>Change</button>
                        </div>
                        <div className="form-group">
                            <label htmlFor="password"><i className="bi bi-lock me-2"></i>Password</label>
                            <div className="password-input-wrapper">
                                <input type={showPassword ? "text" : "password"} id="password" name="password" className="form-control"
                                    placeholder="Enter your password" value={formData.password} onChange={handleChange} disabled={loading} autoFocus />
                                <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex="-1">
                                    <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                                </button>
                            </div>
                        </div>
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <div className="form-check">
                                <input type="checkbox" className="form-check-input" id="rememberMe" name="rememberMe"
                                    checked={formData.rememberMe} onChange={handleChange} disabled={loading} />
                                <label className="form-check-label" htmlFor="rememberMe">Remember me</label>
                            </div>
                            <button type="button" className="btn btn-link btn-sm p-0" onClick={() => { setStep('forgot'); setError(''); }}>Forgot Password?</button>
                        </div>
                        <button type="submit" className="btn btn-primary btn-login login-page-submit" disabled={loading}>
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                );

            case 'setup':
                return (
                    <form onSubmit={handleSetPassword} className="login-form">
                        <div className="alert alert-info py-2" style={{ fontSize: '0.9rem' }}>
                            <i className="bi bi-info-circle me-2"></i>First time login? Please set a password.
                        </div>
                        <div className="form-group">
                            <label>New Password</label>
                            <input type="password" name="newPassword" className="form-control"
                                placeholder="Create password" value={formData.newPassword} onChange={handleChange} disabled={loading} />
                        </div>
                        <div className="form-group">
                            <label>Confirm Password</label>
                            <input type="password" name="confirmPassword" className="form-control"
                                placeholder="Confirm password" value={formData.confirmPassword} onChange={handleChange} disabled={loading} />
                        </div>
                        <button type="submit" className="btn btn-success btn-login login-page-submit" disabled={loading}>
                            {loading ? 'Setting Password...' : 'Set Password & Login'}
                        </button>
                    </form>
                );

            case 'forgot':
                return (
                    <form onSubmit={handleForgotPassword} className="login-form">
                        <div className="mb-3">
                            <p className="text-muted small">Enter your email address and we'll send you a link to reset your password.</p>
                        </div>
                        <div className="form-group">
                            <label>Email Address</label>
                            <input type="email" className="form-control" value={formData.email} readOnly disabled />
                        </div>
                        <button type="submit" className="btn btn-warning btn-login text-white login-page-submit" disabled={loading}>
                            {loading ? 'Sending...' : 'Send Reset Link'}
                        </button>
                        <button type="button" className="btn btn-link w-100 mt-2" onClick={() => setStep('password')}>Back to Login</button>
                    </form>
                );

            default:
                return null;
        }
    };

    return (
        <div className="login-container">
            <style>
                {`
                    @keyframes slideDown {
                        from { opacity: 0; transform: translateY(-20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes fadeInUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .logo-animated {
                        animation: slideDown 0.8s ease-out;
                    }
                    .footer-logo-animated {
                        animation: fadeInUp 0.8s ease-out 0.2s backwards;
                    }
                `}
            </style>
            <div className="login-background">
                <div className="login-card">
                    <div className="login-header login-brand-header mb-4">
                        <div
                            className="logo-animated d-flex align-items-center justify-content-center"
                            style={{ marginBottom: '2px' }}
                        >
                            <img
                                src={emsoLogo}
                                alt=""
                                aria-hidden="true"
                                className="ems-brand-mark me-1"
                                style={{ transform: 'translateY(-2px)' }}
                            />
                            <span className="ems-brand-text d-flex align-items-center">
                                <span className="ems-brand-word">EMS</span>
                                <span className="ems-brand-divider" aria-hidden="true"></span>
                                <span className="ems-brand-subtext">
                                    Enquiry<br />
                                    Management<br />
                                    System
                                </span>
                            </span>
                        </div>
                    </div>

                    {error && (
                        <div className="alert alert-danger" role="alert">
                            <i className="bi bi-exclamation-circle me-2"></i>{error}
                        </div>
                    )}
                    {successMsg && (
                        <div className="alert alert-success" role="alert">
                            <i className="bi bi-check-circle me-2"></i>{successMsg}
                        </div>
                    )}

                    {renderStep()}

                    <div className="d-flex justify-content-center mt-4 pt-3 border-top">
                        <img
                            src={getAcgBrandLogoSrc()}
                            alt="Almoayyed Contracting Group"
                            className="footer-logo-animated acg-login-footer-logo"
                            decoding="async"
                            draggable={false}
                            style={{
                                height: '44px',
                                width: 'auto',
                                maxWidth: 'min(280px, 85vw)',
                                objectFit: 'contain',
                                opacity: 0.9
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
