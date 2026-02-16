// /public/assets/js/util.js

export function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function looksLikeCssSelector(sel){
  const s = String(sel || "").trim();
  if(!s) return false;
  // If it contains spaces or combinators, it's definitely a selector
  if(/[\s>+~]/.test(s)) return true;
  // Common selector prefixes
  if(s.startsWith("#") || s.startsWith(".") || s.startsWith("[") || s.startsWith(":")) return true;
  // tag selector like "div" or "a" is valid selector too, but in this codebase
  // many calls pass raw ids ("btnLogin2"). We treat bareword as id.
  return false;
}

// If sel is a bare id, return getElementById(sel). Otherwise querySelector(sel)
export function q(sel, root=document){
  const s = String(sel || "").trim();
  if(!s) return null;
  if(!looksLikeCssSelector(s)){
    // raw id
    return document.getElementById(s);
  }
  return root.querySelector(s);
}

export function qa(sel, root=document){
  const s = String(sel || "").trim();
  if(!s) return [];
  if(!looksLikeCssSelector(s)){
    const el = document.getElementById(s);
    return el ? [el] : [];
  }
  return Array.from(root.querySelectorAll(s));
}

export function byId(id){ return document.getElementById(id); }

export function setText(id, text){
  const el = byId(id);
  if(el) el.textContent = String(text ?? "");
}

export function val(id){ return (byId(id)?.value || "").trim(); }

export function toMillis(v){
  try{
    if(!v) return 0;
    if(typeof v === "string") return Date.parse(v) || 0;
    if(typeof v === "number") return v;
    if(v?.toMillis) return v.toMillis();
    if(v?.toDate) return +v.toDate();
    return 0;
  }catch{ return 0; }
}

export function isoDate(v){
  const ms = toMillis(v);
  if(!ms) return "";
  return new Date(ms).toISOString().slice(0,10);
}

// Legacy/helper: some pages import fmtDate().
// Keep stable output: YYYY-MM-DD.
export function fmtDate(v){
  return isoDate(v);
}

export function fmtDT(v){
  const ms = toMillis(v);
  if(!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  return `${y}-${m}-${da} ${hh}:${mm}`;
}

export function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

export function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

export async function sha256Text(str){
  const enc = new TextEncoder().encode(String(str || ""));
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b=>b.toString(16).padStart(2,"0")).join("");
}

export function safeUrl(u){
  const s = String(u || "").trim();
  if(!s) return "";
  try{
    const url = new URL(s);
    return url.toString();
  }catch{
    return "";
  }
}

export function pickFileExtFromType(mime){
  const t = String(mime||"").toLowerCase();
  if(t.includes("png")) return "png";
  if(t.includes("webp")) return "webp";
  return "jpg";
}

export function toast(msg){
  const root = byId("toastRoot");
  if(!root){
    alert(msg);
    return;
  }
  root.textContent = msg;
  root.classList.add("show");
  setTimeout(()=>root.classList.remove("show"), 2200);
}

export function openModal(html){
  const wrap = byId("modalWrap");
  const box = byId("modalBox");
  if(!wrap || !box) return;
  box.innerHTML = html;
  wrap.classList.add("open");
}

export function closeModal(){
  const wrap = byId("modalWrap");
  const box = byId("modalBox");
  if(!wrap || !box) return;
  wrap.classList.remove("open");
  box.innerHTML = "";
}

export function bindModalClose(){
  const wrap = byId("modalWrap");
  if(!wrap) return;
  wrap.addEventListener("click", (e)=>{
    if(e.target === wrap) closeModal();
  });
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") closeModal();
  });
}

// ===== i18n (ko/vi) =====
export function getLang(){
  const v = (localStorage.getItem("daina_lang") || "ko").toLowerCase();
  return (v === "vi" ? "vi" : "ko");
}
export function setLang(lang){
  const v = (lang || "ko").toLowerCase();
  localStorage.setItem("daina_lang", v === "vi" ? "vi" : "ko");
}
export function pickText(obj, key){
  const lang = getLang();
  const v = obj ? obj[key] : "";
  if(v && typeof v === "object"){
    return (v[lang] || v.ko || v.vi || "");
  }
  return (v ?? "");
}
