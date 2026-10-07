const $=s=>document.querySelector(s);
const fmt={amt:v=>JD.money(v)};
function table(id,rows,cols){const el=$(id);el.innerHTML=rows.length?`<table><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr>${cols.map(c=>`<td>${c[1](r,i)}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<div class="empty">موردی ثبت نشده است</div>'}
async function initDash(){Sess.need();try{await DB.load()}catch(e){$('#err').textContent='خطا در خواندن پایگاه داده: '+e.message;return}
 const u=DB.find(Sess.get());if(!u){Sess.out();return}
 $('#hello').textContent=`${u['نام']} ${u['نام خانوادگی']}`;
 const f=[['نام','نام'],['نام خانوادگی','نام خانوادگی'],['کد ملی','کد ملی'],['موبایل','موبایل'],['ایمیل ثبت‌شده','ایمیل فردی'],['شرکت مادر','شرکت مادر'],['وضعیت عضویت','وضعیت عضویت'],['تعاونی','تعاونی'],['جمع پرداختی‌ها','جمع پرداختی‌ها'],['میزان بدهی','میزان بدهی'],['امتیاز','امتیاز']];
 $('#info').innerHTML=f.map(([l,k])=>{let v=u[k];if(k.includes('پرداختی')||k.includes('بدهی'))v=JD.money(v);else v=JD.fa(v||'—');return`<div><small>${l}</small><b>${v}</b></div>`}).join('');
 const col=[['ردیف',(r,i)=>JD.fa(i+1)],['مبلغ',r=>JD.money(r.amt)],['تاریخ',r=>JD.fa(r.date)]];
 table('#pay',DB.rowsOf(DB.pay,u['کد ملی']),col);table('#obl',DB.rowsOf(DB.obl,u['کد ملی']),col.map((c,i)=>i==2?['تاریخ سررسید',c[1]]:c));
 ranking(u)}
function ranking(u){const all=[...DB.m].sort((a,b)=>(+b['امتیاز']||0)-(+a['امتیاز']||0));
 table('#rank',all,[['رتبه',(r,i)=>JD.fa(i+1)],['نام و نام خانوادگی',r=>`${r['نام']} ${r['نام خانوادگی']}`],['امتیاز',r=>JD.fa(r['امتیاز']||0)]]);
 const idx=all.findIndex(r=>String(r['کد ملی'])===String(u['کد ملی']));const w=$('#rank').parentElement;const tr=w.querySelectorAll('tbody tr')[idx];
 if(tr){tr.classList.add('me');requestAnimationFrame(()=>{w.scrollTop=tr.offsetTop-w.clientHeight/2+tr.offsetHeight/2})}}
