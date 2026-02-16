// /public/assets/js/adminPage.js
import { auth, db } from "./firebaseApp.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  setDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { CATEGORIES, POSTS_COLLECTION, REPORTS_COLLECTION } from "./config.js";
import {
  categoryLabel,
  isAdmin,
  adminApprove,
  adminReject,
  adminHide,
  adminDelete,
  adminUpdatePost,
  adminClosePost,
} from "./postsApi.js";
import { esc, fmtDT, toast } from "./util.js";


/* =========================
   Sub admin invite
========================= */
function normEmail(v){
  return String(v ?? "").trim().toLowerCase();
}

function validEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function addSubAdminInvite(email){
  if(!_user) throw new Error("로그인이 필요합니다.");
  if(!_isAdmin) throw new Error("관리자 권한이 필요합니다.");

  const e = normEmail(email);
  if(!validEmail(e)) throw new Error("이메일 형식이 올바르지 않습니다.");

  // 초대 문서: adminInvites/{email}
  const ref = doc(db, "adminInvites", e);
  await setDoc(ref, {
    email: e,
    enabled: true,
    invitedByUid: _user.uid,
    invitedByEmail: _user.email || "",
    invitedAt: serverTimestamp(),
  }, { merge: true });

  return e;
}

function bindSubAdminUi(){
  const pane = el("subAdminPane");
  const input = el("subAdminEmail");
  const btn = el("btnAddSubAdmin");
  const msg = el("subAdminMsg");
  if(!pane || !input || !btn) return;

  if(_isAdmin){
    pane.style.display = "block";
  }else{
    pane.style.display = "none";
    return;
  }

  btn.addEventListener("click", async ()=>{
    const raw = input.value;
    try{
      btn.disabled = true;
      msg && (msg.textContent = "처리 중...");
      const email = await addSubAdminInvite(raw);
      msg && (msg.textContent = `서브 관리자 초대 완료: ${email}\n해당 이메일로 구글 로그인 후, 자동으로 관리자 권한이 부여됩니다.`);
      input.value = "";
      toast("서브 관리자 초대 완료");
    }catch(e){
      console.error(e);
      msg && (msg.textContent = `실패: ${e?.message || e}`);
      toast(e?.message || "실패");
    }finally{
      btn.disabled = false;
    }
  });
}

/* =========================================================
  v19 adminPage.js
  - 권한 게이트(gate) 확실히 숨김/표시
  - 글관리: pending/approved/rejected/hidden 상태 필터 + 검색 + 리스트 + 에디터
  - 승인/반려/숨김/삭제(승인된 글도 삭제 가능)
  - 신고관리: open/resolved/dismissed 필터 + 처리완료/기각 + 글숨김
  - 인덱스 에러 방지: 복합쿼리 실패 시 fallback(단일 where 후 JS 필터)
========================================================= */

const POSTS = POSTS_COLLECTION || "posts";
const REPORTS = REPORTS_COLLECTION || "reports";

let _user = null;
let _isAdmin = false;

let _tab = "posts"; // posts | reports
let _postsCache = [];
let _reportsCache = [];

let _selectedPost = null;
let _selectedReport = null;

/* =========================
   DOM
========================= */
function el(id) {
  return document.getElementById(id);
}

function gateShow(msg = "로그인 및 관리자 권한이 필요합니다.") {
  const g = el("gate");
  if (!g) return;
  g.classList.remove("hide");
  g.style.display = "block";
  const t = g.querySelector(".notice-title");
  const b = g.querySelector(".notice-body");
  if (t) t.textContent = "권한 확인 중...";
  if (b) b.textContent = msg;
}

function gateHide() {
  const g = el("gate");
  if (!g) return;
  g.classList.add("hide");
  g.style.display = "none";
}

function setTabsUI() {
  const tabs = el("adminTabs");
  if (!tabs) return;
  tabs.querySelectorAll(".tab").forEach((btn) => {
    const on = btn.dataset.tab === _tab;
    btn.classList.toggle("active", on);
  });

  el("postsPane")?.classList.toggle("hide", _tab !== "posts");
  el("reportsPane")?.classList.toggle("hide", _tab !== "reports");
}

function fillCategorySelects() {
  const sel = el("adminCat");
  const sel2 = el("edCategory");
  const opts = [
    `<option value="all">전체</option>`,
    ...CATEGORIES.map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`),
  ].join("");
  if (sel) sel.innerHTML = opts;
  if (sel2) sel2.innerHTML = CATEGORIES.map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join("");

  // 기본값
  if (sel && !sel.value) sel.value = "all";
  if (sel2 && !sel2.value) sel2.value = CATEGORIES[0]?.key || "jobs";
}

function fillStatusSelect() {
  const sel = el("adminStatus");
  if (!sel) return;
  sel.innerHTML = [
    `<option value="pending">pending</option>`,
    `<option value="approved">approved</option>`,
    `<option value="rejected">rejected</option>`,
    `<option value="hidden">hidden</option>`,
    `<option value="all">all</option>`,
  ].join("");
  if (!sel.value) sel.value = "pending";
}

/* =========================
   Helpers
========================= */
function norm(v) {
  return String(v ?? "").trim();
}

function postText(p) {
  const title = typeof p.title === "object" ? (p.title.ko || p.title.vi || "") : (p.title || "");
  const desc = typeof p.desc === "object" ? (p.desc.ko || p.desc.vi || "") : (p.desc || "");
  const content = p.content || desc || "";
  const area = p.area || p.region || "";
  const email = p.ownerEmail || "";
  return `${title}\n${content}\n${area}\n${email}`.toLowerCase();
}

function pickTitle(p) {
  if (typeof p.title === "object") return p.title.ko || p.title.vi || "";
  return p.title || "";
}

function pickDesc(p) {
  if (typeof p.desc === "object") return p.desc.ko || p.desc.vi || "";
  return p.desc || p.content || "";
}

function pickImages(p) {
  const arr = [];
  if (p.coverUrl) arr.push(p.coverUrl);
  if (p.coverImage) arr.push(p.coverImage);
  if (p.repImageUrl) arr.push(p.repImageUrl);
  if (Array.isArray(p.thumbs)) arr.push(...p.thumbs);
  if (Array.isArray(p.imageUrls)) arr.push(...p.imageUrls);
  if (Array.isArray(p.images)) {
    for (const x of p.images) {
      if (typeof x === "string") arr.push(x);
      else if (x?.url) arr.push(x.url);
    }
  }
  // 중복 제거 + 빈 값 제거
  const out = [];
  for (const u of arr) {
    const v = norm(u);
    if (!v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out.slice(0, 10);
}

function statusPillHTML(st) {
  const s = esc(st || "-");
  return `<span class="pill st-${s}">${s}</span>`;
}

function safeTS(v) {
  // Firestore Timestamp or ISO string
  try {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (typeof v.toDate === "function") return v.toDate().toISOString();
  } catch {}
  return "";
}

/* =========================
   Firestore Queries (with fallback)
========================= */
async function fetchPosts() {
  const cat = el("adminCat")?.value || "all";
  const st = el("adminStatus")?.value || "pending";
  const qtxt = (el("adminSearch")?.value || "").trim().toLowerCase();

  // 우선: 가장 원하는 쿼리 (category/status/order)
  // 인덱스 없으면 실패할 수 있으니 try/catch + fallback
  let rows = [];
  try {
    let q1;
    if (st === "all" && cat === "all") {
      q1 = query(collection(db, POSTS), orderBy("createdAt", "desc"), limit(200));
    } else if (st === "all") {
      q1 = query(collection(db, POSTS), where("category", "==", cat), orderBy("createdAt", "desc"), limit(200));
    } else if (cat === "all") {
      q1 = query(collection(db, POSTS), where("status", "==", st), orderBy("createdAt", "desc"), limit(200));
    } else {
      q1 = query(
        collection(db, POSTS),
        where("category", "==", cat),
        where("status", "==", st),
        orderBy("createdAt", "desc"),
        limit(200)
      );
    }

    const snap = await getDocs(q1);
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // fallback: 단일 where만 사용 (인덱스 최소화)
    console.warn("primary query failed, fallback:", e);

    let q2;
    if (st !== "all") {
      q2 = query(collection(db, POSTS), where("status", "==", st), limit(400));
    } else if (cat !== "all") {
      q2 = query(collection(db, POSTS), where("category", "==", cat), limit(400));
    } else {
      q2 = query(collection(db, POSTS), limit(400));
    }

    const snap2 = await getDocs(q2);
    rows = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));

    // JS 후처리 filter
    if (cat !== "all") rows = rows.filter((p) => (p.category || "") === cat);
    if (st !== "all") rows = rows.filter((p) => (p.status || "") === st);

    // JS sort (createdAtIso 우선)
    rows.sort((a, b) => {
      const ai = (a.updatedAtIso || a.createdAtIso || safeTS(a.updatedAt) || safeTS(a.createdAt) || "");
      const bi = (b.updatedAtIso || b.createdAtIso || safeTS(b.updatedAt) || safeTS(b.createdAt) || "");
      return bi.localeCompare(ai);
    });
  }

  // 검색
  if (qtxt) {
    rows = rows.filter((p) => postText(p).includes(qtxt));
  }

  _postsCache = rows;
  return rows;
}

async function fetchReports() {
  const st = el("repStatus")?.value || "open";
  const qtxt = (el("repSearch")?.value || "").trim().toLowerCase();

  let rows = [];
  try {
    const q1 = query(
      collection(db, REPORTS),
      where("status", "==", st),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const snap = await getDocs(q1);
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("reports primary query failed, fallback:", e);
    const q2 = query(collection(db, REPORTS), where("status", "==", st), limit(300));
    const snap2 = await getDocs(q2);
    rows = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => {
      const ai = (a.createdAtIso || safeTS(a.createdAt) || "");
      const bi = (b.createdAtIso || safeTS(b.createdAt) || "");
      return bi.localeCompare(ai);
    });
  }

  if (qtxt) {
    rows = rows.filter((r) => {
      const s = `${r.reason || ""}\n${r.email || ""}\n${r.targetId || ""}\n${r.kind || ""}`.toLowerCase();
      return s.includes(qtxt);
    });
  }

  _reportsCache = rows;
  return rows;
}

/* =========================
   Render: Posts List + Editor
========================= */
function postCardHTML(p) {
  const id = esc(p.id);
  const cat = esc(p.category || "");
  const catLabel = esc(p.categoryLabel || categoryLabel(cat) || cat);
  const st = esc(p.status || "");
  const dt = fmtDT(p.updatedAt || p.createdAt);
  const owner = esc(p.ownerEmail || p.ownerName || "-");
  const area = esc(p.area || p.region || "-");
  const title = esc(pickTitle(p) || "(제목없음)");
  const desc = esc((pickDesc(p) || "").slice(0, 140)) + ((pickDesc(p) || "").length > 140 ? "…" : "");

  return `
  <article class="card" data-id="${id}">
    <div class="card-body">
      <div class="card-top">
        <div class="card-title">${title}</div>
        <div class="card-badges">
          <span class="badge">${catLabel}</span>
          ${statusPillHTML(st)}
        </div>
      </div>

      <div class="card-desc">${desc}</div>

      <div class="card-meta">
        <span>${area}</span>
        <span>${dt}</span>
        <span class="muted">${owner}</span>
      </div>

      <div class="card-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn small ghost" type="button" data-act="select">선택</button>
        <button class="btn small ghost" type="button" data-act="open">보기</button>

        ${st === "pending" ? `
          <button class="btn small ok" type="button" data-act="approve">승인</button>
          <button class="btn small danger" type="button" data-act="reject">반려</button>
          <button class="btn small danger" type="button" data-act="hide">숨김</button>
          <button class="btn small danger" type="button" data-act="delete">삭제</button>
        ` : ``}

        ${st === "approved" ? `
          <button class="btn small danger" type="button" data-act="close">마감</button>
          <button class="btn small danger" type="button" data-act="hide">숨김</button>
          <button class="btn small danger" type="button" data-act="delete">삭제</button>
        ` : ``}

        ${st === "rejected" ? `
          <button class="btn small ok" type="button" data-act="approve">승인</button>
          <button class="btn small danger" type="button" data-act="delete">삭제</button>
        ` : ``}

        ${st === "hidden" ? `
          <button class="btn small ok" type="button" data-act="approve">승인(복구)</button>
          <button class="btn small danger" type="button" data-act="delete">삭제</button>
        ` : ``}
      </div>
    </div>
  </article>
  `;
}

function renderPostsList(rows) {
  const root = el("adminList");
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = `<div class="empty">결과가 없습니다.</div>`;
    return;
  }
  root.innerHTML = rows.map(postCardHTML).join("");

  root.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      const id = card.dataset.id;
      if (!id) return;
      const p = _postsCache.find((x) => x.id === id);
      if (!p) return;

      if (act === "select") {
        selectPost(p);
        return;
      }

      if (act === "open") {
        location.href = `./post_detail.html?id=${encodeURIComponent(id)}`;
        return;
      }

      if (!_isAdmin) {
        alert("관리자 권한이 없습니다.");
        return;
      }

      try {
        if (act === "approve") {
          await adminApprove(id);
          toast("승인 완료");
          await refreshPosts();
          return;
        }

        if (act === "reject") {
          const reason = prompt("반려 사유를 입력하세요", "");
          if (!reason) return;
          await adminReject(id, reason);
          toast("반려 완료");
          await refreshPosts();
          return;
        }

        if (act === "close") {
          if (!confirm("이 글을 마감 처리할까요? 마감되면 연락처는 항상 비공개 처리됩니다.")) return;
          await adminClosePost(id);
          toast("마감 완료");
          await refreshPosts();
          return;
        }

        if (act === "hide") {
          if (!confirm("이 글을 숨김 처리할까요?")) return;
          await updateDoc(doc(db, POSTS, id), {
            status: "hidden",
            hiddenAt: serverTimestamp(),
            hiddenAtIso: new Date().toISOString(),
            updatedAt: serverTimestamp(),
            updatedAtIso: new Date().toISOString(),
          });
          toast("숨김 완료");
          await refreshPosts();
          return;
        }

        if (act === "delete") {
          if (!confirm("정말 삭제할까요? (승인된 글도 삭제됩니다)")) return;
          await deleteDoc(doc(db, POSTS, id));
          toast("삭제 완료");
          // 에디터가 이 글을 보고 있으면 닫기
          if (_selectedPost?.id === id) {
            _selectedPost = null;
            el("editor")?.classList.add("hide");
          }
          await refreshPosts();
          return;
        }
      } catch (err) {
        console.error(err);
        alert(err?.message || err);
      }
    });
  });
}

function selectPost(p) {
  _selectedPost = p;
  const post = p;
  const editor = el("editor");
  if (!editor) return;
  editor.classList.remove("hide");

  el("edStatus").outerHTML = statusPillHTML(p.status || "-").replace('class="pill', 'class="pill" id="edStatus"');
  el("edOwner").textContent = p.ownerEmail || p.ownerName || "-";
  el("edId").textContent = p.id;

  const catSel = el("edCategory");
  if (catSel) catSel.value = p.category || (CATEGORIES[0]?.key || "jobs");

  el("edArea").value = p.area || p.region || "";
  el("edTitle").value = pickTitle(p) || "";
  el("edTag").value = p.tag || (Array.isArray(p.tags) ? p.tags.join(", ") : "");
  el("edContact").value = p.contact || "";
  el("edDesc").value = pickDesc(p) || "";
  el("edReason").value = p.rejectReason || "";

  const imgs = pickImages(p);
  const imgsRoot = el("edImgs");
  if (imgsRoot) {
    const preview = imgs.length
      ? imgs.slice(0, 6).map((u, i) => `<img class="thumb" src="${esc(u)}" alt="img${i + 1}" loading="lazy" />`).join("")
      : `<div class="muted">이미지 없음</div>`;

    const cover = esc(post.coverUrl || imgs[0] || "");
    const thumbsText = (Array.isArray(post.thumbs) && post.thumbs.length ? post.thumbs : imgs)
      .filter(Boolean)
      .slice(0, 10)
      .join("\n");

    imgsRoot.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
        <div style="flex:1;min-width:240px;">
          <div class="muted" style="margin:6px 0;">미리보기</div>
          <div class="thumbs">${preview}</div>
        </div>

        <div style="flex:1;min-width:280px;">
          <div class="field" style="margin-top:6px;">
            <label class="label">대표 이미지 URL (coverUrl)</label>
            <input class="input" id="edCoverUrl" placeholder="https://..." value="${cover}" />
          </div>
          <div class="field" style="margin-top:10px;">
            <label class="label">추가 이미지 URL (thumbs, 줄바꿈)</label>
            <textarea class="textarea" id="edThumbsText" rows="6" placeholder="https://...\nhttps://...">${esc(thumbsText)}</textarea>
            <div class="helper" style="margin-top:6px;">대표 포함 최대 10개 권장. 빈 줄은 무시됩니다.</div>
          </div>
        </div>
      </div>
    `;
  }

  // 버튼 표시 규칙
  const st = String(p.status || "");
  const btnApprove = el("btnApprove");
  const btnReject = el("btnReject");
  const btnHide = el("btnHide");
  const btnClose = el("btnClose");

  // 저장 버튼(없으면 동적으로 생성)
  let btnSave = el("btnSave");
  if (!btnSave && btnApprove && btnApprove.parentElement) {
    btnSave = document.createElement("button");
    btnSave.className = "btn ghost";
    btnSave.id = "btnSave";
    btnSave.type = "button";
    btnSave.textContent = "저장";
    btnApprove.parentElement.insertBefore(btnSave, btnApprove);
  }

  if (btnApprove) btnApprove.style.display = _isAdmin ? "" : "none";
  if (btnReject) btnReject.style.display = _isAdmin ? "" : "none";
  if (btnHide) btnHide.style.display = _isAdmin ? "" : "none";
  if (btnClose) btnClose.style.display = (_isAdmin && String(post.status || "") === "approved") ? "" : "none";

  if (_isAdmin) {
    if (btnApprove) btnApprove.disabled = false;
    if (btnReject) btnReject.disabled = false;
    if (btnHide) btnHide.disabled = false;

    // 승인된 글도 삭제는 “리스트 카드”에서 제공 (요청사항)
  }

  // 에디터 버튼 핸들러 (중복 등록 방지: onclick 사용)
  function editorPayload() {
    return {
      category: edCategory?.value || post.category,
      area: edArea?.value || post.area || "",
      tag: edTag?.value || post.tag || "",
      titleKo: edTitle?.value || pickTitle(post),
      descKo: edDesc?.value || pickDesc(post) || "",
      contact: edContact?.value || post.contact || "",
      // 이미지 URL 편집 (coverUrl + thumbs)
      coverUrl: (document.getElementById("edCoverUrl")?.value || post.coverUrl || "").trim(),
      thumbs: (() => {
        const t = (document.getElementById("edThumbsText")?.value || "")
          .split(/\n+/)
          .map((x) => x.trim())
          .filter(Boolean);
        return t.slice(0, 10);
      })(),
      imageUrls: (() => {
        const c = (document.getElementById("edCoverUrl")?.value || post.coverUrl || "").trim();
        const t = (document.getElementById("edThumbsText")?.value || "")
          .split(/\n+/)
          .map((x) => x.trim())
          .filter(Boolean);
        return [c, ...t].filter(Boolean).slice(0, 10);
      })(),
    };
  }

  async function saveEditsOnly() {
    await adminUpdatePost(post.id, editorPayload());
    toast("저장 완료");
    await load();
  }

  if (btnSave) {
    btnSave.onclick = async () => {
      try {
        await saveEditsOnly();
      } catch (e) {
        toast(e?.message || "저장 실패");
      }
    };
  }

  btnApprove.onclick = async () => {
    try {
      await adminUpdatePost(post.id, editorPayload());
      await adminApprove(post.id);
      toast("승인 완료");
      await load();
    } catch (e) {
      toast(e?.message || "승인 실패");
    }
  };

  btnReject.onclick = async () => {
    const reason = prompt("반려 사유를 입력하세요", post.rejectReason || "") || "";
    try {
      await adminUpdatePost(post.id, editorPayload());
      await adminReject(post.id, reason);
      toast("반려 처리");
      await load();
    } catch (e) {
      toast(e?.message || "반려 실패");
    }
  };

  btnHide.onclick = async () => {
    try {
      await adminUpdatePost(post.id, editorPayload());
      await adminHide(post.id);
      toast("숨김 처리");
      await load();
    } catch (e) {
      toast(e?.message || "숨김 실패");
    }
  };

  if (btnClose) {
    btnClose.onclick = async () => {
      if (!confirm("이 글을 마감 처리할까요? 마감되면 연락처는 항상 비공개 처리됩니다.")) return;
      try {
        await adminClosePost(post.id);
        toast("마감 완료");
        await load();
      } catch (e) {
        toast(e?.message || "마감 실패");
      }
    };
  }
}

/* =========================
   Reports UI
========================= */
function reportCardHTML(r) {
  const id = esc(r.id);
  const dt = fmtDT(r.createdAt);
  const st = esc(r.status || "-");
  const kind = esc(r.kind || "post");
  const targetId = esc(r.targetId || "-");
  const email = esc(r.email || "-");
  const reason = esc((r.reason || "").slice(0, 140)) + ((r.reason || "").length > 140 ? "…" : "");

  return `
  <article class="card" data-id="${id}">
    <div class="card-body">
      <div class="card-top">
        <div class="card-title">${kind} · ${targetId}</div>
        <div class="card-badges">${statusPillHTML(st)}</div>
      </div>
      <div class="card-desc">${reason}</div>
      <div class="card-meta">
        <span>${dt}</span>
        <span class="muted">${email}</span>
      </div>
      <div class="card-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn small ghost" type="button" data-act="select">선택</button>
      </div>
    </div>
  </article>
  `;
}

function renderReportsList(rows) {
  const root = el("repList");
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = `<div class="empty">결과가 없습니다.</div>`;
    return;
  }

  root.innerHTML = rows.map(reportCardHTML).join("");

  root.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = card.dataset.id;
      const r = _reportsCache.find((x) => x.id === id);
      if (!r) return;
      selectReport(r);
    });
  });
}

function selectReport(r) {
  _selectedReport = r;
  const editor = el("repEditor");
  if (!editor) return;
  editor.classList.remove("hide");

  el("repId").textContent = r.id;
  el("repStatusPill").textContent = r.status || "-";
  el("repTarget").textContent = `${r.kind || "post"} / ${r.targetId || "-"}`;
  el("repReason").value = r.reason || "";
  el("repReporter").textContent = `${r.email || "-"} / ${r.uid || "-"}`;
  el("repAdminNote").value = r.adminNote || "";

  const btnResolve = el("btnRepResolve");
  const btnDismiss = el("btnRepDismiss");
  const btnHidePost = el("btnRepHidePost");

  btnResolve.onclick && (btnResolve.onclick = null);
  btnDismiss.onclick && (btnDismiss.onclick = null);
  btnHidePost.onclick && (btnHidePost.onclick = null);

  btnResolve?.addEventListener("click", async () => {
    if (!_isAdmin) return alert("관리자 권한이 없습니다.");
    if (!_selectedReport) return;
    try {
      await updateDoc(doc(db, REPORTS, _selectedReport.id), {
        status: "resolved",
        adminNote: norm(el("repAdminNote")?.value),
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
      });
      toast("처리완료");
      await refreshReports();
    } catch (err) {
      console.error(err);
      alert(err?.message || err);
    }
  });

  btnDismiss?.addEventListener("click", async () => {
    if (!_isAdmin) return alert("관리자 권한이 없습니다.");
    if (!_selectedReport) return;
    try {
      await updateDoc(doc(db, REPORTS, _selectedReport.id), {
        status: "dismissed",
        adminNote: norm(el("repAdminNote")?.value),
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
      });
      toast("기각 처리");
      await refreshReports();
    } catch (err) {
      console.error(err);
      alert(err?.message || err);
    }
  });

  btnHidePost?.addEventListener("click", async () => {
    if (!_isAdmin) return alert("관리자 권한이 없습니다.");
    if (!_selectedReport) return;
    const targetId = norm(_selectedReport.targetId);
    if (!targetId) return alert("targetId가 없습니다.");
    if (!confirm("이 신고의 글을 숨김 처리할까요?")) return;

    try {
      await updateDoc(doc(db, POSTS, targetId), {
        status: "hidden",
        hiddenAt: serverTimestamp(),
        hiddenAtIso: new Date().toISOString(),
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
      });
      toast("글 숨김 완료");
    } catch (err) {
      console.error(err);
      alert(err?.message || err);
    }
  });
}

/* =========================
   Refresh
========================= */
async function refreshPosts() {
  const list = el("adminList");
  if (list) list.innerHTML = `<div class="muted pad">불러오는 중...</div>`;
  try {
    const rows = await fetchPosts();
    renderPostsList(rows);

    // 선택된 글 유지 (가능하면)
    if (_selectedPost) {
      const again = _postsCache.find((x) => x.id === _selectedPost.id);
      if (again) selectPost(again);
      else el("editor")?.classList.add("hide");
    }
  } catch (e) {
    console.error(e);
    if (list) list.innerHTML = `<div class="empty">불러오기 실패: ${esc(e?.message || e)}</div>`;
  }
}

async function refreshReports() {
  const list = el("repList");
  if (list) list.innerHTML = `<div class="muted pad">불러오는 중...</div>`;
  try {
    const rows = await fetchReports();
    renderReportsList(rows);

    if (_selectedReport) {
      const again = _reportsCache.find((x) => x.id === _selectedReport.id);
      if (again) selectReport(again);
      else el("repEditor")?.classList.add("hide");
    }
  } catch (e) {
    console.error(e);
    if (list) list.innerHTML = `<div class="empty">불러오기 실패: ${esc(e?.message || e)}</div>`;
  }
}

/* =========================
   Admin check
========================= */
async function checkAdmin(user) {
  if (!user) return false;
  try {
    // postsApi.isAdmin()가 admins/{uid} enabled 기반으로 구현되어 있음
    return await isAdmin();
  } catch {
    // fallback: 직접 확인
    try {
      const ref = doc(db, "admins", user.uid);
      const snap = await getDoc(ref);
      return snap.exists() && snap.data()?.enabled !== false;
    } catch {
      return false;
    }
  }
}

/* =========================
   Events
========================= */
function bindUI() {
  // Tabs
  el("adminTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    _tab = btn.dataset.tab || "posts";
    setTabsUI();
    if (_tab === "posts") refreshPosts();
    else refreshReports();
  });

  // Posts filters
  el("adminCat")?.addEventListener("change", () => refreshPosts());
  el("adminStatus")?.addEventListener("change", () => refreshPosts());
  el("btnReload")?.addEventListener("click", () => refreshPosts());

  el("adminSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") refreshPosts();
  });

  // Reports filters
  el("repStatus")?.addEventListener("change", () => refreshReports());
  el("btnRepReload")?.addEventListener("click", () => refreshReports());
  el("repSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") refreshReports();
  });
}

/* =========================
   Boot
========================= */
onAuthStateChanged(auth, async (user) => {
  _user = user || null;
  gateShow("로그인 및 관리자 권한을 확인 중입니다.");

  if (!_user) {
    _isAdmin = false;
    gateShow("로그인이 필요합니다.");
    return;
  }

  try {
    const ok = await checkAdmin(_user);
    _isAdmin = !!ok;

    if (!_isAdmin) {
      gateShow("관리자 권한이 없습니다. (admins/{uid}.enabled=true 필요)");
      return;
    }

    gateHide();

    // 서브 관리자 UI
    bindSubAdminUi();

    // 탭/데이터 갱신
    if (_tab === "posts") await refreshPosts();
    else await refreshReports();
  } catch (e) {
    console.error(e);
    _isAdmin = false;
    gateShow(e?.message || "권한 확인 실패");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  fillCategorySelects();
  fillStatusSelect();
  setTabsUI();
  bindUI();

  // 초기 화면: 게이트 표시
  gateShow("로그인 및 관리자 권한이 필요합니다.");
});
