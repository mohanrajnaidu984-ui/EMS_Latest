import {build} from 'vite';
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();const dir='e2e/artifacts/editor-production';
if(!process.env.EMS_EDITOR_SKIP_BUILD)await build({build:{outDir:dir,emptyOutDir:true,rollupOptions:{input:'e2e/harness/clause-editor.html'}}});
const browser=await chromium.launch({headless:true});const results={errors:[],checks:[]};
try{
 const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('[EMS]'))results.errors.push(m.text());});
 await page.route('http://ems-editor.test/**',async route=>{const url=new URL(route.request().url());const rel=url.pathname==='/'?'/e2e/harness/clause-editor.html':url.pathname;const file=path.join(root,dir,rel);if(!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':undefined});});
 await page.goto('http://ems-editor.test/');await page.locator('.jodit-wysiwyg').waitFor();await page.waitForTimeout(1500);
 const evalEditor=fn=>page.evaluate(fn);
 results.context=await page.evaluate(()=>({secure:isSecureContext,clipboardAPI:!!navigator.clipboard}));
 const selectRow=async()=>evalEditor(()=>{const root=document.querySelector('.jodit-wysiwyg');const j=document.querySelector('.clause-editor-wrapper').__emsPasteCaptureJodit;window.testEditor=j;root.focus();const cells=[...root.querySelectorAll('tr')[1].cells];const r=document.createRange();r.selectNodeContents(cells[0]);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);j.__emsActiveTableCell=cells[0];j.__emsFormatTableCells=cells;j.__emsSplitTableCells=cells;cells.forEach(c=>c.classList.add('ems-table-cell-selected'));});
 await selectRow();
 await page.evaluate(()=>{window.clipboardTrace=[];for(const name of ['keydown','copy','paste'])document.addEventListener(name,e=>{window.clipboardTrace.push({type:name,key:e.key,target:e.target.className,active:document.activeElement?.className,trusted:e.isTrusted});},true);});
 await page.keyboard.press('Control+c');
 const sink=await page.context().newPage();await sink.setContent('<textarea aria-label="clipboard destination"></textarea>');await sink.getByRole('textbox').click();await sink.keyboard.press('Control+v');
 const clipboardValue=await sink.getByRole('textbox').inputValue();await sink.close();await page.bringToFront();
 results.checks.push({name:'native-system-clipboard-on-http',passed:clipboardValue.includes('Patch panel\t2\t27.340'),actual:clipboardValue,trace:await page.evaluate(()=>window.clipboardTrace)});
 await selectRow();
 results.checks.push(await evalEditor(()=>{const j=window.testEditor;const root=j.editor;const e=new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true,cancelable:true});root.dispatchEvent(e);return {name:'row-copy-allows-native-copy-event',passed:!e.defaultPrevented};}));
 await selectRow();
 results.checks.push(await evalEditor(()=>{const dt=new DataTransfer();const e=new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:dt});window.testEditor.editor.dispatchEvent(e);return {name:'copy-event-writes-rich-table',passed:dt.getData('text/html').includes('Patch panel')&&dt.getData('text/html').includes('<table'),html:dt.getData('text/html'),plain:dt.getData('text/plain'),handled:e.defaultPrevented};}));
 results.checks.push(await evalEditor(() => {
     const editor = window.testEditor;
     const paragraph = editor.editor.querySelector('p');
     const range = document.createRange();
     range.selectNodeContents(paragraph);
     getSelection().removeAllRanges();
     getSelection().addRange(range);
     // Dispatch before the asynchronous selection-change handler clears the previous row.
     const event = new ClipboardEvent('copy', {
         bubbles: true, cancelable: true, clipboardData: new DataTransfer(),
     });
     paragraph.dispatchEvent(event);
     const copiedText = event.clipboardData.getData('text/plain');
     return {
         name: 'paragraph-copy-takes-precedence-over-stale-row',
         passed: copiedText === paragraph.textContent,
         actual: copiedText,
     };
 }));
 // A genuine external copy after an internal table copy must win over cached HTML.
 results.checks.push(await evalEditor(()=>{const j=window.testEditor;const cell=j.editor.querySelectorAll('tr')[2].cells[0];j.__emsFormatTableCells=[];j.__emsSplitTableCells=[];j.editor.querySelectorAll('.ems-table-cell-selected').forEach(c=>c.classList.remove('ems-table-cell-selected'));j.__emsActiveTableCell=cell;const r=document.createRange();r.selectNodeContents(cell);getSelection().removeAllRanges();getSelection().addRange(r);const dt=new DataTransfer();dt.setData('text/plain','Fresh external text');cell.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));return {name:'external-text-wins-over-old-table-copy',passed:cell.textContent==='Fresh external text',actual:cell.textContent};}));
 await page.keyboard.press('Control+z');
 results.checks.push(await evalEditor(()=>({name:'undo-cell-paste',passed:window.testEditor.editor.querySelectorAll('tr')[2].cells[0].textContent==='Cable'})));
 await page.keyboard.press('Control+y');
 results.checks.push(await evalEditor(()=>({name:'redo-cell-paste',passed:window.testEditor.editor.querySelectorAll('tr')[2].cells[0].textContent==='Fresh external text'})));
 await page.locator('.jodit-wysiwyg tr').nth(2).locator('td').nth(2).click();await page.keyboard.press('End');await page.keyboard.type('7');
 await page.locator('.jodit-wysiwyg > p').last().click();await page.keyboard.press('End');await page.keyboard.type('X');
 await page.keyboard.press('Control+z');
 results.checks.push(await evalEditor(()=>({name:'undo-text-before-earlier-table-edit',passed:window.testEditor.editor.querySelector('p:last-child').textContent==='After table'&&window.testEditor.editor.querySelectorAll('tr')[2].cells[2].textContent.endsWith('7')})));
 await page.keyboard.press('Control+z');
 results.checks.push(await evalEditor(()=>({name:'undo-table-typing-in-chronological-order',passed:window.testEditor.editor.querySelectorAll('tr')[2].cells[2].textContent==='10.420'})));
 const formatBefore=await evalEditor(()=>{const j=window.testEditor;const p=j.editor.querySelector('p');j.__emsActiveTableCell=null;j.__emsFormatTableCells=[];j.__emsSplitTableCells=[];const r=document.createRange();r.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(r);return p.innerHTML;});
 await page.keyboard.press('Control+b');
 const formatAfter=await evalEditor(()=>window.testEditor.editor.querySelector('p').innerHTML);
 results.checks.push({name:'format-ordinary-paragraph',passed:formatBefore!==formatAfter});
 await page.keyboard.press('Control+z');
 results.checks.push({name:'undo-paragraph-format',passed:await evalEditor(()=>window.testEditor.editor.querySelector('p').innerHTML)===formatBefore});
 await page.keyboard.press('Control+y');
 results.checks.push({name:'redo-paragraph-format',passed:await evalEditor(()=>window.testEditor.editor.querySelector('p').innerHTML)===formatAfter});
 // Paste a complete Word/Excel-style table after the original, then undo it.
 await page.locator('.jodit-wysiwyg > p').last().click();await page.keyboard.press('End');
 await evalEditor(()=>{const dt=new DataTransfer();dt.setData('text/html','<table style="border-collapse:collapse;width:450px"><thead><tr><th style="background:#123456;color:white">External item</th><th>Amount</th></tr></thead><tbody><tr><td rowspan="2"><strong>Office paste</strong></td><td>12.340</td></tr><tr><td>5.600</td></tr></tbody></table>');dt.setData('text/plain','External item\tAmount\nOffice paste\t12.340\n\t5.600');window.testEditor.editor.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));});
 await page.waitForTimeout(1200);
 results.checks.push(await evalEditor(()=>({name:'whole-office-table-paste-preserves-structure',passed:window.testEditor.editor.querySelectorAll('table').length===2&&!!window.testEditor.editor.querySelector('td[rowspan="2"] strong')})));
 await page.keyboard.press('Control+z');await page.waitForTimeout(150);
 results.checks.push(await evalEditor(()=>({name:'undo-whole-table-paste',passed:window.testEditor.editor.querySelectorAll('table').length===1})));
 await page.keyboard.press('Control+Shift+z');
 results.checks.push(await evalEditor(()=>({name:'redo-whole-table-paste',passed:window.testEditor.editor.querySelectorAll('table').length===2})));
 // Explicit row commands must also create one reversible structural step.
 await page.locator('.jodit-wysiwyg table').first().locator('td').first().click();
 await evalEditor(()=>{const j=window.testEditor;j.execCommand('emsCopyRow');j.execCommand('emsPasteRow');});
 results.checks.push(await evalEditor(()=>({name:'paste-row-command',passed:window.testEditor.editor.querySelector('table').rows.length===4})));
 await page.keyboard.press('Control+z');
 results.checks.push(await evalEditor(()=>({name:'undo-row-command',passed:window.testEditor.editor.querySelector('table').rows.length===3})));
 await page.locator('.jodit-wysiwyg table').first().locator('td').first().click();
 await evalEditor(()=>{const j=window.testEditor;j.execCommand('emsCopyColumn');j.execCommand('emsPasteColumn');});
 results.checks.push(await evalEditor(()=>({name:'paste-column-command',passed:window.testEditor.editor.querySelector('table').rows[0].cells.length===4})));
 await page.keyboard.press('Control+z');
 results.checks.push(await evalEditor(()=>({name:'undo-column-command',passed:window.testEditor.editor.querySelector('table').rows[0].cells.length===3})));
 await selectRow();
 await page.keyboard.press('Control+x');
 results.checks.push(await evalEditor(()=>({name:'cut-row-native-event',passed:window.testEditor.editor.querySelector('table').rows.length===2})));
 await page.keyboard.press('Control+z');
 results.checks.push(await evalEditor(()=>({name:'undo-cut-row',passed:window.testEditor.editor.querySelector('table').rows.length===3})));
 for(const [name,html,plain,needle] of [
  ['description-amount-table','<table><tr><td>Quoted item</td><td>12.340</td></tr></table>','Quoted item\t12.340','Quoted item'],
  ['narrow-quantity-table','<table><tr><td width="30">2</td><td>56.000</td></tr></table>','2\t56.000','56.000'],
  ['single-cell-decimal-table','<table><tr><td>12.340</td></tr></table>','12.340','12.340'],
 ]){
  const before=await page.locator('.jodit-wysiwyg table').count();
  await page.evaluate(({html,plain})=>{const j=window.testEditor;const root=j.editor;j.__emsActiveTableCell=null;j.__emsFormatTableCells=[];j.__emsSplitTableCells=[];root.focus();const r=document.createRange();r.selectNodeContents(root);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);const dt=new DataTransfer();dt.setData('text/html',html);dt.setData('text/plain',plain);root.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));},{html,plain});
  await page.waitForTimeout(1000);
  results.checks.push({name:`preserve-${name}`,passed:await page.locator('.jodit-wysiwyg table').count()===before+1&&(await page.locator('.jodit-wysiwyg table').last().innerText()).includes(needle)});
  const historyBefore=await page.evaluate(()=>({undo:window.testEditor.__emsDocHist?.undo.map(x=>(x.html.match(/<table\b/g)||[]).length),pending:!!window.testEditor.__emsDocHistPending,active:document.activeElement.className}));
  await page.keyboard.press('Control+z');results.checks.push({name:`undo-${name}`,passed:await page.locator('.jodit-wysiwyg table').count()===before,expected:before,actual:await page.locator('.jodit-wysiwyg table').count(),historyBefore});
 }
 await page.goto('http://ems-editor.test/?clipboard-layout');
 const liveEditor = page.locator('.jodit-wysiwyg');
 await liveEditor.waitFor();
 await page.waitForTimeout(350);
 await page.locator('#root').evaluate(el => {
     el.classList.add('quote-preview-zoom-shell');
     el.style.setProperty('--quote-preview-zoom', '1.2');
     el.style.transformOrigin = 'top left';
     el.style.transform = 'scale(1.2)';
     const table = el.querySelector('.jodit-wysiwyg table');
     table.style.setProperty('margin-inline', 'auto', 'important');
     table.rows[1].style.setProperty('height', '37.625px', 'important');
 });
 const readTables = (scope = liveEditor) => scope.evaluate(root => [...root.querySelectorAll('table')].map(table => ({
     markup: table.outerHTML.replace(/ class=""/g, ''),
     outer: table.getBoundingClientRect().width,
     left: table.getBoundingClientRect().left - root.getBoundingClientRect().left,
     widths: [...table.rows[0].cells].map(cell => cell.getBoundingClientRect().width),
     heights: [...table.rows].map(row => row.getBoundingClientRect().height),
     offsets: [...table.rows[0].cells].map(cell => cell.getBoundingClientRect().left - table.getBoundingClientRect().left),
     colors: [...table.querySelectorAll('td, th, strong')].map(el => getComputedStyle(el).color),
     fonts: [...table.querySelectorAll('td, th, strong')].map(el => getComputedStyle(el).fontFamily),
     fills: [...table.querySelectorAll('td, th')].map(el => getComputedStyle(el).backgroundColor),
     formatting: [...table.querySelectorAll('td, th, strong')].map(el => {
         const css = getComputedStyle(el);
         return [css.fontWeight, css.textAlign, css.verticalAlign, css.borderRight, css.borderBottom];
     }),
     cells: [...table.rows].map(row => [...row.cells].map(cell => [cell.textContent, cell.colSpan, cell.rowSpan])),
 })));
 const [source] = await readTables();
 results.checks.push({
     name: 'office-table-white-text-only-in-header',
     passed: source.colors[0] === 'rgb(255, 255, 255)' && source.colors[5] !== 'rgb(255, 255, 255)' &&
         source.colors[7] === 'rgb(148, 82, 20)',
     colors: source.colors,
 });
 await liveEditor.evaluate(root => {
     const editor = root.closest('.clause-editor-wrapper').__emsPasteCaptureJodit;
     const cells = [...root.querySelectorAll('td, th')];
     root.focus();
     const range = document.createRange();
     range.selectNodeContents(cells[0]);
     range.collapse(true);
     getSelection().removeAllRanges();
     getSelection().addRange(range);
     editor.__emsActiveTableCell = cells[0];
     editor.__emsFormatTableCells = cells;
     editor.__emsSplitTableCells = cells;
     cells.forEach(cell => cell.classList.add('ems-table-cell-selected'));
 });
 await page.keyboard.press('Control+c');
 await liveEditor.locator('> p').last().click();
 await page.keyboard.press('End');
 await page.keyboard.press('Control+v');
 await liveEditor.locator('table').nth(1).waitFor({ timeout: 5000 });
 await page.waitForTimeout(350);
 const [original, pasted] = await readTables();
 const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
 const geometry = table => [table.outer, table.left, ...table.widths, ...table.heights, ...table.offsets];
 const sameSize = (a, b) => a.length === b.length && a.every((px, i) => Math.abs(px - b[i]) < 0.005);
 results.checks.push(
     { name: 'internal-table-paste-leaves-source-untouched', passed: original.markup === source.markup, original: original.colors },
     { name: 'internal-table-paste-matches-color-font-fill-and-content', passed: ['colors', 'fonts', 'fills', 'formatting', 'cells'].every(key => equal(source[key], pasted[key])), expected: source.formatting, actual: pasted.formatting },
     { name: 'internal-table-paste-matches-exact-edges-and-row-heights-at-120-percent', passed: sameSize(geometry(source), geometry(pasted)), expected: geometry(source), actual: geometry(pasted) },
 );
 const previewTypography = await page.locator('#saved-preview table').nth(1).evaluate(table =>
     [...table.querySelectorAll('td, th, strong')].map(el => [getComputedStyle(el).color, getComputedStyle(el).fontFamily]));
 results.checks.push({
     name: 'pasted-cell-color-and-font-survive-preview-sanitization',
     passed: previewTypography.length === source.colors.length && previewTypography.every(([color, font], i) => color === source.colors[i] && font === source.fonts[i]),
 });
 await page.keyboard.press('Control+z');
 results.checks.push({ name: 'undo-exact-internal-table-paste', passed: await liveEditor.locator('table').count() === 1 });
 await page.keyboard.press('Control+y');
 results.checks.push({ name: 'redo-exact-internal-table-paste', passed: await liveEditor.locator('table').count() === 2 });
 await liveEditor.evaluate(root => {
     root.focus();
     const range = document.createRange();
     range.selectNodeContents(root);
     getSelection().removeAllRanges();
     getSelection().addRange(range);
 });
 await page.locator('#ems-quote-preview-toolbar [data-ref="font"] .jodit-toolbar-select__trigger').click();
 await page.locator('.jodit-popup:visible').last().getByText('Arial', { exact: true }).click();
 const arial = /^"?Arial\b/i;
 await page.waitForTimeout(350);
 const fontAfter = await page.locator('#saved-preview').evaluate(root => {
     const familyOf = text => {
         const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
         while (walker.nextNode()) {
             if (walker.currentNode.textContent.trim() === text) {
                 return getComputedStyle(walker.currentNode.parentElement).fontFamily;
             }
         }
         return '';
     };
     return ['Before table', 'After table', 'JCI', 'T7700-TF60-9MS'].map(familyOf);
 });
 results.checks.push({ name: 'change-font-across-paragraphs-and-table-in-preview', passed: fontAfter.every(family => arial.test(family)) && (await readTables()).every(table => equal(table.cells, source.cells)), fonts: fontAfter });
 await page.goto('http://ems-editor.test/?edit-exit');
 await liveEditor.waitFor();
 await page.waitForTimeout(350);
 async function dragText(locator, length) {
     await locator.scrollIntoViewIfNeeded();
     const bounds = await locator.evaluate((el, length) => {
         const range = document.createRange();
         const text = el.firstChild;
         range.setStart(text, 0);
         range.setEnd(text, length);
         const { left, right, top, height } = range.getBoundingClientRect();
         return { left, right, y: top + height / 2 };
     }, length);
     await page.mouse.move(bounds.left + 1, bounds.y);
     await page.mouse.down();
     await page.mouse.move(bounds.right - 1, bounds.y, { steps: 8 });
     await page.mouse.up();
     return page.evaluate(() => getSelection().toString());
 }
 const selectedProse = await dragText(liveEditor.getByText('Before table', { exact: true }), 6);
 const selectedCell = await dragText(liveEditor.getByText('Control panel', { exact: false }).first(), 7);
 results.checks.push(
     { name: 'native-drag-selects-quote-paragraph', passed: selectedProse === 'Before', actual: selectedProse },
     { name: 'native-drag-selects-text-inside-boq-cell', passed: selectedCell === 'Control', actual: selectedCell },
 );
 const checkPaint = () => page.locator('#quote-preview table').evaluateAll(tables => tables.map(table => ({
     header: getComputedStyle(table.rows[0].cells[0]).color,
     body: getComputedStyle(table.rows[1].cells[2]).color,
     blue: getComputedStyle(table.rows[1].cells[4]).backgroundColor,
     strong: getComputedStyle(table.querySelector('strong')).color,
 })));
 const [paintBefore] = await checkPaint();
 await liveEditor.evaluate(root => {
     const editor = root.closest('.clause-editor-wrapper').__emsPasteCaptureJodit;
     const cells = [...root.querySelectorAll('td, th')];
     root.focus();
     const range = document.createRange();
     range.selectNodeContents(cells[0]);
     range.collapse(true);
     getSelection().removeAllRanges();
     getSelection().addRange(range);
     editor.__emsActiveTableCell = cells[0];
     editor.__emsFormatTableCells = cells;
     editor.__emsSplitTableCells = cells;
     cells.forEach(cell => cell.classList.add('ems-table-cell-selected'));
 });
 await page.keyboard.press('Control+c');
 await liveEditor.getByText('After table', { exact: true }).click();
 await page.keyboard.press('End');
 await page.keyboard.press('Control+v');
 await liveEditor.locator('table').nth(1).waitFor();
 await page.getByRole('button', { name: 'Exit edit' }).click();
 await page.locator('#quote-preview .clause-content table').nth(1).waitFor();
 const paintAfter = await checkPaint();
 const [previewSource, previewCopy] = await readTables(page.locator('#quote-preview .clause-content'));
 results.checks.push({
     name: 'internal-table-paste-matches-source-geometry-after-exit-edit',
     passed: sameSize(geometry(previewSource), geometry(previewCopy)),
     expected: geometry(previewSource), actual: geometry(previewCopy),
 });
 results.checks.push({
     name: 'source-and-copied-boq-paint-survives-exit-edit',
     passed: paintBefore.body === 'rgb(24, 36, 56)' && paintAfter.length === 2 &&
         paintAfter.every(paint => equal(paint, paintBefore)),
     expected: paintBefore,
     actual: paintAfter,
 });
 await page.getByRole('button', { name: 'Reopen edit' }).click();
 await liveEditor.locator('table').nth(1).waitFor();
 results.checks.push({ name: 'reopened-boq-keeps-preview-paint', passed: (await checkPaint()).every(paint => equal(paint, paintBefore)) });
 const headerCell = liveEditor.locator('th').first();
 const headerBox = await headerCell.boundingBox();
 const edgeX = headerBox.x + headerBox.width - 1;
 const edgeY = headerBox.y + headerBox.height / 2;
 await page.mouse.move(edgeX, edgeY);
 await page.mouse.down();
 await page.mouse.move(edgeX + 16, edgeY, { steps: 5 });
 await page.mouse.up();
 const widthAfterResize = (await headerCell.boundingBox()).width;
 results.checks.push({ name: 'column-border-still-resizes-after-text-selection-fix', passed: widthAfterResize > headerBox.width + 2, before: headerBox.width, after: widthAfterResize });
 fs.writeFileSync(`${dir}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));if(results.errors.length||results.checks.some(c=>!c.passed))process.exitCode=1;
}catch(error){results.failure=error.message;fs.writeFileSync(`${dir}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));process.exitCode=1;}finally{await browser.close();}
