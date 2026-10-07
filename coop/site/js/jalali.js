const JD={g2j(gy,gm,gd){const d=[0,31,59,90,120,151,181,212,243,273,304,334];let jy=gy>1600?979:0;gy-=gy>1600?1600:621;const g=gm>2?gy+1:gy;let days=365*gy+Math.floor((g+3)/4)-Math.floor((g+99)/100)+Math.floor((g+399)/400)-80+gd+d[gm-1];jy+=33*Math.floor(days/12053);days%=12053;jy+=4*Math.floor(days/1461);days%=1461;if(days>365){jy+=Math.floor((days-1)/365);days=(days-1)%365}const jm=days<186?1+Math.floor(days/31):7+Math.floor((days-186)/30);const jd=1+(days<186?days%31:(days-186)%30);return[jy,jm,jd]},
 fa(s){return String(s).replace(/\d/g,x=>'۰۱۲۳۴۵۶۷۸۹'[x])},
 en(s){return String(s).replace(/[۰-۹]/g,x=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(x)).replace(/[٠-٩]/g,x=>'٠١٢٣٤٥٦٧٨٩'.indexOf(x))},
 // ورودی: شمسی/میلادی به‌صورت متن، Date یا سریال اکسل → خروجی شمسی yyyy/mm/dd
 norm(v){if(v==null||v==='')return'';let y,m,d;if(v instanceof Date){[y,m,d]=[v.getFullYear(),v.getMonth()+1,v.getDate()]}else if(typeof v==='number'){const t=new Date(Math.round((v-25569)*864e5));[y,m,d]=[t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate()]}else{const p=this.en(v).split(/[\/\-.]/).map(Number);if(p.length<3||p.some(isNaN))return String(v);[y,m,d]=p[0]>31?p:[p[2],p[1],p[0]]}
  if(y>1700)[y,m,d]=this.g2j(y,m,d);return`${y}/${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}`},
 today(){const n=new Date();return this.norm(n)},
 money(n){return this.fa((+n||0).toLocaleString('en-US'))+' ریال'}};
