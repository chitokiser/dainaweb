
/* /public/assets/js/jobDetailPage.js */
import { auth, db } from "./firebaseApp.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { esc, setText, fmtDate, toast } from "./util.js";

function getId(){
  const u = new URL(location.href);
  return u.searchParams.get("id") || "";
}

let _job = null;
let _user = null;

function field(label, value){
  return `
    <div class="g6">
      <div class="sub">${esc(label)}</div>
      <div style="margin-top:6px;">${value ? esc(value) : `<span class="muted">-</span>`}</div>
    </div>
  `;
}

async function load(){
  const id = getId();
  if(!id){
    toast("id가 없습니다.");
    location.href="./jobs.html";
    return;
  }
  const snap = await getDoc(doc(db,"job_posts", id));
  if(!snap.exists()){
    toast("공고를 찾을 수 없습니다.");
    location.href="./jobs.html";
    return;
  }
  _job = { id, ...snap.data() };

  setText("title", _job.title || "공고 상세");
  setText("sub", `${_job.companyName || "-"} · 상태: ${_job.status || "-"} · 승인일: ${fmtDate(_job.approvedAt || _job.createdAt)}`);

  const body = document.getElementById("body");
  body.innerHTML = [
    field("회사명", _job.companyName),
    field("구인 분류", _job.category),
    field("근무형태", _job.workType),
    field("근무지역", _job.workRegion),
    field("제시금액/월", _job.salary),
    field("연락처", _job.contactPhone),
    field("이메일", _job.contactEmail),
    `<div class="g12"><div class="sub">요구사항</div><div style="margin-top:8px; white-space:pre-wrap;">${_job.requirements?esc(_job.requirements):`<span class="muted">-</span>`}</div></div>`,
    `<div class="g12"><div class="sub">특기 요구사항</div><div style="margin-top:8px; white-space:pre-wrap;">${_job.specialReq?esc(_job.specialReq):`<span class="muted">-</span>`}</div></div>`,
  ].join("");

  // action area
  const actions = document.getElementById("actions");
  actions.innerHTML = `<a class="btn" href="./jobs.html">목록</a>`;
}

async function apply(){
  const msg = document.getElementById("applyMsg");
  msg.textContent = "";
  if(!_job) return;

  if(!_user){
    toast("로그인이 필요합니다.");
    return;
  }

  // must have jobseeker profile
  const jsSnap = await getDoc(doc(db,"jobseekers", _user.uid));
  if(!jsSnap.exists()){
    toast("구직 등록이 필요합니다.");
    location.href="./register_jobseeker.html";
    return;
  }
  const js = jsSnap.data() || {};

  const appId = `${_job.id}_${_user.uid}`;
  const ref = doc(db, "job_applications", appId);
  const exists = await getDoc(ref);
  if(exists.exists()){
    msg.textContent = "이미 지원했습니다.";
    return;
  }

  // create application with snapshot
  await setDoc(ref, {
    jobId: _job.id,
    employerUid: _job.ownerUid || "",
    applicantUid: _user.uid,
    status: "applied",
    createdAt: serverTimestamp(),
    // snapshot
    name: js.name || _user.displayName || "",
    email: js.email || _user.email || "",
    phone: js.phone || "",
    sns: js.sns || "",
    category: js.category || "",
    workStatus: js.workStatus || "",
    skills: js.skills || "",
    profile: js.profile || "",
    photoUrl: js.photoUrl || _user.photoURL || ""
  });

  msg.textContent = "지원 완료. 관리자 검토 후 구인자에게 전달됩니다.";
}

document.getElementById("btnApply")?.addEventListener("click", async ()=>{
  try{
    document.getElementById("btnApply").disabled = true;
    await apply();
  }catch(e){
    console.error(e);
    toast("지원 실패 (콘솔 확인)");
  }finally{
    document.getElementById("btnApply").disabled = false;
  }
});

onAuthStateChanged(auth, (u)=>{ _user = u || null; });

load();
