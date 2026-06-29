import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

const CollaborativeNotes = ({ enquiryId, enquiryData }) => {
    const { currentUser } = useAuth();
    const { masters } = useData();
    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState('');
    const [loading, setLoading] = useState(false);

    // Fallback if enquiryId prop is missing but exists in data
    const effectiveID = enquiryId || enquiryData?.RequestNo || enquiryData?.ID;

    // Derived Access State using useMemo to ensure reactivity
    const hasAccess = React.useMemo(() => {
        if (!currentUser) return false;

        const roleString = currentUser.role || currentUser.Roles || '';
        const roles = typeof roleString === 'string'
            ? roleString.split(',').map(r => r.trim())
            : (Array.isArray(roleString) ? roleString : []);

        // 1. Admin
        if (roles.includes('Admin')) return true;

        // 2. Created By
        if (enquiryData && enquiryData.CreatedBy && currentUser.name &&
            enquiryData.CreatedBy.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) {
            return true;
        }

        // 3. Concerned SE
        if (enquiryData && currentUser.name) {
            const concernedSEs = enquiryData.SelectedConcernedSEs ||
                (enquiryData.ConcernedSE ? enquiryData.ConcernedSE.split(',').map(s => s.trim()) : []);

            const isConcernedSE = concernedSEs.some(se =>
                se.toLowerCase() === currentUser.name.trim().toLowerCase()
            );

            if (isConcernedSE || (enquiryData.ConcernedSE == currentUser.id)) return true;
        }

        // 4. Enquiry For (Email match)
        if (enquiryData && enquiryData.EnquiryFor && masters.enqItems) {
            const selectedItems = Array.isArray(enquiryData.EnquiryFor)
                ? enquiryData.EnquiryFor
                : (typeof enquiryData.EnquiryFor === 'string' ? enquiryData.EnquiryFor.split(',') : []);

            const cleanedItems = selectedItems.map(i => i.trim());
            const userEmail = (currentUser.email || currentUser.EmailId || '').trim().toLowerCase();

            for (const item of cleanedItems) {
                const masterItem = masters.enqItems.find(m => m.ItemName === item);
                if (masterItem) {
                    const commonMails = masterItem.CommonMailIds
                        ? (Array.isArray(masterItem.CommonMailIds) ? masterItem.CommonMailIds : masterItem.CommonMailIds.split(/[,;]/))
                        : [];

                    const ccMails = masterItem.CCMailIds
                        ? (Array.isArray(masterItem.CCMailIds) ? masterItem.CCMailIds : masterItem.CCMailIds.split(/[,;]/))
                        : [];

                    const emails = [...commonMails, ...ccMails].map(e => e.trim().toLowerCase());

                    if (userEmail && emails.includes(userEmail)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }, [currentUser, enquiryData, masters.enqItems]);

    useEffect(() => {
        if (effectiveID && hasAccess) {
            fetchNotes();
            const interval = setInterval(fetchNotes, 30000); // Poll every 30s
            return () => clearInterval(interval);
        }
    }, [effectiveID, hasAccess]);

    // Removed checkAccess function and initial useEffect

    const fetchNotes = async () => {
        try {
            const res = await fetch(`/api/enquiries/${encodeURIComponent(effectiveID)}/notes`);
            if (res.ok) {
                const data = await res.json();
                setNotes(data);
            }
        } catch (err) {
            console.error('Error fetching notes:', err);
        }
    };

    const handlePost = async () => {
        if (!newNote.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/enquiries/${encodeURIComponent(effectiveID)}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.id,
                    userName: currentUser.name,
                    userProfileImage: currentUser.ProfileImage,
                    content: newNote
                })
            });

            if (res.ok) {
                setNewNote('');
                fetchNotes();
            } else {
                alert('Failed to post note');
            }
        } catch (err) {
            alert('Failed to post note');
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (dateStr) => {
        const date = new Date(dateStr);
        // Desired format: DD-MMM-YYYY hh:mm AM/PM
        return format(date, 'dd-MMM-yyyy hh:mm a');
    };

    const isOwnNote = (note) => {
        if (!currentUser || !note) return false;
        const uid = note.UserID != null ? Number(note.UserID) : null;
        const curId = currentUser.id != null ? Number(currentUser.id) : null;
        if (uid != null && curId != null && !Number.isNaN(uid) && !Number.isNaN(curId) && uid === curId) {
            return true;
        }
        const a = (note.UserName || '').trim().toLowerCase();
        const b = (currentUser.name || '').trim().toLowerCase();
        return Boolean(a && b && a === b);
    };

    const [mentionQuery, setMentionQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredUsers, setFilteredUsers] = useState([]);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setNewNote(val);

        const cursor = e.target.selectionStart;
        const textBeforeCursor = val.slice(0, cursor);
        const words = textBeforeCursor.split(/\s+/);
        const lastWord = words[words.length - 1];

        if (lastWord.startsWith('@')) {
            const query = lastWord.slice(1).toLowerCase();
            if (query.length >= 3) {
                setMentionQuery(query);
                setShowSuggestions(true);

                if (masters.concernedSEs) {
                    const matches = masters.concernedSEs.filter(u =>
                        u.FullName.toLowerCase().includes(query)
                    );
                    setFilteredUsers(matches);
                }
            } else {
                setShowSuggestions(false);
            }
        } else {
            setShowSuggestions(false);
        }
    };

    const selectUser = (userName) => {
        // Find the last @ and replace
        const cursor = document.querySelector('#noteInput').selectionStart;
        const textBeforeCursor = newNote.slice(0, cursor);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        const prefix = newNote.slice(0, lastAtIndex);
        const suffix = newNote.slice(cursor);

        setNewNote(`${prefix}@${userName} ${suffix}`);
        setShowSuggestions(false);
        document.querySelector('#noteInput').focus();
    };

    if (!effectiveID) {
        return (
            <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                <div className="card-body p-4 text-center">
                    <h5 className="card-title fw-bold mb-3">Collaborative Notes</h5>
                    <p className="text-muted fst-italic">
                        <i className="bi bi-info-circle me-2"></i>
                        Please save the enquiry to access collaborative notes.
                    </p>
                </div>
            </div>
        );
    }

    if (!hasAccess) {
        return (
            <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                <div className="card-body p-4 text-center">
                    <h5 className="card-title fw-bold mb-3">Collaborative Notes</h5>
                    <div className="alert alert-warning d-inline-block">
                        <i className="bi bi-lock-fill me-2"></i>
                        Access Restricted. You do not have permission to view notes for this enquiry.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
            <div className="card-body p-4">
                <h5 className="card-title fw-bold mb-4">Collaborative Notes</h5>

                {/* Notes List */}
                <div className="bg-light p-3 rounded border mb-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {notes.length === 0 ? (
                        <p className="text-muted text-center small my-3">No notes yet. Start the conversation!</p>
                    ) : (
                        notes.map(note => {
                            const own = isOwnNote(note);
                            return (
                                <div
                                    key={note.ID}
                                    className={`d-flex mb-3 ${own ? 'justify-content-end' : 'justify-content-start'}`}
                                >
                                    <div
                                        className={`d-flex gap-2 min-w-0 ${own ? 'flex-row-reverse' : 'flex-row'}`}
                                        style={{ maxWidth: 'min(88%, 26rem)' }}
                                    >
                                        <div className="flex-shrink-0">
                                            {note.UserProfileImage ? (
                                                <img src={note.UserProfileImage} alt="" className="rounded-circle" style={{ width: 32, height: 32, objectFit: 'cover' }} />
                                            ) : (
                                                <div
                                                    className={`rounded-circle d-flex align-items-center justify-content-center text-white ${own ? 'bg-primary' : 'bg-secondary'}`}
                                                    style={{ width: 32, height: 32, fontSize: '0.85rem' }}
                                                >
                                                    {note.UserName ? note.UserName.charAt(0).toUpperCase() : 'U'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-shrink-1 min-w-0">
                                            <div
                                                className={`p-2 rounded-3 shadow-sm ${own
                                                    ? 'bg-primary bg-opacity-10 border border-primary border-opacity-25'
                                                    : 'bg-white border'
                                                    }`}
                                            >
                                                <div className="d-flex justify-content-between align-items-center mb-1 gap-2">
                                                    <small className={`fw-bold ${own ? 'text-primary' : 'text-dark'}`}>
                                                        {own ? 'You' : note.UserName}
                                                    </small>
                                                    <small className="text-muted text-nowrap" style={{ fontSize: '0.75rem' }}>
                                                        {formatTime(note.CreatedAt)}
                                                    </small>
                                                </div>
                                                <p className="mb-0 text-secondary text-start" style={{ fontSize: '0.9rem', wordBreak: 'break-word' }}>
                                                    {note.NoteContent.split(' ').map((word, i) =>
                                                        word.startsWith('@')
                                                            ? <span key={`${note.ID}-${i}`} className="text-primary fw-bold me-1">{word}</span>
                                                            : <span key={`${note.ID}-${i}`}>{word} </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Input */}
                <div className="d-flex gap-2 align-items-center position-relative">
                    <div className="me-0">
                        {currentUser.ProfileImage ? (
                            <img src={currentUser.ProfileImage} alt={currentUser.name} className="rounded-circle" style={{ width: 32, height: 32, objectFit: 'cover' }} />
                        ) : (
                            <div className="bg-warning text-white rounded-circle d-flex align-items-center justify-content-center" style={{ width: 32, height: 32 }}>
                                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                        )}
                    </div>
                    <div className="flex-grow-1 position-relative">
                        <input
                            id="noteInput"
                            type="text"
                            className="form-control"
                            placeholder="Add a new note..."
                            value={newNote}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    if (showSuggestions && filteredUsers.length > 0) {
                                        e.preventDefault();
                                        selectUser(filteredUsers[0].FullName);
                                    } else {
                                        // Must prevent default or Enter submits the parent Enquiry form
                                        e.preventDefault();
                                        handlePost();
                                    }
                                }
                            }}
                            autoComplete="off"
                        />
                        {/* Suggestions Dropdown */}
                        {showSuggestions && filteredUsers.length > 0 && (
                            <div className="card position-absolute shadow-sm" style={{ bottom: '100%', left: 0, width: '100%', zIndex: 1000, maxHeight: '150px', overflowY: 'auto' }}>
                                <div className="list-group list-group-flush">
                                    {filteredUsers.map(u => (
                                        <button
                                            type="button"
                                            key={u.ID}
                                            className="list-group-item list-group-item-action py-2 small"
                                            onClick={() => selectUser(u.FullName)}
                                        >
                                            {u.FullName}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button type="button" className="btn btn-primary" onClick={handlePost} disabled={loading || !newNote.trim()}>
                        {loading ? 'Posting...' : 'Post'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CollaborativeNotes;
