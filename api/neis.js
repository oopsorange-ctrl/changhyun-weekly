// 창현 위클리 — NEIS 중계 함수 (Vercel Serverless Function)
// NEIS 인증키는 Vercel 프로젝트 설정 > Environment Variables 의 NEIS_KEY 에만 넣습니다.
// 화면 코드(index.html)에는 키가 없으므로 다른 선생님 컴퓨터에 노출되지 않습니다.
// 응답은 Vercel CDN에 30분 캐시되어, 선생님이 몇 명이 쓰든 NEIS 호출은 거의 늘지 않습니다.

const ATPT = process.env.NEIS_ATPT || 'J10';        // 경기도교육청
const SCHOOL = process.env.NEIS_SCHOOL || '7530208'; // 창현고등학교

function cleanMenu(s) {
  return String(s || '')
    .split(/<br\s*\/?>/i)
    .map(x => x.replace(/\(\s*[\d.\s]+\)/g, '').replace(/[*#]+$/, '').trim())
    .filter(Boolean);
}

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const type = q.type;
  const from = String(q.from || '');
  const to = String(q.to || '');
  if (!['meal', 'schedule'].includes(type) || !/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) {
    res.status(400).json({ error: 'type=meal|schedule, from/to=YYYYMMDD 가 필요합니다.' });
    return;
  }
  const svc = type === 'meal' ? 'mealServiceDietInfo' : 'SchoolSchedule';
  const range = type === 'meal'
    ? `MLSV_FROM_YMD=${from}&MLSV_TO_YMD=${to}`
    : `AA_FROM_YMD=${from}&AA_TO_YMD=${to}`;
  const key = process.env.NEIS_KEY ? `KEY=${encodeURIComponent(process.env.NEIS_KEY)}&` : '';
  const url = `https://open.neis.go.kr/hub/${svc}?${key}Type=json&pIndex=1&pSize=300` +
    `&ATPT_OFCDC_SC_CODE=${ATPT}&SD_SCHUL_CODE=${SCHOOL}&${range}`;

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('NEIS HTTP ' + r.status);
    const j = await r.json();
    const block = j[svc];
    let rows = [];
    if (block) {
      rows = (block[1] && block[1].row) || [];
    } else if (j.RESULT && j.RESULT.CODE !== 'INFO-200') {
      // INFO-200 = 데이터 없음(정상). 그 외는 키 오류 등
      throw new Error(j.RESULT.CODE + ' ' + j.RESULT.MESSAGE);
    }
    const out = type === 'meal'
      ? rows.map(r => ({ ymd: r.MLSV_YMD, type: r.MMEAL_SC_NM, menu: cleanMenu(r.DDISH_NM), kcal: r.CAL_INFO || '' }))
      : rows.map(r => ({ ymd: r.AA_YMD, name: r.EVENT_NM, off: r.SBTR_DD_SC_NM === '휴업일' }));
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    res.status(200).json({ rows: out, keyed: !!process.env.NEIS_KEY });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: String(e.message || e) });
  }
};
