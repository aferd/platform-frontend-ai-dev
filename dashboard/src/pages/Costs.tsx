import { useEffect, useState, useCallback, useRef } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import type { CycleEntry, DailyAggregate } from '../types';
import { fetchCosts } from '../api';
import { formatDuration, formatTokens, JIRA_BASE } from '../utils';
import { useWS } from '../hooks/useWebSocket';

const DAYS_OPTIONS = [7, 14, 30, 90];

type CycleMetric = 'cost' | 'output_tokens' | 'duration' | 'turns';

const METRIC_CONFIG: Record<CycleMetric, { label: string; color: string; format: (v: number) => string }> = {
  cost: { label: 'Cost', color: '#3fb950', format: v => '$' + v.toFixed(2) },
  output_tokens: { label: 'Output Tokens', color: '#58a6ff', format: v => formatTokens(v) },
  duration: { label: 'Duration', color: '#d29922', format: v => formatDuration(v) },
  turns: { label: 'Turns', color: '#bc8cff', format: v => String(v) },
};

interface CostsData {
  cycles: CycleEntry[];
  daily: DailyAggregate[];
}

const WORK_TYPE_COLORS: Record<string, string> = {
  new_ticket: '#3fb950',
  pr_review: '#58a6ff',
  ci_fix: '#f85149',
  investigation: '#d29922',
  memory_housekeeping: '#bc8cff',
  idle: '#484f58',
  error: '#f85149',
};

const WORK_TYPE_LABELS: Record<string, string> = {
  new_ticket: 'New Ticket',
  pr_review: 'PR Review',
  ci_fix: 'CI Fix',
  investigation: 'Investigation',
  memory_housekeeping: 'Housekeeping',
  idle: 'Idle',
  error: 'Error',
};

function CycleChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const status = d.is_error ? 'error' : d.no_work ? 'idle' : 'work';
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{d.time}</div>
      {d.jira_key && <div style={{ fontWeight: 600 }}>{d.jira_key}{d.repo ? ` · ${d.repo}` : ''}</div>}
      {d.work_type && <div style={{ color: 'var(--accent)' }}>{WORK_TYPE_LABELS[d.work_type] || d.work_type}</div>}
      <div>${Number(d.cost).toFixed(2)} &middot; {d.turns} turns &middot; {formatDuration(d.duration)}</div>
      <div>{formatTokens(d.output_tokens)} output &middot; {formatTokens(d.cache_read)} cache</div>
      {d.summary && <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>{d.summary}</div>}
      <div style={{ color: d.is_error ? 'var(--red)' : d.no_work ? 'var(--text-dim)' : 'var(--green)' }}>{status}</div>
    </div>
  );
}

function DailyChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {p.dataKey === 'cost' ? '$' + Number(p.value).toFixed(2) : formatTokens(p.value)}
        </div>
      ))}
    </div>
  );
}

function CycleDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const wt = payload?.work_type || (payload?.no_work ? 'idle' : payload?.is_error ? 'error' : '');
  const color = WORK_TYPE_COLORS[wt] || '#8b949e';
  return <circle cx={cx} cy={cy} r={3} fill={color} stroke={color} strokeWidth={1} opacity={0.9} />;
}

function CycleActiveDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const wt = payload?.work_type || (payload?.no_work ? 'idle' : payload?.is_error ? 'error' : '');
  const color = WORK_TYPE_COLORS[wt] || '#8b949e';
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={color} opacity={0.2} />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1} />
    </g>
  );
}

function CycleRow({ c }: { c: CycleEntry }) {
  const costColor = c.cost_usd > 2 ? 'var(--red)' : c.cost_usd > 1 ? 'var(--yellow)' : 'var(--green)';
  const statusLabel = c.is_error ? 'error' : c.no_work ? 'idle' : (WORK_TYPE_LABELS[c.work_type || ''] || c.work_type || 'work');
  const statusColor = c.is_error ? 'var(--red)' : c.no_work ? 'var(--text-dim)' : 'var(--green)';
  const ts = new Date(c.timestamp);

  return (
    <div className="cycle-row" title={c.summary || ''}>
      <div className="cycle-time" title={c.timestamp}>
        {ts.toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
        {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="cycle-work">
        {c.jira_key ? (
          <a href={`${JIRA_BASE}${c.jira_key}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
            {c.jira_key}
          </a>
        ) : (
          <span style={{ color: 'var(--text-dim)' }}>—</span>
        )}
        {c.repo && <span className="cycle-repo">{c.repo}</span>}
      </div>
      <div className="cycle-cost" style={{ color: costColor }}>${c.cost_usd.toFixed(2)}</div>
      <div className="cycle-turns">{c.num_turns} turns</div>
      <div className="cycle-duration">{formatDuration(c.duration_ms)}</div>
      <div className="cycle-tokens">
        <span title="Output tokens">{formatTokens(c.output_tokens)} out</span>
        <span className="cycle-tokens-dim" title="Cache read">{formatTokens(c.cache_read_tokens)} cache</span>
      </div>
      <div className="cycle-status" style={{ color: statusColor }}>{statusLabel}</div>
    </div>
  );
}

export default function Costs() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<CostsData | null>(null);
  const [metric, setMetric] = useState<CycleMetric>('cost');

  const { onEvent } = useWS();

  const load = useCallback(async () => {
    const res = await fetchCosts(days, 500);
    setData({
      cycles: res.items || [],
      daily: res.daily || [],
    });
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Live updates: reload when a new cycle is recorded
  useEffect(() => {
    return onEvent((event) => {
      if (event.type === 'cycle_recorded') {
        load();
      }
    });
  }, [onEvent, load]);

  if (!data) return <div className="empty-state">Loading...</div>;

  const { cycles, daily } = data;

  const totalCost = cycles.reduce((s, c) => s + c.cost_usd, 0);
  const idleCycles = cycles.filter(c => c.no_work).length;
  const errorCycles = cycles.filter(c => c.is_error).length;
  const workCycles = cycles.length - idleCycles;
  const totalDuration = cycles.reduce((s, c) => s + c.duration_ms, 0);
  const totalOutput = cycles.reduce((s, c) => s + c.output_tokens, 0);
  const totalCacheRead = cycles.reduce((s, c) => s + c.cache_read_tokens, 0);

  // Per-cycle chart data (reversed so oldest is left)
  const cycleChartData = [...cycles].reverse().map((c, i) => {
    const ts = new Date(c.timestamp);
    return {
      idx: i,
      time: ts.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cost: c.cost_usd,
      output_tokens: c.output_tokens,
      cache_read: c.cache_read_tokens,
      duration: c.duration_ms,
      turns: c.num_turns,
      is_error: c.is_error,
      no_work: c.no_work,
      jira_key: c.jira_key,
      repo: c.repo,
      work_type: c.work_type,
      summary: c.summary,
    };
  });

  const mc = METRIC_CONFIG[metric];

  // Daily chart data
  const sorted = [...daily].sort((a, b) => a.day.localeCompare(b.day));
  const dailyCostData = sorted.map(d => ({ day: d.day.slice(5), cost: Number(d.total_cost.toFixed(2)) }));
  const dailyTokenData = sorted.map(d => ({ day: d.day.slice(5), output: d.output_tokens, cache_read: d.cache_read }));

  return (
    <div className="costs-page">
      <div className="controls">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {DAYS_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
        </select>
      </div>

      {/* Per-Cycle Chart */}
      <div className="chart-card">
        <div className="cycle-header-row">
          <h3>Cycles</h3>
          <div className="cycle-summary-inline">
            <span>{cycles.length} total</span>
            <span className="dot-sep" />
            <span style={{ color: 'var(--green)' }}>{workCycles} work</span>
            <span className="dot-sep" />
            <span style={{ color: 'var(--text-dim)' }}>{idleCycles} idle</span>
            {errorCycles > 0 && <><span className="dot-sep" /><span style={{ color: 'var(--red)' }}>{errorCycles} error</span></>}
            <span className="dot-sep" />
            <span style={{ color: 'var(--green)' }}>${totalCost.toFixed(2)} total</span>
            <span className="dot-sep" />
            <span>${workCycles > 0 ? (totalCost / workCycles).toFixed(2) : '0.00'} avg/work</span>
          </div>
        </div>

        <div className="metric-tabs">
          {(Object.keys(METRIC_CONFIG) as CycleMetric[]).map(m => (
            <button key={m} className={`metric-tab ${m === metric ? 'active' : ''}`} style={m === metric ? { borderColor: METRIC_CONFIG[m].color, color: METRIC_CONFIG[m].color } : {}} onClick={() => setMetric(m)}>
              {METRIC_CONFIG[m].label}
            </button>
          ))}
        </div>

        {cycleChartData.length > 1 && (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={cycleChartData}>
                <defs>
                  <linearGradient id="cycleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={mc.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={mc.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.5)" />
                <XAxis dataKey="time" stroke="var(--text-dim)" fontSize={10} interval="preserveStartEnd" tick={false} />
                <YAxis stroke="var(--text-dim)" fontSize={10} tickFormatter={mc.format} width={60} />
                <Tooltip content={<CycleChartTooltip />} />
                <Area type="monotone" dataKey={metric} stroke={mc.color} fill="url(#cycleGrad)" strokeWidth={2} dot={<CycleDot />} activeDot={<CycleActiveDot />} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="cycle-chart-legend">
              {Object.entries(WORK_TYPE_LABELS).map(([key, label]) => (
                <span key={key} className="cycle-legend-item">
                  <span className="cycle-legend-dot" style={{ background: WORK_TYPE_COLORS[key] }} />
                  {label}
                </span>
              ))}
            </div>
          </>
        )}

        <div className="cycle-list">
          <div className="cycle-row cycle-row-header">
            <div>Time</div>
            <div>Work</div>
            <div>Cost</div>
            <div>Turns</div>
            <div>Duration</div>
            <div>Tokens</div>
            <div>Type</div>
          </div>
          {cycles.length === 0 && <div className="empty-state">No cycles recorded</div>}
          {cycles.map(c => <CycleRow key={c.id} c={c} />)}
        </div>
      </div>

      {/* Daily Summary */}
      {daily.length > 0 && (
        <>
          <div className="costs-daily-header">
            <h3>Daily Summary</h3>
            <div className="costs-daily-stats">
              <span>{formatDuration(totalDuration)} runtime</span>
              <span className="dot-sep" />
              <span>{formatTokens(totalOutput)} output</span>
              <span className="dot-sep" />
              <span>{formatTokens(totalCacheRead)} cache read</span>
            </div>
          </div>
          <div className="costs-charts">
            <div className="chart-card">
              <h3>Cost per Day</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dailyCostData}>
                  <defs>
                    <linearGradient id="dailyCostGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3fb950" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3fb950" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.5)" />
                  <XAxis dataKey="day" stroke="var(--text-dim)" fontSize={11} />
                  <YAxis stroke="var(--text-dim)" fontSize={11} tickFormatter={v => '$' + v} />
                  <Tooltip content={<DailyChartTooltip />} />
                  <Area type="monotone" dataKey="cost" name="Cost ($)" stroke="#3fb950" fill="url(#dailyCostGrad)" strokeWidth={2} dot={{ r: 3, fill: '#3fb950' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <h3>Tokens per Day</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dailyTokenData}>
                  <defs>
                    <linearGradient id="dailyOutGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3fb950" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3fb950" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dailyCacheGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#58a6ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.5)" />
                  <XAxis dataKey="day" stroke="var(--text-dim)" fontSize={11} />
                  <YAxis stroke="var(--text-dim)" fontSize={11} tickFormatter={v => formatTokens(v)} />
                  <Tooltip content={<DailyChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="output" name="Output" stroke="#3fb950" fill="url(#dailyOutGrad)" strokeWidth={2} dot={{ r: 3, fill: '#3fb950' }} />
                  <Area type="monotone" dataKey="cache_read" name="Cache Read" stroke="#58a6ff" fill="url(#dailyCacheGrad)" strokeWidth={2} dot={{ r: 3, fill: '#58a6ff' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
