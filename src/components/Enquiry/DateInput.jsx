import React, { useRef } from 'react';

import { format, parse, isValid } from 'date-fns';

const DateInput = ({ value, onChange, placeholder = "DD-MMM-YYYY", style: styleProp, disabled, min, max, ...props }) => {
    const datePickerRef = useRef(null);

    // Convert YYYY-MM-DD to DD-MMM-YYYY for display
    const formatDateForDisplay = (dateStr) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            if (!isValid(date)) return '';
            return format(date, 'dd-MMM-yyyy');
        } catch (e) {
            return '';
        }
    };

    // Convert DD-MMM-YYYY to YYYY-MM-DD for storage
    const parseDateFromDisplay = (displayStr) => {
        if (!displayStr) return '';
        try {
            const parsedDate = parse(displayStr, 'dd-MMM-yyyy', new Date());
            if (isValid(parsedDate)) {
                return format(parsedDate, 'yyyy-MM-dd');
            }
            return '';
        } catch (e) {
            return '';
        }
    };

    const handleInputChange = (e) => {
        const inputValue = e.target.value;
        onChange({ target: { value: inputValue } });
    };

    const handleBlur = (e) => {
        const inputValue = e.target.value;
        const parsedDate = parseDateFromDisplay(inputValue);

        if (parsedDate) {
            onChange({ target: { value: parsedDate } });
        } else if (inputValue === '') {
            onChange({ target: { value: '' } });
        }
    };

    const handleDatePickerChange = (e) => {
        onChange(e);
    };

    const handleCalendarIconClick = () => {
        if (disabled) return;
        if (datePickerRef.current) {
            datePickerRef.current.showPicker();
        }
    };

    const handleInputClick = () => {
        if (disabled) return;
        if (datePickerRef.current) {
            datePickerRef.current.showPicker();
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <input
                type="text"
                className="form-control"
                value={formatDateForDisplay(value)}
                onChange={handleInputChange}
                onBlur={handleBlur}
                onClick={handleInputClick}
                placeholder={placeholder}
                disabled={disabled}
                style={{
                    fontSize: '11.5px',
                    boxSizing: 'border-box',
                    minHeight: '28px',
                    height: '28px',
                    paddingLeft: '8px',
                    paddingTop: '2px',
                    paddingBottom: '2px',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.65 : 1,
                    ...styleProp,
                    paddingRight: '34px',
                }}
                readOnly
                {...props}
            />
            <i
                className="bi bi-calendar3"
                onClick={handleCalendarIconClick}
                style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#667eea',
                    pointerEvents: 'auto',
                    zIndex: 2
                }}
            />
            <input
                ref={datePickerRef}
                type="date"
                value={value}
                min={min}
                max={max}
                disabled={disabled}
                onChange={handleDatePickerChange}
                style={{
                    position: 'absolute',
                    left: '0',
                    top: '0',
                    width: '100%',
                    height: '100%',
                    opacity: '0',
                    cursor: 'pointer',
                    pointerEvents: 'none'
                }}
                tabIndex={-1}
            />
        </div>
    );
};

export default DateInput;
