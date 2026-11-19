import { RequestHistoryRow, SpeedMetrics } from "@/utils/requestHistory";

const stages = ["queue", "preparation", "telegram", "choice"] as const;
function summarize(values: number[]) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return {
    median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    p95: values[Math.ceil(values.length * 0.95) - 1],
  };
}

export async function speedReport(rows: AsyncIterable<RequestHistoryRow>) {
  type Bucket = {
    platform: string; mode: string; samples: SpeedMetrics[];
    slowest: { id: number; userId: number; ms: number };
  };
  const buckets = new Map<string, Bucket>();
  for await (const row of rows) {
    const { metrics, platform, mode } = row;
    if (!metrics || !platform || !mode || !stages.every(stage => Number.isFinite(metrics[stage]) && metrics[stage] >= 0)) continue;
    const ms = metrics.queue + metrics.preparation + metrics.telegram;
    const key = platform + "/" + mode;
    const bucket = buckets.get(key) ?? { platform, mode, samples: [] as SpeedMetrics[], slowest: { id: row._id, userId: row.key, ms } };
    bucket.samples.push(metrics);
    if (ms > bucket.slowest.ms) bucket.slowest = { id: row._id, userId: row.key, ms };
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a,b) => a.platform.localeCompare(b.platform) || a.mode.localeCompare(b.mode)).map(bucket => ({
    platform: bucket.platform, mode: bucket.mode, count: bucket.samples.length, slowest: bucket.slowest,
    stages: Object.fromEntries(stages.map(stage => [stage, summarize(bucket.samples.map(sample => sample[stage]))])),
  }));
}
