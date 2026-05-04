import { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export function Usage() {
  const [apiKey, setApiKey] = useState('');
  const [timeRange, setTimeRange] = useState(() => {
    return Number(localStorage.getItem('openai_usage_range')) || 7;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<{ 
    reqs: number; 
    toks: number; 
    models: Record<string, number>;
    keys: Record<string, number>;
    daily: Array<{
      date: string;
      tokens: number;
      requests: number;
      models: Record<string, number>;
    }>;
  } | null>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('openai_admin_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  useEffect(() => {
    localStorage.setItem('openai_admin_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('openai_usage_range', timeRange.toString());
  }, [timeRange]);

  const fetchUsage = async () => {
    const key = apiKey.trim();
    if (!key) {
      setError('Please enter an Admin API Key.');
      return;
    }

    setLoading(true);
    setError('');
    setStats(null);

    try {
      const end = Math.floor(Date.now() / 1000);
      const start = end - (timeRange * 24 * 60 * 60);

      const headers = { 'Authorization': 'Bearer ' + key };
      
      const [compRes, modRes, keyRes] = await Promise.all([
        fetch(`/api/openai/usage/completions?start_time=${start}&end_time=${end}&bucket_width=1d`, { headers }),
        fetch(`/api/openai/usage/completions?start_time=${start}&end_time=${end}&bucket_width=1d&group_by=model`, { headers }),
        fetch(`/api/openai/usage/completions?start_time=${start}&end_time=${end}&bucket_width=1d&group_by=api_key_id`, { headers })
      ]);

      if (!compRes.ok) {
        let errorMsg = `HTTP Error ${compRes.status}`;
        try {
          const d = await compRes.json();
          if (d.error?.message) errorMsg = d.error.message;
        } catch (_) {
          errorMsg = `Backend returned ${compRes.status}: Please make sure to restart your Go backend!`;
        }
        throw new Error(errorMsg);
      }

      const [compData, modData, keyData] = await Promise.all([
        compRes.json(),
        modRes.ok ? modRes.json().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        keyRes.ok ? keyRes.json().catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);

      let totalReqs = 0;
      let totalToks = 0;
      const modelsBreakdown: Record<string, number> = {};
      const keysBreakdown: Record<string, number> = {};
      const dailyMap = new Map<string, { date: string, tokens: number, requests: number, models: Record<string, number> }>();

      (compData.data || []).forEach((bucket: any) => {
        const date = bucket.start_time_iso.split('T')[0];
        const r = bucket.results?.reduce((sum: number, res: any) => sum + Number(res.num_model_requests || 0), 0) || 0;
        const t = bucket.results?.reduce((sum: number, res: any) => sum + Number(res.input_tokens || 0) + Number(res.output_tokens || 0), 0) || 0;
        
        totalReqs += r;
        totalToks += t;
        
        dailyMap.set(date, { date, tokens: t, requests: r, models: {} });
      });
      
      (modData.data || []).forEach((bucket: any) => {
        const date = bucket.start_time_iso.split('T')[0];
        if (!dailyMap.has(date)) {
           dailyMap.set(date, { date, tokens: 0, requests: 0, models: {} });
        }
        const dayEntry = dailyMap.get(date)!;

        bucket.results?.forEach((r: any) => {
          if (r.model) {
            const count = Number(r.num_model_requests || 0);
            modelsBreakdown[r.model] = (modelsBreakdown[r.model] || 0) + count;
            dayEntry.models[r.model] = (dayEntry.models[r.model] || 0) + count;
          }
        });
      });

      (keyData.data || []).forEach((bucket: any) => {
        bucket.results?.forEach((r: any) => {
          if (r.api_key_id) {
            keysBreakdown[r.api_key_id] = (keysBreakdown[r.api_key_id] || 0) + Number(r.input_tokens || 0) + Number(r.output_tokens || 0);
          }
        });
      });

      const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

      setStats({ 
        reqs: Number(totalReqs) || 0, 
        toks: Number(totalToks) || 0, 
        models: modelsBreakdown,
        keys: keysBreakdown,
        daily
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const maxModelReqs = stats ? Math.max(...Object.values(stats.models), 1) : 1;
  const maxKeyToks = stats ? Math.max(...Object.values(stats.keys), 1) : 1;

  return (
    <div className="content">
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
        <select 
          className="key-input" 
          style={{ width: '120px' }}
          value={timeRange} 
          onChange={e => setTimeRange(Number(e.target.value))}
        >
          {TIME_RANGES.map(t => (
            <option key={t.days} value={t.days}>{t.label}</option>
          ))}
        </select>
        <input
          type="password"
          className="key-input"
          style={{ flex: 1 }}
          placeholder="sk-admin-..."
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
        />
        <button className="btn" onClick={fetchUsage} disabled={loading}>
          {loading ? 'Loading...' : 'Load Usage'}
        </button>
      </div>
      
      {error && <div className="error-msg" style={{ marginBottom: '20px' }}>{error}</div>}

      {stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Stats Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '1px', 
            background: 'var(--border)', 
            borderRadius: '8px', 
            overflow: 'hidden',
            border: '1px solid var(--border)' 
          }}>
            <div style={{ background: 'var(--bg)', padding: '20px' }}>
              <div style={{ color: 'var(--dim)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '8px' }}>Total Tokens (Last {TIME_RANGES.find(t => t.days === timeRange)?.label})</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>{stats.toks.toLocaleString()}</div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '20px' }}>
              <div style={{ color: 'var(--dim)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '8px' }}>Total Requests (Last {TIME_RANGES.find(t => t.days === timeRange)?.label})</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>{stats.reqs.toLocaleString()}</div>
            </div>
          </div>

          {/* Graph Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
              <h3 style={{ color: 'var(--dim)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '16px' }}>Tokens Timeline</h3>
              <div style={{ height: '180px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.daily}>
                    <defs>
                      <linearGradient id="colorToks" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ background: '#111', border: '1px solid var(--border)', fontSize: '10px' }}
                      labelStyle={{ color: 'var(--dim)' }}
                    />
                    <Area type="monotone" dataKey="tokens" stroke="#f97316" strokeWidth={2} fill="url(#colorToks)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
              <h3 style={{ color: 'var(--dim)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '16px' }}>Requests Timeline</h3>
              <div style={{ height: '180px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.daily}>
                    <defs>
                      <linearGradient id="colorReqs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ background: '#111', border: '1px solid var(--border)', fontSize: '10px' }}
                      labelStyle={{ color: 'var(--dim)' }}
                    />
                    <Area type="monotone" dataKey="requests" stroke="#818cf8" strokeWidth={2} fill="url(#colorReqs)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Model Breakdown */}
            {Object.keys(stats.models).length > 0 && (
              <div>
                <h3 style={{ color: 'var(--dim)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '12px' }}>Total Model Usage</h3>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  {Object.entries(stats.models)
                    .sort((a, b) => b[1] - a[1])
                    .map(([model, count], idx, arr) => (
                      <div key={model} style={{ 
                        position: 'relative',
                        padding: '12px 16px', 
                        borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border)',
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          position: 'absolute', left: 0, top: 0, bottom: 0, 
                          width: `${(count / maxModelReqs) * 100}%`, 
                          background: 'rgba(129, 140, 248, 0.05)',
                          zIndex: 0
                        }} />
                        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#fff' }}>{model}</span>
                          <span style={{ color: 'var(--dim)', fontFamily: 'monospace' }}>{count.toLocaleString()} reqs</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* API Key Breakdown */}
            {Object.keys(stats.keys).length > 0 && (
              <div>
                <h3 style={{ color: 'var(--dim)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '12px' }}>Total Key Usage</h3>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  {Object.entries(stats.keys)
                    .sort((a, b) => b[1] - a[1])
                    .map(([keyId, tokens], idx, arr) => (
                      <div key={keyId} style={{ 
                        position: 'relative',
                        padding: '12px 16px', 
                        borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border)',
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          position: 'absolute', left: 0, top: 0, bottom: 0, 
                          width: `${(tokens / maxKeyToks) * 100}%`, 
                          background: 'rgba(249, 115, 22, 0.05)',
                          zIndex: 0
                        }} />
                        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#fff', fontSize: '0.75rem' }}>{keyId}</span>
                          <span style={{ color: 'var(--dim)', fontFamily: 'monospace' }}>{tokens.toLocaleString()} toks</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
