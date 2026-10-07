// ساخت docx حداقلی با JSZip، ذخیره در requests/ و ارسال ایمیل
async function buildDocx(name,text,date){const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
 const rpr='<w:rPr><w:rFonts w:ascii="B Nazanin" w:hAnsi="B Nazanin" w:cs="B Nazanin"/><w:color w:val="000000"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:rtl/></w:rPr>';
 const p=s=>`<w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr><w:r>${rpr}<w:t xml:space="preserve">${esc(s)}</w:t></w:r></w:p>`;
 const body=[`فرستنده: ${name}`,`تاریخ: ${date}`,'',...text.split('\n')].map(p).join('');
 const z=new JSZip();z.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 z.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 z.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
 return z.generateAsync({type:'base64'})}
async function sendRequest(name,text){const date=JD.today();const b64=await buildDocx(name,text,date);const fn=`${CFG.reqDir}/${date.replace(/\//g,'-')}_${Date.now()}.docx`;
 await GH.put(fn,b64,'درخواست جدید از '+name);
 const r=await fetch('https://formsubmit.co/ajax/'+CFG.mailTo,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({_subject:'درخواست/پیشنهاد جدید - تعاونی مپنا هوایی',name,date,message:text})});
 if(!r.ok)throw new Error('ارسال ایمیل ناموفق بود')}
