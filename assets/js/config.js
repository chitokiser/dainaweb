// /public/assets/js/config.js
export const CATEGORIES = [
  { key: "jobs", label: "구인" },
  { key: "jobseekers", label: "구직" },
  { key: "used", label: "중고거래" },
  { key: "realestate", label: "부동산임대" },
  { key: "shops", label: "상점" },
  { key: "stay", label: "숙박" },
  { key: "play", label: "놀거리" },
  { key: "biz", label: "사업아이템" }
];

export const CATEGORY_EXTRA_FIELDS = {
  used: [
    { key: "price", label: "가격", placeholder: "예: 500000 VND / 50 USD", type: "text" },
    { key: "condition", label: "상태", placeholder: "예: 새상품/상/중/하", type: "text" },
    { key: "delivery", label: "거래/배송", placeholder: "예: 직거래/택배/퀵", type: "text" },
    { key: "negotiable", label: "네고", placeholder: "예: 가능/불가", type: "text" }
  ],
  realestate: [
    { key: "rent", label: "월세", placeholder: "예: 8,000,000 VND", type: "text" },
    { key: "deposit", label: "보증금", placeholder: "예: 1개월/2개월", type: "text" },
    { key: "size", label: "면적", placeholder: "예: 35m²", type: "text" },
    { key: "contractType", label: "계약형태", placeholder: "예: 1년/2년/단기", type: "text" },
    { key: "moveInDate", label: "입주가능일", placeholder: "예: 즉시/2026-02-20", type: "text" }
  ],
  play: [
    { key: "dateTime", label: "일시", placeholder: "예: 2026-02-10 19:00", type: "text" },
    { key: "meetingPoint", label: "집결지", placeholder: "예: 호안끼엠 분수대", type: "text" },
    { key: "fee", label: "참가비", placeholder: "예: 0 / 200k VND", type: "text" },
    { key: "capacity", label: "정원", placeholder: "예: 20", type: "text" }
  ],
  biz: [
    { key: "investmentRange", label: "투자규모", placeholder: "예: 3천~1억", type: "text" },
    { key: "stage", label: "단계", placeholder: "예: 아이디어/PoC/운영중", type: "text" },
    { key: "partnerNeeded", label: "파트너", placeholder: "예: 마케팅/개발/자본", type: "text" }
  ],
  shops: [
    { key: "bizHours", label: "영업시간", placeholder: "예: 10:00-22:00", type: "text" },
    { key: "address", label: "주소", placeholder: "예: 하노이 ...", type: "text" }
  ],
  stay: [
    { key: "pricePerNight", label: "1박 가격", placeholder: "예: 1,200,000 VND", type: "text" },
    { key: "roomType", label: "객실/형태", placeholder: "예: 원룸/투룸/호텔/홈스테이", type: "text" },
    { key: "checkIn", label: "체크인", placeholder: "예: 14:00", type: "text" },
    { key: "checkOut", label: "체크아웃", placeholder: "예: 12:00", type: "text" },
    { key: "amenities", label: "편의시설", placeholder: "예: 수영장/조식/주차/Wi-Fi", type: "text" }
  ],
  jobs: [
    { key: "pay", label: "급여", placeholder: "예: 협의/월급", type: "text" },
    { key: "type", label: "형태", placeholder: "예: 정규/계약/파트", type: "text" }
  ],
  jobseekers: [
    { key: "role", label: "희망직무", placeholder: "예: 매니저/디자인", type: "text" },
    { key: "experience", label: "경력", placeholder: "예: 3년", type: "text" }
  ]
};

export const ALLOWED_LINK_DOMAINS = [
  "maps.google.com",
  "www.google.com",
  "goo.gl",
  "open.kakao.com",
  "zalo.me"
];

// 외부 이미지 URL: 사용자 요구사항(제한 없음) 기준으로 호스트 제한을 두지 않습니다.
// 다만 과거 코드/모듈에서 이 상수를 import 하는 경우가 있어, 호환용으로 export 합니다.
// 빈 배열(=제한 없음)
export const ALLOWED_IMAGE_HOSTS = [];

// 오픈채팅/메신저 링크 도메인(선택). 과거 코드 호환용.
// 실제 검증은 ALLOWED_LINK_DOMAINS 로 처리합니다.
export const ALLOWED_CHAT_DOMAINS = [
  "open.kakao.com",
  "zalo.me",
  "t.me",
  "chat.whatsapp.com"
];

export const POSTS_COLLECTION = "posts";
export const NOTICES_COLLECTION = "notices";
export const REPORTS_COLLECTION = "reports";

// 이메일 기반 관리자 허용 목록 (소문자). 예: ['jeonmicronet@gmail.com']
// 빈 배열이면 이메일 기반 허용을 사용하지 않습니다.
export const ADMIN_EMAILS = ['jeonmicronet@gmail.com'];
