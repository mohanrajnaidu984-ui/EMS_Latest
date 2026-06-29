import React from 'react';

/** Placeholder until B2C quote format is defined. */
export default function QuoteB2CPlaceholder() {
    return (
        <div
            className="d-flex flex-column align-items-center justify-content-center text-muted"
            style={{ minHeight: 'calc(100vh - 88px)', padding: '2rem' }}
        >
            <i className="bi bi-file-earmark-person display-4 mb-3" style={{ color: '#94a3b8' }} aria-hidden />
            <h5 className="text-secondary fw-semibold mb-2">B2C Quote</h5>
            <p className="mb-0 text-center" style={{ maxWidth: '28rem' }}>
                B2C quote format will be available here. Content to be configured later.
            </p>
        </div>
    );
}
