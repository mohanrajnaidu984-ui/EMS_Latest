/**
 * Keep Jodit image resizer aligned in quote preview (CSS transform zoom + table cells).
 * Jodit positions from offsetWidth/offsetTop; we mirror the visual box via getBoundingClientRect.
 */

const EMS_IMG_RESIZER_HANDLE_MIN = 24;
const EMS_IMG_RESIZER_LOOP_KEY = '__emsImgResizerLoopActive';
const EMS_IMG_RESIZER_DRAG_KEY = '__emsImgResizerDragging';

const RESIZER_HANDLE_SELECTOR =
    '.jodit-resizer__top-left, .jodit-resizer__top-right, .jodit-resizer__bottom-right, .jodit-resizer__bottom-left';

export function getQuotePreviewZoomScale(el) {
    const shell = el?.closest?.('.quote-preview-zoom-shell');
    if (!shell) return 1;
    if (typeof getComputedStyle !== 'undefined') {
        const varZoom = getComputedStyle(shell).getPropertyValue('--quote-preview-zoom').trim();
        if (varZoom) {
            const parsed = parseFloat(varZoom);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        const tr = getComputedStyle(shell).transform;
        if (tr && tr !== 'none') {
            const matrix = tr.match(/matrix\(([^)]+)\)/);
            if (matrix) {
                const scaleX = parseFloat(matrix[1].split(',')[0]);
                if (Number.isFinite(scaleX) && scaleX > 0) return scaleX;
            }
            const scale = tr.match(/scale\(([^)]+)\)/);
            if (scale) {
                const scaleX = parseFloat(scale[1]);
                if (Number.isFinite(scaleX) && scaleX > 0) return scaleX;
            }
        }
    }
    return 1;
}

function isQuotePreviewImageContext(el) {
    return Boolean(el?.closest?.('#quote-preview, .quote-preview-zoom-shell'));
}

function getPointerXY(e) {
    if (e.touches?.length) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches?.length) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function applyImageDimensions(jodit, img, widthPx, heightPx) {
    const w = Math.max(EMS_IMG_RESIZER_HANDLE_MIN, Math.round(widthPx));
    const h = Math.max(EMS_IMG_RESIZER_HANDLE_MIN, Math.round(heightPx));
    img.style.setProperty('max-width', 'none', 'important');
    img.style.setProperty('max-height', 'none', 'important');
    img.style.setProperty('width', `${w}px`, 'important');
    img.style.setProperty('height', `${h}px`, 'important');
    if (jodit?.o?.resizer?.forImageChangeAttributes) {
        img.setAttribute('width', String(w));
        img.setAttribute('height', String(h));
    }
}

function resizerHandleAxes(className = '') {
    const name = String(className);
    return {
        left: /left/i.test(name),
        top: /top/i.test(name),
    };
}

function imageKeepsAspectRatio(jodit) {
    const rule = jodit?.o?.resizer?.useAspectRatio;
    if (rule === true) return true;
    if (rule instanceof Set) return rule.has('img');
    return false;
}

function getVisibleResizer(jodit) {
    const workplace = jodit?.workplace;
    const inWorkplace = workplace?.querySelector?.(':scope > .jodit-resizer');
    if (inWorkplace) return inWorkplace;
    return (
        jodit?.container?.querySelector?.('.jodit-resizer') ||
        jodit?.editor?.ownerDocument?.body?.querySelector?.('.jodit-resizer') ||
        null
    );
}

function resolveTrackedImage(jodit, resizer, trackedImg) {
    if (trackedImg?.isConnected && jodit.editor?.contains(trackedImg)) {
        return trackedImg;
    }
    try {
        const current = jodit.s?.current?.();
        if (current?.tagName === 'IMG' && jodit.editor?.contains(current)) {
            return current;
        }
    } catch {
        /* ignore */
    }
    if (!resizer || !jodit.editor) return null;

    const resizerRect = resizer.getBoundingClientRect();
    const cx = resizerRect.left + resizerRect.width / 2;
    const cy = resizerRect.top + resizerRect.height / 2;
    let best = null;
    let bestArea = Infinity;

    jodit.editor.querySelectorAll('img').forEach((img) => {
        const r = img.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const inside = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
        const area = r.width * r.height;
        if (inside && area < bestArea) {
            best = img;
            bestArea = area;
        }
    });
    if (best) return best;

    let nearest = null;
    let nearestDist = Infinity;
    jodit.editor.querySelectorAll('img').forEach((img) => {
        const r = img.getBoundingClientRect();
        const dx = cx < r.left ? r.left - cx : cx > r.right ? cx - r.right : 0;
        const dy = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
        const dist = dx * dx + dy * dy;
        if (dist < nearestDist) {
            nearest = img;
            nearestDist = dist;
        }
    });
    return nearest;
}

export function registerClauseEditorImageResizerZoomSync(jodit) {
    if (!jodit || jodit.__emsImgResizerZoom) return;
    jodit.__emsImgResizerZoom = true;

    let trackedImg = null;

    const syncImagePopup = (img) => {
        if (!img) return;
        const doc = img.ownerDocument || document;
        const popups = doc.querySelectorAll('.jodit-popup');
        const imgRect = img.getBoundingClientRect();
        popups.forEach((popup) => {
            if (!(popup instanceof HTMLElement)) return;
            const style = getComputedStyle(popup);
            if (style.display === 'none' || style.visibility === 'hidden') return;
            const popupRect = popup.getBoundingClientRect();
            if (!popupRect.width || !popupRect.height) return;
            popup.style.setProperty('position', 'fixed', 'important');
            popup.style.setProperty(
                'top',
                `${Math.max(8, imgRect.top - popupRect.height - 8)}px`,
                'important'
            );
            popup.style.setProperty(
                'left',
                `${imgRect.left + imgRect.width / 2 - popupRect.width / 2}px`,
                'important'
            );
            popup.style.setProperty('z-index', '10000009', 'important');
        });
    };

    const syncOverlay = () => {
        if (jodit[EMS_IMG_RESIZER_DRAG_KEY]) return false;

        const resizer = getVisibleResizer(jodit);
        if (!resizer) return false;

        const img = resolveTrackedImage(jodit, resizer, trackedImg);
        if (!img) return false;
        trackedImg = img;

        if (!isQuotePreviewImageContext(img)) return false;

        const imgRect = img.getBoundingClientRect();
        if (!imgRect.width || !imgRect.height) return false;

        const doc = resizer.ownerDocument || document;
        if (resizer.parentNode !== doc.body) {
            doc.body.appendChild(resizer);
        }

        resizer.style.setProperty('position', 'fixed', 'important');
        resizer.style.setProperty('top', `${imgRect.top}px`, 'important');
        resizer.style.setProperty('left', `${imgRect.left}px`, 'important');
        resizer.style.setProperty('width', `${imgRect.width}px`, 'important');
        resizer.style.setProperty('height', `${imgRect.height}px`, 'important');
        resizer.style.setProperty('margin', '0', 'important');
        resizer.style.setProperty('z-index', '10000008', 'important');
        resizer.style.setProperty('box-sizing', 'border-box', 'important');
        resizer.style.setProperty('pointer-events', 'none', 'important');
        resizer.querySelectorAll(RESIZER_HANDLE_SELECTOR).forEach((handle) => {
            handle.style.setProperty('pointer-events', 'auto', 'important');
        });
        syncImagePopup(img);
        return true;
    };

    const stopSyncLoop = () => {
        jodit[EMS_IMG_RESIZER_LOOP_KEY] = false;
    };

    const runSyncLoop = () => {
        if (!jodit[EMS_IMG_RESIZER_LOOP_KEY]) return;
        syncOverlay();
        requestAnimationFrame(runSyncLoop);
    };

    const startSyncLoop = () => {
        if (jodit[EMS_IMG_RESIZER_LOOP_KEY]) return;
        jodit[EMS_IMG_RESIZER_LOOP_KEY] = true;
        requestAnimationFrame(runSyncLoop);
    };

    const scheduleSync = () => {
        if (jodit.__emsImgResizerRaf) {
            cancelAnimationFrame(jodit.__emsImgResizerRaf);
        }
        jodit.__emsImgResizerRaf = requestAnimationFrame(() => {
            jodit.__emsImgResizerRaf = null;
            if (syncOverlay()) {
                startSyncLoop();
            }
        });
    };

    const trackImage = (img) => {
        if (!img || img.tagName !== 'IMG' || !jodit.editor?.contains(img)) return;
        trackedImg = img;
        scheduleSync();
        window.setTimeout(scheduleSync, 0);
        window.setTimeout(scheduleSync, 32);
        window.setTimeout(scheduleSync, 120);
    };

    const onZoomResizeMove = (startX, startY, startW, startH, zoom, axes, keepAspect, img) => {
        const ratio = startW / Math.max(1, startH);
        return (ev) => {
            if (!img?.isConnected) return;
            const { x, y } = getPointerXY(ev);
            const diffX = (x - startX) / zoom;
            const diffY = (y - startY) / zoom;
            let newW = startW;
            let newH = startH;

            if (keepAspect) {
                const wDelta = axes.left ? -diffX : diffX;
                const hDelta = axes.top ? -diffY : diffY;
                if (Math.abs(wDelta) >= Math.abs(hDelta)) {
                    newW = startW + wDelta;
                    newH = newW / ratio;
                } else {
                    newH = startH + hDelta;
                    newW = newH * ratio;
                }
            } else {
                newW = startW + (axes.left ? -diffX : diffX);
                newH = startH + (axes.top ? -diffY : diffY);
            }

            applyImageDimensions(jodit, img, newW, newH);
            jodit[EMS_IMG_RESIZER_DRAG_KEY] = true;
            syncOverlay();
            jodit[EMS_IMG_RESIZER_DRAG_KEY] = false;
            try {
                jodit.e.fire('resize');
            } catch {
                /* ignore */
            }
        };
    };

    const onHandlePointerDown = (e) => {
        const handle = e.target?.closest?.(RESIZER_HANDLE_SELECTOR);
        if (!handle) return;

        const resizer = handle.closest('.jodit-resizer');
        const img = resolveTrackedImage(jodit, resizer, trackedImg);
        if (!img || !isQuotePreviewImageContext(img)) return;

        const zoom = getQuotePreviewZoomScale(img);
        const needsCustomDrag = Math.abs(zoom - 1) >= 0.001;
        if (!needsCustomDrag) {
            trackedImg = img;
            jodit[EMS_IMG_RESIZER_DRAG_KEY] = true;
            stopSyncLoop();
            const doc = jodit.ed?.ownerDocument || document;
            const onUp = () => {
                jodit[EMS_IMG_RESIZER_DRAG_KEY] = false;
                doc.removeEventListener('mouseup', onUp, true);
                doc.removeEventListener('touchend', onUp, true);
                jodit.synchronizeValues?.();
                scheduleSync();
            };
            doc.addEventListener('mouseup', onUp, true);
            doc.addEventListener('touchend', onUp, true);
            return;
        }

        trackedImg = img;
        e.preventDefault();
        e.stopImmediatePropagation();

        const { x: startX, y: startY } = getPointerXY(e);
        const startW = img.offsetWidth || img.getBoundingClientRect().width / zoom;
        const startH = img.offsetHeight || img.getBoundingClientRect().height / zoom;
        const axes = resizerHandleAxes(handle.className);
        const keepAspect = imageKeepsAspectRatio(jodit);
        const onMove = onZoomResizeMove(startX, startY, startW, startH, zoom, axes, keepAspect, img);

        jodit[EMS_IMG_RESIZER_DRAG_KEY] = true;
        stopSyncLoop();
        handle.classList.add('ems-img-resizer-active');
        img.classList.add('ems-img-resizer-target');

        const doc = jodit.ed?.ownerDocument || document;

        const onUp = () => {
            jodit[EMS_IMG_RESIZER_DRAG_KEY] = false;
            handle.classList.remove('ems-img-resizer-active');
            img.classList.remove('ems-img-resizer-target');
            doc.removeEventListener('mousemove', onMove, true);
            doc.removeEventListener('mouseup', onUp, true);
            doc.removeEventListener('touchmove', onMove, true);
            doc.removeEventListener('touchend', onUp, true);
            jodit.synchronizeValues?.();
            try {
                jodit.e.fire('resize');
                jodit.e.fire('change');
            } catch {
                /* ignore */
            }
            scheduleSync();
        };

        doc.addEventListener('mousemove', onMove, true);
        doc.addEventListener('mouseup', onUp, true);
        doc.addEventListener('touchmove', onMove, { capture: true, passive: false });
        doc.addEventListener('touchend', onUp, true);
    };

    const onResizerVisibilityChange = () => {
        const resizer = getVisibleResizer(jodit);
        if (resizer) {
            scheduleSync();
            return;
        }
        stopSyncLoop();
        trackedImg = null;
    };

    const onEditorMouseDownCapture = (e) => {
        const img = e.target?.closest?.('img');
        if (img) trackImage(img);
    };

    jodit.e.on(jodit.editor, 'click.emsImgResizerZoom', (e) => {
        const img = e.target?.closest?.('img');
        if (img) trackImage(img);
    });

    if (jodit.editor) {
        jodit.editor.addEventListener('mousedown', onEditorMouseDownCapture, true);
    }

    jodit.e.on('resize.emsImgResizerZoom', scheduleSync);
    jodit.e.on('afterInsertImage.emsImgResizerZoom', trackImage);
    jodit.e.on('showPopup.emsImgResizerZoom', (_pos, tag, target) => {
        if (String(tag || '').toLowerCase() === 'img' && target?.tagName === 'IMG') {
            trackImage(target);
        }
    });
    jodit.e.on(jodit.editor, 'scroll.emsImgResizerZoom', scheduleSync);

    const viewport = jodit.editor?.closest?.('.quote-preview-zoom-viewport');
    viewport?.addEventListener('scroll', scheduleSync, { passive: true });
    window.addEventListener('resize', scheduleSync, { passive: true });

    const shell = jodit.editor?.closest?.('.quote-preview-zoom-shell');
    if (shell && typeof MutationObserver !== 'undefined') {
        const mo = new MutationObserver(scheduleSync);
        mo.observe(shell, { attributes: true, attributeFilter: ['style'] });
        jodit.e.on('beforeDestruct.emsImgResizerZoom', () => mo.disconnect());
    }

    const workplace = jodit.workplace;
    if (workplace && typeof MutationObserver !== 'undefined') {
        const resizerObs = new MutationObserver(onResizerVisibilityChange);
        resizerObs.observe(workplace, { childList: true, subtree: true });
        jodit.e.on('beforeDestruct.emsImgResizerZoom', () => resizerObs.disconnect());
    }

    const doc = jodit.ed?.ownerDocument || document;
    doc.addEventListener('mousedown', onHandlePointerDown, true);
    doc.addEventListener('touchstart', onHandlePointerDown, { capture: true, passive: false });

    jodit.e.on('hideResizer.emsImgResizerZoom', () => {
        stopSyncLoop();
        trackedImg = null;
    });

    jodit.e.on('beforeDestruct.emsImgResizerZoom', () => {
        stopSyncLoop();
        if (jodit.__emsImgResizerRaf) cancelAnimationFrame(jodit.__emsImgResizerRaf);
        viewport?.removeEventListener('scroll', scheduleSync);
        window.removeEventListener('resize', scheduleSync);
        doc.removeEventListener('mousedown', onHandlePointerDown, true);
        doc.removeEventListener('touchstart', onHandlePointerDown, true);
        jodit.editor?.removeEventListener('mousedown', onEditorMouseDownCapture, true);
        trackedImg = null;
    });
}
