// /public/assets/js/jobsPage.js
import { auth, db } from "./firebaseApp.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function toMillis(v){
  try{
    if(!v) return 0;
    if(typeof v === "string") return Date.parse(v) || 0;
    if(typeof v === "number") return v;
    if(v?.toMillis) return v.toMillis();
    if(v?.toDate) return +v.toDate();
    return 0;
  }catch{
    return 0;
  }
}

function val(id){
  return (document.getElementById(id)?.value || "").trim();
}

function setAuthState(msg){
  const el = document.getElementById("authState");
  if(el) el.textContent = msg;
}

function safeUrl(u){
  const s = String(u || "").trim();
  if(!s) return "";
  try{ return new URL(s).toString(); }catch{ return ""; }
}

function toDateText(v){
  try{
    if(!v) return "";
    if(typeof v === "string") return v.slice(0,10);
    if(v?.toDate) return v.toDate().toISOString().slice(0,10);
    return "";
  }catch{ return ""; }
}

function statusPill(status){
  const s = String(status || "pending");
  const cls = (s === "approved" || s === "pending" || s === "rejected") ? s : "pending";
  return `<span class="pillStatus ${cls}">${esc(s)}</span>`;
}

function skeletonHTML(n=10){
  return Array.from({length:n}).map(() => `
    <div class="card skeleton">
      <div class="card-top">
        <h3 class="card-title">불러오는 중...</h3>
        <span class="card-tag">...</span>
      </div>
      <p class="card-desc">데이터를 불러오고 있습니다.</p>
      <div class="card-meta">
        <span>-</span><span>-</span>
      </div>
    </div>
  `).join("");
}

function emptyHTML(msg){
  return `<div class="empty">${esc(msg)}</div>`;
}

const CATEGORY_LABEL = {
  jobs: "구인",
  jobseekers: "구직",
  used: "중고거래",
  stay: "한달살기",
  share: "공유경제",
  shops: "가맹점",
  events: "이벤트",
  closedmall: "패쇄몰"
};

function currentCategory(){
  const sel = document.getElementById("categorySel");
  return sel ? sel.value : "jobs";
}

function syncCategoryUI(){
  const c = currentCategory();
  const titleEl = document.getElementById("listTitle");
  const hintEl = document.getElementById("categoryHint");
  if(titleEl) titleEl.textContent = (CATEGORY_LABEL[c] || c) + " 글";
  if(hintEl) hintEl.textContent = "카테고리: " + c;
}

function resetForm(){
  ["area","tag","title","desc","contact","href"].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.value = "";
  });
}

function fillFormFromDoc(data){
  const map = {
    area: data.area || "",
    tag: data.tag || "",
    title: data.title || "",
    desc: data.desc || "",
    contact: data.contact || "",
    href: data.href || ""
  };
  Object.keys(map).forEach(k=>{
    const el = document.getElementById(k);
    if(el) el.value = map[k];
  });
}

let currentTab = "public"; // public | mine
let editMode = false;
let editingId = null;
let editingCategory = null;

/* 접기/펼치기 상태 */
let foldCollapsed = false;
function setFold(collapsed){
  foldCollapsed = !!collapsed;
  const root = document.getElementById("postFold");
  const head = document.getElementById("postFoldHead");
  const sub = document.getElementById("foldSubText");

  if(root){
    root.classList.toggle("collapsed", foldCollapsed);
    root.dataset.collapsed = foldCollapsed ? "1" : "0";
  }
  if(head) head.setAttribute("aria-expanded", foldCollapsed ? "false" : "true");
  if(sub) sub.textContent = foldCollapsed ? "접힘" : "펼침";

  try{
    localStorage.setItem("daina_jobs_fold", foldCollapsed ? "1" : "0");
  }catch{}
}
function toggleFold(){
  setFold(!foldCollapsed);
}
function openFold(){
  setFold(false);
}

function setEditBanner(on, text){
  const banner = document.getElementById("editBanner");
  const bannerText = document.getElementById("editBannerText");
  const btnSubmit = document.getElementById("btnSubmit");

  editMode = on;
  if(banner) banner.style.display = on ? "" : "none";
  if(bannerText) bannerText.textContent = text || (on ? "편집 모드" : "");
  if(btnSubmit) btnSubmit.textContent = on ? "수정 저장" : "등록 요청";

  if(on) openFold(); // 편집 시작하면 자동 펼침
}

function exitEditMode(){
  editMode = false;
  editingId = null;
  editingCategory = null;
  setEditBanner(false);
  resetForm();
}

function cardPublicHTML(item){
  const title = esc(item.title || "제목 없음");
  const desc = esc(item.desc || "");
  const tag = esc(item.tag || "");
  const area = esc(item.area || "하노이");
  const dt = toDateText(item.createdAt || "");
  const href = esc(item.href || "#");

  return `
    <a class="card" href="${href}" role="article" onclick="${href==="#" ? "return false;" : ""}">
      <div class="card-top">
        <h3 class="card-title">${title}</h3>
        <span class="card-tag">${tag || "글"}</span>
      </div>
      <p class="card-desc">${desc || "설명이 아직 없습니다."}</p>
      <div class="card-meta">
        <span>${area}</span>
        <span>${dt || ""}</span>
      </div>
    </a>
  `;
}

function cardMineHTML(item){
  const title = esc(item.title || "제목 없음");
  const desc = esc(item.desc || "");
  const tag = esc(item.tag || "");
  const area = esc(item.area || "하노이");
  const dt = toDateText(item.createdAt || "");
  const contact = esc(item.contact || "");
  const href = esc(item.href || "#");
  const st = statusPill(item.status);
  const reason = esc(item.rejectReason || "");
  const canEdit = String(item.status || "") === "pending";

  return `
    <div class="card" role="article"
      data-mine-id="${esc(item.id)}"
      data-mine-status="${esc(item.status || "")}"
      data-mine-cat="${esc(item._cat)}"
    >
      <div class="card-top">
        <h3 class="card-title">${title}</h3>
        <span class="card-tag">${tag || "내 글"}</span>
      </div>

      <p class="card-desc">${desc || "설명이 아직 없습니다."}</p>

      <div class="card-meta">
        <span>${area}</span>
        <span>${dt || ""}</span>
      </div>

      <div class="card-meta">
        <span>${contact ? "연락: " + contact : ""}</span>
        <span>${st}</span>
      </div>

      ${String(item.status || "") === "rejected" && reason ? `
        <div class="card-meta">
          <span>반려사유</span>
          <span>${reason}</span>
        </div>
      ` : ""}

      ${href && href !== "#" ? `<div class="card-meta"><span>링크</span><span>${href}</span></div>` : ""}

      ${canEdit ? `
        <div class="mini-actions">
          <button class="btn ok" data-act="edit" type="button">수정</button>
          <button class="btn danger" data-act="delete" type="button">삭제</button>
        </div>
      ` : ""}
    </div>
  `;
}

async function getPublicDocsWithFallback(cat){
  try{
    const q1 = query(
      collection(db, cat),
      where("status","==","approved"),
      orderBy("createdAt","desc"),
      limit(80)
    );
    return await getDocs(q1);
  }catch(e){
    const msg = String(e?.message || e);
    const needsIndex = msg.toLowerCase().includes("requires an index");
    if(!needsIndex) throw e;

    const q2 = query(
      collection(db, cat),
      where("status","==","approved"),
      limit(300)
    );
    return await getDocs(q2);
  }
}

async function getMineDocsWithFallback(cat, uid){
  try{
    const q1 = query(
      collection(db, cat),
      where("ownerUid","==", uid),
      orderBy("createdAt","desc"),
      limit(200)
    );
    return await getDocs(q1);
  }catch(e){
    const msg = String(e?.message || e);
    const needsIndex = msg.toLowerCase().includes("requires an index");
    if(!needsIndex) throw e;

    const q2 = query(
      collection(db, cat),
      where("ownerUid","==", uid),
      limit(400)
    );
    return await getDocs(q2);
  }
}

async function loadPublic(){
  const mount = document.getElementById("list");
  if(!mount) return;

  const cat = currentCategory();
  syncCategoryUI();
  mount.innerHTML = skeletonHTML(10);

  try{
    const snap = await getPublicDocsWithFallback(cat);

    const rows = [];
    snap.forEach(d=>{
      const data = d.data() || {};
      rows.push({ ...data, href: data.href || `#${d.id}` });
    });

    rows.sort((a,b)=> toMillis(b.createdAt) - toMillis(a.createdAt));
    const view = rows.slice(0, 50);

    if(view.length === 0){
      mount.innerHTML = emptyHTML("공개된 글이 없습니다.");
      return;
    }
    mount.innerHTML = view.map(cardPublicHTML).join("");
  }catch(e){
    console.error(e);
    mount.innerHTML = emptyHTML("불러오기 실패. 콘솔 에러 확인 (인덱스 필요 가능)");
  }
}

async function loadMine(uid){
  const mount = document.getElementById("list");
  if(!mount) return;

  const cat = currentCategory();
  syncCategoryUI();
  mount.innerHTML = skeletonHTML(8);

  try{
    const snap = await getMineDocsWithFallback(cat, uid);

    const rows = [];
    snap.forEach(d=>{
      rows.push({ id:d.id, ...(d.data() || {}), _cat: cat });
    });

    rows.sort((a,b)=> toMillis(b.createdAt) - toMillis(a.createdAt));

    if(rows.length === 0){
      mount.innerHTML = emptyHTML("내가 등록한 글이 없습니다.");
      return;
    }
    mount.innerHTML = rows.slice(0, 120).map(cardMineHTML).join("");
  }catch(e){
    console.error(e);
    mount.innerHTML = emptyHTML("불러오기 실패. 콘솔 에러 확인 (인덱스 필요 가능)");
  }
}

function setTab(tab){
  currentTab = tab;

  const tPublic = document.getElementById("tabPublic");
  const tMine = document.getElementById("tabMine");

  if(tPublic) tPublic.classList.toggle("active", tab === "public");
  if(tMine) tMine.classList.toggle("active", tab === "mine");

  const user = auth.currentUser;
  if(tab === "mine"){
    if(!user){
      const mount = document.getElementById("list");
      if(mount) mount.innerHTML = emptyHTML("내 글은 로그인 후 확인 가능합니다.");
      return;
    }
    loadMine(user.uid);
  }else{
    loadPublic();
  }
}

async function submitNew(){
  const user = auth.currentUser;
  if(!user){
    alert("로그인이 필요합니다.");
    return;
  }

  const cat = currentCategory();
  const title = val("title");
  const desc = val("desc");
  const area = val("area");
  const tag = val("tag");
  const contact = val("contact");
  const href = safeUrl(val("href"));

  if(!title || title.length < 2){
    alert("제목을 2글자 이상 입력하세요.");
    return;
  }
  if(!desc || desc.length < 5){
    alert("설명을 5글자 이상 입력하세요.");
    return;
  }

  const btn = document.getElementById("btnSubmit");
  if(btn) btn.disabled = true;
  setAuthState("등록 중...");

  const payload = {
    title, desc, area, tag, contact, href,
    status: "pending",
    ownerUid: user.uid,
    ownerName: user.displayName || "",
    ownerEmail: user.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try{
    await addDoc(collection(db, cat), payload);
    alert("등록 요청 완료! 관리자 승인 후 공개됩니다.");

    resetForm();

    const tabMine = document.getElementById("tabMine");
    if(tabMine) tabMine.style.display = "";
    setTab("mine");
    setAuthState("로그인됨: " + (user.displayName || user.email || "") + " / 등록 완료");

    setFold(true); // 등록 후 폼 자동 접기
  }catch(e){
    console.error(e);
    alert("등록 실패: " + (e?.message || e));
    setAuthState("등록 실패. 콘솔 에러 확인");
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function submitEdit(){
  const user = auth.currentUser;
  if(!user){
    alert("로그인이 필요합니다.");
    return;
  }
  if(!editingId || !editingCategory){
    alert("편집 대상이 없습니다.");
    exitEditMode();
    return;
  }

  const title = val("title");
  const desc = val("desc");
  const area = val("area");
  const tag = val("tag");
  const contact = val("contact");
  const href = safeUrl(val("href"));

  if(!title || title.length < 2){
    alert("제목을 2글자 이상 입력하세요.");
    return;
  }
  if(!desc || desc.length < 5){
    alert("설명을 5글자 이상 입력하세요.");
    return;
  }

  const btn = document.getElementById("btnSubmit");
  if(btn) btn.disabled = true;
  setAuthState("수정 저장 중...");

  try{
    const ref = doc(db, editingCategory, editingId);
    const snap = await getDoc(ref);
    if(!snap.exists()){
      alert("문서를 찾을 수 없습니다.");
      exitEditMode();
      return;
    }
    const cur = snap.data() || {};
    if(cur.ownerUid !== user.uid){
      alert("본인 글만 수정할 수 있습니다.");
      exitEditMode();
      return;
    }
    if(String(cur.status || "") !== "pending"){
      alert("pending 상태일 때만 수정할 수 있습니다.");
      exitEditMode();
      return;
    }

    await updateDoc(ref, {
      title, desc, area, tag, contact, href,
      updatedAt: serverTimestamp()
    });

    alert("수정 저장 완료. (pending 유지)");
    exitEditMode();
    setTab("mine");

    setFold(true); // 수정 저장 후 폼 자동 접기
  }catch(e){
    console.error(e);
    alert("수정 실패: " + (e?.message || e));
  }finally{
    if(btn) btn.disabled = false;
    const u = auth.currentUser;
    setAuthState(u ? ("로그인됨: " + (u.displayName || u.email || "")) : "로그인이 필요합니다.");
  }
}

async function handleMineAction(e){
  const btn = e.target?.closest?.("button[data-act]");
  if(!btn) return;

  const card = btn.closest(".card[data-mine-id]");
  if(!card) return;

  const id = card.getAttribute("data-mine-id");
  const status = card.getAttribute("data-mine-status");
  const cat = card.getAttribute("data-mine-cat");
  const act = btn.getAttribute("data-act");

  const user = auth.currentUser;
  if(!user){
    alert("로그인이 필요합니다.");
    return;
  }
  if(String(status) !== "pending"){
    alert("pending 상태일 때만 가능합니다.");
    return;
  }

  if(act === "edit"){
    try{
      const ref = doc(db, cat, id);
      const snap = await getDoc(ref);
      if(!snap.exists()){
        alert("문서를 찾을 수 없습니다.");
        return;
      }
      const data = snap.data() || {};
      if(data.ownerUid !== user.uid){
        alert("본인 글만 수정할 수 있습니다.");
        return;
      }
      if(String(data.status || "") !== "pending"){
        alert("pending 상태일 때만 수정할 수 있습니다.");
        return;
      }

      editingId = id;
      editingCategory = cat;
      fillFormFromDoc(data);
      setEditBanner(true, "편집 중: " + (CATEGORY_LABEL[cat] || cat));
      openFold();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }catch(err){
      console.error(err);
      alert("불러오기 실패: " + (err?.message || err));
    }
  }

  if(act === "delete"){
    const sure = confirm("이 pending 글을 삭제하시겠습니까?");
    if(!sure) return;

    try{
      const ref = doc(db, cat, id);
      const snap = await getDoc(ref);
      if(!snap.exists()){
        alert("문서를 찾을 수 없습니다.");
        return;
      }
      const data = snap.data() || {};
      if(data.ownerUid !== user.uid){
        alert("본인 글만 삭제할 수 있습니다.");
        return;
      }
      if(String(data.status || "") !== "pending"){
        alert("pending 상태일 때만 삭제할 수 있습니다.");
        return;
      }

      await deleteDoc(ref);
      alert("삭제 완료.");
      if(editingId === id) exitEditMode();
      setTab("mine");
    }catch(err){
      console.error(err);
      alert("삭제 실패: " + (err?.message || err));
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btnSubmit = document.getElementById("btnSubmit");
  const btnReset = document.getElementById("btnReset");
  const btnReload = document.getElementById("btnReload");
  const tabPublic = document.getElementById("tabPublic");
  const tabMine = document.getElementById("tabMine");
  const list = document.getElementById("list");
  const sel = document.getElementById("categorySel");
  const btnCancelEdit = document.getElementById("btnCancelEdit");

  // fold init
  const foldHead = document.getElementById("postFoldHead");
  try{
    const saved = localStorage.getItem("daina_jobs_fold");
    setFold(saved === "1");
  }catch{
    setFold(false);
  }

  if(foldHead){
    foldHead.addEventListener("click", toggleFold);
    foldHead.addEventListener("keydown", (e) => {
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        toggleFold();
      }
    });
  }

  if(list){
    list.addEventListener("click", (e) => {
      if(currentTab === "mine") handleMineAction(e);
    });
  }

  if(btnSubmit){
    btnSubmit.addEventListener("click", () => {
      if(editMode) submitEdit();
      else submitNew();
    });
  }

  if(btnReset){
    btnReset.addEventListener("click", () => {
      if(editMode){
        alert("편집 모드에서는 편집 취소를 사용하세요.");
        return;
      }
      resetForm();
    });
  }

  if(btnReload) btnReload.addEventListener("click", () => setTab(currentTab));
  if(tabPublic) tabPublic.addEventListener("click", () => setTab("public"));
  if(tabMine) tabMine.addEventListener("click", () => setTab("mine"));
  if(btnCancelEdit) btnCancelEdit.addEventListener("click", () => exitEditMode());

  if(sel){
    sel.addEventListener("change", () => {
      if(editMode) exitEditMode();
      syncCategoryUI();
      setTab(currentTab);
    });
  }

  syncCategoryUI();
  setTab("public");

  onAuthStateChanged(auth, (user) => {
    if(user){
      setAuthState("로그인됨: " + (user.displayName || user.email || ""));
      if(btnSubmit) btnSubmit.disabled = false;
      if(tabMine) tabMine.style.display = "";
    }else{
      setAuthState("로그인이 필요합니다.");
      if(btnSubmit) btnSubmit.disabled = true;
      if(tabMine) tabMine.style.display = "none";
      if(currentTab === "mine") setTab("public");
      if(editMode) exitEditMode();
    }
  });
});
