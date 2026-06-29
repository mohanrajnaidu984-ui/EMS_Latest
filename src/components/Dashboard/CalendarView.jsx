import React from 'react';

const CalendarView = ({ month, year, data }) => {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const monthMap = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };

    const generateCalendarDays = () => {
        const calendarDays = [];
        const monthIndex = monthMap[month];
        const yearInt = parseInt(year);

        // First day of the month
        const firstDay = new Date(yearInt, monthIndex, 1).getDay(); // 0 = Sunday

        // Days in month
        const daysInMonth = new Date(yearInt, monthIndex + 1, 0).getDate();

        // Add empty slots
        for (let i = 0; i < firstDay; i++) {
            calendarDays.push({ type: 'empty', key: `empty-${i}` });
        }

        // Add days
        for (let i = 1; i <= daysInMonth; i++) {
            calendarDays.push({
                type: 'day',
                date: i,
                key: `day-${i}`,
                mainValue: data[i]?.main || 'New: 0',
                subValue: data[i]?.sub || 'Due: 0'
            });
        }
        return calendarDays;
    };

    const calendarDays = generateCalendarDays();

    return (
        <div className="calendar-container">
            <div className="calendar-header">
                {month}/{year}
            </div>
            <div className="calendar-grid">
                {days.map(day => (
                    <div key={day} className="calendar-day-header">{day}</div>
                ))}

                {calendarDays.map((item, index) => (
                    <div key={item.key || index} className="calendar-cell">
                        {item.type === 'day' && (
                            <>
                                <div className="calendar-date">{item.date}</div>
                                <div className="calendar-val-main" style={{ fontSize: '0.8rem' }}>{item.mainValue}</div>
                                <div className="calendar-val-sub" style={{ fontSize: '0.7rem' }}>{item.subValue}</div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CalendarView;
