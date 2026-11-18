import React, { Suspense, lazy, useEffect, useState } from 'react';
import { QUOTE_TAB_B2B, QUOTE_TAB_B2C, isQuoteModuleTab } from '../utils/quoteNav';
import { isChatboxEnabled, disconnectChatboxSocket } from '../utils/chatboxSocket';

import { loadAppModule } from '../utils/modulePreload';
const EnquiryForm = lazy(() => loadAppModule('Enquiry'));
const Dashboard = lazy(() => loadAppModule('Dashboard'));
const PricingForm = lazy(() => loadAppModule('Pricing'));
const QuoteForm = lazy(() => loadAppModule('Quote B2B'));
const QuoteB2CPlaceholder = lazy(() => loadAppModule('Quote B2C'));
const QuoteApprovalPage = lazy(() => loadAppModule('Approvals'));
const ProbabilityForm = lazy(() => loadAppModule('Probability'));
const ChatBox = lazy(() => loadAppModule('ChatBox'));
const SalesReport = lazy(() => loadAppModule('Sales Report'));
const SalesTarget = lazy(() => loadAppModule('Reports'));
const About = lazy(() => loadAppModule('About'));
const Help = lazy(() => loadAppModule('Help'));
const Usage = lazy(() => loadAppModule('Usage'));
import { useAuth } from '../context/AuthContext';

const moduleLoadingFallback = (
    <div className="p-3 text-muted" role="status" data-ems-module-loading="1">
        Loading…
    </div>
);

const Main = ({ activeTab, onNavigate, enquiryToOpen, openContext, onOpenEnquiry }) => {
    const { currentUser } = useAuth();
    const roleString = currentUser?.role || currentUser?.Roles || '';
    const userRoles =
        typeof roleString === 'string'
            ? roleString.split(',').map((r) => r.trim().toLowerCase())
            : Array.isArray(roleString)
              ? roleString.map((r) => String(r).toLowerCase())
              : [];
    const canSeeUsage = userRoles.includes('admin') || userRoles.includes('system');
    const chatboxOn = isChatboxEnabled();
    /** Keep Quote B2B mounted after first visit so selected enquiry/quote details survive tab switches. */
    const [quoteB2bMounted, setQuoteB2bMounted] = useState(false);
    /** Keep Pricing mounted after first visit so open enquiry + customer tab survive module switches. */
    const [pricingMounted, setPricingMounted] = useState(false);

    /* Any non-ChatBox tab (especially Quote): tear down sockets so they cannot steal CPU/network. */
    useEffect(() => {
        if (!chatboxOn || activeTab !== 'ChatBox') {
            disconnectChatboxSocket();
        }
    }, [activeTab, chatboxOn]);

    useEffect(() => {
        if (activeTab === QUOTE_TAB_B2B) setQuoteB2bMounted(true);
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'Pricing') setPricingMounted(true);
    }, [activeTab]);

    const quoteB2bVisible = activeTab === QUOTE_TAB_B2B;
    const pricingVisible = activeTab === 'Pricing';
    const isFullHeightTab =
        isQuoteModuleTab(activeTab) ||
        activeTab === 'Pricing' ||
        activeTab === 'Probability' ||
        activeTab === 'Approvals' ||
        (chatboxOn && activeTab === 'ChatBox');
    const fullHeightShellStyle = isFullHeightTab
        ? {
              flex: 1,
              minHeight: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
          }
        : undefined;
    const keepAliveVisibleStyle = {
        flex: 1,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    };
    const quoteKeepAliveStyle = quoteB2bVisible ? keepAliveVisibleStyle : { display: 'none' };
    const pricingKeepAliveStyle = pricingVisible ? keepAliveVisibleStyle : { display: 'none' };

    return (
        <div style={fullHeightShellStyle}>
            {/*
              Keep-alive modules use their own Suspense boundaries. A shared Suspense would
              unmount Pricing when Quote (or another lazy tab) first loads and wipe the open enquiry.
            */}
            <div className="tab-content" style={fullHeightShellStyle}>
                {chatboxOn && activeTab === 'ChatBox' && (
                    <Suspense fallback={moduleLoadingFallback}>
                        <ChatBox
                            openRequestNo={
                                openContext?.tab === 'ChatBox'
                                    ? openContext?.chatRequestNo || openContext?.requestNo || null
                                    : null
                            }
                        />
                    </Suspense>
                )}
                {activeTab === 'Dashboard' && (
                    <Suspense fallback={moduleLoadingFallback}>
                        <Dashboard onNavigate={onNavigate} onOpenEnquiry={onOpenEnquiry} />
                    </Suspense>
                )}
                {activeTab === 'About' && (
                    <Suspense fallback={moduleLoadingFallback}>
                        <About />
                    </Suspense>
                )}
                {activeTab === 'Enquiry' && (
                    <Suspense fallback={moduleLoadingFallback}>
                        <EnquiryForm requestNoToOpen={enquiryToOpen} onOpenEnquiry={onOpenEnquiry} />
                    </Suspense>
                )}
                {(pricingMounted || pricingVisible) && (
                    <div style={pricingKeepAliveStyle} aria-hidden={!pricingVisible}>
                        <Suspense fallback={moduleLoadingFallback}>
                            <PricingForm openContext={openContext} />
                        </Suspense>
                    </div>
                )}
                {(quoteB2bMounted || quoteB2bVisible) && (
                    <div style={quoteKeepAliveStyle} aria-hidden={!quoteB2bVisible}>
                        <Suspense fallback={moduleLoadingFallback}>
                            <QuoteForm openContext={openContext} />
                        </Suspense>
                    </div>
                )}
                {activeTab === QUOTE_TAB_B2C && (
                    <Suspense fallback={moduleLoadingFallback}>
                        <QuoteB2CPlaceholder />
                    </Suspense>
                )}
                {activeTab === 'Approvals' && (
                    <Suspense fallback={moduleLoadingFallback}>
                        <QuoteApprovalPage openContext={openContext} />
                    </Suspense>
                )}
                {activeTab === 'Probability' && (
                    <Suspense fallback={moduleLoadingFallback}>
                        <ProbabilityForm />
                    </Suspense>
                )}
                {activeTab === 'Sales Report' && (
                    <Suspense
                        fallback={
                            <div className="d-flex justify-content-center align-items-center py-5" data-ems-module-loading="1">
                                <div className="spinner-border text-primary" role="status">
                                    <span className="visually-hidden">Loading report…</span>
                                </div>
                            </div>
                        }
                    >
                        <SalesReport />
                    </Suspense>
                )}
                {activeTab === 'Help' && (
                    <Suspense fallback={moduleLoadingFallback}>
                        <Help />
                    </Suspense>
                )}
                {activeTab === 'Usage' && canSeeUsage && (
                    <Suspense fallback={moduleLoadingFallback}>
                        <Usage />
                    </Suspense>
                )}
                {activeTab === 'Reports' && (
                    <Suspense fallback={moduleLoadingFallback}>
                        <SalesTarget />
                    </Suspense>
                )}
            </div>
        </div>
    );
};

export default Main;
