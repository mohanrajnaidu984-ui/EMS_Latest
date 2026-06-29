export const sourceOfInfos = [
    "Email", "Phone", "Public Tender Board", "Private Tender", "Customer Visit", "Cold visit by us", "Website", "Fax", "Thru top management", "News Paper"
];

export const enquiryType = [
    "New Tender", "Re-Tender", "Budgetary", "Job in hand", "Variation / Change order", "Supply only", "Maintenance", "Retrofit",
    "Upgradation", "Refurbishment", "Service", "Hiring", "Renting", "Facility Management", "Demo"
];

export const consultantTypeOptions = [
    "MEP", "HVAC", "Electrical", "Plumbing", "Fire Fighting", "BMS", "ELV", "Civil", "Piling", "Scaffolding",
    "Cleaning", "Security", "Maintenance", "Transport", "Interior", "Landscape", "Carpentry", "Aluminium", "Real estate", "Facility Management"
];

export const allStatuses = [
    "Enquiry", "Pricing", "Quote", "Probability", "Reports"
];

export const availableRoles = ["Enquiry", "Pricing", "Quote", "Probability", "Sales Report", "Sales Target", "Admin"];

export const projectNames = ["Project Alpha", "Project Beta"];

export const existingCustomers = ["Customer X Ltd", "Customer Y Corp"];
export const clientNames = ["Client Z Inc"];
export const consultantNames = ["Consultant A"];
export const concernedSEs = ["SE1 - John Doe", "SE2 - Jane Smith"];
export const enquiryFor = ["Electrical", "Mechanical"];

export const storedUsers = [
    { FullName: "SE1 - John Doe", Designation: "Sales Engineer", MailId: "se1@comp.com", Status: "Active", Roles: ["Enquiry", "Quote"] },
    { FullName: "SE2 - Jane Smith", Designation: "Sales Manager", MailId: "se2@comp.com", Status: "Active", Roles: ["Enquiry", "Admin", "Pricing", "Probability", "Sales Report", "Report"] },
];

export const storedContacts = [
    { ContactName: "Velu", CompanyName: "Customer X Ltd", EmailId: "pa@custx.com", Category: "Contractor", Designation: "Manager", Address1: "123 Main St", Mobile1: "333" },
    { ContactName: "Vijay", CompanyName: "Customer Y Corp", EmailId: "pb@custy.com", Category: "Contractor", Designation: "Director", Address1: "456 Oak Ave", Mobile1: "666" },
    { ContactName: "Seema", CompanyName: "Customer X Ltd", EmailId: "sc@custx.com", Category: "Contractor", Designation: "Engineer", Address1: "123 Main St", Mobile1: "333" },
    { ContactName: "Person C - Engineer", CompanyName: "Client Z Inc", EmailId: "pc@clientz.com", Category: "Client", Designation: "Engineer", Address1: "789 Pine Rd", Mobile1: "999" }
];

export const storedCustomers = [
    { CompanyName: "Customer X Ltd", Category: "Contractor", Status: "Active", Address1: "123 Main St", Phone1: "222" },
    { CompanyName: "Customer Y Corp", Category: "Contractor", Status: "Active", Address1: "456 Oak Ave", Phone1: "555" },
    { CompanyName: "Client Z Inc", Category: "Client", Status: "Active", Address1: "789 Pine Rd", Phone1: "888" },
    { CompanyName: "Consultant A", Category: "Consultant", Status: "Active", Address1: "101 Elm Blvd", Phone1: "000" }
];

export const storedEnqItems = [
    { ItemName: "Electrical", DepartmentName: "Elect", CommonMailIds: ["elect_common@a.com"], Status: "Active" },
    { ItemName: "Mechanical", DepartmentName: "Mech", CCMailIds: ["mech_cc1@b.com"], Status: "Active" }
];

export const initialEnquiries = {
    "EYS/2025/11/001": {
        RequestNo: "EYS/2025/11/001",
        SourceOfInfo: "Phone",
        EnquiryDate: "2025-11-12",
        DueOn: "2025-11-19",
        SiteVisitDate: "2025-11-27",
        SelectedEnquiryTypes: ["Re-Tender"],
        SelectedEnquiryFor: ["Electrical"],
        SelectedCustomers: ["Customer X Ltd"],
        SelectedReceivedFroms: ["Seema|Customer X Ltd"],
        ProjectName: "Project Alpha",
        ClientName: "Client Z Inc",
        ConsultantName: "Consultant A",
        SelectedConcernedSEs: ["SE2 - Jane Smith"],
        DetailsOfEnquiry: "zsdcfhbjnm",
        hardcopy: true,
        drawing: true,
        dvd: false,
        spec: false,
        eqpschedule: false,
        DocumentsReceived: "xcvyb",
        Remark: "excryybun",
        AutoAck: true,
        ceosign: false,
        Status: "Enquiry"
    }
};
