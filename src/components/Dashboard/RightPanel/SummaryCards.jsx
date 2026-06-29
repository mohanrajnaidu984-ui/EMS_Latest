import React from 'react';
import { Target, AlertCircle, Clock, CheckCircle } from 'lucide-react';

const SummaryCards = ({ data }) => {
    return (
        <div className="row g-3 h-100">
            {/* Enquiries Metrics */}
            <div className="col-md-4">
                <div className="card h-100 border-0 shadow-sm position-relative overflow-hidden"
                    style={{ borderRadius: '16px', background: 'linear-gradient(145deg, #ffffff 0%, #f7f9fc 100%)' }}>
                    <div className="card-body p-4 position-relative z-1">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="text-secondary fw-semibold small text-uppercase" style={{ letterSpacing: '0.05em' }}>Enquiries Today</div>
                            <span className="badge bg-success bg-opacity-10 text-success rounded-pill px-2 py-1" style={{ fontSize: '0.6rem' }}>Daily Target</span>
                        </div>
                        <div className="d-flex align-items-baseline gap-2">
                            <h1 className="display-4 fw-bold text-dark mb-0" style={{ letterSpacing: '-0.02em' }}>{data?.EnquiriesToday || 0}</h1>
                            <div className="d-flex flex-column">
                                <span className="text-success small fw-bold">↑ 12%</span>
                                <span className="text-muted" style={{ fontSize: '0.65rem' }}>vs yesterday</span>
                            </div>
                        </div>
                    </div>
                    {/* Watermark Icon */}
                    <div className="position-absolute end-0 bottom-0 opacity-10 p-3" style={{ transform: 'scale(1.5) translate(10%, 10%)' }}>
                        <Target size={64} color="#667eea" />
                    </div>
                    {/* Top Accent */}
                    <div className="position-absolute top-0 start-0 w-100" style={{ height: '4px', background: 'linear-gradient(90deg, #667eea, #764ba2)' }}></div>
                </div>
            </div>

            {/* Due Metrics */}
            <div className="col-md-4">
                <div className="card h-100 border-0 shadow-sm position-relative overflow-hidden"
                    style={{ borderRadius: '16px', background: 'linear-gradient(145deg, #ffffff 0%, #fff5f5 100%)' }}>
                    <div className="card-body p-4 position-relative z-1">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="text-secondary fw-semibold small text-uppercase" style={{ letterSpacing: '0.05em' }}>Due Today</div>
                            <span className="badge bg-danger bg-opacity-10 text-danger rounded-pill px-2 py-1" style={{ fontSize: '0.6rem' }}>Critical</span>
                        </div>
                        <div className="d-flex align-items-baseline gap-2">
                            <h1 className="display-4 fw-bold text-dark mb-0" style={{ letterSpacing: '-0.02em' }}>{data?.DueToday || 0}</h1>
                            <div className="d-flex flex-column">
                                <span className="text-danger small fw-bold">Action Req</span>
                                <span className="text-muted" style={{ fontSize: '0.65rem' }}>pending closure</span>
                            </div>
                        </div>
                    </div>
                    {/* Watermark Icon */}
                    <div className="position-absolute end-0 bottom-0 opacity-10 p-3" style={{ transform: 'scale(1.5) translate(10%, 10%)' }}>
                        <AlertCircle size={64} color="#dc3545" />
                    </div>
                    {/* Top Accent */}
                    <div className="position-absolute top-0 start-0 w-100" style={{ height: '4px', background: 'linear-gradient(90deg, #ff0844, #ffb199)' }}></div>
                </div>
            </div>

            {/* Quoted Metrics */}
            <div className="col-md-4">
                <div className="card h-100 border-0 shadow-sm position-relative overflow-hidden"
                    style={{ borderRadius: '16px', background: 'linear-gradient(145deg, #ffffff 0%, #f0fff4 100%)' }}>
                    <div className="card-body p-4 position-relative z-1">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="text-secondary fw-semibold small text-uppercase" style={{ letterSpacing: '0.05em' }}>Quoted</div>
                            <span className="badge bg-success bg-opacity-10 text-success rounded-pill px-2 py-1" style={{ fontSize: '0.6rem' }}>Submitted</span>
                        </div>
                        <div className="d-flex align-items-baseline gap-2">
                            <h1 className="display-4 fw-bold text-dark mb-0" style={{ letterSpacing: '-0.02em' }}>{data?.QuotedCount || 0}</h1>
                            <div className="d-flex flex-column">
                                <span className="text-success small fw-bold">Total</span>
                                <span className="text-muted" style={{ fontSize: '0.65rem' }}>submitted quotes</span>
                            </div>
                        </div>
                    </div>
                    {/* Watermark Icon */}
                    <div className="position-absolute end-0 bottom-0 opacity-10 p-3" style={{ transform: 'scale(1.5) translate(10%, 10%)' }}>
                        <CheckCircle size={64} color="#28a745" />
                    </div>
                    {/* Top Accent */}
                    <div className="position-absolute top-0 start-0 w-100" style={{ height: '4px', background: 'linear-gradient(90deg, #11998e, #38ef7d)' }}></div>
                </div>
            </div>
        </div>
    );
};

export default SummaryCards;
