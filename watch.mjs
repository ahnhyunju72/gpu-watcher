/**
 * 중고 GPU 매물 감시 → 텔레그램 알림 (클라우드용 독립 실행형)
 *
 * GitHub Actions가 15분마다 이 스크립트를 실행한다. (컴퓨터 꺼져 있어도 동작)
 * - 번개장터: 공개 검색 API에서 조건에 맞는 새 매물 감지
 * - 컴퓨존: 중고인증 카테고리 카운트 등장 감지 (0→N 트립와이어)
 * 이미 알린 매물은 seen.json에 기록 → 워크플로가 커밋해서 다음 실행 때 재사용(중복 알림 방지).
 *
 * 필요 환경변수(=GitHub Secrets): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */
import fs from "fs";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
const SEEN_FILE = "seen.json";

const NAME_EXCLUDE = /본체|조립|컴퓨터|노트북|삽니다|구매|데스크탑|일체형|세트|풀박|판매완료|판매됨|거래완료/i;

/** 감시 대상 (카드 단품 기준) */
const WATCH_TARGETS = [
  {
    label: "4060 Ti 16GB",
    queries: ["4060 Ti 16GB", "4060ti 16g"],
    require: [/4060\s*ti/i, /16\s*g/i],
    maxPrice: 600_000,
  },
  {
    label: "3060 12GB",
    queries: ["RTX 3060 12GB", "3060 12gb"],
    require: [/3060(?!\s*ti)/i, /12\s*g/i], // 3060 Ti(8GB) 제외
    maxPrice: 310_000,
  },
];

function loadSeen() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"));
  } catch {
    return { bunjangPids: [], compuzoneUsedCount: 0 };
  }
}

function saveSeen(state) {
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify(state, null, 2));
  } catch {
    /* 저장 실패해도 다음 주기 재시도 */
  }
}

async function sendTelegram(text) {
  if (!TOKEN || !CHAT) {
    console.error("⚠️ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 미설정 — 알림 못 보냄");
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.error("텔레그램 전송 실패:", (await res.text()).slice(0, 200));
  } catch (err) {
    console.error("텔레그램 전송 예외:", String(err).slice(0, 200));
  }
}

async function checkBunjang(seen) {
  const alerts = [];
  for (const target of WATCH_TARGETS) {
    for (const q of target.queries) {
      try {
        const res = await fetch(
          `https://api.bunjang.co.kr/api/1/find_v2.json?q=${encodeURIComponent(q)}&order=date&page=0&n=40`,
          { signal: AbortSignal.timeout(20_000) },
        );
        if (!res.ok) continue;
        const data = await res.json();
        for (const item of data.list || []) {
          const pid = String(item.pid);
          const name = String(item.name || "");
          const price = parseInt(String(item.price), 10) || 0;
          if (String(item.status) !== "0") continue; // "0"=판매중
          if (!target.require.every((re) => re.test(name))) continue;
          if (NAME_EXCLUDE.test(name)) continue;
          if (price <= 0 || price > target.maxPrice) continue;
          if (seen.bunjangPids.includes(pid)) continue;
          seen.bunjangPids.push(pid);
          alerts.push(
            `⚡ 번개장터 새 매물! [${target.label}]\n${name}\n${price.toLocaleString()}원\nhttps://m.bunjang.co.kr/products/${pid}`,
          );
        }
      } catch {
        /* 이번 주기 스킵 */
      }
    }
  }
  if (seen.bunjangPids.length > 500) seen.bunjangPids = seen.bunjangPids.slice(-300);
  return alerts;
}

async function checkCompuzone(seen) {
  const alerts = [];
  const url =
    "https://www.compuzone.co.kr/search/search.htm?SearchProductKey=" +
    encodeURIComponent("4060 Ti 16GB");
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return alerts;
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("euc-kr").decode(buf);
    const m = html.match(/'89'[^>]*>[^<]*<em>\((\d+)\)<\/em>/);
    const count = m ? parseInt(m[1], 10) : 0;
    if (count > (seen.compuzoneUsedCount || 0)) {
      alerts.push(
        `🏬 컴퓨존 중고인증에 "4060 Ti 16GB" 매물 등장! (${count}개)\n보증 있는 업체중고 — 바로 확인하세요:\n${url}`,
      );
    }
    seen.compuzoneUsedCount = count;
  } catch {
    /* 이번 주기 스킵 */
  }
  return alerts;
}

const seen = loadSeen();
const alerts = [...(await checkBunjang(seen)), ...(await checkCompuzone(seen))];
saveSeen(seen);
for (const msg of alerts) {
  await sendTelegram(msg);
  console.log("📢 알림 전송:", msg.split("\n")[1] || msg.split("\n")[0]);
}
console.log(`✅ 체크 완료 — 새 알림 ${alerts.length}건`);
