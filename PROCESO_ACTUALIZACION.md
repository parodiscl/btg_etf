# Proceso de Actualización de Datos — BTG ETF Dashboard

## Antes de empezar — Preguntas obligatorias
1. **¿Cuál es el período que estamos reportando?** (ej: "23 Mar – 12 Abr")
2. **¿Cuál es la ruta local del spreadsheet actualizado?**
   ⚠️ **Debe ser una ruta local** (ej: `/Users/ap/Downloads/btg_etf_planilla.xlsx`), no una URL de Google Sheets.
   Si solo tienes la URL, descárgalo primero: `Archivo > Descargar > Microsoft Excel (.xlsx)`
   Sin archivo local, el proceso es 10x más lento.
3. **¿Hay nuevas plataformas o audiencias que no estaban antes?**
4. **¿El presupuesto mensual sigue siendo $3.800.000?**

---

## PASO 1 — Extraer datos del spreadsheet

```bash
python3 << 'EOF'
import pandas as pd

ARCHIVO = 'RUTA_AL_SPREADSHEET.xlsx'

xl = pd.ExcelFile(ARCHIVO)
df_perf  = pd.read_excel(ARCHIVO, sheet_name='PERFORMANCE',  header=None)
df_aud   = pd.read_excel(ARCHIVO, sheet_name='AUDIENCIAS',   header=None)
df_otros = pd.read_excel(ARCHIVO, sheet_name='OTROS MEDIOS', header=None)

print("=== PERFORMANCE ===")
for i in range(5, 20):
    try:
        row = df_perf.iloc[i]
        vals = [str(v) for v in row if str(v) != 'nan']
        if vals: print(f"Fila {i}: {' | '.join(vals)}")
    except: pass

print("\n=== AUDIENCIAS ===")
for i in range(0, 30):
    try:
        row = df_aud.iloc[i]
        vals = [str(v) for v in row if str(v) != 'nan']
        if vals: print(f"Fila {i}: {' | '.join(vals)}")
    except: pass

print("\n=== OTROS MEDIOS ===")
for i in range(0, 30):
    try:
        row = df_otros.iloc[i]
        vals = [str(v) for v in row if str(v) != 'nan']
        if vals: print(f"Fila {i}: {' | '.join(vals)}")
    except: pass
EOF
```

### Estructura del spreadsheet (columnas PERFORMANCE)
**Fila 7 = S1, Fila 8 = S2. Sumar para acumulado.**

| # Col | Meta | LinkedIn | Google Search | Totales |
|---|---|---|---|---|
| Inversión | col 3 | col 13 | col 26 | col 32 |
| Alcance | col 4 | col 14 | — | col 33 |
| Impresiones | col 5 | col 15 | col 27 | col 34 |
| Clics | col 6 | col 16 | col 28 | col 35 |
| Video Views | col 7 | col 17 | — | — |
| Registros | — | col 18 | — | — |
| CPM | col 8 | col 19 | — | col 36 |
| CPC | col 9 | col 20 | col 29 | col 37 |
| CPV | col 10 | col 21 | — | — |
| Sesiones | col 11 | col 24 | col 31 | — |
| Duración | col 12 | col 25 | col 32 | — |

---

## PASO 2 — Sync GA4 manual

Para sincronizar un período específico necesitas un **Firebase ID Token**. Obtenerlo desde el browser (en la consola de la app ya autenticada):

```javascript
// Abrir https://btg.artool.vip, loguearte, y en la consola del browser:
firebase.auth().currentUser.getIdToken().then(t => console.log(t))
```

Luego ejecutar:
```bash
TOKEN="pega-aqui-el-token"
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://us-central1-btg---etf.cloudfunctions.net/syncGA4Manual?start=2026-03-23&end=YYYY-MM-DD"
```

Verificar que devuelva `"status": "ok"` y anotar `total_users`, `total_sessions`, `total_avg_duration`.

> El dashboard **carga automáticamente el período más reciente** en Firestore, por lo que no hay que actualizar ningún ID en el código.

---

## PASO 3 — Actualizar index.html

### 3.1 Período en textos
Buscar y reemplazar la fecha anterior por la nueva en todos los textos:
- Título sección Paid Social
- Título sección Otros Medios
- Título sección Audiencias
- Lectura ejecutiva
- KPI metas labels (`kpi-week-label`)

### 3.2 RESUMEN — KPI cards
| Campo | ID/selector | Valor |
|---|---|---|
| Impresiones | `data-counter` en card impresiones | total paid social imp |
| Impresiones % | `data-pct` | (imp / 5.000.000) * 100 |
| Alcance | `data-counter` en card alcance | total paid social alc |
| Alcance % | `data-pct` | (alc / 1.800.000) * 100 |
| Sesiones | `data-counter` en card sesiones | total sesiones |
| Sesiones % | `data-pct` | (ses / 11.000) * 100 |

### 3.3 RESUMEN — Budget card
| Campo | Valor |
|---|---|
| `card-big` | % ejecutado (inv_total / 3.800.000 * 100) |
| `card-sub` | "$X.XXX.XXX de $3.800.000" |
| Bar width | mismo % |

### 3.4 PAID SOCIAL — Platform cards
| Campo | Meta | LinkedIn | Google Search |
|---|---|---|---|
| invest-badge | inv S1+S2 | inv S1+S2 | inv S1+S2 |
| Alcance | alc S1+S2 | alc S1+S2 | — |
| Impresiones | imp S1+S2 | imp S1+S2 | imp S1+S2 |
| Clics | cli S1+S2 | cli S1+S2 | cli S1+S2 |
| Video Views | views S1+S2 | views S1+S2 | — |
| Registros (LinkedIn) | — | sum registros | — |
| Duración (Google) | — | — | MM:SS |

### 3.5 OTROS MEDIOS — Platform cards
| Campo | DF | Emol | Bio Bio |
|---|---|---|---|
| invest-badge | $XXX | $XXX | $XXX |
| Alcance | XXX | XXX | XXX |
| Impresiones | XXX | XXX | XXX |
| Clics | XXX | XXX | XXX |
| Sesiones | XXX | XXX | XXX |
| CPM | inv/imp*1000 | inv/imp*1000 | inv/imp*1000 |

### 3.6 AUDIENCIAS — Cards (6 audiencias)
Por cada audiencia: alcance · impresiones · CPM · frecuencia (imp/alc) · sesiones

### 3.7 LECTURA EJECUTIVA
```javascript
// Buscar en index.html renderGA4():
const imp   = XXXXXXX;   // total impresiones paid social
const alc   = XXXXXXX;   // total alcance paid social
const clics = XXXX;      // total clics paid social
const views = XXXXXX;    // total video views paid social
```

### 3.8 CHARTS
- Donut: `data: [meta_inv, linkedin_inv, search_inv]`
- Bar alcance: `data: [meta_alc, linkedin_alc, 0]`
- Bar impresiones: `data: [meta_imp, linkedin_imp, search_imp]`

---

## PASO 4 — Verificación

- [ ] Período correcto en todos los títulos de sección
- [ ] Budget % coincide con (inversión / 3.800.000)
- [ ] Impresiones KPI = suma Meta + LinkedIn + Google
- [ ] Alcance KPI = suma Meta + LinkedIn (Google Search no tiene alcance)
- [ ] LinkedIn registros = suma S1+S2
- [ ] Charts con datos actualizados

---

## PASO 5 — Deploy

Solo hacer push a `main` — GitHub Actions despliega automáticamente:

```bash
git add public/index.html
git commit -m "Actualización período [PERÍODO] — datos [FECHA_SPREADSHEET]"
git push origin main
```

El workflow `firebase-hosting-merge.yml` corre automáticamente y despliega en ~30 segundos.
Verificar en: https://github.com/artool-spa/btg_etf/actions

### Si se actualizó la Cloud Function:
```bash
cd firebase/functions
npm install
npx firebase deploy --only functions --project btg---etf
```

---

## Notas de mantenimiento

- **Sync semanal automático**: corre los lunes 09:00 Santiago. No requiere acción manual.
- **Al cerrar campaña**: actualizar `CAMPAIGN_START_DATE` en `firebase/functions/index.js`.
- **Si hay nueva audiencia**: agregar card en `grid-6`, actualizar lectura ejecutiva.
- **Si hay nuevo medio**: agregar card en grid de Otros Medios, sumar al total row.
- **Google Search en GA4**: puede no aparecer en resultados del landing si la URL de destino de la campaña no coincide exactamente.
