// /public/tools/fix_move_jobs_to_jobseekers.js
// node public/tools/fix_move_jobs_to_jobseekers.js

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "daina-c8680";
const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, "serviceAccountKey.json");

if (!fs.existsSync(KEY_PATH)) {
  console.error("serviceAccountKey.json not found:", KEY_PATH);
  console.error("Put it here:", KEY_PATH);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(KEY_PATH)),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

// 조건을 “구직 시드만” 잡아내기 위한 필터
// 1) 일단 category가 jobs 이고
// 2) ownerEmail이 seed에서 쓰던 이메일이거나(있으면)
// 3) 또는 content/title에 베트남 구직자 특징 키워드가 포함되어 있거나
function looksLikeJobSeeker(doc) {
  const d = doc.data() || {};
  const titleKo = (d.title && d.title.ko) ? String(d.title.ko) : String(d.titleKo || d.title || "");
  const content = String(d.content || (d.desc && d.desc.ko) || "");
  const contact = String(d.contact || "");
  const email = String(d.ownerEmail || "");

  const hay = (titleKo + " " + content + " " + contact + " " + email).toLowerCase();

  // 구직자 느낌 키워드(원하면 더 추가 가능)
  const keys = [
    "tìm việc", "xin việc", "cv", "kinh nghiệm", "lương", "full-time", "part-time",
    "phỏng vấn", "thực tập", "ứng tuyển", "nhân viên"
  ];

  return keys.some(k => hay.includes(k));
}

async function main() {
  const dryrun = (process.argv.includes("--dryrun"));
  const limArg = process.argv.find(a => a.startsWith("--limit="));
  const LIMIT = limArg ? Number(limArg.split("=")[1]) : 500;

  console.log("project:", PROJECT_ID);
  console.log("dryrun:", dryrun);
  console.log("limit:", LIMIT);

  // 최근 문서부터 훑고 싶으면 createdAtIso desc를 쓰고,
  // 인덱스/필드 없으면 그냥 limit만 씀
  let snap;
  try {
    snap = await db.collection("posts").where("category", "==", "jobs").limit(LIMIT).get();
  } catch (e) {
    console.error("query failed:", e.message);
    process.exit(1);
  }

  const candidates = [];
  snap.forEach(doc => {
    if (looksLikeJobSeeker(doc)) candidates.push(doc);
  });

  console.log("found candidates:", candidates.length);

  let batch = db.batch();
  let n = 0;

  for (const doc of candidates) {
    const ref = db.collection("posts").doc(doc.id);
    batch.update(ref, {
      category: "jobseekers",
      categoryLabel: "구직",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });
    n++;

    if (n % 400 === 0) {
      if (!dryrun) await batch.commit();
      console.log("committed:", n);
      batch = db.batch();
    }
  }

  if (n % 400 !== 0) {
    if (!dryrun) await batch.commit();
  }

  console.log("done. updated:", n);
  console.log("tip: run with --dryrun first if you want:");
  console.log("node public/tools/fix_move_jobs_to_jobseekers.js --dryrun");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
