// /public/assets/js/indexPage.js
import { CATEGORIES } from "./config.js";
import { listNotices, listTop10, getPremiumPosts } from "./postsApi.js";
import { esc, fmtDT, pickText } from "./util.js";

function noticeHTML(n){
  return `
    <div class="notice">
      <div class="notice-title">${esc(n.title || "공지")}</div>
      <div class="notice-body">${esc(n.body || "")}</div>
    </div>
  `;
}

function miniCard(p){
  const coverRaw = p.coverUrl
    || p.repImageUrl
    || (Array.isArray(p.thumbs) ? p.thumbs[0] : "")
    || (Array.isArray(p.imageUrls) ? p.imageUrls[0] : "")
    || "";
  const cover = esc(coverRaw);
  const title = esc(pickText(p,"title") || "");
  const area = esc(p.area || "");
  const prog = String(p.progressStatus || "ongoing") === "done" ? "마감" : "진행중";
  const like = Number(p.likeCount || 0);
  const dt = fmtDT(p.lastActivityAtMs ? { toMillis:()=>p.lastActivityAtMs } : p.updatedAt || p.createdAt);
  return `
    <a class="mini-card" href="./post_detail.html?id=${encodeURIComponent(p.id)}">
      ${cover ? `<img class="mini-cover" src="${cover}" alt="cover" loading="lazy" />` : `<div class="mini-cover ph"></div>`}
      <div class="mini-body">
        <div class="mini-title">${title}</div>
        <div class="mini-meta"><span class="pill st-prog">${prog}</span> ${area} · 좋아요 ${like}</div>
      </div>
    </a>
  `;
}

let currentMode = "all";

function premiumCard(p){
  const coverRaw = p.coverUrl
    || p.repImageUrl
    || (Array.isArray(p.thumbs) ? p.thumbs[0] : "")
    || (Array.isArray(p.imageUrls) ? p.imageUrls[0] : "")
    || "";
  const cover = esc(coverRaw);
  const title = esc(pickText(p,"title") || "");
  const cat = esc(p.categoryLabel || p.category || "");
  const area = esc(p.area || "");
  const like = Number(p.likeCount || 0);
  return `
    <a class="premium-card" href="./post_detail.html?id=${encodeURIComponent(p.id)}">
      ${cover
        ? `<img class="premium-cover" src="${cover}" alt="cover" loading="lazy" />`
        : `<div class="premium-cover ph"></div>`}
      <div class="premium-body">
        <div class="premium-cat">${cat}</div>
        <div class="premium-title">${title}</div>
        <div class="premium-meta">${area}${area && like ? ' · ' : ''}좋아요 ${like}</div>
      </div>
    </a>
  `;
}

async function renderPremium(){
  const wrap = document.getElementById("premiumSection");
  if(!wrap) return;
  try{
    const posts = await getPremiumPosts();
    if(!posts.length){ wrap.innerHTML = ""; return; }
    wrap.innerHTML = `
      <section class="premium-sec">
        <div class="premium-sec-head">
          <h2 class="premium-sec-title">
            <span class="premium-badge">PREMIUM</span>
            관리자 추천
          </h2>
          <span class="muted" style="font-size:12px;">${posts.length}개</span>
        </div>
        <div class="premium-grid">
          ${posts.map(premiumCard).join("")}
        </div>
      </section>
    `;
  }catch(e){
    console.error("premium load failed", e);
    wrap.innerHTML = "";
  }
}

async function renderNotices(){
  const nBox = document.getElementById("notices");
  try{
    const rows = await listNotices({ lim: 5 });
    nBox.innerHTML = rows.length ? rows.map(noticeHTML).join("") : `<div class="empty">공지 없음</div>`;
  }catch(e){
    nBox.innerHTML = `<div class="empty">공지 불러오기 실패</div>`;
    console.error(e);
  }
}

function buildTopWrap(){
  const wrap = document.getElementById("top10Wrap");
  wrap.innerHTML = CATEGORIES.map(c=>`
    <section class="sec">
      <div class="sec-head">
        <h2 class="sec-title">${esc(c.label)} Top 10</h2>
        <a class="sec-link" href="./${esc(c.key)}.html">더보기</a>
      </div>
      <div class="mini-grid" id="top_${esc(c.key)}"><div class="muted pad">불러오는 중...</div></div>
    </section>
  `).join("");
}

async function renderTop10(){
  for(const c of CATEGORIES){
    const box = document.getElementById("top_"+c.key);
    if(!box) continue;
    box.innerHTML = `<div class="muted pad">불러오는 중...</div>`;
    try{
      const rows = await listTop10({ category: c.key, mode: currentMode });
      box.innerHTML = rows.length ? rows.map(miniCard).join("") : `<div class="empty">데이터 없음</div>`;
    }catch(e){
      box.innerHTML = `<div class="empty">불러오기 실패</div>`;
      console.error(e);
    }
  }
}

function bindTabs(){
  const root = document.getElementById("topModeTabs");
  if(!root) return;

  root.addEventListener("click", async (e)=>{
    const btn = e.target.closest("[data-mode]");
    if(!btn) return;
    const mode = btn.getAttribute("data-mode");
    if(mode === currentMode) return;
    currentMode = mode;

    root.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
    btn.classList.add("active");

    await renderTop10();
  });
}

async function render(){
  await renderPremium();
  await renderNotices();
  buildTopWrap();
  bindTabs();
  await renderTop10();
}

document.addEventListener("DOMContentLoaded", render);

