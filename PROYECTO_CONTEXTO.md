# BTG ETF Genérico — Contexto del Proyecto

## Qué es esto
Dashboard de campaña digital para BTG Pactual Chile, producto **ETF Genérico**.

| | |
|---|---|
| **URL producción** | https://btg.artool.vip |
| **Repo GitHub** | https://github.com/artool-spa/btg_etf |
| **Proyecto Firebase** | `btg---etf` (consola: console.firebase.google.com/project/btg---etf) |
| **DNS** | Route 53, zona `artool.vip` → CNAME a `btg---etf.web.app` |

---

## Campaña

- **Inicio**: 24 de marzo 2026
- **Duración**: 30 días
- **Presupuesto mensual**: $3.800.000 CLP
- **Landing**: https://www.btgpactual.cl/que-hacemos/asset-management/etf
- **Gestión**: Artool (Paid Social) + Havas (Otros Medios)

### Metas mensuales
| Métrica | Meta |
|---|---|
| Impresiones | 5.000.000 |
| Alcance | 1.800.000 |
| Sesiones landing | 11.000 |

---

## Canales activos

### PAID SOCIAL — Artool
| Plataforma | Descripción |
|---|---|
| Meta | Awareness masivo, CPM bajo |
| LinkedIn | Audiencia profesional financiera, registros directos |
| Google Search | Captura intención de búsqueda ETF |

### OTROS MEDIOS — Havas
| Medio | Descripción |
|---|---|
| DF Digital | Diario Financiero, audiencia financiera |
| Emol Digital | Mayor duración de sesión |
| Bio Bio | Mayor volumen de clics |

---

## Audiencias
| Audiencia | Plataforma |
|---|---|
| Banca Privada | LinkedIn |
| Altos Cargos | LinkedIn |
| Asset Management | LinkedIn |
| Inversionistas Retail | Meta |
| Interés ETF | Meta |
| Alto Patrimonio | Meta |

---

## Arquitectura técnica

### Stack
| Capa | Tecnología |
|---|---|
| Frontend | HTML + vanilla JS, sin build process |
| Auth | Firebase Auth (Google OAuth + email/password) |
| Base de datos | Firestore (`campaigns/etf-generico/`) |
| Backend | Cloud Functions Node.js 20 |
| GA4 | `@google-analytics/data` vía Secret `GA4_PROPERTY_ID` |
| Hosting | Firebase Hosting → dominio `btg.artool.vip` |
| CI/CD | GitHub Actions (`firebase-hosting-merge.yml`) |
| DNS | AWS Route 53, cuenta `718537225858` |

### Cloud Functions (`firebase/functions/index.js`)
| Función | Tipo | Descripción |
|---|---|---|
| `syncGA4Weekly` | Scheduled (lunes 09:00 Santiago) | Sync automático semana anterior |
| `syncGA4Manual` | HTTP — requiere Bearer token | Sync manual por período |

> **Seguridad**: `syncGA4Manual` requiere un Firebase ID Token en el header `Authorization: Bearer <token>`. Ver PROCESO_ACTUALIZACION.md.

### GA4
- **Property ID**: Firebase Secret `GA4_PROPERTY_ID` (no hardcodeada)
- **Filtro landing**: `/que-hacemos/asset-management/etf`
- **Filtro campaña**: `sessionCampaignName` CONTAINS `btg_etf` OR exacto `[BTG] (BTG Corp) - Search Tráfico Fondo ETF Genérico`
- **Período activo**: el dashboard carga **automáticamente la semana más reciente** (sin ID hardcodeado)

### UTMs requeridas
| Plataforma | utm_campaign debe contener |
|---|---|
| Meta | `btg_etf` |
| LinkedIn | `btg_etf` |
| Google Ads | nombre exacto de campaña (automático) |

---

## Estructura Firestore
```
campaigns/
  etf-generico/               ← doc con acumulados (users_acum, sessions_acum, etc.)
    weeks/
      {start_date}_{end_date}/  ← un doc por período sincronizado
        period, start_date, end_date
        total_users, total_sessions, total_avg_duration
        campaigns: [{ name, users, sessions, avg_duration, sources: [...] }]
        sources_other: [...]
        button_users, button_events, button_duration
```

---

## Datos estáticos vs dinámicos

### Dinámico (automático — GA4 → Firestore → Dashboard)
- Usuarios y sesiones en landing
- Duración media de sesión
- Desglose por fuente/medio y por campaña

### Estático (requiere actualización manual en `public/index.html`)
- KPIs de Paid Social (Meta, LinkedIn, Google Search)
- Datos de Otros Medios (DF, Emol, Bio Bio)
- Audiencias (alcance, impresiones, CPM, frecuencia, sesiones)
- Presupuesto ejecutado y proyección
- Lectura ejecutiva y funnel

---

## Accesos necesarios
| Sistema | Qué necesitas |
|---|---|
| GitHub | Acceso al repo `artool-spa/btg_etf` |
| Firebase Console | Proyecto `btg---etf` |
| AWS Route 53 | Cuenta `718537225858` (para DNS) |
| Google Analytics | Property ID (en Firebase Secret, no se necesita para uso normal) |

---

## Notas
- Google Search a veces no aparece en GA4 del landing — verificar URL de destino en Google Ads.
- El sync automático (lunes 09:00) es independiente del dashboard.
- Los acumulados Firestore suman desde `2026-03-23` (`CAMPAIGN_START_DATE` en `index.js`).
