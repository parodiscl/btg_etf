/**
 * Reemplaza docs semanales por un único doc del período completo
 * node fix_firestore.js
 */
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

if (!getApps().length) initializeApp({ projectId: 'btg---etf' });
const db = getFirestore();

async function main() {
  const campaign = db.collection('campaigns').doc('etf-generico');
  const weeks    = campaign.collection('weeks');

  // 1. Listar todos los docs actuales
  const snap = await weeks.get();
  console.log('Docs actuales:');
  snap.forEach(d => console.log(' -', d.id, '| sessions:', d.data().total_sessions));

  // 2. Eliminar docs de semanas individuales de la campaña
  const toDelete = snap.docs.filter(d => d.id !== '2026-03-23_2026-04-12');
  for (const d of toDelete) {
    await d.ref.delete();
    console.log('Eliminado:', d.id);
  }

  // 3. Escribir doc período completo con datos reales GA4
  await weeks.doc('2026-03-23_2026-04-12').set({
    week_id:             '2026-03-23_2026-04-12',
    week_number:         12,
    week_label:          '23 Mar – 12 Abr',
    period:              '23 Mar – 12 Abr',
    start_date:          '2026-03-23',
    end_date:            '2026-04-12',
    updated_at:          FieldValue.serverTimestamp(),
    total_users:         4195,
    total_sessions:      4537,
    total_avg_duration:  '00:34',
    campaigns:           [],
    sources_other:       [],
    button_users:        0,
    button_events:       0,
    button_duration:     '00:00',
  }, { merge: true });
  console.log('Doc período completo escrito: 2026-03-23_2026-04-12');

  // 4. Actualizar agregado directamente
  await campaign.set({
    users_acum:         4195,
    sessions_acum:      4537,
    avg_duration_acum:  '00:34',
    week_count:         1,
    last_updated:       FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('Agregado actualizado: sessions_acum=4537, users_acum=4195');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
