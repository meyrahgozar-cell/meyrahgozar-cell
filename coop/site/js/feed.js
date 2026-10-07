// فایل txt: هر خط «لینک | عنوان(اختیاری) | لینک تصویر(اختیاری)» — جدیدترین خط در بالا
async function loadFeed(file,box){const el=document.querySelector(box);try{const t=await(await fetch(file+'?t='+Date.now())).text();
 const L=t.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>s.split('|').map(x=>x.trim()));
 el.innerHTML=L.length?L.map(([u,ti,im])=>{const h=new URL(u).hostname;const img=im||`https://image.thum.io/get/width/600/crop/400/${u}`;
 return`<a class="card item" href="${u}" target="_blank" rel="noopener"><img loading="lazy" src="${img}" alt="" onerror="this.src='https://www.google.com/s2/favicons?sz=128&domain=${h}'"><span>${ti||h}</span></a>`}).join(''):'<div class="empty">موردی ثبت نشده است</div>'}catch(e){el.innerHTML='<div class="empty">خطا در بارگذاری</div>'}}
