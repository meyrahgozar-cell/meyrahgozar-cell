const NEWPW='رمز جدید (خودکار)';
async function doLogin(id,pw){await DB.load();const u=DB.find(JD.en(id));if(!u)throw new Error('کد ملی یافت نشد');pw=JD.en(pw).trim();
 const hash=String(u[NEWPW]||'');
 if(hash){if(await DB.sha(pw)!==hash)throw new Error('رمز عبور نادرست است');Sess.set(u['کد ملی']);return'dashboard.html'}
 if(String(u['رمز اولیه']).trim()!==pw)throw new Error('رمز عبور نادرست است');Sess.set(u['کد ملی']);sessionStorage.first='1';return'register.html'}
async function doRegister(pw,pw2,email){if(pw.length<6)throw new Error('رمز حداقل ۶ نویسه باشد');if(pw!==pw2)throw new Error('تکرار رمز یکسان نیست');
 if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('ایمیل نامعتبر است');await DB.load();const id=Sess.get();
 DB.setField(id,'ایمیل فردی',email);DB.setField(id,NEWPW,await DB.sha(pw));await DB.save('ثبت‌نام عضو '+id);sessionStorage.removeItem('first');return'dashboard.html'}
