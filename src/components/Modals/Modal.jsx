import React, { useRef } from 'react';
import ReactDOM from 'react-dom';
import Draggable from 'react-draggable';

const Modal = ({ show, title, onClose, children, footer, maxWidth }) => {
    const nodeRef = useRef(null);

    if (!show) return null;

    return ReactDOM.createPortal(
        <div className="modal d-block show" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10050 }}>
            <Draggable
                nodeRef={nodeRef}
                cancel="input, textarea, button, select, option, label, .btn-close"
            >
                <div ref={nodeRef} className="modal-dialog modal-lg" style={{ marginTop: '50px', maxWidth: maxWidth }}>
                    <div className="modal-content" style={{ boxShadow: '0 5px 15px rgba(0,0,0,0.5)' }}>
                        <div className="modal-header" style={{ cursor: 'move' }}>
                            <h5 className="modal-title">{title}</h5>
                            <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
                        </div>
                        <div className="modal-body">
                            {children}
                        </div>
                        {footer && (
                            <div className="modal-footer">
                                {footer}
                            </div>
                        )}
                    </div>
                </div>
            </Draggable>
        </div>,
        document.body
    );
};

export default Modal;
