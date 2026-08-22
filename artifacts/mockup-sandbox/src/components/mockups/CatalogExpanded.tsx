import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@workspace/geslaagd-momentum/components/ui/badge";
import { Button } from "@workspace/geslaagd-momentum/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/geslaagd-momentum/components/ui/card";
import { Input } from "@workspace/geslaagd-momentum/components/ui/input";
import { Shell, SideNav } from "./_shared/Frame";

export default function CatalogExpanded() {
  const [selected, setSelected] = useState<string | null>(null);
  const chapters = [
    ["1", "Wat is een rechtsstaat?", "Grondwet · grondrechten"],
    ["2", "Machtenscheiding", "Wetgevende · uitvoerende · rechterlijke macht"],
    ["3", "Democratie en recht", "Representatie · onafhankelijke rechter"],
  ];
  return (
    <Shell dark>
      <div className="flex min-h-screen">
        <SideNav active="Catalogus" />
        <div className="min-w-0 flex-1">
          <div className="shell max-w-5xl py-10">
            <Button variant="ghost" size="sm"><ArrowLeft /> Catalogus</Button>
            <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
              <div><p className="meta text-primary">geschiedenis · vakroute</p><h1 className="display mt-3 text-4xl md:text-5xl">Kies je hoofdstuk.</h1><p className="mt-3 text-muted-foreground">Je ziet de structuur van je methode, niet de boekinhoud.</p></div>
              <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-3 text-muted-foreground" size={16} /><Input className="pl-9" placeholder="Zoek hoofdstuk" /></div>
            </div>
            <Card className="mt-10">
              <CardHeader><div className="flex items-start justify-between gap-4"><div><Badge variant="outline"><BookOpen size={14} /> Methode</Badge><CardTitle className="mt-4 font-serif text-2xl">Memo · Geschiedenis havo/vwo</CardTitle></div><span className="meta text-muted-foreground">3 hoofdstukken</span></div></CardHeader>
              <CardContent className="space-y-1">
                {chapters.map(([number, title, detail]) => <button className={`flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors ${selected === number ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`} key={number} onClick={() => setSelected(number)}><span className="meta text-primary">h{number}</span><div className="min-w-0 flex-1"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>{selected === number ? <Check className="text-primary" /> : <ChevronRight className="text-muted-foreground" />}</button>)}
              </CardContent>
            </Card>
            {selected ? <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/40 bg-primary/10 p-5"><div><p className="font-medium">Hoofdstuk {selected} staat klaar als vertrekpunt.</p><p className="mt-1 text-sm text-muted-foreground">Daarna kies je één vraag om te begrijpen.</p></div><Button>Open studieplek <ArrowRight /></Button></div> : null}
          </div>
        </div>
      </div>
    </Shell>
  );
}