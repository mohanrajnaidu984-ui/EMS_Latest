import React from 'react';
import Header from './Header';
import { isQuoteModuleTab } from '../../utils/quoteNav';

const MainLayout = ({ children, activeTab, onNavigate, onOpenEnquiry }) => {
    const isQuoteTab = isQuoteModuleTab(activeTab);
    const isFullHeightTab = isQuoteTab || activeTab === 'Probability' || activeTab === 'Approvals';
    return (
        <div style={{ height: '100vh', overflow: 'hidden' }}>
            {/* Header Self-Managed */}
            <Header activeTab={activeTab} onNavigate={onNavigate} onOpenEnquiry={onOpenEnquiry} />

            {/* Content Wrapper: 100% for Dashboard, 83% for others */}
            <div
                className={`container-fluid ${
                    activeTab === 'Dashboard' || isQuoteTab || activeTab === 'Reports' || activeTab === 'Approvals'
                        ? 'px-0'
                        : activeTab === 'Probability'
                          ? 'px-1'
                          : 'px-4'
                }`}
                style={{
                    maxWidth: activeTab === 'Dashboard' ? '100%' : '100%',
                    width: '100%',
                    margin: '0 auto',
                    marginTop: '72px', // Exact header height for flush fit
                    height: 'calc(100vh - 72px)',
                    overflowY: isFullHeightTab ? 'hidden' : 'auto',
                    overflowX: 'hidden',
                }}
            >
                {isFullHeightTab ? (
                    <div
                        style={{
                            paddingLeft: activeTab === 'Probability' ? 0 : '4px',
                            paddingRight: activeTab === 'Probability' ? 0 : '4px',
                            boxSizing: 'border-box',
                            width: '100%',
                            minHeight: 0,
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                        }}
                    >
                        {children}
                    </div>
                ) : (
                    children
                )}
            </div>
        </div>
    );
};

export default MainLayout;
