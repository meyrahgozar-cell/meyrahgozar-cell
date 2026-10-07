// نام فایل: 1405-07-12_عنوان.pdf — تاریخ شمسی ابتدای نام، جدیدترین بالا
async function loadPdfs(dir,box,showDate){const el=document.querySelector(box);const fs=(await GH.list(dir)).filter(f=>/\.pdf$/i.test(f.name)).sort((a,b)=>b.name.localeCompare(a.name,'en'));
 el.innerHTML=fs.length?`<table><thead><tr>${showDate?'<th>تاریخ آپلود</th>':''}<th>عنوان</th><th>دانلود</th></tr></thead><tbody>${fs.map(f=>{const m=f.name.match(/^(\d{4}-\d{2}-\d{2})_(.*)\.pdf$/i);const d=m?m[1].replace(/-/g,'/'):'';const t=(m?m[2]:f.name.replace(/\.pdf$/i,'')).replace(/_/g,' ');
 return`<tr>${showDate?`<td>${JD.fa(d)}</td>`:''}<td>${t}</td><td><a href="${f.download_url}" download target="_blank">⬇ دانلود</a></td></tr>`}).join('')}</tbody></table>`:'<div class="empty">فایلی موجود نیست</div>'}
