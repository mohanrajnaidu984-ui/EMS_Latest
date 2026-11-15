import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ClauseEditor from '../../src/components/Quote/ClauseEditor';
import { sanitizeQuoteRichHtml } from '../../src/components/Quote/quoteSanitizeHtml';
import { finalizeClauseHtmlForPersist } from '../../src/components/Quote/clauseEditorExportHtml';
import { CLAUSE_LIST_STYLES_CSS } from '../../src/components/Quote/clauseEditorListPresets';
import {
    EMS_OFFICE_PASTE_TABLE_PREVIEW_EDIT_CSS,
    EMS_OFFICE_PASTE_TABLE_PREVIEW_READ_CSS,
} from '../../src/components/Quote/clauseEditorTable';
import { buildQuotePrintDocumentHtml } from '../../src/components/Quote/quotePrintDocumentHtml';
import { buildQuotePackFontFaceCss, QUOTE_PACK_FONT_STACK } from '../../src/components/Quote/quotePackFonts';
import 'bootstrap/dist/css/bootstrap.min.css';
const params = new URLSearchParams(location.search);
const extraRows = params.has('large')
    ? Array.from({ length: 117 }, (_, i) => `<tr><td>BOQ item ${i + 1}</td><td>1</td><td>21.000</td></tr>`).join('')
    : '';
const outline = params.has('outline') ? '<p>2.4. Parent line</p><p>2.4.1. Sub item</p><p>2.4.2. Next sub item</p>' : '';
const description = params.has('boq-font')
    ? '<p><span>19&quot; UTP Modular Patch Panel, 1U, loaded with removable 24 x </span><strong>Key-Stone Module RJ45 UTP</strong><span>, 180-degree, Cat 6A</span></p>'
    : 'Patch panel';
const initial = `<p>Before table</p><table style="width:600px;border-collapse:collapse"><tbody><tr><th>Description</th><th>Qty</th><th>Amount</th></tr><tr><td>${description}</td><td>2</td><td>27.340</td></tr><tr><td>Cable</td><td>3</td><td>10.420</td></tr>${extraRows}</tbody></table><p>After table</p>${outline}`;
const legacyItemStyle = 'padding: 0 !important; margin: 0 !important';
const cellLists = `<table data-ems-paste-source="office" data-ems-col-widths="260,50,50,90" style="width:450px"><tbody><tr><td>
    <ul class="ems-bullet-check"><li style="${legacyItemStyle}">Control panel with an extended product description that wraps onto the next line</li><li>Pull cord</li></ul>
    <ol class="ems-num-decimal"><li style="${legacyItemStyle}">Installation<ol class="ems-num-decimal"><li style="${legacyItemStyle}">Cabinet<ol class="ems-num-decimal"><li>Mounting</li></ol></li></ol></li><li>Testing</li></ol>
    </td><td>1</td><td>No</td><td>198.737</td></tr></tbody></table>`;
const clipboardLayout = `<p>Before table</p><table data-ems-paste-source="office" style="width:475px">
    <colgroup><col width="42"><col width="288"><col width="53"><col width="49"><col width="43"></colgroup>
    <thead><tr style="height:31px"><th style="background:#555;color:white" data-ems-header-fg="light">Sl No</th><th style="background:#555;color:white">Description</th><th style="background:#555;color:white">Make</th><th style="background:#555;color:white">Unit</th><th style="background:#555;color:white">Qty</th></tr></thead>
    <tbody><tr style="height:69px"><td style="border:1px solid #222;text-align:center">1</td><td>Control panel <strong style="font-family:Georgia;color:#945214" data-ems-user-font="1">T7700-TF60-9MS</strong><br>LCD Push Button</td><td>JCI</td><td>No’s</td><td style="background-color:#1565c0;color:#fff">10</td></tr></tbody>
    </table><p>After table</p>`;

function CellListApp() {
    const toolbar = useRef(null);
    const [html, setHtml] = useState(cellLists);
    const previewHtml = sanitizeQuoteRichHtml(html);
    const printHtml = buildQuotePrintDocumentHtml(true, `<div class="clause-content">${previewHtml}</div>`, CLAUSE_LIST_STYLES_CSS, '', 'preview');
    return <>
        <div id="ems-quote-preview-toolbar" ref={toolbar}/>
        <div id="quote-preview">
            <style>{EMS_OFFICE_PASTE_TABLE_PREVIEW_EDIT_CSS + EMS_OFFICE_PASTE_TABLE_PREVIEW_READ_CSS}</style>
            <div className="quote-clause-inline-editor"><ClauseEditor html={html} onChange={setHtml} toolbarAnchorRef={toolbar}/></div>
            <div id="saved-preview" className="clause-content" dangerouslySetInnerHTML={{__html: previewHtml}}/>
        </div>
        <iframe title="Quote print fixture" srcDoc={printHtml}/>
    </>;
}

function App(){const toolbar=useRef(null);const [html,setHtml]=useState(params.has('clipboard-layout') ? clipboardLayout : initial);return <><div id="ems-quote-preview-toolbar" ref={toolbar}/><ClauseEditor html={html} onChange={setHtml} toolbarAnchorRef={toolbar}/><textarea aria-label="clipboard destination"/><output id="saved-html">{html}</output>{(params.has('boq-font') || params.has('clipboard-layout')) && <section id="saved-preview" dangerouslySetInnerHTML={{__html:sanitizeQuoteRichHtml(html)}}/>}</>;}

function FontRenderingApp() {
    const toolbar = useRef(null);
    const [html, setHtml] = useState('<p>Regular words beside selected text</p><table><tbody><tr><td>Wrapped cell sample</td><td>Unaffected</td></tr></tbody></table>');
    return <div id="quote-preview" style={{ fontFamily: QUOTE_PACK_FONT_STACK }}>
        <style>{buildQuotePackFontFaceCss()}</style>
        <div id="ems-quote-preview-toolbar" ref={toolbar}/>
        <ClauseEditor html={html} onChange={setHtml} toolbarAnchorRef={toolbar}/>
        <section id="saved-preview" className="clause-content" dangerouslySetInnerHTML={{__html: sanitizeQuoteRichHtml(html)}}/>
    </div>;
}

function ExitEditApp() {
    const toolbar = useRef(null);
    const [html, setHtml] = useState(params.has('column-resize')
        ? clipboardLayout + (params.has('internal-copy')
            ? clipboardLayout.replace('data-ems-paste-source="office"', 'data-ems-paste-source="office" data-ems-internal-table-clip="1" data-ems-col-widths-custom="1" data-ems-col-widths="42,288,53,49,43" data-ems-table-outer-width="475"')
            : clipboardLayout.replace('width:475px', 'width:510px'))
        : clipboardLayout.replace('<td>JCI</td>',
        '<td data-ems-header-fg="light" data-ems-cell-color="white" style="color:#182438 !important">JCI</td>'));
    const [editing, setEditing] = useState(true);
    const toggleEdit = () => {
        if (editing) {
            const live = document.querySelector('#quote-preview .jodit-wysiwyg');
            setHtml(finalizeClauseHtmlForPersist(live.innerHTML));
        }
        setEditing(!editing);
    };
    return <>
        <button onMouseDown={event => event.preventDefault()} onClick={toggleEdit}>{editing ? 'Exit edit' : 'Reopen edit'}</button>
        <div id="ems-quote-preview-toolbar" ref={toolbar}/>
        <div id="quote-preview" className={params.has('column-resize') ? 'quote-preview-zoom-shell' : undefined}
            style={params.has('column-resize') ? { '--quote-preview-zoom': Number(params.get('zoom') || 1), transform: `scale(${Number(params.get('zoom') || 1)})`, transformOrigin: 'top left', width: '750px' } : undefined}>
            <style>{EMS_OFFICE_PASTE_TABLE_PREVIEW_EDIT_CSS + EMS_OFFICE_PASTE_TABLE_PREVIEW_READ_CSS}</style>
            {editing
                ? <div className="quote-clause-inline-editor"><ClauseEditor html={html} onChange={setHtml} toolbarAnchorRef={toolbar}/></div>
                : <div className="clause-content" dangerouslySetInnerHTML={{__html:sanitizeQuoteRichHtml(html)}}/>}
        </div>
    </>;
}

createRoot(document.getElementById('root')).render(params.has('font-render') ? <FontRenderingApp/> : params.has('cell-lists') ? <CellListApp/> : params.has('edit-exit') ? <ExitEditApp/> : <App/>);
