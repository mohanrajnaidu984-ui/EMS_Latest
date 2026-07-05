import React, { useState, useEffect, useRef, useCallback } from 'react';
import emsMarkLogo from '../../assets/ems_logo2.png';
import { getAcgBrandLogoSrc } from '../../utils/acgBrandLogo';
import NotificationDropdown from './NotificationDropdown';
import UserProfile from './UserProfile';
import { isQuoteModuleTab, QUOTE_TAB_B2B, QUOTE_TAB_B2C } from '../../utils/quoteNav';
import { EMS_PENDING_APPROVALS_CHANGED } from '../../constants/approvalEvents';

import { useAuth } from '../../context/AuthContext';

const Header = ({ activeTab, onNavigate, onOpenEnquiry }) => {
  const { currentUser } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [openSubmenuId, setOpenSubmenuId] = useState(null);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const navStripRef = useRef(null);

  const userEmail = String(currentUser?.email || currentUser?.EmailId || currentUser?.MailId || '').trim();

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
    const interval = setInterval(fetchPendingApprovalCount, 30000);
    const onApprovalsChanged = () => {
      void fetchPendingApprovalCount();
    };
    window.addEventListener(EMS_PENDING_APPROVALS_CHANGED, onApprovalsChanged);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener(EMS_PENDING_APPROVALS_CHANGED, onApprovalsChanged);
    };
  }, [userEmail, activeTab]);

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
    { id: 'Dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
    { id: 'Enquiry', label: 'Enquiry', icon: 'bi-clipboard-data' },
    { id: 'Pricing', label: 'Pricing', icon: 'bi-calculator' },
    {
      id: 'Quote',
      label: 'Quote',
      icon: 'bi-file-earmark-text',
      children: [
        { id: QUOTE_TAB_B2B, label: 'B2B' },
        { id: QUOTE_TAB_B2C, label: 'B2C' },
      ],
    },
    { id: 'Approvals', label: 'Approvals', icon: 'bi-check2-square' },
    { id: 'Probability', label: 'Probability', icon: 'bi-graph-up' },
    { id: 'Sales Report', label: 'Sales Report', icon: 'bi-file-earmark-bar-graph' },
    { id: 'Reports', label: 'Sales Target', icon: 'bi-bullseye' },
    { id: 'Help', label: 'Help', icon: 'bi-question-circle' },
    { id: 'About', label: 'About', icon: 'bi-info-circle' }
  ];

  // Role Based Access
  const roleString = currentUser?.role || currentUser?.Roles || '';
  const userRoles = typeof roleString === 'string'
    ? roleString.split(',').map(r => r.trim().toLowerCase())
    : (Array.isArray(roleString) ? roleString.map(r => r.toLowerCase()) : []);

  const visibleItems = navItems.filter(item => {
    if (item.id === 'Dashboard') return true;
    if (item.id === 'Help') return true;
    if (item.id === 'About') return true;
    if (item.id === 'Approvals') return true;

    // Grant Admin access to everything
    if (userRoles.includes('admin')) return true;

    // Granular Role Checks
    if (item.id === 'Enquiry' && userRoles.includes('enquiry')) return true;
    if (item.id === 'Pricing' && userRoles.includes('pricing')) return true;
    if (item.id === 'Quote' && userRoles.includes('quote')) return true;
    if (item.id === 'Probability' && userRoles.includes('probability')) return true;
    if (item.id === 'Sales Report' && (userRoles.includes('sales target') || userRoles.includes('sales report'))) return true;
    if (item.id === 'Reports' && (userRoles.includes('report') || userRoles.includes('sales target'))) return true;

    return false;
  });
  const visibleMenuCount = visibleItems.length;
  const menuStripPadding = visibleMenuCount <= 2 ? '0 10px' : visibleMenuCount <= 4 ? '0 8px' : '0 4px';

  return (
    <>
      <nav className="navbar navbar-light" style={{
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
            <div className="d-flex align-items-center logo-container" style={{ animation: 'fadeInLeft 1s ease-out' }}>
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

            {/* Centered: Navigation Links aligned to header bottom */}
            <div
              className="d-flex justify-content-center align-items-center pb-0"
              style={{
                background: 'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)',
                borderTopLeftRadius: '18px',
                borderTopRightRadius: '18px',
                height: '35px',
                margin: '0',
                flexGrow: 0,
                padding: menuStripPadding,
                position: 'absolute',
                left: '50%',
                bottom: 0,
                transform: 'translateX(-50%)',
                boxShadow: '0 2px 8px rgba(23, 47, 99, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                width: 'fit-content',
                zIndex: 2
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

                  return (
                    <li className="nav-item" key={item.id}>
                      <button
                        type="button"
                        className={`nav-link bg-transparent border-0 d-flex align-items-center shadow-none ems-top-nav-link position-relative${activeTab === item.id ? ' active' : ''}`}
                        onClick={() => onNavigate(item.id)}
                        aria-current={activeTab === item.id ? 'page' : undefined}
                        data-ems-main-nav-id={item.id}
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
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Right: ACG logo + user controls — absolute slots so only the logo moves down */}
            <div
              className="acg-header-right"
              style={{
                position: 'relative',
                marginLeft: 'auto',
                alignSelf: 'stretch',
                height: '100%',
                width: 'min(240px, 40vw)',
                flexShrink: 0,
              }}
            >
              <div
                className="acg-header-logo-slot"
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: '34px',
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

              <div
                className="acg-header-controls d-flex align-items-center gap-2"
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: '4px',
                  zIndex: 2,
                }}
              >
                <NotificationDropdown onOpenEnquiry={onOpenEnquiry} />
                <div style={{ transform: 'scale(0.9)', transformOrigin: 'right bottom' }}>
                  <UserProfile activeTab={activeTab} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '6px',
            background: 'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)',
            zIndex: 0,
            pointerEvents: 'none'
          }}
        />
      </nav>
    </>
  );
};

export default Header;
