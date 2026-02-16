<!-- /tools/README_SEED.md -->

Firebase Admin 키 준비
- Firebase Console > 프로젝트 설정(톱니) > 서비스 계정 > 새 비공개 키 생성
- 다운로드한 JSON 파일명을 serviceAccountKey.json 으로 바꾸고 아래 위치에 저장
  /tools/serviceAccountKey.json

구인(한국기업이 베트남 인력 모집) 시드 100개 넣기
- 프로젝트 루트에서 실행
  node tools/seed_import_jobs_korean_companies_vn_100.js

- 실제 입력 전에 테스트(저장 안 함)
  DRYRUN=1 node tools/seed_import_jobs_korean_companies_vn_100.js
