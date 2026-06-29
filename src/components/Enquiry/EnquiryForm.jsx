import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import ListBoxControl from './ListBoxControl';
import HierarchyBuilder from './HierarchyBuilder';
import SearchableSelectControl from './SearchableSelectControl';
import SearchEnquiry from './SearchEnquiry';
import CustomerModal from '../Modals/CustomerModal';
import ContactModal from '../Modals/ContactModal';
import UserModal from '../Modals/UserModal';
import EnquiryItemModal from '../Modals/EnquiryItemModal';
// import ParticleBackground from '../Common/ParticleBackground';
import DateInput from './DateInput';
import ValidationTooltip from '../Common/ValidationTooltip';
import CollaborativeNotes from './CollaborativeNotes';
import { inferAssignedSEsForEnquiryForItem } from '../../utils/inferAssignedSEsForEnquiryForItem';
import {
    buildConcernedSEAssignmentsFromEnquiryFor,
    hydrateEnquiryForWithConcernedSEAssignments,
} from '../../utils/concernedSeAssignments';
import {
    sendEnquiryInternalNotification,
    openCustomerAcknowledgementDraft,
} from '../../utils/enquiryOutlookDraft';

const EMS_API_BASE = import.meta.env.VITE_API_BASE || '';

async function readAttachmentUploadError(res) {
    const errText = await res.text();
    try {
        const data = JSON.parse(errText);
        return [data.message || data.error, data.detail, data.hint].filter(Boolean).join(' — ') || errText;
    } catch {
        const match = errText.match(/<pre>([^<]+)<\/pre>/i);
        if (match) return match[1].trim();
        return errText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    }
}

const triggerBlobDownload = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One acknowledgement draft per customer — To = Received From email, paired by list index. */
function buildCustomerAckTargets(customerList, receivedFromList, contacts = []) {
    const pairedLen = Math.min((customerList || []).length, (receivedFromList || []).length);
    const targets = [];
    for (let i = 0; i < pairedLen; i++) {
        const rf = String(receivedFromList[i] || '').trim();
        if (!rf) continue;
        const parts = rf.split('|').map((s) => s.trim());
        const contactName = parts[0] || '';
        const companyName = parts[1] || '';
        const master = (contacts || []).find(
            (c) =>
                String(c.ContactName || '').trim() === contactName &&
                String(c.CompanyName || '').trim() === companyName
        );
        const email = String(master?.EmailId || master?.email || '').trim();
        if (!email) continue;
        targets.push({
            customerName: String(customerList[i] || '').trim(),
            contactName,
            companyName,
            email,
        });
    }
    return targets;
}

/** Alphanumeric fold for company / contractor name comparison (OCR & master data variants). */
function normalizeCompanyKey(str) {
    return str ? String(str).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function companyNameTokens(str) {
    return String(str || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1);
}

/**
 * True if a contact's CompanyName belongs to the selected customer / contractor string.
 * Handles "CO" vs "Company", spacing, and minor wording differences vs Master_Customer.
 */
function contactCompanyMatchesCustomer(contactCompany, selectedCustomerName, customers = []) {
    if (!contactCompany || !selectedCustomerName) return false;
    const a = selectedCustomerName.trim();
    const b = contactCompany.trim();
    if (a.toLowerCase() === b.toLowerCase()) return true;

    const na = normalizeCompanyKey(a);
    const nb = normalizeCompanyKey(b);
    if (na && na === nb) return true;
    if (na.length >= 16 && nb.length >= 16 && (na.includes(nb) || nb.includes(na))) return true;

    const custRow = customers.find(
        (c) =>
            c.CompanyName &&
            (c.CompanyName.trim().toLowerCase() === a.toLowerCase() ||
                normalizeCompanyKey(c.CompanyName) === na ||
                (na.length >= 14 &&
                    nb.length >= 14 &&
                    (normalizeCompanyKey(c.CompanyName).includes(na) || na.includes(normalizeCompanyKey(c.CompanyName)))))
    );
    if (custRow) {
        const nk = normalizeCompanyKey(custRow.CompanyName);
        return nb === nk || (nk.length >= 14 && nb.length >= 14 && (nk.includes(nb) || nb.includes(nk)));
    }

    const ta = companyNameTokens(a);
    const tbSet = new Set(companyNameTokens(b));
    if (ta.length >= 3 && tbSet.size >= 3) {
        let inter = 0;
        for (const t of ta) if (tbSet.has(t)) inter += 1;
        const denom = Math.min(ta.length, tbSet.size);
        if (denom >= 4 && inter / denom >= 0.45) return true;
    }

    return false;
}

/** Same contractor / customer display name for duplicate checks (spacing & master-data variants). */
function isSameCompanyName(a, b, customers = []) {
    const ta = (a || '').trim();
    const tb = (b || '').trim();
    if (!ta || !tb) return false;
    if (ta.toLowerCase() === tb.toLowerCase()) return true;
    const na = normalizeCompanyKey(ta);
    const nb = normalizeCompanyKey(tb);
    if (na && nb && na === nb) return true;
    return contactCompanyMatchesCustomer(tb, ta, customers) || contactCompanyMatchesCustomer(ta, tb, customers);
}

function findDuplicateCustomerIndex(customerList, customers = []) {
    const list = customerList || [];
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            if (isSameCompanyName(list[i], list[j], customers)) return j;
        }
    }
    return -1;
}

function createEmptyFormState() {
    return {
        SourceOfInfo: '',
        EnquiryDate: new Date().toLocaleDateString('en-CA'),
        DueOn: '',
        SiteVisitDate: '',
        EnquiryType: '',
        EnquiryFor: '',
        CustomerName: '',
        ReceivedFrom: '',
        ProjectName: '',
        ClientName: '',
        ConsultantName: '',
        ConcernedSE: '',
        DetailsOfEnquiry: '',
        DocumentsReceived: '',
        hardcopy: false,
        drawing: false,
        dvd: false,
        spec: false,
        eqpschedule: false,
        Remark: '',
        AutoAck: false,
        ceosign: false,
        Status: 'Enquiry',
        EnquiryStatus: 'Active',
        CustomerRefNo: ''
    };
}

const EnquiryForm = ({ requestNoToOpen }) => {
    const { masters, addEnquiry, updateEnquiry, getEnquiry, updateMasters, addMaster, updateMaster, enquiries } = useData();

    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('enquiry_subTab') || 'New');

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('enquiry_subTab', activeTab);
    }, [activeTab]);

    // Modal States
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showEnqItemModal, setShowEnqItemModal] = useState(false);

    // Edit States
    const [editData, setEditData] = useState(null);
    const [modalMode, setModalMode] = useState('Add');
    const [fixedCategory, setFixedCategory] = useState(null);

    // Modify State
    const [modifyRequestNo, setModifyRequestNo] = useState('');
    const [isModifyMode, setIsModifyMode] = useState(false);
    const [hasOpenedFromProp, setHasOpenedFromProp] = useState(false);
    /** Activity-based workflow from GET /api/enquiries/:id/milestone-status (per-branch pricing + quotes). */
    const [workflowComputed, setWorkflowComputed] = useState(null);

    // Effect to open from prop
    useEffect(() => {
        if (requestNoToOpen && !hasOpenedFromProp && enquiries) {
            handleOpenFromSearch(requestNoToOpen);
            setHasOpenedFromProp(true);
        }
    }, [requestNoToOpen, enquiries, hasOpenedFromProp]);

    // Initialize formData from localStorage if available, but only for 'New' mode
    const [formData, setFormData] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_formData');
        if (saved && (localStorage.getItem('enquiry_subTab') || 'New') === 'New') {
            try {
                const parsed = JSON.parse(saved);
                delete parsed.RequestNo;
                return { ...createEmptyFormState(), ...parsed };
            } catch (e) {
                console.error("Failed to parse enquiry_new_formData", e);
            }
        }
        return createEmptyFormState();
    });

    useEffect(() => {
        // Only save to localStorage if we are in 'New' mode to avoid overwriting draft with Modify data
        if (activeTab === 'New') {
            const { RequestNo: _omit, ...draftWithoutRequestNo } = formData;
            localStorage.setItem('enquiry_new_formData', JSON.stringify(draftWithoutRequestNo));
        }
    }, [formData, activeTab]);

    // ListBox States
    const [enqTypeList, setEnqTypeList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_enqTypeList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [enqForList, setEnqForList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_enqForList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [customerList, setCustomerList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_customerList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [receivedFromList, setReceivedFromList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_receivedFromList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [seList, setSeList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_seList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [consultantList, setConsultantList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_consultantList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [pricedEnquiryForIds, setPricedEnquiryForIds] = useState(() => new Set());

    useEffect(() => {
        if (activeTab === 'New') {
            localStorage.setItem('enquiry_new_enqTypeList', JSON.stringify(enqTypeList));
            localStorage.setItem('enquiry_new_enqForList', JSON.stringify(enqForList));
            localStorage.setItem('enquiry_new_customerList', JSON.stringify(customerList));
            localStorage.setItem('enquiry_new_receivedFromList', JSON.stringify(receivedFromList));
            localStorage.setItem('enquiry_new_seList', JSON.stringify(seList));
            localStorage.setItem('enquiry_new_consultantList', JSON.stringify(consultantList));
        }
    }, [enqTypeList, enqForList, customerList, receivedFromList, seList, consultantList, activeTab]);

    // Validation Errors
    const [errors, setErrors] = useState({});
    const [attachments, setAttachments] = useState([]);
    const [pendingFiles, setPendingFiles] = useState([]); // Now stores only meta: { id, fileName, previewUrl }
    const fileObjectsRef = useRef({}); // Stores actual File objects: { [id]: File }
    const [ackSEList, setAckSEList] = useState([]);
    const [hyperlink, setHyperlink] = useState({ name: '', url: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Project Suggestions State
    const [projectSuggestions, setProjectSuggestions] = useState([]);
    const [showProjectSuggestions, setShowProjectSuggestions] = useState(false);

    // Access Control State
    const [canEdit, setCanEdit] = useState(true);
    const [isLimitedEdit, setIsLimitedEdit] = useState(false); // New state for limited editing

    // Track original items when form loads (for selective removal by limited users)
    const [originalEnqForList, setOriginalEnqForList] = useState([]);
    const [originalSeList, setOriginalSeList] = useState([]);
    const [originalCustomerList, setOriginalCustomerList] = useState([]);
    const [originalReceivedFromList, setOriginalReceivedFromList] = useState([]);
    const [originalConsultantList, setOriginalConsultantList] = useState([]);

    // Ref for error section to scroll to it when validation fails
    const errorSectionRef = useRef(null);
    /** Prevents double-submit while add/update is in flight (state updates are async). */
    const submitInFlightRef = useRef(false);
    /** After initial SE hydration for a loaded enquiry, do not re-infer (would undo removing the last assignee). */
    const enquiryForHydratedRef = useRef(null);

    const enquiryForAssigneeIssues = useMemo(() => {
        const missingIds = [];
        (enqForList || []).forEach((item, idx) => {
            const names =
                item && typeof item === 'object' && Array.isArray(item.assignedSEs)
                    ? item.assignedSEs.filter(Boolean)
                    : [];
            if (names.length === 0) {
                missingIds.push(
                    typeof item === 'object' && item?.id != null ? String(item.id) : `legacy-${idx}`
                );
            }
        });
        return missingIds;
    }, [enqForList]);

    const enquiryForAccountableIssues = useMemo(() => {
        const missingIds = [];
        (enqForList || []).forEach((item, idx) => {
            const names =
                item && typeof item === 'object' && Array.isArray(item.assignedSEs)
                    ? item.assignedSEs.filter(Boolean)
                    : [];
            if (names.length > 1 && !String(item.accountableSE || '').trim()) {
                missingIds.push(
                    typeof item === 'object' && item?.id != null ? String(item.id) : `legacy-${idx}`
                );
            }
        });
        return missingIds;
    }, [enqForList]);

    const enquiryForStructureHint = useMemo(() => {
        const parts = [];
        if (enquiryForAssigneeIssues.length > 0) {
            parts.push('Select SE / EE / QS for each division row.');
        }
        if (enquiryForAccountableIssues.length > 0) {
            parts.push('When multiple members are on a division, mark one accountable (bold red ✓).');
        }
        return parts.join(' ');
    }, [enquiryForAssigneeIssues.length, enquiryForAccountableIssues.length]);

    /**
     * Centres the entire Enquiry submenu strip horizontally under the "Enquiry" tab
     * in the main top nav. The strip's parent flex row keeps `justify-content-start`,
     * so we slide the strip with a measured `marginLeft`. Recomputes on mount, window
     * resize, and tab toggle (Modify reveals an extra info row that may shift layout).
     */
    const submenuStripRef = useRef(null);
    const [submenuStripMarginLeftPx, setSubmenuStripMarginLeftPx] = useState(null);
    useLayoutEffect(() => {
        const recompute = () => {
            const strip = submenuStripRef.current;
            const navBtn = document.querySelector('[data-ems-main-nav-id="Enquiry"]');
            if (!strip || !navBtn) return;
            const parent = strip.parentElement;
            if (!parent) return;
            const stripRect = strip.getBoundingClientRect();
            const navRect = navBtn.getBoundingClientRect();
            const parentRect = parent.getBoundingClientRect();
            const navCenterX = navRect.left + navRect.width / 2;
            const desiredLeftWithinParent = navCenterX - parentRect.left - stripRect.width / 2;
            setSubmenuStripMarginLeftPx(Math.max(0, desiredLeftWithinParent));
        };
        recompute();
        window.addEventListener('resize', recompute);
        return () => window.removeEventListener('resize', recompute);
    }, [activeTab]);

    // Dynamic Lists
    const combinedClientNames = useMemo(() => {
        const combined = [
            ...(masters.existingCustomers || []),
            ...(masters.clientNames || []),
            ...(masters.consultantNames || [])
        ];
        return Array.from(new Set(combined.filter(Boolean))).sort();
    }, [masters.existingCustomers, masters.clientNames, masters.consultantNames]);

    const isFormEmpty = useMemo(() => {
        // We ignore EnquiryDate as it has a default, and RequestNo/Status/etc.
        const hasText = (formData.SourceOfInfo || '').trim() ||
            (formData.DueOn || '').trim() ||
            (formData.SiteVisitDate || '').trim() ||
            (formData.ProjectName || '').trim() ||
            (formData.ClientName || '').trim() ||
            (formData.ConsultantName || '').trim() ||
            (formData.DetailsOfEnquiry || '').trim() ||
            (formData.DocumentsReceived || '').trim() ||
            (formData.Remark || '').trim() ||
            (formData.CustomerRefNo || '').trim();

        const hasCheck = formData.hardcopy || formData.drawing || formData.dvd ||
            formData.spec || formData.eqpschedule || formData.AutoAck || formData.ceosign;

        const hasLists = enqTypeList.length > 0 ||
            enqForList.length > 0 ||
            customerList.length > 0 ||
            receivedFromList.length > 0 ||
            seList.length > 0 ||
            consultantList.length > 0;

        return !hasText && !hasCheck && !hasLists;
    }, [formData, enqTypeList, enqForList, customerList, receivedFromList, seList, consultantList]);

    const enquiriesList = useMemo(() => enquiries ? Object.values(enquiries) : [], [enquiries]);

    const renderContactOption = useCallback((opt) => {
        const [name, company] = opt.split('|');
        return `${name} (${company})`;
    }, []);

    const renderContactListBoxItem = useCallback((item, idx) => {
        const [name, company] = item.split('|');
        return `${idx + 1}. ${name} (${company})`;
    }, []);

    const receivedFromOptions = useMemo(() => {
        if (!formData.CustomerName || !masters.contacts) return [];
        const customers = masters.customers || [];
        const seen = new Set();
        const out = [];
        for (const c of masters.contacts) {
            if (!c.ContactName || !c.CompanyName) continue;
            if (!contactCompanyMatchesCustomer(c.CompanyName, formData.CustomerName, customers)) continue;
            const key = `${c.ContactName}|${c.CompanyName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(key);
        }
        return out;
    }, [formData.CustomerName, masters.contacts, masters.customers]);

    // Effect to determine edit permission
    useEffect(() => {
        if (activeTab === 'New') {
            setCanEdit(true);
            setIsLimitedEdit(false);
        } else if (activeTab === 'Modify' && isModifyMode) {
            checkEditPermission();
        }
    }, [activeTab, isModifyMode, formData.CreatedBy, currentUser]);

    const checkEditPermission = () => {
        if (!currentUser) return;
        const roleString = currentUser.role || currentUser.Roles || '';
        const userRoles = typeof roleString === 'string'
            ? roleString.split(',').map(r => r.trim().toLowerCase())
            : (Array.isArray(roleString) ? roleString.map(r => r.toLowerCase()) : []);

        const isAdmin = userRoles.includes('admin') || userRoles.includes('system');
        const creatorName = (formData.CreatedBy || '').trim().toLowerCase();
        const currentUserName = (currentUser.name || '').trim().toLowerCase();
        const isCreator = creatorName === currentUserName;

        // Full edit: admin/system or enquiry creator only
        if (isAdmin || isCreator) {
            setCanEdit(true);
            setIsLimitedEdit(false);
            return;
        }

        // Anyone else: limited fields only (no removing list/hierarchy items); can save
        setCanEdit(true);
        setIsLimitedEdit(true);
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }

        // Project Name Autocomplete Logic
        if (field === 'ProjectName') {
            if (value && value.trim().length >= 3 && enquiriesList.length > 0) {
                const matches = enquiriesList.filter(e =>
                    e.ProjectName && e.ProjectName.toLowerCase().includes(value.toLowerCase())
                );
                setProjectSuggestions(matches);
                setShowProjectSuggestions(true);
            } else {
                setProjectSuggestions([]);
                setShowProjectSuggestions(false);
            }
        }
    };

    // Set CreatedBy on mount for New Enquiry (RequestNo is assigned on save only).
    useEffect(() => {
        if (activeTab === 'New' && !isModifyMode) {
            if (currentUser && currentUser.name) {
                setFormData(prev => ({ ...prev, CreatedBy: currentUser.name }));
            }
        }
    }, [activeTab, isModifyMode, currentUser]);

    // --- ListBox Handlers ---
    const handleAddEnqType = () => {
        if (formData.EnquiryType && !enqTypeList.includes(formData.EnquiryType)) {
            setEnqTypeList([...enqTypeList, formData.EnquiryType]);
            handleInputChange('EnquiryType', '');
            // Clear error if exists
            if (errors.EnquiryType) {
                setErrors(prev => {
                    const { EnquiryType, ...rest } = prev;
                    return rest;
                });
            }
        }
    };

    const handleAddEnqFor = () => {
        if (formData.EnquiryFor && !enqForList.includes(formData.EnquiryFor)) {
            setEnqForList([...enqForList, formData.EnquiryFor]);
            handleInputChange('EnquiryFor', '');
            // Clear error if exists
            if (errors.EnquiryFor) {
                setErrors(prev => {
                    const { EnquiryFor, ...rest } = prev;
                    return rest;
                });
            }
        }
    };

    const handleAddReceivedFrom = () => {
        if (!formData.CustomerName) {
            alert('Please select a Customer Name first');
            return;
        }

        if (!formData.ReceivedFrom) {
            alert('Please select a Received From contact');
            return;
        }

        const cust = (formData.CustomerName || '').trim();
        const rf = formData.ReceivedFrom;
        const customersCatalog = masters.customers || [];
        const pairedLen = Math.min(customerList.length, receivedFromList.length);

        // When the Customer row already exists but its Received From slot is empty
        // (user removed the RF in modify mode to update the contact while pricing
        // exists), pair the new RF with that customer in place — do NOT push a
        // duplicate customer row.
        if (customerList.length > receivedFromList.length) {
            const nextSlotIdx = receivedFromList.length;
            const customerAtNextSlot = (customerList[nextSlotIdx] || '').trim();
            if (isSameCompanyName(customerAtNextSlot, cust, customersCatalog)) {
                setReceivedFromList((prev) => [...prev, rf]);
                handleInputChange('ReceivedFrom', '');
                handleInputChange('CustomerName', '');
                if (errors.ReceivedFrom) {
                    setErrors((prev) => {
                        const { ReceivedFrom, ...rest } = prev;
                        return rest;
                    });
                }
                if (errors.CustomerName) {
                    setErrors((prev) => {
                        const { CustomerName, ...rest } = prev;
                        return rest;
                    });
                }
                return;
            }
        }

        const duplicatePair = customerList.slice(0, pairedLen).some(
            (c, i) => isSameCompanyName(c, cust, customersCatalog) && receivedFromList[i] === rf
        );
        if (duplicatePair) {
            alert('This customer and contact pair is already in the list');
            return;
        }

        if (customerList.some((c) => isSameCompanyName(c, cust, customersCatalog))) {
            alert(
                'This customer / contractor is already in the list. Each company can appear only once — add another contact only when a row is still waiting for a Received From.'
            );
            return;
        }

        setCustomerList((prev) => [...prev, formData.CustomerName]);
        setReceivedFromList((prev) => [...prev, rf]);

        handleInputChange('ReceivedFrom', '');
        handleInputChange('CustomerName', '');

        if (errors.ReceivedFrom) {
            setErrors((prev) => {
                const { ReceivedFrom, ...rest } = prev;
                return rest;
            });
        }
        if (errors.CustomerName) {
            setErrors((prev) => {
                const { CustomerName, ...rest } = prev;
                return rest;
            });
        }
    };

    const handleAddSE = () => {
        if (formData.ConcernedSE && !seList.includes(formData.ConcernedSE)) {
            setSeList([...seList, formData.ConcernedSE]);
            handleInputChange('ConcernedSE', '');
            // Clear error if exists
            if (errors.ConcernedSE) {
                setErrors(prev => {
                    const { ConcernedSE, ...rest } = prev;
                    return rest;
                });
            }
        }
    };

    const handleAddConsultant = () => {
        if (formData.ConsultantName && !consultantList.includes(formData.ConsultantName)) {
            setConsultantList([...consultantList, formData.ConsultantName]);
            handleInputChange('ConsultantName', '');
        }
    };

    /**
     * Triggered by the `-` button on the Received From listbox. The Customer listbox
     * itself does not expose a remove button (`canRemove={false}`), so this handler is
     * the only path that drops a row. Behavior:
     *   - Modify mode + pricing already saved: keep the Customer (pricing is keyed by
     *     customer), drop only its Received From, and pre-fill the dropdowns so the
     *     user can pick a new contact and click `+` to re-pair it for the same customer.
     *   - Otherwise: drop both Customer and Received From at the same index, as before.
     */
    const handleRemoveCustomerPair = (selectedIndex) => {
        if (isLimitedEdit) return;
        const pairedLen = Math.min(customerList.length, receivedFromList.length);
        if (pairedLen === 0) return;

        let idx = selectedIndex;
        if (idx == null || idx < 0 || idx >= pairedLen) {
            idx = pairedLen - 1;
        }

        if (isModifyMode && pricedEnquiryForIds.size > 0) {
            const stayingCustomer = customerList[idx];
            setReceivedFromList((prev) => prev.filter((_, i) => i !== idx));
            if (stayingCustomer) {
                handleInputChange('CustomerName', stayingCustomer);
                handleInputChange('ReceivedFrom', '');
            }
            return;
        }

        setCustomerList((prev) => prev.filter((_, i) => i !== idx));
        setReceivedFromList((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleRemoveItem = (list, setList, originalList = []) => {
        if (isLimitedEdit) return;
        if (list.length > 0) {
            setList(list.slice(0, -1));
        }
    };

    // --- Modal Open Handlers ---
    const openNewModal = (setter, category = null, prefilledData = null) => {
        setEditData(prefilledData);
        setModalMode('Add');
        setFixedCategory(category);
        setter(true);
    };

    const handleEditEnqFor = (itemName) => {
        let selected = itemName || formData.EnquiryFor;

        // Handle "L1 - Name" format from HierarchyBuilder (strip prefix)
        if (typeof selected === 'string') {
            const prefixMatch = selected.match(/^L\d+\s-\s(.+)/);
            if (prefixMatch) {
                selected = prefixMatch[1];
            }
        }

        if (!selected) return alert("Select an item to edit");
        const itemData = masters.enqItems.find(i => i.ItemName === selected);
        if (itemData) {
            setEditData(itemData);
            setModalMode('Edit');
            setShowEnqItemModal(true);
        } else {
        }
    };

    const handleEditCustomer = () => {
        const selected = formData.CustomerName;
        if (!selected) return alert("Select a customer to edit");
        const custData = masters.customers.find(c => c.CompanyName === selected);
        if (custData) {
            setEditData(custData);
            setModalMode('Edit');
            setFixedCategory('Contractor');
            setShowCustomerModal(true);
        }
    };

    const handleEditContact = () => {
        const selected = formData.ReceivedFrom;
        if (!selected) return alert("Select a contact to edit");
        const [name, company] = selected.split('|');
        const contactData = masters.contacts.find(c => c.ContactName === name && c.CompanyName === company);
        if (contactData) {
            setEditData(contactData);
            setModalMode('Edit');
            setShowContactModal(true);
        }
    };

    const handleEditClient = () => {
        const selected = formData.ClientName;
        if (!selected) return alert("Select a client to edit");
        const custData = masters.customers.find(c => c.CompanyName === selected);
        if (custData) {
            setEditData(custData);
            setModalMode('Edit');
            setFixedCategory('Client');
            setShowCustomerModal(true);
        } else {
            alert("Client details not found in master data.");
        }
    };

    const handleEditConsultant = () => {
        const selected = formData.ConsultantName;
        if (!selected) return alert("Select a consultant to edit");
        const custData = masters.customers.find(c => c.CompanyName === selected);
        if (custData) {
            setEditData(custData);
            setModalMode('Edit');
            setFixedCategory('Consultant');
            setShowCustomerModal(true);
        } else {
            alert("Consultant details not found in master data.");
        }
    };

    const handleEditSE = () => {
        const selected = formData.ConcernedSE;
        if (!selected) return alert("Select a SE to edit");
        const userData = masters.users.find(u => u.FullName === selected);
        if (userData) {
            setEditData(userData);
            setModalMode('Edit');
            setShowUserModal(true);
        }
    };

    // --- Modal Submit Handlers ---
    const handleCustomerSubmit = async (data) => {
        if (modalMode === 'Add') {
            const result = await addMaster('customer', {
                ...data,
                ...(isModifyMode && formData.RequestNo ? { RequestNo: formData.RequestNo } : {}),
            });
            if (!result) return;
            const newItem = { ...data, ID: result.id };

            // Update specific list based on category
            if (data.Category === 'Contractor') {
                handleInputChange('CustomerName', data.CompanyName);
                handleInputChange('ReceivedFrom', '');
                updateMasters(prev => ({
                    ...prev,
                    existingCustomers: prev.existingCustomers.includes(data.CompanyName)
                        ? prev.existingCustomers
                        : [...prev.existingCustomers, data.CompanyName],
                    customers: [...prev.customers, newItem]
                }));
            } else if (data.Category === 'Client') {
                handleInputChange('ClientName', data.CompanyName);
                updateMasters(prev => ({
                    ...prev,
                    clientNames: [...prev.clientNames, data.CompanyName],
                    customers: [...prev.customers, newItem]
                }));
            } else if (data.Category === 'Consultant') {
                handleInputChange('ConsultantName', data.CompanyName);
                updateMasters(prev => ({
                    ...prev,
                    consultantNames: [...prev.consultantNames, data.CompanyName],
                    customers: [...prev.customers, newItem]
                }));
            }
        } else {
            if (data.ID) {
                const success = await updateMaster('customer', data.ID, data);
                if (success) {
                    updateMasters(prev => ({
                        ...prev,
                        customers: prev.customers.map(c => c.ID == data.ID ? data : c),
                        // Update contacts if company name changed
                        contacts: prev.contacts.map(c => c.CompanyName === editData.CompanyName ? { ...c, CompanyName: data.CompanyName } : c),
                        // Update lists if name changed
                        existingCustomers: prev.existingCustomers.map(name => name === editData.CompanyName ? data.CompanyName : name),
                        clientNames: prev.clientNames.map(name => name === editData.CompanyName ? data.CompanyName : name),
                        consultantNames: prev.consultantNames.map(name => name === editData.CompanyName ? data.CompanyName : name)
                    }));

                    // Update local lists
                    setCustomerList(prev => prev.map(name => name === editData.CompanyName ? data.CompanyName : name));
                    setReceivedFromList(prev => prev.map(item => {
                        const [contact, company] = item.split('|');
                        if (company === editData.CompanyName) {
                            return `${contact}|${data.CompanyName}`;
                        }
                        return item;
                    }));

                    // Update form field if currently selected
                    if (formData.CustomerName === editData.CompanyName) handleInputChange('CustomerName', data.CompanyName);
                    if (formData.ClientName === editData.CompanyName) handleInputChange('ClientName', data.CompanyName);
                    if (formData.ConsultantName === editData.CompanyName) handleInputChange('ConsultantName', data.CompanyName);

                    if (formData.ReceivedFrom) {
                        const [contact, company] = formData.ReceivedFrom.split('|');
                        if (company === editData.CompanyName) {
                            handleInputChange('ReceivedFrom', `${contact}|${data.CompanyName}`);
                        }
                    }

                    setEditData(data);
                } else {
                    alert('Failed to update customer');
                }
            }
        }
    };

    const handleContactSubmit = async (data) => {
        if (modalMode === 'Add') {
            const result = await addMaster('contact', {
                ...data,
                ...(isModifyMode && formData.RequestNo ? { RequestNo: formData.RequestNo } : {}),
            });
            if (!result) return;
            const newItem = { ...data, ID: result.id };
            updateMasters(prev => {
                const newContacts = [...prev.contacts, newItem];
                const newCustomers = prev.existingCustomers.includes(data.CompanyName)
                    ? prev.existingCustomers
                    : [...prev.existingCustomers, data.CompanyName];
                return { ...prev, contacts: newContacts, existingCustomers: newCustomers };
            });
            handleInputChange('CustomerName', data.CompanyName);
            const val = `${data.ContactName}|${data.CompanyName}`;
            handleInputChange('ReceivedFrom', val);
            const customersCatalog = masters.customers || [];
            const pairedLen = Math.min(customerList.length, receivedFromList.length);

            if (customerList.length > receivedFromList.length) {
                const nextSlotIdx = receivedFromList.length;
                const slotCust = customerList[nextSlotIdx] || '';
                if (isSameCompanyName(slotCust, data.CompanyName, customersCatalog)) {
                    setReceivedFromList((prev) => [...prev, val]);
                    return;
                }
            }

            const duplicatePair = customerList.slice(0, pairedLen).some(
                (c, i) => isSameCompanyName(c, data.CompanyName, customersCatalog) && receivedFromList[i] === val
            );
            if (duplicatePair) {
                alert('This customer and contact pair is already in the list');
                return;
            }

            if (customerList.some((c) => isSameCompanyName(c, data.CompanyName, customersCatalog))) {
                alert(
                    'This customer / contractor is already in the list. Each company can appear only once — add another contact only when a row is still waiting for a Received From.'
                );
                return;
            }
            setCustomerList((prev) => [...prev, data.CompanyName]);
            setReceivedFromList((prev) => [...prev, val]);
        } else {
            if (data.ID) {
                const success = await updateMaster('contact', data.ID, data);
                if (success) {
                    updateMasters(prev => ({
                        ...prev,
                        contacts: prev.contacts.map(c => c.ID == data.ID ? data : c)
                    }));

                    // Robust update strategy: Find the item in the list that matches the edited data
                    // We use editData (which opened the modal) to find the target in the list
                    const newVal = `${data.ContactName}|${data.CompanyName}`;
                    let actualOldVal = formData.ReceivedFrom;

                    // Find index in the current list
                    const listIndex = receivedFromList.findIndex(item => {
                        const [n, c] = item.split('|');
                        return n.trim() === editData.ContactName.trim() && c.trim() === editData.CompanyName.trim();
                    });

                    if (listIndex !== -1) {
                        actualOldVal = receivedFromList[listIndex];
                        // Update list using index
                        setReceivedFromList(prev => {
                            const newArr = [...prev];
                            newArr[listIndex] = newVal;
                            return newArr;
                        });
                    } else {
                        // Fallback: try to update by value if not found by strict match
                        setReceivedFromList(prev => prev.map(val => val === actualOldVal ? newVal : val));
                    }

                    // Update form input if it matches the old value
                    if (formData.ReceivedFrom === actualOldVal) {
                        handleInputChange('ReceivedFrom', newVal);
                    }

                    // Handle Company Name change
                    if (data.CompanyName !== editData.CompanyName) {
                        // Add new company to customer list if not present
                        setCustomerList(prev => prev.includes(data.CompanyName) ? prev : [...prev, data.CompanyName]);

                        // If Customer Name matched old company (loose match), update it
                        if (formData.CustomerName && formData.CustomerName.trim() === editData.CompanyName.trim()) {
                            handleInputChange('CustomerName', data.CompanyName);
                        }
                    }

                    setEditData(data);
                } else {
                    alert('Failed to update contact');
                }
            }
        }
    };

    const handleUserSubmit = async (data) => {
        if (modalMode === 'Add') {
            const result = await addMaster('user', {
                ...data,
                ...(isModifyMode && formData.RequestNo ? { RequestNo: formData.RequestNo } : {}),
            });
            if (!result) return;
            const newItem = { ...data, ID: result.id };
            handleInputChange('ConcernedSE', data.FullName);
            updateMasters(prev => ({
                ...prev,
                users: [...prev.users, newItem],
                concernedSEs: [...prev.concernedSEs, data.FullName]
            }));
        } else {
            if (data.ID) {
                const success = await updateMaster('user', data.ID, data);
                if (success) {
                    updateMasters(prev => ({
                        ...prev,
                        users: prev.users.map(u => u.ID == data.ID ? data : u),
                        concernedSEs: prev.concernedSEs.map(name => name === editData.FullName ? data.FullName : name)
                    }));
                    if (formData.ConcernedSE === editData.FullName) {
                        handleInputChange('ConcernedSE', data.FullName);
                    }
                    setEditData(data);
                } else {
                    alert('Failed to update user');
                }
            }
        }
    };

    const handleEnqItemSubmit = async (data) => {
        if (modalMode === 'Add') {
            const result = await addMaster('enquiryItem', {
                ...data,
                ...(isModifyMode && formData.RequestNo ? { RequestNo: formData.RequestNo } : {}),
            });
            if (!result) return;
            const newItem = { ...data, ID: result.id };
            handleInputChange('EnquiryFor', data.ItemName);
            updateMasters(prev => ({
                ...prev,
                enqItems: [...prev.enqItems, newItem],
                enquiryFor: [...prev.enquiryFor, data.ItemName]
            }));
        } else {
            if (data.ID) {
                const success = await updateMaster('enquiryItem', data.ID, data);
                if (success) {
                    updateMasters(prev => {
                        const newItems = prev.enqItems.map(item => item.ID == data.ID ? data : item);
                        return {
                            ...prev,
                            enqItems: newItems,
                            enquiryFor: prev.enquiryFor.map(name => name === editData.ItemName ? data.ItemName : name)
                        };
                    });

                    // Update selected list if the name changed
                    setEnqForList(prev => prev.map(name => name === editData.ItemName ? data.ItemName : name));

                    if (formData.EnquiryFor === editData.ItemName) {
                        handleInputChange('EnquiryFor', data.ItemName);
                    }
                    setEditData(data);
                } else {
                    alert('Failed to update item');
                }
            }
        }
    };

    // --- Validation Effect ---
    useEffect(() => {
        if (formData.EnquiryDate && formData.DueOn) {
            if (new Date(formData.DueOn) < new Date(formData.EnquiryDate)) {
                setErrors(prev => ({ ...prev, DueOn: 'Due Date cannot be before Enquiry Date' }));
            } else {
                setErrors(prev => {
                    const { DueOn, ...rest } = prev;
                    return rest;
                });
            }
        }
    }, [formData.EnquiryDate, formData.DueOn]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!canEdit) {
            alert('You do not have permission to modify this enquiry.');
            return;
        }

        const newErrors = {};

        // Validate Required Fields (strict):
        // - Concerned SE comes only from explicit per-item assignments (not inference from master data).
        const derivedConcernedFromStructure = [...new Set(
            (enqForList || []).flatMap((item) => {
                if (!item || typeof item !== 'object') return [];
                return Array.isArray(item.assignedSEs) ? item.assignedSEs : [];
            })
        )].filter(Boolean);

        const requiredFields = {
            'SourceOfInfo': formData.SourceOfInfo,
            'EnquiryDate': formData.EnquiryDate,
            'DueOn': formData.DueOn,
            'EnquiryType': enqTypeList.length > 0,
            'EnquiryFor': enqForList.length > 0,
            'CustomerName': customerList.length > 0,
            'ReceivedFrom': receivedFromList.length > 0,
            'ProjectName': formData.ProjectName,
            'ClientName': formData.ClientName,
            // At least one engineer for the enquiry must exist.
            'ConcernedSE': derivedConcernedFromStructure.length > 0,
            'DetailsOfEnquiry': formData.DetailsOfEnquiry,
            'CustomerRefNo': formData.CustomerRefNo
        };

        Object.keys(requiredFields).forEach(field => {
            if (!requiredFields[field]) newErrors[field] = 'Required';
        });

        // Per-item assignment: strict - every Enquiry For row must have at least one SE chip.
        const missingAssigneeIds = [];
        const missingAccountableIds = [];
        (enqForList || []).forEach((item, idx) => {
            const names = (item && typeof item === 'object' && Array.isArray(item.assignedSEs))
                ? item.assignedSEs.filter(Boolean)
                : [];

            if (names.length === 0) {
                missingAssigneeIds.push(
                    typeof item === 'object' && item?.id != null ? String(item.id) : `legacy-${idx}`
                );
            } else if (names.length > 1 && !String(item.accountableSE || '').trim()) {
                missingAccountableIds.push(
                    typeof item === 'object' && item?.id != null ? String(item.id) : `legacy-${idx}`
                );
            }
        });
        if (missingAssigneeIds.length > 0) {
            newErrors.EnquiryFor = 'Select SE / EE / QS for each Enquiry For item';
            newErrors.EnquiryForAssigneeIds = missingAssigneeIds;
        }
        if (missingAccountableIds.length > 0) {
            newErrors.EnquiryForAccountable =
                'Mark the accountable member (bold red ✓) when multiple SEs are assigned to a division';
            newErrors.EnquiryForAccountableIds = missingAccountableIds;
            if (!newErrors.EnquiryFor) {
                newErrors.EnquiryFor = newErrors.EnquiryForAccountable;
            }
        }

        if (findDuplicateCustomerIndex(customerList, masters.customers || []) !== -1) {
            newErrors.CustomerName = 'Duplicate customer / contractor name in the list — keep one row per company';
        }

        // Date Validation Check
        if (formData.EnquiryDate && formData.DueOn && new Date(formData.DueOn) < new Date(formData.EnquiryDate)) {
            newErrors.DueOn = 'Due Date cannot be before Enquiry Date';
        }

        if (
            !isModifyMode &&
            formData.AutoAck &&
            formData.EnquiryStatus === 'Active' &&
            !ackSEList[0]
        ) {
            newErrors.AcknowledgementSE =
                'Select an SE as the customer point of contact for the acknowledgement mail.';
        }

        if (!isModifyMode && formData.AutoAck && formData.EnquiryStatus === 'Active') {
            const ackTargets = buildCustomerAckTargets(
                customerList,
                receivedFromList,
                masters.contacts || []
            );
            if (ackTargets.length === 0) {
                newErrors.ReceivedFrom =
                    'Each customer needs a Received From contact with a valid email in master data for acknowledgement drafts.';
            }
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            // Scroll to error message section after a brief delay to ensure it's rendered
            setTimeout(() => {
                if (errorSectionRef.current) {
                    errorSectionRef.current.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            }, 100);
            return;
        }

        if (isModifyMode && formData.Status === 'Reports') {
            const confirmed = window.confirm(
                'This enquiry has already been closed (Status: Reports).\n\n' +
                'Are you sure you want to modify it?'
            );
            if (!confirmed) return;
        }

        const pnTrim = (formData.ProjectName || '').trim();
        if (pnTrim) {
            try {
                const qs = new URLSearchParams({ projectName: pnTrim });
                if (isModifyMode && formData.RequestNo) {
                    qs.set('excludeRequestNo', String(formData.RequestNo).trim());
                }
                const chkRes = await fetch(`/api/enquiries/check-project-name?${qs.toString()}`);
                if (chkRes.ok) {
                    const chk = await chkRes.json();
                    if (chk.exists) {
                        setErrors({ ProjectName: 'already Project name is exist' });
                        setTimeout(() => {
                            if (errorSectionRef.current) {
                                errorSectionRef.current.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center',
                                });
                            }
                        }, 100);
                        return;
                    }
                }
            } catch (e) {
                console.error('Project name duplicate check failed:', e);
            }
        }

        if (submitInFlightRef.current) return;
        submitInFlightRef.current = true;
        setIsSubmitting(true);
        setErrors({});

        // Payload should reflect explicit chips only.
        const derivedConcerned = [...new Set(
            (enqForList || []).flatMap((item) => {
                if (!item || typeof item !== 'object') return [];
                return Array.isArray(item.assignedSEs) ? item.assignedSEs : [];
            })
        )].filter(Boolean);
        const selectedConcernedSEs = derivedConcerned;
        const concernedSEAssignments = buildConcernedSEAssignmentsFromEnquiryFor(enqForList);

        const payload = {
            ...formData,
            SelectedEnquiryTypes: enqTypeList,
            SelectedEnquiryFor: enqForList,
            SelectedCustomers: customerList,
            SelectedReceivedFroms: receivedFromList,
            SelectedConcernedSEs: selectedConcernedSEs,
            ConcernedSEAssignments: concernedSEAssignments,
            SelectedConsultants: consultantList,
            AcknowledgementSE: ackSEList[0] || '',
            CreatedBy: isModifyMode ? formData.CreatedBy : (currentUser?.name || 'System'),
            ModifiedBy: currentUser?.name || 'System',
            // Only trigger email if EnquiryStatus is Active
            AutoAck: formData.EnquiryStatus === 'Active' ? formData.AutoAck : false,
        };
        if (!isModifyMode) {
            delete payload.RequestNo;
        }

        try {
            if (isModifyMode) {
                const upd = await updateEnquiry(formData.RequestNo, payload);
                if (!upd || !upd.success) {
                    const msg = (upd && upd.error) || 'Update failed';
                    if (String(msg).includes('already Project name is exist')) {
                        setErrors({ ProjectName: 'already Project name is exist' });
                    } else {
                        alert(msg);
                    }
                    return;
                }

                let attachmentNote = '';
                if (pendingFiles.length > 0) {
                    const attOk = await uploadPendingFiles(formData.RequestNo);
                    if (!attOk) attachmentNote = ' — some attachments could not be saved.';
                }

                const updatedRequestNo = formData.RequestNo;
                resetForm();
                setActiveTab('New');
                alert(`Enquiry Updated: ${updatedRequestNo}${attachmentNote}`);
            } else {
                const result = await addEnquiry(payload);

                if (!result.success && result.error && result.error.includes('already Project name is exist')) {
                    setErrors({ ProjectName: 'already Project name is exist' });
                    return;
                }

                if (result.success) {
                    const savedRequestNo = String(result.requestNo || '').trim();
                    let attachmentNote = '';
                    if (pendingFiles.length > 0) {
                        const attOk = await uploadPendingFiles(savedRequestNo);
                        if (!attOk) attachmentNote = ' — some attachments could not be saved.';
                    }

                    const concernedSEsForMail = [...selectedConcernedSEs];
                    const ackSeName = ackSEList[0];
                    const customerAckTargets = buildCustomerAckTargets(
                        customerList,
                        receivedFromList,
                        masters.contacts || []
                    );
                    const shouldSendCustomerAck =
                        formData.AutoAck &&
                        formData.EnquiryStatus === 'Active' &&
                        ackSeName &&
                        customerAckTargets.length > 0;
                    const createdByName = currentUser?.name || currentUser?.FullName || 'System';
                    const createdByEmail = currentUser?.EmailId || currentUser?.email || '';

                    resetForm();
                    alert(`Enquiry Added: ${savedRequestNo}${attachmentNote}`);

                    if (savedRequestNo) {
                        // Run email triggers in the background so they don't block the UI and enquiry number generation
                        (async () => {
                            try {
                                const internalResult = await sendEnquiryInternalNotification({
                                    apiBase: EMS_API_BASE,
                                    requestNo: savedRequestNo,
                                    concernedSEs: concernedSEsForMail,
                                    userEmail: currentUser?.EmailId || currentUser?.email || '',
                                    userDisplayName: currentUser?.FullName || currentUser?.name || 'System',
                                });
                                if (!internalResult.ok) {
                                    alert(
                                        `Enquiry saved, but the internal notification email could not be sent.\n\n${internalResult.error || 'Unknown error'}\n\n` +
                                            'For your own From address: run node scripts/quote-outlook-local-helper.js (classic Outlook open) on this PC. ' +
                                            'On IIS only (no helper): set EMS_ENQUIRY_NOTIFY_VIA_SMTP=1 in server .env — mail sends from the shared SMTP account.'
                                    );
                                }

                                if (shouldSendCustomerAck) {
                                    const ackResult = await openCustomerAcknowledgementDraft({
                                        apiBase: EMS_API_BASE,
                                        requestNo: savedRequestNo,
                                        acknowledgementSE: ackSeName,
                                        createdBy: createdByName,
                                        createdByEmail,
                                        concernedSEs: concernedSEsForMail,
                                        customerAckTargets,
                                    });
                                    if (!ackResult.ok) {
                                        alert(
                                            `Enquiry saved, but the customer acknowledgement draft(s) could not be opened.\n\n${ackResult.error || 'Unknown error'}\n\n` +
                                                'Customer mail must use your desktop Outlook (From = your email; Reply-To = concerned engineer). ' +
                                                'Start: node scripts/quote-outlook-local-helper.js'
                                        );
                                    } else if (ackResult.draftCount > 1) {
                                        alert(
                                            `Opened ${ackResult.draftCount} customer acknowledgement draft(s) in Outlook (one per customer).`
                                        );
                                    }
                                }
                            } catch (emailErr) {
                                console.error('Background email trigger failed:', emailErr);
                            }
                        })();
                    }
                }
            }
        } catch (err) {
            console.error('Submit failed:', err);
            alert('An unexpected error occurred during submission.');
        } finally {
            submitInFlightRef.current = false;
            setIsSubmitting(false);
        }
    };

    const sendNotification = async (requestNo) => {
        try {
            const res = await fetch('/api/enquiries/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestNo,
                    userEmail: currentUser?.EmailId || currentUser?.email || '',
                    userDisplayName: currentUser?.FullName || currentUser?.name || 'System'
                })
            });
            if (!res.ok) {
                // notification failed
            } else {
                // success
            }
        } catch (err) {
            // error
        }
    };

    const uploadPendingFiles = async (requestNo) => {
        const userName = currentUser?.name || currentUser?.FullName || 'System';
        const userDivision = currentUser?.DivisionName || currentUser?.Department || '';
        const failures = [];

        const groups = pendingFiles.reduce((acc, item) => {
            const visibility = item.visibility || 'Public';
            const type = item.type || 'File';
            const key = `${visibility}\0${type}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});

        for (const key in groups) {
            const items = groups[key];
            const [visibility, type] = key.split('\0');

            if (type === 'File') {
                const uploadData = new FormData();
                items.forEach(meta => {
                    const file = fileObjectsRef.current[meta.id];
                    if (file) uploadData.append('files', file, meta.fileName);
                });
                if (!uploadData.has('files')) continue;

                try {
                    const res = await fetch(`/api/attachments/upload?requestNo=${encodeURIComponent(requestNo)}&userName=${encodeURIComponent(userName)}&visibility=${visibility}&type=File&division=${encodeURIComponent(userDivision)}`, {
                        method: 'POST',
                        body: uploadData
                    });
                    if (!res.ok) {
                        failures.push(`${visibility} files: ${await readAttachmentUploadError(res)}`);
                    }
                } catch (err) {
                    failures.push(`${visibility} files: ${err.message || 'Upload failed'}`);
                }
            } else if (type === 'Folder') {
                for (const item of items) {
                    const uploadData = new FormData();
                    const groupFiles = fileObjectsRef.current[item.id];
                    if (groupFiles && Array.isArray(groupFiles)) {
                        groupFiles.forEach(file => {
                            uploadData.append('files', file, file.webkitRelativePath || file.name);
                        });
                    }
                    if (!uploadData.has('files')) continue;

                    try {
                        const res = await fetch(`/api/attachments/upload?requestNo=${encodeURIComponent(requestNo)}&userName=${encodeURIComponent(userName)}&visibility=${visibility}&type=File&division=${encodeURIComponent(userDivision)}`, {
                            method: 'POST',
                            body: uploadData
                        });
                        if (!res.ok) {
                            failures.push(`${visibility} folder: ${await readAttachmentUploadError(res)}`);
                        }
                    } catch (err) {
                        failures.push(`${visibility} folder: ${err.message || 'Upload failed'}`);
                    }
                }
            } else if (type === 'Link') {
                for (const item of items) {
                    try {
                        const url = item.LinkURL || item.linkUrl;
                        const fName = item.FileName || item.fileName;
                        const res = await fetch(`/api/attachments/upload?requestNo=${encodeURIComponent(requestNo)}&userName=${encodeURIComponent(userName)}&visibility=${visibility}&type=Link&linkUrl=${encodeURIComponent(url)}&fileName=${encodeURIComponent(fName)}&division=${encodeURIComponent(userDivision)}`, {
                            method: 'POST'
                        });
                        if (!res.ok) {
                            failures.push(`${visibility} link: ${await readAttachmentUploadError(res)}`);
                        }
                    } catch (err) {
                        failures.push(`${visibility} link: ${err.message || 'Upload failed'}`);
                    }
                }
            }
        }

        setPendingFiles([]);
        fileObjectsRef.current = {};
        await fetchAttachments();

        if (failures.length > 0) {
            alert(`Some attachments could not be saved:\n\n${failures.join('\n')}`);
            return false;
        }
        return true;
    };

    const resetForm = () => {
        pendingFiles.forEach((item) => {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        fileObjectsRef.current = {};

        const cleared = createEmptyFormState();
        if (currentUser?.name) {
            cleared.CreatedBy = currentUser.name;
        }
        setFormData(cleared);
        setErrors({});
        setEnqTypeList([]);
        setEnqForList([]);
        setCustomerList([]);
        setReceivedFromList([]);
        setSeList([]);
        setConsultantList([]);
        setAckSEList([]);
        setHyperlink({ name: '', url: '' });
        setPricedEnquiryForIds(new Set());
        setIsModifyMode(false);
        setModifyRequestNo('');
        setWorkflowComputed(null);
        setAttachments([]);
        setPendingFiles([]);
        setProjectSuggestions([]);
        setShowProjectSuggestions(false);
        setOriginalEnqForList([]);
        setOriginalSeList([]);
        setOriginalCustomerList([]);
        setOriginalReceivedFromList([]);
        setOriginalConsultantList([]);
        enquiryForHydratedRef.current = null;

        // Clear Persistence
        localStorage.removeItem('enquiry_new_formData');
        localStorage.removeItem('enquiry_new_enqTypeList');
        localStorage.removeItem('enquiry_new_enqForList');
        localStorage.removeItem('enquiry_new_customerList');
        localStorage.removeItem('enquiry_new_receivedFromList');
        localStorage.removeItem('enquiry_new_seList');
        localStorage.removeItem('enquiry_new_consultantList');
    };

    // --- Modify Logic ---
    const loadEnquiry = async (requestNo) => {
        let enq = null;
        try {
            // Attempt to fetch fresh data from server
            const res = await fetch(`/api/enquiries/${encodeURIComponent(requestNo)}`);
            if (res.ok) {
                enq = await res.json();
            } else {
                // console.warn(`API fetch fail for ${requestNo}, falling back to context.`);
                enq = getEnquiry(requestNo);
            }
        } catch (err) {
            // console.error('Error fetching fresh enquiry:', err);
            enq = getEnquiry(requestNo);
        }

        if (enq) {
            enquiryForHydratedRef.current = null;
            // Helper to format date for input (YYYY-MM-DD)
            const formatDate = (d) => {
                if (!d) return '';
                try {
                    const date = new Date(d);
                    const offset = date.getTimezoneOffset() * 60000;
                    return new Date(date.getTime() - offset).toISOString().split('T')[0];
                } catch (e) { return ''; }
            };

            // Map DB fields to Form State
            const mappedData = {
                ...enq,
                SourceOfInfo: enq.SourceOfEnquiry || enq.SourceOfInfo,
                DetailsOfEnquiry: enq.EnquiryDetails || enq.DetailsOfEnquiry,
                Remark: enq.Remarks || enq.Remark,
                DocumentsReceived: enq.OthersSpecify || enq.DocumentsReceived,
                ClientName: enq.ClientName || '',
                ConsultantName: enq.ConsultantName || '',
                EnquiryDate: formatDate(enq.EnquiryDate),
                DueOn: formatDate(enq.DueDate || enq.DueOn),
                SiteVisitDate: formatDate(enq.SiteVisitDate),
                hardcopy: enq.Doc_HardCopies !== undefined ? !!enq.Doc_HardCopies : !!enq.hardcopy,
                drawing: enq.Doc_Drawing !== undefined ? !!enq.Doc_Drawing : !!enq.drawing,
                dvd: enq.Doc_CD_DVD !== undefined ? !!enq.Doc_CD_DVD : !!enq.dvd,
                spec: enq.Doc_Spec !== undefined ? !!enq.Doc_Spec : !!enq.spec,
                eqpschedule: enq.Doc_EquipmentSchedule !== undefined ? !!enq.Doc_EquipmentSchedule : !!enq.eqpschedule,
                ceosign: enq.ED_CEOSignatureRequired !== undefined ? !!enq.ED_CEOSignatureRequired : !!enq.ceosign,
                AutoAck: enq.SendAcknowledgementMail !== undefined ? !!enq.SendAcknowledgementMail : !!enq.AutoAck,
                // FIX: inputs should be empty on load, lists are populated separately
                CustomerName: '',
                ReceivedFrom: ''
            };

            setFormData(mappedData);
            setEnqTypeList(enq.SelectedEnquiryTypes || (enq.EnquiryType ? enq.EnquiryType.split(',').filter(Boolean) : []));

            const loadedEnqForList = enq.SelectedEnquiryFor || (enq.EnquiryFor ? enq.EnquiryFor.split(',').filter(Boolean) : []);
            const concernedRows =
                (Array.isArray(enq.ConcernedSEAssignments) && enq.ConcernedSEAssignments.length > 0
                    ? enq.ConcernedSEAssignments
                    : (enq.SelectedConcernedSEs || (enq.ConcernedSE ? enq.ConcernedSE.split(',').filter(Boolean) : [])).map(
                          (seName) => ({ seName, leadJobCode: null, accountability: null })
                      ));
            const hydratedEnqForList = hydrateEnquiryForWithConcernedSEAssignments(
                loadedEnqForList,
                concernedRows,
                masters.users || []
            );
            setEnqForList(hydratedEnqForList);
            setOriginalEnqForList([...hydratedEnqForList]); // Store original for comparison

            const loadedCustomers = enq.SelectedCustomers || (enq.CustomerName ? enq.CustomerName.split(',').filter(Boolean) : []);
            const loadedReceivedFrom = enq.SelectedReceivedFroms || (enq.ReceivedFrom ? enq.ReceivedFrom.split(',').filter(Boolean) : []);
            const pairedCount = Math.min(loadedCustomers.length, loadedReceivedFrom.length);
            const customersSynced = loadedCustomers.slice(0, pairedCount);
            const receivedSynced = loadedReceivedFrom.slice(0, pairedCount);
            setCustomerList(customersSynced);
            setOriginalCustomerList([...customersSynced]);

            setReceivedFromList(receivedSynced);
            setOriginalReceivedFromList([...receivedSynced]);

            const seList = enq.SelectedConcernedSEs || (enq.ConcernedSE ? enq.ConcernedSE.split(',').filter(Boolean) : []);
            setSeList(seList);
            setOriginalSeList([...seList]); // Store original for comparison

            const consultants = enq.SelectedConsultants || (enq.ConsultantName ? enq.ConsultantName.split(',').filter(Boolean) : []);
            setConsultantList(consultants);
            setOriginalConsultantList([...consultants]);

            setAckSEList(seList);
            setIsModifyMode(true);

            if (enq.RequestNo) {
                await loadAttachmentsForEnquiry(enq.RequestNo);
            }

            // Fetch which EnquiryFor IDs have pricing rows (used to block structure delete)
            try {
                const pricedRes = await fetch(
                    `/api/enquiries/${encodeURIComponent(requestNo)}/enquiryfor/priced-ids`
                );
                if (pricedRes.ok) {
                    const priced = await pricedRes.json();
                    const ids = Array.isArray(priced?.pricedIds) ? priced.pricedIds : [];
                    setPricedEnquiryForIds(new Set(ids.map((x) => String(x))));
                } else {
                    setPricedEnquiryForIds(new Set());
                }
            } catch {
                setPricedEnquiryForIds(new Set());
            }

            setWorkflowComputed(null);
            try {
                const q = new URLSearchParams({
                    userEmail: currentUser?.EmailId || currentUser?.email || '',
                    userName: currentUser?.FullName || currentUser?.name || '',
                    userRole: currentUser?.Roles || currentUser?.role || '',
                });
                const msRes = await fetch(
                    `/api/enquiries/${encodeURIComponent(requestNo)}/milestone-status?${q}`
                );
                if (msRes.ok) {
                    setWorkflowComputed(await msRes.json());
                }
            } catch (e) {
                console.warn('[loadEnquiry] milestone-status', e);
            }
        } else {
            console.warn('Enquiry not found:', requestNo);
        }
    };

    const canRemoveEnquiryForItem = useCallback((item) => {
        const id = item?.id != null ? String(item.id) : '';
        if (!id) return true;
        if (pricedEnquiryForIds.has(id)) return false;

        // Also block if any descendant is priced
        const list = Array.isArray(enqForList) ? enqForList : [];
        const byParent = new Map();
        list.forEach((x) => {
            const pid = x?.parentId != null ? String(x.parentId) : '';
            if (!pid) return;
            const arr = byParent.get(pid) || [];
            arr.push(x);
            byParent.set(pid, arr);
        });
        const q = [id];
        const seen = new Set();
        while (q.length) {
            const cur = q.shift();
            if (!cur || seen.has(cur)) continue;
            seen.add(cur);
            const kids = byParent.get(cur) || [];
            for (const k of kids) {
                const kidId = k?.id != null ? String(k.id) : '';
                if (kidId && pricedEnquiryForIds.has(kidId)) return false;
                if (kidId) q.push(kidId);
            }
        }
        return true;
    }, [enqForList, pricedEnquiryForIds]);

    const onRemoveBlockedEnquiryForItem = useCallback((item) => {
        const n = String(item?.itemName || '').trim() || 'This job';
        alert(`${n} is already priced (or has priced sub-jobs). Delete its prices first in Pricing module, then delete the job.`);
    }, []);

    const handleLoadEnquiry = async () => {
        await loadEnquiry(modifyRequestNo);
    };

    // On recall/modify: map saved SelectedConcernedSEs onto each Enquiry For item (once per load).
    // Must not re-run on every enqForList change — otherwise removing the last SE re-triggers inference and restores it.
    useEffect(() => {
        if (!isModifyMode) return;
        if (!formData.RequestNo) return;
        if (enquiryForHydratedRef.current === formData.RequestNo) return;
        if (!Array.isArray(enqForList) || enqForList.length === 0) return;
        if (!Array.isArray(seList) || seList.length === 0) return;
        if (!Array.isArray(masters.users) || masters.users.length === 0) return;

        let changed = false;
        const next = enqForList.map((rawItem, idx) => {
            const item =
                typeof rawItem === 'string'
                    ? {
                        itemName: rawItem,
                        id: `legacy-${idx}-${String(rawItem).slice(0, 40)}`,
                        parentId: null,
                        assignedSEs: []
                    }
                    : rawItem;

            const currentAssigned = Array.isArray(item?.assignedSEs) ? item.assignedSEs.filter(Boolean) : [];
            if (currentAssigned.length > 0) return typeof rawItem === 'string' ? item : rawItem;

            const inferred = inferAssignedSEsForEnquiryForItem(item, seList, masters.users || []);
            if (inferred.length === 0) return typeof rawItem === 'string' ? item : rawItem;

            changed = true;
            return { ...item, assignedSEs: inferred };
        });

        if (changed) setEnqForList(next);
        enquiryForHydratedRef.current = formData.RequestNo;
    }, [isModifyMode, formData.RequestNo, enqForList, seList, masters.users]);

    const handleOpenFromSearch = async (reqNo) => {
        setModifyRequestNo(reqNo);
        await loadEnquiry(reqNo);
        setActiveTab('Modify');
    };

    const renderCustomerCard = () => {
        if (!formData.CustomerName) return null;
        const cust = masters.customers.find(c => c.CompanyName === formData.CustomerName);
        if (!cust) return null;
        return (
            <div style={{ fontSize: '12px' }}>
                <strong>{cust.CompanyName}</strong><br />
                {cust.Address1 && <div>{cust.Address1}</div>}
                {cust.EmailId && <div><i className="bi bi-envelope me-1"></i>{cust.EmailId}</div>}
                {cust.Phone1 && <div><i className="bi bi-telephone me-1"></i>{cust.Phone1}</div>}
            </div>
        );
    };

    const renderContactCard = () => {
        if (!formData.ReceivedFrom) return null;
        const [name, company] = formData.ReceivedFrom.split('|');
        const contact = masters.contacts.find(c => c.ContactName === name && c.CompanyName === company);
        if (!contact) return null;
        return (
            <div style={{ fontSize: '12px' }}>
                <strong>{contact.ContactName}</strong> <span className="text-muted">({contact.Designation})</span><br />
                {contact.EmailId && <div><i className="bi bi-envelope me-1"></i>{contact.EmailId}</div>}
                {contact.Mobile1 && <div><i className="bi bi-phone me-1"></i>{contact.Mobile1}</div>}
            </div>
        );
    };

    const handleAddLink = (visibility = 'Public') => {
        if (!hyperlink.url) return;

        // Split by newlines or commas, then filter out empty lines
        const links = hyperlink.url.split(/[\n,]+/).map(l => l.trim()).filter(l => l.length > 0);

        if (links.length === 0) return;

        const now = Date.now();
        const addedDate = new Date().toISOString();
        const newLinks = links.map((link, index) => ({
            id: now + index,
            FileName: link, // Match SQL naming
            isPending: true,
            visibility,
            type: 'Link',
            LinkURL: link, // Match SQL naming
            addedDate
        }));

        setPendingFiles(prev => [...prev, ...newLinks]);
        setHyperlink({ ...hyperlink, url: '' }); // Clear only URL
    };

    const attachmentUserQuery = () => {
        const params = new URLSearchParams({
            userEmail: currentUser?.EmailId || currentUser?.email || '',
            userRole: currentUser?.Roles || currentUser?.role || ''
        });
        return params.toString();
    };

    const renderAttachmentList = (visibility, type) => {
        const userDivision = (currentUser?.DivisionName || '').trim().toLowerCase();
        const isAdmin = (currentUser?.role || currentUser?.Roles || '').toLowerCase().includes('admin');

        // Combined filter for both individual files and folders when type is 'File'
        const filteredPending = pendingFiles.filter(f => {
            if ((f.visibility || 'Public') !== visibility) return false;
            const fType = f.type || 'File';
            if (type === 'File') return fType === 'File' || fType === 'Folder';
            return fType === type;
        });

        const filteredUploaded = attachments.filter(a => {
            if ((a.Visibility || 'Public') === 'Private') {
                if (visibility !== 'Private') return false;

                // Strict check: Show only to Admin, same Division, or original Uploader
                if (!isAdmin) {
                    const fileDivision = (a.Division || '').trim().toLowerCase();
                    const isOwnFile = (a.UploadedBy || '').toLowerCase() === (currentUser?.FullName || currentUser?.name || currentUser?.UserName || '').toLowerCase();

                    if (fileDivision && userDivision) {
                        if (fileDivision !== userDivision && !isOwnFile) return false;
                    } else if (!isOwnFile) {
                        // If either division is missing, fallback to creator only
                        return false;
                    }
                }
            } else {
                if (visibility !== 'Public') return false;
            }

            const aType = a.AttachmentType || 'File';
            if (type === 'File') return aType === 'File';
            return aType === type;
        });

        // Grouping logic for UI display
        const groups = {}; // { folderName: { id, fileName, isGroup: true, items: [] } }
        const topLevel = [];

        // Group uploaded files by path (ONLY for File type, not for Links which naturally contain slashes)
        filteredUploaded.forEach(att => {
            if (type === 'File' && att.FileName && att.FileName.includes('/')) {
                const root = att.FileName.split('/')[0];
                if (!groups[root]) {
                    groups[root] = { id: `ugroup-${root}`, fileName: root, isGroup: true, items: [], visibility: att.Visibility };
                }
                groups[root].items.push(att);
            } else {
                topLevel.push(att);
            }
        });

        // Add pending items
        filteredPending.forEach(p => {
            const pName = p.FileName || p.fileName;
            if (p.type === 'Folder') {
                topLevel.push({ ...p, isGroup: true });
            } else if (type === 'File' && pName && pName.includes('/')) {
                const root = pName.split('/')[0];
                if (!groups[root]) {
                    groups[root] = { id: `pgroup-${root}`, fileName: root, isGroup: true, items: [], isPending: true };
                }
                groups[root].items.push(p);
            } else {
                topLevel.push(p);
            }
        });

        // Merge groups into topLevel
        Object.values(groups).forEach(g => topLevel.push(g));

        if (topLevel.length === 0) return null;

        return (
            <ul className="list-group border-0">
                {topLevel.map((item, idx) => {
                    const dateVal = item.addedDate || item.UploadedAt || item.CreatedDate || item.UploadDate || '';
                    const displayDate = dateVal ? new Date(dateVal).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';
                    const uploadedBy = item.UploadedBy || '';

                    return (
                        <li key={item.id || idx} className={`list-group-item d-flex align-items-center justify-content-between mb-1 border rounded ${type === 'Link' ? 'p-1' : 'p-2'}`}>
                            <div className="d-flex align-items-center text-truncate me-2" style={{ flex: '1' }} title={item.fileName || item.FileName}>
                                <i className={item.isGroup ? "bi bi-folder-fill text-warning fs-5 me-2" : (type === 'Link' ? "bi bi-link-45deg text-success fs-6 me-2" : "bi bi-file-earmark-text text-secondary fs-5 me-2")}></i>
                                <div className="d-flex flex-column text-truncate">
                                    <span className="fw-medium text-dark text-truncate" style={{ fontSize: type === 'Link' ? '12px' : '13px' }}>{item.fileName || item.FileName}</span>
                                    {(displayDate || uploadedBy) && (
                                        <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: '9px' }}>
                                            {displayDate && <span><i className="bi bi-clock me-1"></i>{displayDate}</span>}
                                            {uploadedBy && <span><i className="bi bi-person me-1"></i>{uploadedBy}</span>}
                                        </div>
                                    )}
                                </div>
                                {item.isPending && <span className="badge bg-warning text-dark ms-2 rounded-pill" style={{ fontSize: '9px' }}>Pending</span>}
                                {item.items?.length > 0 && <span className="text-muted ms-2" style={{ fontSize: '10px' }}>({item.items.length} files)</span>}
                            </div>

                            <div className="d-flex align-items-center gap-1">
                                {item.isPending ? (
                                    !isLimitedEdit && (
                                    <button type="button" className="btn btn-sm btn-outline-danger p-0" style={{ width: type === 'Link' ? '24px' : '28px', height: type === 'Link' ? '24px' : '28px', fontSize: '10px' }} onClick={() => handleRemoveAttachment(item.id, true)} title="Remove"><i className="bi bi-trash"></i></button>
                                    )
                                ) : (
                                    !item.isGroup && (
                                        type === 'File' ? (
                                            <>
                                                <a href={`/api/attachments/${item.ID}?${attachmentUserQuery()}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-info p-0 d-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px' }} title="View"><i className="bi bi-eye"></i></a>
                                                <a href={`/api/attachments/${item.ID}?download=true&${attachmentUserQuery()}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary p-0 d-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px' }} title="Download"><i className="bi bi-download"></i></a>
                                            </>
                                        ) : (
                                            <a
                                                href={(() => {
                                                    const url = item.LinkURL || item.linkUrl || '';
                                                    return url.startsWith('http') ? url : `https://${url}`;
                                                })()}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-sm btn-outline-info p-0 d-flex align-items-center justify-content-center"
                                                style={{ width: '24px', height: '24px', fontSize: '10px' }}
                                                title="Open Link"
                                            >
                                                <i className="bi bi-box-arrow-up-right"></i>
                                            </a>
                                        )
                                    )
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    };

    // --- File Upload ---
    // --- File Upload ---
    const handleFileUpload = (e, visibility = 'Public') => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // More robust check for folder vs file input
        const isFolder = e.target.hasAttribute('webkitdirectory');
        const id = Date.now();

        if (isFolder) {
            // Group files as a single "Folder" entry
            const firstPath = files[0].webkitRelativePath || '';
            const rootFolderName = firstPath.split('/')[0] || 'Selected Folder';

            fileObjectsRef.current[id] = Array.from(files);
            setPendingFiles(prev => [...prev, {
                id,
                fileName: rootFolderName,
                isPending: true,
                visibility,
                type: 'Folder',
                itemCount: files.length,
                addedDate: new Date().toISOString()
            }]);
        } else {
            // Individual file uploads
            const newMeta = [];
            const now = Date.now();
            const addedDate = new Date().toISOString();
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fid = now + i;
                fileObjectsRef.current[fid] = file;
                newMeta.push({ id: fid, fileName: file.name, isPending: true, visibility, type: 'File', addedDate });
            }
            setPendingFiles(prev => [...prev, ...newMeta]);
        }
        e.target.value = null; // Reset to allow repeated selection of same folder/file
    };

    const handleRemoveAttachment = async (attachmentId, isPending = false) => {
        if (isLimitedEdit) return;

        if (isPending) {
            // No confirmation needed for pending files (not saved yet)
            setPendingFiles(prev => {
                const filtered = prev.filter(f => f.id !== attachmentId);
                delete fileObjectsRef.current[attachmentId];
                const fileToRemove = prev.find(f => f.id === attachmentId);
                if (fileToRemove && fileToRemove.previewUrl) {
                    URL.revokeObjectURL(fileToRemove.previewUrl);
                }
                return filtered;
            });
            return;
        }

        // Confirmation only for uploaded files
        if (!window.confirm('Are you sure you want to delete this file?')) {
            return;
        }

        try {
            const res = await fetch(`/api/attachments/${attachmentId}?${attachmentUserQuery()}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                setAttachments(prev => prev.filter(a => a.ID !== attachmentId));
            } else {
                console.error('Failed to delete file');
            }
        } catch (err) {
            console.error('Error deleting file:', err);
        }
    };

    const loadAttachmentsForEnquiry = async (requestNo) => {
        setAttachments([]);
        try {
            const res = await fetch(`/api/attachments?requestNo=${encodeURIComponent(requestNo)}&${attachmentUserQuery()}`);
            if (res.ok) {
                const data = await res.json();
                setAttachments(data);
            } else if (res.status === 403) {
                const err = await res.json().catch(() => ({}));
                console.warn('Attachment access denied:', err.error || res.statusText);
            }
        } catch (err) {
            console.error('Failed to load attachments:', err);
        }
    };

    const fetchAttachments = async () => {
        if (formData.RequestNo) {
            await loadAttachmentsForEnquiry(formData.RequestNo);
        }
    };

    useEffect(() => {
        fetchAttachments();
    }, [formData.RequestNo]);


    return (
        <div
            style={{
                position: 'relative',
                minHeight: activeTab === 'Search' ? 'calc(100vh - 72px)' : '100vh',
                maxHeight: activeTab === 'Search' ? 'calc(100vh - 72px)' : 'none',
                overflowY: activeTab === 'Search' ? 'hidden' : 'visible',
                overflowX: activeTab === 'Search' ? 'hidden' : 'visible'
            }}
        >
            <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="row justify-content-center">
                    <div className="col-12" style={{ flex: '0 0 66%', maxWidth: '66%' }}>
                        <div
                            className="d-flex justify-content-start"
                            style={{ marginTop: '10px', marginBottom: '0.2rem' }}
                        >
                            <div
                                ref={submenuStripRef}
                                style={{
                                    position: 'relative',
                                    width: 'fit-content',
                                    /* Slides the whole strip so its centre sits below the Enquiry main
                                       nav tab (computed in useLayoutEffect). Fallback 140px keeps the
                                       pre-measurement paint close to the final position. */
                                    marginLeft: submenuStripMarginLeftPx != null ? `${submenuStripMarginLeftPx}px` : '140px',
                                    transition: 'margin-left 180ms ease'
                                }}
                            >
                                <div
                                    aria-hidden="true"
                                    style={{
                                        position: 'absolute',
                                        top: '-8px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        width: 0,
                                        height: 0,
                                        borderLeft: '8px solid transparent',
                                        borderRight: '8px solid transparent',
                                        borderBottom: '8px solid #2f5fae'
                                    }}
                                />
                                <div
                                    className="d-flex"
                                    style={{
                                        /* Match main menu strip: rounded top edge + gradient */
                                        background: 'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)',
                                        borderTopLeftRadius: '18px',
                                        borderTopRightRadius: '18px',
                                        borderBottomLeftRadius: '14px',
                                        borderBottomRightRadius: '14px',
                                        overflow: 'hidden',
                                        padding: '4px',
                                        boxShadow: '0 2px 8px rgba(23, 47, 99, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                                        width: 'fit-content'
                                    }}
                                >
                            <button
                                className="btn d-flex align-items-center"
                                style={{
                                    color: activeTab === 'New' ? '#203f75' : '#f5f5f5',
                                    borderBottom: '0',
                                    fontWeight: '400',
                                    fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
                                    letterSpacing: '-0.01em',
                                    lineHeight: 1,
                                    backgroundColor: activeTab === 'New' ? '#f5f5f5' : 'transparent',
                                    padding: '0.34rem 0.56rem',
                                    marginBottom: '0',
                                    fontSize: '11px',
                                    opacity: activeTab === 'New' ? 1 : 0.96,
                                    borderRadius: activeTab === 'New' ? '9999px' : '14px',
                                    boxShadow: activeTab === 'New'
                                        ? 'inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 2px 5px rgba(10, 24, 54, 0.32)'
                                        : 'none',
                                    textShadow: 'none'
                                }}
                                onClick={() => { setActiveTab('New'); setIsModifyMode(false); }}
                            >
                                <i className="bi bi-plus-lg me-2" style={{ fontSize: '12px' }}></i>
                                New Enquiry
                            </button>
                            <button
                                className="btn d-flex align-items-center"
                                style={{
                                    color: activeTab === 'Modify' ? '#203f75' : '#f5f5f5',
                                    borderBottom: '0',
                                    fontWeight: '400',
                                    fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
                                    letterSpacing: '-0.01em',
                                    lineHeight: 1,
                                    backgroundColor: activeTab === 'Modify' ? '#f5f5f5' : 'transparent',
                                    padding: '0.34rem 0.56rem',
                                    marginBottom: '0',
                                    fontSize: '11px',
                                    opacity: activeTab === 'Modify' ? 1 : 0.96,
                                    borderRadius: activeTab === 'Modify' ? '9999px' : '14px',
                                    boxShadow: activeTab === 'Modify'
                                        ? 'inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 2px 5px rgba(10, 24, 54, 0.32)'
                                        : 'none',
                                    textShadow: 'none'
                                }}
                                onClick={() => { setActiveTab('Modify'); }}
                            >
                                <i className="bi bi-pencil-square me-2" style={{ fontSize: '12px' }}></i>
                                {activeTab === 'Modify' && !canEdit ? 'View Enquiry' : 'Modify Enquiry'}
                            </button>
                            <button
                                className="btn d-flex align-items-center"
                                style={{
                                    color: activeTab === 'Search' ? '#203f75' : '#f5f5f5',
                                    borderBottom: '0',
                                    fontWeight: '400',
                                    fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
                                    letterSpacing: '-0.01em',
                                    lineHeight: 1,
                                    backgroundColor: activeTab === 'Search' ? '#f5f5f5' : 'transparent',
                                    padding: '0.34rem 0.56rem',
                                    marginBottom: '0',
                                    fontSize: '11px',
                                    opacity: activeTab === 'Search' ? 1 : 0.96,
                                    borderRadius: activeTab === 'Search' ? '9999px' : '14px',
                                    boxShadow: activeTab === 'Search'
                                        ? 'inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 2px 5px rgba(10, 24, 54, 0.32)'
                                        : 'none',
                                    textShadow: 'none'
                                }}
                                onClick={() => setActiveTab('Search')}
                            >
                                <i className="bi bi-search me-2" style={{ fontSize: '12px' }}></i>
                                Search Enquiry
                            </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {activeTab === 'Search' ? (
                    <SearchEnquiry onOpen={handleOpenFromSearch} />
                ) : (
                    <>
                        {activeTab === 'Modify' && (
                            <div className="row justify-content-center mb-3">
                                <div className="col-12" style={{ flex: '0 0 66%', maxWidth: '66%' }}>
                                    <div className="row">
                                        <div className="col-md-3">
                                            <label className="form-label">Enquiry No.<span className="text-danger">*</span></label>
                                            <input type="text" className="form-control" placeholder="e.g. EYS/2025/11/001"
                                                value={modifyRequestNo}
                                                onChange={(e) => setModifyRequestNo(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleLoadEnquiry()} />
                                        </div>
                                        {isModifyMode && (
                                            <div className="col-md-3">
                                                <label className="form-label">Status<span className="text-danger">*</span></label>
                                                <select
                                                    className="form-select"
                                                    value={formData.Status || 'Enquiry'}
                                                    onChange={(e) => handleInputChange('Status', e.target.value)}
                                                    style={{ fontSize: '13px' }}
                                                >
                                                    <option value="Enquiry">Enquiry</option>
                                                    <option value="Pricing">Pricing</option>
                                                    <option value="Quote">Quote</option>
                                                    <option value="Follow-up">Follow-up</option>
                                                    <option value="Won">Won</option>
                                                    <option value="Lost">Lost</option>
                                                </select>
                                                {(formData.Status === 'Won' || formData.Status === 'Lost') && (
                                                    <div className="alert alert-success mt-2 p-2" style={{ fontSize: '11px' }}>
                                                        <i className="bi bi-check-circle me-1"></i>
                                                        This enquiry is closed
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="col-md-3 d-flex align-items-end">
                                            <button className="btn btn-outline-primary me-2" onClick={handleLoadEnquiry}>Load</button>
                                            <button className="btn btn-outline-secondary" onClick={resetForm}>Clear</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(activeTab === 'New' || (activeTab === 'Modify' && isModifyMode)) && (
                            <div className="row justify-content-center">
                                <div className="col-12" style={{ flex: '0 0 66%', maxWidth: '66%' }}>
                                    <form onSubmit={handleSubmit} aria-busy={isSubmitting} className="enquiry-compact-form">
                                        <style>
                                            {`
                                            .enquiry-compact-form .card.mb-4 {
                                                margin-bottom: 0.75rem !important;
                                            }
                                            .enquiry-compact-form .card-body {
                                                padding: 0.85rem 0.95rem !important;
                                            }
                                            .enquiry-compact-form .card-title {
                                                margin-bottom: 0.7rem !important;
                                            }
                                            .enquiry-compact-form .row.mb-3,
                                            .enquiry-compact-form .mb-3 {
                                                margin-bottom: 0.55rem !important;
                                            }
                                            .enquiry-compact-form .form-label {
                                                margin-bottom: 0.2rem !important;
                                                font-size: 11.5px;
                                                line-height: 1.2;
                                            }
                                            .enquiry-compact-form .form-control,
                                            .enquiry-compact-form .form-select {
                                                min-height: 28px;
                                                height: 28px;
                                                padding-top: 0.12rem;
                                                padding-bottom: 0.12rem;
                                                font-size: 11.5px !important;
                                                line-height: 1.1;
                                            }
                                            .enquiry-compact-form .date-input-wrapper input,
                                            .enquiry-compact-form input[type="date"] {
                                                min-height: 28px !important;
                                                height: 28px !important;
                                                font-size: 11.5px !important;
                                            }
                                            .enquiry-compact-form textarea.form-control {
                                                min-height: 60px;
                                                height: auto;
                                            }
                                            .enquiry-compact-form .btn {
                                                min-height: 28px;
                                                padding-top: 0.18rem;
                                                padding-bottom: 0.18rem;
                                                font-size: 11.5px;
                                                line-height: 1.1;
                                            }
                                            .enquiry-compact-form .form-check {
                                                min-height: 1.25rem;
                                                margin-bottom: 0.05rem;
                                            }
                                            .enquiry-compact-form .form-check-label {
                                                font-size: 11.5px;
                                            }
                                            `}
                                        </style>
                                        {/* Enquiry Status Tracker */}
                                        <div
                                            className="card mb-2 shadow-sm border-0"
                                            style={{
                                                borderRadius: '12px',
                                                background: 'linear-gradient(180deg, #dce5f2 0%, #cfdced 55%, #c2d2e6 100%)',
                                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 8px rgba(71, 85, 105, 0.12)'
                                            }}
                                        >
                                            <div className="card-body p-2">
                                                <h6 className="card-title fw-bold mb-2" style={{ color: '#2d3748', fontSize: '14px' }}>Enquiry Status Tracker</h6>
                                                {isModifyMode && workflowComputed && (
                                                    <div className="mb-2 text-muted" style={{ fontSize: '11px', lineHeight: 1.35 }}>
                                                        <strong>Activity-based:</strong> {workflowComputed.displayLabel}
                                                        {workflowComputed.detail ? ` — ${workflowComputed.detail}` : ''}
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', marginTop: '5px', marginBottom: '5px' }}>
                                                    {['Enquiry', 'Pricing', 'Quote', 'Follow-up', 'Won'].map((step, index) => {
                                                        const stepNum = index + 1;

                                                        const status = (formData.Status || 'Enquiry').trim();
                                                        const statusLower = status.toLowerCase();

                                                        let currentStep = 1;
                                                        if (isModifyMode && workflowComputed && typeof workflowComputed.step === 'number') {
                                                            currentStep = workflowComputed.step;
                                                        } else {
                                                            if (statusLower === 'enquiry' || statusLower === 'open') currentStep = 1;
                                                            else if (statusLower === 'pricing') currentStep = 2;
                                                            else if (statusLower === 'quote') currentStep = 3;
                                                            else if (statusLower === 'follow-up' || statusLower === 'followup') currentStep = 4;
                                                            else if (statusLower === 'won' || statusLower === 'lost') currentStep = 5;
                                                        }

                                                        const isActive = stepNum === currentStep;
                                                        const isCompleted = stepNum < currentStep;
                                                        const isLast = index === 4;

                                                        let label = step;
                                                        const lostVisual =
                                                            status === 'Lost' ||
                                                            (workflowComputed && workflowComputed.stepKey === 'lost');
                                                        if (isLast) {
                                                            if (lostVisual) label = 'Lost';
                                                            else label = 'Won';
                                                        }

                                                        const sub = workflowComputed?.stepSubLabels;
                                                        const subLineBase = {
                                                            marginTop: '2px',
                                                            fontSize: '10px',
                                                            textAlign: 'center',
                                                            lineHeight: 1.25,
                                                            maxWidth: '76px',
                                                            wordBreak: 'break-word',
                                                        };
                                                        const subLineHighlight =
                                                            isActive || isCompleted
                                                                ? { color: '#374151', fontWeight: 700 }
                                                                : { color: '#374151', fontWeight: 600 };
                                                        const subLineStyle = { ...subLineBase, ...subLineHighlight };
                                                        const subLineWonStyle = {
                                                            ...subLineBase,
                                                            ...(isActive || isCompleted
                                                                ? { color: '#374151', fontWeight: 700 }
                                                                : { color: '#374151', fontWeight: 600 }),
                                                        };
                                                        const subLineLostStyle = {
                                                            ...subLineBase,
                                                            ...(isActive || isCompleted
                                                                ? { color: '#374151', fontWeight: 700 }
                                                                : { color: '#374151', fontWeight: 600 }),
                                                        };

                                                        return (
                                                            <React.Fragment key={step}>
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        alignItems: 'center',
                                                                        zIndex: 2,
                                                                        minWidth: '76px',
                                                                    }}
                                                                >
                                                                    <div style={{
                                                                        width: '20px',
                                                                        height: '20px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: isActive || isCompleted ? (lostVisual && isLast ? '#ef4444' : '#3b82f6') : '#e2e8f0', // Blue generally, Red if Lost and active/completed
                                                                        color: isActive || isCompleted ? '#ffffff' : '#718096',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontWeight: 'bold',
                                                                        fontSize: '10px',
                                                                        border: isActive ? `1px solid ${lostVisual && isLast ? '#fca5a5' : '#ebf8ff'}` : 'none',
                                                                        boxShadow: isActive ? `0 0 0 2px ${lostVisual && isLast ? '#fecaca' : '#bfdbfe'}` : 'none'
                                                                    }}>
                                                                        {isCompleted ? '✓' : stepNum}
                                                                    </div>
                                                                    <span style={{
                                                                        marginTop: '4px',
                                                                        fontSize: '10px',
                                                                        color: '#374151',
                                                                        fontWeight: isActive ? '600' : '400',
                                                                        textAlign: 'center',
                                                                    }}>
                                                                        {label}
                                                                    </span>
                                                                    {sub && (
                                                                        <>
                                                                            {stepNum === 1 && (
                                                                                <span style={subLineStyle}>{sub.enquiry}</span>
                                                                            )}
                                                                            {stepNum === 2 && (
                                                                                <span style={subLineStyle}>{sub.pricing}</span>
                                                                            )}
                                                                            {stepNum === 3 && (
                                                                                <span style={subLineStyle}>{sub.quote}</span>
                                                                            )}
                                                                            {stepNum === 4 && (
                                                                                <span style={subLineStyle}>{sub.followUp}</span>
                                                                            )}
                                                                            {stepNum === 5 && (
                                                                                <>
                                                                                    <span style={subLineWonStyle}>{sub.won}</span>
                                                                                    <span style={subLineLostStyle}>{sub.lost}</span>
                                                                                </>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                                {!isLast && (
                                                                    <div style={{
                                                                        flex: 1,
                                                                        height: '1px',
                                                                        backgroundColor: isCompleted ? '#3b82f6' : '#e2e8f0',
                                                                        marginLeft: '5px',
                                                                        marginRight: '5px',
                                                                        marginTop: '-14px' // Align with circle center
                                                                    }} />
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 1: Enquiry Details */}
                                        <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                                            <div className="card-body p-4">
                                                <h5 className="card-title fw-bold mb-4">Enquiry Details</h5>

                                                {/* Created By Field */}
                                                {!isModifyMode && (
                                                    <div className="d-flex align-items-center mb-3 gap-2 flex-wrap">
                                                        <span className="badge bg-light text-dark border">
                                                            <i className="bi bi-person me-1"></i>
                                                            Created By: {currentUser?.name || 'Unknown'}
                                                        </span>
                                                        <span className="badge bg-info text-dark border">
                                                            <i className="bi bi-hash me-1"></i>
                                                            Enquiry No: Assigned when you click Add Enquiry
                                                        </span>
                                                    </div>
                                                )}

                                                {isModifyMode && (
                                                    <div className="d-flex align-items-center mb-3 justify-content-between">
                                                        <span className="badge bg-light text-dark border">
                                                            <i className="bi bi-person me-1"></i>
                                                            Created By: {formData.CreatedBy || 'Unknown'}
                                                        </span>
                                                        {isLimitedEdit && (
                                                            <span className="badge bg-warning text-dark">
                                                                <i className="bi bi-pencil-square me-1"></i>
                                                                Limited edit (assigned fields only)
                                                            </span>
                                                        )}
                                                        {!canEdit && (
                                                            <span className="badge bg-danger">
                                                                <i className="bi bi-lock-fill me-1"></i>
                                                                Read Only (No Permission)
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Project Name & Source */}
                                                <div className="row mb-3">
                                                    <div className="col-md-6" style={{ position: 'relative' }}>
                                                        <label className="form-label">Project Name<span className="text-danger">*</span></label>
                                                        <div className="input-group">
                                                            <input
                                                                type="text"
                                                                className="form-control"
                                                                style={{ fontSize: '13px' }}
                                                                value={formData.ProjectName}
                                                                onChange={(e) => handleInputChange('ProjectName', e.target.value)}
                                                                onBlur={() => setTimeout(() => setShowProjectSuggestions(false), 200)}
                                                                onFocus={() => { if (formData.ProjectName) handleInputChange('ProjectName', formData.ProjectName); }}
                                                                autoComplete="off"
                                                                disabled={!canEdit || isLimitedEdit}
                                                            />
                                                        </div>

                                                        {/* Autocomplete Dropdown */}
                                                        {showProjectSuggestions && projectSuggestions.length > 0 && (
                                                            <div className="shadow-lg p-0" style={{
                                                                position: 'absolute',
                                                                top: '75px',
                                                                left: '10px',
                                                                right: '0',
                                                                zIndex: 1000,
                                                                backgroundColor: 'white',
                                                                borderRadius: '8px',
                                                                border: '1px solid #e2e8f0',
                                                                maxHeight: '300px',
                                                                overflowY: 'auto'
                                                            }}>
                                                                {/* Arrow */}
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    top: '-6px',
                                                                    left: '20px',
                                                                    width: '12px',
                                                                    height: '12px',
                                                                    backgroundColor: 'white',
                                                                    borderTop: '1px solid #e2e8f0',
                                                                    borderLeft: '1px solid #e2e8f0',
                                                                    transform: 'rotate(45deg)'
                                                                }}></div>

                                                                <div className="list-group list-group-flush">
                                                                    {projectSuggestions.map((suggestion, idx) => (
                                                                        <div key={`${suggestion.RequestNo}-${idx}`} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-3">
                                                                            <div>
                                                                                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#2d3748' }}>{suggestion.ProjectName}</div>
                                                                                <div style={{ fontSize: '11px', color: '#718096' }}>{suggestion.RequestNo}</div>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                className="btn btn-primary btn-sm"
                                                                                style={{ fontSize: '11px', padding: '4px 12px' }}
                                                                                onMouseDown={(e) => {
                                                                                    e.preventDefault(); // Prevent input blur
                                                                                    handleOpenFromSearch(suggestion.RequestNo);
                                                                                    setShowProjectSuggestions(false);
                                                                                }}
                                                                            >
                                                                                Open
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {errors.ProjectName && <ValidationTooltip message={errors.ProjectName} />}
                                                    </div>
                                                    <div className="col-md-6" style={{ position: 'relative' }}>
                                                        <label className="form-label">Source of Enquiry<span className="text-danger">*</span></label>
                                                        <select
                                                            className="form-select"
                                                            value={formData.SourceOfInfo}
                                                            onChange={(e) => handleInputChange('SourceOfInfo', e.target.value)}
                                                            style={{ fontSize: '13px' }}
                                                            disabled={!canEdit || isLimitedEdit}
                                                        >
                                                            <option value="">-- Select Source --</option>
                                                            {masters.sourceOfInfos?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                        {errors.SourceOfInfo && <ValidationTooltip message={errors.SourceOfInfo} />}
                                                    </div>
                                                </div>

                                                {/* Dates */}
                                                <div className="mb-3" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', width: '100%', gap: '15px' }}>
                                                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                                        <label className="form-label">Enquiry Date <span className="text-danger">*</span></label>
                                                        <DateInput
                                                            value={formData.EnquiryDate}
                                                            onChange={(e) => handleInputChange('EnquiryDate', e.target.value)}
                                                            placeholder="DD-MMM-YYYY"
                                                            disabled={!canEdit || isLimitedEdit}
                                                        />
                                                        {errors.EnquiryDate && <ValidationTooltip message={errors.EnquiryDate} />}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                                        <label className="form-label">Due Date <span className="text-danger">*</span></label>
                                                        <DateInput
                                                            value={formData.DueOn}
                                                            onChange={(e) => handleInputChange('DueOn', e.target.value)}
                                                            placeholder="DD-MMM-YYYY"
                                                            disabled={!canEdit || isLimitedEdit}
                                                        />
                                                        {errors.DueOn && <ValidationTooltip message={errors.DueOn} />}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <label className="form-label">Site Visit Date</label>
                                                        <DateInput
                                                            value={formData.SiteVisitDate}
                                                            onChange={(e) => handleInputChange('SiteVisitDate', e.target.value)}
                                                            placeholder="DD-MMM-YYYY"
                                                            disabled={!canEdit || isLimitedEdit}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Content Row: Enquiry Type + Customer Ref No */}
                                                <div className="d-flex mb-3 gap-3" style={{ width: '100%' }}>
                                                    {/* Enquiry Type (Left - ~66%) */}
                                                    <div style={{ flex: '0 0 calc(66.666667% - 10px)' }}>
                                                        <ListBoxControl
                                                            label={<span>Enquiry Type<span className="text-danger">*</span></span>}
                                                            options={masters.enquiryType}
                                                            selectedOption={formData.EnquiryType}
                                                            onOptionChange={(val) => handleInputChange('EnquiryType', val)}
                                                            listBoxItems={enqTypeList}
                                                            onAdd={handleAddEnqType}
                                                            onRemove={() => handleRemoveItem(enqTypeList, setEnqTypeList)}
                                                            error={errors.EnquiryType}
                                                            disabled={!canEdit}
                                                            canRemove={!isLimitedEdit}
                                                            minSearchLength={0}
                                                        />
                                                    </div>

                                                    {/* Customer Ref No (Right - Remaining) */}
                                                    <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                                                        <label className="form-label" style={{ marginBottom: '8px' }}>Customer Ref. No<span className="text-danger">*</span></label>
                                                        <input
                                                            type="text"
                                                            className="form-control"
                                                            value={formData.CustomerRefNo}
                                                            onChange={(e) => handleInputChange('CustomerRefNo', e.target.value)}
                                                            placeholder="Enter Customer Reference"
                                                            disabled={!canEdit || isLimitedEdit}
                                                            style={{ height: '28px' }}
                                                        />
                                                        {errors.CustomerRefNo && <ValidationTooltip message={errors.CustomerRefNo} />}
                                                    </div>
                                                </div>

                                                {/* Enquiry For */}
                                                {/* Enquiry For / Hierarchy */}
                                                <div className="mb-3" style={{ width: '100%' }}>
                                                    <HierarchyBuilder
                                                        label={<span>Enquiry For Structure<span className="text-danger">*</span></span>}
                                                        options={masters.enquiryFor}
                                                        value={enqForList}
                                                        onChange={(newList) => {
                                                            setEnqForList(newList);
                                                            const assignedFromItems = [...new Set(
                                                                (newList || [])
                                                                    .flatMap(i => Array.isArray(i?.assignedSEs) ? i.assignedSEs : (i?.assignedSE ? [i.assignedSE] : []))
                                                                    .map(v => String(v || '').trim())
                                                                    .filter(Boolean)
                                                            )];
                                                            // In modify mode, do not clear Concerned SE when structure edits temporarily
                                                            // have no per-item chips yet (API does not reload assignedSEs; inference uses seList).
                                                            setSeList((prev) => {
                                                                if (assignedFromItems.length > 0) return assignedFromItems;
                                                                if (isModifyMode) return prev;
                                                                return [];
                                                            });
                                                            setFormData(prev => ({ ...prev, EnquiryFor: newList.length > 0 ? newList[0].itemName : '' }));
                                                            setErrors((prev) => {
                                                                const next = { ...prev };
                                                                delete next.EnquiryForAssigneeIds;
                                                                delete next.EnquiryForAccountableIds;
                                                                delete next.EnquiryForAccountable;
                                                                const assigneeMsg = 'Select SE / EE / QS for each Enquiry For item';
                                                                const accountableMsg =
                                                                    'Mark the accountable member (bold red ✓) when multiple SEs are assigned to a division';
                                                                if (next.EnquiryFor === assigneeMsg || next.EnquiryFor === accountableMsg) {
                                                                    delete next.EnquiryFor;
                                                                }
                                                                return next;
                                                            });
                                                        }}
                                                        error={
                                                            errors.EnquiryFor ||
                                                            errors.EnquiryForAccountable ||
                                                            enquiryForStructureHint ||
                                                            undefined
                                                        }
                                                        canRemoveItem={canRemoveEnquiryForItem}
                                                        onRemoveBlocked={onRemoveBlockedEnquiryForItem}
                                                        assigneeErrorIds={
                                                            errors.EnquiryForAssigneeIds?.length
                                                                ? errors.EnquiryForAssigneeIds
                                                                : enquiryForAssigneeIssues
                                                        }
                                                        accountableErrorIds={
                                                            errors.EnquiryForAccountableIds?.length
                                                                ? errors.EnquiryForAccountableIds
                                                                : enquiryForAccountableIssues
                                                        }
                                                        showNew={!isLimitedEdit && (currentUser?.role || currentUser?.Roles || '').toLowerCase().includes('admin')}
                                                        onNew={() => openNewModal(setShowEnqItemModal)}
                                                        showEdit={!isLimitedEdit && (currentUser?.role || currentUser?.Roles || '').toLowerCase().includes('admin')}
                                                        onEditItem={(item) => handleEditEnqFor(item.itemName)}
                                                        canRemove={!isLimitedEdit}
                                                        assigneeUsers={masters.users || []}
                                                        enqItems={masters.enqItems || []}
                                                        /* Non-creators (limited edit) may still assign / adjust SE, EE, QS on structure rows */
                                                        canEditAssignee={canEdit}
                                                    />
                                                </div>

                                                {/* Assignment section removed:
                                                    per-item SE / EE / QS assignment is now managed within Enquiry For Structure. */}

                                                {/* Enquiry Details */}
                                                <div className="row mb-3">
                                                    <div className="col-md-12" style={{ position: 'relative' }}>
                                                        <label className="form-label">Enquiry details<span className="text-danger">*</span></label>
                                                        <textarea className="form-control" rows="3" placeholder="Enter Enquiry Details"
                                                            style={{ resize: 'none' }}
                                                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                            value={formData.DetailsOfEnquiry} onChange={(e) => handleInputChange('DetailsOfEnquiry', e.target.value)} disabled={!canEdit || isLimitedEdit} />
                                                        {errors.DetailsOfEnquiry && <ValidationTooltip message={errors.DetailsOfEnquiry} />}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 2: Customer Information */}
                                        <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                                            <div className="card-body p-4">
                                                <h5 className="card-title fw-bold mb-4">Customer Information</h5>

                                                {/* Customer & Received From */}
                                                <div className="row mb-3">
                                                    <div className="col-md-6">
                                                        <ListBoxControl
                                                            label={<span>Customer Name / Contractor Name<span className="text-danger">*</span></span>}
                                                            options={masters.existingCustomers}
                                                            selectedOption={formData.CustomerName}
                                                            onOptionChange={(val) => {
                                                                handleInputChange('CustomerName', val);
                                                                handleInputChange('ReceivedFrom', '');
                                                            }}
                                                            listBoxItems={customerList}
                                                            onRemove={handleRemoveCustomerPair}
                                                            showNew={true}
                                                            showEdit={true}
                                                            canEdit={!!formData.CustomerName}
                                                            renderListBoxItem={(item, idx) => `${idx + 1}. ${item}`}
                                                            onNew={() => openNewModal(setShowCustomerModal, 'Contractor')}
                                                            onEdit={handleEditCustomer}
                                                            selectedItemDetails={renderCustomerCard()}
                                                            error={errors.CustomerName}
                                                            minSearchLength={3}
                                                            disabled={!canEdit}
                                                            canRemove={false}
                                                        />
                                                    </div>
                                                    <div className="col-md-6">
                                                        <ListBoxControl
                                                            label={<span>Received From<span className="text-danger">*</span></span>}
                                                            options={receivedFromOptions}
                                                            selectedOption={formData.ReceivedFrom}
                                                            onOptionChange={(val) => handleInputChange('ReceivedFrom', val)}
                                                            listBoxItems={receivedFromList}
                                                            onAdd={handleAddReceivedFrom}
                                                            onRemove={handleRemoveCustomerPair}
                                                            showNew={true}
                                                            showEdit={true}
                                                            canEdit={!!formData.ReceivedFrom}
                                                            renderOption={renderContactOption}
                                                            renderListBoxItem={renderContactListBoxItem}
                                                            canRemove={
                                                                !isLimitedEdit &&
                                                                Math.min(customerList.length, receivedFromList.length) > 0
                                                            }
                                                            onNew={() => openNewModal(setShowContactModal, null, { CompanyName: formData.CustomerName })}
                                                            onEdit={handleEditContact}
                                                            selectedItemDetails={renderContactCard()}
                                                            error={errors.ReceivedFrom}
                                                            minSearchLength={0}
                                                            disabled={!canEdit}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Client Name */}
                                                <div className="mb-3" style={{ width: '50%', paddingRight: '12px' }}>
                                                    <SearchableSelectControl
                                                        label={<span>Client Name<span className="text-danger">*</span></span>}
                                                        options={combinedClientNames}
                                                        selectedOption={formData.ClientName}
                                                        onOptionChange={(val) => handleInputChange('ClientName', val)}
                                                        showNew={true}
                                                        showEdit={true}
                                                        canEdit={!!formData.ClientName}
                                                        onNew={() => openNewModal(setShowCustomerModal, 'Client')}
                                                        onEdit={handleEditClient}
                                                        error={errors.ClientName}
                                                        disabled={!canEdit || isLimitedEdit}
                                                        minSearchLength={3}
                                                    />
                                                </div>

                                                {/* Consultant Name */}
                                                <div className="mb-3" style={{ width: '50%', paddingRight: '12px' }}>
                                                    <ListBoxControl
                                                        label="Main Consultant / Lead Consultant / MEP Consultant / Project Manager"
                                                        options={masters.consultantNames}
                                                        selectedOption={formData.ConsultantName}
                                                        onOptionChange={(val) => handleInputChange('ConsultantName', val)}
                                                        listBoxItems={consultantList}
                                                        onAdd={handleAddConsultant}
                                                        onRemove={() => handleRemoveItem(consultantList, setConsultantList, originalConsultantList)}
                                                        showNew={true}
                                                        showEdit={true}
                                                        canEdit={!!formData.ConsultantName}
                                                        onNew={() => openNewModal(setShowCustomerModal, 'Consultant')}
                                                        onEdit={handleEditConsultant}
                                                        disabled={!canEdit}
                                                        canRemove={!isLimitedEdit}
                                                        minSearchLength={3}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 3: Attachments & Remarks */}
                                        <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                                            <div className="card-body p-4">
                                                <h5 className="card-title fw-bold mb-4">Attachments & Remarks</h5>

                                                {/* Document Received */}
                                                <div className="row mb-3">
                                                    <div className="col-md-12">
                                                        <label className="form-label">Document received</label>
                                                        <div className="d-flex gap-2 mb-2" style={{ fontSize: '13px', flexWrap: 'nowrap' }}>
                                                            {['hardcopy', 'drawing', 'dvd', 'spec', 'eqpschedule'].map(chk => (
                                                                <div className="form-check form-check-inline" key={chk}>
                                                                    <input className="form-check-input" type="checkbox" id={chk}
                                                                        checked={formData[chk]} onChange={(e) => handleInputChange(chk, e.target.checked)} disabled={!canEdit} />
                                                                    <label className="form-check-label" htmlFor={chk}>
                                                                        {chk === 'hardcopy' ? 'Hard Copies' :
                                                                            chk === 'drawing' ? 'Drawing' :
                                                                                chk === 'dvd' ? 'CD/DVD' :
                                                                                    chk === 'spec' ? 'Spec' : 'Equipment Schedule'}
                                                                    </label>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <label className="form-label">Others Specify</label>
                                                        <textarea className="form-control mb-2" rows="2" placeholder="Enter Documents Received"
                                                            style={{ resize: 'none' }}
                                                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                            value={formData.DocumentsReceived} onChange={(e) => handleInputChange('DocumentsReceived', e.target.value)} disabled={!canEdit} />

                                                        {/* Attachment Sections */}
                                                        <div className="mt-4">
                                                            {/* 1. Public Attachments */}
                                                            <div className="mb-4">
                                                                <h6 className="fw-bold text-primary mb-2" style={{ fontSize: '14px' }}>
                                                                    <i className="bi bi-globe me-2"></i>1. Public Attachments <span className="text-muted fw-normal" style={{ fontSize: '11px' }}>(Visible to all subjobs)</span>
                                                                </h6>
                                                                <div className="d-flex align-items-center mb-2 gap-2 ps-3">
                                                                    <input type="file" id="publicFileInput" style={{ display: 'none' }} multiple onChange={(e) => handleFileUpload(e, 'Public')} />
                                                                    <input type="file" id="publicFolderInput" style={{ display: 'none' }} webkitdirectory="" directory="" onChange={(e) => handleFileUpload(e, 'Public')} />

                                                                    <button type="button" className="btn btn-outline-primary btn-sm" style={{ fontSize: '12px' }} onClick={() => document.getElementById('publicFileInput').click()}>
                                                                        <i className="bi bi-file-earmark-plus me-1"></i>Add Files
                                                                    </button>
                                                                    <button type="button" className="btn btn-outline-primary btn-sm" style={{ fontSize: '12px' }} onClick={() => document.getElementById('publicFolderInput').click()}>
                                                                        <i className="bi bi-folder-plus me-1"></i>Add Folder
                                                                    </button>
                                                                </div>
                                                                <div className="ps-3">
                                                                    {(() => {
                                                                        const list = renderAttachmentList('Public', 'File');
                                                                        return list ? (
                                                                            <div className="border rounded p-2 bg-light-subtle" style={{ maxHeight: '230px', overflowY: 'auto' }}>
                                                                                {list}
                                                                            </div>
                                                                        ) : null;
                                                                    })()}
                                                                </div>
                                                            </div>

                                                            {/* 2. Private Attachments */}
                                                            <div className="mb-4">
                                                                <h6 className="fw-bold text-danger mb-2" style={{ fontSize: '14px' }}>
                                                                    <i className="bi bi-lock me-2"></i>2. Private Attachments <span className="text-muted fw-normal" style={{ fontSize: '11px' }}>(Visible only to own division users)</span>
                                                                </h6>
                                                                <div className="d-flex align-items-center mb-2 gap-2 ps-3">
                                                                    <input type="file" id="privateFileInput" style={{ display: 'none' }} multiple onChange={(e) => handleFileUpload(e, 'Private')} />
                                                                    <input type="file" id="privateFolderInput" style={{ display: 'none' }} webkitdirectory="" directory="" onChange={(e) => handleFileUpload(e, 'Private')} />

                                                                    <button type="button" className="btn btn-outline-danger btn-sm" style={{ fontSize: '12px' }} onClick={() => document.getElementById('privateFileInput').click()}>
                                                                        <i className="bi bi-file-earmark-lock me-1"></i>Add Files
                                                                    </button>
                                                                    <button type="button" className="btn btn-outline-danger btn-sm" style={{ fontSize: '12px' }} onClick={() => document.getElementById('privateFolderInput').click()}>
                                                                        <i className="bi bi-folder-lock me-1"></i>Add Folder
                                                                    </button>
                                                                </div>
                                                                <div className="ps-3">
                                                                    {(() => {
                                                                        const list = renderAttachmentList('Private', 'File');
                                                                        return list ? (
                                                                            <div className="border rounded p-2 bg-light-subtle" style={{ maxHeight: '230px', overflowY: 'auto' }}>
                                                                                {list}
                                                                            </div>
                                                                        ) : null;
                                                                    })()}
                                                                </div>
                                                            </div>

                                                            {/* 3. Hyperlinks */}
                                                            <div className="mb-4">
                                                                <h6 className="fw-bold text-success mb-2" style={{ fontSize: '14px' }}>
                                                                    <i className="bi bi-link-45deg me-2"></i>3. Hyperlinks for Document Download
                                                                </h6>
                                                                <div className="ps-3">
                                                                    {/* Input Row */}
                                                                    <div className="mb-4">
                                                                        <div className="mb-2">
                                                                            <label className="form-label" style={{ fontSize: '11px' }}>URL / Path (Paste one or more links separated by Enter)</label>
                                                                            <textarea
                                                                                className="form-control form-control-sm mb-2"
                                                                                style={{ fontSize: '12px', minHeight: '60px' }}
                                                                                placeholder={"https://link1.com\nhttps://link2.com\n\\\\server\\path"}
                                                                                value={hyperlink.url}
                                                                                onChange={(e) => setHyperlink({ ...hyperlink, url: e.target.value })}
                                                                            />
                                                                        </div>
                                                                        <div className="d-flex gap-2">
                                                                            <button type="button" className="btn btn-sm btn-outline-success" style={{ fontSize: '11px', minWidth: '120px' }} onClick={() => handleAddLink('Public')} disabled={!hyperlink.url}>
                                                                                <i className="bi bi-plus-lg me-1"></i>Public Link
                                                                            </button>
                                                                            <button type="button" className="btn btn-sm btn-outline-danger" style={{ fontSize: '11px', minWidth: '120px' }} onClick={() => handleAddLink('Private')} disabled={!hyperlink.url}>
                                                                                <i className="bi bi-lock me-1"></i>Private Link
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* Link Lists */}
                                                                    <div className="row mt-2">
                                                                        <div className="col-md-6 border-end">
                                                                            {(() => {
                                                                                const list = renderAttachmentList('Public', 'Link');
                                                                                return list ? (
                                                                                    <>
                                                                                        <span className="badge bg-success-subtle text-success mb-2" style={{ fontSize: '10px' }}>Public Links</span>
                                                                                        <div className="border rounded p-2 bg-light-subtle" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                                                                                            {list}
                                                                                        </div>
                                                                                    </>
                                                                                ) : null;
                                                                            })()}
                                                                        </div>
                                                                        <div className="col-md-6">
                                                                            {(() => {
                                                                                const list = renderAttachmentList('Private', 'Link');
                                                                                return list ? (
                                                                                    <>
                                                                                        <span className="badge bg-danger-subtle text-danger mb-2" style={{ fontSize: '10px' }}>Private (Division Only)</span>
                                                                                        <div className="border rounded p-2 bg-light-subtle" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                                                                                            {list}
                                                                                        </div>
                                                                                    </>
                                                                                ) : null;
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Remarks */}
                                                <div className="row mb-3">
                                                    <div className="col-md-12">
                                                        <label className="form-label">Remarks</label>
                                                        <textarea className="form-control" rows="2" placeholder="Enter Remarks"
                                                            style={{ resize: 'none' }}
                                                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                            value={formData.Remark} onChange={(e) => handleInputChange('Remark', e.target.value)} disabled={!canEdit} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 4: Collaborative Notes */}
                                        {isModifyMode && (
                                            <CollaborativeNotes
                                                enquiryId={formData?.RequestNo || modifyRequestNo}
                                                enquiryData={{
                                                    ...formData,
                                                    SelectedConcernedSEs: seList,
                                                    SelectedEnquiryFor: enqForList
                                                }}
                                            />
                                        )}

                                        {/* Footer: Actions */}
                                        {/* Footer: Actions */}
                                        <div>
                                            {/* Checkboxes Section */}
                                            <div className="d-flex flex-column gap-2 mb-3">
                                                {/* Send Acknowledgement Mail */}
                                                <div className="form-check" style={{ fontSize: '13px' }}>
                                                    <input className="form-check-input" type="checkbox" id="autoAck"
                                                        checked={formData.AutoAck} onChange={(e) => handleInputChange('AutoAck', e.target.checked)} disabled={!canEdit || isLimitedEdit} />
                                                    <label className="form-check-label" htmlFor="autoAck">Send acknowledgement mail</label>
                                                </div>

                                                {formData.AutoAck && !isModifyMode && seList.length > 0 && (
                                                    <div className="ms-4 mb-2" style={{ fontSize: '13px' }}>
                                                        <label className="form-label mb-1" style={{ fontSize: '12px' }}>
                                                            Customer point of contact (SE)
                                                        </label>
                                                        <select
                                                            className={`form-select form-select-sm${errors.AcknowledgementSE ? ' is-invalid' : ''}`}
                                                            value={ackSEList[0] || ''}
                                                            onChange={(e) => {
                                                                setAckSEList(e.target.value ? [e.target.value] : []);
                                                                if (errors.AcknowledgementSE) {
                                                                    setErrors((prev) => {
                                                                        const next = { ...prev };
                                                                        delete next.AcknowledgementSE;
                                                                        return next;
                                                                    });
                                                                }
                                                            }}
                                                            style={{ fontSize: '13px', width: '280px' }}
                                                        >
                                                            <option value="">-- Select SE --</option>
                                                            {seList.map((se, idx) => (
                                                                <option key={idx} value={se}>{se}</option>
                                                            ))}
                                                        </select>
                                                        {errors.AcknowledgementSE ? (
                                                            <div className="invalid-feedback d-block">{errors.AcknowledgementSE}</div>
                                                        ) : null}
                                                    </div>
                                                )}

                                                {!isModifyMode ? (
                                                    <div className="text-muted ms-1" style={{ fontSize: '11px' }}>
                                                        On save: (1) Internal notification is sent to all concerned SEs (CC: division CCMailIds).
                                                        {formData.AutoAck
                                                            ? ' (2) One Outlook draft per customer — To: Received From email; CC: all concerned SEs and division CCMailIds.'
                                                            : ''}
                                                    </div>
                                                ) : null}

                                                {/* ED/CEO Signature Required */}
                                                <div className="form-check" style={{ fontSize: '13px' }}>
                                                    <input className="form-check-input" type="checkbox" id="ceoSign"
                                                        checked={formData.ceosign} onChange={(e) => handleInputChange('ceosign', e.target.checked)} disabled={!canEdit || isLimitedEdit} />
                                                    <label className="form-check-label" htmlFor="ceoSign">ED/CEO Signature required</label>
                                                </div>

                                                {/* Enquiry Status Dropdown */}
                                                <div className="d-flex align-items-center gap-2 mt-2" style={{ fontSize: '13px' }}>
                                                    <label className="mb-0">Enquiry Status:</label>
                                                    <select
                                                        className="form-select form-select-sm"
                                                        style={{ width: '120px', fontSize: '13px' }}
                                                        value={formData.EnquiryStatus}
                                                        onChange={(e) => handleInputChange('EnquiryStatus', e.target.value)}
                                                        disabled={!canEdit || isLimitedEdit}
                                                    >
                                                        <option value="Active">Active</option>
                                                        <option value="Inactive">Inactive</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Buttons Section (Left Aligned, Add then Cancel) */}
                                            <div className="d-flex justify-content-start gap-2 mt-4 mb-5">
                                                {(!isModifyMode || (isModifyMode && canEdit)) && (() => {
                                                    /* When the user clicked `-` on a priced customer's Received From,
                                                       customerList has an entry without a paired RF. Block save until
                                                       they pick a new contact and click `+` to re-pair the slot. */
                                                    const hasUnpairedCustomer = customerList.length > receivedFromList.length;
                                                    const saveDisabled =
                                                        isSubmitting ||
                                                        (!isModifyMode && isFormEmpty) ||
                                                        hasUnpairedCustomer;
                                                    return (
                                                        <button
                                                            type="submit"
                                                            className="btn btn-outline-success"
                                                            disabled={saveDisabled}
                                                            title={
                                                                hasUnpairedCustomer
                                                                    ? 'Please select a Received From contact and click + to re-pair it before saving.'
                                                                    : undefined
                                                            }
                                                        >
                                                            {isSubmitting ? (
                                                                <>
                                                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                                    {isModifyMode ? 'Saving...' : 'Adding...'}
                                                                </>
                                                            ) : (
                                                                isModifyMode ? 'Save Changes' : 'Add Enquiry'
                                                            )}
                                                        </button>
                                                    );
                                                })()}
                                                <button type="button" className="btn btn-outline-danger" onClick={resetForm} disabled={isSubmitting}>
                                                    {isModifyMode && !canEdit ? 'Close' : 'Cancel'}
                                                </button>
                                                {customerList.length > receivedFromList.length && (
                                                    <span
                                                        className="text-danger align-self-center"
                                                        style={{ fontSize: '12px', marginLeft: '4px' }}
                                                    >
                                                        Pick a Received From contact and click <strong>+</strong> to re-pair it with the listed customer before saving.
                                                    </span>
                                                )}
                                                {enquiryForAssigneeIssues.length > 0 && (
                                                    <span
                                                        className="text-danger align-self-center"
                                                        style={{ fontSize: '12px', marginLeft: '4px', fontWeight: 600 }}
                                                    >
                                                        Enquiry For Structure: select SE / EE / QS for each division row before saving.
                                                    </span>
                                                )}
                                                {enquiryForAccountableIssues.length > 0 && (
                                                    <span
                                                        className="text-danger align-self-center"
                                                        style={{ fontSize: '12px', marginLeft: '4px', fontWeight: 600 }}
                                                    >
                                                        Enquiry For Structure: mark accountable member — click ○ on one chip (bold red <strong style={{ color: '#dc2626' }}>✓</strong>) when multiple members are assigned.
                                                    </span>
                                                )}
                                            </div>

                                            {/* Validation Error Messages */}
                                            {Object.keys(errors).length > 0 && (
                                                <div ref={errorSectionRef} className="alert alert-danger mt-2 mb-5" role="alert" style={{ fontSize: '13px' }}>
                                                    <strong>Please fill in the following mandatory fields:</strong>
                                                    <ul className="mb-0 mt-2" style={{ paddingLeft: '20px' }}>
                                                        {Object.keys(errors)
                                                            .filter(
                                                                (field) =>
                                                                    !field.endsWith('Ids') &&
                                                                    field !== 'EnquiryForAccountable'
                                                            )
                                                            .map((field) => (
                                                            <li key={field}>
                                                                {field === 'SourceOfInfo' && 'Source of Information'}
                                                                {field === 'EnquiryDate' && 'Enquiry Date'}
                                                                {field === 'DueOn' && (errors[field] === 'Required' ? 'Due On' : errors[field])}
                                                                {field === 'EnquiryType' && 'Enquiry Type'}
                                                                {field === 'EnquiryFor' &&
                                                                    (typeof errors[field] === 'string' && errors[field] !== 'Required'
                                                                        ? `Enquiry For Structure — ${errors[field]}`
                                                                        : 'Enquiry For Structure')}
                                                                {field === 'CustomerName' && 'Customer Name'}
                                                                {field === 'ReceivedFrom' && 'Received From'}
                                                                {field === 'ProjectName' && 'Project Name'}
                                                                {field === 'ClientName' && 'Client Name'}
                                                                {field === 'ConcernedSE' && 'Concerned SE'}
                                                                {field === 'DetailsOfEnquiry' && 'Details of Enquiry'}
                                                                {field === 'CustomerRefNo' && 'Customer Ref. No'}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </form>

                                    {/* Modals */}
                                    <CustomerModal
                                        show={showCustomerModal}
                                        onClose={() => setShowCustomerModal(false)}
                                        mode={modalMode}
                                        initialData={editData}
                                        onSubmit={handleCustomerSubmit}
                                        fixedCategory={fixedCategory}
                                    />
                                    <ContactModal
                                        show={showContactModal}
                                        onClose={() => setShowContactModal(false)}
                                        mode={modalMode}
                                        initialData={editData}
                                        onSubmit={handleContactSubmit}
                                        companyNameReadOnly
                                    />
                                    <UserModal
                                        show={showUserModal}
                                        onClose={() => setShowUserModal(false)}
                                        mode={modalMode}
                                        initialData={editData}
                                        onSubmit={handleUserSubmit}
                                    />
                                    <EnquiryItemModal
                                        show={showEnqItemModal}
                                        onClose={() => setShowEnqItemModal(false)}
                                        mode={modalMode}
                                        initialData={editData}
                                        onSubmit={handleEnqItemSubmit}
                                        onModeChange={(newMode, data) => {
                                            setModalMode(newMode);
                                            setEditData(data);
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-light border rounded text-danger">
                    <h4>Something went wrong.</h4>
                    <p>{this.state.error && this.state.error.toString()}</p>
                    <pre style={{ fontSize: '11px' }}>{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
                    <button className="btn btn-outline-secondary mt-2" onClick={() => window.location.reload()}>Reload Page</button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function EnquiryFormWrapper(props) {
    return (
        <ErrorBoundary>
            <EnquiryForm {...props} />
        </ErrorBoundary>
    );
}
