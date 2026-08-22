import { ArrowRight, BookOpen, Check, CircleAlert, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@workspace/geslaagd-momentum/components/ui/badge";
import { Button } from "@workspace/geslaagd-momentum/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/geslaagd-momentum/components/ui/card";
import { Input } from "@workspace/geslaagd-momentum/components/ui/input";
import { Progress } from "@workspace/geslaagd-momentum/components/ui/progress";
import { Textarea } from "@workspace/geslaagd-momentum/components/ui/textarea";

export function Brand({ dark = false }: { dark?: boolean }) {
  return <div className={`flex items-center gap-2 font-serif text-lg font-semibold ${dark ? "text-primary" : ""}`}><span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Check size={16} /></span>geslaagd</div>;
}

export function Topbar({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  return <header className="border-b border-border/70">
    <div className="shell flex items-center justify-between py-4">
      <Brand dark={dark} />
      <nav className="hidden items-center gap-6 text-sm md:flex"><a href="#werking">Zo werkt het</a><a href="#bewijs">Bronnen</a><Button variant="ghost" size="sm">Inloggen</Button><Button size="sm">Aan de slag <ArrowRight /></Button></nav>
      <Button className="md:hidden" variant="ghost" size="icon" aria-label={open ? "Menu sluiten" : "Menu openen"} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button>
    </div>
    {open && <nav className="shell flex flex-col gap-3 border-t border-border py-4 text-sm md:hidden"><a href="#werking" onClick={() => setOpen(false)}>Zo werkt het</a><a href="#bewijs" onClick={() => setOpen(false)}>Bronnen</a><Button variant="secondary">Inloggen</Button><Button>Aan de slag <ArrowRight /></Button></nav>}
  </header>;
}

export function Shell({ children, dark = false, className = "" }: { children: ReactNode; dark?: boolean; className?: string }) {
  return <main className={`mockup-page ${dark ? "dark ink" : "paper"} ${className}`}>{children}</main>;
}

export function SideNav({ active = "Overzicht" }: { active?: string }) {
  return <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar p-5 lg:block"><Brand dark /><p className="meta mt-10 mb-3 text-muted-foreground">Mijn leeromgeving</p><div className="space-y-1">{["Overzicht", "Studiecoach", "Catalogus"].map((item) => <Button key={item} className="w-full justify-start" variant={item === active ? "secondary" : "ghost"}>{item}</Button>)}</div><div className="mt-auto pt-24"><p className="meta text-muted-foreground">PROFIEL</p><Button variant="ghost" className="mt-2 w-full justify-start">Mila de Vries</Button></div></aside>;
}

export function Prompt({ compact = false }: { compact?: boolean }) {
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  return <Card className="border-primary/40 bg-card/90"><CardHeader><div className="flex items-center justify-between"><CardTitle className="font-serif text-xl">{sent ? "We maken het onderwerp kleiner." : "Waar wil je vandaag grip op krijgen?"}</CardTitle><Badge variant="outline">STAP 01</Badge></div></CardHeader><CardContent>{sent ? <div className="flex flex-wrap items-center gap-3"><Badge><Check /> Vraag ontvangen</Badge><span className="text-sm text-muted-foreground">Je coach zoekt de kern uit je vraag.</span><Button variant="secondary" size="sm" onClick={() => setSent(false)}>Nieuwe vraag</Button></div> : <div className={`flex gap-2 ${compact ? "flex-col sm:flex-row" : "flex-col sm:flex-row"}`}><Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Bijv. leg uit hoe de Nederlandse rechtsstaat werkt" aria-label="Jouw studie vraag" /><Button disabled={!value.trim()} onClick={() => setSent(true)}>Vraag coach <ArrowRight /></Button></div>}</CardContent></Card>;
}

export function ProgressLine({ value = 60 }: { value?: number }) { return <div className="space-y-2"><div className="flex justify-between text-sm"><span>Voortgang</span><span className="meta">{Math.round(value / 20)} van 5 onderwerpen</span></div><Progress value={value} /></div>; }
export function Notice({ children }: { children: ReactNode }) { const [show, setShow] = useState(true); return show ? <div className="flex items-start gap-3 border-b border-primary/30 bg-primary/10 px-4 py-3 text-sm"><CircleAlert className="mt-0.5 text-primary" size={17} /><span className="flex-1">{children}</span><Button variant="ghost" size="icon" aria-label="Bericht sluiten" onClick={() => setShow(false)}><X /></Button></div> : null; }
export function Source({ name, detail }: { name: string; detail: string }) { return <div className="flex items-start gap-3 border-t border-border py-3"><span className="mt-1 size-2 rounded-full bg-chart-2" /><div><p className="text-sm font-medium">{name}</p><p className="meta mt-1 text-muted-foreground">{detail}</p></div><Badge className="ml-auto" variant="outline">bron</Badge></div>; }