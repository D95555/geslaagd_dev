import { BellRing, Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@workspace/geslaagd-momentum/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/geslaagd-momentum/components/ui/card";
import { Shell, Brand } from "./_shared/Frame";

export default function BroadcastNotice() {
  const [visible, setVisible] = useState(true);
  return (
    <Shell dark>
      {visible ? (
        <aside className="flex items-start gap-4 border-b border-primary/40 bg-primary/10 px-5 py-4" aria-live="polite">
          <BellRing className="mt-0.5 text-primary" size={20} />
          <div className="flex-1">
            <p className="font-medium">Gepland onderhoud vannacht om 23:00</p>
            <p className="mt-1 text-sm text-muted-foreground">Je leerplekken blijven bewaard. We zijn rond 23:20 weer terug.</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Broadcast sluiten" onClick={() => setVisible(false)}><X /></Button>
        </aside>
      ) : null}
      <div className="shell max-w-3xl py-14">
        <Brand dark />
        <Card className="mt-12">
          <CardHeader><CardTitle className="display text-3xl">Een bericht blijft rustig op de achtergrond.</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>Een broadcast heeft één doel: vertellen wat er verandert en wat een student daarna kan doen.</p>
            <div className="flex items-center gap-2 text-sm text-primary"><Check size={17} /> Altijd te sluiten, nooit een blokkade.</div>
            {!visible ? <Button onClick={() => setVisible(true)}>Toon bericht opnieuw</Button> : null}
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}