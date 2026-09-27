(() => {
  'use strict';

  const VAULT_KEY='peisov-vpn-secure-config-vault-v1';
  const MAX_CONFIG_BYTES=128*1024;
  const PBKDF2_ITERATIONS=250000;
  const SENSITIVE_KEYS=new Set(['privatekey','presharedkey','headerprotectionkey']);
  const MEDUZA_HINT_KEYS=new Set([
    'jc','jmin','jmax','s1','s2','s3','s4','h1','h2','h3','h4',
    'rekeyaftertime','rekeytimeout','rejectaftertime','keepalivetimeout',
    'maxhandshakeattempts','randomtrailers','disablecookies','headerprotectionkey','i1','i2'
  ]);

  const enc=new TextEncoder();
  const dec=new TextDecoder();

  function cleanKey(key){return String(key||'').trim()}
  function keyId(key){return cleanKey(key).toLowerCase()}
  function cleanValue(value){return String(value||'').trim()}

  function parseEndpoint(value){
    const v=cleanValue(value);
    if(!v)return {host:'',port:''};
    if(v.startsWith('[')){
      const end=v.indexOf(']');
      if(end>0)return {host:v.slice(1,end),port:v.slice(end+2)};
    }
    const i=v.lastIndexOf(':');
    if(i<1)return {host:v,port:''};
    return {host:v.slice(0,i),port:v.slice(i+1)};
  }

  function parseConf(text){
    if(typeof text!=='string')throw new Error('Config must be text');
    if(enc.encode(text).byteLength>MAX_CONFIG_BYTES)throw new Error('Config is too large');
    const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
    let section='';
    let protocolId='';
    let productLabel='';
    const sections={Interface:{},Peer:{}};
    const seenKeys=[];
    const unknownSections=[];

    for(let raw of lines){
      const line=raw.trim();
      if(!line)continue;
      if(line.startsWith('#')||line.startsWith(';')){
        const header=line.replace(/^[#;]\s*/,'');
        const protocol=header.match(/protocol\s+id\s*:\s*([A-Za-z0-9._-]+)/i);
        if(protocol)protocolId=protocol[1].toLowerCase();
        if(/^meduza\b/i.test(header))productLabel='Meduza';
        continue;
      }
      const sm=line.match(/^\[([^\]]+)\]$/);
      if(sm){
        const name=sm[1].trim();
        if(name==='Interface'||name==='Peer')section=name;
        else {section='';unknownSections.push(name)}
        continue;
      }
      const eq=line.indexOf('=');
      if(eq<1||!section)continue;
      const key=cleanKey(line.slice(0,eq));
      const value=cleanValue(line.slice(eq+1));
      if(!key)continue;
      sections[section][key]=value;
      seenKeys.push({section,key,id:keyId(key)});
    }

    const allIds=new Set(seenKeys.map(x=>x.id));
    const meduzaHints=[...allIds].filter(k=>MEDUZA_HINT_KEYS.has(k));
    const isMeduza=protocolId==='meduza'||productLabel==='Meduza'||meduzaHints.length>=3;
    if(!isMeduza)throw new Error('Файл не распознан как Meduza config');

    const iface=sections.Interface;
    const peer=sections.Peer;
    const required=[
      ['Interface','Address',iface.Address],
      ['Interface','PrivateKey',iface.PrivateKey],
      ['Peer','PublicKey',peer.PublicKey],
      ['Peer','AllowedIPs',peer.AllowedIPs],
      ['Peer','Endpoint',peer.Endpoint]
    ];
    const missing=required.filter(x=>!cleanValue(x[2])).map(x=>`${x[0]}.${x[1]}`);
    if(missing.length)throw new Error('В конфиге не хватает: '+missing.join(', '));

    const endpoint=parseEndpoint(peer.Endpoint);
    const sensitiveFields=seenKeys.filter(x=>SENSITIVE_KEYS.has(x.id)).map(x=>x.key);
    const tuning={};
    for(const {section,key,id} of seenKeys){
      if(section!=='Interface'||SENSITIVE_KEYS.has(id))continue;
      if(MEDUZA_HINT_KEYS.has(id))tuning[key]=sections.Interface[key];
    }

    return {
      format:'meduza-conf',
      product:'Meduza',
      protocolId:protocolId||'meduza',
      endpoint:cleanValue(peer.Endpoint),
      endpointHost:endpoint.host,
      endpointPort:endpoint.port,
      address:cleanValue(iface.Address),
      dns:cleanValue(iface.DNS),
      mtu:cleanValue(iface.MTU),
      allowedIPs:cleanValue(peer.AllowedIPs),
      persistentKeepalive:cleanValue(peer.PersistentKeepalive),
      peerPublicKey:cleanValue(peer.PublicKey),
      tuning,
      sensitiveFields:[...new Set(sensitiveFields)],
      secureFieldCount:new Set(sensitiveFields).size,
      unknownSections:[...new Set(unknownSections)]
    };
  }

  function bytesToB64(bytes){
    let s='';
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk)s+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    return btoa(s);
  }
  function b64ToBytes(value){
    const s=atob(value);
    const out=new Uint8Array(s.length);
    for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);
    return out;
  }

  async function deriveKey(passphrase,salt){
    const base=await crypto.subtle.importKey('raw',enc.encode(passphrase),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'PBKDF2',hash:'SHA-256',salt,iterations:PBKDF2_ITERATIONS},
      base,
      {name:'AES-GCM',length:256},
      false,
      ['encrypt','decrypt']
    );
  }

  function loadVault(){
    try{
      const parsed=JSON.parse(localStorage.getItem(VAULT_KEY)||'{}');
      return parsed&&typeof parsed==='object'?parsed:{};
    }catch{return {}}
  }
  function saveVault(vault){localStorage.setItem(VAULT_KEY,JSON.stringify(vault))}

  async function storeEncrypted(serverId,rawConfig,passphrase,meta={}){
    if(!serverId)throw new Error('Server id is required');
    if(typeof passphrase!=='string'||passphrase.length<8)throw new Error('Пароль хранилища должен быть минимум 8 символов');
    if(!crypto?.subtle)throw new Error('Web Crypto недоступен');
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await deriveKey(passphrase,salt);
    const payload=enc.encode(rawConfig);
    const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,payload));
    const vault=loadVault();
    vault[serverId]={
      v:1,
      alg:'AES-GCM-256',
      kdf:'PBKDF2-SHA256',
      iterations:PBKDF2_ITERATIONS,
      salt:bytesToB64(salt),
      iv:bytesToB64(iv),
      ciphertext:bytesToB64(cipher),
      fileName:String(meta.fileName||'Meduza.conf').slice(0,180),
      protocolId:String(meta.protocolId||'meduza').slice(0,64),
      createdAt:new Date().toISOString()
    };
    saveVault(vault);
    return {stored:true,fileName:vault[serverId].fileName,createdAt:vault[serverId].createdAt};
  }

  async function decrypt(serverId,passphrase){
    const entry=loadVault()[serverId];
    if(!entry)throw new Error('Encrypted config not found');
    if(typeof passphrase!=='string'||!passphrase)throw new Error('Введите пароль хранилища');
    const salt=b64ToBytes(entry.salt);
    const iv=b64ToBytes(entry.iv);
    const key=await deriveKey(passphrase,salt);
    try{
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,b64ToBytes(entry.ciphertext));
      return dec.decode(plain);
    }catch{
      throw new Error('Неверный пароль или повреждённое хранилище');
    }
  }

  function getMeta(serverId){
    const entry=loadVault()[serverId];
    if(!entry)return null;
    return {
      fileName:entry.fileName,
      protocolId:entry.protocolId,
      createdAt:entry.createdAt,
      encrypted:true,
      alg:entry.alg,
      kdf:entry.kdf,
      iterations:entry.iterations
    };
  }
  function has(serverId){return Boolean(loadVault()[serverId])}
  function remove(serverId){
    const vault=loadVault();
    if(!vault[serverId])return false;
    delete vault[serverId];
    saveVault(vault);
    return true;
  }

  window.PeisovMeduzaConfig={
    parseConf,
    storeEncrypted,
    decrypt,
    getMeta,
    has,
    remove,
    constants:{
      maxConfigBytes:MAX_CONFIG_BYTES,
      pbkdf2Iterations:PBKDF2_ITERATIONS
    }
  };
})();
