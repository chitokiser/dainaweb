// /assets/js/main.js
import { auth, db } from "./firebaseApp.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const provider = new GoogleAuthProvider();

async function acceptAdminInviteIfAny(user){
  try{
    if(!user || !user.email) return false;
    const email = String(user.email).trim().toLowerCase();
    if(!email) return false;

    // 초대 문서 확인: adminInvites/{email}
    const inviteRef = doc(db, "adminInvites", email);
    const inviteSnap = await getDoc(inviteRef);
    const enabled = inviteSnap.exists() && inviteSnap.data()?.enabled === true;

    if(!enabled) return false;

    // admins/{uid} 생성(혹은 enabled=true로 병합)
    const adminRef = doc(db, "admins", user.uid);
    await setDoc(adminRef, {
      enabled: true,
      email,
      viaInvite: true,
      invitedByUid: inviteSnap.data()?.invitedByUid || "",
      invitedByEmail: inviteSnap.data()?.invitedByEmail || "",
      grantedAt: serverTimestamp(),
    }, { merge: true });

    // 초대는 유지(관리자가 추적 가능). 원하면 아래처럼 소진 표시도 가능.
    // 규칙에서 self-update를 막는 경우를 대비해 실패해도 무시합니다.
    try{
      await updateDoc(inviteRef, {
        lastGrantedUid: user.uid,
        lastGrantedAt: serverTimestamp(),
      });
    }catch{}

    return true;
  }catch(e){
    console.warn("[acceptAdminInviteIfAny] ignored:", e?.message || e);
    return false;
  }
}



let _authUiBound = false;
let _partialsHooked = false;

function hookPartialsEvent(){
  if(_partialsHooked) return;
  _partialsHooked = true;

  window.addEventListener("daina:partials:loaded", ()=>{
    bindAuthUi();
    refreshAdminNav(auth.currentUser);
    bindMobileMenu();
  });

  if(window.__DAINA_PARTIALS_LOADED__){
    setTimeout(()=>{
      bindAuthUi();
      refreshAdminNav(auth.currentUser);
      bindMobileMenu();
    }, 0);
  }
}

hookPartialsEvent();

async function ensureUserProfile(user){
  if(!user) return;
  const uref = doc(db, "users", user.uid);
  await setDoc(uref, {
    email: user.email || "",
    name: user.displayName || "",
    photoURL: user.photoURL || "",
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function checkAdmin(user){
  if(!user) return false;
  try{
    const aRef = doc(db, "admins", user.uid);
    const snap = await getDoc(aRef);
    if(!snap.exists()) return false;
    const d = snap.data() || {};
    return d.enabled === true;
  }catch{
    return false;
  }
}

function bindMobileMenu(){
  const btn = document.getElementById("btnHamburger");
  const mnav = document.getElementById("mobileNav");
  if(!btn || !mnav) return;

  btn.addEventListener("click", ()=>{
    mnav.classList.toggle("open");
  });

  document.addEventListener("click", (e)=>{
    if(!mnav.classList.contains("open")) return;
    const inside = e.target.closest("#siteHeaderRoot");
    if(!inside) mnav.classList.remove("open");
  });
}

async function safeSignIn(){
  // PC/모바일 자동 분기
  // - PC(일반 브라우저): popup 우선
  // - 모바일/인앱브라우저(WebView): redirect(또는 auth.html 경유) 우선

  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  // Android WebView, iOS WKWebView, in-app browsers(카톡/페북/인스타 등) 탐지
  const isAndroidWebView = isAndroid && /; wv\)/i.test(ua);
  const isIOSWebView = isIOS && !/Safari\//i.test(ua); // 크롬(iOS)도 Safari 엔진이지만 Safari 토큰이 다름
  const isInAppBrowser = /(KAKAOTALK|FBAN|FBAV|Instagram|Line\/|NAVER\(inapp|DaumApps|SamsungBrowser\/|Whale)/i.test(ua);
  const shouldPreferRedirect = isMobile || isAndroidWebView || isIOSWebView || isInAppBrowser;

  // 모바일/인앱에서는 auth.html(redirect 방식)로 보내서 로그인
  if(shouldPreferRedirect){
    try{ sessionStorage.setItem("daina:returnTo", location.href); }catch{}
    location.href = "auth.html";
    return;
  }

  // PC: popup 우선 → 막히면 redirect 폴백
  try{
    await signInWithPopup(auth, provider);
    return;
  }catch(e){
    const code = e?.code || "";
    const msg = String(e?.message || e || "");

    if(code.includes("unauthorized-domain")){
      alert(
        "구글로그인이 차단되었습니다(unauthorized-domain).\n\n" +
        "Firebase Console → Authentication → Settings → Authorized domains 에\n" +
        "현재 도메인(예: 127.0.0.1 또는 localhost)을 추가하세요.\n\n" +
        "현재: " + location.origin
      );
      console.error(e);
      return;
    }

    if(code.includes("operation-not-allowed") || code.includes("configuration-not-found")){
      alert(
        "구글 로그인 제공자 설정이 꺼져있습니다.\n\n" +
        "Firebase Console → Authentication → 로그인 방법(Sign-in method) → Google 사용 설정(Enable) 후 저장하세요."
      );
      console.error(e);
      return;
    }

    const needRedirect =
      code.includes("popup-blocked") ||
      code.includes("popup-closed-by-user") ||
      code.includes("operation-not-supported-in-this-environment") ||
      code.includes("disallowed_useragent") ||
      msg.toLowerCase().includes("popup") ||
      msg.toLowerCase().includes("blocked");

    if(needRedirect){
      // redirect는 별도 페이지(auth.html)로 보내서 처리(모바일/정책 차단 포함)
      try{ sessionStorage.setItem("daina:returnTo", location.href); }catch{}
      location.href = "auth.html";
      return;
    }

    console.error(e);
    alert(e?.message || e);
  }
}

function bindAuthUi(){
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const authState = document.getElementById("authState");

  if(!btnLogin || !btnLogout) return; // 헤더가 아직 주입 전

  if(!_authUiBound){
    btnLogin.addEventListener("click", async ()=>{
      try{ await safeSignIn(); }
      catch(e){ console.error(e); alert(e?.message || e); }
    });

    btnLogout.addEventListener("click", async ()=>{
      try{ await signOut(auth); }
      catch(e){ console.error(e); alert(e?.message || e); }
    });

    _authUiBound = true;
  }

  const user = auth.currentUser;
  if(authState){
    authState.textContent = user
      ? (user.email || user.displayName || "로그인됨")
      : "로그인 필요";
  }

  btnLogin.style.display = user ? "none" : "";
  btnLogout.style.display = user ? "" : "none";
}

async function refreshAdminNav(user){
  const navAdmin = document.getElementById("navAdmin");
  const navAdminM = document.getElementById("navAdminM");
  const navMy = document.getElementById("navMy");
  const navMyM = document.getElementById("navMyM");

  // 마이페이지: 로그인 시 노출
  if(navMy) navMy.style.display = user ? "" : "none";
  if(navMyM) navMyM.style.display = user ? "" : "none";

  if(!navAdmin && !navAdminM) return;

  const isAdm = user ? await checkAdmin(user) : false;
  if(navAdmin) navAdmin.style.display = isAdm ? "" : "none";
  if(navAdminM) navAdminM.style.display = isAdm ? "" : "none";
}

document.addEventListener("DOMContentLoaded", async ()=>{
  // 로그인 유지
  try{ await setPersistence(auth, browserLocalPersistence); }catch(e){ console.warn(e); }

  // redirect 로그인 결과(팝업 대신 redirect로 간 경우)
  try{ await getRedirectResult(auth); }catch(e){ /* ignore */ }

  bindMobileMenu();
  bindAuthUi();

  onAuthStateChanged(auth, async (user)=>{
    await acceptAdminInviteIfAny(user);

    if(user) await ensureUserProfile(user);
    bindAuthUi();
    await refreshAdminNav(user);
  });
});
