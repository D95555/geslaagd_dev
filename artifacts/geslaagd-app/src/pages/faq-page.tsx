import { useLocation } from 'wouter';
import { LifeBuoy } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@workspace/geslaagd-momentum/components/ui/accordion';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { PublicHeader } from '@/components/shell/public-header';

/**
 * Static, hand-written answers to the questions that come up most often. This
 * is the first stop before a support ticket now that the AI auto-reply is
 * gone — a real knowledge base rather than a chatbot pretending to know the
 * product. Keep answers short and honest; when something genuinely needs a
 * human, the closing card points at a ticket.
 */
type QA = { q: string; a: string };
type FaqSection = { title: string; items: QA[] };

const SECTIONS: FaqSection[] = [
  {
    title: 'Account & toegang',
    items: [
      {
        q: 'Ik heb een activatiecode nodig. Hoe kom ik daaraan?',
        a: 'geslaagd.app is een project voor en door studenten, geen open dienst. Om een account te maken heb je een persoonlijke activatiecode nodig. Die worden uitgegeven aan medestudenten die de maker kent. Heb je er een gekregen, vul hem dan in op het aanmeldscherm.',
      },
      {
        q: 'Ik krijg geen e-mail om mijn wachtwoord te resetten.',
        a: 'Controleer eerst je spam- of ongewenste-mailmap en of je het juiste e-mailadres gebruikt. Wacht daarna een paar minuten en vraag de resetmail opnieuw aan. Blijft het misgaan, open dan een ticket — een beheerder kan je account nakijken.',
      },
      {
        q: 'Kan ik op meerdere apparaten inloggen?',
        a: 'Ja. Je kunt op je laptop, telefoon en tablet tegelijk ingelogd zijn. Je actieve sessies zijn zichtbaar en je kunt ze zelf beëindigen.',
      },
    ],
  },
  {
    title: 'Vakken aanvragen',
    items: [
      {
        q: 'Hoe vraag ik een nieuw vak aan?',
        a: 'Ga naar Vakken en kies "vak aanvragen". Geef een naam, niveau, een korte beschrijving en waar de nadruk op ligt. Het systeem controleert automatisch of het haalbaar is en bouwt daarna hoofdstuk voor hoofdstuk het studiemateriaal op.',
      },
      {
        q: 'Wat betekenen de niveaus 300, 600 en 800?',
        a: 'Ze bepalen hoe diep er naar bronnen wordt gezocht. 300 is voor een klein of algemeen vak, 600 voor een groot vak of een specialistisch onderwerp, en 800 voor een niche-onderwerp dat echt diepgaand onderzoek vereist — dan wordt er zo volledig mogelijk gezocht.',
      },
      {
        q: 'Mijn aanvraag kreeg "aanpassing gevraagd". Wat moet ik doen?',
        a: 'Meestal past het gekozen niveau niet bij de omvang van het onderwerp (te ruim of te krap). Lees de toelichting bij je aanvraag en pas het aan; daarna kan hij opnieuw beoordeeld worden.',
      },
      {
        q: 'Hoe lang duurt het voordat een vak klaar is?',
        a: 'Dat hangt af van de omvang — van een paar minuten tot ongeveer een uur. Je kunt de voortgang per hoofdstuk volgen; hoofdstukken worden vrijgegeven zodra hun materiaal klaar is.',
      },
      {
        q: 'Waarom staat een hoofdstuk op slot?',
        a: 'Dan is het studiemateriaal nog in de maak, of ontbreekt er nog een goedgekeurde bron voor dat hoofdstuk. Zodra dat rond is, gaat het slot er vanzelf af.',
      },
    ],
  },
  {
    title: 'Studiemateriaal',
    items: [
      {
        q: 'Waar komt het studiemateriaal vandaan?',
        a: 'Het systeem zoekt betrouwbare bronnen — universitaire publicaties, boeken en wetenschappelijke artikelen — beoordeelt ze op kwaliteit, en stelt daaruit samenvattingen, kernpunten, oefenvragen en (voor belangrijke hoofdstukken) tentamens samen.',
      },
      {
        q: 'Hoe actueel zijn de bronnen?',
        a: 'Bij elk vak zie je wanneer de bronnen voor het laatst zijn gecontroleerd. Is dat lang geleden, dan kun je een verversing aanvragen zodat er opnieuw en aanvullend wordt gezocht en het materiaal wordt bijgewerkt.',
      },
      {
        q: 'Ik denk dat er iets niet klopt in het materiaal.',
        a: 'Open een ticket en vermeld het vak, het hoofdstuk en wat er volgens jou niet klopt. Zo kan het nagekeken en verbeterd worden.',
      },
    ],
  },
  {
    title: 'Credits & pakketten',
    items: [
      {
        q: 'Wat zijn credits en waarvoor betaal ik ze?',
        a: 'Een nieuw vak aanmaken kost 10 credits (dat zet een hele zoek- en schrijfpijplijn in gang), en een bestaand vak voor het eerst gebruiken kost 5 credits. Daarna is dat vak voorgoed van jou — geen herhaalde kosten om het opnieuw te openen.',
      },
      {
        q: 'Welke pakketten zijn er?',
        a: 'Trial (10 credits om te proeven, geen nieuwe vakken aan te maken), Basis (30 credits om te beginnen, +10 per maand), en Plus (60 om te beginnen, +25 per maand). Beheerders hebben onbeperkt.',
      },
      {
        q: 'Ik zit op Trial. Hoe kom ik op Basis of Plus?',
        a: 'Open een supportticket en laat weten dat je studeert (welke instelling, welke studie). Een beheerder kan je dan een activatiecode geven voor Basis of Plus.',
      },
      {
        q: 'Ik heb al een activatiecode. Hoe upgrade ik daarmee?',
        a: 'Ga naar "Mijn account" en vul de code in bij "Upgrade-code". Dit kan alleen naar een hoger pakket dan je huidige — niet naar hetzelfde of een lager pakket.',
      },
      {
        q: 'Kan ik maar een beperkt aantal nieuwe vakken per maand aanmaken?',
        a: 'Ja, maximaal 3 nieuwe vakken per rollende maand (niet per kalendermaand) voor niet-beheerders. Bestaande vakken gebruiken telt hier niet in mee.',
      },
    ],
  },
  {
    title: 'Bijdrage',
    items: [
      {
        q: 'Kost geslaagd.app geld?',
        a: 'geslaagd.app is een project, geen bedrijf — gemaakt voor en door studenten. Er zit geen winstoogmerk achter; het creditsysteem bestaat om misbruik en te hoge serverkosten te voorkomen, niet om winst te maken.',
      },
    ],
  },
];

export default function FaqPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="site-shell">
      <PublicHeader />
      <main>
        <section className="admin-content faq-page section-wrap">
          <div className="admin-content-head">
            <div>
              <h1>Veelgestelde vragen</h1>
              <p>De vragen die het vaakst voorbijkomen. Staat je vraag er niet bij? Open dan een ticket.</p>
            </div>
          </div>

          {SECTIONS.map((section) => (
            <div key={section.title} className="faq-section">
              <h2>{section.title}</h2>
              <Accordion type="single" collapsible className="faq-accordion">
                {section.items.map((item, index) => (
                  <AccordionItem key={item.q} value={`${section.title}-${index}`}>
                    <AccordionTrigger>{item.q}</AccordionTrigger>
                    <AccordionContent>{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}

          <div className="faq-cta">
            <LifeBuoy size={20} aria-hidden="true" />
            <div>
              <strong>Vraag er niet bij?</strong>
              <span>Open een ticket, dan kijkt een beheerder ernaar.</span>
            </div>
            <Button onClick={() => setLocation('/support')}>Naar support</Button>
          </div>
        </section>
      </main>
    </div>
  );
}
