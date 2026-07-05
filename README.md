# GPU 매물 감시 (클라우드)

중고 GPU 매물(RTX 4060 Ti 16GB / 3060 12GB)이 조건에 맞게 새로 올라오면 텔레그램으로 알림을 보낸다.

**GitHub Actions가 15분마다 자동 실행** → 내 컴퓨터가 꺼져 있어도 동작한다.

## 동작
- `watch.mjs` — 번개장터 검색 API + 컴퓨존 중고인증 카운트를 확인, 조건 충족 매물을 텔레그램으로 전송
- `seen.json` — 이미 알린 매물 기록(중복 알림 방지). 매 실행 후 자동 커밋됨
- `.github/workflows/watch.yml` — 15분 주기 크론

## 설정 (GitHub Secrets)
저장소 **Settings → Secrets and variables → Actions** 에 두 개 등록:
- `TELEGRAM_BOT_TOKEN` — 텔레그램 봇 토큰
- `TELEGRAM_CHAT_ID` — 알림 받을 채팅 ID

## 감시 조건 (watch.mjs에서 수정)
| 대상 | 상한가 |
|------|--------|
| RTX 4060 Ti 16GB | 60만원 |
| RTX 3060 12GB | 31만원 |

매물을 다 잡으면 저장소의 Actions를 끄거나 삭제하면 된다.
