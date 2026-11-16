import React, { useState } from 'react';
import DateInput from './DateInput';
import ValidationTooltip from '../Common/ValidationTooltip';

export default function AddendumBlock({
    addendum,
    disabled,
    onRemove,
    onDetails,
    onReceivedDate,
    onFiles,
    onLinks,
    renderList,
    detailsError,
    receivedDateError,
}) {
    const [links, setLinks] = useState('');
    const number = addendum.AddendumNo;
    return <section className="border rounded p-3 mb-3" style={{ backgroundColor: '#fffdf0' }}>
        <div className="d-flex align-items-center justify-content-between mb-2">
            <h5 className="mb-0">Addendum-{number}</h5>
            {onRemove && <button type="button" className="btn btn-sm btn-outline-danger" disabled={disabled} onClick={onRemove}>Remove Addendum</button>}
        </div>
        <div className="mb-3" style={{ maxWidth: 280, position: 'relative' }}>
            <label className="form-label" htmlFor={`addendum-received-${number}`}>
                Addendum Received Date <span className="text-danger">*</span>
            </label>
            <DateInput
                id={`addendum-received-${number}`}
                value={addendum.ReceivedDate || ''}
                onChange={(e) => onReceivedDate?.(e.target.value)}
                placeholder="DD-MMM-YYYY"
                disabled={disabled}
                required
                aria-required="true"
                aria-invalid={receivedDateError ? 'true' : undefined}
                className={receivedDateError ? 'form-control is-invalid' : 'form-control'}
            />
            {receivedDateError && <ValidationTooltip message={receivedDateError} />}
        </div>
        <label className="form-label" htmlFor={`addendum-details-${number}`}>
            Details of this Addendum <span className="text-danger">*</span>
        </label>
        <div className="position-relative mb-3">
            <textarea
                id={`addendum-details-${number}`}
                className={`form-control${detailsError ? ' is-invalid' : ''}`}
                rows={3}
                value={addendum.Details}
                disabled={disabled}
                required
                aria-required="true"
                aria-invalid={detailsError ? 'true' : undefined}
                placeholder="Enter addendum details"
                onChange={e => onDetails(e.target.value)}
            />
            {detailsError && <ValidationTooltip message={detailsError} />}
        </div>
        {['Public', 'Private'].map((visibility, index) => <div key={visibility} className="mb-3">
            <h6 className={visibility === 'Public' ? 'text-primary' : 'text-danger'}>{index+1}. {visibility} Attachments</h6>
            <p className="small text-muted">{visibility === 'Public' ? 'Assigned ConcernedSE + their CCMailIds + Approvers + Admin' : 'Own-job ConcernedSE + their CCMailIds + Approvers + Admin'}</p>
            <div className="d-flex gap-2 mb-2">
                <label className={`btn btn-sm btn-outline-${visibility === 'Public' ? 'primary' : 'danger'}`}>
                    Add Files<input type="file" className="d-none" multiple disabled={disabled} onChange={e => onFiles(e, visibility)} />
                </label>
                <label className={`btn btn-sm btn-outline-${visibility === 'Public' ? 'primary' : 'danger'}`}>
                    Add Folder<input type="file" className="d-none" webkitdirectory="" directory="" disabled={disabled} onChange={e => onFiles(e, visibility)} />
                </label>
            </div>
            {renderList(visibility, 'File')}
        </div>)}
        <h6 className="text-success">3. Hyperlinks for Document Download</h6>
        <label className="form-label" htmlFor={`addendum-links-${number}`}>URL / Path (Paste one or more links separated by Enter)</label>
        <textarea id={`addendum-links-${number}`} className="form-control mb-2" value={links} disabled={disabled} onChange={e => setLinks(e.target.value)} />
        <div className="d-flex gap-2 mb-2">{['Public', 'Private'].map(visibility => <button key={visibility} type="button" className={`btn btn-sm btn-outline-${visibility === 'Public' ? 'success' : 'danger'}`} disabled={disabled || !links.trim()} onClick={() => { onLinks(visibility, links); setLinks(''); }}>{visibility} Link</button>)}</div>
        {renderList('Public', 'Link')}{renderList('Private', 'Link')}
        <small className="text-muted">Pending attachments can be removed before saving. Saved attachments cannot be deleted; more can be added.</small>
    </section>;
}
