
/* /public/assets/js/roles.js */
import { auth, db } from "./firebaseApp.js";
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { q, setText } from "./util.js";

async function safeRedirectResult(){
  try{ await getRedirectResult(auth); }catch(e){ /* ignore */ }
}

export async function getMyFlags(uid){
  // role inference by profile doc existence + admin flag from roles/{uid}
  if(!uid) return { admin:false, hasEmployer:false, hasJobseeker:false };
  let admin=false, hasEmployer=false, hasJobseeker=false;

  // roles/{uid} is readable by self (rules)
  try{
    const rs = await getDoc(doc(db,"roles",uid));
    admin = rs.exists() && rs.data()?.admin === true;
  }catch{}

  try{
    const e = await getDoc(doc(db,"employers",uid));
    hasEmployer = e.exists();
  }catch{}

  try{
    const j = await getDoc(doc(db,"jobseekers",uid));
    hasJobseeker = j.exists();
  }catch{}

  return { admin, hasEmployer, hasJobseeker };
}

export function wireHeaderAuthUi(){
  // desktop header shows only the signed-in email pill
  // login/logout lives inside the hamburger menu
  const btnLogin2 = q("btnLogin2");
  const btnLogout2 = q("btnLogout2");
  const userPill = q("userPill");
  const adminLink = q("linkAdmin");
  const seedLink = q("linkSeed");

  const provider = new GoogleAuthProvider();

  function doLogin(){
    return signInWithRedirect(auth, provider);
  }

  btnLogin2 && btnLogin2.addEventListener("click", doLogin);

  btnLogout2 && btnLogout2.addEventListener("click", async ()=>{
    try{ await signOut(auth); }catch(e){ console.error(e); }
  });

  // make redirect result handled once per page
  safeRedirectResult();

  onAuthStateChanged(auth, async (user)=>{
    if(user){
      userPill && (userPill.style.display="inline-flex");
      setText("userEmail", user.email || user.uid);
      btnLogin2 && (btnLogin2.style.display="none");
      btnLogout2 && (btnLogout2.style.display="inline-flex");

      const flags = await getMyFlags(user.uid);
      if(adminLink){
        adminLink.style.display = flags.admin ? "block" : "none";
      }
      if(seedLink){
        seedLink.style.display = flags.admin ? "block" : "none";
      }
    }else{
      userPill && (userPill.style.display="none");
      btnLogin2 && (btnLogin2.style.display="inline-flex");
      btnLogout2 && (btnLogout2.style.display="none");
      if(adminLink) adminLink.style.display="none";
      if(seedLink) seedLink.style.display="none";
    }
  });
}
