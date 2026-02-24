// /public/assets/js/postsApi.js
import { db, auth } from "./firebaseApp.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  CATEGORIES,
  CATEGORY_EXTRA_FIELDS,
  ALLOWED_LINK_DOMAINS,
  ADMIN_EMAILS,
  POSTS_COLLECTION,
  NOTICES_COLLECTION,
  REPORTS_COLLECTION,
} from "./config.js";

/* =========================
   helpers
========================= */
// /public/assets/js/postsApi.js

// indexPage.js 호환용: 예전 이름(listTop10) -> 현재 구현(getTop10ByLikes)
export async function listTop10(category, mode = "all") {
  // 호출부 호환:
  // 1) listTop10('job','week')
  // 2) listTop10({ category:'job', mode:'week' })  (indexPage.js)
  if (category && typeof category === "object") {
    const c = category.category ?? category.key ?? category.cat ?? "";
    const m = category.mode ?? "all";
    return getTop10ByLikes(c, m);
  }
  return getTop10ByLikes(category, mode);
}

function normalizeStr(v) {
  return String(v ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function requireSignedIn() {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  return user;
}

function requireCategory(categoryLike) {
  const raw = normalizeStr(categoryLike);
  if (!raw) throw new Error("유효하지 않은 카테고리입니다.");

  const key = raw.toLowerCase();
  if (CATEGORIES.some((c) => c.key === key)) return key;

  const found = CATEGORIES.find((c) => normalizeStr(c.label) === raw);
  if (found) return found.key;

  const fileKey = raw
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    .replace(".html", "")
    .toLowerCase();
  if (CATEGORIES.some((c) => c.key === fileKey)) return fileKey;

  throw new Error("유효하지 않은 카테고리입니다.");
}

export function categoryLabel(category) {
  const key = requireCategory(category);
  return CATEGORIES.find((c) => c.key === key)?.label || key;
}

function normalizeTags(v) {
  const s = normalizeStr(v);
  if (!s) return [];
  const arr = s
    .split(/[,]+/)
    .map((x) => normalizeStr(x))
    .filter(Boolean)
    .slice(0, 10);
  return Array.from(new Set(arr));
}

function isHttpUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeAllowedLink(u) {
  const v = normalizeStr(u);
  if (!v) return "";
  if (!isHttpUrl(v)) return "";
  try {
    const url = new URL(v);
    const host = url.hostname.toLowerCase();
    const ok = ALLOWED_LINK_DOMAINS.some((d) => host === d || host.endsWith("." + d));
    return ok ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeImageUrl(u) {
  const v = normalizeStr(u);
  if (!v) return "";
  if (!isHttpUrl(v)) return "";
  return v;
}

function normalizeImageUrls(imageUrls) {
  const arr = Array.isArray(imageUrls) ? imageUrls : [];
  const cleaned = arr
    .map((x) => normalizeImageUrl(x))
    .filter(Boolean)
    .slice(0, 10);

  if (!cleaned.length) throw new Error("이미지 URL 1개 이상(대표 포함) 입력해 주세요.");
  return {
    cover: cleaned[0],
    thumbs: cleaned,
  };
}

function normalizeExtra(extra) {
  if (!extra || typeof extra !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(extra)) {
    const kk = normalizeStr(k);
    if (!kk) continue;
    out[kk] = normalizeStr(v);
  }
  // 빈 값 제거
  for (const k of Object.keys(out)) {
    if (!out[k]) delete out[k];
  }
  return out;
}



/* =========================
   payload -> firestore patch helpers
========================= */

function pickTextKo(v) {
  if (!v) return "";
  if (typeof v === "string") return normalizeStr(v);
  if (typeof v === "object") return normalizeStr(v.ko || v.kr || v.kor || v.text || "");
  return "";
}

function pickTextVi(v) {
  if (!v) return "";
  if (typeof v === "object") return normalizeStr(v.vi || "");
  return "";
}

/*
  buildPostPatch(payload, { allowEmptyImages })
  - categoryPage/adminPage에서 섞여 들어오는 키들을 최대한 흡수해서 표준 필드로 정규화
*/
function buildPostPatch(payload = {}, opt = {}) {
  const allowEmptyImages = !!opt.allowEmptyImages;

  const titleKo =
    normalizeStr(payload.titleKo) ||
    pickTextKo(payload.title) ||
    normalizeStr(payload.title_ko) ||
    normalizeStr(payload.titleKr);

  const titleVi =
    normalizeStr(payload.titleVi) ||
    pickTextVi(payload.title) ||
    normalizeStr(payload.title_vi);

  const descKo =
    normalizeStr(payload.descKo) ||
    pickTextKo(payload.desc) ||
    normalizeStr(payload.content) ||
    normalizeStr(payload.desc_ko);

  const descVi =
    normalizeStr(payload.descVi) ||
    pickTextVi(payload.desc) ||
    normalizeStr(payload.desc_vi);

  const area = normalizeStr(payload.area || payload.region);
  const tag = normalizeStr(payload.tag);
  const tags = normalizeTags(payload.tags || tag);

  const contact = normalizeStr(payload.contact);
  const contactPublic = payload.contactPublic !== false;

  const mapLink = normalizeAllowedLink(payload.mapLink || payload.mapUrl);
  const chatLink = normalizeAllowedLink(payload.chatLink || payload.openchatUrl);

  // images: categoryPage는 imageUrls 배열(대표 포함)로 옴
  // admin/editor는 coverUrl + thumbs 또는 repImageUrl + imageUrls 로 올 수 있음
  let mergedImgs = [];
  if (Array.isArray(payload.imageUrls) && payload.imageUrls.length) mergedImgs = payload.imageUrls;
  if (Array.isArray(payload.images) && payload.images.length) mergedImgs = payload.images;

  const coverUrlRaw = normalizeStr(payload.coverUrl || payload.repImageUrl || "");
  const thumbsRaw = Array.isArray(payload.thumbs)
    ? payload.thumbs
    : Array.isArray(payload.imageUrls)
      ? payload.imageUrls
      : [];

  if (!mergedImgs.length) {
    if (coverUrlRaw) mergedImgs.push(coverUrlRaw);
    if (Array.isArray(thumbsRaw)) mergedImgs.push(...thumbsRaw);
  }

  let imgsPatch = {};
  if (mergedImgs.length) {
    const imgs = normalizeImageUrls(mergedImgs);
    imgsPatch = {
      coverUrl: imgs.cover,
      thumbs: imgs.thumbs,
      repImageUrl: imgs.cover,
      imageUrls: imgs.thumbs,
    };
  } else if (!allowEmptyImages) {
    // 편집/등록에서는 대표 이미지가 필수여야 함
    throw new Error("이미지 URL 1개 이상(대표 포함) 입력해 주세요.");
  }

  const extra = normalizeExtra(payload.extra);

  return {
    titleKo,
    titleVi,
    descKo,
    descVi,
    area,
    tag,
    tags,
    contact,
    contactPublic,
    mapLink,
    chatLink,
    imgsPatch,
    extra,
  };
}

/* =========================
   extra-fields UI helpers
========================= */

/*
  renderExtraInputs(category, rootEl, existing?)
  - rootEl: extra 입력을 넣을 컨테이너 엘리먼트
*/
export function renderExtraInputs(category, rootEl, existing = {}) {
  const cat = requireCategory(category);
  const fields = CATEGORY_EXTRA_FIELDS?.[cat] || [];
  if (!rootEl) return;

  rootEl.innerHTML = "";
  if (!fields.length) {
    rootEl.classList.add("hide");
    return;
  }
  rootEl.classList.remove("hide");

  for (const f of fields) {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const label = document.createElement("label");
    label.className = "label";
    label.textContent = f.label;

    const input = document.createElement("input");
    input.className = "input";
    input.type = f.type || "text";
    input.placeholder = f.placeholder || "";
    input.name = `extra__${f.key}`;
    input.value = normalizeStr(existing?.[f.key]);

    wrap.appendChild(label);
    wrap.appendChild(input);
    rootEl.appendChild(wrap);
  }
}

/*
  buildExtraFromForm(formEl)
  - categoryPage 쪽 실수 방지용으로:
    buildExtraFromForm(category, docOrEl) 형태도 허용
*/
export function buildExtraFromForm(arg1, arg2) {
  let formEl = arg1;

  // 허용: buildExtraFromForm(category, documentOrElement)
  if (typeof arg1 === "string" && arg2) {
    formEl = arg2;
  }

  const extra = {};
  if (!formEl) return extra;

  const inputs = formEl.querySelectorAll?.("[name^='extra__']") || [];
  inputs.forEach((el) => {
    const name = el.getAttribute("name") || "";
    const key = name.replace("extra__", "");
    extra[key] = normalizeStr(el.value);
  });

  for (const k of Object.keys(extra)) {
    if (!extra[k]) delete extra[k];
  }
  return extra;
}

/* =========================
   create / list / get
========================= */

/*
  v19 데이터 표준
  - title: {ko, vi?}
  - desc : {ko, vi?}
  - area, tag
  - coverUrl, thumbs (imageUrls 1~10)
  - progressStatus: "ongoing" | "done"
  - status: pending|approved|rejected|hidden
*/
export async function createPost(arg) {
  const user = requireSignedIn();
  const payload = arg && typeof arg === "object" ? arg : {};
  const cat = requireCategory(payload.category);

  const titleKo = normalizeStr(payload.titleKo);
  const titleVi = normalizeStr(payload.titleVi);
  const descKo = normalizeStr(payload.descKo);
  const descVi = normalizeStr(payload.descVi);

  if (!titleKo) throw new Error("제목이 필요합니다.");
  if (!descKo) throw new Error("내용이 필요합니다.");

  const area = normalizeStr(payload.area);
  const tag = normalizeStr(payload.tag);
  const tags = normalizeTags(payload.tags || tag);

  const contact = normalizeStr(payload.contact);
  const contactPublic = payload.contactPublic !== false;

  const mapLink = normalizeAllowedLink(payload.mapLink || payload.mapUrl);
  const chatLink = normalizeAllowedLink(payload.chatLink || payload.openchatUrl);

  const imgs = normalizeImageUrls(payload.imageUrls);
  const extra = normalizeExtra(payload.extra);

  const iso = nowIso();

  const docData = {
    category: cat,
    categoryLabel: categoryLabel(cat),

    title: { ko: titleKo, ...(titleVi ? { vi: titleVi } : {}) },
    desc: { ko: descKo, ...(descVi ? { vi: descVi } : {}) },

    area,
    tag,
    tags,

    contact,
    contactPublic,

    mapLink,
    chatLink,

    coverUrl: imgs.cover,
    thumbs: imgs.thumbs,

    // 호환 필드(예전 코드가 읽어도 깨지지 않게)
    repImageUrl: imgs.cover,
    imageUrls: imgs.thumbs,
    content: descKo,
    region: area,

    extra,

    status: "pending",
    progressStatus: "ongoing",

    ownerUid: user.uid,
    ownerEmail: user.email || "",
    ownerName: user.displayName || "",

    likeCount: 0,
    commentCount: 0,
    bumpCount: 0,

    createdAt: serverTimestamp(),
    createdAtIso: iso,
    updatedAt: serverTimestamp(),
    updatedAtIso: iso,

    approvedAt: null,
    approvedAtIso: "",
    rejectedAt: null,
    rejectedAtIso: "",
    rejectReason: "",

    editRequested: false,
    editRequestedAt: null,
    editRequestedAtIso: "",
  };

  const ref = await addDoc(collection(db, POSTS_COLLECTION), docData);
  return ref.id;
}

async function safeGetDocs(q1, fallbackBuilder) {
  try {
    const snap = await getDocs(q1);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // 인덱스 필요 등으로 실패하면 fallback(단일 where + JS filter)
    if (!fallbackBuilder) throw e;
    const { q2, jsFilter, jsSort } = fallbackBuilder();
    const snap2 = await getDocs(q2);
    let rows = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (typeof jsFilter === "function") rows = rows.filter(jsFilter);
    if (typeof jsSort === "function") rows = rows.sort(jsSort);
    return rows;
  }
}

export async function getPostsByCategory(category, opts = {}) {
  const cat = requireCategory(category);
  const mode = opts.mode || "approved"; // approved | pending | all | rejected | hidden
  const lim = Number(opts.limit ?? opts.lim ?? 20) || 20;

  // sort: recent | like
  const sort = normalizeStr(opts.sort) || "recent";
  const orderField = sort === "like" || sort === "likes" || sort === "popular" ? "likeCount" : "createdAt";
  const dir = "desc";

  // primary
  let q1;
  if (mode === "all") {
    q1 = query(
      collection(db, POSTS_COLLECTION),
      where("category", "==", cat),
      orderBy(orderField, dir),
      limit(lim)
    );
  } else {
    q1 = query(
      collection(db, POSTS_COLLECTION),
      where("category", "==", cat),
      where("status", "==", mode),
      orderBy(orderField, dir),
      limit(lim)
    );
  }

  // fallback: status 단일 where 후 category JS 필터
  const rows = await safeGetDocs(q1, () => {
    const q2 =
      mode === "all"
        ? query(collection(db, POSTS_COLLECTION), limit(400))
        : query(collection(db, POSTS_COLLECTION), where("status", "==", mode), limit(400));

    return {
      q2,
      jsFilter: (p) => (mode === "all" ? p.category === cat : p.category === cat && p.status === mode),
      jsSort: (a, b) => {
        if (orderField === "likeCount") return Number(b.likeCount || 0) - Number(a.likeCount || 0);
        const ai = String(a.createdAtIso || "");
        const bi = String(b.createdAtIso || "");
        return bi.localeCompare(ai);
      },
    };
  });

  // 결과 정리(혹시 더 섞여있으면 안전하게)
  return rows.slice(0, lim);
}

export async function listApprovedPosts(arg1, lim = 20) {
  if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
    const category = arg1.category;
    const l = Number(arg1.lim ?? arg1.limit ?? lim) || 20;
    const sort = arg1.sort || "recent";
    return getPostsByCategory(category, { mode: "approved", limit: l, sort });
  }
  return getPostsByCategory(arg1, { mode: "approved", limit: Number(lim) || 20, sort: "recent" });
}

/*
  listMyPosts({ category, status, lim })
  - category 없으면 전체 내 글
  - status 없으면 전체 상태
*/
export async function listMyPosts(arg1) {
  const user = requireSignedIn();

  // 기본값
  let category = null;
  let status = null;
  let lim = 80;

  if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
    category = normalizeStr(arg1.category) || null;
    status = normalizeStr(arg1.status) || null;
    lim = Number(arg1.lim ?? arg1.limit ?? 80) || 80;
  } else if (typeof arg1 === "number") {
    lim = Number(arg1) || 80;
  }

  // primary 쿼리(인덱스 필요할 수 있음)
  let q1;
  if (category && status) {
    const cat = requireCategory(category);
    q1 = query(
      collection(db, POSTS_COLLECTION),
      where("ownerUid", "==", user.uid),
      where("category", "==", cat),
      where("status", "==", status),
      orderBy("createdAt", "desc"),
      limit(lim)
    );
  } else if (category) {
    const cat = requireCategory(category);
    q1 = query(
      collection(db, POSTS_COLLECTION),
      where("ownerUid", "==", user.uid),
      where("category", "==", cat),
      orderBy("createdAt", "desc"),
      limit(lim)
    );
  } else {
    q1 = query(
      collection(db, POSTS_COLLECTION),
      where("ownerUid", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(lim)
    );
  }

  const rows = await safeGetDocs(q1, () => {
    // fallback: ownerUid 단일 where 후 JS 필터
    const q2 = query(
      collection(db, POSTS_COLLECTION),
      where("ownerUid", "==", user.uid),
      limit(400)
    );
    return {
      q2,
      jsFilter: (p) => {
        const okCat = category ? p.category === requireCategory(category) : true;
        const okSt = status ? p.status === status : true;
        return okCat && okSt;
      },
      jsSort: (a, b) => String(b.createdAtIso || "").localeCompare(String(a.createdAtIso || "")),
    };
  });

  return rows.slice(0, lim);
}

export async function getPost(postId) {
  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  const ref = doc(db, POSTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("게시글이 없습니다.");
  return { id: snap.id, ...snap.data() };
}

/* =========================
   update / delete (owner)
========================= */

export async function updatePendingPost(postId, payload) {
  const user = requireSignedIn();
  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  const ref = doc(db, POSTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("게시글이 없습니다.");

  const data = snap.data();
  if (data.ownerUid !== user.uid) throw new Error("권한이 없습니다.");
  if (data.status !== "pending") throw new Error("대기중인 글만 수정할 수 있습니다.");

  const titleKo = normalizeStr(payload?.titleKo) || normalizeStr(payload?.title?.ko) || normalizeStr(payload?.title);
  const titleVi = normalizeStr(payload?.titleVi) || normalizeStr(payload?.title?.vi);
  const descKo = normalizeStr(payload?.descKo) || normalizeStr(payload?.desc?.ko) || normalizeStr(payload?.desc) || normalizeStr(payload?.content);
  const descVi = normalizeStr(payload?.descVi) || normalizeStr(payload?.desc?.vi);

  if (!titleKo) throw new Error("제목이 필요합니다.");
  if (!descKo) throw new Error("내용이 필요합니다.");

  const area = normalizeStr(payload?.area || payload?.region);
  const tag = normalizeStr(payload?.tag);
  const tags = normalizeTags(payload?.tags || tag);

  const contact = normalizeStr(payload?.contact);
  const contactPublic = payload?.contactPublic !== false;

  const mapLink = normalizeAllowedLink(payload?.mapLink || payload?.mapUrl);
  const chatLink = normalizeAllowedLink(payload?.chatLink || payload?.openchatUrl);

  let coverUrl = normalizeStr(payload?.coverUrl || payload?.repImageUrl);
  let thumbs = Array.isArray(payload?.thumbs) ? payload.thumbs : (Array.isArray(payload?.imageUrls) ? payload.imageUrls : []);
  if (Array.isArray(payload?.images)) thumbs = payload.images;

  // 이미지가 들어오면 대표/썸네일 정리
  let imgsPatch = {};
  if (thumbs?.length || coverUrl) {
    const merged = [];
    if (coverUrl) merged.push(coverUrl);
    if (Array.isArray(thumbs)) merged.push(...thumbs);
    const imgs = normalizeImageUrls(merged);
    imgsPatch = {
      coverUrl: imgs.cover,
      thumbs: imgs.thumbs,
      repImageUrl: imgs.cover,
      imageUrls: imgs.thumbs,
    };
  }

  const extra = normalizeExtra(payload?.extra);

  await updateDoc(ref, {
    title: { ko: titleKo, ...(titleVi ? { vi: titleVi } : {}) },
    desc: { ko: descKo, ...(descVi ? { vi: descVi } : {}) },

    area,
    tag,
    tags,

    contact,
    contactPublic,

    mapLink,
    chatLink,

    ...imgsPatch,

    content: descKo,
    region: area,

    extra,

    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
  });

  return true;
}

export async function updateMyPost(postId, payload = {}) {
  // v19.1: 내 글이면 pending/approved/rejected 상태에서도 수정 가능
  // - approved/rejected => 수정 저장 후 pending으로 전환(재승인 필요)
  const user = requireSignedIn();
  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  const ref = doc(db, POSTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("게시글이 없습니다.");

  const data = snap.data();
  if (data.ownerUid !== user.uid) throw new Error("권한이 없습니다.");
  if (data.status === "hidden") throw new Error("숨김 처리된 글은 수정할 수 없습니다.");

  const patch = buildPostPatch(payload, { allowEmptyImages: false });


  // 마감된 글은 어떤 수정/보완을 하더라도 연락처는 항상 비공개로 유지
  const contactPublicFinal = data.progressStatus === 'done' ? false : patch.contactPublic;

  // status 전환 규칙
  const nextStatus =
    data.status === "approved" || data.status === "rejected"
      ? "pending"
      : (data.status || "pending");

  await updateDoc(ref, {
    title: { ko: patch.titleKo, ...(patch.titleVi ? { vi: patch.titleVi } : {}) },
    desc: { ko: patch.descKo, ...(patch.descVi ? { vi: patch.descVi } : {}) },

    area: patch.area,
    tag: patch.tag,
    tags: patch.tags,

    contact: patch.contact,
    contactPublic: contactPublicFinal,

    mapLink: patch.mapLink,
    chatLink: patch.chatLink,

    ...patch.imgsPatch,

    content: patch.descKo,
    region: patch.area,

    extra: patch.extra,

    status: nextStatus,

    // 승인글 편집이면 editRequested 표시
    editRequested: data.status === "approved",
    editRequestedAt: data.status === "approved" ? serverTimestamp() : null,
    editRequestedAtIso: data.status === "approved" ? nowIso() : "",

    // 반려였다면 반려 정보 초기화
    rejectedAt: null,
    rejectedAtIso: "",
    rejectReason: "",

    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
  });

  return { status: nextStatus };
}

export async function deletePendingPost(postId) {
  const user = requireSignedIn();
  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  const ref = doc(db, POSTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("게시글이 없습니다.");

  const data = snap.data();
  if (data.ownerUid !== user.uid) throw new Error("권한이 없습니다.");
  if (data.status !== "pending") throw new Error("대기중인 글만 삭제할 수 있습니다.");

  await deleteDoc(ref);
  return true;
}

/* =========================
   progressStatus (owner)
   - 진행중/완료 선택
========================= */
export async function setProgressStatus(postId, progressStatus) {
  const user = requireSignedIn();
  const id = normalizeStr(postId);
  const v = normalizeStr(progressStatus);

  if (!id) throw new Error("postId가 없습니다.");
  if (v !== "ongoing" && v !== "done") throw new Error("진행상태 값이 올바르지 않습니다.");

  const ref = doc(db, POSTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("게시글이 없습니다.");

  const data = snap.data();
  if (data.ownerUid !== user.uid) throw new Error("권한이 없습니다.");

  const upd = {
    progressStatus: v,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
  };

  // 마감 시 연락처는 항상 완전 비공개(저장값도 강제로 비공개로 맞춤)
  if (v === "done") {
    upd.contactPublic = false;
  }

  await updateDoc(ref, upd);
  return true;
}

/* =========================
   admin approve / reject / hide / delete
========================= */

export async function isAdmin() {
  const user = auth.currentUser;
  if (!user) return false;

  try {
    // 이메일 허용 목록 우선 검사 (대소문자 무시)
    try {
      const email = String(user.email || "").toLowerCase();
      if (Array.isArray(ADMIN_EMAILS) && ADMIN_EMAILS.map((e) => String(e || "").toLowerCase()).includes(email)) {
        return true;
      }
    } catch {}

    const ref = doc(db, "admins", user.uid);
    const snap = await getDoc(ref);
    return snap.exists() && snap.data()?.enabled !== false;
  } catch {
    return false;
  }
}

export async function adminUpdatePost(postId, payload = {}) {
  const ok = await isAdmin();
  if (!ok) throw new Error("관리자 권한이 없습니다.");

  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  const ref = doc(db, POSTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("게시글이 없습니다.");

  // 관리자는 이미지 없이도 수정할 수 있게(기존 이미지 유지)
  const patch = buildPostPatch(payload, { allowEmptyImages: true });

  const upd = {
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
  };

  // title/desc는 최소 1개라도 들어오면 반영
  if (patch.titleKo || patch.titleVi) {
    upd.title = { ko: patch.titleKo || pickTextKo(snap.data()?.title) || "", ...(patch.titleVi ? { vi: patch.titleVi } : {}) };
  }
  if (patch.descKo || patch.descVi) {
    upd.desc = { ko: patch.descKo || pickTextKo(snap.data()?.desc) || "", ...(patch.descVi ? { vi: patch.descVi } : {}) };
    upd.content = patch.descKo || snap.data()?.content || "";
  }

  if (payload.category) {
    const cat = requireCategory(payload.category);
    upd.category = cat;
    upd.categoryLabel = categoryLabel(cat);
  }

  if (payload.area !== undefined || payload.region !== undefined) {
    upd.area = patch.area;
    upd.region = patch.area;
  }
  if (payload.tag !== undefined) upd.tag = patch.tag;
  if (payload.tags !== undefined || payload.tag !== undefined) upd.tags = patch.tags;

  if (payload.contact !== undefined) upd.contact = patch.contact;
  if (payload.contactPublic !== undefined) upd.contactPublic = patch.contactPublic;

  if (payload.mapLink !== undefined || payload.mapUrl !== undefined) upd.mapLink = patch.mapLink;
  if (payload.chatLink !== undefined || payload.openchatUrl !== undefined) upd.chatLink = patch.chatLink;

  // images: 들어오면 갱신, 아니면 유지
  if (Object.keys(patch.imgsPatch || {}).length) {
    Object.assign(upd, patch.imgsPatch);
  }

  if (payload.extra !== undefined) upd.extra = patch.extra;

  // status 변경(선택)
  if (payload.status) upd.status = normalizeStr(payload.status);

  await updateDoc(ref, upd);
  return true;
}


export async function adminApprove(postId) {
  const ok = await isAdmin();
  if (!ok) throw new Error("관리자 권한이 없습니다.");

  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  const ref = doc(db, POSTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("게시글이 없습니다.");

  const cur = snap.data() || {};
  const curProg = String(cur.progressStatus || "").trim();
  const prog = (curProg === "ongoing" || curProg === "done") ? curProg : "ongoing";

  // 승인되면 기본적으로 진행중으로 표시(이미 마감된 글(done)은 유지)
  await updateDoc(ref, {
    status: "approved",
    approvedAt: serverTimestamp(),
    approvedAtIso: nowIso(),
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
    editRequested: false,
    editRequestedAt: null,
    editRequestedAtIso: "",
    progressStatus: prog,
  });
  return true;
}

export async function adminReject(postId, reason = "") {
  const ok = await isAdmin();
  if (!ok) throw new Error("관리자 권한이 없습니다.");

  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  await updateDoc(doc(db, POSTS_COLLECTION, id), {
    status: "rejected",
    rejectedAt: serverTimestamp(),
    rejectedAtIso: nowIso(),
    rejectReason: normalizeStr(reason),
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
  });
  return true;
}

export async function adminHide(postId) {
  const ok = await isAdmin();
  if (!ok) throw new Error("관리자 권한이 없습니다.");

  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  await updateDoc(doc(db, POSTS_COLLECTION, id), {
    status: "hidden",
    hiddenAt: serverTimestamp(),
    hiddenAtIso: nowIso(),
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
  });
  return true;
}


// 마감 처리: 진행상태를 done으로 변경하고 연락처를 강제 비공개 처리
export async function adminClosePost(postId) {
  const ok = await isAdmin();
  if (!ok) throw new Error("관리자 권한이 없습니다.");

  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  await updateDoc(doc(db, POSTS_COLLECTION, id), {
    progressStatus: "done",
    contactPublic: false,
    closedAt: serverTimestamp(),
    closedAtIso: nowIso(),
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
  });
  return true;
}

export async function adminDelete(postId) {
  const ok = await isAdmin();
  if (!ok) throw new Error("관리자 권한이 없습니다.");

  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  await deleteDoc(doc(db, POSTS_COLLECTION, id));
  return true;
}

/* =========================
   edit request (approved)
========================= */

export async function requestEditApproved(postId, payload = {}) {
  // v19.1: 승인된 글도 "수정"을 누르면 내용을 저장하고 status를 pending으로 전환
  //        (관리자가 재승인하면 노출)
  const user = requireSignedIn();
  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  const ref = doc(db, POSTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("게시글이 없습니다.");

  const data = snap.data();
  if (data.ownerUid !== user.uid) throw new Error("권한이 없습니다.");
  if (data.status !== "approved") throw new Error("승인된 글만 수정요청할 수 있습니다.");

  const patch = buildPostPatch(payload, { allowEmptyImages: false });

  await updateDoc(ref, {
    // 본문/필드 저장
    title: { ko: patch.titleKo, ...(patch.titleVi ? { vi: patch.titleVi } : {}) },
    desc: { ko: patch.descKo, ...(patch.descVi ? { vi: patch.descVi } : {}) },

    area: patch.area,
    tag: patch.tag,
    tags: patch.tags,

    contact: patch.contact,
    contactPublic: contactPublicFinal,

    mapLink: patch.mapLink,
    chatLink: patch.chatLink,

    ...patch.imgsPatch,

    content: patch.descKo,
    region: patch.area,

    extra: patch.extra,

    // 상태를 pending으로 전환(재승인 필요)
    status: "pending",
    editRequested: true,
    editRequestedAt: serverTimestamp(),
    editRequestedAtIso: nowIso(),

    // 반려 정보 초기화
    rejectedAt: null,
    rejectedAtIso: "",
    rejectReason: "",

    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
  });

  return true;
}



/* =========================
   bump
========================= */

export async function bumpPost(postId) {
  const user = requireSignedIn();
  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  const ref = doc(db, POSTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("게시글이 없습니다.");

  const data = snap.data();
  if (data.status !== "approved") throw new Error("승인된 글만 끌올 가능합니다.");
  if (data.ownerUid !== user.uid) throw new Error("권한이 없습니다.");

  await updateDoc(ref, {
    bumpCount: increment(1),
    lastBumpedAt: serverTimestamp(),
    lastBumpedAtIso: nowIso(),
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
  });
  return true;
}

/* =========================
   likes
========================= */

export async function toggleLike(postId) {
  const user = requireSignedIn();
  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");

  const likeRef = doc(db, POSTS_COLLECTION, id, "likes", user.uid);
  const likeSnap = await getDoc(likeRef);
  const postRef = doc(db, POSTS_COLLECTION, id);

  if (likeSnap.exists()) {
    await deleteDoc(likeRef);
    await updateDoc(postRef, { likeCount: increment(-1) });
    return { liked: false };
  }

  await setDoc(likeRef, {
    uid: user.uid,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso(),
  });
  await updateDoc(postRef, { likeCount: increment(1) });
  return { liked: true };
}

/* =========================
   comments (simple)
========================= */

export async function addComment(postId, text) {
  const user = requireSignedIn();
  const id = normalizeStr(postId);
  const t = normalizeStr(text);
  if (!id) throw new Error("postId가 없습니다.");
  if (!t) throw new Error("댓글 내용을 입력해 주세요.");

  const ref = collection(db, POSTS_COLLECTION, id, "comments");
  await addDoc(ref, {
    uid: user.uid,
    displayName: user.displayName || "",
    text: t,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso(),
  });

  await updateDoc(doc(db, POSTS_COLLECTION, id), {
    commentCount: increment(1),
  });

  return true;
}

/* =========================
   reports
========================= */

export async function reportItem(kind, targetId, reason = "") {
  const user = requireSignedIn();
  const k = normalizeStr(kind) || "post";
  const tid = normalizeStr(targetId);
  if (!tid) throw new Error("신고 대상이 없습니다.");

  await addDoc(collection(db, REPORTS_COLLECTION), {
    kind: k,
    targetId: tid,
    reason: normalizeStr(reason),
    uid: user.uid,
    email: user.email || "",
    createdAt: serverTimestamp(),
    createdAtIso: nowIso(),
    status: "open",
  });

  return true;
}

/* =========================
   notices
========================= */

export async function listNotices(lim = 20) {
  const q = query(
    collection(db, NOTICES_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(Number(lim) || 20)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* =========================
   index top10 helper
========================= */

export async function getTop10ByLikes(category, mode = "all") {
  const cat = requireCategory(category);

  let q1 = query(
    collection(db, POSTS_COLLECTION),
    where("category", "==", cat),
    where("status", "==", "approved"),
    orderBy("likeCount", "desc"),
    limit(10)
  );

  if (mode === "weekly") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const iso = d.toISOString();
    q1 = query(
      collection(db, POSTS_COLLECTION),
      where("status", "==", "approved"),
      where("createdAtIso", ">=", iso),
      limit(400)
    );
  }

  const rows = await safeGetDocs(q1, () => {
    const base = query(collection(db, POSTS_COLLECTION), where("status", "==", "approved"), limit(400));
    return {
      q2: base,
      jsFilter: (p) => p.category === cat,
      jsSort: (a, b) => Number(b.likeCount || 0) - Number(a.likeCount || 0),
    };
  });

  if (mode === "weekly") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const iso = d.toISOString();
    return rows
      .filter((p) => p.category === cat && String(p.createdAtIso || "") >= iso)
      .sort((a, b) => Number(b.likeCount || 0) - Number(a.likeCount || 0))
      .slice(0, 10);
  }

  return rows.slice(0, 10);
}

/* =========================
   premium (admin curated)
========================= */

export async function getPremiumPostIds() {
  try {
    const ref = doc(db, "siteSettings", "premium");
    const snap = await getDoc(ref);
    if (!snap.exists()) return [];
    return snap.data()?.postIds || [];
  } catch {
    return [];
  }
}

export async function setPremiumPostIds(postIds) {
  const ok = await isAdmin();
  if (!ok) throw new Error("관리자 권한이 없습니다.");

  const ids = (Array.isArray(postIds) ? postIds : [])
    .map((id) => normalizeStr(id))
    .filter(Boolean)
    .slice(0, 10);

  const ref = doc(db, "siteSettings", "premium");
  await setDoc(ref, {
    postIds: ids,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso(),
    updatedByUid: auth.currentUser?.uid || "",
  });
  return ids;
}

export async function getPremiumPosts() {
  const ids = await getPremiumPostIds();
  if (!ids.length) return [];

  const posts = await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, POSTS_COLLECTION, id));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
      } catch {
        return null;
      }
    })
  );
  return posts.filter(Boolean);
}

/* =========================
   realtime (optional)
========================= */

export function watchPost(postId, cb) {
  const id = normalizeStr(postId);
  if (!id) throw new Error("postId가 없습니다.");
  const ref = doc(db, POSTS_COLLECTION, id);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) return cb(null);
    cb({ id: snap.id, ...snap.data() });
  });
}
