import React, { createContext, useState, useEffect, useContext } from 'react';
import {
    sourceOfInfos, enquiryType, consultantTypeOptions, allStatuses,
    availableRoles, projectNames, existingCustomers, clientNames,
    consultantNames, concernedSEs, enquiryFor, storedUsers,
    storedContacts, storedCustomers, storedEnqItems, initialEnquiries
} from '../data/mockData';
import { readApiJson } from '../utils/apiJson';

const DataContext = createContext();

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
    // --- API Integration ---
    const API_URL = '/api';

    // Master Data State
    const [masters, setMasters] = useState({
        sourceOfInfos,
        enquiryType,
        consultantTypeOptions,
        allStatuses,
        availableRoles,
        projectNames,
        existingCustomers: [], // Will fetch from DB
        clientNames: [], // Will fetch from DB
        consultantNames: [], // Will fetch from DB
        concernedSEs,
        enquiryFor,
        users: storedUsers,
        contacts: storedContacts,
        customers: [], // Will fetch from DB
        enqItems: storedEnqItems
    });

    const [enquiries, setEnquiries] = useState([]);
    const [enquiriesRefreshing, setEnquiriesRefreshing] = useState(false);

    const mapEnquiriesResponse = (enqData) => {
        const enqMap = {};
        (Array.isArray(enqData) ? enqData : []).forEach((e) => {
            enqMap[e.RequestNo] = e;
        });
        return enqMap;
    };

    const fetchEnquiriesFromApi = async (options = {}) => {
        const { userEmail = '', userName = '', userRole = '', listScope = '' } = options;
        const params = new URLSearchParams();
        if (userEmail) params.set('userEmail', userEmail);
        if (userName) params.set('userName', userName);
        if (userRole) params.set('userRole', userRole);
        if (listScope) params.set('listScope', listScope);
        const qs = params.toString();
        const res = await fetch(`${API_URL}/enquiries${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
        const parsed = await readApiJson(res);
        if (!parsed.ok || parsed.invalidJson) {
            throw new Error(parsed.data?.error || `Failed to load enquiries (HTTP ${parsed.status})`);
        }
        return mapEnquiriesResponse(parsed.data);
    };

    const refreshEnquiries = async (options = {}) => {
        setEnquiriesRefreshing(true);
        try {
            const enqMap = await fetchEnquiriesFromApi(options);
            setEnquiries(enqMap);
            return enqMap;
        } finally {
            setEnquiriesRefreshing(false);
        }
    };

    // Fetch Data on Load
    useEffect(() => {
        const fetchData = async () => {
            try {
                const asArray = (parsed, label) => {
                    if (parsed.invalidJson) {
                        console.warn(`[DataContext] ${label}: response was not JSON`);
                        return [];
                    }
                    if (!parsed.ok) {
                        console.warn(`[DataContext] ${label}: HTTP ${parsed.status}`, parsed.data);
                        return [];
                    }
                    const d = parsed.data;
                    return Array.isArray(d) ? d : [];
                };

                const [enqRes, custRes, contRes, userRes, itemRes] = await Promise.all([
                    fetch(`${API_URL}/enquiries?listScope=all`, { cache: 'no-store' }).catch((err) => {
                        console.error('[DataContext] Enquiries fetch failed:', err);
                        return null;
                    }),
                    fetch(`${API_URL}/customers`).catch((err) => {
                        console.error('[DataContext] Customers fetch failed:', err);
                        return null;
                    }),
                    fetch(`${API_URL}/contacts`).catch((err) => {
                        console.error('[DataContext] Contacts fetch failed:', err);
                        return null;
                    }),
                    fetch(`${API_URL}/users`).catch((err) => {
                        console.error('[DataContext] Users fetch failed:', err);
                        return null;
                    }),
                    fetch(`${API_URL}/enquiry-items`).catch((err) => {
                        console.error('[DataContext] Enquiry items fetch failed:', err);
                        return null;
                    })
                ]);

                const emptyParsed = { ok: false, status: 0, data: {} };
                const enqParsed = enqRes ? await readApiJson(enqRes) : emptyParsed;
                const custParsed = custRes ? await readApiJson(custRes) : emptyParsed;
                const contParsed = contRes ? await readApiJson(contRes) : emptyParsed;
                const userParsed = userRes ? await readApiJson(userRes) : emptyParsed;
                const itemParsed = itemRes ? await readApiJson(itemRes) : emptyParsed;

                const enqData = asArray(enqParsed, 'enquiries');
                const custData = asArray(custParsed, 'customers');
                const contData = asArray(contParsed, 'contacts');
                const userData = asArray(userParsed, 'users');
                const itemData = asArray(itemParsed, 'enquiry-items');

                setEnquiries(mapEnquiriesResponse(enqData));

                const contractors = custData.filter(c => c.Category === 'Contractor').map(c => c.CompanyName);
                const clients = custData.filter(c => c.Category === 'Client').map(c => c.CompanyName);
                const consultants = custData.filter(c => c.Category === 'Consultant').map(c => c.CompanyName);
                const allDistinctCustomers = [...new Set(custData.map(c => c.CompanyName).filter(Boolean))].sort(new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare);

                setMasters(prev => ({
                    ...prev,
                    existingCustomers: allDistinctCustomers,
                    clientNames: clients,
                    consultantNames: consultants,
                    customers: custData,
                    contacts: contData,
                    users: userData,
                    concernedSEs: userData.map(u => u.FullName),
                    enqItems: itemData,
                    enquiryFor: itemData.map(i => i.ItemName)
                }));
            } catch (err) {
                console.error("[DataContext] API Fetch Error:", err);
                console.error("[DataContext] Error stack:", err.stack);
            }
        };
        fetchData();
    }, []);

    const addMaster = async (type, data) => {
        let endpoint = '';
        switch (type) {
            case 'customer': endpoint = '/customers'; break;
            case 'contact': endpoint = '/contacts'; break;
            case 'user': endpoint = '/users'; break;
            case 'enquiryItem': endpoint = '/enquiry-items'; break;
            default: return;
        }

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                const responseData = await res.json();
                return responseData;
            }
        } catch (err) {
            console.error(err);
            return false;
        }
    };

    const updateMaster = async (type, id, data) => {
        let endpoint = '';
        switch (type) {
            case 'enquiryItem': endpoint = `/enquiry-items/${id}`; break;
            case 'customer': endpoint = `/customers/${id}`; break;
            case 'contact': endpoint = `/contacts/${id}`; break;
            case 'user': endpoint = `/users/${id}`; break;
            default: return;
        }

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return res.ok;
        } catch (err) {
            console.error(err);
            return false;
        }
    };

    const deleteMaster = async (type, id) => {
        let endpoint = '';
        switch (type) {
            case 'user': endpoint = `/users/${id}`; break;
            // Add other cases if needed later
            default: return;
        }

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'DELETE'
            });
            return res.ok;
        } catch (err) {
            console.error(err);
            return false;
        }
    };

    // Actions
    const addEnquiry = async (newEnquiry) => {
        try {
            const res = await fetch(`${API_URL}/enquiries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEnquiry)
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                const requestNo = String(data.RequestNo || newEnquiry.RequestNo || '').trim();
                setEnquiries(prev => ({
                    ...prev,
                    [requestNo]: { ...newEnquiry, RequestNo: requestNo }
                }));
                return { success: true, requestNo };
            } else {
                let errorMessage = 'Failed to save to DB';
                try {
                    const text = await res.text();
                    try {
                        const errorData = JSON.parse(text);
                        errorMessage = errorData.error || errorData.message || errorMessage;
                    } catch {
                        errorMessage = text;
                    }
                } catch (e) {
                    console.error('Error reading response:', e);
                }
                console.error('Save failed:', errorMessage);
                if (!String(errorMessage).includes('already Project name is exist')) {
                    alert(`Failed to save to DB: ${errorMessage}`);
                }
                return { success: false, error: errorMessage };
            }
        } catch (err) {
            console.error(err);
            alert('Server Error');
            return { success: false, error: err.message };
        }
    };

    const updateEnquiry = async (requestNo, updatedEnquiry) => {
        try {
            const res = await fetch(`${API_URL}/enquiries/${encodeURIComponent(requestNo)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedEnquiry)
            });
            if (res.ok) {
                setEnquiries(prev => ({
                    ...prev,
                    [requestNo]: updatedEnquiry
                }));
                return { success: true };
            }
            let errorMessage = 'Failed to update enquiry';
            try {
                const text = await res.text();
                try {
                    const errorData = JSON.parse(text);
                    errorMessage = errorData.error || errorData.message || errorMessage;
                } catch {
                    errorMessage = text || errorMessage;
                }
            } catch (e) {
                console.error('Error reading update response:', e);
            }
            console.error('Update failed:', errorMessage);
            return { success: false, error: errorMessage };
        } catch (err) {
            console.error(err);
            return { success: false, error: err.message || 'Server Error' };
        }
    };

    const getEnquiry = (requestNo) => {
        return enquiries[requestNo] || null;
    };

    const searchEnquiries = (criteria) => {
        // Implement search logic here later
        return Object.values(enquiries);
    };

    const value = {
        masters,
        enquiries,
        enquiriesRefreshing,
        refreshEnquiries,
        addEnquiry,
        updateEnquiry,
        getEnquiry,
        searchEnquiries,
        updateMasters: setMasters,
        addMaster,
        updateMaster,
        deleteMaster
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
};
