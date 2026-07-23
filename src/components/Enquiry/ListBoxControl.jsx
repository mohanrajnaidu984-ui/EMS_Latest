import React from 'react';
import SearchableSelectControl from './SearchableSelectControl';

const ListBoxControl = ({
    label,
    options,
    selectedOption,
    onOptionChange,
    listBoxItems,
    onListBoxChange,
    onAdd,
    onRemove,
    onNew,
    onEdit,
    renderOption = (opt) => opt,
    renderListBoxItem = (item) => item,
    disabled = false,
    error = null,
    showNew = false,
    showEdit = false,
    canEdit = false,
    selectedItemDetails = null,
    canRemove = true,
    minSearchLength = 3,
    /** Outer wrapper class (default Bootstrap spacing below control). Use `mb-0` to tuck inside tight layouts. */
    wrapperClassName = 'mb-2',
}) => {
    const listBoxRef = React.useRef(null);

    const handleRemoveClick = () => {
        if (!onRemove || !listBoxRef.current) return;
        const selected = Array.from(listBoxRef.current.selectedOptions || [])
            .map((opt) => opt.index)
            .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < listBoxItems.length)
            .sort((a, b) => a - b);
        if (selected.length > 0) {
            onRemove(selected);
            return;
        }
        // Fallback: if nothing is explicitly selected, treat the last item as selected
        if (listBoxItems.length > 0) {
            onRemove([listBoxItems.length - 1]);
            return;
        }
        // Allow consumer fallback logic when list is empty or nothing is selected.
        onRemove([]);
    };

    return (
        <div className={wrapperClassName}>
            <SearchableSelectControl
                label={label}
                options={options}
                selectedOption={selectedOption}
                onOptionChange={onOptionChange}
                onNew={onNew}
                onEdit={onEdit}
                showNew={showNew}
                showEdit={showEdit}
                canEdit={canEdit}
                disabled={disabled}
                error={error}
                renderOption={renderOption}
                selectedItemDetails={selectedItemDetails}
                minSearchLength={minSearchLength}
            />

            {/* ListBox + Add/Remove Buttons Row */}
            <div className="d-flex align-items-center mt-1">
                <select
                    ref={listBoxRef}
                    className="form-select"
                    multiple
                    style={{ height: listBoxItems.length > 3 ? `${listBoxItems.length * 18 + 6}px` : '52px', fontSize: '11.5px', lineHeight: 1.1 }}
                    onChange={onListBoxChange}
                >
                    {listBoxItems.map((item, idx) => (
                        <option key={idx} value={item}>
                            {renderListBoxItem(item, idx)}
                        </option>
                    ))}
                </select>
                {(onAdd || onRemove) && (
                    <div className="d-flex flex-column ms-1">
                        {onAdd && (
                            <button
                                type="button"
                                className="btn btn-outline-success mb-1"
                                style={{ width: '28px', height: '24px', padding: '0.05rem 0.25rem', fontSize: '11px', lineHeight: 1 }}
                                onClick={onAdd}
                                disabled={!selectedOption}
                            >
                                +
                            </button>
                        )}
                        {onRemove && canRemove && (
                            <button
                                type="button"
                                className="btn btn-outline-danger"
                                style={{ width: '28px', height: '24px', padding: '0.05rem 0.25rem', fontSize: '11px', lineHeight: 1 }}
                                onClick={handleRemoveClick}
                            >
                                -
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div >
    );
};

export default ListBoxControl;
