import React from 'react';
import './Dashboard.css';

const DashboardLayout = ({ children }) => {
    return (
        <div className="dashboard-light">
            {children}
        </div>
    );
};

export default DashboardLayout;
