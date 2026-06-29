import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './Login.css';

const Signup = ({ onSwitchToLogin }) => {
    const { login } = useAuth();
    const passwordPolicyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
    const passwordPolicyMessage = 'Password must be at least 10 characters and include uppercase, lowercase, number, and special character.';
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        setError('');
    };

    const validateEmail = (email) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validation
        if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
            setError('All fields are required');
            return;
        }

        if (!validateEmail(formData.email)) {
            setError('Please enter a valid email address');
            return;
        }

        if (!passwordPolicyRegex.test(formData.password)) {
            setError(passwordPolicyMessage);
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: formData.username,
                    email: formData.email,
                    password: formData.password
                }),
            });

            const data = await response.json();

            if (response.ok) {
                // Signup successful, switch to login
                alert('Account created successfully! Please login.');
                onSwitchToLogin();
            } else {
                setError(data.message || 'Signup failed');
            }
        } catch (err) {
            console.error('Signup error:', err);
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-background">
                <div className="login-card">
                    <div className="login-header">
                        <div className="login-logo">
                            <i className="bi bi-person-plus"></i>
                        </div>
                        <h1>Create Account</h1>
                        <p>Join the EMS Portal</p>
                    </div>

                    <form onSubmit={handleSubmit} className="login-form">
                        {error && (
                            <div className="alert alert-danger" role="alert">
                                <i className="bi bi-exclamation-circle me-2"></i>
                                {error}
                            </div>
                        )}

                        <div className="form-group">
                            <label htmlFor="username">
                                <i className="bi bi-person me-2"></i>
                                Username
                            </label>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                className="form-control"
                                placeholder="Enter your username"
                                value={formData.username}
                                onChange={handleChange}
                                disabled={loading}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="email">
                                <i className="bi bi-envelope me-2"></i>
                                Email Address
                            </label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                className="form-control"
                                placeholder="Enter your email"
                                value={formData.email}
                                onChange={handleChange}
                                disabled={loading}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">
                                <i className="bi bi-lock me-2"></i>
                                Password
                            </label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    id="password"
                                    name="password"
                                    className="form-control"
                                    placeholder="Enter your password (min 10 chars, mixed complexity)"
                                    value={formData.password}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex="-1"
                                >
                                    <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPassword">
                                <i className="bi bi-lock-fill me-2"></i>
                                Confirm Password
                            </label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    className="form-control"
                                    placeholder="Confirm your password"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    tabIndex="-1"
                                >
                                    <i className={`bi bi-eye${showConfirmPassword ? '-slash' : ''}`}></i>
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-login"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                    Creating Account...
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-person-plus me-2"></i>
                                    Sign Up
                                </>
                            )}
                        </button>
                    </form>

                    <div className="login-footer">
                        <p>
                            Already have an account?{' '}
                            <button
                                className="link-button"
                                onClick={onSwitchToLogin}
                                disabled={loading}
                            >
                                Login here
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Signup;
