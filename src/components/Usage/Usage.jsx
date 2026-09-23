import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './Usage.css';

function Meter({ label, value, suffix = '%', tone = 'ok' }) {
    const n = Number(value);
    const pct = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
    return (
        <div className={`usage-meter usage-meter--${tone}`}>
            <div className="usage-meter__head">
                <span>{label}</span>
                <strong>
                    {Number.isFinite(n) ? n : '—'}
                    {suffix}
                </strong>
            </div>
            <div className="usage-meter__bar">
                <div className="usage-meter__fill" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function toneFor(pct) {
    if (pct == null || !Number.isFinite(Number(pct))) return 'muted';
    if (pct >= 85) return 'danger';
    if (pct >= 70) return 'warn';
    return 'ok';
}

function formatAgo(sec) {
    const s = Number(sec) || 0;
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

function StatRow({ label, value, hint }) {
    return (
        <div className="usage-stat-row">
            <span className="usage-stat-row__label">{label}</span>
            <span className="usage-stat-row__value">{value}</span>
            {hint ? <span className="usage-stat-row__hint">{hint}</span> : null}
        </div>
    );
}

const Usage = () => {
    const { currentUser } = useAuth();
    const email = String(currentUser?.email || currentUser?.EmailId || '').trim();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!email) return;
        try {
            const res = await fetch(`/api/usage/summary?email=${encodeURIComponent(email)}`, {
                cache: 'no-store',
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(body.error || 'Failed to load usage');
                setData(null);
                return;
            }
            setError('');
            setData(body);
        } catch (err) {
            setError(err?.message || 'Failed to load usage');
        } finally {
            setLoading(false);
        }
    }, [email]);

    useEffect(() => {
        load();
        const t = setInterval(load, 5000);
        return () => clearInterval(t);
    }, [load]);

    const m = data?.metrics;
    const d = data?.diagnostics;
    const alerts = data?.alerts || [];
    const cpu = m?.cpu?.percent;
    const ramPct = m?.ram?.usedPercent;
    const netPct = m?.network?.utilizationPct;
    const poolPct = d?.sqlPool?.usedPercent;
    const poolTone =
        d?.sqlPool?.pending > 0 || (poolPct != null && poolPct >= 85)
            ? 'danger'
            : toneFor(poolPct);

    return (
        <div className="usage-page">
            <div className="usage-header">
                <div>
                    <h2>
                        <i className="bi bi-activity me-2" aria-hidden />
                        Server Usage
                    </h2>
                    <p className="usage-sub">
                        Live diagnostics for production slowdowns (CPU/RAM, SQL pool, ChatBox sockets,
                        API latency). Refreshes every 5s. Online users = heartbeat or API activity in
                        the last ~3 minutes on <strong>this</strong> API host only.
                    </p>
                </div>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={load}>
                    <i className="bi bi-arrow-clockwise me-1" aria-hidden />
                    Refresh
                </button>
            </div>

            {error ? (
                <div className="alert alert-warning" role="alert">
                    {error}
                </div>
            ) : null}

            {loading && !data ? (
                <div className="usage-loading">
                    <div className="spinner-border text-primary" role="status" />
                    <span>Loading metrics…</span>
                </div>
            ) : null}

            {m ? (
                <>
                    {alerts.length > 0 ? (
                        <div className="usage-alerts">
                            {alerts.map((a) => (
                                <div
                                    key={a.code}
                                    className={`usage-alert usage-alert--${a.severity || 'warn'}`}
                                >
                                    <strong>{a.code}</strong>
                                    <span>{a.message}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="usage-alert usage-alert--ok">
                            <strong>HEALTHY</strong>
                            <span>No critical slowdown signals on this sample.</span>
                        </div>
                    )}

                    <div className="usage-meta">
                        <span>
                            Host: <strong>{m.hostname || '—'}</strong>
                        </span>
                        <span>
                            Node: <strong>{m.nodeVersion || '—'}</strong>
                        </span>
                        <span>
                            Updated: <strong>{m.at ? new Date(m.at).toLocaleTimeString() : '—'}</strong>
                        </span>
                        <span>
                            Server uptime:{' '}
                            <strong>
                                {m.uptimeSec != null
                                    ? `${Math.floor(m.uptimeSec / 3600)}h ${Math.floor((m.uptimeSec % 3600) / 60)}m`
                                    : '—'}
                            </strong>
                        </span>
                        <span>
                            EMS-API uptime:{' '}
                            <strong>
                                {m.processUptimeSec != null
                                    ? `${Math.floor(m.processUptimeSec / 3600)}h ${Math.floor((m.processUptimeSec % 3600) / 60)}m`
                                    : '—'}
                            </strong>
                        </span>
                        <span>
                            EMS-API RSS: <strong>{m.processMemory?.rssMb ?? '—'} MB</strong>
                        </span>
                    </div>

                    <div className="usage-cards">
                        <div className="usage-card">
                            <h3>Web server CPU</h3>
                            <Meter label="CPU usage" value={cpu} tone={toneFor(cpu)} />
                            <p className="usage-card__hint">
                                {m.cpu?.cores || '—'} cores
                                {m.cpu?.model ? ` · ${m.cpu.model}` : ''}
                            </p>
                        </div>

                        <div className="usage-card">
                            <h3>Web server RAM</h3>
                            <Meter label="Memory used" value={ramPct} tone={toneFor(ramPct)} />
                            <p className="usage-card__hint">
                                {m.ram?.usedGb ?? '—'} / {m.ram?.totalGb ?? '—'} GB used
                                {' · '}
                                {m.ram?.freeGb ?? '—'} GB free
                            </p>
                        </div>

                        <div className="usage-card">
                            <h3>Network</h3>
                            <Meter
                                label="Approx. link utilization"
                                value={netPct}
                                tone={toneFor(netPct)}
                            />
                            <p className="usage-card__hint">
                                {m.network?.adapter ? `${m.network.adapter} · ` : ''}
                                ↓ {m.network?.rxMbps ?? '—'} Mbps · ↑ {m.network?.txMbps ?? '—'} Mbps
                                {m.network?.linkMbps != null ? ` · link ${m.network.linkMbps} Mbps` : ''}
                                {m.network?.error ? ` · ${m.network.error}` : ''}
                            </p>
                        </div>

                        <div className="usage-card usage-card--count">
                            <h3>Logged in now</h3>
                            <div className="usage-count">{data?.onlineCount ?? 0}</div>
                            <p className="usage-card__hint">Active in the last ~3 minutes</p>
                        </div>
                    </div>

                    <h3 className="usage-section-title">Critical slowdown signals</h3>
                    <div className="usage-cards usage-cards--diag">
                        <div className="usage-card">
                            <h3>SQL connection pool</h3>
                            <Meter
                                label="Pool in use"
                                value={poolPct}
                                tone={poolTone}
                            />
                            <StatRow
                                label="Used / max"
                                value={`${d?.sqlPool?.used ?? '—'} / ${d?.sqlPool?.max ?? '—'}`}
                            />
                            <StatRow
                                label="Waiting"
                                value={d?.sqlPool?.pending ?? '—'}
                                hint="Any waiting = whole EMS slows"
                            />
                            <StatRow
                                label="Healthy"
                                value={
                                    d?.sqlPool?.healthy == null
                                        ? '—'
                                        : d.sqlPool.healthy
                                          ? 'Yes'
                                          : 'No'
                                }
                            />
                            <p className="usage-card__hint">
                                DB: {d?.sqlPool?.server || '—'} / {d?.sqlPool?.database || '—'}
                            </p>
                        </div>

                        <div className="usage-card">
                            <h3>Database ping</h3>
                            <div className="usage-count usage-count--sm">
                                {d?.dbPing?.ms != null ? `${d.dbPing.ms} ms` : '—'}
                            </div>
                            <StatRow
                                label="Status"
                                value={d?.dbPing?.ok ? 'OK' : d?.dbPing?.error || 'Fail'}
                            />
                            <p className="usage-card__hint">
                                &gt;500ms usually means SQL/network pressure, not the browser.
                            </p>
                        </div>

                        <div className="usage-card">
                            <h3>Node event-loop lag</h3>
                            <div className="usage-count usage-count--sm">
                                {d?.eventLoopLagMs != null ? `${d.eventLoopLagMs} ms` : '—'}
                            </div>
                            <StatRow
                                label="EMS-API heap"
                                value={`${m.processMemory?.heapUsedMb ?? '—'} / ${m.processMemory?.rssMb ?? '—'} MB`}
                                hint="heap / RSS"
                            />
                            <p className="usage-card__hint">
                                Lag ≥100ms means the API thread is busy (CPU or blocking work).
                            </p>
                        </div>

                        <div className="usage-card">
                            <h3>ChatBox sockets</h3>
                            <div className="usage-count usage-count--sm">
                                {d?.sockets?.openConnections ?? 0}
                            </div>
                            <StatRow
                                label="Engine clients"
                                value={d?.sockets?.engineClients ?? '—'}
                            />
                            <StatRow
                                label="Transports"
                                value={(d?.sockets?.transports || []).join(', ') || '—'}
                            />
                            <p className="usage-card__hint">
                                Production uses polling — each connection holds an IIS→Node slot.
                            </p>
                        </div>

                        <div className="usage-card">
                            <h3>API traffic (last 60s)</h3>
                            <StatRow label="Requests" value={d?.requests?.requestsLastMin ?? '—'} />
                            <StatRow label="Req/sec" value={d?.requests?.requestsPerSec ?? '—'} />
                            <StatRow label="In flight" value={d?.requests?.inFlight ?? '—'} />
                            <StatRow label="Avg latency" value={`${d?.requests?.avgLatencyMs ?? '—'} ms`} />
                            <StatRow
                                label="Slow ≥2s"
                                value={d?.requests?.slowRequests2s ?? '—'}
                            />
                            <StatRow
                                label="HTTP 4xx / 5xx"
                                value={`${d?.requests?.http4xx ?? 0} / ${d?.requests?.http5xx ?? 0}`}
                            />
                        </div>

                        <div className="usage-card">
                            <h3>IIS / keep-alive</h3>
                            <StatRow
                                label="Node keepAlive"
                                value={`${Math.round((m.http?.keepAliveTimeoutMs || 0) / 1000)} s`}
                            />
                            <StatRow
                                label="ARR timeout (expected)"
                                value={`${m.http?.arrProxyTimeoutHintSec ?? 300} s`}
                            />
                            <StatRow
                                label="Headers timeout"
                                value={`${Math.round((m.http?.headersTimeoutMs || 0) / 1000)} s`}
                            />
                            <p className="usage-card__hint">{m.http?.note}</p>
                        </div>
                    </div>

                    <div className="usage-table-wrap">
                        <div className="usage-table-head">
                            <h3>Users currently logged in</h3>
                            <span>{data?.onlineCount ?? 0} online</span>
                        </div>
                        <div className="table-responsive">
                            <table className="table usage-table mb-0">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Department</th>
                                        <th>Roles</th>
                                        <th>Last seen</th>
                                        <th>IP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data?.onlineUsers || []).length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center text-muted py-4">
                                                No users currently online (or heartbeats not yet received).
                                            </td>
                                        </tr>
                                    ) : (
                                        (data.onlineUsers || []).map((u, i) => (
                                            <tr key={u.email}>
                                                <td>{i + 1}</td>
                                                <td>{u.name || '—'}</td>
                                                <td>{u.email}</td>
                                                <td>{u.department || '—'}</td>
                                                <td>{u.roles || '—'}</td>
                                                <td>{formatAgo(u.lastSeenAgoSec)}</td>
                                                <td>{u.ip || '—'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default Usage;
