import { type MouseEvent, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, ArrowUpRight, BookOpenCheck, BrainCircuit, Check, FileCheck2, Menu, MessageCircleMore, Sparkles, X } from 'lucide-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { useSurfaceTheme } from '@workspace/geslaagd-momentum/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { LearningDemo } from '@/components/marketing/learning-demo';

const FLOW = [
  { number: '01', title: 'Vraag je vak aan', body: 'Kies je opleiding, niveau en studiejaar. Jij controleert het voorstel voordat het wordt opgebouwd.' },
  { number: '02', title: 'Leer vanuit betrouwbare context', body: 'Elk hoofdstuk verbindt uitleg, bronnen, begrippen, oefenvragen en AI in één werkruimte.' },
  { number: '03', title: 'Oefen tot het blijft hangen', body: 'Van een korte quiz tot een proeftentamen; afgestemd op de stof die jij daadwerkelijk leert.' },
] as const;

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  useSurfaceTheme('light');

  const go = (path: string) => { setIsMenuOpen(false); setLocation(path); };
  const start = () => go(user ? '/mijn-leeromgeving' : '/auth');
  const jumpTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    setIsMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  };
  const leave = async () => { await signOut(); go('/'); };

  return (
    <div className="site-shell marketing-v2">
      <header className="site-header marketing-header">
        <div className="nav-wrap">
          <a className="wordmark" href="#top" data-testid="link-logo"><span className="wordmark-mark"/><span>geslaagd.app</span></a>
          <nav className="nav-links" aria-label="Hoofdnavigatie">
            <a href="#product" onClick={(event) => jumpTo(event, 'product')}>Product</a>
            <a href="#werking" onClick={(event) => jumpTo(event, 'werking')} data-testid="link-werking">Zo werkt het</a>
            <a href="#principes" onClick={(event) => jumpTo(event, 'principes')}>Waarom Geslaagd</a>
            <a href="/faq" onClick={(event) => { event.preventDefault(); go('/faq'); }} data-testid="link-faq">FAQ</a>
          </nav>
          <div className="nav-actions">
            {user ? <>{isAdmin && <button className="nav-login" onClick={() => go('/beheer')}>Beheer</button>}<button className="nav-login" onClick={() => void leave()}>Uitloggen</button><button className="button-primary" onClick={() => go('/mijn-leeromgeving')} data-testid="button-dashboard-nav">Open app <ArrowUpRight size={14}/></button></> : <><button className="nav-login" onClick={() => go('/auth')} data-testid="button-login-nav">Inloggen</button><button className="button-primary" onClick={() => go('/auth')} data-testid="button-start-nav">Probeer gratis <ArrowUpRight size={14}/></button></>}
            <button className="mobile-menu-toggle" onClick={() => setIsMenuOpen((open) => !open)} aria-label={isMenuOpen ? 'Menu sluiten' : 'Menu openen'} data-testid="button-menu">{isMenuOpen ? <X size={19}/> : <Menu size={19}/>}</button>
          </div>
        </div>
        {isMenuOpen && <div className="mobile-menu" data-testid="menu-mobile"><a href="#product" onClick={(event) => jumpTo(event, 'product')}>Product</a><a href="#werking" onClick={(event) => jumpTo(event, 'werking')}>Zo werkt het</a><a href="#principes" onClick={(event) => jumpTo(event, 'principes')}>Waarom Geslaagd</a><button onClick={start}>{user ? 'Open app' : 'Probeer gratis'}</button></div>}
      </header>

      <main id="top">
        <section className="marketing-hero">
          <div className="marketing-hero-glow" aria-hidden="true"/>
          <div className="section-wrap marketing-hero-inner">
            <p className="marketing-announcement"><Sparkles size={14}/><span>Jouw lesstof. Betrouwbare bronnen. Eén AI-studieplek.</span><ArrowRight size={14}/></p>
            <h1>Van “waar begin ik?”<br/><span>naar klaar voor je tentamen.</span></h1>
            <p className="marketing-hero-copy">Vraag je eigen vak aan en krijg een persoonlijke leeromgeving met samenvattingen, brongebonden AI, oefeningen en studenten die hetzelfde leren.</p>
            <div className="marketing-hero-actions"><Button size="lg" onClick={start} data-testid="button-start-hero">{user ? 'Open mijn leeromgeving' : 'Bouw mijn leeromgeving'} <ArrowUpRight size={16}/></Button><a href="#product" onClick={(event) => jumpTo(event, 'product')}>Bekijk het product <ArrowRight size={15}/></a></div>
            <div className="marketing-proofline" aria-label="Belangrijkste eigenschappen"><span><Check size={13}/> Zonder ruis</span><span><Check size={13}/> Met controleerbare bronnen</span><span><Check size={13}/> Gebouwd voor studenten</span></div>
          </div>
        </section>

        <section className="marketing-product" id="product">
          <div className="section-wrap">
            <div className="marketing-section-intro marketing-section-intro-centered"><span>Dit is je nieuwe studieflow</span><h2>Niet nog een chatbot.<br/>Een plek waar je echt leert.</h2><p>Klik door de producttour. Elke stap hoort bij dezelfde vakinhoud, zodat context niet verdwijnt zodra je van samenvatting naar oefening of gesprek gaat.</p></div>
            <LearningDemo />
          </div>
        </section>

        <section className="marketing-flow" id="werking">
          <div className="section-wrap marketing-flow-layout">
            <div className="marketing-flow-copy"><span>Van aanvraag tot voldoende</span><h2>Eén doorlopende lijn door je vak.</h2><p>Linear maakt werk zichtbaar als een systeem. Geslaagd doet hetzelfde voor studeren: iedere stap bouwt voort op de vorige.</p></div>
            <ol className="marketing-flow-list">{FLOW.map((item) => <li key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></li>)}</ol>
          </div>
        </section>

        <section className="marketing-bento" id="principes">
          <div className="section-wrap">
            <div className="marketing-section-intro"><span>Ontworpen rond vertrouwen</span><h2>AI mag snel zijn.<br/>Jij moet kunnen controleren.</h2></div>
            <div className="marketing-bento-grid">
              <article className="marketing-bento-source"><div className="marketing-bento-icon"><FileCheck2 size={20}/></div><span>Bronnen blijven zichtbaar</span><h3>Een antwoord zonder herkomst is geen studiemateriaal.</h3><p>Uitleg, kernpunten en vragen blijven gekoppeld aan de bronnen van jouw hoofdstuk.</p><div className="marketing-source-stack" aria-hidden="true"><div><i>01</i><span><strong>Officiële studiegids</strong><small>Curriculum en leerdoelen</small></span><b>geverifieerd</b></div><div><i>02</i><span><strong>Rijksoverheid</strong><small>Primaire vakinhoud</small></span><b>geverifieerd</b></div><div><i>03</i><span><strong>Open textbook</strong><small>Aanvullende uitleg</small></span><b>geverifieerd</b></div></div></article>
              <article className="marketing-bento-ai"><div className="marketing-bento-icon"><BrainCircuit size={20}/></div><span>AI met vakcontext</span><h3>Vraag door zonder opnieuw uit te leggen waar je bent.</h3><div className="marketing-orbit" aria-hidden="true"><Sparkles/><i/><i/><i/></div></article>
              <article className="marketing-bento-social"><div className="marketing-bento-icon"><MessageCircleMore size={20}/></div><span>Samen studeren</span><h3>Vind studenten met hetzelfde vak.</h3><p>Start een gesprek vanuit de leerstof, niet vanuit een lege groepschat.</p><div className="marketing-avatar-stack"><i>JM</i><i>SL</i><i>RK</i><i>+8</i></div></article>
              <article className="marketing-bento-practice"><div className="marketing-bento-icon"><BookOpenCheck size={20}/></div><span>Actief oefenen</span><h3>Van lezen naar ophalen.</h3><div className="marketing-answer-bars" aria-hidden="true"><i/><i/><i/><i/></div></article>
            </div>
          </div>
        </section>

        <section className="marketing-final"><div className="section-wrap marketing-final-panel"><div><span>Je volgende studiesessie begint hier</span><h2>Maak van veel stof<br/>een haalbare volgende stap.</h2></div><Button size="lg" onClick={start} data-testid="button-start-cta">{user ? 'Ga verder met leren' : 'Maak mijn leeromgeving'} <ArrowUpRight size={16}/></Button></div><p>Gebouwd door een student, voor studenten. Een eventuele bijdrage gaat naar hosting en ontwikkeling.</p></section>
      </main>

      <footer className="footer marketing-footer"><div className="footer-wrap"><a className="wordmark" href="#top"><span className="wordmark-mark"/><span>geslaagd.app</span></a><small>De kern vinden. Verder leren.</small><div className="footer-meta"><a href="/faq" onClick={(event) => { event.preventDefault(); go('/faq'); }}>FAQ</a><span>© 2026</span></div></div></footer>
    </div>
  );
}
