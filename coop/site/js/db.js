// پایگاه داده: فایل اکسل در مخزن گیت‌هاب (SheetJS)
const DB={wb:null,m:[],pay:[],obl:[],
 async load(){const b=await GH.bytes(CFG.xlsx);this.wb=XLSX.read(b,{type:'array',cellDates:true});
  const rd=n=>XLSX.utils.sheet_to_json(this.wb.Sheets[n],{defval:''});
  this.m=rd('اعضا');this.pay=rd('واریزی‌ها');this.obl=rd('تعهدات');return this},
 find(id){return this.m.find(r=>String(r['کد ملی']).trim()===String(id).trim())},
 rowsOf(list,id){return list.filter(r=>String(r['کد ملی']).trim()===String(id).trim()).map(r=>({amt:r['مبلغ (ریال)'],date:JD.norm(r[Object.keys(r).find(k=>k.startsWith('تاریخ'))])})).sort((a,b)=>b.date.localeCompare(a.date))},
 async sha(t){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')},
 async save(msg){const ws=this.wb.Sheets['اعضا'];const out=XLSX.write(this.wb,{bookType:'xlsx',type:'base64'});await GH.put(CFG.xlsx,out,msg)},
 // نوشتن مقدار در سلول ستون مشخص برای عضو
 setField(id,col,val){const ws=this.wb.Sheets['اعضا'];const rng=XLSX.utils.decode_range(ws['!ref']);const hdr={};for(let c=rng.s.c;c<=rng.e.c;c++){const x=ws[XLSX.utils.encode_cell({r:0,c})];if(x)hdr[x.v]=c}
  if(!(col in hdr)){hdr[col]=++rng.e.c;ws[XLSX.utils.encode_cell({r:0,c:hdr[col]})]={t:'s',v:col};ws['!ref']=XLSX.utils.encode_range(rng)}
  for(let r=1;r<=rng.e.r;r++){const k=ws[XLSX.utils.encode_cell({r,c:hdr['کد ملی']})];if(k&&String(k.v).trim()===String(id).trim()){ws[XLSX.utils.encode_cell({r,c:hdr[col]})]={t:'s',v:val};return true}}return false}};
const Sess={set(id){sessionStorage.nid=id},get(){return sessionStorage.nid},need(){if(!this.get())location.href='index.html'},out(){sessionStorage.clear();location.href='index.html'}};
