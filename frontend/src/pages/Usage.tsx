import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

type Stats = {
  reqs: number;
  toks: number;
  models: Record<string, number>;
  keys: Record<string, number>;
  daily: Array<{ date: string; tokens: number; requests: number; models: Record<string, number> }>;
};

export function Usage() {
  const [apiKey, setApiKey] = useState('');
  const [timeRange, setTimeRange] = useState(() =>
    Number(localStorage.getItem('openai_usage_range')) || 7
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);

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
    if (!key) { setError('Please enter an Admin API Key.'); return; }

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
        fetch(`/api/openai/usage/completions?start_time=${start}&end_time=${end}&bucket_width=1d&group_by=api_key_id`, { headers }),
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
        keyRes.ok ? keyRes.json().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);

      let totalReqs = 0;
      let totalToks = 0;
      const modelsBreakdown: Record<string, number> = {};
      const keysBreakdown: Record<string, number> = {};
      const dailyMap = new Map<string, { date: string; tokens: number; requests: number; models: Record<string, number> }>();

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
        if (!dailyMap.has(date)) dailyMap.set(date, { date, tokens: 0, requests: 0, models: {} });
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
      setStats({ reqs: Number(totalReqs) || 0, toks: Number(totalToks) || 0, models: modelsBreakdown, keys: keysBreakdown, daily });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const maxModelReqs = stats ? Math.max(...Object.values(stats.models), 1) : 1;
  const maxKeyToks = stats ? Math.max(...Object.values(stats.keys), 1) : 1;
  const selectedLabel = TIME_RANGES.find(t => t.days === timeRange)?.label ?? '';

  return (
    <div className="p-[30px] overflow-y-auto flex-1">
      <div className="flex gap-[10px] mb-6">
        <Select value={String(timeRange)} onValueChange={v => setTimeRange(Number(v))}>
          <SelectTrigger className="w-[120px] h-auto py-2 px-3 text-[0.8rem] bg-black border-[#333] text-[#cccccc] focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
            <SelectGroup>
              {TIME_RANGES.map(t => (
                <SelectItem key={t.days} value={String(t.days)}>{t.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input
          type="password"
          className="flex-1 h-auto py-2 px-3 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder="sk-admin-..."
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
        />
        <Button
          className="bg-[rgba(71,255,156,0.12)] text-[#47ff9c] border border-[rgba(71,255,156,0.3)] hover:bg-[rgba(71,255,156,0.2)] hover:text-[#47ff9c] font-bold text-[0.8rem] px-4 py-2 h-auto"
          onClick={fetchUsage}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Load Usage'}
        </Button>
      </div>

      {error && <p className="text-[#ff5f56] mb-5 text-[0.8rem]">{error}</p>}

      {stats && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-px bg-[#333] rounded-lg overflow-hidden border border-[#333]">
            <div className="bg-[#0c0c0c] p-5">
              <div className="text-[#666] text-[0.75rem] uppercase mb-2">Total Tokens (Last {selectedLabel})</div>
              <div className="text-[1.5rem] font-bold text-white">{stats.toks.toLocaleString()}</div>
            </div>
            <div className="bg-[#0c0c0c] p-5">
              <div className="text-[#666] text-[0.75rem] uppercase mb-2">Total Requests (Last {selectedLabel})</div>
              <div className="text-[1.5rem] font-bold text-white">{stats.reqs.toLocaleString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Card className="bg-[#0c0c0c] border-[#333]">
              <CardHeader className="pb-4">
                <CardTitle className="text-[#666] text-[0.7rem] uppercase font-normal tracking-wider">Tokens Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.daily}>
                      <defs>
                        <linearGradient id="colorToks" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ background: '#111', border: '1px solid #333', fontSize: '10px' }}
                        labelStyle={{ color: '#666' }}
                      />
                      <Area type="monotone" dataKey="tokens" stroke="#f97316" strokeWidth={2} fill="url(#colorToks)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0c0c0c] border-[#333]">
              <CardHeader className="pb-4">
                <CardTitle className="text-[#666] text-[0.7rem] uppercase font-normal tracking-wider">Requests Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.daily}>
                      <defs>
                        <linearGradient id="colorReqs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ background: '#111', border: '1px solid #333', fontSize: '10px' }}
                        labelStyle={{ color: '#666' }}
                      />
                      <Area type="monotone" dataKey="requests" stroke="#818cf8" strokeWidth={2} fill="url(#colorReqs)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {Object.keys(stats.models).length > 0 && (
              <div>
                <h3 className="text-[#666] text-[0.8rem] uppercase mb-3">Total Model Usage</h3>
                <div className="bg-[#0c0c0c] border border-[#333] rounded-lg overflow-hidden">
                  {Object.entries(stats.models)
                    .sort((a, b) => b[1] - a[1])
                    .map(([model, count], idx, arr) => (
                      <div
                        key={model}
                        className="relative px-4 py-3 overflow-hidden"
                        style={{ borderBottom: idx === arr.length - 1 ? 'none' : '1px solid #333' }}
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-[rgba(129,140,248,0.05)]"
                          style={{ width: `${(count / maxModelReqs) * 100}%` }}
                        />
                        <div className="relative flex justify-between">
                          <span className="text-white">{model}</span>
                          <span className="text-[#666] font-mono">{count.toLocaleString()} reqs</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {Object.keys(stats.keys).length > 0 && (
              <div>
                <h3 className="text-[#666] text-[0.8rem] uppercase mb-3">Total Key Usage</h3>
                <div className="bg-[#0c0c0c] border border-[#333] rounded-lg overflow-hidden">
                  {Object.entries(stats.keys)
                    .sort((a, b) => b[1] - a[1])
                    .map(([keyId, tokens], idx, arr) => (
                      <div
                        key={keyId}
                        className="relative px-4 py-3 overflow-hidden"
                        style={{ borderBottom: idx === arr.length - 1 ? 'none' : '1px solid #333' }}
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-[rgba(249,115,22,0.05)]"
                          style={{ width: `${(tokens / maxKeyToks) * 100}%` }}
                        />
                        <div className="relative flex justify-between">
                          <span className="text-white text-[0.75rem]">{keyId}</span>
                          <span className="text-[#666] font-mono">{tokens.toLocaleString()} toks</span>
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
