import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import emsMarkLogo from '../../assets/ems_logo2.png';
import { getAcgBrandLogoSrc } from '../../utils/acgBrandLogo';
import NotificationDropdown from './NotificationDropdown';
import UserProfile from './UserProfile';
import { isQuoteModuleTab, QUOTE_TAB_B2B } from '../../utils/quoteNav';
import { EMS_PENDING_APPROVALS_CHANGED } from '../../constants/approvalEvents';
import { EMS_CHATBOX_UNREAD_CHANGED } from '../../constants/chatboxEvents';
import { isChatboxEnabled, disconnectChatboxSocket } from '../../utils/chatboxSocket';

import { useAuth } from '../../context/AuthContext';
import { preloadAppModule } from '../../utils/modulePreload';

const Header = ({ activeTab, onNavigate, onOpenEnquiry }) => {
  const { currentUser } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [openSubmenuId, setOpenSubmenuId] = useState(null);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const [accentPath, setAccentPath] = useState('');
  const [accentSvgSize, setAccentSvgSize] = useState({ w: 0, h: 72 });
  const [menuBand, setMenuBand] = useState({ left: 0, right: 0, sideInset: 0 });
  const navStripRef = useRef(null);
  const navBarRef = useRef(null);
  const menuPillRef = useRef(null);

  const EMS_ACCENT = '#FF0066';
  const ACCENT_STROKE = 2.4;
  const ACCENT_GAP = 2.24;
  const MENU_TOP_RADIUS = 18;
  const BLUE_BAR_H = 6;

  const userEmail = String(currentUser?.email || currentUser?.EmailId || currentUser?.MailId || '').trim();
  const onQuoteModule = isQuoteModuleTab(activeTab);

  useEffect(() => {
    let cancelled = false;

    const fetchPendingApprovalCount = async () => {
      if (!userEmail) {
        if (!cancelled) setPendingApprovalCount(0);
        return;
      }
      try {
        const res = await fetch(
          `/api/quotes/list/pending-approvals/count?userEmail=${encodeURIComponent(userEmail)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPendingApprovalCount(Number(data.count) || 0);
      } catch (err) {
        console.warn('[Header] pending approval count', err);
      }
    };

    fetchPendingApprovalCount();
    // Slow poll — heavy SQL; event EMS_PENDING_APPROVALS_CHANGED refreshes sooner.
    const interval = setInterval(fetchPendingApprovalCount, onQuoteModule ? 120000 : 90000);
    const onApprovalsChanged = (event) => {
      const detail = event?.detail || {};
      const delta = Number(detail.delta);
      if (Number.isFinite(delta) && delta !== 0) {
        setPendingApprovalCount((prev) => Math.max(0, (Number(prev) || 0) + delta));
      }
      // Optimistic approve/reject: badge moves now; wait for API before recount.
      if (detail.skipRefresh) return;
      void fetchPendingApprovalCount();
    };
    window.addEventListener(EMS_PENDING_APPROVALS_CHANGED, onApprovalsChanged);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener(EMS_PENDING_APPROVALS_CHANGED, onApprovalsChanged);
    };
  }, [userEmail, activeTab]);

  const chatboxOff = !isChatboxEnabled();

  useEffect(() => {
    let cancelled = false;

    const fetchChatUnread = async () => {
      if (chatboxOff || onQuoteModule || !userEmail) {
        if (!cancelled) setChatUnreadTotal(0);
        return;
      }
      try {
        const res = await fetch(
          `/api/chatbox/unread-total?email=${encodeURIComponent(userEmail)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setChatUnreadTotal(Number(data.count) || 0);
      } catch (err) {
        console.warn('[Header] chatbox unread', err);
      }
    };

    /* Quote editor: no chat unread network work at all. */
    if (chatboxOff || onQuoteModule) {
      disconnectChatboxSocket();
      setChatUnreadTotal(0);
      return () => {
        cancelled = true;
      };
    }

    fetchChatUnread();
    // Slow SQL poll only — do NOT open Socket.IO from Header for every logged-in user.
    // Always-on long-polls occupied IIS ARR + Node and made the whole EMS feel slow.
    // ChatBox tab opens its own socket when needed; badge refreshes via event / poll.
    const interval = setInterval(fetchChatUnread, 120000);
    let unreadDebounce = null;
    const onChatUnread = () => {
      if (chatboxOff || onQuoteModule) return;
      if (unreadDebounce) clearTimeout(unreadDebounce);
      unreadDebounce = setTimeout(() => {
        void fetchChatUnread();
      }, 5000);
    };
    window.addEventListener(EMS_CHATBOX_UNREAD_CHANGED, onChatUnread);

    // No Socket.IO from Header — ChatBox opens the socket only when that tab is open.
    // This keeps IIS/Node free for the rest of EMS while chat stays realtime in ChatBox.

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (unreadDebounce) clearTimeout(unreadDebounce);
      window.removeEventListener(EMS_CHATBOX_UNREAD_CHANGED, onChatUnread);
    };
  }, [userEmail, chatboxOff, onQuoteModule]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!openSubmenuId) return undefined;
    const closeOnOutside = (e) => {
      if (navStripRef.current && !navStripRef.current.contains(e.target)) {
        setOpenSubmenuId(null);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [openSubmenuId]);

  const navItems = [
    { id: 'ChatBox', label: 'ChatBox', icon: 'bi-chat-dots' },
    { id: 'Dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
    { id: 'Enquiry', label: 'Enquiry', icon: 'bi-clipboard-data' },
    { id: 'Pricing', label: 'Pricing', icon: 'bi-calculator' },
    { id: QUOTE_TAB_B2B, label: 'Quote', icon: 'bi-file-earmark-text' },
    { id: 'Approvals', label: 'Approvals', icon: 'bi-check2-square' },
    { id: 'Probability', label: 'Probability', icon: 'bi-graph-up' },
    { id: 'Sales Report', label: 'Sales Report', icon: 'bi-file-earmark-bar-graph' },
    { id: 'Reports', label: 'Sales Target', icon: 'bi-bullseye' },
    { id: 'Usage', label: 'Usage', icon: 'bi-activity' },
    { id: 'Help', label: 'Help', icon: 'bi-question-circle' },
    { id: 'About', label: 'About', icon: 'bi-info-circle' }
  ];

  // Role Based Access
  const roleString = currentUser?.role || currentUser?.Roles || '';
  const userRoles = typeof roleString === 'string'
    ? roleString.split(',').map(r => r.trim().toLowerCase())
    : (Array.isArray(roleString) ? roleString.map(r => r.toLowerCase()) : []);

  const visibleItems = navItems.filter(item => {
    if (item.id === 'ChatBox') {
      return !chatboxOff;
    }
    if (item.id === 'Dashboard') return true;
    if (item.id === 'Help') return true;
    if (item.id === 'About') return true;
    if (item.id === 'Approvals') return true;
    // Admin / System only — Usage is not shown to other roles
    if (item.id === 'Usage') {
      return userRoles.includes('admin') || userRoles.includes('system');
    }

    // Grant Admin access to everything
    if (userRoles.includes('admin')) return true;

    // Granular Role Checks
    if (item.id === 'Enquiry' && userRoles.includes('enquiry')) return true;
    if (item.id === 'Pricing' && userRoles.includes('pricing')) return true;
    if (item.id === QUOTE_TAB_B2B && userRoles.includes('quote')) return true;
    if (item.id === 'Probability' && userRoles.includes('probability')) return true;
    if (item.id === 'Sales Report' && (userRoles.includes('sales target') || userRoles.includes('sales report'))) return true;
    if (item.id === 'Reports' && (userRoles.includes('report') || userRoles.includes('sales target'))) return true;

    return false;
  });
  const visibleMenuCount = visibleItems.length;
  const menuStripPadding = visibleMenuCount <= 2 ? '0 10px' : visibleMenuCount <= 4 ? '0 8px' : '0 4px';

  /**
   * Magenta rail: flat CSS bars on left/right (exact same gap as above the menu),
   * SVG only for the verticals + smooth corner curves around the menu.
   */
  useLayoutEffect(() => {
    const measure = () => {
      const nav = navBarRef.current;
      const menu = menuPillRef.current;
      if (!nav || !menu) return;
      const navRect = nav.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const w = navRect.width;
      const h = navRect.height;
      if (w <= 0 || h <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      const snap = (n) => Math.round(n * dpr) / dpr;
      /* Stroke centreline offset so clear gap between edges = ACCENT_GAP */
      const off = ACCENT_GAP + ACCENT_STROKE / 2;
      const yLow = snap(h - (BLUE_BAR_H + off));
      const mL = snap(menuRect.left - navRect.left);
      const mR = snap(menuRect.right - navRect.left);
      const menuTop = snap(menuRect.top - navRect.top);
      const yHigh = snap(menuTop - off);
      const cs = window.getComputedStyle(menu);
      const rMenu = Math.min(
        MENU_TOP_RADIUS,
        parseFloat(cs.borderTopLeftRadius) || MENU_TOP_RADIUS,
        menuRect.height,
        menuRect.width / 2
      );
      const rOut = rMenu + off;
      const xLeft = snap(mL - off);
      const xRight = snap(mR + off);
      const cLx = snap(mL + rMenu);
      const cRx = snap(mR - rMenu);
      const cLy = snap(menuTop + rMenu);
      const k = 0.5522847498307936;
      const kr = k * rOut;

      /* Bump only — left/right horizontals are CSS so gap matches the menu top exactly */
      const path = [
        `M ${xLeft} ${yLow}`,
        `L ${xLeft} ${cLy}`,
        `C ${xLeft} ${cLy - kr} ${cLx - kr} ${yHigh} ${cLx} ${yHigh}`,
        `L ${cRx} ${yHigh}`,
        `C ${cRx + kr} ${yHigh} ${xRight} ${cLy - kr} ${xRight} ${cLy}`,
        `L ${xRight} ${yLow}`,
      ].join(' ');

      setAccentSvgSize({ w, h });
      setAccentPath(path);
      setMenuBand({ left: mL, right: mR, sideInset: off });
    };

    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (navBarRef.current) ro?.observe(navBarRef.current);
    if (menuPillRef.current) ro?.observe(menuPillRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [visibleMenuCount, menuStripPadding, isScrolled]);

  return (
    <>
      <nav ref={navBarRef} className="navbar navbar-light" style={{
        backgroundColor: '#ffffff',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        padding: '0',
        height: '72px',
        borderBottom: 'none',
        position: 'fixed',
        top: 0,
        zIndex: 9999,
        transition: 'all 0.4s ease',
        width: '100%',
        maxWidth: '100%',
        borderRadius: '0',
        margin: '0 auto',
        left: 0,
        right: 0,
        boxShadow: isScrolled ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
      }}>
        <div className="container-fluid h-100" style={{
          width: '100%',
          transition: 'width 0.4s ease',
          margin: '0 auto',
          padding: '0 14px',
          position: 'relative',
          zIndex: 1
        }}>
          <div className="d-flex align-items-end w-100 h-100" style={{ position: 'relative' }}>
            {/* Left: EMS Text */}
            <div
              className="d-flex align-items-center logo-container"
              style={{ animation: 'fadeInLeft 1s ease-out', paddingBottom: '6px' }}
            >
              <span className="ems-brand-text d-flex align-items-center">
                <img src={emsMarkLogo} alt="" className="ems-brand-mark me-1" aria-hidden="true" />
                <span className="ems-brand-word">EMS</span>
                <span className="ems-brand-divider" aria-hidden="true"></span>
                <span className="ems-brand-subtext">
                  Enquiry<br />
                  Management<br />
                  System
                </span>
              </span>
            </div>

            {/* Centered: Navigation Links + notification (between About and user) */}
            <div
              className="d-flex justify-content-center align-items-end pb-0"
              style={{
                margin: '0',
                flexGrow: 0,
                position: 'absolute',
                left: '50%',
                bottom: 0,
                transform: 'translateX(-50%)',
                width: 'fit-content',
                maxWidth: 'calc(100% - 280px)',
                zIndex: 2,
                gap: '10px',
              }}
            >
              <div
                ref={menuPillRef}
                className="d-flex justify-content-center align-items-center"
                style={{
                  background: 'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)',
                  borderTopLeftRadius: '18px',
                  borderTopRightRadius: '18px',
                  height: '35px',
                  padding: menuStripPadding,
                  boxShadow: '0 2px 8px rgba(23, 47, 99, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                  width: 'fit-content',
                }}
              >
              <ul ref={navStripRef} className="nav d-flex align-items-center gap-2 m-0 ems-top-nav">
                {visibleItems.map((item) => {
                  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
                  const isParentActive = hasChildren
                    ? isQuoteModuleTab(activeTab)
                    : activeTab === item.id;
                  const isSubmenuOpen = openSubmenuId === item.id;

                  if (hasChildren) {
                    return (
                      <li
                        className={`nav-item ems-top-nav-item--submenu${isSubmenuOpen ? ' ems-top-nav-item--submenu-open' : ''}`}
                        key={item.id}
                        onMouseLeave={(e) => {
                          if (!isSubmenuOpen) return;
                          const next = e.relatedTarget;
                          if (next instanceof Node && e.currentTarget.contains(next)) return;
                          setOpenSubmenuId(null);
                        }}
                      >
                        <button
                          type="button"
                          className={`nav-link bg-transparent border-0 d-flex align-items-center shadow-none ems-top-nav-link${isParentActive ? ' active' : ''}`}
                          onClick={() => setOpenSubmenuId(isSubmenuOpen ? null : item.id)}
                          aria-expanded={isSubmenuOpen}
                          aria-haspopup="true"
                          data-ems-main-nav-id={item.id}
                          onPointerEnter={() => preloadAppModule(item.id)}
                          onFocus={() => preloadAppModule(item.id)}
                        >
                          <i className={`bi ${item.icon} me-2 ems-top-nav-link__icon`}></i>
                          {item.label}
                          <i className={`bi bi-chevron-down ms-1 ems-top-nav-chevron${isSubmenuOpen ? ' ems-top-nav-chevron--open' : ''}`} aria-hidden />
                        </button>
                        {isSubmenuOpen ? (
                          <ul className="ems-top-nav-submenu list-unstyled m-0" role="menu">
                            {item.children.map((child) => (
                              <li key={child.id} role="none">
                                <button
                                  type="button"
                                  role="menuitem"
                                  onPointerEnter={() => preloadAppModule(child.id)}
                                  onFocus={() => preloadAppModule(child.id)}
                                  className={`ems-top-nav-submenu__item${activeTab === child.id ? ' active' : ''}`}
                                  onClick={() => {
                                    setOpenSubmenuId(null);
                                    onNavigate(child.id);
                                  }}
                                >
                                  {child.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  }

                  const isActive =
                    item.id === QUOTE_TAB_B2B
                      ? isQuoteModuleTab(activeTab)
                      : activeTab === item.id;

                  return (
                    <li className="nav-item" key={item.id}>
                      <button
                        type="button"
                        className={`nav-link bg-transparent border-0 d-flex align-items-center shadow-none ems-top-nav-link position-relative${isActive ? ' active' : ''}`}
                        onClick={() => onNavigate(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        data-ems-main-nav-id={item.id === QUOTE_TAB_B2B ? 'Quote' : item.id}
                        onPointerEnter={() => preloadAppModule(item.id)}
                        onFocus={() => preloadAppModule(item.id)}
                      >
                        <i className={`bi ${item.icon} me-2 ems-top-nav-link__icon`}></i>
                        {item.label}
                        {item.id === 'Approvals' && pendingApprovalCount > 0 ? (
                          <span
                            className="position-absolute badge rounded-pill bg-danger text-white"
                            style={{
                              top: '-6px',
                              right: '-4px',
                              fontSize: '0.6rem',
                              minWidth: '1.1rem',
                              padding: '0.15rem 0.35rem',
                              lineHeight: 1.1,
                            }}
                            aria-label={`${pendingApprovalCount} pending approval${pendingApprovalCount === 1 ? '' : 's'}`}
                          >
                            {pendingApprovalCount > 99 ? '99+' : pendingApprovalCount}
                          </span>
                        ) : null}
                        {item.id === 'ChatBox' && chatUnreadTotal > 0 ? (
                          <span
                            className="position-absolute badge rounded-pill bg-danger text-white"
                            style={{
                              top: '-6px',
                              right: '-4px',
                              fontSize: '0.6rem',
                              minWidth: '1.1rem',
                              padding: '0.15rem 0.35rem',
                              lineHeight: 1.1,
                            }}
                            aria-label={`${chatUnreadTotal} unread chat message${chatUnreadTotal === 1 ? '' : 's'}`}
                          >
                            {chatUnreadTotal > 99 ? '99+' : chatUnreadTotal}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              </div>

              <div
                className="ems-header-notif-slot d-flex align-items-center"
                style={{
                  height: '35px',
                  paddingBottom: '26px',
                  flexShrink: 0,
                  zIndex: 3,
                }}
              >
                <NotificationDropdown onOpenEnquiry={onOpenEnquiry} />
              </div>
            </div>

            {/* Right: user name above, ACG logo below */}
            <div
              className="acg-header-right"
              style={{
                position: 'relative',
                marginLeft: 'auto',
                alignSelf: 'stretch',
                height: '100%',
                width: 'min(200px, 36vw)',
                flexShrink: 0,
              }}
            >
              <div
                className="acg-header-controls d-flex align-items-center gap-2"
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: '36px',
                  zIndex: 2,
                }}
              >
                <div style={{ transform: 'scale(0.9)', transformOrigin: 'right bottom' }}>
                  <UserProfile activeTab={activeTab} />
                </div>
              </div>

              <div
                className="acg-header-logo-slot"
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: '10px',
                  lineHeight: 0,
                  zIndex: 1,
                }}
              >
                <img
                  src={getAcgBrandLogoSrc()}
                  alt="Almoayyed Contracting Group"
                  className="acg-header-logo"
                  decoding="async"
                  draggable={false}
                  style={{
                    display: 'block',
                    height: '34px',
                    width: 'auto',
                    maxWidth: 'min(220px, 38vw)',
                    objectFit: 'contain',
                    objectPosition: 'right center',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        {/* Blue base bar — left + right only (cleared under menu) */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: `${BLUE_BAR_H}px`,
            width: Math.max(0, menuBand.left),
            background: 'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: menuBand.right,
            right: 0,
            bottom: 0,
            height: `${BLUE_BAR_H}px`,
            background: 'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
        {/* Flat magenta on left/right — same gap as above the menu (ACCENT_GAP) */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            bottom: `${BLUE_BAR_H + ACCENT_GAP}px`,
            height: `${ACCENT_STROKE}px`,
            width: Math.max(0, menuBand.left - (menuBand.sideInset || 0)),
            background: EMS_ACCENT,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: menuBand.right + (menuBand.sideInset || 0),
            right: 0,
            bottom: `${BLUE_BAR_H + ACCENT_GAP}px`,
            height: `${ACCENT_STROKE}px`,
            background: EMS_ACCENT,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        />
        {/* SVG bump around menu (verticals + smooth corners + top) */}
        {accentPath ? (
          <svg
            aria-hidden="true"
            width={accentSvgSize.w}
            height={accentSvgSize.h}
            viewBox={`0 0 ${accentSvgSize.w} ${accentSvgSize.h}`}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              zIndex: 4,
              pointerEvents: 'none',
              overflow: 'visible',
              shapeRendering: 'geometricPrecision',
            }}
          >
            <path
              d={accentPath}
              fill="none"
              stroke={EMS_ACCENT}
              strokeWidth={ACCENT_STROKE}
              strokeLinecap="square"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </nav>
    </>
  );
};

export default Header;
