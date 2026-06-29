import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
    getCcCoordinatorNamesForDivision,
    getDashboardDivisionOptions,
    getEffectiveDivisionForDashboardSe,
    getMasterConcernedSeNamesForDivision,
    getRegularUserDashboardSeName,
    isDashboardCoordinatorUser,
} from '../../../utils/dashboardCcAccess';

/** Case-insensitive ascending order for dropdown lists */
const sortStringsAsc = (list) => {
    if (!list || list.length === 0) return [];
    return [...list].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true })
    );
};

const DashboardFilters = ({ filters, setFilters, masters, viewMode = 'all' }) => {
    const { currentUser } = useAuth();

    const isCoordinator = isDashboardCoordinatorUser(currentUser, masters.enqItems);
    const showAllDivisionsOption = isCoordinator;

    /** Division key for Master_ConcernedSE.Department + CC coordinator names (aligned with dashboard API). */
    const effectiveDivisionForSeList = getEffectiveDivisionForDashboardSe(
        filters.division,
        currentUser,
        masters.enqItems
    );

    /** Master_ConcernedSE.FullName where Department matches selected division (`masters.users` = that table). */
    const masterSeNamesForDivision = getMasterConcernedSeNamesForDivision(
        effectiveDivisionForSeList,
        masters.users
    );

    /** CC mail contacts for this department — selecting one shows all SEs for the division on calendars */
    const ccCoordinatorNamesForDivision = effectiveDivisionForSeList
        ? getCcCoordinatorNamesForDivision(
            effectiveDivisionForSeList,
            masters.enqItems,
            masters.users
        )
        : [];

    const dashboardSeOptions = sortStringsAsc(
        Array.from(new Set([...masterSeNamesForDivision, ...ccCoordinatorNamesForDivision]))
    );

    const regularUserDivisionOptions = sortStringsAsc(
        getDashboardDivisionOptions(currentUser, masters.enqItems, masters.enquiryFor, masters.users)
    );
    const regularUserSeOptions = sortStringsAsc(
        (() => {
            const name = getRegularUserDashboardSeName(currentUser, masters.users);
            return name ? [name] : [];
        })()
    );

    const lockedDivisionValue =
        isCoordinator || !regularUserDivisionOptions.length
            ? filters.division
            : regularUserDivisionOptions.includes(filters.division)
              ? filters.division
              : regularUserDivisionOptions[0];
    const lockedSeValue =
        isCoordinator || !regularUserSeOptions.length
            ? filters.salesEngineer
            : regularUserSeOptions.includes(filters.salesEngineer)
              ? filters.salesEngineer
              : regularUserSeOptions[0];

    const commonSelectStyle = (enabled) => ({
        fontWeight: 500,
        borderRadius: '4px',
        fontSize: '12.5px',
        height: '36px',
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.8,
        transition: 'all 0.2s ease',
        border: '1px solid #dee2e6'
    });

    // Render Division and Sales Engineer (For Left Panel / Calendar)
    if (viewMode === 'division_se') {
        const divisionOptions = regularUserDivisionOptions;
        const seOptions = isCoordinator ? dashboardSeOptions : regularUserSeOptions;
        const divisionValue = lockedDivisionValue;
        const seValue = lockedSeValue;

        return (
            <div className="d-flex align-items-center gap-2 w-100">
                <div style={{ width: '38%' }}>
                    <select
                        className="form-select shadow-none dashboard-filter-select"
                        style={commonSelectStyle(isCoordinator)}
                        value={divisionValue}
                        onChange={(e) => setFilters(prev => ({
                            ...prev,
                            division: e.target.value,
                            salesEngineer: 'All'
                        }))}
                        disabled={!isCoordinator}
                    >
                        {showAllDivisionsOption ? <option value="All">All Divisions</option> : null}
                        {divisionOptions.map((div, idx) => (
                            <option key={idx} value={div}>{div}</option>
                        ))}
                    </select>
                </div>
                <div style={{ width: '38%' }}>
                    <select
                        className="form-select shadow-none dashboard-filter-select"
                        style={commonSelectStyle(isCoordinator)}
                        value={seValue}
                        onChange={(e) => setFilters(prev => ({ ...prev, salesEngineer: e.target.value }))}
                        disabled={!isCoordinator}
                    >
                        {isCoordinator ? <option value="All">All SEs</option> : null}
                        {seOptions && seOptions.map((se, idx) => (
                            <option key={idx} value={se}>{se}</option>
                        ))}
                    </select>
                </div>
                <style>{`
                    .dashboard-filter-select:hover:not(:disabled) {
                        background-color: #f8f9fa !important;
                    }
                `}</style>
            </div>
        );
    }

    // Right panel: reserve the same vertical band as the left filters so layout does not shift; controls removed per UX.
    if (viewMode === 'search_date') {
        return <div className="dashboard-filters-right-spacer w-100" aria-hidden="true" />;
    }

    return (
        <div className="card h-100 border-0 shadow-sm" style={{ borderRadius: '16px', background: 'linear-gradient(145deg, #ffffff 0%, #f7f9fc 100%)' }}>
            <div className="card-body p-4">
                <h6 className="fw-semibold text-secondary small text-uppercase mb-4" style={{ letterSpacing: '0.05em' }}>
                    Global Filters
                </h6>

                {/* Division Filter */}
                <div className="mb-4">
                    <label className="form-label small fw-bold text-muted text-uppercase" style={{ fontSize: '0.7rem' }}>Division</label>
                    {/* When CC user, only show DepartmentName (fallback to 'All' if missing). */}
                    <select
                        className="form-select border-0 shadow-sm bg-white py-2 dashboard-filter-select"
                        style={commonSelectStyle(isCoordinator)}
                        value={lockedDivisionValue}
                        onChange={(e) => setFilters(prev => ({
                            ...prev,
                            division: e.target.value,
                            salesEngineer: 'All'
                        }))}
                        disabled={!isCoordinator}
                    >
                        {showAllDivisionsOption ? <option value="All">All Divisions</option> : null}
                        {regularUserDivisionOptions.map((div, idx) => (
                            <option key={idx} value={div}>{div}</option>
                        ))}
                    </select>
                </div>

                {/* Sales Engineer Filter */}
                <div className="mb-0">
                    <label className="form-label small fw-bold text-muted text-uppercase" style={{ fontSize: '0.7rem' }}>Sales Engineer</label>
                    <select
                        className="form-select border-0 shadow-sm bg-white py-2 dashboard-filter-select"
                        style={commonSelectStyle(isCoordinator)}
                        value={lockedSeValue}
                        onChange={(e) => setFilters(prev => ({ ...prev, salesEngineer: e.target.value }))}
                        disabled={!isCoordinator}
                    >
                        {isCoordinator ? <option value="All">All Sales Engineers</option> : null}
                        {(isCoordinator ? dashboardSeOptions : regularUserSeOptions).map((se, idx) => (
                            <option key={idx} value={se}>{se}</option>
                        ))}
                    </select>
                </div>
            </div>
            <style jsx>{`
                .dashboard-filter-select:hover:not(:disabled) {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
                    background-color: #fbfcfe !important;
                }
            `}</style>
        </div>
    );
};

export default DashboardFilters;
