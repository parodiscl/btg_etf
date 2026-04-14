# Proceso de Actualización de Datos — BTG ETF Dashboard

**URL del dashboard:** https://etf.artool.vip  
**Proyecto Firebase:** `btg---etf`

---

## Antes de empezar — Preguntas obligatorias

1. **¿Cuál es el período que estamos reportando?** (ej: "23 Mar – 12 Abr")
2. **¿Cuál es la ruta local del spreadsheet actualizado?**
   ⚠️ **Debe ser una ruta local** (ej: `/Users/ap/Downloads/btg_etf_planilla.xlsx`), no una URL de Google Sheets.
   Si solo tienes la URL, descárgalo primero: `Archivo > Descargar > Microsoft Excel (.xlsx)`
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
**Fila 7 = S1, Fila 8 = S2, Fila 9 = S3. Sumar para acumulado.**

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

---

## PASO 2 — Sync GA4

El sync GA4 se hace con curl usando la `SYNC_SECRET`. No necesita login ni token del browser.

```bash
curl -s -X POST \
  "https://syncga4manual-wcp2ajv2ya-uc.a.run.app?start=YYYY-MM-DD&end=YYYY-MM-DD&secret=artool-sync-2026" \
  | python3 -m json.tool
```

**Períodos de esta campaña:**
- Período completo: `start=2026-03-23&end=2026-04-12`
- Solo S3: `start=2026-04-06&end=2026-04-12`

**Importante:** El sync crea un documento en Firestore por período. Si llamas con el período completo, borra primero los docs de semanas individuales para evitar doble conteo:

```bash
cd /Users/ap/Documents/btg_etf/firebase/functions
node fix_firestore.js   # elimina docs viejos y escribe el período completo
```

Verificar que devuelva `"status": "ok"` y anotar `total_users`, `total_sessions`, `total_avg_duration`.

---

## PASO 3 — Actualizar index.html

### 3.1 Períodos en textos
Buscar y reemplazar la fecha anterior por la nueva en todos los textos (títulos de sección, `kpi-week-label`, lectura ejecutiva).

### 3.2 RESUMEN — KPI cards
| Campo | Selector | Fórmula |
|---|---|---|
| Impresiones valor | `data-counter` | suma imp paid social + havas |
| Impresiones % | `data-pct` + `data-width` | (imp / 5.000.000) × 100 |
| Alcance valor | `data-counter` | suma alc paid social |
| Alcance % | `data-pct` + `data-width` | (alc / 1.800.000) × 100 |
| Sesiones valor | `data-counter` | total GA4 sessions |
| Sesiones % | `data-pct` + `data-width` | (ses / 11.000) × 100 |
| Proyección sesiones | texto ritmo | (ses/días) × 30 / 11.000 × 100 |

⚠️ **Siempre actualizar tanto el valor como el porcentaje juntos.**

### 3.3 RESUMEN — Budget card
| Campo | Valor |
|---|---|
| Porcentaje | inv_paid_social / 3.800.000 × 100 |
| Subtexto | "$X.XXX.XXX de $3.800.000" |
| Bar width | mismo % |

### 3.4 PAID SOCIAL — Platform cards
Actualizar para Meta, LinkedIn y Google Search: inversión, alcance, impresiones, clics, video views, CPM, CPC, CPV, registros (LinkedIn), duración (Google).

### 3.5 CHARTS
- **Donut divisor**: actualizar `ctx.parsed / TOTAL_INV` donde `TOTAL_INV = meta_inv + linkedin_inv + search_inv`
- **Donut labels**: `['Meta ($XXX)', 'LinkedIn ($XXX)', 'Search ($XXX)']`
- **Donut data**: `[meta_inv, linkedin_inv, search_inv]`
- **Bar alcance**: `[meta_alc, linkedin_alc, 0]`
- **Bar impresiones**: `[meta_imp, linkedin_imp, search_imp]`

### 3.6 LECTURA EJECUTIVA (valores hardcoded en renderGA4)
```javascript
const imp   = XXXXXXX;   // total impresiones
const alc   = XXXXXXX;   // total alcance
const clics = XXXX;      // total clics
const views = XXXXXX;    // total video views
```

### 3.7 OTROS MEDIOS
Por cada medio: inversión, impresiones, clics, sesiones, CPM, duración.
⚠️ Los valores deben ser acumulados del período completo (S1+S2+S3), no solo de la última semana.

### 3.8 AUDIENCIAS
Por cada audiencia (6): alcance, impresiones, CPM, frecuencia (imp/alc), sesiones.

### 3.9 FUNNEL y PDF filename
- Funnel: impresiones, alcance, clics, video views
- PDF filename: `BTG_ETF_Generico_[período].pdf`

---

## PASO 4 — Checklist de verificación

- [ ] Período correcto en todos los títulos
- [ ] `data-pct` + `data-width` actualizados junto con `data-counter` (los 3 siempre juntos)
- [ ] Donut chart: divisor = suma de las 3 inversiones
- [ ] Budget % = inv_paid_social / 3.800.000
- [ ] Impresiones KPI = Meta + LinkedIn + Google + Havas
- [ ] Alcance KPI = Meta + LinkedIn
- [ ] GA4 sync devolvió `status: ok`
- [ ] Lectura ejecutiva coherente con los números

---

## PASO 5 — Deploy

```bash
git add public/index.html
git commit -m "Actualización período [PERÍODO]"
git push origin main
```

GitHub Actions despliega automáticamente en ~45 segundos.  
Verificar en: https://github.com/artool-spa/btg_etf/actions

⚠️ **Esperar a que el deploy termine antes de verificar en el browser.**  
Hacer hard refresh (`Cmd+Shift+R`) después del deploy.

---

## Referencia rápida — Comandos clave

```bash
# Sync GA4 período completo
curl -s -X POST "https://syncga4manual-wcp2ajv2ya-uc.a.run.app?start=2026-03-23&end=2026-04-12&secret=artool-sync-2026"

# Ver estado del deploy
gh run list --repo artool-spa/btg_etf --limit 3

# Deploy solo functions (si se cambió index.js)
cd /Users/ap/Documents/btg_etf/firebase
firebase deploy --only functions:syncGA4Manual --project btg---etf --force
```

---

## Notas de arquitectura

- **GA4 data en Firestore**: lectura pública, no requiere auth para mostrar en dashboard.
- **`loadGA4Data()`** corre al cargar la página, independiente del login.
- **Sync semanal automático**: corre los lunes 09:00 Santiago. Cubre solo la semana anterior (7 días). Para el período completo de campaña, usar sync manual.
- **`SOURCE_NAMES`**: definido a nivel de módulo en `index.html`. No moverlo dentro de funciones.
- **Firestore estructura**: `campaigns/etf-generico` (agregado) + `campaigns/etf-generico/weeks/{weekId}` (detalle).
- **Al cerrar campaña**: actualizar `CAMPAIGN_START_DATE` en `firebase/functions/index.js`.
