import { useMemo } from 'react';
import type { CrawlSummary } from '@workspace/api-client-react';

/**
 * Dependency-free SVG charts for the crawl dashboard. Both charts pair colour
 * with a text/table alternative so meaning never rests on colour alone, and
 * both render the underlying numbers in a visually-hidden table for
 * screen readers.
 */

type Point = { label: string; value: number; caption: string };

function fmtShortDate(value: string): string {
  return new Date(value).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function buildPath(values: number[], width: number, height: number, pad: number): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const x = pad + index * stepX;
      const y = height - pad - ((value - min) / span) * (height - pad * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function LineChart({
  title,
  hint,
  points,
  stroke,
  formatValue,
}: {
  title: string;
  hint: string;
  points: Point[];
  stroke: string;
  formatValue: (value: number) => string;
}) {
  const width = 520;
  const height = 170;
  const pad = 26;
  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;

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
      <div className="crawl-chart-body">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title}. ${hint}. Laagste waarde ${formatValue(min)}, hoogste waarde ${formatValue(max)}.`}
          preserveAspectRatio="none"
        >
          {[0, 0.5, 1].map((fraction) => (
            <line
              key={fraction}
              x1={pad}
              x2={width - pad}
              y1={height - pad - fraction * (height - pad * 2)}
              y2={height - pad - fraction * (height - pad * 2)}
              className="crawl-chart-grid"
            />
          ))}
          <path d={buildPath(values, width, height, pad)} fill="none" stroke={stroke} strokeWidth={2} />
          {points.map((point, index) => {
            const x = pad + index * stepX;
            const y = height - pad - ((point.value - min) / span) * (height - pad * 2);
            return (
              <g key={`${point.label}-${index}`}>
                <circle cx={x} cy={y} r={3.5} fill={stroke} />
                <title>{`${point.caption}: ${formatValue(point.value)}`}</title>
              </g>
            );
          })}
        </svg>
        <div className="crawl-chart-axis">
          <span>{formatValue(min)}</span>
          <span>{formatValue(max)}</span>
        </div>
      </div>
      <table className="visually-hidden">
        <caption>{title}</caption>
        <thead>
          <tr><th scope="col">Crawl</th><th scope="col">Waarde</th></tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={`${point.label}-row-${index}`}>
              <th scope="row">{point.caption}</th>
              <td>{formatValue(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
          value: ((crawl.sourcesAccepted ?? 0) / (crawl.sourcesFound ?? 1)) * 100,
          caption: `${crawl.subjectName} · ${fmtShortDate(crawl.createdAt)}`,
        })),
    [completed],
  );

  const creditsPerSource = useMemo<Point[]>(
    () =>
      completed
        .filter((crawl) => (crawl.creditsUsed ?? 0) > 0 && (crawl.sourcesAccepted ?? 0) > 0)
        .map((crawl) => ({
          label: crawl.id,
          value: (crawl.creditsUsed ?? 0) / (crawl.sourcesAccepted ?? 1),
          caption: `${crawl.subjectName} · ${fmtShortDate(crawl.createdAt)}`,
        })),
    [completed],
  );

  return (
    <div className="crawl-charts">
      <LineChart
        title="Acceptatiegraad per crawl"
        hint="Welk deel van de gevonden bronnen de kwaliteitsdrempel haalt."
        points={acceptanceRate}
        stroke="hsl(var(--chart-1))"
        formatValue={(value) => `${Math.round(value)}%`}
      />
      <LineChart
        title="Credits per geaccepteerde bron"
        hint="Lager is beter: hoeveel Firecrawl-credits één bruikbare bron kost."
        points={creditsPerSource}
        stroke="hsl(var(--chart-3))"
        formatValue={(value) => value.toFixed(1)}
      />
    </div>
  );
}
