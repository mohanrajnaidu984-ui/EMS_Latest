import {describe,it,expect,vi,afterEach} from 'vitest';
import {canUseServerOutlook,downloadQuoteEmlDraft,openQuoteOutlookDraft} from '../quoteOutlookDraft.js';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('production quote email handoff',()=>{
 it('never uses remote server COM for a workstation draft',()=>{
  expect(canUseServerOutlook('',{hostname:'151.50.1.38',origin:'http://151.50.1.38'})).toBe(false);
  expect(canUseServerOutlook('http://151.50.1.38',{hostname:'localhost',origin:'http://localhost:5174'})).toBe(false);
  expect(canUseServerOutlook('',{hostname:'localhost',origin:'http://localhost:5174'})).toBe(true);
 });
 it('HTTP production downloads one embedded email draft without loopback, server COM or VBS',async()=>{
  vi.stubGlobal('window',{location:{hostname:'151.50.1.38',origin:'http://151.50.1.38'},isSecureContext:false});
  const fetchMock=vi.fn().mockResolvedValue(new Response('X-Unsent: 1\r\nTest MIME draft',{headers:{'Content-Type':'message/rfc822'}}));vi.stubGlobal('fetch',fetchMock);
  const download=vi.fn();const attachment={filename:'notes.txt',base64:'bm90ZXM='};
  const result=await openQuoteOutlookDraft({apiBase:'',pdfBlob:new Blob(['%PDF-'+'.'.repeat(250)]),displayFileName:'Quote_123.pdf',emailFields:{userEmail:'user@example.invalid',to:'customer@example.invalid',subject:'Quotation',body:'Please review',extraAttachments:[attachment]},triggerBlobDownload:download,blobToBase64:async()=>'A'.repeat(300)});
  expect(result).toMatchObject({ok:true,method:'eml-download',reason:'https-required',fileName:'Quote_123.eml'});
  expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0][0]).toBe('/api/quotes/email-draft');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({userEmail:'user@example.invalid',extraAttachments:[attachment]});
  expect(download).toHaveBeenCalledTimes(1);expect(download.mock.calls[0][1]).toBe('Quote_123.eml');
 });
 it('does not report success or download HTML/error responses as email',async()=>{
  const download=vi.fn();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}})));
  await expect(downloadQuoteEmlDraft('',{},download)).rejects.toThrow('unexpected email draft');expect(download).not.toHaveBeenCalled();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Cannot build draft'}),{status:500,headers:{'Content-Type':'application/json'}})));
  await expect(downloadQuoteEmlDraft('',{},download)).rejects.toThrow('Cannot build draft');expect(download).not.toHaveBeenCalled();
 });
});
