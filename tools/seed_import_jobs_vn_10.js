// /tools/seed_import_jobs_vn_10.js
// 설명: 버튼(=node 실행) 한 번으로 posts 컬렉션에 "구인(jobs)" 시드 100개를 넣습니다.
// 실행:
// 1) npm i firebase-admin
// 2) Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성
// 3) 이 파일과 같은 폴더(/tools)에 키 파일을 serviceAccountKey.json 이름으로 저장
// 4) node tools/seed_import_jobs_vn_10.js
//
// 옵션 환경변수:
// - SEED_PROJECT_ID: 파이어베이스 프로젝트 ID (없으면 키 파일에 포함된 project_id 사용)
// - SEED_COLLECTION: 기본 posts
// - SEED_MODE: mixed | pending | approved  (기본 mixed)
// - SEED_DRYRUN: 1 이면 실제 저장 없이 콘솔 출력만

const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

const KEY_PATH = path.resolve(__dirname, "serviceAccountKey.json");
if (!fs.existsSync(KEY_PATH)) {
  console.error(
    "[ERROR] serviceAccountKey.json 파일이 없습니다. /tools 폴더에 저장해 주세요."
  );
  process.exit(1);
}

const serviceAccount = require(KEY_PATH);
const projectId = process.env.SEED_PROJECT_ID || serviceAccount.project_id;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId,
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const COLLECTION = process.env.SEED_COLLECTION || "posts";
const MODE = (process.env.SEED_MODE || "mixed").toLowerCase(); // mixed | pending | approved
const DRYRUN = process.env.SEED_DRYRUN === "1";

function nowIso(d = new Date()) {
  return d.toISOString();
}

function pick(arr, i) {
  return arr[i % arr.length];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function makePhone(i) {
  // 베트남 스타일 느낌(가짜)
  // 09xx-xxx-xxx
  const a = 80 + (i % 20);
  const b = 100 + (i % 900);
  const c = 100 + ((i * 7) % 900);
  return `09${a}-${b}-${c}`;
}

function slugEmail(name, i) {
  const base = name
    .toLowerCase()
    .replaceAll("đ", "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".");
  return `${base}.${pad2(i)}@samplemail.com`;
}

function makeImages(i) {
  const rep = `https://picsum.photos/seed/daina-job-${String(i).padStart(3, "0")}/800/600`;
  const extra = [
    `https://picsum.photos/seed/daina-job-${String(i).padStart(3, "0")}-a/800/600`,
    `https://picsum.photos/seed/daina-job-${String(i).padStart(3, "0")}-b/800/600`,
  ];
  return { rep, extras: extra };
}

function makeSeed100() {
  const vnNames = [
    "Linh Nguyen",
    "Thu Tran",
    "Minh Pham",
    "Nam Le",
    "Mai Ngo",
    "Hung Vo",
    "Yen Bui",
    "An Pham",
    "Quang Nguyen",
    "Tuan Ngo",
    "Hanh Do",
    "Trang Vu",
    "Khoa Tran",
    "Phuong Le",
    "My Nguyen",
    "Duc Pham",
    "Lan Tran",
    "Hieu Nguyen",
    "Nhi Le",
    "Vy Tran",
  ];

  const roles = [
    { ko: "바리스타/서빙", vi: "barista/phục vụ", tag: "바리스타", extra: { language: "VN/EN" } },
    { ko: "네일/속눈썹", vi: "nail/nối mi", tag: "네일", extra: { tools: "개인지참 가능" } },
    { ko: "주방보조/설거지", vi: "phụ bếp/rửa bát", tag: "주방보조", extra: { shift: "야간 가능" } },
    { ko: "운전기사(B2)", vi: "lái xe (B2)", tag: "기사", extra: { license: "B2" } },
    { ko: "리셉션/CS", vi: "lễ tân/CSKH", tag: "리셉션", extra: { language: "VN/EN" } },
    { ko: "창고/물류", vi: "kho/vận hành", tag: "물류", extra: { strength: "20kg 가능" } },
    { ko: "간병/돌봄", vi: "chăm sóc", tag: "간병", extra: { stayIn: "협의" } },
    { ko: "사무보조/통역", vi: "trợ lý/phiên dịch", tag: "사무보조", extra: { koreanLevel: "TOPIK 2~3" } },
    { ko: "투어가이드", vi: "hướng dẫn viên", tag: "가이드", extra: { language: "VN/KR" } },
    { ko: "프론트엔드 주니어", vi: "frontend junior", tag: "프론트엔드", extra: { stack: "HTML/CSS/JS" } },
    { ko: "매장판매/캐셔", vi: "bán hàng/thu ngân", tag: "판매", extra: { pos: "가능" } },
    { ko: "청소/하우스키핑", vi: "tạp vụ/housekeeping", tag: "하우스키핑", extra: { shift: "주간" } },
    { ko: "미용/헤어", vi: "tóc/beauty", tag: "미용", extra: { experience: "1y+" } },
    { ko: "배달/라이더", vi: "shipper/rider", tag: "배달", extra: { vehicle: "오토바이" } },
    { ko: "경비/보안", vi: "bảo vệ", tag: "경비", extra: { night: "가능" } },
  ];

  const areas = [
    "하노이 Cầu Giấy",
    "하노이 Nam Từ Liêm",
    "하노이 Thanh Xuân",
    "하노이 Hà Đông",
    "하노이 Ba Đình",
    "하노이 Tây Hồ",
    "하노이 Hoàn Kiếm",
    "하노이 Hai Bà Trưng",
    "하노이 Long Biên",
    "하노이 Gia Lâm",
    "하노이 Bắc Từ Liêm",
    "하노이 Đống Đa",
  ];

  const expTexts = [
    { ko: "경력 6개월", vi: "6 tháng kinh nghiệm", years: "0.5y" },
    { ko: "경력 1년", vi: "1 năm kinh nghiệm", years: "1y" },
    { ko: "경력 1년 6개월", vi: "1 năm rưỡi kinh nghiệm", years: "1.5y" },
    { ko: "경력 2년", vi: "2 năm kinh nghiệm", years: "2y" },
    { ko: "경력 3년", vi: "3 năm kinh nghiệm", years: "3y" },
  ];

  const availability = ["즉시", "1주 내", "2주 내", "1달 내", "주말 가능"];
  const progress = ["ongoing", "done"];

  const items = [];
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - 30);

  for (let i = 1; i <= 100; i++) {
    const r = pick(roles, i - 1);
    const vnName = pick(vnNames, i - 1);
    const area = pick(areas, i - 1);
    const exp = pick(expTexts, i - 1);
    const av = pick(availability, i - 1);

    const status =
      MODE === "pending" ? "pending" : MODE === "approved" ? "approved" : i % 5 === 0 ? "rejected" : i % 3 === 0 ? "approved" : "pending";

    const pStatus = pick(progress, i - 1);

    const d = new Date(baseDate);
    d.setMinutes(d.getMinutes() + i * 37);

    const { rep, extras } = makeImages(i);

    const titleKo = `하노이 ${r.ko} 구직합니다 (${exp.ko}, ${av})`;
    const titleVi = `Tìm việc ${r.vi} tại Hà Nội (${exp.vi}, ${av === "즉시" ? "có thể đi làm ngay" : "linh hoạt"})`;

    const contentKo =
      `안녕하세요. ${vnName} 입니다. 하노이에서 ${r.ko} 일을 구하고 있습니다.\n\n` +
      `- ${exp.ko}\n` +
      `- 희망 지역: ${area}\n` +
      `- 근무 가능: ${av}\n\n` +
      `성실하게 오래 일하고 싶습니다. 연락 부탁드립니다.`;

    const contentVi =
      `Xin chào anh/chị. Em là ${vnName}. Em đang tìm việc ${r.vi} tại Hà Nội.\n\n` +
      `- ${exp.vi}\n` +
      `- Khu vực mong muốn: ${area.replace("하노이 ", "")}\n` +
      `- Có thể làm: ${av === "즉시" ? "đi làm ngay" : "trao đổi"}\n\n` +
      `Em chăm chỉ và muốn làm lâu dài. Anh/chị liên hệ giúp em ạ.`;

    const phone = makePhone(i);
    const email = slugEmail(vnName, i);

    const docData = {
      category: "jobs",
      categoryLabel: "구인",

      title: `${titleKo} / ${titleVi}`,
      content: `${contentKo}\n\n---\n\n${contentVi}`,

      region: area,
      tags: Array.from(new Set([r.tag, "하노이", "구직"])),

      contact: `zalo: ${phone} / email: ${email}`,
      contactPublic: true,

      mapUrl: "",
      openchatUrl: "",

      repImageUrl: rep,
      imageUrls: extras,

      extra: {
        ...r.extra,
        experience: exp.years,
        availability: av,
        progressStatus: pStatus,
        vnName,
      },

      status,

      ownerUid: "seed_user_uid",
      ownerEmail: email,
      ownerName: vnName,

      likeCount: Math.floor((i * 13) % 70),
      commentCount: Math.floor((i * 7) % 25),
      bumpCount: Math.floor((i * 3) % 8),

      createdAt: FieldValue.serverTimestamp(),
      createdAtIso: nowIso(d),
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: nowIso(d),

      approvedAt: status === "approved" ? FieldValue.serverTimestamp() : null,
      approvedAtIso: status === "approved" ? nowIso(d) : "",
      rejectedAt: status === "rejected" ? FieldValue.serverTimestamp() : null,
      rejectedAtIso: status === "rejected" ? nowIso(d) : "",
      rejectReason: status === "rejected" ? "서류 미비(테스트 데이터)" : "",

      editRequested: false,
      editRequestedAt: null,
      editRequestedAtIso: "",

      // 글쓴이가 진행중/완료 선택 가능한 필드(프론트에서 쓰는 값)
      progressStatus: pStatus,
    };

    items.push(docData);
  }

  return items;
}

async function run() {
  const seeds = makeSeed100();

  console.log(`projectId: ${projectId}`);
  console.log(`collection: ${COLLECTION}`);
  console.log(`mode: ${MODE}`);
  console.log(`dryrun: ${DRYRUN ? "yes" : "no"}`);
  console.log(`total: ${seeds.length}`);

  if (DRYRUN) {
    console.log("[DRYRUN] first item preview:", seeds[0]);
    return;
  }

  // Firestore batch는 최대 500 writes 제한
  const chunks = [];
  for (let i = 0; i < seeds.length; i += 450) chunks.push(seeds.slice(i, i + 450));

  let done = 0;
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const docData of chunk) {
      const ref = db.collection(COLLECTION).doc(); // auto id
      batch.set(ref, docData, { merge: false });
    }
    await batch.commit();
    done += chunk.length;
    console.log(`committed: ${done}/${seeds.length}`);
  }

  console.log("OK. seed inserted.");
}

run().catch((e) => {
  console.error("[ERROR]", e);
  process.exit(1);
});
