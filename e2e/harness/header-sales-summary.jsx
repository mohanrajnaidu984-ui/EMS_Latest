import React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '../../src/index.css';
import { AuthProvider } from '../../src/context/AuthContext';
import { DataProvider } from '../../src/context/DataContext';
import Header from '../../src/components/Layout/Header';

createRoot(document.getElementById('root')).render(
    <AuthProvider><DataProvider><Header activeTab="Sales Report" onNavigate={() => {}} /></DataProvider></AuthProvider>
);
