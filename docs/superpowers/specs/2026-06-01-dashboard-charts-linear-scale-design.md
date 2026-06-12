# Design Specification: Fix Dashboard 'Tokens by Model' Chart Rendering

## 1. Problem Description
- **Tokens over time graph:** The intersection at 0 for certain dates (e.g. May 25, where Claude Code is `818,563` and Codex is `0`) occurs because the maximum value of the Y-axis is very large (e.g., `160.0M`). Relative to this scale, `818,563` is only `0.5%` of the height, rendering it visually at the bottom baseline.
- **Tokens by Model graph:** The graph renders empty (except for X-axis labels) because the Y-axis uses a logarithmic scale (`scale="log"`). For models/data points where some stacked segments (such as cache read or cache creation) are `0`, the logarithmic calculation `log(0)` yields negative infinity ($-\infty$), which crashes Recharts' layout rendering engine.

## 2. Proposed Changes
Change the Y-axis scale of the "Tokens by Model" stacked bar chart in `frontend/src/features/dashboard/TokenUsageChart.tsx` from `log` to `linear` (the default). Additionally, filter out the `<synthetic>` model from this chart to show only real model token usage.

### File: `frontend/src/features/dashboard/TokenUsageChart.tsx`
- Remove the `scale="log"` and `domain={[1, 'auto']}` attributes from the `<YAxis>` component.

### File: `frontend/src/features/dashboard/dashboard-utils.ts`
- In `toTokenChartData`, filter the dataset to exclude records where the `model` matches `<synthetic>`.

## 3. Implementation Details
The updated `<YAxis>` component in `TokenUsageChart.tsx`:
```tsx
<YAxis
  fontSize={10}
  axisLine={false}
  tickLine={false}
  tickFormatter={(value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
    return value
  }}
/>
```

The updated `toTokenChartData` function in `dashboard-utils.ts`:
```typescript
export function toTokenChartData(stats: DashboardStats | null) {
  if (!stats) return []
  return stats.agent_usage
    .filter((usage) => usage.model !== '<synthetic>')
    .map((usage) => ({
      label: `${usage.agent} / ${displayModel(usage.model)}`,
      agent: usage.agent,
      model: displayModel(usage.model),
      input: usage.input,
      output: usage.output,
      cache_creation: usage.cache_creation,
      cache_read: usage.cache_read,
      total: usage.input + usage.output + usage.cache_creation + usage.cache_read,
    }))
}
```

## 4. Verification Plan
- Verify that the local dev server loads without errors.
- Confirm the "Tokens by Model" chart displays correctly with stacked bars representing token counts for each model, excluding the `<synthetic>` model.
