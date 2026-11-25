import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import ExcelDownloadButton from '../shared/ExcelDownloadButton';
import { readJsonInFlight } from '../../utils/inflightApiJson';
import { buildTopWonRows } from './topWonRanking';
import './SalesTopWon.css';

const HEADERS=['SL','Job Value','Project Name','Customer Name','Client Name'];
const SHARES=[0.07,0.18*1.25,0.25*1.25,0.25*1.25,0.25*1.25];
export default function SalesTopWon({ url, formatValue, expanded=false, onToggleExpanded }) {
    const [mode,setMode]=useState('Project');
    const [result,setResult]=useState(null);
    const [panelWidth,setPanelWidth]=useState(280);
    const [manualWidths,setManualWidths]=useState({});
    const [expandedWidths,setExpandedWidths]=useState({});
    useEffect(()=>{if(expanded)setExpandedWidths({});},[expanded]);
    const [exporting,setExporting]=useState(false);
    const [exportError,setExportError]=useState('');
    const wrapRef=useRef(null),drag=useRef(null);
    const current=result?.url===url?result:null;
    const rows=useMemo(()=>buildTopWonRows(current?.rows,mode),[current,mode]);
    const jobValueFit=useMemo(()=>{
        const context=document.createElement('canvas').getContext('2d');
        if(!context)return 68;
        context.font='700 10px Inter, Arial, sans-serif';
        const labels=['Job Value',...rows.map(row=>String(formatValue?formatValue(row.value):row.value.toLocaleString('en-US')))];
        return Math.max(56,Math.ceil(Math.max(...labels.map(label=>context.measureText(label).width))+16));
    },[rows,formatValue]);
    const remaining=panelWidth-1-42-jobValueFit;
    const fitWidths=[42,jobValueFit,Math.round(remaining*0.45),Math.round(remaining*0.275),0];
    fitWidths[4]=panelWidth-1-fitWidths.slice(0,4).reduce((a,b)=>a+b,0);
    const widths=expanded ? fitWidths.map((width,index)=>expandedWidths[index]??width)
        : SHARES.map((share,index)=>manualWidths[index]??(index===1?jobValueFit:Math.round(panelWidth*share)));
    useLayoutEffect(()=>{
        const el=wrapRef.current;if(!el)return;
        const measure=()=>setPanelWidth(Math.max(280,Math.floor(el.clientWidth)));
        measure();const observer=new ResizeObserver(measure);observer.observe(el);
        return()=>observer.disconnect();
    },[]);
    useEffect(()=>{
        const move=e=>{const d=drag.current;if(d)(d.expanded?setExpandedWidths:setManualWidths)(prev=>({...prev,[d.index]:Math.max(d.index===0?22:50,d.width+e.clientX-d.x)}));};
        const end=()=>{drag.current=null;};
        window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
        return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);};
    },[]);
    useEffect(()=>{
        if(!expanded)return;
        const onKey=e=>{if(e.key==='Escape')onToggleExpanded?.();};
        window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
    },[expanded,onToggleExpanded]);
    useEffect(()=>{
        if(!url)return;
        let disposed=false;
        readJsonInFlight(url).then(response=>{
            if(!response.ok)throw new Error('Won ranking unavailable');
            if(!disposed)setResult({url,rows:response.data.topJobBooked||[]});
        }).catch(()=>{if(!disposed)setResult({url,error:true,rows:[]});});
        return()=>{disposed=true;};
    },[url]);
    const exportRows=async()=>{
        setExporting(true);setExportError('');
        try{const {downloadTopWonXlsx}=await import('./topWonExcel');await downloadTopWonXlsx({rows,mode,url});}
        catch{setExportError('Excel export failed. Please try again.');}
        finally{setExporting(false);}
    };
    return <section className="sr-cell sr-top-won card border-0 shadow-sm" aria-label="Top 10 (Booking) won details">
        <div className="sr-top-won-heading sr-report-table-title sr-report-table-title--toolbar">
            <strong>Top 10 (Booking)</strong>
            <div className="sr-top-won-buttons" role="group" aria-label="Rank won jobs by">
                {['Project','Customer','Client'].map(label=><button key={label} type="button" aria-pressed={mode===label} onClick={()=>setMode(label)}>{label}</button>)}
            </div>
            <div className="sr-top-won-tools no-print">
                <button type="button" className="sr-top-won-expand" aria-label={expanded?'Collapse Top 10 table':'Expand Top 10 table'} title={expanded?'Collapse table view':'Expand table view'} aria-expanded={expanded} onClick={onToggleExpanded}>
                    {expanded?<Minimize2 size={12}/>:<Maximize2 size={12}/>}</button>
                <ExcelDownloadButton onClick={exportRows} disabled={!rows.length||exporting} title="Export Top 10 to Excel" size={17} style={{width:25,minWidth:25,height:22,minHeight:22}}/>
            </div>
        </div>
        {exportError?<div className="sr-top-won-export-error" role="alert">{exportError}</div>:null}
        <div className="sr-top-won-table-wrap" ref={wrapRef} aria-busy={!current}>
            <table className="sr-top-won-table" style={{width:widths.reduce((a,b)=>a+b,0)}}>
                <caption className="visually-hidden">Top ten {mode.toLowerCase()} groups by combined won job value</caption>
                <colgroup>{widths.map((width,index)=><col key={index} style={{width}}/>)}</colgroup>
                <thead><tr>{HEADERS.map((name,index)=><th key={name} scope="col">{name}
                    <span role="separator" aria-orientation="vertical" aria-label={`Resize ${name} column`} aria-valuenow={widths[index]} tabIndex={0} className="sr-top-won-resize"
                        onPointerDown={e=>{e.preventDefault();drag.current={index,x:e.clientX,width:widths[index],expanded};}}
                        onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();(expanded?setExpandedWidths:setManualWidths)(prev=>({...prev,[index]:Math.max(index===0?22:50,widths[index]+(e.key==='ArrowRight'?10:-10))}));}}}/>
                </th>)}</tr></thead>
                <tbody>{!current||current.error||!rows.length?<tr><td colSpan={5} className="sr-top-won-message">{!current?'Loading won details…':current.error?'Could not load won details.':'No won jobs for the selected filters.'}</td></tr>:rows.map(row=><tr key={row.key}>
                    <td>{row.rank}</td><td className="sr-top-won-value" title={row.value.toLocaleString('en-US',{maximumFractionDigits:2})}>{formatValue?formatValue(row.value):row.value.toLocaleString('en-US')}</td>
                    {[row.project,row.customer,row.client].map((name,index)=><td key={index} title={name}><div className="sr-top-won-names">{name.split('\n').map((line,lineIndex)=>{
                        const match=line.match(/^(.*\s)(\(-?[\d,]+(?:\.\d+)?[kM]?\))(\s-\s.*)?$/);
                        return <div key={lineIndex}>{match?<>{match[1]}<strong className="sr-top-won-inline-value">{match[2]}</strong>{match[3]?<> - <span className="sr-top-won-inline-division">{match[3].slice(3)}</span></>:null}</>:line}</div>;
                    })}</div></td>)}
                </tr>)}</tbody>
            </table>
        </div>
    </section>;
}
