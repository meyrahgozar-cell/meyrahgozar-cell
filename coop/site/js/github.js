const GH={h(){return CFG.token?{Authorization:'token '+CFG.token,Accept:'application/vnd.github+json'}:{Accept:'application/vnd.github+json'}},
 u(p){return`https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${p}`},
 async get(p){const r=await fetch(this.u(p)+'?ref='+CFG.branch+'&t='+Date.now(),{headers:this.h()});if(!r.ok)throw new Error('GitHub '+r.status);return r.json()},
 async bytes(p){const j=await this.get(p);const raw=j.content?j.content.replace(/\n/g,''):null;if(raw)return Uint8Array.from(atob(raw),c=>c.charCodeAt(0));const r=await fetch(j.download_url);return new Uint8Array(await r.arrayBuffer())},
 async put(p,b64,msg){let sha;try{sha=(await this.get(p)).sha}catch(e){}
  const r=await fetch(this.u(p),{method:'PUT',headers:this.h(),body:JSON.stringify({message:msg,content:b64,branch:CFG.branch,sha})});if(!r.ok)throw new Error('نوشتن ناموفق: '+r.status);return r.json()},
 async list(p){try{return(await this.get(p)).filter(f=>f.type==='file'&&f.name!=='.gitkeep')}catch(e){return[]}}};
