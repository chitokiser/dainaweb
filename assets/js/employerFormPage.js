
/* /public/assets/js/employerFormPage.js */
import { auth, db } from "./firebaseApp.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { q, toast } from "./util.js";

let user=null;

function fill(d){
  q("managerId").value = d.managerId || "";
  q("companyName").value = d.companyName || "";
  q("phone").value = d.phone || "";
  q("email").value = d.email || (user?.email || "");
  q("sns").value = d.sns || "";
  q("about").value = d.about || "";
}

async function loadMe(){
  if(!user) return;
  const snap = await getDoc(doc(db,"employers", user.uid));
  if(snap.exists()) fill(snap.data() || {});
}

async function save(e){
  e.preventDefault();
  if(!user){ toast("로그인이 필요합니다."); return; }
  const data = {
    uid: user.uid,
    managerId: q("managerId").value.trim(),
    companyName: q("companyName").value.trim(),
    phone: q("phone").value.trim(),
    email: q("email").value.trim() || (user.email || ""),
    sns: q("sns").value.trim(),
    about: q("about").value.trim(),
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db,"employers", user.uid), data, { merge:true });
  q("msg").textContent = "저장 완료";
}

q("btnLoad")?.addEventListener("click", async ()=>{
  try{ await loadMe(); q("msg").textContent = "불러오기 완료"; }catch(e){ console.error(e); toast("불러오기 실패"); }
});

q("form")?.addEventListener("submit", async (e)=>{
  try{ q("btnSave").disabled = true; await save(e); }
  catch(err){ console.error(err); toast("저장 실패"); }
  finally{ q("btnSave").disabled = false; }
});

onAuthStateChanged(auth, async (u)=>{
  user = u || null;
  q("authWarn").style.display = user ? "none" : "block";
  if(user){
    await loadMe();
    if(!q("email").value) q("email").value = user.email || "";
  }
});
