import { host, ROUTES_AREA, SIDEBAR_NAV_AREA, useValue } from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const initial = { overview: null, ledger: [], harness: [], pnl: null, loading: true, error: '' }

function Panel({ title, children }) {
  return jsxs('section', { className: 'rounded-lg border border-(--ui-border) bg-(--ui-surface) p-4', children: [
    jsx('h2', { className: 'mb-3 text-sm font-semibold', children: title }), children,
  ] })
}

function SynterLoopPage({ api }) {
  const gateway = useValue(host.state.gateway)
  const [state, setState] = useState(initial)
  const load = async () => {
    setState((old) => ({ ...old, loading: true, error: '' }))
    try {
      const [overview, ledger, harness, pnl] = await Promise.all([
        api('/overview'), api('/ledger?limit=50'), api('/reports/harness'), api('/reports/pnl'),
      ])
      setState({ overview, ledger: ledger.items || [], harness: harness.variants || [], pnl, loading: false, error: '' })
    } catch (error) {
      setState((old) => ({ ...old, loading: false, error: error?.message || 'Plugin backend unavailable' }))
    }
  }
  useEffect(() => { void load() }, [])
  const overview = state.overview || {}
  const button = jsx('button', { type: 'button', className: 'rounded border border-(--ui-border) px-3 py-1.5 text-xs hover:border-(--ui-accent)', onClick: () => void load(), children: state.loading ? 'Refreshing…' : 'Refresh' })
  const metric = (label, value) => jsxs('div', { className: 'rounded border border-(--ui-border) p-3', children: [jsx('div', { className: 'text-[10px] uppercase tracking-wider text-(--ui-text-tertiary)', children: label }), jsx('div', { className: 'mt-1 text-xl font-semibold', children: value ?? '—' })] })
  return jsxs('main', { className: 'flex h-full flex-col gap-4 overflow-auto p-5 text-sm', children: [
    jsxs('header', { className: 'flex items-start justify-between gap-3', children: [jsxs('div', { children: [jsx('div', { className: 'text-[10px] uppercase tracking-[.16em] text-(--ui-accent)', children: 'READ-ONLY · PROFILE-LOCAL' }), jsx('h1', { className: 'mt-1 text-2xl font-semibold', children: 'Synter Loop' }), jsx('p', { className: 'mt-1 text-xs text-(--ui-text-tertiary)', children: `Gateway: ${gateway || 'disconnected'} · descriptive telemetry only` })] }), button] }),
    state.error ? jsx('div', { role: 'alert', className: 'rounded border border-amber-600/50 bg-amber-950/20 p-3 text-xs text-amber-200', children: `Backend unavailable: ${state.error}` }) : null,
    jsxs('div', { className: 'grid grid-cols-2 gap-2 md:grid-cols-4', children: [metric('Events', overview.event_count), metric('Runs', overview.run_count), metric('Ledger items', overview.ledger_count), metric('Latest event', overview.latest_event_at ? new Date(overview.latest_event_at).toLocaleString() : '—')] }),
    jsx(Panel, { title: 'Harness variants · descriptive only', children: state.harness.length ? state.harness.map((row) => jsxs('div', { className: 'mb-2 rounded border border-(--ui-border) p-3 text-xs', children: [jsx('div', { className: 'font-mono', children: `${row.prompt_hash} · ${row.model} · ${row.plugin_version}` }), jsx('div', { className: 'mt-1 text-(--ui-text-tertiary)', children: `${row.sessions} sessions · ${row.turns} turns · $${row.token_cost_usd} token cost` })] }, `${row.prompt_hash}:${row.model}:${row.plugin_version}`)) : jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: state.loading ? 'Loading local events…' : 'No captured events yet. Capture is opt-in.' }) }),
    jsx(Panel, { title: 'Agent P&L · no causal claim', children: state.pnl ? jsx('p', { className: 'text-xs text-(--ui-text-tertiary)', children: `${state.pnl.source_events} source events · ${state.pnl.note}` }) : jsx('p', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No report data available.' }) }),
    jsx(Panel, { title: 'Recent ledger entries · no action controls', children: state.ledger.length ? state.ledger.slice().reverse().map((item) => jsxs('div', { className: 'flex justify-between gap-2 border-b border-(--ui-border) py-2 text-xs last:border-0', children: [jsxs('span', { children: [item.kind || 'record', ' · ', item.status || 'recorded'] }), jsx('span', { className: 'font-mono text-(--ui-text-tertiary)', children: item.created_at || item.item_id })] }, item.item_id)) : jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No ledger records yet.' }) }),
    jsx('p', { className: 'text-[10px] text-(--ui-text-tertiary)', children: 'This pane cannot authorize spend, modify campaigns, or publish tracking changes.' }),
  ] })
}

export default {
  id: 'synter-loop',
  name: 'Synter Loop',
  defaultEnabled: false,
  register(ctx) {
    const api = (path) => ctx.rest(path)
    ctx.registerMany([
      { id: 'pane', area: 'panes', title: 'Synter Loop', data: { placement: 'right', width: '380px' }, render: () => jsx(SynterLoopPage, { api }) },
      { id: 'page', area: ROUTES_AREA, data: { path: '/synter-loop' }, render: () => jsx(SynterLoopPage, { api }) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: '/synter-loop', label: 'Synter Loop', codicon: 'graph' } },
    ])
  },
}
