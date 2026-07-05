import React, { useState, useEffect, useRef, useCallback } from 'react';

import { useAuth } from '../../context/AuthContext';

import { format } from 'date-fns';



const ACTIVE_PAGE_SIZE = 50;

const HISTORY_PAGE_SIZE = 30;

const POLL_INTERVAL_MS = 30000;



const NotificationDropdown = ({ onOpenEnquiry }) => {

    const { currentUser } = useAuth();

    const [notifications, setNotifications] = useState([]);

    const [isOpen, setIsOpen] = useState(false);

    const [view, setView] = useState('active');

    const dropdownRef = useRef(null);

    const [activeCount, setActiveCount] = useState(0);

    const [loading, setLoading] = useState(false);

    const [loadingMore, setLoadingMore] = useState(false);

    const [hasMore, setHasMore] = useState(false);

    const fetchAbortRef = useRef(null);



    useEffect(() => {

        const handleClickOutside = (event) => {

            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {

                setIsOpen(false);

            }

        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => document.removeEventListener('mousedown', handleClickOutside);

    }, []);



    const fetchActiveCount = useCallback(async () => {

        if (!currentUser) return;

        try {

            const res = await fetch(`/api/notifications/${currentUser.id}/count`);

            if (res.ok) {

                const data = await res.json();

                setActiveCount(data.count ?? 0);

            }

        } catch (err) {

            console.error('Failed to fetch notification count', err);

        }

    }, [currentUser]);



    const parseNotificationResponse = (data) => {

        if (Array.isArray(data)) {

            return { items: data, hasMore: false };

        }

        return {

            items: data.items ?? [],

            hasMore: Boolean(data.hasMore),

        };

    };



    const fetchNotifications = useCallback(async (targetView = view, { append = false, offset = 0 } = {}) => {

        if (!currentUser) return;



        fetchAbortRef.current?.abort();

        const controller = new AbortController();

        fetchAbortRef.current = controller;



        if (append) {

            setLoadingMore(true);

        } else {

            setLoading(true);

        }



        try {

            const isHistory = targetView === 'history';

            const pageSize = isHistory ? HISTORY_PAGE_SIZE : ACTIVE_PAGE_SIZE;

            const params = new URLSearchParams();

            if (isHistory) params.set('history', '1');

            params.set('limit', String(pageSize));

            if (offset > 0) params.set('offset', String(offset));



            const res = await fetch(

                `/api/notifications/${currentUser.id}?${params.toString()}`,

                { signal: controller.signal }

            );

            if (!res.ok) return;



            const data = await res.json();

            const { items, hasMore: moreAvailable } = parseNotificationResponse(data);



            setHasMore(moreAvailable);

            setNotifications((prev) => (append ? [...prev, ...items] : items));

        } catch (err) {

            if (err.name !== 'AbortError') {

                console.error('Failed to fetch notifications', err);

            }

        } finally {

            if (!controller.signal.aborted) {

                setLoading(false);

                setLoadingMore(false);

            }

        }

    }, [currentUser, view]);



    const loadMore = () => {

        if (loadingMore || !hasMore) return;

        fetchNotifications(view, { append: true, offset: notifications.length });

    };



    useEffect(() => {

        fetchActiveCount();

        const interval = setInterval(fetchActiveCount, POLL_INTERVAL_MS);

        return () => clearInterval(interval);

    }, [fetchActiveCount]);



    useEffect(() => {

        if (isOpen) {

            setNotifications([]);

            setHasMore(false);

            fetchNotifications(view);

        } else {

            fetchAbortRef.current?.abort();

            setLoading(false);

            setLoadingMore(false);

        }

    }, [isOpen, view, fetchNotifications]);



    useEffect(() => {

        if (!isOpen) return;

        const interval = setInterval(() => fetchNotifications(view), POLL_INTERVAL_MS);

        return () => clearInterval(interval);

    }, [isOpen, view, fetchNotifications]);



    const notificationIdOf = (n) => n?.ID ?? n?.id;

    const removeFromActiveList = useCallback((id) => {
        if (id == null) return;
        setNotifications((prev) => prev.filter((n) => notificationIdOf(n) !== id));
        setActiveCount((prev) => Math.max(0, prev - 1));
    }, []);

    const acknowledgeNotification = useCallback(async (id) => {
        if (id == null) return false;
        const res = await fetch(`/api/notifications/${id}/ack`, { method: 'PUT' });
        return res.ok;
    }, []);



    const navigateFromNotification = async (notification) => {
        const id = notificationIdOf(notification);
        if (id != null) {
            try {
                const ok = await acknowledgeNotification(id);
                if (ok) {
                    removeFromActiveList(id);
                }
            } catch (err) {
                console.error('Failed to acknowledge notification on open', err);
            }
        }

        setIsOpen(false);



        const rawLink = notification.LinkID;

        const isSystemMsg = rawLink === 'Profile' || rawLink === 'System';

        if (rawLink && onOpenEnquiry && !isSystemMsg) {

            let linkTarget = rawLink;

            if (typeof rawLink === 'string') {

                const t = rawLink.trim();

                if (t.startsWith('{') && t.endsWith('}')) {

                    try {

                        linkTarget = JSON.parse(t);

                    } catch {

                        linkTarget = rawLink;

                    }

                }

            }

            onOpenEnquiry(linkTarget);

        }

    };



    const handleAck = async (e, notification) => {
        e.stopPropagation();
        const id = notificationIdOf(notification);
        if (id == null) return;

        removeFromActiveList(id);

        try {
            const ok = await acknowledgeNotification(id);
            if (!ok) {
                await fetchNotifications('active');
                await fetchActiveCount();
                return;
            }
            await fetchActiveCount();
        } catch (err) {
            console.error('Failed to acknowledge notification', err);
            await fetchNotifications('active');
            await fetchActiveCount();
        }
    };



    const formatTime = (dateStr) => {

        if (!dateStr) return '';

        const date = new Date(dateStr);

        const now = new Date();

        const diffInSeconds = Math.floor((now - date) / 1000);



        if (diffInSeconds < 60) return 'Just now';

        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;

        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;

        return format(date, 'dd-MMM-yyyy');

    };



    const handleAckAll = async (e) => {
        e.stopPropagation();
        if (!currentUser) return;

        const previous = notifications;
        setNotifications([]);
        setActiveCount(0);
        setHasMore(false);

        try {
            const res = await fetch(`/api/notifications/${currentUser.id}/ack-all`, { method: 'PUT' });
            if (!res.ok) {
                setNotifications(previous);
                await fetchActiveCount();
                await fetchNotifications('active');
                return;
            }
            await fetchActiveCount();
        } catch (err) {
            console.error('Failed to acknowledge all notifications', err);
            setNotifications(previous);
            await fetchActiveCount();
            await fetchNotifications('active');
        }
    };



    const renderMessage = (message, linkId) => {

        if (!linkId) return message;

        if (typeof linkId === 'string') {

            const t = linkId.trim();

            if (t.startsWith('{') && t.endsWith('}')) return message;

        }



        const parts = message.split(new RegExp(`(${linkId})`, 'gi'));

        return (

            <span>

                {parts.map((part, i) =>

                    part.toLowerCase() === linkId.toLowerCase() ? (

                        <span key={i} className="text-primary text-decoration-underline fw-bold">{part}</span>

                    ) : (

                        <span key={i}>{part}</span>

                    )

                )}

            </span>

        );

    };



    const isHistory = view === 'history';



    return (

        <div className="position-relative me-3" ref={dropdownRef}>

            <button

                className="btn btn-light position-relative rounded-circle d-flex align-items-center justify-content-center border-0 shadow-sm"

                style={{ width: '32px', height: '32px' }}

                onClick={() => setIsOpen(!isOpen)}

                aria-label="Notifications"

            >

                <i className="bi bi-bell fs-6 text-secondary"></i>

                {activeCount > 0 && (

                    <span

                        className="position-absolute top-0 end-0 badge rounded-pill bg-danger"

                        style={{ fontSize: '0.6rem', marginTop: '0px', marginRight: '0px' }}

                    >

                        {activeCount}

                    </span>

                )}

            </button>



            {isOpen && (

                <div

                    className="card position-absolute end-0 mt-2 shadow-lg border-0"

                    style={{ width: '380px', zIndex: 999, maxHeight: '440px', overflow: 'hidden' }}

                >

                    <div className="card-header bg-white border-bottom py-2">

                        <div className="d-flex justify-content-between align-items-center mb-2">

                            <h6 className="mb-0 fw-bold">Notifications</h6>

                            {!isHistory && !loading && notifications.length > 0 && (

                                <button

                                    className="btn btn-link btn-sm text-decoration-none p-0"

                                    style={{ fontSize: '0.8rem' }}

                                    onClick={handleAckAll}

                                >

                                    ACK All

                                </button>

                            )}

                        </div>

                        <div className="btn-group btn-group-sm w-100" role="group" aria-label="Notification views">

                            <button

                                type="button"

                                className={`btn ${!isHistory ? 'btn-primary' : 'btn-outline-secondary'}`}

                                onClick={() => setView('active')}

                                disabled={loading && !isHistory}

                            >

                                Active

                                {activeCount > 0 ? ` (${activeCount})` : ''}

                            </button>

                            <button

                                type="button"

                                className={`btn ${isHistory ? 'btn-primary' : 'btn-outline-secondary'}`}

                                onClick={() => setView('history')}

                                disabled={loading && isHistory}

                            >

                                History

                            </button>

                        </div>

                    </div>

                    <div className="card-body p-0" style={{ overflowY: 'auto', maxHeight: '350px' }}>

                        {loading ? (

                            <div className="p-4 text-center text-muted small">

                                <div className="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true" />

                                Loading notifications...

                            </div>

                        ) : notifications.length === 0 ? (

                            <div className="p-3 text-center text-muted small">

                                {isHistory ? 'No acknowledged notifications' : 'No notifications'}

                            </div>

                        ) : (

                            <>

                                {notifications.map((n) => (

                                    <div

                                        key={n.ID}

                                        className={`p-3 border-bottom ${!isHistory ? 'cursor-pointer' : ''} ${!n.IsRead && !isHistory ? 'bg-info bg-opacity-10' : ''}`}

                                        style={{ cursor: isHistory ? 'default' : 'pointer', transition: 'background 0.2s' }}

                                        onClick={isHistory ? undefined : () => navigateFromNotification(n)}

                                        onMouseEnter={isHistory ? undefined : (e) => e.currentTarget.classList.add('bg-light')}

                                        onMouseLeave={isHistory ? undefined : (e) => e.currentTarget.classList.remove('bg-light')}

                                    >

                                        <div className="d-flex justify-content-between align-items-start gap-2 mb-1">

                                            <small className={`fw-bold ${n.Type === 'Mention' ? 'text-primary' : 'text-dark'}`}>

                                                {n.Type}

                                            </small>

                                            <div className="d-flex align-items-center gap-2 flex-shrink-0">

                                                <small className="text-muted" style={{ fontSize: '0.7rem' }}>

                                                    {isHistory

                                                        ? formatTime(n.AcknowledgedAt || n.CreatedAt)

                                                        : formatTime(n.CreatedAt)}

                                                </small>

                                                {!isHistory && (

                                                    <button

                                                        type="button"

                                                        className="btn btn-outline-success btn-sm py-0 px-2"

                                                        style={{ fontSize: '0.65rem', lineHeight: 1.4 }}

                                                        title="Acknowledge"

                                                        aria-label="Acknowledge notification"

                                                        onClick={(e) => handleAck(e, n)}

                                                    >

                                                        ACK

                                                    </button>

                                                )}

                                            </div>

                                        </div>

                                        <p className="mb-0 small text-secondary lh-sm">

                                            {renderMessage(n.Message, n.LinkID?.toString())}

                                        </p>

                                        {isHistory && n.AcknowledgedAt && (

                                            <small className="text-muted d-block mt-1" style={{ fontSize: '0.65rem' }}>

                                                Received {formatTime(n.CreatedAt)}

                                            </small>

                                        )}

                                    </div>

                                ))}

                                {hasMore && (

                                    <div className="p-2 text-center border-top">

                                        <button

                                            type="button"

                                            className="btn btn-link btn-sm text-decoration-none"

                                            onClick={loadMore}

                                            disabled={loadingMore}

                                        >

                                            {loadingMore ? 'Loading...' : 'Load more'}

                                        </button>

                                    </div>

                                )}

                            </>

                        )}

                    </div>

                </div>

            )}

        </div>

    );

};



export default NotificationDropdown;

