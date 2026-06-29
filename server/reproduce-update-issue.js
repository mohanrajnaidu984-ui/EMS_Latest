const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

const runTest = async () => {
    try {
        console.log('Creating test enquiry...');
        const newEnquiry = {
            RequestNo: `TEST-UPDATE-${Date.now()}`,
            SourceOfInfo: 'Email',
            EnquiryDate: '2025-11-26',
            DueOn: '2025-11-30',
            SelectedEnquiryTypes: ['Supply'],
            SelectedEnquiryFor: ['Pump'],
            SelectedCustomers: ['Test Customer'],
            SelectedReceivedFroms: ['John Doe|Test Customer'],
            SelectedConcernedSEs: ['SE1'],
            ProjectName: 'Test Project',
            ClientName: 'Test Client',
            ConsultantName: 'Test Consultant',
            DetailsOfEnquiry: 'Initial Details',
            Status: 'Enquiry',
            hardcopy: false,
            drawing: false,
            dvd: false,
            spec: false,
            eqpschedule: false,
            AutoAck: false,
            ceosign: false
        };

        await axios.post(`${API_URL}/enquiries`, newEnquiry);
        console.log('Enquiry created:', newEnquiry.RequestNo);

        console.log('Updating enquiry...');
        const updatedEnquiry = {
            ...newEnquiry,
            DetailsOfEnquiry: 'Updated Details',
            SelectedEnquiryTypes: ['Installation'], // Changed
            SelectedEnquiryFor: ['Motor'], // Changed
            SelectedCustomers: ['Updated Customer'], // Changed
            SelectedReceivedFroms: ['Jane Doe|Updated Customer'], // Changed
            SelectedConcernedSEs: ['SE2'], // Changed
            ProjectName: 'Updated Project'
        };

        await axios.put(`${API_URL}/enquiries/${newEnquiry.RequestNo}`, updatedEnquiry);
        console.log('Enquiry updated.');

        console.log('Fetching enquiry to verify...');
        const res = await axios.get(`${API_URL}/enquiries`);
        const fetched = res.data.find(e => e.RequestNo === newEnquiry.RequestNo);

        if (!fetched) {
            console.error('Enquiry not found!');
            return;
        }

        console.log('--- Verification ---');
        console.log('Details:', fetched.DetailsOfEnquiry === 'Updated Details' ? 'OK' : `FAIL (${fetched.DetailsOfEnquiry})`);
        console.log('Project:', fetched.ProjectName === 'Updated Project' ? 'OK' : `FAIL (${fetched.ProjectName})`);

        // Check relationships
        // Note: The GET API returns these as arrays in Selected... fields
        console.log('Types:', JSON.stringify(fetched.SelectedEnquiryTypes) === JSON.stringify(['Installation']) ? 'OK' : `FAIL (${JSON.stringify(fetched.SelectedEnquiryTypes)})`);
        console.log('Items:', JSON.stringify(fetched.SelectedEnquiryFor) === JSON.stringify(['Motor']) ? 'OK' : `FAIL (${JSON.stringify(fetched.SelectedEnquiryFor)})`);
        console.log('Customers:', JSON.stringify(fetched.SelectedCustomers) === JSON.stringify(['Updated Customer']) ? 'OK' : `FAIL (${JSON.stringify(fetched.SelectedCustomers)})`);
        console.log('Contacts:', JSON.stringify(fetched.SelectedReceivedFroms) === JSON.stringify(['Jane Doe|Updated Customer']) ? 'OK' : `FAIL (${JSON.stringify(fetched.SelectedReceivedFroms)})`);
        console.log('SEs:', JSON.stringify(fetched.SelectedConcernedSEs) === JSON.stringify(['SE2']) ? 'OK' : `FAIL (${JSON.stringify(fetched.SelectedConcernedSEs)})`);

    } catch (err) {
        console.error('Test Failed:', err.message);
        if (err.response) console.error('Server Response:', err.response.data);
    }
};

runTest();
