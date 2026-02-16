
/* /public/assets/js/headerMenu.js */
import { q } from "./util.js";

export function wireHeaderMenu(){
  const btn = q("btnHamburger");
  const panel = q("menuPanel");
  const backdrop = q("menuBackdrop");
  const btnClose = q("btnMenuClose");

  if(!btn || !panel || !backdrop) return;

  function open(){
    backdrop.hidden = false;
    panel.hidden = false;
    document.body.style.overflow = "hidden";
    btn.setAttribute("aria-expanded","true");
  }
  function close(){
    backdrop.hidden = true;
    panel.hidden = true;
    document.body.style.overflow = "";
    btn.setAttribute("aria-expanded","false");
  }

  btn.addEventListener("click", ()=>{
    if(panel.hidden) open();
    else close();
  });
  btnClose && btnClose.addEventListener("click", close);
  backdrop.addEventListener("click", (e)=>{
    if(e.target === backdrop) close();
  });
  panel.querySelectorAll("a").forEach((a)=>a.addEventListener("click", close));
  window.addEventListener("resize", ()=>{ /* keep closed on resize */
    if(!panel.hidden) close();
  });

  // ensure hidden initially
  backdrop.hidden = true;
  panel.hidden = true;
}
