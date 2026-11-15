import React from 'react';
import { formatTopDivisionAmount } from './headerSalesSummaryTotals';

export default function HeaderTopDivisions({ divisions, unavailable = false, step = 0, previousStep = null }) {
    const items = Array.isArray(divisions) ? divisions.slice(0, 5) : [];
    const index = items.length ? step % items.length : 0;
    const previous = previousStep == null || !items.length ? null : previousStep % items.length;
    const item = items[index % items.length];
    const render = (division, outgoing = false) => <div
        key={`${outgoing ? 'out' : 'in'}-${division?.rank || 0}`}
        className={`ems-header-sales__ranking-row${outgoing ? ' ems-header-sales__row--out' : previous != null ? ' ems-header-sales__row--in' : ''}`}
        aria-hidden={outgoing || undefined}
    >{division ? <><strong>Top {division.rank} Division:</strong> <span className="ems-header-sales__division-name">{division.division}</span> <strong className="ems-header-sales__division-value">({formatTopDivisionAmount(division.bookedValue)})</strong> <span>Booking</span></>
        : <span>Top Divisions: {unavailable ? 'Unavailable' : divisions == null ? '…' : 'No bookings'}</span>}</div>;
    return <div className="ems-header-sales__ranking" aria-label="Top BHD divisions by annual booked value"
        title={item ? `Top ${item.rank} Division: ${item.division} (${formatTopDivisionAmount(item.bookedValue)}) Booking · All BHD divisions, current year` : undefined}>
        {previous != null && items[previous] ? render(items[previous], true) : null}
        {render(item)}
    </div>;
}
