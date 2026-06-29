import React from 'react';

const KPICard = ({ title, mainValue, subValue, footer, colorClass }) => {
    return (
        <div className={`kpi-card ${colorClass}`}>
            <div className="kpi-header">{title}</div>
            <div className="kpi-value-main">{mainValue}</div>
            <div className="kpi-value-sub">{subValue}</div>
            <div className="kpi-footer">{footer}</div>
        </div>
    );
};

export default KPICard;
