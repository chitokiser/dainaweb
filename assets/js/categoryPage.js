// /public/assets/js/categoryPage.js
import { auth } from "./firebaseApp.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { CATEGORIES } from "./config.js";
import {
  categoryLabel,
  renderExtraInputs,
  buildExtraFromForm,
  createPost,
  listApprovedPosts,
  listMyPosts,
  updateMyPost,
  deletePendingPost,
  bumpPost,
  toggleLike,
  setProgressStatus,
  getPost,
  reportItem,
  addComment,
} from "./postsApi.js";
import { esc, fmtDT, toast, bindModalClose } from "./util.js";

/* =========================================================
  v19 정합 + 기능
  - 카테고리별 내 글 보기(해당 페이지 카테고리로 필터)
  - 진행중/완료 변경(작성자)
  - 인덱스 에러는 postsApi에서 fallback 처리
  - extra box 렌더/수집 정상화
========================================================= */

let __latestUser = null;

function applyAuthUI(user) {
  const tip = document.getElementById("loginTip");
  const btn = document.getElementById("btnSubmit");
  if (tip) tip.style.display = user ? "none" : "block";
  if (btn) btn.disabled = !user;
}

onAuthStateChanged(auth, (user) => {
  __latestUser = user || null;
  applyAuthUI(__latestUser);
  try {
    if (typeof window.__categoryAuthChanged === "function") {
      window.__categoryAuthChanged(__latestUser);
    }
  } catch (_e) {}
});

function pageCategory() {
  const v =
    document.body && document.body.dataset && document.body.dataset.category
      ? String(document.body.dataset.category).trim()
      : "";
  if (v) return v;

  const file = (location.pathname.split("/").pop() || "").toLowerCase();
  const map = {
    "jobs.html": "jobs",
    "jobseekers.html": "jobseekers",
    "used.html": "used",
    "realestate.html": "realestate",
    "shops.html": "shops",
    "stay.html": "stay",
    "play.html": "play",
    "biz.html": "biz",
  };
  return (map[file] || "").trim();
}

function setTitle() {
  const c = pageCategory();
  const h = document.getElementById("pageTitle");
  const sub = document.getElementById("pageSub");
  if (h) h.textContent = categoryLabel(c);
  if (sub) sub.textContent = "베트남 하노이 생활 동반자 Daina";
}

function fillCategorySelect() {
  const sel = document.getElementById("categorySel");
  if (!sel) return;
  sel.innerHTML = CATEGORIES.map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join("");
  sel.value = pageCategory() || "jobs";
}

function applyExtraUI() {
  const sel = document.getElementById("categorySel");
  const box = document.querySelector("[data-extra-box]");
  if (!sel || !box) return;
  renderExtraInputs(sel.value, box);
}

function showLinkFieldsByCategory() {
  const cat = document.getElementById("categorySel")?.value || "";
  const linksBox = document.getElementById("linkFields");
  const hide = cat === "jobs" || cat === "jobseekers";
  if (linksBox) linksBox.style.display = hide ? "none" : "";
}

let tab = "public"; // public | mine
let sort = "recent"; // recent | popular
let mineStatus = "all"; // all | pending | approved | rejected | hidden
let editMode = false;
let editingId = null;
let editingWasApproved = false;

function setTab(t) {
  tab = t;
  document.getElementById("tabPublic")?.classList.toggle("active", t === "public");
  document.getElementById("tabMine")?.classList.toggle("active", t === "mine");
  document.getElementById("mineFilters")?.classList.toggle("hide", t !== "mine");
  refresh();
}

function setSort(s) {
  sort = s;
  document.getElementById("sortSel").value = s;
  refresh();
}

function setMineStatus(s) {
  mineStatus = s;
  document.getElementById("mineStatusSel").value = s;
  refresh();
}

function setFold(collapsed) {
  const box = document.getElementById("postFold");
  const btn = document.getElementById("btnFold");
  if (!box || !btn) return;
  box.classList.toggle("collapsed", collapsed);
  btn.textContent = collapsed ? "글등록 열기" : "글등록 접기";
  try {
    localStorage.setItem("daina_fold_" + pageCategory(), collapsed ? "1" : "0");
  } catch {}
}

function initFold() {
  let collapsed = false;
  try {
    collapsed = localStorage.getItem("daina_fold_" + pageCategory()) === "1";
  } catch {}
  setFold(collapsed);
  document.getElementById("btnFold")?.addEventListener("click", () => {
    const now = document.getElementById("postFold")?.classList.contains("collapsed");
    setFold(!now);
  });
}

function resetForm() {
  ["area", "tag", "title", "desc", "contact"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const mapLink = document.getElementById("mapLink");
  const chatLink = document.getElementById("chatLink");
  if (mapLink) mapLink.value = "";
  if (chatLink) chatLink.value = "";

  const cp = document.getElementById("contactPublic");
  if (cp) cp.checked = true;

  document.querySelectorAll(".img-url").forEach((i) => (i.value = ""));

  const extraBox = document.querySelector("[data-extra-box]");
  if (extraBox) extraBox.querySelectorAll("input").forEach((i) => (i.value = ""));
}

function pickText(p, key) {
  const v = p?.[key];
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.ko || v.vi || "";
  return String(v);
}

function pickImgs(p) {
  const arr = [];
  if (p.coverUrl) arr.push(p.coverUrl);
  if (Array.isArray(p.thumbs)) arr.push(...p.thumbs);
  if (p.repImageUrl) arr.push(p.repImageUrl);
  if (Array.isArray(p.imageUrls)) arr.push(...p.imageUrls);
  const out = [];
  for (const u of arr) {
    const v = String(u || "").trim();
    if (!v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out.slice(0, 6);
}

function enterEditMode(id, data) {
  editMode = true;
  editingId = id;
  editingWasApproved = String(data.status) === "approved";

  document.getElementById("editBanner")?.classList.remove("hide");
  const t = document.getElementById("editBannerText");
  if (t) {
    t.textContent = editingWasApproved
      ? "승인된 글 수정 요청: 저장하면 pending으로 전환 후 재승인됩니다."
      : "pending 글 편집: 저장하면 즉시 반영됩니다.";
  }

  const btn = document.getElementById("btnSubmit");
  if (btn) btn.textContent = "저장";

  document.getElementById("area").value = data.area || data.region || "";
  document.getElementById("tag").value = data.tag || "";
  document.getElementById("title").value = pickText(data, "title") || "";
  document.getElementById("desc").value = pickText(data, "desc") || data.content || "";
  document.getElementById("contact").value = data.contact || "";
  document.getElementById("contactPublic").checked = data.contactPublic !== false;

  document.getElementById("categorySel").value = data.category || pageCategory();

  applyExtraUI();
  showLinkFieldsByCategory();

  document.getElementById("mapLink").value = data.mapLink || data.mapUrl || "";
  document.getElementById("chatLink").value = data.chatLink || data.openchatUrl || "";

  const urls = pickImgs(data);
  const inputs = Array.from(document.querySelectorAll(".img-url"));
  inputs.forEach((inp, idx) => {
    inp.value = urls[idx] || "";
  });

  // extra 값 채우기
  const extra = data.extra || {};
  const box = document.querySelector("[data-extra-box]");
  if (box) {
    for (const [k, v] of Object.entries(extra)) {
      const el = box.querySelector(`[name="extra__${CSS.escape(k)}"]`);
      if (el) el.value = v || "";
    }
  }

  setFold(false);
}

function exitEditMode() {
  editMode = false;
  editingId = null;
  editingWasApproved = false;
  document.getElementById("editBanner")?.classList.add("hide");
  const btn = document.getElementById("btnSubmit");
  if (btn) btn.textContent = "등록 요청";
  resetForm();
}

function cardHTML(p, mine = false) {
  const imgs = pickImgs(p);
  const cover = esc(imgs[0] || "");
  const thumbs = imgs
    .slice(0, 5)
    .map((u, i) => `<img class="thumb" src="${esc(u)}" alt="thumb${i + 1}" loading="lazy" />`)
    .join("");

  const title = esc(pickText(p, "title") || "(제목없음)");
  const area = esc(p.area || p.region || "");
  const tag = esc(p.tag || "");
  const dt = fmtDT(p.updatedAt || p.createdAt);
  const like = Number(p.likeCount || 0);
  const comments = Number(p.commentCount || 0);

  const status = esc(p.status || "");
  const progress = esc(p.progressStatus || "ongoing");

  // 진행/마감 뱃지는 모든 카드에 표시
  const stPill = mine ? `<span class="pill st-${status}">${status}</span>` : "";
  const progPill = `<span class="pill st-prog">${progress === "done" ? "마감" : "진행중"}</span>`;

  const descTxt = (pickText(p, "desc") || p.content || "").slice(0, 120);
  const descFull = pickText(p, "desc") || p.content || "";
  const desc = esc(descTxt) + (descFull.length > 120 ? "…" : "");

  return `
  <article class="card" data-id="${esc(p.id)}">
    <div class="card-media">
      ${cover ? `<img class="cover" src="${cover}" alt="cover" loading="lazy" />` : `<div class="cover ph"></div>`}
      <div class="thumbs">${thumbs}</div>
    </div>

    <div class="card-body">
      <div class="card-top">
        <div class="card-title">${title}</div>
        <div class="card-badges">
          ${tag ? `<span class="badge">${tag}</span>` : ``}
          ${stPill}
          ${progPill}
        </div>
      </div>

      <div class="card-desc">${desc}</div>

      <div class="card-meta">
        <span>${area}</span>
        <span>${dt}</span>
      </div>

      <div class="card-actions">
        <button class="btn small ghost" data-act="open" type="button">보기</button>
        <button class="btn small" data-act="like" type="button">좋아요 ${like}</button>
        <span class="muted">댓글 ${comments}</span>

        ${mine ? `
          <span class="spacer"></span>
          <button class="btn small ghost" data-act="bump" type="button">끌어올리기</button>
          <button class="btn small ok" data-act="edit" type="button">수정</button>
          <button class="btn small danger" data-act="delete" type="button">삭제</button>

          <select class="select small" data-act="progress">
            <option value="ongoing" ${progress === "ongoing" ? "selected" : ""}>진행중</option>
            <option value="done" ${progress === "done" ? "selected" : ""}>완료</option>
          </select>
        ` : ``}
      </div>
    </div>
  </article>
  `;
}

async function refresh() {
  const list = document.getElementById("cards");
  if (!list) return;
  list.innerHTML = `<div class="muted pad">불러오는 중...</div>`;

  const category = pageCategory();

  try {
    if (tab === "public") {
      const s = sort === "popular" ? "like" : "recent";
      const rows = await listApprovedPosts({ category, sort: s, lim: 50 });
      list.innerHTML = rows.length ? rows.map((p) => cardHTML(p, false)).join("") : `<div class="empty">등록된 글이 없습니다.</div>`;
      bindCardEvents(false);
    } else {
      const user = auth.currentUser;
      if (!user) {
        list.innerHTML = `<div class="empty">로그인이 필요합니다.</div>`;
        return;
      }

      const status = mineStatus === "all" ? null : mineStatus;
      const rows = await listMyPosts({ category, status, lim: 80 });

      list.innerHTML = rows.length ? rows.map((p) => cardHTML(p, true)).join("") : `<div class="empty">내 글이 없습니다.</div>`;
      bindCardEvents(true);
    }
  } catch (e) {
    console.error(e);
    list.innerHTML = `<div class="empty">불러오기 실패: ${esc(e?.message || e)}</div>`;
  }
}

function bindCardEvents(isMine) {
  const cards = document.querySelectorAll(".card");
  cards.forEach((card) => {
    card.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      const id = card.dataset.id;
      if (!id) return;

      if (act === "open") {
        location.href = `./post_detail.html?id=${encodeURIComponent(id)}`;
        return;
      }

      if (act === "like") {
        try {
          const res = await toggleLike(id);
          toast(res.liked ? "좋아요" : "좋아요 취소");
          refresh();
        } catch (err) {
          alert(err?.message || err);
        }
        return;
      }

      if (!isMine) return;

      if (act === "delete") {
        if (!confirm("pending 글만 삭제 가능합니다. 삭제할까요?")) return;
        try {
          await deletePendingPost(id);
          toast("삭제 완료");
          refresh();
        } catch (err) {
          alert(err?.message || err);
        }
        return;
      }

      if (act === "edit") {
        try {
          const { getPost } = await import("./postsApi.js");
          const p = await getPost(id);
          if (!p) return;
          enterEditMode(id, p);
        } catch (err) {
          alert(err?.message || err);
        }
        return;
      }

      if (act === "bump") {
        try {
          await bumpPost(id);
          toast("끌어올리기 완료");
          refresh();
        } catch (err) {
          alert(err?.message || err);
        }
        return;
      }

      if (act === "progress") {
        // change에서 처리
        return;
      }
    });

    const progSel = card.querySelector('select[data-act="progress"]');
    if (progSel) {
      progSel.addEventListener("change", async () => {
        const id = card.dataset.id;
        const v = progSel.value;
        try {
          await setProgressStatus(id, v);
          toast("상태 변경 완료");
          refresh();
        } catch (err) {
          alert(err?.message || err);
          refresh();
        }
      });
    }
  });
}

async function onSubmit() {
  const btn = document.getElementById("btnSubmit");
  if (btn) btn.disabled = true;

  try {
    const category = document.getElementById("categorySel").value;

    const titleKo = document.getElementById("title").value.trim();
    const titleVi = (document.getElementById("title_vi")?.value || "").trim();

    const descKo = document.getElementById("desc").value.trim();
    const descVi = (document.getElementById("desc_vi")?.value || "").trim();

    const area = document.getElementById("area").value.trim();
    const tag = document.getElementById("tag").value.trim();

    const contact = document.getElementById("contact").value.trim();
    const contactPublic = document.getElementById("contactPublic").checked;

    const mapLink = document.getElementById("mapLink")?.value || "";
    const chatLink = document.getElementById("chatLink")?.value || "";

    const imageUrls = Array.from(document.querySelectorAll(".img-url"))
      .map((i) => (i.value || "").trim())
      .filter(Boolean)
      .slice(0, 10);

    const extraRoot = document.querySelector("[data-extra-box]") || document;
    const extra = buildExtraFromForm(extraRoot);

    if (!editMode) {
      await createPost({
        category,
        titleKo,
        titleVi,
        descKo,
        descVi,
        area,
        tag,
        contact,
        contactPublic,
        mapLink,
        chatLink,
        imageUrls,
        extra,
      });

      toast("등록 요청 완료. 관리자 승인 후 노출됩니다.");
      resetForm();
      setFold(true);
      refresh();
      return;
    }

    // edit mode
    const patch = {
      category,
      titleKo,
      titleVi,
      descKo,
      descVi,
      area,
      tag,
      contact,
      contactPublic,
      mapLink,
      chatLink,
      imageUrls,
      extra,
    };

    const r = await updateMyPost(editingId, patch);

    // approved/rejected 글은 수정 후 pending으로 전환되어 재승인 필요
    if (editingWasApproved || r?.status === "pending") {
      toast("수정 저장 완료. 관리자 재승인 후 반영됩니다.");
    } else {
      toast("수정 저장 완료");
    }

    exitEditMode();
    setFold(true);
    refresh();
  } catch (e) {
    console.error(e);
    alert(e?.message || e);
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindModalClose();
  setTitle();
  fillCategorySelect();
  applyExtraUI();
  showLinkFieldsByCategory();
  initFold();

  document.getElementById("categorySel")?.addEventListener("change", () => {
    applyExtraUI();
    showLinkFieldsByCategory();
  });

  document.getElementById("tabPublic")?.addEventListener("click", () => setTab("public"));
  document.getElementById("tabMine")?.addEventListener("click", () => setTab("mine"));

  document.getElementById("sortSel")?.addEventListener("change", (e) => setSort(e.target.value));
  document.getElementById("mineStatusSel")?.addEventListener("change", (e) => setMineStatus(e.target.value));

  document.getElementById("btnCancelEdit")?.addEventListener("click", () => exitEditMode());
  document.getElementById("btnSubmit")?.addEventListener("click", onSubmit);

  window.__categoryAuthChanged = () => refresh();
  applyAuthUI(__latestUser ?? auth.currentUser);
  refresh();
});
