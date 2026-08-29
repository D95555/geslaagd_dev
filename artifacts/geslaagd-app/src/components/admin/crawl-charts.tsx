import { useMemo } from 'react';
import type { CrawlSummary } from '@workspace/api-client-react';
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@workspace/geslaagd-momentum/components/ui/chart';

/**
 * Real, hoverable charts for the crawl dashboard, built on the design
 * system's Recharts wrapper so a hover shows the actual crawl (subject +
 * date) behind each point instead of relying on the browser's native,
 * delayed SVG tooltip.
 */

type Point = { label: string; value: number; subject: string; date: string };

function fmtShortDate(value: string): string {
  return new Date(value).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function LineChart({
  title,
  hint,
  points,
  config,
  formatValue,
}: {
  title: string;
  hint: string;
  points: Point[];
  config: ChartConfig;
  formatValue: (value: number) => string;
}) {
  if (points.length === 0) {
    return (
      <section className="crawl-chart">
        <div className="crawl-chart-head">
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
        <p className="admin-empty">Nog geen voltooide crawls om te tonen.</p>
      </section>
    );
  }

  return (
    <section className="crawl-chart">
      <div className="crawl-chart-head">
        <h3>{title}</h3>
        <p>{hint}</p>
      </div>
      <ChartContainer config={config} className="crawl-chart-body">
        <RechartsLineChart data={points} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value) => (
                  <span>
                    {formatValue(Number(value))}
                  </span>
                )}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.subject ?? ''}
              />
            }
          />
          <Line
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            dot={{ r: 3.5, fill: 'var(--color-value)' }}
            activeDot={{ r: 5 }}
          />
        </RechartsLineChart>
      </ChartContainer>
    </section>
  );
}

export function CrawlCharts({ crawls }: { crawls: CrawlSummary[] }) {
  // Oldest → newest so the line reads left-to-right as time moving forward.
  const completed = useMemo(
    () =>
      crawls
        .filter((crawl) => crawl.status === 'complete')
        .slice()
        .reverse(),
    [crawls],
  );

  const acceptanceRate = useMemo<Point[]>(
    () =>
      completed
        .filter((crawl) => (crawl.sourcesFound ?? 0) > 0)
        .map((crawl) => ({
          label: crawl.id,
          value: Math.round(((crawl.sourcesAccepted ?? 0) / (crawl.sourcesFound ?? 1)) * 100),
          subject: crawl.subjectName,
          date: fmtShortDate(crawl.createdAt),
        })),
    [completed],
  );

  const creditsPerSource = useMemo<Point[]>(
    () =>
      completed
        .filter((crawl) => (crawl.creditsUsed ?? 0) > 0 && (crawl.sourcesAccepted ?? 0) > 0)
        .map((crawl) => ({
          label: crawl.id,
          value: Number(((crawl.creditsUsed ?? 0) / (crawl.sourcesAccepted ?? 1)).toFixed(1)),
          subject: crawl.subjectName,
          date: fmtShortDate(crawl.createdAt),
        })),
    [completed],
  );

  return (
    <div className="crawl-charts">
      <LineChart
        title="Acceptatiegraad per crawl"
        hint="Welk deel van de gevonden bronnen de kwaliteitsdrempel haalt."
        points={acceptanceRate}
        config={{ value: { label: 'Acceptatie', color: 'hsl(var(--chart-1))' } }}
        formatValue={(value) => `${Math.round(value)}%`}
      />
      <LineChart
        title="Credits per geaccepteerde bron"
        hint="Lager is beter: hoeveel Firecrawl-credits één bruikbare bron kost."
        points={creditsPerSource}
        config={{ value: { label: 'Credits', color: 'hsl(var(--chart-3))' } }}
        formatValue={(value) => value.toFixed(1)}
      />
    </div>
  );
}
