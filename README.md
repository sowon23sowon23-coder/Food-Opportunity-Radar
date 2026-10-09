# Food Opportunity Radar

Yogurtland 마케팅팀을 위한 **경쟁사·트렌드 모니터링 도구**입니다. 프로즌요거트 경쟁 브랜드와 F&B 업계 뉴스를 매일 자동으로 수집하고, AI로 새로운 신호(신메뉴·맛·재료·캠페인·프로모션·제휴)를 추출한 뒤 Yogurtland 적용 가능성에 대한 1차 판단을 붙여 대시보드·구글 시트·이메일로 전달합니다.

## 동작 방식

GitHub Actions가 매일 23:17 UTC(약 08:17 KST)에 아래 파이프라인을 순서대로 실행합니다 ([.github/workflows/collect.yml](.github/workflows/collect.yml)).

| 단계 | 명령 | 하는 일 |
| --- | --- | --- |
| 1. 수집 | `npm run collect` | 브랜드 웹사이트·보도자료 페이지 스냅샷(변경 시에만 저장), YouTube 신규 영상, 업계 뉴스 RSS 수집. 업계 소스는 추적 브랜드나 froyo/soft serve 관련 내용이 있을 때만 저장 |
| 2. AI 추출 | `npm run extract` | Gemini로 구조화된 인사이트 추출. 같은 페이지는 이전 버전과 비교해 **새로 바뀐 내용만** 신호로 판단. 근거 문장, 신뢰도, Yogurtland 적합도 초안 포함 |
| 3. 시트 동기화 | `npm run sync-sheet` | 구글 시트의 "전체" 탭과 브랜드별 탭에 인사이트 정리 |
| 4. 이메일 | `npm run digest` | "오늘의 인사이트" 다이제스트 메일 발송 |

### Yogurtland 적합도

AI가 각 신호에 다음 중 하나를 초안으로 매기고, 실행 아이디어와 판단 이유를 함께 작성합니다. 사람이 검토하기 위한 초안이며 최종 결정이 아닙니다. 셀프서브·무게 단위 결제·토핑바라는 Yogurtland 매장 형태를 기준으로 판단하고, 시장 규모나 매출 같은 수치는 만들어 내지 않습니다.

- **explore**: 더 조사해 볼 가치가 있음
- **validate**: 고객/SNS 반응을 먼저 확인
- **test**: 일부 매장에서 시범 운영할 만큼 구체적
- **hold**: 기록은 하되 지금 우선순위는 아님
- **reject**: 브랜드/운영에 맞지 않음

## 추적 대상

- **경쟁 브랜드**: Menchie's, Pinkberry, sweetFrog, TCBY, 16 Handles, Red Mango, Yochi(호주), Go Greek Yogurt, Mimi's(NYC)
- **업계 뉴스**: Nation's Restaurant News, Restaurant Dive, Food Dive, Nosh, The Spoon, Modern Restaurant Management, FoodNavigator, National Restaurant Association, Placer.ai 등

브랜드와 수집 소스는 Supabase의 `brands`, `sources` 테이블로 관리합니다. 새로 추가할 때는 [supabase/migrations/](supabase/migrations/)에 마이그레이션을 추가하세요.

## 구조

```
src/app/page.tsx              대시보드 (Supabase에서 매 요청마다 최신 데이터 조회)
src/components/InsightsBoard  인사이트 목록 + 적합도 단계 필터
scripts/                      수집·추출·시트 동기화·다이제스트 스크립트
supabase/migrations/          DB 스키마 및 브랜드/소스 시드 데이터
reports/, research_notes/     프로즌요거트 시장 트렌드 조사 문서
```

주요 테이블:

- `brands`, `sources`: 추적 브랜드와 수집처
- `raw_contents`: 수집한 원문 (HTML 스냅샷, YouTube 영상, RSS 기사)
- `content_insights`: AI가 추출한 인사이트와 Yogurtland 적합도

## 기술 스택

Next.js · React · Tailwind CSS · Supabase(Postgres) · Gemini API · YouTube Data API · Google Sheets API · Gmail SMTP(nodemailer) · GitHub Actions · Vercel

## 로컬 실행

1. 의존성 설치

   ```bash
   npm install
   ```

2. `.env.local.example`을 `.env.local`로 복사하고 값을 채웁니다.
   - Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `YOUTUBE_API_KEY`, `GEMINI_API_KEY`
   - 이메일: `EMAIL_FROM`, `EMAIL_APP_PASSWORD`, `EMAIL_TO` (여러 명이면 쉼표로 구분, 숨은참조로 발송)
   - 시트 동기화: `GOOGLE_SHEET_ID`, 그리고 프로젝트 루트의 `google-service-account.json`(서비스 계정 키)

3. Supabase SQL Editor에서 [supabase/migrations/](supabase/migrations/)의 파일을 번호 순서대로 실행합니다.

4. 대시보드 실행

   ```bash
   npm run dev
   ```

   [http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

5. 파이프라인을 수동으로 실행하려면

   ```bash
   npm run collect
   npm run extract
   npm run sync-sheet
   npm run digest
   ```

GitHub Actions에서 돌리려면 위 환경변수를 저장소 Secrets에 등록해야 합니다. 서비스 계정 키는 `GOOGLE_SERVICE_ACCOUNT_KEY`에 JSON 내용 그대로 넣습니다. 워크플로 페이지에서 `workflow_dispatch`로 수동 실행할 수도 있습니다.
