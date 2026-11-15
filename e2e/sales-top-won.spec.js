import {test,expect} from '@playwright/test';
import ExcelJS from 'exceljs';
test('scoped Top 10 Won ranks by project, customer and client below a compact pipeline',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
        const user={email:'top10@example.com',EmailId:'top10@example.com',FullName:'Top Ten User',role:'admin'};
        sessionStorage.setItem('currentUser',JSON.stringify(user));sessionStorage.setItem('currentUserEmail',user.email);
    });
    const jobs=[{RequestNo:1,ProjectName:'Project A',CustomerName:'Customer A',ClientName:'Client A',JobValue:100000,Status:'Won',Division:'Test Division'},
        {RequestNo:2,ProjectName:'Project B',CustomerName:'Customer A',ClientName:'Client B',JobValue:200000,Status:'Won',Division:'Test Division'},
        {RequestNo:3,ProjectName:'Project C',CustomerName:'Customer B',ClientName:'Client A',JobValue:250000,Status:'Won',Division:'Test Division'}];
    let wonRequests=0,accessRequests=0,summaryRequests=0,summaryFinished=false;
    await page.route('**/api/**',async route=>{
        const url=new URL(route.request().url());let json={};
        if(url.pathname==='/api/auth/profile')json={EmailId:'top10@example.com',FullName:'Top Ten User',Roles:'Admin'};
        if(url.pathname==='/api/sales-report/user-access-details'){accessRequests++;}if(url.pathname==='/api/sales-report/user-access-details')json={lockCompanyDivisionRole:false,lockRole:false};
        if(url.pathname==='/api/sales-report/filters')json={years:[2026],companies:['Test Co'],companyCurrencies:{'Test Co':'BHD'},divisions:['Test Division'],roles:['Test SE']};
        if(url.pathname==='/api/sales-report/summary'){summaryRequests++;}if(url.pathname==='/api/sales-report/summary')json={targetVsActual:[{name:'Q1',actual:550000,target:1000000}],grossMarginTargetVsActual:[{name:'Q1',actual:55000,target:100000}],winLoss:{wonValue:550000},probabilityFunnel:[]};
        if(url.pathname==='/api/sales-report/top-job-booked'){
            expect(url.searchParams.get('email')).toBe('top10@example.com');
            if(url.searchParams.get('topJobStatus')==='Won')wonRequests++;
            json={topJobBooked:jobs};
        }
        if(['/api/enquiry-items','/api/customers','/api/contacts','/api/users','/api/enquiries'].includes(url.pathname))json=[];
        if(url.pathname==='/api/sales-report/pipeline-pending')expect(summaryFinished).toBe(true);
        await route.fulfill({json});
        if(url.pathname==='/api/sales-report/summary')summaryFinished=true;
    });
    await page.goto('/e2e/harness/sales-top-won.html');
    const panel=page.getByRole('region',{name:'Top 10 won details'});
    await expect(panel.getByRole('columnheader')).toHaveText(['SL','Job Value','Project Name','Customer Name','Client Name']);
    await expect(panel.locator('tbody tr').first()).toContainText('Project C');
    await expect(panel.locator('tbody tr').first()).toContainText('250.00k');
    await expect(page.locator('.sr-cell-target-combined .recharts-label-list text')).toHaveText(['1.00M','550.00k']);
    await expect(page.locator('.sr-cell-gm-combined .recharts-label-list text')).toHaveText(['100.00k','55.00k']);
    const requestsBefore=wonRequests;
    await panel.getByRole('button',{name:'Customer',exact:true}).click();
    await expect(panel.locator('tbody tr').first()).toContainText('Customer A');
    await expect(panel.locator('tbody tr').first()).toContainText('300.00k');
    await panel.getByRole('button',{name:'Client',exact:true}).click();
    await expect(panel.locator('tbody tr').first()).toContainText('Client A');
    await expect(panel.locator('tbody tr').first()).toContainText('350.00k');
    expect(wonRequests).toBe(requestsBefore);
    for(const width of [1280,1600]){
        await page.setViewportSize({width,height:900});
        const box=await panel.boundingBox();const left=await page.locator('.sr-cell-table').boundingBox();
        expect(Math.abs(box.y-left.y)).toBeLessThanOrEqual(1);
        const firstChart=await page.locator('.sr-cell-won-combined').boundingBox();
        const thirdChart=await page.locator('.sr-cell-gm-combined').boundingBox();
        expect(Math.abs(left.width-(thirdChart.x+thirdChart.width-firstChart.x)*0.84)).toBeLessThan(2);
        expect(box.x).toBeGreaterThan(left.x+left.width);expect(box.height).toBeGreaterThan(200);
        await expect(page.locator('.sr-pipeline-summary')).toHaveCount(0);
        const pipeline=await page.locator('.sr-pipeline-top').boundingBox();expect(pipeline.height).toBeGreaterThan(300);
    }
    for (const [index,color] of [[0,'rgb(255, 255, 255)'],[1,'rgb(240, 244, 250)']]) {
        await expect(page.locator('.sr-detail-table tbody tr').nth(index).locator('td').first()).toHaveCSS('background-color',color);
    }
    expect(Number(await panel.getByRole('separator',{name:'Resize Job Value column'}).getAttribute('aria-valuenow'))).toBeLessThan(90);
    const separator=panel.getByRole('separator',{name:'Resize Project Name column'});
    const before=Number(await separator.getAttribute('aria-valuenow'));
    const handle=await separator.boundingBox();
    await page.mouse.move(handle.x+3,handle.y+6);await page.mouse.down();await page.mouse.move(handle.x+43,handle.y+6);await page.mouse.up();
    await expect(separator).toHaveAttribute('aria-valuenow',String(before+40));
    await panel.getByRole('button',{name:'Expand Top 10 table'}).click();
    await expect(page.locator('.sr-cell-table')).toBeHidden();
    expect((await panel.boundingBox()).width).toBeGreaterThan(1200);
    await expect.poll(()=>panel.locator('.sr-top-won-table-wrap').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
    await expect(panel.locator('tbody tr').first().locator('td').nth(2)).toContainText('1. Project A (100.00k)');
    await expect(panel.locator('tbody tr').first().locator('td').nth(2)).toContainText('2. Project C (250.00k)');
    await expect(panel.locator('tbody tr').first().locator('td').first()).toHaveCSS('vertical-align','middle');
    await expect(panel.locator('tbody tr').first().locator('td').nth(2).locator('strong').first()).toHaveCSS('font-weight','700');
    await expect(panel.locator('tbody tr').first().locator('td').nth(4)).toContainText('Client A (350.00k)');
    await page.screenshot({path:'test-results/sales-top-won-expanded.png'});
    const downloading=page.waitForEvent('download');
    await panel.getByRole('button',{name:'Export Top 10 to Excel'}).click();
    const download=await downloading;
    expect(download.suggestedFilename()).toContain('EMS_Top_10_Won_Client_');
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(await download.path());
    const sheet=workbook.worksheets[0];
    expect(sheet.getCell('B4').value).toBe(350000);expect(sheet.getCell('E4').value).toBe('Client A (350.00k)');expect(sheet.getCell('C4').value).toBe('1. Project A (100.00k) - Test Division\n2. Project C (250.00k) - Test Division');expect(sheet.getCell('C4').alignment.vertical).toBe('middle');
    await page.keyboard.press('Escape');await expect(page.locator('.sr-cell-table')).toBeVisible();
    await page.screenshot({path:'test-results/sales-top-won.png'});
    expect(accessRequests).toBe(1);
    expect(summaryRequests).toBe(1);
    expect(errors).toEqual([]);
});
