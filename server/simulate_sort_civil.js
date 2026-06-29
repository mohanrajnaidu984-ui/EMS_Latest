const options = [
    { ID: 360, itemName: "Civil Project", customerName: "Nass Contracting", leadJobName: "Civil Project", price: 90001 },
    { ID: 362, itemName: "Civil Project", customerName: "KARTEC SERVICES WLL", leadJobName: "Civil Project", price: 90000 }
];

const activeCustomer = "Nass Contracting";
const activeLead = "civilproject";

const normalize = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const sorted = [...options].sort((a, b) => {
    const aHasPrice = a.price !== null;
    const bHasPrice = b.price !== null;

    const aLeadMatch = activeLead && normalize(a.leadJobName) === activeLead;
    const bLeadMatch = activeLead && normalize(b.leadJobName) === activeLead;

    const aCustMatch = normalize(a.customerName) === normalize(activeCustomer);
    const bCustMatch = normalize(b.customerName) === normalize(activeCustomer);

    if (aHasPrice && !bHasPrice) return -1;
    if (!aHasPrice && bHasPrice) return 1;

    if (aLeadMatch && !bLeadMatch) return -1;
    if (!aLeadMatch && bLeadMatch) return 1;

    if (aCustMatch && !bCustMatch) return -1;
    if (!aCustMatch && bCustMatch) return 1;

    return 0;
});

console.log('Sorted Results:');
sorted.forEach(o => console.log(`ID: ${o.ID}, Price: ${o.price}, Lead: ${o.leadJobName}, Cust: ${o.customerName}`));
