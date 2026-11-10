const admin = require('firebase-admin');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT secret is missing');

const serviceAccount = JSON.parse(raw);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const messaging = admin.messaging();

function seoulParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

const roasts = [
  name => `${name}야, 오늘도 술 생각이 네 뇌를 점령했냐? 잔 내려놓고 네 인생 운전대나 잡아, 이 자식아!`,
  name => `${name}야!!! 간이 네 몸에서 무급 야근 중이다. 오늘은 퇴근 좀 시켜라, 제발!`,
  name => `${name}, 술 한 잔이 뭐 대수냐고? 그 한 잔이 매번 회의 소집하잖아. 오늘은 단칼에 거절해!`,
  name => `${name}야, 술한테 끌려다니지 마. 네가 주인이지 술병 뚜껑이 네 상사가 아니잖아!`,
  name => `${name}!!! 오늘 금주하면 내일 아침의 네가 고맙다고 한다. 오늘의 네가 좀 덜 멍청해져라!`,
  name => `${name}야, 술 약속보다 네 결심이 먼저다. 핑계 대지 말고 물 한 잔 마셔, 인간아!`,
  name => `${name}, 또 술이 널 부르냐? 차단해. 그 관계는 네 간만 상처받는 최악의 연애야.`,
  name => `${name}야!!! 오늘도 버텨. 술잔 들 손으로 이불이나 덮어라. 그게 오늘의 승리다!`,
  name => `${name}, 네 간은 퇴사 직전이다. 오늘 하루만이라도 회식 없는 평화를 선물해라!`,
  name => `${name}야, 술이 해결사면 세상 사람들 다 술집에서 노벨상 받았겠다. 오늘은 마시지 마!`
];

async function main() {
  const now = seoulParts();
  if (now.hour !== '19') {
    console.log(`Not the Seoul 19:00 hour (current hour: ${now.hour}). Skip.`);
    return;
  }

  const dateKey = `${now.year}-${now.month}-${now.day}`;
  const runRef = db.collection('geumjuPushRuns').doc(dateKey);

  // Claim today's run once. If sending fails, remove the marker so a later
  // scheduled run during the 19:00 hour can retry.
  await db.runTransaction(async tx => {
    const snap = await tx.get(runRef);
    if (snap.exists) throw new Error('ALREADY_SENT_TODAY');
    tx.create(runRef, { status: 'sending', createdAt: admin.firestore.FieldValue.serverTimestamp() });
  }).catch(err => {
    if (err.message === 'ALREADY_SENT_TODAY') {
      console.log(`Already sent for ${dateKey}.`);
      process.exit(0);
    }
    throw err;
  });

  try {
    const snap = await db.collection('geumjuPushTokens').where('enabled', '==', true).get();
    let sent = 0, failed = 0;
    const jobs = snap.docs.map(async doc => {
      const item = doc.data();
      if (!item.token) return;
      const name = String(item.name || '너').slice(0, 12);
      const index = (new Date(`${dateKey}T00:00:00+09:00`).getDate() + doc.id.length) % roasts.length;
      const body = roasts[index](name);
      try {
        await messaging.send({
          token: item.token,
          data: { title: '🍶 오늘도 금주', body, url: '/' }
        });
        sent++;
      } catch (err) {
        failed++;
        const code = err.errorInfo && err.errorInfo.code;
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token') {
          await doc.ref.set({ enabled: false }, { merge: true });
        }
        console.error(`Send failed for ${doc.id}: ${code || err.message}`);
      }
    });
    await Promise.all(jobs);
    await runRef.set({
      status: 'sent', sent, failed,
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`Completed ${dateKey}: sent=${sent}, failed=${failed}`);
  } catch (err) {
    await runRef.delete().catch(() => {});
    throw err;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
