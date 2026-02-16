// /assets/js/authPage.js
import { auth } from "./firebaseApp.js";
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const provider = new GoogleAuthProvider();

const $debug = document.getElementById("authDebug");
const $btn = document.getElementById("btnDoLogin");
const $back = document.getElementById("btnBack");
const $openBrowser = document.getElementById("btnOpenBrowser");
const $openBrowserWrap = document.getElementById("openBrowserWrap");

function detectInApp(){
  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isAndroidWebView = isAndroid && /; wv\)/i.test(ua);
  const isIOSWebView = isIOS && !/Safari\//i.test(ua);
  const isInAppBrowser = /(KAKAOTALK|FBAN|FBAV|Instagram|Line\/|NAVER\(inapp|DaumApps)/i.test(ua);
  return { ua, isMobile, isAndroid, isIOS, isAndroidWebView, isIOSWebView, isInAppBrowser };
}

function openInSystemBrowser(){
  // 대부분의 인앱브라우저에서 _blank가 외부 브라우저로 열리거나,
  // 최소한 "브라우저에서 열기" 옵션을 유도합니다.
  const url = location.href;
  try{ window.open(url, "_blank"); }catch{}
  // 그래도 안 되면 안내 문구를 보게 됩니다.
}

function setDebug(...args){
  if(!$debug) return;
  $debug.textContent = args.map(a=>
    typeof a === "string" ? a : JSON.stringify(a, null, 2)
  ).join("\n");
}

function getReturnTo(){
  try{
    const v = sessionStorage.getItem("daina:returnTo");
    return v || "index.html";
  }catch{
    return "index.html";
  }
}

function goBack(){
  const to = getReturnTo();
  location.href = to;
}

async function startLogin(){
  setDebug("redirect 로그인 시작...", { origin: location.origin });
  await signInWithRedirect(auth, provider);
}

if($btn) $btn.addEventListener("click", startLogin);
if($back) $back.addEventListener("click", goBack);
if($openBrowser) $openBrowser.addEventListener("click", openInSystemBrowser);

(async ()=>{
  const env = detectInApp();
  setDebug("초기화...", { origin: location.origin, env });

  if($openBrowserWrap){
    const needOpen = env.isAndroidWebView || env.isIOSWebView || env.isInAppBrowser;
    $openBrowserWrap.style.display = needOpen ? "" : "none";
  }

  // 로그인 유지
  try{ await setPersistence(auth, browserLocalPersistence); }catch(e){ /* ignore */ }

  // redirect 결과 처리 (구글 로그인 후 이 페이지로 돌아오면 여기로 떨어짐)
  try{
    const res = await getRedirectResult(auth);
    if(res?.user){
      setDebug("redirect 결과 수신: 로그인 성공", {
        email: res.user.email,
        uid: res.user.uid
      });
      setTimeout(goBack, 600);
      return;
    }
  }catch(e){
    setDebug("redirect 결과 처리 중 오류", {
      code: e?.code,
      message: e?.message
    });
  }

  // 현재 로그인 상태
  onAuthStateChanged(auth, (user)=>{
    if(user){
      setDebug("이미 로그인 되어 있습니다.", {
        email: user.email,
        uid: user.uid
      });
    }else{
      setDebug("아직 로그인 안됨. 아래 버튼을 눌러 로그인 시작하세요.");
    }
  });
})();
