// /public/assets/js/partials.js
async function inject(selector, url){
  const el = document.querySelector(selector);
  if(!el) return;
  try{
    const res = await fetch(url, { cache: "no-store" });
    el.innerHTML = await res.text();
  }catch(e){
    el.innerHTML = "";
    console.error("partials load fail:", url, e);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await inject("#site-header", "./partials/header.html");
  await inject("#site-footer", "./partials/footer.html");

  // 헤더/푸터가 비동기로 삽입되므로, 다른 모듈이 버튼/링크를 다시 바인딩할 수 있게 이벤트를 발행합니다.
  // (중요) main.js가 이벤트 리스너를 등록하기 전에 이 이벤트가 발행되면
  // 리스너가 놓칠 수 있습니다. 플래그를 함께 세팅해 두고, main.js는 플래그도 체크합니다.
  window.__DAINA_PARTIALS_LOADED__ = true;
  window.dispatchEvent(new CustomEvent("daina:partials:loaded"));

  // 일부 브라우저/번들 환경에서 이벤트 순서가 꼬일 수 있어, 한 틱 뒤에도 한 번 더 발행합니다.
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("daina:partials:loaded"));
  }, 0);
});
