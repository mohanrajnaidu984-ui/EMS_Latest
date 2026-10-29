import React, { useState, useEffect } from 'react';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import MainLayout from './components/Layout/MainLayout';
import Login from './components/Auth/Login';
import Main from './components/Main';
import { normalizeAppTabId } from './utils/quoteNav';
import { isChatboxEnabled } from './utils/chatboxSocket';

function AppContent() {
  const { isAuthenticated, currentUser } = useAuth();

  React.useEffect(() => {
    // Auth state logging removed for performance
  }, [isAuthenticated, currentUser]);

  return (
    <>
      {!isAuthenticated ? (
        <Login />
      ) : (
        <MainLayoutWrapper />
      )}
    </>
  );
}

const SESSION_ACTIVE_TAB = 'ems_activeTab';
const SESSION_ENQUIRY_OPEN = 'ems_enquiryToOpen';

/** Per-tab navigation memory (sessionStorage). localStorage was shared across tabs so refresh showed the wrong module. */
function readSessionActiveTab() {
  try {
    const s = sessionStorage.getItem(SESSION_ACTIVE_TAB);
    if (s) return normalizeStoredAppTab(s);
    const legacy = localStorage.getItem('activeTab');
    if (legacy) {
      const normalized = normalizeStoredAppTab(legacy);
      sessionStorage.setItem(SESSION_ACTIVE_TAB, normalized);
      localStorage.removeItem('activeTab');
      return normalized;
    }
  } catch (_) {
    /* private mode / quota */
  }
  return 'Enquiry';
}

function normalizeStoredAppTab(tab) {
  const normalized = normalizeAppTabId(tab || 'Enquiry');
  // ChatBox is fully disabled — never restore/open that tab.
  if (normalized === 'ChatBox' && !isChatboxEnabled()) return 'Enquiry';
  return normalized;
}

function readSessionEnquiryToOpen() {
  try {
    const s = sessionStorage.getItem(SESSION_ENQUIRY_OPEN);
    if (s) return s;
    const legacy = localStorage.getItem('enquiryToOpen');
    if (legacy) {
      sessionStorage.setItem(SESSION_ENQUIRY_OPEN, legacy);
      localStorage.removeItem('enquiryToOpen');
      return legacy;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

function MainLayoutWrapper() {
  const [activeTab, setActiveTab] = useState(readSessionActiveTab);
  const [enquiryToOpen, setEnquiryToOpen] = useState(readSessionEnquiryToOpen);
  const [openContext, setOpenContext] = useState(null);

  const handleOpenEnquiry = (target) => {
    if (target && typeof target === 'object') {
      const requestNo = String(target.requestNo || '').trim();
      const tab = normalizeStoredAppTab(String(target.tab || 'Enquiry').trim() || 'Enquiry');
      setOpenContext({ ...target, tab });
      if (requestNo) {
        setEnquiryToOpen(requestNo);
        try {
          sessionStorage.setItem(SESSION_ENQUIRY_OPEN, requestNo);
        } catch (_) {
          /* ignore */
        }
      }
      setActiveTab(tab);
      try {
        sessionStorage.setItem(SESSION_ACTIVE_TAB, tab);
      } catch (_) {
        /* ignore */
      }
      return;
    }
    const requestNo = String(target || '').trim();
    if (!requestNo) return;
    setOpenContext(null);
    setEnquiryToOpen(requestNo);
    try {
      sessionStorage.setItem(SESSION_ENQUIRY_OPEN, requestNo);
      sessionStorage.setItem(SESSION_ACTIVE_TAB, 'Enquiry');
    } catch (_) {
      /* ignore */
    }
    setActiveTab('Enquiry');
  };

  useEffect(() => {
    if (activeTab === 'ChatBox' && !isChatboxEnabled()) {
      setActiveTab('Enquiry');
      try {
        sessionStorage.setItem(SESSION_ACTIVE_TAB, 'Enquiry');
      } catch (_) {
        /* ignore */
      }
    }
  }, [activeTab]);

  const handleTabChange = (tab) => {
    if (tab === 'ChatBox' && !isChatboxEnabled()) return;
    const normalized = normalizeStoredAppTab(tab);
    setActiveTab(normalized);
    try {
      sessionStorage.setItem(SESSION_ACTIVE_TAB, normalized);
    } catch (_) {
      /* ignore */
    }
    if (tab !== 'Enquiry') {
      setEnquiryToOpen(null);
      try {
        sessionStorage.removeItem(SESSION_ENQUIRY_OPEN);
      } catch (_) {
        /* ignore */
      }
    }
  };

  return (
    <MainLayout activeTab={activeTab} onNavigate={handleTabChange} onOpenEnquiry={handleOpenEnquiry}>
      <Main
        activeTab={activeTab}
        onNavigate={handleTabChange}
        enquiryToOpen={enquiryToOpen}
        openContext={openContext}
        onOpenEnquiry={handleOpenEnquiry}
      />
    </MainLayout>
  );
}



function App() {
  return (
    <DataProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </DataProvider>
  );
}

export default App;
