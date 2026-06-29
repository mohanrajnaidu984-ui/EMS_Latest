import React, { useState, useRef, useEffect } from 'react';
import Modal from './Modal';
import Draggable from 'react-draggable';
import { useAuth } from '../../context/AuthContext';

const ProfileImageModal = ({ show, onClose, onSave }) => {
    const [image, setImage] = useState(null);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const fileInputRef = useRef(null);
    const imageRef = useRef(null);
    const wrapperRef = useRef(null); // Ref for Draggable wrapper
    const [loading, setLoading] = useState(false);
    const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });
    const containerRef = useRef(null);

    // Passive: false listener to ensure preventDefault works
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const direction = e.deltaY < 0 ? 1 : -1;
            const step = 0.1;
            setScale(prev => Math.min(Math.max(prev + (direction * step), 1), 3));
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, [image]);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                const img = new Image();
                img.src = reader.result;
                img.onload = () => {
                    setImage(reader.result);
                    setScale(1);
                    setPosition({ x: 0, y: 0 });
                };
            });
            reader.readAsDataURL(e.target.files[0]);
        }
    };


    const handleImageLoad = (e) => {
        const { naturalWidth, naturalHeight } = e.target;
        // Logic to fit image in 250x250 container
        // If landscape, fit height = 250, width = auto
        // If portrait, fit width = 250, height = auto
        // Actually, we want it to COVER the area usually, but for easy cropping, fitting one dimension is good.
        // Let's go with "Fit one dimension so at least one fills the box"
        // But for cropping, we usually want to be able to zoom in from a "contain" or "cover" state.
        // Let's try to make it render with height 250px by default as previously, but handle width properly.

        const aspect = naturalWidth / naturalHeight;
        let renderedWidth, renderedHeight;
        const containerSize = 250;

        if (naturalHeight > naturalWidth) {
            // Portrait
            renderedWidth = containerSize;
            renderedHeight = containerSize / aspect;
        } else {
            // Landscape or Square
            renderedHeight = containerSize;
            renderedWidth = containerSize * aspect;
        }
        setImgDimensions({ width: renderedWidth, height: renderedHeight });
    };

    const handleSave = async () => {
        if (!image) return;
        setLoading(true);

        const canvas = document.createElement('canvas');
        const size = 200; // Output size
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.src = image;

        img.onload = () => {
            const containerSize = 250;
            const factor = size / containerSize; // 0.8

            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, size, size);

            // Save context
            ctx.save();

            // 1. Scale to match canvas coordinate system (200 vs 250)
            ctx.scale(factor, factor);

            // 2. Apply Translation (Draggable position)
            // Draggable moves the wrapper.
            ctx.translate(position.x, position.y);

            // 3. Apply Scale (Zoom)
            // Original CSS transform: scale(scale). Transform origin: top left.
            ctx.scale(scale, scale);

            // 4. Draw Image
            // We need to draw it at the same size it is rendered on screen (before scale)
            // We calculated dimensions in handleImageLoad, but simpler to recalc or trust layout.
            // Let's recalculate simply:
            const aspect = img.naturalWidth / img.naturalHeight;
            let dw, dh;
            // Logic must match the CSS styling logic below
            // Below: defaults to height 250px usually.
            // Let's replicate CSS logic:
            if (img.naturalHeight > img.naturalWidth) {
                // width: 250px, height: auto
                dw = containerSize;
                dh = containerSize / aspect;
            } else {
                // height: 250px, width: auto
                dh = containerSize;
                dw = containerSize * aspect;
            }

            ctx.drawImage(img, 0, 0, dw, dh);

            ctx.restore();

            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            onSave(base64);
            setLoading(false);
            onClose();
        };
    };

    return (
        <Modal
            show={show}
            title="Update Profile Picture"
            onClose={onClose}
            footer={
                <>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={!image || loading}>
                        {loading ? 'Saving...' : 'Save & Update'}
                    </button>
                </>
            }
        >
            <div className="d-flex flex-column align-items-center">
                {!image ? (
                    <div
                        className="d-flex align-items-center justify-content-center bg-light border border-dashed rounded mb-3"
                        style={{ width: '250px', height: '250px', cursor: 'pointer' }}
                        onClick={() => fileInputRef.current.click()}
                    >
                        <div className="text-center text-secondary">
                            <i className="bi bi-camera fs-1"></i>
                            <p className="mb-0 mt-2">Click to upload</p>
                        </div>
                    </div>
                ) : (
                    <div
                        ref={containerRef}
                        className="mb-3 position-relative"
                        style={{ width: '250px', height: '250px', overflow: 'hidden', border: '2px solid #ddd', borderRadius: '50%' }}
                    >
                        <Draggable
                            nodeRef={wrapperRef}
                            position={position}
                            onStart={(e) => e.stopPropagation()}
                            onDrag={(e, data) => {
                                e.stopPropagation();
                                setPosition({ x: data.x, y: data.y });
                            }}
                        >
                            <div ref={wrapperRef} style={{ transformOrigin: 'top left', cursor: 'move' }}>
                                <img
                                    ref={imageRef}
                                    src={image}
                                    alt="Crop Preview"
                                    onLoad={handleImageLoad}
                                    style={{
                                        maxWidth: 'none',
                                        // Match Logic: Portrait -> width 250, Landscape -> height 250
                                        // This ensures at least one dimension fits perfectly without gaps if scale=1
                                        // But wait, if aspect > 1 (Landscape), height=250. width > 250. OK.
                                        // If aspect < 1 (Portrait), width=250. height > 250. OK.
                                        height: imgDimensions.height > 0 && imgDimensions.width > imgDimensions.height ? '250px' : 'auto',
                                        width: imgDimensions.width > 0 && imgDimensions.height >= imgDimensions.width ? '250px' : 'auto',

                                        transformOrigin: 'top left',
                                        transform: `scale(${scale})`,
                                        userSelect: 'none',
                                        display: 'block'
                                    }}
                                    draggable={false}
                                />
                            </div>
                        </Draggable>
                    </div>
                )}

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="d-none"
                />

                {image && (
                    <div className="w-75 mb-3 text-center">
                        <p className="small text-muted mb-2">Drag to adjust • Scroll to zoom</p>
                        <div className="text-center mt-2">
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => { setImage(null); fileInputRef.current.value = ''; }}>
                                Change Image
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ProfileImageModal;
