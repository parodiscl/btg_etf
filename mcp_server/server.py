#!/usr/bin/env python3
"""
BTG ETF — MCP Server
Lee datos de Firestore y actualiza el spreadsheet semanal.
"""

import os, json, asyncio
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

# ── Init Firebase ──
_cred_path = os.environ.get('FIREBASE_CREDENTIALS', '')
if not firebase_admin._apps:
    cred = credentials.Certificate(_cred_path) if _cred_path else credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)

db     = firestore.client()
server = Server('btg-ga4-mcp')

CAMPAIGN = 'etf-generico'

# ─────────────────────────────────────────────
# TOOLS
# ─────────────────────────────────────────────

@server.list_tools()
async def list_tools():
    return [
        types.Tool(
            name='get_latest_week',
            description='Retorna los datos GA4 de la última semana sincronizada desde Firestore.',
            inputSchema={'type': 'object', 'properties': {}, 'required': []},
        ),
        types.Tool(
            name='get_all_weeks',
            description='Retorna todas las semanas acumuladas del mes para la campaña ETF Genérico.',
            inputSchema={'type': 'object', 'properties': {}, 'required': []},
        ),
        types.Tool(
            name='get_campaign_summary',
            description='Retorna el resumen acumulado del mes (impresiones, alcance, sesiones totales).',
            inputSchema={'type': 'object', 'properties': {}, 'required': []},
        ),
        types.Tool(
            name='get_week_by_date',
            description='Retorna datos de una semana específica dado un rango de fechas.',
            inputSchema={
                'type': 'object',
                'properties': {
                    'start_date': {'type': 'string', 'description': 'YYYY-MM-DD'},
                    'end_date':   {'type': 'string', 'description': 'YYYY-MM-DD'},
                },
                'required': ['start_date', 'end_date'],
            },
        ),
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    try:
        if name == 'get_latest_week':
            result = await _get_latest_week()

        elif name == 'get_all_weeks':
            result = await _get_all_weeks()

        elif name == 'get_campaign_summary':
            result = await _get_campaign_summary()

        elif name == 'get_week_by_date':
            week_id = f"{arguments['start_date']}_{arguments['end_date']}"
            doc = db.collection('campaigns').document(CAMPAIGN) \
                    .collection('weeks').document(week_id).get()
            result = doc.to_dict() if doc.exists else {'error': 'Semana no encontrada'}

        else:
            result = {'error': f'Tool desconocido: {name}'}

        return [types.TextContent(type='text', text=json.dumps(result, ensure_ascii=False, default=str))]

    except Exception as e:
        return [types.TextContent(type='text', text=json.dumps({'error': str(e)}))]

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

async def _get_latest_week():
    snap = db.collection('campaigns').document(CAMPAIGN) \
              .collection('weeks') \
              .order_by('start_date', direction=firestore.Query.DESCENDING) \
              .limit(1).get()
    if not snap:
        return {'error': 'No hay semanas sincronizadas aún'}
    return snap[0].to_dict()

async def _get_all_weeks():
    snap = db.collection('campaigns').document(CAMPAIGN) \
              .collection('weeks') \
              .order_by('start_date').get()
    return [doc.to_dict() for doc in snap]

async def _get_campaign_summary():
    doc = db.collection('campaigns').document(CAMPAIGN).get()
    return doc.to_dict() if doc.exists else {'error': 'Campaña no encontrada'}

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )

if __name__ == '__main__':
    asyncio.run(main())
