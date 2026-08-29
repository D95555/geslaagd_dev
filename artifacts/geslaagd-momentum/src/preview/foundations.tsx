import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Database,
  Info,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import { tokens } from '../generated/tokens';
import { Guidelines } from './parts';

/**
 * Swatch labels read their values from the generated tokens rather than
 * repeating them, so this page cannot drift from tokens.json.
 */
function pair(token: keyof typeof tokens.color.light): string {
  return `${tokens.color.light[token].toUpperCase()} · ${tokens.color.dark[token].toUpperCase()}`;
}

const CORE_SWATCHES = [
  { name: 'Primary / momentum emerald', className: 'momentum-swatch momentum-swatch-primary', value: pair('primary') },
  { name: 'Secondary / forest surface', className: 'momentum-swatch momentum-swatch-secondary', value: pair('secondary') },
  { name: 'Accent / aurora violet', className: 'momentum-swatch momentum-swatch-accent', value: pair('accent') },
] as const;

const SUPPORTING_SWATCHES = [
  { name: 'Paper / ink', className: 'momentum-swatch momentum-swatch-paper', value: pair('background') },
  { name: 'Card / forest', className: 'momentum-swatch momentum-swatch-card', value: pair('card') },
  { name: 'Aurora blue', className: 'momentum-swatch momentum-swatch-blue', value: pair('chart2') },
  { name: 'Signal amber', className: 'momentum-swatch momentum-swatch-amber', value: pair('chart4') },
  { name: 'Destructive', className: 'momentum-swatch momentum-swatch-danger', value: pair('destructive') },
] as const;

const TYPE_SAMPLES: Record<string, string> = {
  display: 'Meer grip. Eén volgende stap.',
  heading1: 'Van twijfel naar duidelijkheid.',
  heading2: 'Wat je deze week oppakt.',
  heading3: 'Hoofdstuk 3 · Celdeling',
  body: 'Heldere uitleg die je helpt om verder te leren.',
  bodyLong:
    'Langere leesteksten krijgen meer lucht: iets groter, met ruimere regelafstand, zodat je een hele samenvatting achter elkaar kunt lezen zonder je plek kwijt te raken.',
  label: 'Stap 02 / Bronnen',
  meta: 'bron 01 · gecontroleerd · 6 min',
};

/** camelCase token name -> the generated .type-* class, same rule as the generator. */
function typeClass(name: string): string {
  return `type-${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

/** Rendered with the real .type-* classes, so this page cannot drift from the ramp. */
const TYPE_SCALE = Object.entries(tokens.typeScale).map(([name, step]) => ({
  name,
  sample: TYPE_SAMPLES[name] ?? name,
  className: typeClass(name),
  detail: `${step.size} · ${step.lineHeight} · ${step.weight}`,
}));

const SPACING_SCALE = [
  { label: '4 / micro', size: 'momentum-space-4' },
  { label: '8 / inline', size: 'momentum-space-8' },
  { label: '16 / control', size: 'momentum-space-16' },
  { label: '24 / card', size: 'momentum-space-24' },
  { label: '48 / section', size: 'momentum-space-48' },
] as const;

function Swatch({ name, className, value }: { name: string; className: string; value: string }) {
  return (
    <div className="momentum-swatch-wrap">
      <div className={className} />
      <div><p>{name}</p><span>{value}</span></div>
    </div>
  );
}

export function OverviewPage() {
  return (
    <div className="momentum-page">
      <section className="momentum-hero-card">
        <div className="momentum-hero-copy">
          <span className="momentum-kicker"><Sparkles size={14} /> systeem in één zin</span>
          <h2>Maak van “ik weet niet waar ik moet beginnen” een volgende stap.</h2>
          <p>Geslaagd Momentum is een rustige, geloofwaardige basis voor een leerproduct dat focus geeft zonder de nieuwsgierigheid kleiner te maken.</p>
          <div className="momentum-actions">
            <Button size="lg"><ArrowRight /> Start met leren</Button>
            <Button size="lg" variant="outline">Bekijk de bron</Button>
          </div>
        </div>
        <div className="momentum-hero-orbit" aria-hidden="true"><span /><i /><b /></div>
      </section>

      <div className="momentum-metric-row">
        <div><strong>1</strong><span>duidelijke actie per staat</span></div>
        <div><strong>2</strong><span>thema’s met dezelfde hiërarchie</span></div>
        <div><strong>3</strong><span>lagen: grip, bewijs, voortgang</span></div>
      </div>

      <div className="momentum-overview-grid">
        <section className="momentum-panel">
          <div className="momentum-panel-heading"><div><span className="momentum-kicker">01 / kernpalet</span><h3>Rust die kan versnellen.</h3></div><Sun size={18} /></div>
          <div className="momentum-swatch-grid">{CORE_SWATCHES.map((swatch) => <Swatch key={swatch.name} {...swatch} />)}</div>
          <p className="momentum-note">Emerald draagt de actie. Violet markeert ontdekking. Blauw helpt bewijs en navigatie zonder om aandacht te schreeuwen.</p>
        </section>
        <section className="momentum-panel momentum-dark-panel">
          <div className="momentum-panel-heading"><div><span className="momentum-kicker">02 / toegepast</span><h3>Een antwoord met bewijs.</h3></div><Moon size={18} /></div>
          <div className="momentum-answer-card">
            <div className="momentum-answer-top"><Badge>klaar om te leren</Badge><span className="momentum-mono">06 MIN LEESTIJD</span></div>
            <h4>De Nederlandse rechtsstaat</h4>
            <p>Een compacte route door de kernbegrippen, met bronnen die je kunt terugvinden.</p>
            <div className="momentum-source-line"><Database size={14} /><span>Rijksoverheid · Grondwet</span><CheckCircle2 size={15} /></div>
          </div>
        </section>
      </div>

      <section className="momentum-panel momentum-principles">
        <div className="momentum-panel-heading"><div><span className="momentum-kicker">03 / ontwerpprincipes</span><h3>Focused momentum, niet meer ruis.</h3></div></div>
        <div className="momentum-principle-grid">
          <div><span>01</span><strong>Maak het volgende klein</strong><p>Een prompt, kaart of scherm leidt naar één actie. Extra opties mogen wachten.</p></div>
          <div><span>02</span><strong>Laat zien waarom het klopt</strong><p>Bronnen en status zijn dichtbij de inhoud, in mono en met rustige signalen.</p></div>
          <div><span>03</span><strong>Laat vooruitgang ademen</strong><p>Progressie is een uitnodiging, geen scorebord. Gebruik ruimte als feedback.</p></div>
        </div>
      </section>
    </div>
  );
}

export function BrandPage() {
  return (
    <div className="momentum-page">
      <section className="momentum-panel momentum-brand-panel">
        <span className="momentum-kicker">geslaagd.app / identiteit</span>
        <div className="momentum-wordmark"><span className="momentum-mark" aria-hidden="true" /><strong>geslaagd<span>.app</span></strong></div>
        <h2>Een kalme basis met een duidelijk vertrekpunt.</h2>
        <p>Behoud de bestaande geslaagd.app woordmerkidentiteit. Momentum voegt geen nieuw logo toe; het geeft de bestaande naam een omgeving die vertrouwen en beweging uitstraalt.</p>
        <div className="momentum-brand-rules">
          <div><strong>Woordmerk</strong><span>Altijd herkenbaar, nooit decoratief vervormd.</span></div>
          <div><strong>Markering</strong><span>Gebruik de mark alleen als anker naast het woordmerk.</span></div>
          <div><strong>Stem</strong><span>Direct, menselijk, precies. “Je volgende stap” boven “slimme AI”.</span></div>
        </div>
      </section>
      <section className="momentum-panel">
        <div className="momentum-panel-heading"><div><span className="momentum-kicker">merkgedrag</span><h3>Zo voelt Geslaagd.</h3></div></div>
        <div className="momentum-do-dont">
          <div><span className="momentum-rule-icon momentum-rule-do"><Check size={14} /></span><div><strong>Warm precies</strong><p>“Je hebt nu de kern. Dit is je volgende stap.”</p></div></div>
          <div><span className="momentum-rule-icon momentum-rule-dont">×</span><div><strong>Niet opgeblazen</strong><p>“Onze krachtige AI-oplossing maximaliseert je leerpotentieel.”</p></div></div>
        </div>
      </section>
    </div>
  );
}

export function ColorsPage() {
  return (
    <div className="momentum-page">
      <section className="momentum-panel">
        <div className="momentum-panel-heading"><div><span className="momentum-kicker">kleurrollen</span><h3>Dezelfde betekenis in twee lichtstanden.</h3></div></div>
        <div className="momentum-swatch-grid momentum-swatch-grid-wide">{CORE_SWATCHES.map((swatch) => <Swatch key={swatch.name} {...swatch} />)}</div>
        <div className="momentum-swatch-grid momentum-swatch-grid-wide momentum-supporting-swatches">{SUPPORTING_SWATCHES.map((swatch) => <Swatch key={swatch.name} {...swatch} />)}</div>
      </section>
      <section className="momentum-panel momentum-color-guidance">
        <div><span className="momentum-kicker">luminous moments</span><h3>Aurora is een accent, geen achtergrondruis.</h3></div>
        <div className="momentum-aurora-demo"><span>Vragen mag.</span><strong>Begin bij één onderwerp.</strong><Button>Vraag je coach <ArrowRight /></Button></div>
        <Guidelines items={[
          { kind: 'do', text: 'Gebruik emerald voor de primaire volgende stap en bevestigde voortgang.' },
          { kind: 'do', text: 'Gebruik violet of blauw lokaal: een geselecteerd vak, een discovery-moment, een bronlink.' },
          { kind: 'dont', text: 'Combineer niet alle aurorakleuren in één control of laat ze niet concurreren met de hoofdactie.' },
        ]} />
      </section>
    </div>
  );
}

export function FontsPage() {
  return (
    <div className="momentum-page">
      <section className="momentum-panel momentum-type-panel">
        <div className="momentum-panel-heading"><div><span className="momentum-kicker">type system</span><h3>Sora geeft richting. DM Sans geeft ruimte.</h3></div></div>
        {TYPE_SCALE.map((entry) => (
          <div className="momentum-type-row" key={entry.name}>
            <span>
              {entry.name}
              <small className="type-meta block text-muted-foreground">{entry.detail}</small>
            </span>
            <p className={entry.className}>{entry.sample}</p>
          </div>
        ))}
      </section>
      <div className="momentum-two-column">
        <section className="momentum-panel"><span className="momentum-kicker">families</span><h3>Sora / display</h3><p>Voor hero’s, resultaatkoppen en momenten waarop de learner voelt: ik snap waar ik heen ga.</p><div className="momentum-font-sample momentum-sora">Klaar voor de kern.</div></section>
        <section className="momentum-panel"><span className="momentum-kicker">families</span><h3>DM Sans / interface</h3><p>Voor navigatie, uitleg, formulieren en alles dat snel en rustig moet lezen.</p><div className="momentum-font-sample">Vertel waar je mee bezig bent.</div></section>
      </div>
      <section className="momentum-note-panel"><Info size={17} /><p><strong>DM Mono is bewijs, geen stem.</strong> Reserveer mono voor bronverwijzingen, statussen, stappen en technische herkomst. Niet voor lange lopende tekst.</p></section>
    </div>
  );
}

export function LayoutPage() {
  return (
    <div className="momentum-page">
      <section className="momentum-panel">
        <span className="momentum-kicker">layout rhythm</span><h3>Ruimte maakt de volgende stap zichtbaar.</h3>
        <p className="momentum-lead">Werk met een vier-pixel basis. Binnen controls blijft het compact; tussen gedachten en secties mag het ruim worden.</p>
        <div className="momentum-spacing-list">{SPACING_SCALE.map((space) => <div key={space.label}><span>{space.label}</span><i className={space.size} /></div>)}</div>
      </section>
      <div className="momentum-two-column">
        <section className="momentum-panel"><span className="momentum-kicker">containers</span><h3>12 kolommen, één focuslijn.</h3><p>Gebruik een max-width van 1180px op marketing- en leeroppervlakken. Op mobiel blijft 20–24px ademruimte over.</p><div className="momentum-grid-demo"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></section>
        <section className="momentum-panel"><span className="momentum-kicker">corners + depth</span><h3>Zachte randen. Geen zwevende dozen.</h3><div className="momentum-radius-demo"><i>sm</i><i>md</i><i>lg</i><i>xl</i></div><p>Gebruik borders om structuur te geven en elevation alleen voor een duidelijke laagwisseling: prompt, dialoog of actieve kaart.</p></section>
      </div>
      <section className="momentum-panel"><div className="momentum-panel-heading"><div><span className="momentum-kicker">responsive composition</span><h3>Van twee kolommen naar één rustige route.</h3></div></div><div className="momentum-responsive-demo"><div className="momentum-responsive-nav">geslaagd.app <span>Menu</span></div><div className="momentum-responsive-body"><div /><div><strong>Waar wil je grip op krijgen?</strong><p>Kies één onderwerp om te beginnen.</p><Button size="sm">Start <ArrowRight /></Button></div></div></div></section>
    </div>
  );
}

export function ContentGuidelinesPage() {
  return (
    <div className="momentum-page">
      <section className="momentum-panel momentum-copy-panel">
        <span className="momentum-kicker">content / Nederlands</span><h3>Schrijf alsof je naast iemand zit die vastloopt.</h3>
        <div className="momentum-copy-grid">
          <div><strong>Gebruik</strong><ul><li>korte, actieve zinnen</li><li>“grip”, “kern”, “volgende stap”</li><li>concrete leeruitkomst</li><li>bron en status dichtbij</li></ul></div>
          <div><strong>Vermijd</strong><ul><li>AI-jargon en superlatieven</li><li>feature-lijsten zonder gevolg</li><li>“optimaliseer je potentieel”</li><li>zekerheid beloven waar bewijs ontbreekt</li></ul></div>
        </div>
        <div className="momentum-copy-example"><span className="momentum-mono">COACH PROMPT</span><p>“Ik moet erfelijkheid begrijpen voor mijn toets.”</p><small>Goed: “We maken het onderwerp kleiner. Kies wat je eerst wilt begrijpen.”</small></div>
      </section>
      <section className="momentum-panel"><span className="momentum-kicker">state language</span><h3>Elke staat geeft een geruststellend antwoord.</h3><div className="momentum-state-list"><div><Badge variant="secondary">Laden</Badge><span>“We zetten je onderwerp klaar…”</span></div><div><Badge>Gereed</Badge><span>“Klaar om te leren.”</span></div><div><Badge variant="destructive">Actie nodig</Badge><span>“We missen nog één detail.”</span></div></div></section>
    </div>
  );
}

export function MotionPage() {
  return (
    <div className="momentum-page">
      <section className="momentum-panel momentum-motion-panel">
        <span className="momentum-kicker">motion / focused momentum</span><h3>Beweeg om aandacht te sturen, niet om te entertainen.</h3>
        <div className="momentum-motion-demo"><div className="momentum-motion-dot" /><div><strong>bron gecontroleerd</strong><span className="momentum-mono">status verandert in 240ms</span></div></div>
        <Guidelines items={[
          { kind: 'do', text: 'Gebruik transform en opacity voor korte reveals, hover-lifts en statusfeedback.' },
          { kind: 'do', text: 'Houd interacties onder 240ms; een pagina-overgang mag tot 400ms duren.' },
          { kind: 'dont', text: 'Laat geen essentiële informatie uitsluitend via beweging verschijnen.' },
          { kind: 'dont', text: 'Geen looping aurora of parallax in leerflows; het doel is concentratie.' },
        ]} />
      </section>
      <section className="momentum-note-panel"><ShieldCheck size={17} /><p><strong>Reduced motion is een volwaardige staat.</strong> Respecteer <code>prefers-reduced-motion: reduce</code>; zet reveals direct zichtbaar en schakel hover-transforms uit.</p></section>
    </div>
  );
}

export function AppliedExamplesPage() {
  return (
    <div className="momentum-page">
      <section className="momentum-applied-hero">
        <div><span className="momentum-kicker"><Sparkles size={14} /> applied / leeromgeving</span><h2>Van open tabbladen naar één volgende stap.</h2><p>Een samengesteld voorbeeld van de patronen voor homepage, coach, catalogus, auth en beheer.</p></div>
        <div className="momentum-progress-summary"><span className="momentum-mono">JOUW VOORTGANG</span><strong>3 van 5 onderwerpen</strong><Progress value={60} /></div>
      </section>
      <div className="momentum-applied-grid">
        <Card className="momentum-coach-card">
          <CardHeader><span className="momentum-kicker">STUDIECOACH</span><CardTitle>Vertel het in je eigen woorden.</CardTitle><CardDescription>We maken je vraag scherp en kiezen samen waar je begint.</CardDescription></CardHeader>
          <CardContent><div className="momentum-prompt-input"><Input placeholder="Waar wil je mee aan de slag?" aria-label="Waar wil je mee aan de slag?" /><Button size="icon" aria-label="Vraag de studiecoach"><ArrowRight /></Button></div><span className="momentum-hint">Bijv. “ik wil de rechtsstaat begrijpen”</span></CardContent>
        </Card>
        <Card className="momentum-source-card">
          <CardHeader><div className="momentum-card-line"><span className="momentum-kicker">RESULTAAT</span><Badge>klaar</Badge></div><CardTitle>De Nederlandse rechtsstaat</CardTitle><CardDescription>Samenvatting met 2 gecontroleerde bronnen.</CardDescription></CardHeader>
          <CardContent><div className="momentum-source-row"><Database size={16} /><div><strong>Rijksoverheid · Grondwet</strong><span className="momentum-mono">BRON 01 · GECONTROLEERD</span></div><CheckCircle2 size={17} /></div><div className="momentum-source-row"><Database size={16} /><div><strong>Examenprogramma</strong><span className="momentum-mono">BRON 02 · GECONTROLEERD</span></div><CheckCircle2 size={17} /></div></CardContent><CardFooter><Button variant="outline">Open studieplek <ArrowRight /></Button></CardFooter>
        </Card>
      </div>
      <section className="momentum-panel momentum-selection-panel"><div className="momentum-panel-heading"><div><span className="momentum-kicker">SELECTIE</span><h3>Kies wat bij je past.</h3></div></div><div className="momentum-choice-grid"><label className="momentum-choice active"><input type="radio" name="level" defaultChecked /><span><strong>6 VWO</strong><small>Ik werk richting mijn eindexamen.</small></span><CheckCircle2 /></label><label className="momentum-choice"><input type="radio" name="level" /><span><strong>Eerstejaars bachelor</strong><small>Ik wil onderwerpen uit mijn opleiding begrijpen.</small></span><Circle /></label></div></section>
      <section className="momentum-panel momentum-dialog-preview"><div><span className="momentum-kicker">DIALOG / AUTH</span><h3>Vertrouwen zit ook in de rand.</h3><p>Gebruik een dialog voor consequential actions, niet voor een gewone route. De primaire actie blijft helder; sluiten blijft altijd mogelijk.</p></div><div className="momentum-mini-dialog"><div className="momentum-dialog-icon"><ShieldCheck size={18} /></div><strong>Je leeromgeving bewaren?</strong><p>Maak een account zodat je onderwerpen en voortgang terugkomen.</p><div className="momentum-dialog-actions"><Button variant="outline" size="sm">Niet nu</Button><Button size="sm">Account maken</Button></div></div></section>
      <section className="momentum-panel momentum-admin-preview"><div className="momentum-card-line"><div><span className="momentum-kicker">BEHEER / SIGNALEN</span><h3>Zie wat aandacht nodig heeft.</h3></div><Badge variant="outline">3 open</Badge></div><div className="momentum-admin-list"><div><span className="momentum-status-dot" /><strong>Broncontrole wacht</strong><small>Rechtsstaat · 12 min geleden</small><Button variant="ghost" size="sm">Bekijk</Button></div><div><span className="momentum-status-dot amber" /><strong>Nieuwe catalogusvraag</strong><small>Biologie · vandaag</small><Button variant="ghost" size="sm">Bekijk</Button></div></div></section>
    </div>
  );
}