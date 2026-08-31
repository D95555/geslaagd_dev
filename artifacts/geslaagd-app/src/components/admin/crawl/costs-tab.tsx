import { useEffect, useState } from 'react';
import {
  getCrawlSubjectCosts,
  listCrawlSubjects,
  type CrawlSubject,
  type SubjectCostBreakdown,
} from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/geslaagd-momentum/components/ui/select';

export function CostsTab() {
  const [activeSubjects, setActiveSubjects] = useState<CrawlSubject[]>([]);
  const [costsSubjectId, setCostsSubjectId] = useState('');
  const [costs, setCosts] = useState<SubjectCostBreakdown | null>(null);
  const [loadingCosts, setLoadingCosts] = useState(false);

  useEffect(() => {
    void listCrawlSubjects().then((subjects) =>
      setActiveSubjects(subjects.filter((subject) => subject.status === 'active')),
    );
  }, []);

  const loadCosts = async (subjectId: string) => {
    if (!subjectId) return;
    setLoadingCosts(true);
    try {
      setCosts(await getCrawlSubjectCosts(subjectId));
    } finally {
      setLoadingCosts(false);
    }
  };

  return (
    <div className="verkenner-card">
      <Select
        value={costsSubjectId}
        onValueChange={(value) => { setCostsSubjectId(value); void loadCosts(value); }}
      >
        <SelectTrigger aria-label="Vak"><SelectValue placeholder="Kies een vak" /></SelectTrigger>
        <SelectContent>
          {activeSubjects.map((subject) => (
            <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {costsSubjectId && (
        loadingCosts || !costs ? (
          <p className="admin-empty"><Loader2 className="spin" size={15} /> Kosten laden…</p>
        ) : (
          <>
            <p>
              <strong>Firecrawl-credits</strong><br />
              {costs.firecrawlTotal} van {costs.creditBudget} verbruikt
            </p>
            {costs.firecrawlByOperation.length > 0 && (
              <ul>
                {costs.firecrawlByOperation.map((entry) => (
                  <li key={entry.operation}>{entry.operation}: {entry.credits} credits</li>
                ))}
              </ul>
            )}
            <p><strong>AI-tokens</strong><br />per taak, geen geschatte kosten in euro's</p>
            {costs.aiByTask.length > 0 ? (
              <ul>
                {costs.aiByTask.map((entry) => (
                  <li key={`${entry.taskType}-${entry.model}`}>
                    {entry.taskType} ({entry.model}): {entry.inputTokens} in / {entry.outputTokens} uit
                  </li>
                ))}
              </ul>
            ) : (
              <p className="study-hint">Nog geen AI-gebruik geregistreerd voor dit vak.</p>
            )}
          </>
        )
      )}
    </div>
  );
}
