# Food Opportunity Radar

Yogurtland 마케팅팀을 위한 **경쟁사·트렌드 모니터링 도구**입니다. 프로즌요거트 경쟁 브랜드와 F&B 업계 뉴스를 매일 자동으로 수집하고, AI로 새로운 신호(신메뉴·맛·재료·캠페인·프로모션·제휴)를 추출한 뒤 Yogurtland 적용 가능성에 대한 1차 판단을 붙여 대시보드·구글 시트·이메일로 전달합니다.

## 동작 방식

GitHub Actions가 매일 23:17 UTC(약 08:17 KST)에 아래 파이프라인을 순서대로 실행합니다 ([.github/workflows/collect.yml](.github/workflows/collect.yml)).

| 단계 | 명령 | 하는 일 |
| --- | --- | --- |
| 1. 수집 | `npm run collect` | 브랜드 웹사이트·보도자료 페이지 스냅샷(변경 시에만 저장), YouTube 신규 영상, 업계 뉴스 RSS, 경쟁사 Instagram 게시물(Meta Graph API) 수집. 업계 소스는 추적 브랜드나 프로즌 디저트 관련 키워드(froyo, 아이스크림, 디저트, 아사이, 토핑, flavor, LTO 등)가 있을 때만 저장 |
| 2. AI 추출 | `npm run extract` | Gemini로 구조화된 인사이트 추출. 무료 하루 한도가 모델별로 따로 있어서, 한 모델의 한도가 차면 다음 모델로 넘어감(`GEMINI_MODELS`, 기본: 3.6-flash → 3.7-flash → 3.5-flash-lite). 모든 모델의 한도가 차면 멈추고, 남은 건은 다음 실행에서 이어서 처리. 같은 페이지는 이전 버전과 비교해 **새로 바뀐 내용만** 신호로 판단. 근거 문장, 신뢰도, Yogurtland 적합도 초안 포함 |
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
- **Instagram**: @iloveyochi.us, @mimis.ny, @gogreekyogurt

브랜드와 수집 소스는 Supabase의 `brands`, `sources` 테이블로 관리합니다. 새로 추가할 때는 [supabase/migrations/](supabase/migrations/)에 마이그레이션을 추가하세요.

## Instagram 수집

Meta Graph API의 Business Discovery로 경쟁사 **비즈니스/크리에이터 계정**의 공개 게시물(ID, 캡션, 링크, 게시 시각)을 가져옵니다. 코드는 [scripts/instagram.mjs](scripts/instagram.mjs)에 있습니다.

- **계정 추가**: `sources` 테이블에 행을 하나 추가합니다 (`source_type='instagram_account'`, `collection_method='instagram_graph'`, `identifier`=사용자명). 예시는 [0010_instagram_sources.sql](supabase/migrations/0010_instagram_sources.sql)에 있습니다.
- **중복 방지**: 게시물 ID(`raw_contents.external_id`)에 유니크 인덱스가 있어서 여러 번 실행해도 같은 게시물은 한 번만 저장됩니다.
- **조회량 줄이기**: 계정당 실행 1회에 최대 25개(`INSTAGRAM_MAX_POSTS_PER_ACCOUNT`)까지만 가져오고, 이미 저장된 게시물이 3개 연속 나오면 다음 페이지를 조회하지 않습니다. 3개로 둔 이유는 오래된 게시물이 상단에 고정(pin)되어 있을 수 있기 때문입니다.
- **AI 분석**: 수집된 게시물은 다음 단계 `npm run extract`에서 캡션만 근거로 분석합니다. 이미지는 보지 않으며, 캡션에 없는 내용은 추측하지 않도록 지시합니다. 캡션이 없거나 너무 짧은 게시물은 저장만 되고 분석 대상에서는 빠집니다.
- **오류 처리**: 오류는 `[auth_expired]` 토큰 만료, `[permission]` 권한 부족, `[account_not_found]` 계정 없음 또는 비즈니스 계정이 아님, `[rate_limit]` 호출 제한, `[network]`/`[transient]` 일시 오류로 구분해 로그와 `sources.last_error`에 남습니다. 일시 오류만 최대 2번 재시도합니다. 한 계정이 실패해도 다른 계정과 다른 소스 수집은 계속 진행됩니다.
- **수동 실행**: `npm run collect:instagram` (Instagram 소스만 실행)
- **테스트**: `npm test` (토큰 없이 모의 응답으로 검증)

### 토큰 관리

Graph API Explorer에서 발급한 토큰은 **1~2시간이면 만료**되므로 자동 수집에 쓰면 안 됩니다. 아래 중 하나로 만료되지 않는 토큰을 만들어 `META_ACCESS_TOKEN`에 넣으세요. 어느 방법이든 instagram_basic, instagram_manage_insights, pages_read_engagement, pages_show_list 권한이 필요합니다.

1. **시스템 사용자 토큰 (권장)**: Meta 비즈니스 설정 → 사용자 → 시스템 사용자에서 시스템 사용자를 만들고, 앱과 Facebook 페이지(1294599633740862)를 자산으로 할당한 뒤 토큰을 생성합니다. 만료 기간을 "없음"으로 선택할 수 있습니다.
2. **페이지 액세스 토큰**: Explorer 토큰을 장기 사용자 토큰(60일)으로 교환한 다음, 그 토큰으로 페이지 토큰을 받습니다. 이렇게 받은 페이지 토큰은 만료되지 않습니다. 다만 페이지 관리자 권한을 잃거나, 비밀번호를 바꾸거나, 앱 권한을 해제하면 무효가 됩니다.
   ```
   GET https://graph.facebook.com/v26.0/oauth/access_token?grant_type=fb_exchange_token&client_id={앱ID}&client_secret={앱시크릿}&fb_exchange_token={Explorer토큰}
   GET https://graph.facebook.com/v26.0/1294599633740862?fields=access_token&access_token={장기사용자토큰}
   ```

토큰을 만든 뒤에는 [액세스 토큰 디버거](https://developers.facebook.com/tools/debug/accesstoken/)에서 만료일이 "Never"인지, 권한이 모두 들어 있는지 확인하세요. 토큰이 만료되면 수집 로그에 `[auth_expired]`가 찍히고 다른 소스는 그대로 수집됩니다. 새 토큰을 발급해 GitHub Secret을 교체하면 다음 실행부터 다시 수집됩니다.

토큰은 서버(GitHub Actions)에서만 쓰입니다. 요청 URL이 아니라 `Authorization` 헤더로 보내고, 로그와 DB에 남는 오류 메시지에서도 가립니다. `NEXT_PUBLIC_` 접두사를 붙이지 마세요.

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
- `raw_contents`: 수집한 원문 (HTML 스냅샷, YouTube 영상, RSS 기사, Instagram 게시물)
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
   - Instagram: `META_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, `META_GRAPH_API_VERSION` (위 "토큰 관리" 참고)
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

GitHub Actions에서 돌리려면 위 환경변수를 저장소 Secrets에 등록해야 합니다. 서비스 계정 키는 `GOOGLE_SERVICE_ACCOUNT_KEY`에 JSON 내용 그대로 넣습니다. Instagram은 `META_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`를 Secrets에 넣습니다. `META_GRAPH_API_VERSION`은 선택 사항이며, Variables에 넣지 않으면 `v26.0`을 씁니다. 워크플로 페이지에서 `workflow_dispatch`로 수동 실행할 수도 있습니다.
