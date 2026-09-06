import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Check, Circle, FileSearch, MessageSquare, Search, Send, Sparkles, Users2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@workspace/geslaagd-momentum/components/ui/tabs';

type DemoMode = 'request' | 'learn' | 'together';

const MODES = [
  { value: 'request', label: 'Vak aanvragen', icon: Search },
  { value: 'learn', label: 'Leren met AI', icon: Sparkles },
  { value: 'together', label: 'Samen studeren', icon: Users2 },
] as const;

function RequestDemo() {
  return (
    <div className="product-demo-request">
      <div className="product-demo-card product-demo-card-main">
        <span className="product-demo-overline">Nieuw vak</span>
        <h3>Publiekrecht · Bachelor 1</h3>
        <p>Beschrijf wat je volgt. Geslaagd zoekt het curriculum, controleert de bronnen en maakt een voorstel.</p>
        <div className="product-demo-input"><Search size={15} /><span>Universiteit Utrecht · Rechtsgeleerdheid</span></div>
        <div className="product-demo-tags"><span>2026–2027</span><span>Nederlands</span><span>Bachelor</span></div>
      </div>
      <ol className="product-demo-timeline" aria-label="Voortgang vakaanvraag">
        <li className="is-done"><Check size={13} /><span><strong>Opleiding gevonden</strong><small>Officiële studiegids</small></span></li>
        <li className="is-active"><Sparkles size={13} /><span><strong>Curriculum controleren</strong><small>12 bronnen worden vergeleken</small></span></li>
        <li><Circle size={12} /><span><strong>Voorstel bekijken</strong><small>Jij houdt de controle</small></span></li>
      </ol>
    </div>
  );
}

function LearnDemo() {
  return (
    <div className="product-demo-learn">
      <aside>
        <span className="product-demo-overline">Staatsrecht</span>
        <strong>De Nederlandse rechtsstaat</strong>
        <nav><span className="is-active"><i>01</i> Grondrechten</span><span><i>02</i> Trias politica</span><span><i>03</i> Wetgeving</span></nav>
      </aside>
      <article>
        <div className="product-demo-article-head"><span>Samenvatting</span><span>6 min</span></div>
        <h3>Waarom macht verdeeld wordt</h3>
        <p>De rechtsstaat beschermt burgers door overheidsmacht te begrenzen en controleerbaar te maken.</p>
        <div className="product-demo-highlight"><Sparkles size={15}/><span><strong>Leg dit eenvoudiger uit</strong><small>AI gebruikt alleen de bronnen van dit hoofdstuk.</small></span></div>
        <div className="product-demo-sources"><FileSearch size={14}/><span>3 gecontroleerde bronnen</span><strong>Bekijk</strong></div>
      </article>
      <div className="product-demo-chat">
        <span className="product-demo-overline">Vraag Geslaagd AI</span>
        <div className="product-demo-bubble">Wat is het verschil tussen een klassiek en sociaal grondrecht?</div>
        <div className="product-demo-compose"><span>Stel een vervolgvraag…</span><Send size={14}/></div>
      </div>
    </div>
  );
}

function TogetherDemo() {
  return (
    <div className="product-demo-together">
      <div className="product-demo-people">
        <span className="product-demo-overline">Studiegroep · Staatsrecht</span>
        <div className="product-demo-avatar-row"><i>JM</i><i>SL</i><i>MK</i><span>3 online</span></div>
        <h3>Van twijfel naar antwoord, samen.</h3>
        <p>Deel een hoofdstuk, vergelijk uitleg en plan een gezamenlijke oefensessie zonder de app te verlaten.</p>
      </div>
      <div className="product-demo-thread">
        <div><i>SL</i><p><strong>Sophie</strong><span>Ik snap vraag 4 nog niet helemaal.</span></p></div>
        <div><i>JM</i><p><strong>Jij</strong><span>Ik stuur de uitleg uit hoofdstuk 2 even.</span></p></div>
        <div className="product-demo-share"><BookOpen size={15}/><span><strong>Trias politica</strong><small>Gedeeld vanuit Geslaagd</small></span></div>
        <div className="product-demo-compose"><MessageSquare size={14}/><span>Schrijf een bericht…</span><Send size={14}/></div>
      </div>
    </div>
  );
}

export function LearningDemo() {
  const [mode, setMode] = useState<DemoMode>('learn');
  return (
    <div className="product-demo" data-testid="interactive-product-demo">
      <div className="product-demo-toolbar">
        <div className="product-demo-brand"><span className="wordmark-mark"/><span>geslaagd.app</span></div>
        <Tabs value={mode} onValueChange={(value) => setMode(value as DemoMode)}>
          <TabsList className="product-demo-tabs" aria-label="Bekijk productonderdelen">
            {MODES.map(({ value, label, icon: Icon }) => <TabsTrigger value={value} key={value}><Icon size={14}/><span>{label}</span></TabsTrigger>)}
          </TabsList>
        </Tabs>
        <span className="product-demo-status"><i/> Live producttour</span>
      </div>
      <div className="product-demo-stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={mode} initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
            {mode === 'request' && <RequestDemo />}
            {mode === 'learn' && <LearnDemo />}
            {mode === 'together' && <TogetherDemo />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
