import React, { Suspense, lazy, useEffect } from 'react';
import EnquiryForm from './Enquiry/EnquiryForm';
import SearchEnquiry from './Enquiry/SearchEnquiry';
import Dashboard from './Dashboard/Dashboard';
import PricingForm from './Pricing/PricingForm';
import QuoteForm from './Quote/QuoteForm';
import QuoteB2CPlaceholder from './Quote/QuoteB2CPlaceholder';
import QuoteApprovalPage from './Quote/QuoteApprovalPage';
import { QUOTE_TAB_B2B, QUOTE_TAB_B2C, isQuoteModuleTab } from '../utils/quoteNav';
import ProbabilityForm from './Probability/ProbabilityForm';
import ChatBox from './ChatBox/ChatBox';
import { isChatboxEnabled, disconnectChatboxSocket } from '../utils/chatboxSocket';

const SalesReport = lazy(() => import('./SalesReport/SalesReport'));
import SalesTarget from './SalesTarget/SalesTarget';
import About from './About/About';
import Help from './Help/Help';
import Usage from './Usage/Usage';
import { useAuth } from '../context/AuthContext';

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

    /* Any non-ChatBox tab (especially Quote): tear down sockets so they cannot steal CPU/network. */
    useEffect(() => {
        if (!chatboxOn || activeTab !== 'ChatBox') {
            disconnectChatboxSocket();
        }
    }, [activeTab, chatboxOn]);

    const isFullHeightTab =
        isQuoteModuleTab(activeTab) ||
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

    return (
        <div style={fullHeightShellStyle}>
            {/* Tab Content */}
            <div className="tab-content" style={fullHeightShellStyle}>
                {chatboxOn && activeTab === 'ChatBox' && (
                    <ChatBox
                        openRequestNo={
                            openContext?.tab === 'ChatBox'
                                ? openContext?.chatRequestNo || openContext?.requestNo || null
                                : null
                        }
                    />
                )}
                {activeTab === 'Dashboard' && (
                    <Dashboard onNavigate={onNavigate} onOpenEnquiry={onOpenEnquiry} />
                )}
                {activeTab === 'About' && (
                    <About />
                )}
                {activeTab === 'Enquiry' && (
                    <EnquiryForm requestNoToOpen={enquiryToOpen} onOpenEnquiry={onOpenEnquiry} />
                )}
                {activeTab === 'Pricing' && (
                    <PricingForm openContext={openContext} />
                )}
                {activeTab === QUOTE_TAB_B2B && (
                    <QuoteForm openContext={openContext} />
                )}
                {activeTab === QUOTE_TAB_B2C && (
                    <QuoteB2CPlaceholder />
                )}
                {activeTab === 'Approvals' && (
                    <QuoteApprovalPage openContext={openContext} />
                )}
                {activeTab === 'Probability' && (
                    <ProbabilityForm />
                )}
                {activeTab === 'Sales Report' && (
                    <Suspense
                        fallback={
                            <div className="d-flex justify-content-center align-items-center py-5">
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
                    <Help />
                )}
                {activeTab === 'Usage' && canSeeUsage && (
                    <Usage />
                )}
                {activeTab === 'Reports' && (
                    <SalesTarget />
                )}
            </div>
        </div>
    );
};

export default Main;
