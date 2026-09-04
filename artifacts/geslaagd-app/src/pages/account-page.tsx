import { useEffect, useState } from 'react';
import { applyUpgradeKey, getMyBilling, type BillingSummary } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { PageHeader } from '@workspace/geslaagd-momentum/components/layout/page-header';
import { PageSections } from '@workspace/geslaagd-momentum/components/layout/section';
import { StudyPageShell } from '@/components/study/study-page-shell';

const packageLabel: Record<BillingSummary['package'], string> = {
  trial: 'Trial',
  basis: 'Basis',
  plus: 'Plus',
  beheerder: 'Beheerder',
};

export default function AccountPage() {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => void getMyBilling().then(setBilling);
  useEffect(load, []);

  const submit = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    setNotice('');
    try {
      const result = await applyUpgradeKey({ code: code.trim().toUpperCase() });
      setBilling(result);
      setCode('');
      setNotice('Pakket bijgewerkt.');
    } catch {
      setNotice('Deze code is ongeldig, al gebruikt, of geen upgrade t.o.v. je huidige pakket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StudyPageShell>
      <PageSections>
        <PageHeader
          title="Mijn account"
          description={
            billing
              ? `Pakket: ${packageLabel[billing.package]} · Credits: ${billing.credits ?? 'onbeperkt'}`
              : undefined
          }
        />
        <label className="account-upgrade-field">
          Upgrade-code
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" />
        </label>
        {notice && <p className="admin-notice">{notice}</p>}
        <Button disabled={submitting || !code.trim()} onClick={() => void submit()}>Code toepassen</Button>
      </PageSections>
    </StudyPageShell>
  );
}
