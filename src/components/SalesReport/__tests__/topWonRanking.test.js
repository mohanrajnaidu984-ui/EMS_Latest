import { describe,expect,it } from 'vitest';
import { buildTopWonRows } from '../topWonRanking';
describe('scoped Top 10 won ranking',()=>{
    const rows=[{ProjectName:'Project A',CustomerName:'Customer A',ClientName:'Client A',JobValue:100,Status:'Won'},
        {ProjectName:'Project A',CustomerName:'Customer B',ClientName:'Client A',JobValue:200,Status:'Won'},
        {ProjectName:'Project B',CustomerName:'Customer A',ClientName:'Client B',JobValue:500,Status:'Won'},
        {ProjectName:'Not won',CustomerName:'Customer A',ClientName:'Client A',JobValue:9000,Status:'Lost'}];
    it('ranks projects by combined booked lines and retains related names',()=>{
        const result=buildTopWonRows(rows,'Project');expect(result.map(r=>r.value)).toEqual([500,300]);
        expect(result[1].customer).toBe('1. Customer A (100.00)\n2. Customer B (200.00)');
    });
    it('groups customer and client bookings independently',()=>{
        const customers=buildTopWonRows(rows,'Customer');expect(customers[0].value).toBe(600);expect(customers[0].project).toBe('1. Project A (100.00)\n2. Project B (500.00)');
        expect(buildTopWonRows(rows,'Client')[0].client).toBe('Client B (500.00)');
    });
    it('sums repeated names within the selected group, not across unrelated groups',()=>{
        const extra=[...rows,{ProjectName:'Project A',CustomerName:'Customer A',ClientName:'Client A',JobValue:50,Status:'Won'}];
        const customer=buildTopWonRows(extra,'Customer')[0];
        expect(customer.value).toBe(650);
        expect(customer.project).toBe('1. Project A (150.00)\n2. Project B (500.00)');
        expect(customer.client).toBe('1. Client A (150.00)\n2. Client B (500.00)');
        expect(buildTopWonRows(extra,'Project').find(r=>r.value===350).customer).toBe('1. Customer A (150.00)\n2. Customer B (200.00)');
    });
    it('appends divisions to single and multi-project lists and keeps each project total correct',()=>{
        const data=[{ProjectName:'P1',ClientName:'Client',Division:'HVAC',JobValue:100},
            {ProjectName:'P1',ClientName:'Client',Division:'Electrical',JobValue:50},
            {ProjectName:'P2',ClientName:'Client',Division:'Civil',JobValue:200}];
        expect(buildTopWonRows(data,'Client')[0].project).toBe('1. P1 (150.00) - Electrical, HVAC\n2. P2 (200.00) - Civil');
        expect(buildTopWonRows(data,'Project')[0].project).toBe('P2 (200.00) - Civil');
    });
    it('limits the ranking to ten and does not fabricate missing entity names',()=>{
        const many=Array.from({length:15},(_,i)=>({ProjectName:`P${i}`,JobValue:i+1}));
        expect(buildTopWonRows(many)).toHaveLength(10);expect(buildTopWonRows(many)[0].value).toBe(15);
        expect(buildTopWonRows(many,'Customer')).toEqual([]);
    });
});
