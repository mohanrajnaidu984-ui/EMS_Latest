// Test-only entry served through a Playwright route, not the production build.
// Uses the real approval-review QuoteForm and its normal authenticated API reads.
import React from 'react';
import {createRoot} from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '../../src/index.css';
import {AuthProvider,useAuth} from '../../src/context/AuthContext';
import {DataProvider} from '../../src/context/DataContext';
import QuoteForm from '../../src/components/Quote/QuoteForm';

const params=new URLSearchParams(window.location.search);
const context={tab:'Approvals',requestNo:params.get('requestNo'),quoteId:params.get('quoteId'),quoteNumber:params.get('quoteNumber')};
function Harness(){const {currentUser}=useAuth();return currentUser?<div style={{height:'100vh',display:'flex',flexDirection:'column'}}><QuoteForm embeddedApprovalReview openContext={context}/></div>:<div>Loading test session…</div>;}
createRoot(document.getElementById('root')).render(<AuthProvider><DataProvider><Harness/></DataProvider></AuthProvider>);
