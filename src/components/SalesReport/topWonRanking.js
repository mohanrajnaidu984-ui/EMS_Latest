export function formatTopWonValue(value) {
    const amount=Number(value)||0;
    if(Math.abs(amount)>=1000000)return (amount/1000000).toFixed(2)+'M';
    if(Math.abs(amount)>=1000)return (amount/1000).toFixed(2)+'k';
    return amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}

export function buildTopWonRows(rows, mode = 'Project', limit = 10) {
    const field = { Project: 'ProjectName', Customer: 'CustomerName', Client: 'ClientName' }[mode] || 'ProjectName';
    const groups = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        if (row.Status && String(row.Status).trim().toLowerCase() !== 'won') continue;
        const name = String(row[field] || '').trim();
        const value = Number(row.JobValue);
        if (!name || name === '—' || !Number.isFinite(value)) continue;
        const key = name.toLocaleLowerCase('en');
        if (!groups.has(key)) groups.set(key, { key, name, value: 0, projects: new Map(), customers: new Map(), clients: new Map() });
        const group = groups.get(key);
        group.value += value;
        for (const [collection, column] of [['projects','ProjectName'], ['customers','CustomerName'], ['clients','ClientName']]) {
            const label = String(row[column] || '').trim();
            if (label && label !== '—') {
                const labelKey=label.toLocaleLowerCase('en');
                const item=group[collection].get(labelKey)||{name:label,value:0};
                item.value+=value;
                if(collection==='projects') {
                    const division=String(row.Division||row.OwnJob||'').trim();
                    if(!item.divisions)item.divisions=new Map();
                    if(division)item.divisions.set(division.toLocaleLowerCase('en'),division);
                }
                group[collection].set(labelKey,item);
            }
        }
    }
    const names = (values,showDivision=false) => {
        const list=[...values.values()].sort((a,b)=>a.name.localeCompare(b.name));
        return list.map((item,index)=>{
            const divisions=showDivision&&item.divisions?[...item.divisions.values()].sort((a,b)=>a.localeCompare(b)):[];
            return (list.length>1?(index+1)+'. ':'')+item.name+' ('+formatTopWonValue(item.value)+')'+(divisions.length?' - '+divisions.join(', '):'');
        }).join('\n') || '—';
    };
    return [...groups.values()].filter(group => group.value > 0)
        .sort((a,b) => b.value-a.value || a.name.localeCompare(b.name))
        .slice(0, limit).map((group,index) => ({ rank:index+1, key:group.key, value:group.value,
            project:names(group.projects,true), customer:names(group.customers), client:names(group.clients) }));
}
