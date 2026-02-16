// /public/assets/js/postDetailPage.js
import { auth, db } from "./firebaseApp.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { categoryLabel, getPost, toggleLike, addComment, reportItem, isAdmin } from "./postsApi.js";
import { esc, fmtDT, toast, bindModalClose, openModal, closeModal, pickText } from "./util.js";

import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function getId(){
  const usp = new URLSearchParams(location.search);
  return usp.get("id") || "";
}

function galleryHTML(p){
  // v14: images는 ["https://..."] 형태도 허용
  const raw = Array.isArray(p.thumbs) && p.thumbs.length ? p.thumbs : (p.images || []);
  const imgs = (raw || []).map((it)=>{
    if(typeof it === "string") return { url: it, thumb: "" };
    return {
      url: it?.url || it?.coverUrl || "",
      thumb: it?.thumbUrl || ""
    };
  }).filter(x=>x.url);

  // 대표 이미지 우선
  if(p.coverUrl && !imgs.some(x=>x.url===p.coverUrl)){
    imgs.unshift({ url: p.coverUrl, thumb: "" });
  }

  if(!imgs.length) return `<div class="gallery ph"></div>`;

  const main = imgs[0].url;
  const thumbs = imgs.slice(0,6).map((x,i)=>`
    <img class="gthumb" src="${esc(x.thumb || x.url)}" data-idx="${i}" alt="thumb" loading="lazy"/>
  `).join("");

  return `
    <div class="gallery">
      <img class="gmain" id="gMain" src="${esc(main)}" alt="main" />
      <div class="gthumbs" id="gThumbs">${thumbs}</div>
    </div>
  `;
}

function extraHTML(p){
  const ex = p.extra || {};
  const keys = Object.keys(ex);
  if(!keys.length) return "";
  const rows = keys.map(k=>`<div class="row"><div class="k">${esc(k)}</div><div class="v">${esc(ex[k])}</div></div>`).join("");
  return `<div class="kv">${rows}</div>`;
}

function linksHTML(p){
  const links = [];
  if(p.mapLink) links.push({ label: "지도", url: p.mapLink });
  if(p.chatLink) links.push({ label: "오픈채팅", url: p.chatLink });
  if(!links.length) return "";
  return `<div class="links">${links.map(l=>`<a class="btn small ghost" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join("")}</div>`;
}

function contactHTML(p){
  // 마감된 글은 연락처를 항상 완전 비공개 처리
  if(String(p.progressStatus || 'ongoing') === 'done'){
    return `<div class="muted">마감된 글입니다. 연락처는 비공개입니다.</div>`;
  }
  if(!p.contactPublic) return `<div class="muted">연락처는 댓글로 요청하세요.</div>`;
  return `<div class="contact">연락: ${esc(p.contact || "")}</div>`;
}

async function loadComments(postId, adminMode){
  const box = document.getElementById("comments");
  if(!box) return;

  const q0 = query(collection(db, "posts", postId, "comments"), orderBy("createdAt","asc"), limit(200));
  const snap = await getDocs(q0);

  const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));

  box.innerHTML = rows.length ? rows.map(c=>{
    if(c.hidden && !adminMode) return "";
    const mine = auth.currentUser && c.ownerUid === auth.currentUser.uid;
    const hiddenMark = c.hidden ? `<span class="pill st-hidden">숨김</span>` : "";
    const reason = c.hidden ? `<div class="muted">사유: ${esc(c.hiddenReason || "")}</div>` : "";
    return `
      <div class="comment" data-cid="${esc(c.id)}">
        <div class="comment-top">
          <div class="comment-who">${esc(c.ownerName || c.ownerEmail || "익명")}</div>
          <div class="comment-meta">${fmtDT(c.updatedAt || c.createdAt)} ${hiddenMark}</div>
        </div>
        <div class="comment-text">${esc(c.text || "")}</div>
        ${reason}
        <div class="comment-actions">
          <button class="btn small ghost" data-act="reportComment" type="button">신고</button>
          ${mine && !c.hidden ? `<button class="btn small" data-act="editComment" type="button">수정</button>
          <button class="btn small danger" data-act="deleteComment" type="button">삭제</button>` : ``}
          ${adminMode && !c.hidden ? `<button class="btn small danger" data-act="hideComment" type="button">숨김</button>` : ``}
        </div>
      </div>
    `;
  }).join("") : `<div class="empty">댓글이 없습니다.</div>`;

  bindCommentEvents(postId, adminMode);
}

function bindCommentEvents(postId, adminMode){
  const root = document.getElementById("comments");
  if(!root) return;

  root.onclick = async (e)=>{
    const btn = e.target.closest("[data-act]");
    if(!btn) return;
    const act = btn.dataset.act;
    const row = e.target.closest(".comment");
    const cid = row?.dataset?.cid;
    if(!cid) return;

    if(act === "reportComment"){
      const reason = prompt("신고 사유를 입력하세요 (2글자 이상)");
      if(!reason) return;
      try{
        await reportItem({ targetType:"comment", postId, commentId: cid, reason });
        toast("신고 완료");
      }catch(err){
        alert(err?.message || err);
      }
      return;
    }

    if(act === "deleteComment"){
      if(!confirm("댓글을 삭제할까요?")) return;
      try{
        await deleteDoc(doc(db, "posts", postId, "comments", cid));
        toast("삭제 완료");
        loadComments(postId, adminMode);
      }catch(err){
        alert(err?.message || err);
      }
      return;
    }

    if(act === "editComment"){
      const cur = row.querySelector(".comment-text")?.textContent || "";
      const next = prompt("댓글 수정", cur);
      if(!next) return;
      try{
        await updateDoc(doc(db, "posts", postId, "comments", cid), {
          text: next.trim(),
          updatedAt: serverTimestamp()
        });
        toast("수정 완료");
        loadComments(postId, adminMode);
      }catch(err){
        alert(err?.message || err);
      }
      return;
    }

    if(act === "hideComment" && adminMode){
      const reason = prompt("숨김 사유를 입력하세요");
      if(!reason) return;
      try{
        await updateDoc(doc(db, "posts", postId, "comments", cid), {
          hidden: true,
          hiddenReason: reason.trim(),
          hiddenBy: auth.currentUser?.uid || "",
          updatedAt: serverTimestamp()
        });
        toast("숨김 처리 완료");
        loadComments(postId, adminMode);
      }catch(err){
        alert(err?.message || err);
      }
    }
  };
}

async function toggleBookmark(postId){
  const u = auth.currentUser;
  if(!u) throw new Error("로그인이 필요합니다.");
  const ref = doc(db, "users", u.uid, "bookmarks", postId);
  const snap = await getDoc(ref);
  if(snap.exists()){
    await deleteDoc(ref);
    return false;
  }else{
    await setDoc(ref, { postId, createdAt: serverTimestamp() });
    return true;
  }
}

async function init(){
  bindModalClose();
  const postId = getId();
  if(!postId){
    document.getElementById("root").innerHTML = `<div class="empty">잘못된 접근입니다.</div>`;
    return;
  }

  const p = await getPost(postId);
  if(!p){
    document.getElementById("root").innerHTML = `<div class="empty">글을 찾을 수 없습니다.</div>`;
    return;
  }

  document.getElementById("catChip").textContent = categoryLabel(p.category);
  document.getElementById("title").textContent = pickText(p, "title") || "";
  document.getElementById("meta").textContent = `${p.area || ""} · ${fmtDT(p.updatedAt || p.createdAt)}`;
  document.getElementById("desc").textContent = pickText(p, "desc") || (p.content || "");

  document.getElementById("galleryBox").innerHTML = galleryHTML(p);
  document.getElementById("extraBox").innerHTML = extraHTML(p);
  document.getElementById("linksBox").innerHTML = linksHTML(p);
  document.getElementById("contactBox").innerHTML = contactHTML(p);

  const likeBtn = document.getElementById("btnLike");
  likeBtn.textContent = `좋아요 ${Number(p.likeCount||0)}`;

  const reportBtn = document.getElementById("btnReport");
  reportBtn.onclick = async ()=>{
    const reason = prompt("신고 사유를 입력하세요 (2글자 이상)");
    if(!reason) return;
    try{
      await reportItem({ targetType:"post", postId, reason });
      toast("신고 완료");
    }catch(err){
      alert(err?.message || err);
    }
  };

  document.getElementById("btnBack").onclick = ()=>history.back();

  likeBtn.onclick = async ()=>{
    try{
      const res = await toggleLike(postId);
      likeBtn.textContent = `좋아요 ${res.likeCount}`;
    }catch(err){
      alert(err?.message || err);
    }
  };

  document.getElementById("btnBookmark").onclick = async ()=>{
    try{
      const on = await toggleBookmark(postId);
      toast(on ? "찜 저장" : "찜 해제");
    }catch(err){
      alert(err?.message || err);
    }
  };

  document.getElementById("btnComment").onclick = async ()=>{
    const input = document.getElementById("commentText");
    const text = (input?.value || "").trim();
    if(!text) return;
    try{
      await addComment(postId, text);
      input.value = "";
      toast("댓글 등록");
      const adminMode = await isAdmin();
      loadComments(postId, adminMode);
    }catch(err){
      alert(err?.message || err);
    }
  };

  // gallery click
  const thumbs = document.getElementById("gThumbs");
  if(thumbs){
    thumbs.addEventListener("click", (e)=>{
      const img = e.target.closest(".gthumb");
      if(!img) return;
      const idx = Number(img.dataset.idx || 0);
      const url = (p.images?.[idx]?.url) || "";
      if(url){
        document.getElementById("gMain").src = url;
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  onAuthStateChanged(auth, async ()=>{
    const adminMode = await isAdmin();
    const postId = getId();
    if(postId) loadComments(postId, adminMode);
    const tip = document.getElementById("loginTip");
    if(tip) tip.style.display = auth.currentUser ? "none" : "";
  });
  init();
});
