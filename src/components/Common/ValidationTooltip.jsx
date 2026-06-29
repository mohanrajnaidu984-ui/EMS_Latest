import React from 'react';

const ValidationTooltip = ({ message }) => {
    if (!message) return null;
    return (
        <div style={{ position: 'absolute', zIndex: 100, marginTop: '5px' }}>
            <div style={{
                position: 'relative',
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                borderRadius: '4px',
                padding: '8px 12px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                fontSize: '13px',
                color: '#333',
                minWidth: 'max-content'
            }}>
                {/* Upward Arrow Border */}
                <div style={{
                    position: 'absolute',
                    top: '-6px',
                    left: '15px',
                    width: '0',
                    height: '0',
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '6px solid #ccc'
                }}></div>
                {/* Upward Arrow Background */}
                <div style={{
                    position: 'absolute',
                    top: '-5px',
                    left: '15px',
                    width: '0',
                    height: '0',
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '6px solid #fff'
                }}></div>

                {/* Warning Icon */}
                <div style={{
                    width: '20px',
                    height: '20px',
                    backgroundColor: '#ff9800',
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '10px',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    flexShrink: 0
                }}>!</div>

                {/* Error Message */}
                <span style={{ fontWeight: 500 }}>{message}</span>
            </div>
        </div>
    );
};

export default ValidationTooltip;
