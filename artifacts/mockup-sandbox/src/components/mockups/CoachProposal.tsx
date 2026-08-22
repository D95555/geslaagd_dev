import { ArrowLeft, ArrowRight, Check, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@workspace/geslaagd-momentum/components/ui/badge";
import { Button } from "@workspace/geslaagd-momentum/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/geslaagd-momentum/components/ui/card";
import { Shell, SideNav } from "./_shared/Frame";

export default function CoachProposal() {
  const [accepted, setAccepted] = useState(false);
  return (
    <Shell dark>
      <div className="flex min-h-screen">
        <SideNav active="Studiecoach" />
        <div className="min-w-0 flex-1">
          <div className="shell max-w-4xl py-10">
            <Button variant="ghost" size="sm"><ArrowLeft /> Terug naar overzicht</Button>
            <p className="meta mt-10 text-primary">studiecoach · jouw vraag</p>
            <h1 className="display mt-3 text-4xl md:text-5xl">Dit hebben we begrepen.</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">“Ik moet erfelijkheid begrijpen voor mijn biologie-toets.”</p>
            <Card className="mt-10 border-primary/50">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div><Badge variant="outline"><Sparkles size={14} /> voorstel</Badge><CardTitle className="mt-4 font-serif text-2xl">Erfelijkheid en DNA</CardTitle></div>
                  <Badge variant="outline">Biologie · 6 VWO</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-muted-foreground">Je wilt begrijpen hoe DNA, genen en chromosomen samen bepalen welke eigenschappen worden doorgegeven.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {["DNA en genen", "Dominant en recessief", "Stambomen lezen"].map((topic, index) => <div className="rounded-lg border border-border p-4" key={topic}><span className="meta text-primary">kern 0{index + 1}</span><p className="mt-3 text-sm font-medium">{topic}</p></div>)}
                </div>
                {accepted ? <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-4 text-sm text-primary"><Check size={18} /> Studieplek aangemaakt. Je volgende stap: begin met DNA en genen.</div> : <div className="flex flex-wrap gap-3"><Button onClick={() => setAccepted(true)}>Dit is mijn onderwerp <ArrowRight /></Button><Button variant="outline"><RefreshCw /> Anders formuleren</Button></div>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}