import { useEffect, useState } from 'react';
import {
  getCrawlSubjectMemory,
  getGlobalCrawlMemory,
  listCrawlSubjects,
  updateCrawlSubjectMemory,
  updateGlobalCrawlMemory,
  type CrawlSubject,
} from '@workspace/api-client-react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/geslaagd-momentum/components/ui/select';

export function MemoryTab() {
  const [activeSubjects, setActiveSubjects] = useState<CrawlSubject[]>([]);

  const [globalMemory, setGlobalMemory] = useState('');
  const [savingGlobalMemory, setSavingGlobalMemory] = useState(false);

  const [memorySubjectId, setMemorySubjectId] = useState('');
  const [subjectMemory, setSubjectMemory] = useState('');
  const [loadingSubjectMemory, setLoadingSubjectMemory] = useState(false);
  const [savingSubjectMemory, setSavingSubjectMemory] = useState(false);

  useEffect(() => {
    void listCrawlSubjects().then((subjects) =>
      setActiveSubjects(subjects.filter((subject) => subject.status === 'active')),
    );
    void getGlobalCrawlMemory().then(({ content }) => setGlobalMemory(content));
  }, []);

  const saveGlobalMemory = async () => {
    setSavingGlobalMemory(true);
    try {
      await updateGlobalCrawlMemory({ content: globalMemory });
    } finally {
      setSavingGlobalMemory(false);
    }
  };

  const loadSubjectMemory = async (subjectId: string) => {
    if (!subjectId) return;
    setLoadingSubjectMemory(true);
    try {
      const { content } = await getCrawlSubjectMemory(subjectId);
      setSubjectMemory(content);
    } finally {
      setLoadingSubjectMemory(false);
    }
  };
  const saveSubjectMemory = async () => {
    if (!memorySubjectId) return;
    setSavingSubjectMemory(true);
    try {
      await updateCrawlSubjectMemory(memorySubjectId, { content: subjectMemory });
    } finally {
      setSavingSubjectMemory(false);
    }
  };

  return (
    <>
      <div className="verkenner-card">
        <h3>Globaal geheugen</h3>
        <p className="study-hint">Lessen die voor elk vak gelden, geleerd uit eerdere crawls.</p>
        <Textarea
          rows={10}
          value={globalMemory}
          onChange={(e) => setGlobalMemory(e.target.value)}
          placeholder="Nog geen globale lessen vastgelegd."
        />
        <Button
          variant="outline"
          size="sm"
          disabled={savingGlobalMemory}
          onClick={() => void saveGlobalMemory()}
        >
          {savingGlobalMemory ? <Loader2 className="spin" size={14} /> : <Save size={14} />} Opslaan
        </Button>
      </div>

      <div className="verkenner-card">
        <h3>Geheugen per vak</h3>
        <Select
          value={memorySubjectId}
          onValueChange={(value) => { setMemorySubjectId(value); void loadSubjectMemory(value); }}
        >
          <SelectTrigger aria-label="Vak"><SelectValue placeholder="Kies een vak" /></SelectTrigger>
          <SelectContent>
            {activeSubjects.map((subject) => (
              <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {memorySubjectId && (
          loadingSubjectMemory ? (
            <p className="admin-empty"><Loader2 className="spin" size={15} /> Geheugen laden…</p>
          ) : (
            <>
              <Textarea
                rows={10}
                value={subjectMemory}
                onChange={(e) => setSubjectMemory(e.target.value)}
                placeholder="Nog geen lessen vastgelegd voor dit vak."
              />
              <Button
                variant="outline"
                size="sm"
                disabled={savingSubjectMemory}
                onClick={() => void saveSubjectMemory()}
              >
                {savingSubjectMemory ? <Loader2 className="spin" size={14} /> : <Save size={14} />} Opslaan
              </Button>
            </>
          )
        )}
      </div>
    </>
  );
}
