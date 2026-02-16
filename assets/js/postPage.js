// /public/assets/js/postPage.js
import { auth, db } from "./firebaseApp.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function val(id){ return (document.getElementById(id)?.value || "").trim(); }

function setStatus(msg){
  const el = document.getElementById("statusBox");
  if(el) el.textContent = msg;
}

function safeUrl(u){
  const s = String(u || "").trim();
  if(!s) return "";
  try{
    const url = new URL(s);
    return url.toString();
  }catch{
    return "";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnSubmit");
  if(btn) btn.disabled = true;

  onAuthStateChanged(auth, (user) => {
    if(user){
      setStatus("로그인됨: " + (user.displayName || user.email || ""));
      if(btn) btn.disabled = false;
    }else{
      setStatus("로그인이 필요합니다.");
      if(btn) btn.disabled = true;
    }
  });

  if(btn){
    btn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if(!user){
        alert("로그인이 필요합니다.");
        return;
      }

      const category = val("category");
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

      btn.disabled = true;
      setStatus("등록 중...");

      const payload = {
        title,
        desc,
        area,
        tag,
        contact,
        href,

        status: "pending",
        ownerUid: user.uid,
        ownerName: user.displayName || "",
        ownerEmail: user.email || "",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      try{
        const colRef = collection(db, category);
        await addDoc(colRef, payload);

        alert("등록 요청 완료! 관리자 승인 후 노출됩니다.");
        location.href = "./index.html";
      }catch(e){
        console.error(e);
        alert("등록 실패: " + (e?.message || e));
        btn.disabled = false;
        setStatus("등록 실패. 콘솔 에러 확인");
      }
    });
  }
});
