import { ExcelJS, CELL_FONT, THIN_BORDER, setupEmsExcelReportHeader, enableEmsExcelAutoFilter, downloadExcelBlob } from '../../utils/emsExcelWorkbook';
export async function downloadTopWonXlsx({rows,mode,url}) {
    const params=new URL(url,window.location.origin).searchParams;
    const columns=[{key:'rank',header:'SL',width:7,type:'number'},{key:'value',header:'Job Value',width:20,type:'number'},
        {key:'project',header:'Project Name',width:45,type:'text'},{key:'customer',header:'Customer Name',width:45,type:'text'},{key:'client',header:'Client Name',width:45,type:'text'}];
    const workbook=new ExcelJS.Workbook();workbook.creator='EMS Sales Report';
    const sheet=workbook.addWorksheet(`Top 10 ${mode}`);
    const meta=[`Year: ${params.get('year')}`,`Grouped by: ${mode}`,...['company','division','role'].map(key=>`${key}: ${params.getAll(key).join(', ')||'All permitted'}`)].join(' | ');
    const {headerRowIndex,dataStartRow}=await setupEmsExcelReportHeader(workbook,sheet,{lastCol:5,title:`Sales Report | Top 10 Won ${mode}`,metaText:meta,columns});
    rows.forEach((row,index)=>columns.forEach((col,i)=>{
        const cell=sheet.getRow(dataStartRow+index).getCell(i+1);cell.value=row[col.key];cell.font=CELL_FONT;cell.border=THIN_BORDER;
        cell.alignment={vertical:'middle',horizontal:col.type==='number'?'right':'left',wrapText:true};
        if(col.key==='value')cell.numFmt='#,##0.00';
    }));
    columns.forEach((col,i)=>{sheet.getColumn(i+1).width=col.width;});
    enableEmsExcelAutoFilter(sheet,{headerRowIndex,lastCol:5,lastDataRow:dataStartRow+rows.length-1});
    const buffer=await workbook.xlsx.writeBuffer();downloadExcelBlob(buffer,`EMS_Top_10_Won_${mode}_${params.get('year')}.xlsx`);
}
