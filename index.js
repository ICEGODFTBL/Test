function ri(a,b){return Math.floor(Math.random()*(b-a+1))+a}

function randomKey(len){const k=[];for(let i=0;i<len;i++)k.push(ri(33,126));return k}

function xorEncode(str,key){const out=[];for(let i=0;i<str.length;i++)out.push((str.charCodeAt(i)^key[i%key.length])&0xFF);return out}

function fmtBytes(bytes){return'"'+bytes.map(b=>'\\'+b).join('')+'"'}

function encodeStr(str){const key=randomKey(ri(6,10));const enc=xorEncode(str,key);return`__d(${fmtBytes(enc)},${fmtBytes(key)})`}

function obfNum(n){
  n=Math.floor(n);
  if(isNaN(n)||n<0)return String(n);
  if(n===0){
    const a=ri(100,9999),b=ri(100,9999);
    return`(${a}*${b}-${a*b})`
  }
  let A,B;
  if(n<10000){A=ri(1000,9999);B=ri(1000,9999)}
  else{A=ri(10000,99999);B=ri(10,99)}
  const AB=A*B;
  if(AB>n)return`(${A}*${B}-${AB-n})`;
  const noise=ri(10000,99999);
  return`(${n+noise}-${noise})`
}

function parseEscapes(s){
  let r='',i=0;
  while(i<s.length){
    if(s[i]!=='\\'){r+=s[i++];continue}
    i++;
    const c=s[i];
    if(c==='n'){r+='\n';i++}
    else if(c==='t'){r+='\t';i++}
    else if(c==='r'){r+='\r';i++}
    else if(c==='"'){r+='"';i++}
    else if(c==="'"){r+="'";i++}
    else if(c==='\\'){r+='\\';i++}
    else if(/[0-9]/.test(c)){
      let ns='';
      while(i<s.length&&/[0-9]/.test(s[i])&&ns.length<3)ns+=s[i++];
      r+=String.fromCharCode(parseInt(ns))
    }else{r+='\\'+c;i++}
  }
  return r
}

function tokenize(src){
  const toks=[];let i=0;
  while(i<src.length){
    if(src.startsWith('--[[',i)){
      const e=src.indexOf(']]',i+4);const end=e===-1?src.length:e+2;
      toks.push({t:'comment',v:src.slice(i,end)});i=end;continue
    }
    if(src.startsWith('--',i)){
      const e=src.indexOf('\n',i);const end=e===-1?src.length:e;
      toks.push({t:'comment',v:src.slice(i,end)});i=end;continue
    }
    if(src.startsWith('[[',i)){
      const e=src.indexOf(']]',i+2);const end=e===-1?src.length:e+2;
      toks.push({t:'longstr',v:src.slice(i,end)});i=end;continue
    }
    if(src[i]==='"'){
      let j=i+1,c='';
      while(j<src.length&&src[j]!=='"'){
        if(src[j]==='\\'){c+=src[j]+src[j+1];j+=2}else c+=src[j++]
      }
      toks.push({t:'str',q:'"',v:c});i=j+1;continue
    }
    if(src[i]==="'"){
      let j=i+1,c='';
      while(j<src.length&&src[j]!=="'"){
        if(src[j]==='\\'){c+=src[j]+src[j+1];j+=2}else c+=src[j++]
      }
      toks.push({t:'str',q:"'",v:c});i=j+1;continue
    }
    if(src.startsWith('0x',i)||src.startsWith('0X',i)){
      let j=i+2;while(j<src.length&&/[0-9a-fA-F]/.test(src[j]))j++;
      toks.push({t:'num',v:src.slice(i,j),raw:true});i=j;continue
    }
    if(/[0-9]/.test(src[i])||(src[i]==='.'&&/[0-9]/.test(src[i+1]||''))){
      let j=i,fl=false;
      while(j<src.length&&/[0-9]/.test(src[j]))j++;
      if(j<src.length&&src[j]==='.'){fl=true;j++;while(j<src.length&&/[0-9]/.test(src[j]))j++}
      if(j<src.length&&/[eE]/.test(src[j])){fl=true;j++;if(/[+-]/.test(src[j]||''))j++;while(/[0-9]/.test(src[j]||''))j++}
      toks.push({t:'num',v:src.slice(i,j),raw:fl});i=j;continue
    }
    if(/[a-zA-Z_]/.test(src[i])){
      let j=i;while(j<src.length&&/[a-zA-Z0-9_]/.test(src[j]))j++;
      toks.push({t:'id',v:src.slice(i,j)});i=j;continue
    }
    if(/\s/.test(src[i])){
      let j=i;while(j<src.length&&/\s/.test(src[j]))j++;
      toks.push({t:'ws',v:src.slice(i,j)});i=j;continue
    }
    toks.push({t:'other',v:src[i++]})
  }
  return toks
}

const KW=new Set(['and','break','do','else','elseif','end','false','for','function','goto','if','in','local','nil','not','or','repeat','return','then','true','until','while']);

function skipWs(toks,j){while(j<toks.length&&toks[j].t==='ws')j++;return j}

function collectLocals(toks){
  const remap=new Map();let vi=0;
  const nv=()=>'v'+(vi++);

  for(let i=0;i<toks.length;i++){
    const t=toks[i];

    if(t.t==='id'&&t.v==='local'){
      let j=skipWs(toks,i+1);
      if(j>=toks.length)continue;
      if(toks[j].t==='id'&&toks[j].v==='function'){
        j=skipWs(toks,j+1);
        if(j<toks.length&&toks[j].t==='id'&&!KW.has(toks[j].v))
          if(!remap.has(toks[j].v))remap.set(toks[j].v,nv());
      }else if(toks[j].t==='id'&&!KW.has(toks[j].v)){
        if(!remap.has(toks[j].v))remap.set(toks[j].v,nv());
        let k=skipWs(toks,j+1);
        while(k<toks.length&&toks[k].t==='other'&&toks[k].v===','){
          k=skipWs(toks,k+1);
          if(k<toks.length&&toks[k].t==='id'&&!KW.has(toks[k].v)){
            if(!remap.has(toks[k].v))remap.set(toks[k].v,nv());
            k=skipWs(toks,k+1)
          }else break
        }
      }
    }

    if(t.t==='id'&&t.v==='for'){
      let j=skipWs(toks,i+1);
      while(j<toks.length){
        if(toks[j].t==='id'&&!KW.has(toks[j].v)){
          if(!remap.has(toks[j].v))remap.set(toks[j].v,nv());
          j=skipWs(toks,j+1);
          if(j<toks.length&&toks[j].t==='other'&&toks[j].v===','){j=skipWs(toks,j+1);continue}
        }
        break
      }
    }

    if(t.t==='id'&&t.v==='function'){
      let j=skipWs(toks,i+1);
      while(j<toks.length&&toks[j].t==='id'){
        j=skipWs(toks,j+1);
        if(j<toks.length&&(toks[j].v==='.'||toks[j].v===':')){j=skipWs(toks,j+1)}
        else break
      }
      if(j<toks.length&&toks[j].t==='other'&&toks[j].v==='('){
        j++;
        while(j<toks.length&&!(toks[j].t==='other'&&toks[j].v===')')){
          j=skipWs(toks,j);
          if(j<toks.length&&toks[j].t==='id'&&!KW.has(toks[j].v)){
            if(!remap.has(toks[j].v))remap.set(toks[j].v,nv());
            j++
          }else if(j<toks.length&&toks[j].t==='other'&&toks[j].v===',')j++;
          else break
        }
      }
    }
  }
  return remap
}

function obfuscate(src){
  const toks=tokenize(src);
  const remap=collectLocals(toks);
  const out=[];

  for(const tok of toks){
    if(tok.t==='comment')continue;
    if(tok.t==='str'){
      try{out.push(encodeStr(parseEscapes(tok.v)))}
      catch{out.push(tok.q+tok.v+tok.q)}
      continue
    }
    if(tok.t==='num'&&!tok.raw){
      const n=parseInt(tok.v);
      if(!isNaN(n)&&n>=0){out.push(obfNum(n));continue}
    }
    if(tok.t==='id'&&remap.has(tok.v)){out.push(remap.get(tok.v));continue}
    out.push(tok.v)
  }

  const HDR=
`--[[
 ___  ___ ______ _____ ____  _____ _____  __  __  _____ _____  _____ ______
|_ _|/ __|  ____|  _  |  _ \\| __  |  _  ||  \\/  ||  ___|_   _||  _  ||  _  \\
 | || (__| |__  | | | | |_| | |__| | | | || |\\/| || |__  | |  | | | || | | |
 | | \\__ \\  __| | | | |  _ <|  _  | | | || |  | ||  __| | |  | | | || | | |
 | | ___) | |___| |_| | |_| | |  | | |_| || |  | || |___| |_  | |_| || |_| |
|___|____/|_____|_____|____/|_|  |_|_____|_|  |_||_____|____|  |___/ |_____/
 ICE Obfuscator ~ icegodftbl
]]--
`;

  const DEC=`local __c=string.char;local __b=string.byte;local __s=string.sub;local __xb=bit32 or bit;local __xr=__xb.bxor;local __tc=table.concat;local __ti=table.insert;local function __d(__p,__k)local __t={};for __i=1,#__p do __ti(__t,__c(__xr(__b(__s(__p,__i,__i+1)),__b(__s(__k,1+(__i%#__k),1+(__i%#__k)+1)))%256));end;return __tc(__t);end\n`;

  return HDR+DEC+out.join('')
}

