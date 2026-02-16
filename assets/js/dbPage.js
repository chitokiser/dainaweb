
/* /public/assets/js/dbPage.js */
import { db } from "./firebaseApp.js";
import { collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { esc, setText } from "./util.js";

let _cache = [];

function matchQ(p, q){
  if(!q) return true;
  const hay = [
    p.name, p.skills, p.profile, p.workRegion, p.workStatus
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function render(){
  const root = document.getElementById("list");
  const cat = document.getElementById("fCategory")?.value || "";
  const qv = document.getElementById("q")?.value?.trim() || "";

  const rows = _cache
    .filter(p => cat ? String(p.category||"") === cat : true)
    .filter(p => matchQ(p, qv));

  setText("meta", `총 ${rows.length}명`);
  if(!rows.length){
    root.innerHTML = `<div class="muted">결과가 없습니다.</div>`;
    return;
  }

  root.innerHTML = rows.map(p=>{
    const name = esc(p.name || "-");
    const skills = esc(p.skills || "");
    const region = esc(p.workRegion || "");
    const status = esc(p.workStatus || "");
    const cat = esc(p.category || "");
    const sns = esc(p.sns || "");
    const photo = esc(p.photoUrl || "");
    return `
      <div class="item" style="align-items:flex-start;">
        <div style="display:flex; gap:12px; align-items:flex-start;">
          <div style="width:62px; height:62px; border-radius:16px; overflow:hidden; border:1px solid rgba(11,18,32,.10); background:#fff;">
            ${photo ? `<img src="${photo}" alt="" style="width:100%;height:100%;object-fit:cover;" referrerpolicy="no-referrer" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(11,18,32,.35);font-size:12px;">no photo</div>`}
          </div>
          <div>
            <p class="title">${name}</p>
            <div class="meta">
              ${cat ? `<span class="pill">${cat}</span>`:``}
              ${status ? `<span class="pill">${status}</span>`:``}
              ${region ? `<span class="pill">${region}</span>`:``}
              ${sns ? `<span class="pill">${sns}</span>`:``}
            </div>
            ${skills ? `<div class="desc">${skills}</div>`:``}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function load(){
  const root = document.getElementById("list");
  try{
    setText("meta","로딩중…");
    root.innerHTML = "";
    const qy = query(collection(db,"jobseekers"), where("public","==", true), orderBy("updatedAt","desc"), limit(80));
    const snap = await getDocs(qy);
    const rows = [];
    snap.forEach(d=>rows.push({id:d.id, ...d.data()}));
    _cache = rows;
    render();
  }catch(e){
    console.error(e);
    setText("meta","로드 실패");
    root.innerHTML = `<div class="muted">로드 실패</div>`;
  }
}

document.getElementById("btnSearch")?.addEventListener("click", render);
document.getElementById("fCategory")?.addEventListener("change", render);
document.getElementById("q")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") render(); });

load();
