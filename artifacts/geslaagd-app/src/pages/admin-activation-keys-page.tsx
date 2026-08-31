import { useEffect, useState } from 'react';
import {
  createActivationKeys,
  listActivationKeys,
  type ActivationKey,
} from '@workspace/api-client-react';
import { Check, Copy, KeyRound, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/geslaagd-momentum/components/ui/select';

function fmtDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button variant="ghost" size="sm" onClick={() => void copy()}>
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Gekopieerd' : 'Kopiëren'}
    </Button>
  );
}

export default function AdminActivationKeysPage() {
  const { user, isLoading } = useAuth();
  const [keys, setKeys] = useState<ActivationKey[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'used'>('all');
  const [count, setCount] = useState('1');
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      const result = await listActivationKeys(statusFilter === 'all' ? undefined : { status: statusFilter });
      setKeys(result.keys);
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
    }
  };
  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id, statusFilter]);

  const generate = async () => {
    const value = Number(count);
    if (!Number.isFinite(value) || value < 1) return;
    setGenerating(true);
    try {
      await createActivationKeys({ count: Math.min(value, 100) });
      await load();
    } finally {
      setGenerating(false);
    }
  };

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell
      title="Activatiecodes"
      intro="Codes die nodig zijn om een account aan te maken. Later koppelt een echte aankoop hier automatisch aan; voor nu maak je ze hier handmatig aan."
    >
      <div className="crawl-toolbar">
        <Input
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          style={{ width: 90 }}
        />
        <Button onClick={() => void generate()} disabled={generating}>
          {generating ? <Loader2 className="spin" size={14} /> : <Plus size={14} />} Genereer codes
        </Button>
      </div>

      <div className="pipeline-filters">
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
          <SelectTrigger className="pipeline-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="used">Gebruikt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state === 'loading' ? (
        <p className="admin-empty"><Loader2 className="spin" size={15} /> Codes laden…</p>
      ) : state === 'error' ? (
        <p className="admin-empty">Codes konden niet geladen worden.</p>
      ) : keys.length === 0 ? (
        <p className="admin-empty">Nog geen activatiecodes aangemaakt.</p>
      ) : (
        <div className="account-list">
          {keys.map((key) => (
            <div key={key.id} className="account-row">
              <div>
                <strong><KeyRound size={13} aria-hidden="true" /> {key.code}</strong>
                <span>
                  Aangemaakt {fmtDateTime(key.createdAt)}
                  {key.status === 'used' && key.usedByEmail
                    ? ` · gebruikt door ${key.usedByEmail} op ${fmtDateTime(key.usedAt)}`
                    : ''}
                </span>
              </div>
              <div className="request-row-actions">
                <Badge variant={key.status === 'open' ? 'default' : 'secondary'}>
                  {key.status === 'open' ? 'Open' : 'Gebruikt'}
                </Badge>
                {key.status === 'open' && <CopyButton value={key.code} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
