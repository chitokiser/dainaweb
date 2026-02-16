/* /public/assets/js/mypage.js */
import { auth, db } from "./firebaseApp.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { esc, setText, fmtDate, toast, openModal, closeModal, bindModalClose, pickText } from "./util.js";
import { getMyFlags } from "./roles.js";
import { CATEGORIES } from "./config.js";

import {
  listMyPosts,
  updateMyPost,
  setProgressStatus,
  categoryLabel,
  renderExtraInputs,
  buildExtraFromForm,
} from "./postsApi.js";

let user = null;
let _wired = false;

/* =========================
   내 글(통합)
========================= */

function fillMyCategorySelect() {
  const sel = document.getElementById("myPostsFilterCategory");
  if (!sel) return;
  if (sel.dataset.filled === "1") return;
  sel.dataset.filled = "1";

  CATEGORIES.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.key;
    opt.textContent = `${c.label} (${c.key})`;
    sel.appendChild(opt);
  });
}

function statusLabel(st) {
  const v = String(st || "");
  if (v === "approved") return "승인";
  if (v === "pending") return "대기";
  if (v === "rejected") return "반려";
  if (v === "hidden") return "숨김";
  return v || "-";
}

function progressLabel(p) {
  return String(p || "ongoing") === "done" ? "마감" : "진행중";
}

function pickImages(p) {
  const arr = [];
  if (p.coverUrl) arr.push(p.coverUrl);

  const t = Array.isArray(p.thumbs)
    ? p.thumbs
    : (Array.isArray(p.imageUrls) ? p.imageUrls : (Array.isArray(p.images) ? p.images : []));

  (t || []).forEach((it) => {
    const u = (typeof it === "string") ? it : (it?.url || it?.coverUrl || "");
    if (u && !arr.includes(u)) arr.push(u);
  });

  return arr.filter(Boolean).slice(0, 10);
}

function myPostCardHTML(p) {
  const title = esc(pickText(p, "title") || "(제목없음)");
  const descRaw = String(pickText(p, "desc") || p.content || "");
  const desc = esc(descRaw.slice(0, 90)) + (descRaw.length > 90 ? "…" : "");
  const area = esc(p.area || p.region || "");
  const dt = esc(fmtDate(p.updatedAt || p.createdAt));
  const cat = esc(categoryLabel(p.category || ""));
  const st = esc(statusLabel(p.status));
  const pr = esc(progressLabel(p.progressStatus));
  const cover = pickImages(p)[0] || "";

  return `
    <div class="item" data-post-id="${esc(p.id)}" style="align-items:flex-start; gap:14px;">
      <div style="width:86px;height:86px;border-radius:18px;overflow:hidden;border:1px solid rgba(11,18,32,.10);background:#fff;flex:0 0 auto;">
        ${cover ? `<img src="${esc(cover)}" alt="" style="width:100%;height:100%;object-fit:cover;" referrerpolicy="no-referrer" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(11,18,32,.35);font-size:12px;">no img</div>`}
      </div>
      <div style="flex:1;min-width:240px;">
        <p class="title" style="margin:0;">${title}</p>
        <div class="meta" style="margin-top:6px;">
          <span class="pill">${cat}</span>
          <span class="pill">상태: ${st}</span>
          <span class="pill">${pr}</span>
          ${area ? `<span class="pill">${area}</span>` : ``}
          <span class="pill">${dt}</span>
        </div>
        ${descRaw ? `<div class="desc" style="margin-top:8px;">${desc}</div>` : ``}

        
        <div class="meta" style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
          <a class="btn small" href="./post_detail.html?id=${encodeURIComponent(p.id)}">상세</a>
          <button class="btn small ok" type="button" data-act="edit">수정/보완</button>
          ${String(p.status || '') === 'approved' ? `<button class="btn small ghost" type="button" data-act="toggleDone">${String(p.progressStatus || 'ongoing') === 'done' ? '진행중으로' : '마감처리'}</button>` : ``}
        </div>

      </div>
    </div>
  `;
}

async function loadMyPostsArea() {
  const list = document.getElementById("myPostsList");
  const meta = document.getElementById("myPostsMeta");
  if (!list || !meta) return;

  fillMyCategorySelect();

  const st = document.getElementById("myPostsFilterStatus")?.value || "";
  const cat = document.getElementById("myPostsFilterCategory")?.value || "";

  list.innerHTML = `<div class="muted">불러오는 중...</div>`;

  try {
    const rows = await listMyPosts({
      ...(st ? { status: st } : {}),
      ...(cat ? { category: cat } : {}),
      lim: 120,
    });

    meta.textContent = `내 글 ${rows.length}건`;
    list.innerHTML = rows.length ? rows.map(myPostCardHTML).join("") : `<div class="muted">등록한 글이 없습니다.</div>`;

    list.querySelectorAll("[data-post-id]").forEach((row) => {
      row.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;

        const act = btn.dataset.act;
        const id = row.getAttribute("data-post-id");
        if (!id) return;

        if (act === "toggleDone") {
          const makeDone = btn.textContent.includes("마감");
          const next = makeDone ? "done" : "ongoing";
          if (next === "done") {
            const ok = confirm("마감 처리할까요? 마감되면 연락처가 자동으로 숨김 처리됩니다.");
            if (!ok) return;
          }
          try {
            await setProgressStatus(id, next);
            toast("저장 완료");
            await loadMyPostsArea();
          } catch (err) {
            alert(err?.message || err);
          }
          return;
        }

        if (act === "edit") {
          try {
            const snap = await getDoc(doc(db, "posts", id));
            const p = snap.exists() ? ({ id: snap.id, ...snap.data() }) : null;
            if (!p) throw new Error("글을 찾을 수 없습니다.");
            openEditModal(p);
          } catch (err) {
            alert(err?.message || err);
          }
        }
      });
    });
  } catch (e) {
    console.error(e);
    list.innerHTML = `<div class="muted">불러오기 실패: ${esc(e?.message || e)}</div>`;
  }
}

function openEditModal(p) {
  const imgs = pickImages(p);
  const thumbsText = imgs.join("\n");

  const cat = String(p.category || "");
  const isDone = String(p.progressStatus || 'ongoing') === 'done';
  const titleKo = pickText(p, "title") || "";
  const titleVi = (p.title && typeof p.title === "object") ? (p.title.vi || "") : "";
  const descKo = pickText(p, "desc") || (p.content || "");
  const descVi = (p.desc && typeof p.desc === "object") ? (p.desc.vi || "") : "";

  openModal(`
    <div class="form-grid">
      <div class="field">
        <label class="label">카테고리</label>
        <div class="pill">${esc(categoryLabel(cat))}</div>
      </div>
      <div class="field">
        <label class="label">상태</label>
        <div class="pill">${esc(statusLabel(p.status))} · ${esc(progressLabel(p.progressStatus))}</div>
      </div>

      <div class="field">
        <label class="label">지역</label>
        <input class="input" id="ed_area" value="${esc(p.area || p.region || "")}" placeholder="예: 하노이" />
      </div>
      <div class="field">
        <label class="label">태그</label>
        <input class="input" id="ed_tag" value="${esc(p.tag || "")}" placeholder="예: 카페" />
      </div>

      <div class="field full">
        <label class="label">제목(KR)</label>
        <input class="input" id="ed_titleKo" value="${esc(titleKo)}" placeholder="제목" />
      </div>
      <div class="field full">
        <label class="label">제목(VI, 선택)</label>
        <input class="input" id="ed_titleVi" value="${esc(titleVi)}" placeholder="Tiêu đề" />
      </div>

      <div class="field full">
        <label class="label">설명(KR)</label>
        <textarea class="textarea" id="ed_descKo" placeholder="상세 내용을 입력하세요">${esc(descKo)}</textarea>
      </div>
      <div class="field full">
        <label class="label">설명(VI, 선택)</label>
        <textarea class="textarea" id="ed_descVi" placeholder="Mô tả">${esc(descVi)}</textarea>
      </div>

      <div class="field">
        <label class="label">연락처</label>
        <input class="input" id="ed_contact" value="${esc(p.contact || "")}" placeholder="전화/Zalo/카톡 등" />
      </div>
      <div class="field" style="display:flex;align-items:flex-end;">
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;user-select:none;">
          <input type="checkbox" id="ed_contactPublic" ${(!isDone && p.contactPublic !== false) ? 'checked' : ''} ${isDone ? 'disabled' : ''} />
          <span class="sub">연락처 공개${isDone ? ' (마감 시 항상 비공개)' : ''}</span>
        </label>
      </div>

      <div class="field">
        <label class="label">지도 링크(선택)</label>
        <input class="input" id="ed_mapLink" value="${esc(p.mapLink || "")}" placeholder="https://maps.google.com/..." />
      </div>
      <div class="field">
        <label class="label">오픈채팅/메신저(선택)</label>
        <input class="input" id="ed_chatLink" value="${esc(p.chatLink || "")}" placeholder="https://open.kakao.com/..." />
      </div>

      <div class="field full">
        <label class="label">이미지 URL (대표 포함, 줄바꿈)</label>
        <textarea class="textarea" id="ed_imgs" rows="6" placeholder="https://...\nhttps://...">${esc(thumbsText)}</textarea>
        <div class="helper" style="margin-top:6px;">첫 줄이 대표 이미지로 저장됩니다. 최대 10개 권장.</div>
      </div>

      <div class="field full" id="ed_extraRoot"></div>

      <div class="field full" style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn ghost" type="button" id="btnEdCancel">취소</button>
        <button class="btn primary" type="button" id="btnEdSave">저장</button>
      </div>
    </div>
  `);

  const extraRoot = document.getElementById("ed_extraRoot");
  renderExtraInputs(cat, extraRoot, p.extra || {});

  document.getElementById("btnEdCancel")?.addEventListener("click", closeModal);

  document.getElementById("btnEdSave")?.addEventListener("click", async () => {
    try {
      const imageUrls = String(document.getElementById("ed_imgs")?.value || "")
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        category: cat,
        titleKo: String(document.getElementById("ed_titleKo")?.value || "").trim(),
        titleVi: String(document.getElementById("ed_titleVi")?.value || "").trim(),
        descKo: String(document.getElementById("ed_descKo")?.value || "").trim(),
        descVi: String(document.getElementById("ed_descVi")?.value || "").trim(),
        area: String(document.getElementById("ed_area")?.value || "").trim(),
        tag: String(document.getElementById("ed_tag")?.value || "").trim(),
        contact: String(document.getElementById("ed_contact")?.value || "").trim(),
        contactPublic: (String(p.progressStatus || 'ongoing') === 'done') ? false : !!document.getElementById("ed_contactPublic")?.checked,
        mapLink: String(document.getElementById("ed_mapLink")?.value || "").trim(),
        chatLink: String(document.getElementById("ed_chatLink")?.value || "").trim(),
        imageUrls,
        extra: buildExtraFromForm(cat, document),
      };

      await updateMyPost(p.id, payload);
      toast("수정 저장 완료 (승인글은 재승인 대기 상태로 전환될 수 있습니다)");
      closeModal();
      await loadMyPostsArea();
    } catch (err) {
      alert(err?.message || err);
    }
  });
}
 
/* =========================
   기존(구인/구직) 영역 - v19 유지
========================= */

function renderProfile(p) {
  if (!p) return `<div class="muted">구직 등록이 필요합니다.</div>`;
  return `
    <div class="kv">
      <div>
        <div style="font-size:14px; font-weight:800;">${esc(p.name || "-")}</div>
        <div class="sub" style="margin-top:4px;">${esc(p.category || "")} · ${esc(p.workStatus || "")} · ${esc(p.workRegion || "")}</div>
        <div class="sub" style="margin-top:6px;">${esc(p.skills || "")}</div>
      </div>
      <div class="actions">
        <a class="btn primary" href="./register_jobseeker.html">수정</a>
      </div>
    </div>
    <div class="hr"></div>
    <div style="white-space:pre-wrap;">${p.profile ? esc(p.profile) : `<span class="muted">프로필 없음</span>`}</div>
  `;
}

async function loadEmployerArea() {
  const list = document.getElementById("myJobs");
  const meta = document.getElementById("myJobsMeta");

  const qy = query(collection(db, "job_posts"), where("ownerUid", "==", user.uid), orderBy("createdAt", "desc"), limit(30));
  const snap = await getDocs(qy);
  const jobs = [];
  snap.forEach((d) => jobs.push({ id: d.id, ...d.data() }));

  if (meta) meta.textContent = `내 공고 ${jobs.length}건`;
  if (!list) return;

  if (!jobs.length) {
    list.innerHTML = `<div class="muted">등록한 공고가 없습니다.</div>`;
  } else {
    list.innerHTML = jobs.map((j) => {
      const canEdit = j.status === "reviewing";
      return `
        <div class="item">
          <div>
            <p class="title">${esc(j.title || "-")}</p>
            <div class="meta">
              <span class="pill">상태: ${esc(j.status || "-")}</span>
              <span class="pill">${esc(j.companyName || "")}</span>
              <span class="pill">${esc(j.workRegion || "")}</span>
              <span class="pill">등록: ${esc(fmtDate(j.createdAt))}</span>
            </div>
            ${canEdit ? `<div class="desc">검토중일 때만 수정 요청(직접 수정) 가능합니다.</div>` : ``}
          </div>
          <div class="right">
            <a class="btn" href="./job_detail.html?id=${encodeURIComponent(j.id)}">상세</a>
            ${canEdit ? `<button class="btn primary" data-edit="${esc(j.id)}" type="button">수정</button>` : ``}
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("button[data-edit]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-edit");
        const snap2 = await getDoc(doc(db, "job_posts", id));
        const j = snap2.data() || {};
        const newTitle = prompt("공고 제목 수정", j.title || "");
        if (newTitle == null) return;

        try {
          await updateDoc(doc(db, "job_posts", id), {
            title: newTitle.trim(),
            updatedAt: serverTimestamp(),
          });
          toast("수정 저장 완료 (관리자 검토중)");
          await loadEmployerArea();
        } catch (e) {
          console.error(e);
          toast("수정 실패 (권한/규칙 확인)");
        }
      });
    });
  }

  const shortList = document.getElementById("shortList");
  const shortMeta = document.getElementById("shortMeta");

  const q2 = query(collection(db, "job_shortlists"), where("employerUid", "==", user.uid), orderBy("deliveredAt", "desc"), limit(80));
  const s2 = await getDocs(q2);
  const rows = [];
  s2.forEach((d) => rows.push({ id: d.id, ...d.data() }));

  if (shortMeta) shortMeta.textContent = `전달 ${rows.length}명`;
  if (!shortList) return;

  if (!rows.length) {
    shortList.innerHTML = `<div class="muted">관리자가 전달한 지원자가 없습니다.</div>`;
  } else {
    shortList.innerHTML = rows.map((a) => {
      return `
        <div class="item" style="align-items:flex-start;">
          <div style="display:flex; gap:12px; align-items:flex-start;">
            <div style="width:62px; height:62px; border-radius:16px; overflow:hidden; border:1px solid rgba(11,18,32,.10); background:#fff;">
              ${a.photoUrl ? `<img src="${esc(a.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;" referrerpolicy="no-referrer" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(11,18,32,.35);font-size:12px;">no photo</div>`}
            </div>
            <div>
              <p class="title">${esc(a.name || "-")} <span class="muted" style="font-weight:500; font-size:12px;">(job: ${esc(a.jobId || "")})</span></p>
              <div class="meta">
                ${a.phone ? `<span class="pill">${esc(a.phone)}</span>` : ``}
                ${a.email ? `<span class="pill">${esc(a.email)}</span>` : ``}
                ${a.sns ? `<span class="pill">${esc(a.sns)}</span>` : ``}
                ${a.category ? `<span class="pill">${esc(a.category)}</span>` : ``}
                <span class="pill">${esc(fmtDate(a.deliveredAt))}</span>
              </div>
              ${a.skills ? `<div class="desc">${esc(a.skills)}</div>` : ``}
            </div>
          </div>
        </div>
      `;
    }).join("");
  }
}

async function loadJobseekerArea() {
  const pSnap = await getDoc(doc(db, "jobseekers", user.uid));
  const p = pSnap.exists() ? (pSnap.data() || {}) : null;
  const profileRoot = document.getElementById("myProfile");
  if (profileRoot) profileRoot.innerHTML = renderProfile(p);

  const list = document.getElementById("myApps");
  const meta = document.getElementById("myAppsMeta");

  const qy = query(collection(db, "job_applications"), where("applicantUid", "==", user.uid), orderBy("createdAt", "desc"), limit(60));
  const snap = await getDocs(qy);
  const rows = [];
  snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));

  if (meta) meta.textContent = `내 지원 ${rows.length}건`;
  if (!list) return;

  if (!rows.length) {
    list.innerHTML = `<div class="muted">지원 내역이 없습니다.</div>`;
  } else {
    list.innerHTML = rows.map((a) => {
      return `
        <div class="item">
          <div>
            <p class="title">공고: ${esc(a.jobId || "-")}</p>
            <div class="meta">
              <span class="pill">상태: ${esc(a.status || "applied")}</span>
              <span class="pill">${esc(fmtDate(a.createdAt))}</span>
            </div>
          </div>
          <div class="right">
            <a class="btn" href="./job_detail.html?id=${encodeURIComponent(a.jobId || "")}">공고</a>
          </div>
        </div>
      `;
    }).join("");
  }
}

/* =========================
   init
========================= */

function wireOnce() {
  if (_wired) return;
  _wired = true;

  bindModalClose();

  document.getElementById("btnReloadMyPosts")?.addEventListener("click", () => {
    if (user) loadMyPostsArea();
  });

  document.getElementById("myPostsFilterStatus")?.addEventListener("change", () => {
    if (user) loadMyPostsArea();
  });

  document.getElementById("myPostsFilterCategory")?.addEventListener("change", () => {
    if (user) loadMyPostsArea();
  });
}

onAuthStateChanged(auth, async (u) => {
  wireOnce();

  user = u || null;
  const aw = document.getElementById("authWarn");
  if (aw) aw.style.display = user ? "none" : "block";

  if (!user) {
    setText("roleLine", "로그인이 필요합니다.");
    document.getElementById("employerArea").style.display = "none";
    document.getElementById("jobseekerArea").style.display = "none";
    document.getElementById("myPostsArea").style.display = "none";
    return;
  }

  document.getElementById("myPostsArea").style.display = "block";

  const flags = await getMyFlags(user.uid);
  setText(
    "roleLine",
    `로그인: ${user.email || user.uid} · 역할: ${flags.admin ? "admin " : ""}${flags.hasEmployer ? "구인자 " : ""}${flags.hasJobseeker ? "구직자 " : ""}`
  );

  document.getElementById("employerArea").style.display = flags.hasEmployer ? "block" : "none";
  document.getElementById("jobseekerArea").style.display = flags.hasJobseeker ? "block" : "none";

  await loadMyPostsArea();
  if (flags.hasEmployer) await loadEmployerArea();
  if (flags.hasJobseeker) await loadJobseekerArea();
});
