/**
 * /tools/seed_import_jobs_korean_companies_vn_100.js
 *
 * 실행:
 *   node tools/seed_import_jobs_korean_companies_vn_100.js
 *
 * 옵션:
 *   DRYRUN=1 node tools/seed_import_jobs_korean_companies_vn_100.js
 *
 * 필요 파일:
 *   /tools/serviceAccountKey.json (Firebase Admin SDK 키)
 */

const path = require('path');
const admin = require('firebase-admin');

const seeds = require('./seed_jobs_korean_companies_vn_100');

const SERVICE_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const DRYRUN = String(process.env.DRYRUN || '').trim() === '1';

function nowIso(){
  return new Date().toISOString();
}

function buildDoc(seed){
  const iso = nowIso();

  const title = {
    ko: String(seed.titleKo || '').trim(),
    ...(seed.titleVi ? { vi: String(seed.titleVi).trim() } : {})
  };
  const desc = {
    ko: String(seed.descKo || '').trim(),
    ...(seed.descVi ? { vi: String(seed.descVi).trim() } : {})
  };

  const coverUrl = Array.isArray(seed.imageUrls) && seed.imageUrls.length ? String(seed.imageUrls[0]) : '';
  const thumbs = Array.isArray(seed.imageUrls) ? seed.imageUrls.map(String).filter(Boolean).slice(0,10) : [];

  return {
    category: 'jobs',
    categoryLabel: '구인',

    title,
    desc,

    area: String(seed.area || '').trim(),
    tag: String(seed.tag || '').trim(),
    tags: [String(seed.tag || '').trim()].filter(Boolean),

    contact: String(seed.contact || '').trim(),
    contactPublic: seed.contactPublic !== false,

    mapLink: '',
    chatLink: '',

    coverUrl,
    thumbs,

    // 호환 필드
    repImageUrl: coverUrl,
    imageUrls: thumbs,
    content: desc.ko,
    region: String(seed.area || '').trim(),

    extra: seed.extra && typeof seed.extra === 'object' ? seed.extra : {},

    status: 'approved',
    progressStatus: 'ongoing',

    ownerUid: 'seed',
    ownerEmail: 'seed@daina-demo.vn',
    ownerName: 'Daina Seed',

    likeCount: 0,
    commentCount: 0,
    bumpCount: 0,

    createdAtIso: iso,
    updatedAtIso: iso,
    approvedAtIso: iso,

    // Firestore Timestamp는 서버에서 자동 set
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),

    rejectedAt: null,
    rejectedAtIso: '',
    rejectReason: '',

    editRequested: false,
    editRequestedAt: null,
    editRequestedAtIso: '',
  };
}

async function main(){
  const key = require(SERVICE_KEY_PATH);
  admin.initializeApp({ credential: admin.credential.cert(key) });

  const db = admin.firestore();
  const col = db.collection('posts');

  console.log('project:', key.project_id || '(unknown)');
  console.log('collection: posts');
  console.log('dryrun:', DRYRUN ? 'yes' : 'no');
  console.log('total:', Array.isArray(seeds) ? seeds.length : 0);

  if (!Array.isArray(seeds) || !seeds.length) {
    console.log('No seeds');
    return;
  }

  let ok = 0;
  for (let i=0;i<seeds.length;i++){
    const doc = buildDoc(seeds[i]);
    if (DRYRUN) {
      ok++;
      continue;
    }
    await col.add(doc);
    ok++;
    if (ok % 10 === 0) console.log('committed:', ok + '/' + seeds.length);
  }

  console.log('OK. seed inserted:', ok);
}

main().catch((e)=>{
  console.error(e);
  process.exit(1);
});
