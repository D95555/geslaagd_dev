import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';

export type CrawlConfigDraft = {
  queries: string;
  limitPerQuery: number;
  location: string;
  categories: string;
  includeDomains: string;
  excludeDomains: string;
  tbs: string;
  useResearchIndex: boolean;
};

export const emptyCrawlConfig: CrawlConfigDraft = {
  queries: '',
  limitPerQuery: 10,
  location: 'Netherlands',
  categories: '',
  includeDomains: '',
  excludeDomains: '',
  tbs: '',
  useResearchIndex: false,
};

function toList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Converts the form draft into the crawl config the pipeline task expects. */
export function toCrawlConfigPayload(draft: CrawlConfigDraft): Record<string, unknown> {
  return {
    queries: toList(draft.queries),
    limitPerQuery: Number(draft.limitPerQuery) || 10,
    location: draft.location.trim() || null,
    categories: toList(draft.categories),
    includeDomains: toList(draft.includeDomains),
    excludeDomains: toList(draft.excludeDomains),
    tbs: draft.tbs.trim() || null,
    useResearchIndex: draft.useResearchIndex,
    researchQuery: null,
    scrapeOptions: { formats: ['markdown'] },
  };
}

export function CrawlConfigForm({
  value,
  onChange,
}: {
  value: CrawlConfigDraft;
  onChange: (next: CrawlConfigDraft) => void;
}) {
  const set = <K extends keyof CrawlConfigDraft>(key: K, next: CrawlConfigDraft[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="crawl-config-form">
      <label>
        <span>Zoekopdrachten (één per regel)</span>
        <Textarea
          rows={3}
          value={value.queries}
          onChange={(event) => set('queries', event.target.value)}
          placeholder={'biologie erfelijkheid uitleg\nmendel wetten vwo'}
        />
      </label>

      <div className="crawl-config-row">
        <label>
          <span>Resultaten per zoekopdracht</span>
          <Input
            type="number"
            min={1}
            max={30}
            value={value.limitPerQuery}
            onChange={(event) => set('limitPerQuery', Number(event.target.value))}
          />
        </label>
        <label>
          <span>Locatie</span>
          <Input
            value={value.location}
            onChange={(event) => set('location', event.target.value)}
            placeholder="Netherlands"
          />
        </label>
      </div>

      <div className="crawl-config-row">
        <label>
          <span>Alleen deze domeinen</span>
          <Input
            value={value.includeDomains}
            onChange={(event) => set('includeDomains', event.target.value)}
            placeholder="khanacademy.org, natuurkunde.nl"
          />
        </label>
        <label>
          <span>Uitgesloten domeinen</span>
          <Input
            value={value.excludeDomains}
            onChange={(event) => set('excludeDomains', event.target.value)}
            placeholder="quora.com"
          />
        </label>
      </div>

      <div className="crawl-config-row">
        <label>
          <span>Categorieën</span>
          <Input
            value={value.categories}
            onChange={(event) => set('categories', event.target.value)}
            placeholder="research"
          />
        </label>
        <label>
          <span>Tijdsfilter (tbs)</span>
          <Input
            value={value.tbs}
            onChange={(event) => set('tbs', event.target.value)}
            placeholder="qdr:y"
          />
        </label>
      </div>

      <label className="crawl-config-checkbox">
        <input
          type="checkbox"
          checked={value.useResearchIndex}
          onChange={(event) => set('useResearchIndex', event.target.checked)}
        />
        <span>Ook wetenschappelijke publicaties doorzoeken</span>
      </label>
    </div>
  );
}
