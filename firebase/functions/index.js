const { onSchedule }   = require('firebase-functions/v2/scheduler');
const { onRequest }    = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

initializeApp();
const db = getFirestore();

// ── Secrets (set via: firebase functions:secrets:set NAME) ──
const GA4_PROPERTY_ID  = defineSecret('GA4_PROPERTY_ID');

// ─────────────────────────────────────────────
// SCHEDULED: every Monday 09:00 Santiago time
// ─────────────────────────────────────────────
exports.syncGA4Weekly = onSchedule(
  {
    schedule:  'every monday 09:00',
    timeZone:  'America/Santiago',
    secrets:   [GA4_PROPERTY_ID],
    memory:    '256MiB',
    region:    'us-central1',
  },
  async () => {
    console.log('⏰ Weekly GA4 sync triggered');
    await runSync();
  }
);

// ─────────────────────────────────────────────
// HTTP: manual trigger (for testing / backfill)
// POST /syncGA4Manual?start=2025-03-23&end=2025-03-29
// ─────────────────────────────────────────────
exports.syncGA4Manual = onRequest(
  { secrets: [GA4_PROPERTY_ID], region: 'us-central1' },
  async (req, res) => {
    const start = req.query.start || null;
    const end   = req.query.end   || null;
    try {
      const result = await runSync(start, end);
      res.json({ status: 'ok', data: result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
);

// ─────────────────────────────────────────────
// CORE SYNC LOGIC
// ─────────────────────────────────────────────
async function runSync(startOverride = null, endOverride = null) {
  const { startDate, endDate, weekLabel, weekNumber } =
    startOverride && endOverride
      ? buildDateInfo(startOverride, endOverride)
      : getLastWeekInfo();

  console.log(`📅 Pulling GA4 data: ${startDate} → ${endDate}`);

  const propertyId  = GA4_PROPERTY_ID.value();
  const client      = new BetaAnalyticsDataClient();
  const property    = `properties/${propertyId}`;
  const dateRanges  = [{ startDate, endDate }];

  // Nombres de campaña a filtrar
  const CAMPAIGN_GOOGLE_ADS = '[BTG] (BTG Corp) - Search Tráfico Fondo ETF Genérico';

  // ── 1. Adquisición de tráfico por campaña y fuente/medio ──
  // Filtro: campañas que contienen "btg_etf" + campaña exacta de Google Ads
  const [acqResp] = await client.runReport({
    property,
    dateRanges,
    dimensions: [
      { name: 'sessionCampaignName' },
      { name: 'sessionSourceMedium' },
    ],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
      { name: 'averageSessionDuration' },
    ],
    dimensionFilter: {
      orGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'sessionCampaignName',
              stringFilter: { matchType: 'CONTAINS', value: 'btg_etf' },
            },
          },
          {
            filter: {
              fieldName: 'sessionCampaignName',
              stringFilter: { matchType: 'EXACT', value: CAMPAIGN_GOOGLE_ADS },
            },
          },
        ],
      },
    },
  });

  // Agrupar filas por campaña, acumulando métricas
  const campaignMap = {};
  for (const row of (acqResp.rows || [])) {
    const campaignName   = row.dimensionValues[0].value;
    const sourceMedium   = row.dimensionValues[1].value;
    const users          = intVal(row.metricValues[0]);
    const sessions       = intVal(row.metricValues[1]);
    const avgDurSec      = parseFloat(row.metricValues[2]?.value || 0);

    if (!campaignMap[campaignName]) {
      campaignMap[campaignName] = {
        name:         campaignName,
        users:        0,
        sessions:     0,
        total_dur_sec: 0,
        sources:      [],
      };
    }
    campaignMap[campaignName].users         += users;
    campaignMap[campaignName].sessions      += sessions;
    campaignMap[campaignName].total_dur_sec += avgDurSec * sessions; // weighted sum
    campaignMap[campaignName].sources.push({
      source_medium: sourceMedium,
      users,
      sessions,
      avg_duration: fmtDuration(String(avgDurSec)),
    });
  }

  // Calcular duración promedio ponderada y formatear
  const campaignsArr = Object.values(campaignMap).map(c => ({
    name:         c.name,
    users:        c.users,
    sessions:     c.sessions,
    avg_duration: c.sessions > 0
      ? fmtDuration(String(c.total_dur_sec / c.sessions))
      : '00:00',
    sources:      c.sources,
  }));

  // Totales combinados de ambas campañas
  const total_users    = campaignsArr.reduce((s, c) => s + c.users,    0);
  const total_sessions = campaignsArr.reduce((s, c) => s + c.sessions, 0);
  const totalDurSec    = Object.values(campaignMap)
    .reduce((s, c) => s + c.total_dur_sec, 0);
  const total_avg_duration = total_sessions > 0
    ? fmtDuration(String(totalDurSec / total_sessions))
    : '00:00';

  // ── 2. Orgánico y Directo ──
  const [otherResp] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'sessionSourceMedium' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'averageSessionDuration' },
    ],
    dimensionFilter: {
      orGroup: {
        expressions: [
          { filter: { fieldName: 'sessionSourceMedium', stringFilter: { matchType: 'CONTAINS', value: 'organic' } } },
          { filter: { fieldName: 'sessionSourceMedium', stringFilter: { matchType: 'EXACT',    value: '(direct) / (none)' } } },
        ],
      },
    },
  });

  const sources_other = (otherResp.rows || []).map(row => ({
    source_medium: row.dimensionValues[0].value,
    sessions:      intVal(row.metricValues[0]),
    users:         intVal(row.metricValues[1]),
    avg_duration:  fmtDuration(row.metricValues[2]?.value),
  }));

  // ── 3. Botón "Ver Fondo" clicks (eventos dentro de las campañas ETF) ──
  const [eventsResp] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'eventCount' },
      { name: 'averageSessionDuration' },
    ],
    dimensionFilter: {
      andGroup: {
        expressions: [
          {
            orGroup: {
              expressions: [
                {
                  filter: {
                    fieldName: 'sessionCampaignName',
                    stringFilter: { matchType: 'CONTAINS', value: 'btg_etf' },
                  },
                },
                {
                  filter: {
                    fieldName: 'sessionCampaignName',
                    stringFilter: { matchType: 'EXACT', value: CAMPAIGN_GOOGLE_ADS },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });

  const btnRow = eventsResp.rows?.find(r => {
    const ev = r.dimensionValues[0].value.toLowerCase();
    return ev.includes('fondo') || ev.includes('ver_fondo') ||
           ev.includes('button') || ev.includes('cta');
  });
  const bm = btnRow?.metricValues;

  // ── Build document ──
  const weekId = `${startDate}_${endDate}`;
  const doc = {
    week_id:      weekId,
    week_number:  weekNumber,
    week_label:   weekLabel,
    period:       `${fmtDisplay(startDate)} – ${fmtDisplay(endDate)}`,
    start_date:   startDate,
    end_date:     endDate,
    updated_at:   FieldValue.serverTimestamp(),

    // Totales combinados (ambas campañas)
    total_users,
    total_sessions,
    total_avg_duration,

    // Detalle por campaña (con breakdown por fuente/medio)
    campaigns:     campaignsArr,
    sources_other, // orgánico + directo

    // Botón Ver Fondo
    button_users:    intVal(bm?.[0]),
    button_events:   intVal(bm?.[1]),
    button_duration: fmtDuration(bm?.[2]?.value),
  };

  // Write week document
  await db
    .collection('campaigns').doc('etf-generico')
    .collection('weeks').doc(weekId)
    .set(doc, { merge: true });

  // Recalculate cumulative aggregates
  await recalcAggregates();

  console.log('✅ GA4 sync complete', {
    weekId,
    total_sessions: doc.total_sessions,
    campaigns: campaignsArr.map(c => ({ name: c.name, sessions: c.sessions })),
  });
  return doc;
}

// ─────────────────────────────────────────────
// RECALCULATE CUMULATIVE TOTALS
// ─────────────────────────────────────────────
async function recalcAggregates() {
  const snap = await db
    .collection('campaigns').doc('etf-generico')
    .collection('weeks')
    .orderBy('start_date', 'asc')
    .get();

  let users_acum    = 0;
  let sessions_acum = 0;
  let week_count    = 0;
  let totalDurSec   = 0;

  snap.forEach(doc => {
    const w = doc.data();
    users_acum    += w.total_users    || 0;
    sessions_acum += w.total_sessions || 0;
    week_count++;

    // Acumular duración ponderada por sesiones
    if (w.total_avg_duration && w.total_sessions) {
      const [mm, ss] = w.total_avg_duration.split(':').map(Number);
      totalDurSec += ((mm * 60) + ss) * w.total_sessions;
    }
  });

  const avg_duration_acum = sessions_acum > 0
    ? fmtDuration(String(totalDurSec / sessions_acum))
    : '00:00';

  await db.collection('campaigns').doc('etf-generico').set({
    users_acum,
    sessions_acum,
    avg_duration_acum,
    week_count,
    last_updated: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('📊 Aggregates updated', { users_acum, sessions_acum, avg_duration_acum, week_count });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function getLastWeekInfo() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
  const daysToLastMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMon = new Date(today);
  lastMon.setDate(today.getDate() - daysToLastMon - 7);
  const lastSun = new Date(lastMon);
  lastSun.setDate(lastMon.getDate() + 6);
  return buildDateInfo(fmt(lastMon), fmt(lastSun));
}

function buildDateInfo(startDate, endDate) {
  return {
    startDate,
    endDate,
    weekLabel: `${fmtDisplay(startDate)} – ${fmtDisplay(endDate)}`,
    weekNumber: getWeekNumber(startDate),
  };
}

function fmt(d) {
  return d.toISOString().split('T')[0];
}

function fmtDisplay(iso) {
  const [, m, d] = iso.split('-');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${parseInt(d)} ${months[parseInt(m)-1]}`;
}

function fmtDuration(seconds) {
  const s = Math.round(parseFloat(seconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function intVal(metricValue) {
  return parseInt(metricValue?.value || 0);
}

function getWeekNumber(isoDate) {
  const d = new Date(isoDate);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
}
