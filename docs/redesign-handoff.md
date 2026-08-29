# Overdracht: herontwerp geslaagd.app

Dit document is geschreven voor een Claude-sessie die dit werk overneemt zonder
de voorgaande conversatie te kennen. Lees dit eerst, in zijn geheel, voordat je
iets aanraakt. Branch: `claude/repo-replit-sync-vgwk3g`.

## Waar dit vandaan komt

De opdracht begon als "verbeter de UI/UX van de admin-pagina's" en groeide uit
tot een volledig herontwerp van de site, na twee afgekeurde pogingen. Dat is
belangrijk om te weten, want het verklaart waarom sommige keuzes zijn zoals ze
zijn:

1. **Eerste poging** (admin-pagina's): functionele verbeteringen — een gedeeld
   detail-paneel, een live-taakindicator, een terminal-achtige console. Werkte,
   maar was geen visuele vernieuwing.
2. **Tweede poging**: ik verving de design-tokens (typografie, kleur, donker
   thema) maar liet de *structuur* van elke pagina intact — kop bovenaan, dan
   een stapel volle-breedte rijen. De gebruiker keurde dit expliciet af: *"Er
   is letterlijk niks veranderd behalve de kleur, ik wil een andere layout,
   andere components enz.!"* Dat was terecht: het was een herkleuring, geen
   herontwerp.
3. **Derde poging** (waar dit document over gaat): op verzoek van de gebruiker
   heb ik drie fundamenteel verschillende layout-richtingen als HTML-mockup
   gepitcht (Notion-achtige "werkbank" met permanente zijbalk, een
   bento-dashboard, en een lineair "traject"). De gebruiker koos **richting A
   (de werkbank)**, met Notion/Linear als structuurvoorbeeld en Firecrawl
   (firecrawl.dev) als afwerkingsniveau — vlak, haarlijnen, precisie, subtiel
   rasterpatroon.

Het volledige, door de gebruiker goedgekeurde plan staat hieronder verbatim.
Er bestaat ook een lokale kopie op `~/.claude/plans/de-console-is-goed-vivid-sunrise.md`
in de omgeving waar dit is geschreven — die kopie reist **niet** mee naar een
nieuwe sessie/omgeving, vandaar dat de volledige tekst hier staat.

## Vastgestelde richting (uit gesprek met de gebruiker, via expliciete keuzes)

| Vraag | Antwoord |
|---|---|
| UI-kit | shadcn/ui behouden + gratis registries erbij (Origin UI, Magic UI) |
| Layout | **A — werkbank**: permanente zijbalk, middenpaneel, contextkolom |
| Voorbeeld | Notion/Linear voor structuur, Firecrawl voor afwerking (ook in de app, niet alleen marketing) |
| Dichtheid | Compacte chrome (zijbalk/navigatie), ruim leesgebied (samenvattingen/uitleg) |
| Toetsenbord | **Volledig toetsenbord-eerst**: Cmd+K, Cmd+B, j/k, markeren, `?` |
| Beheer | Mee naar dezelfde schil als de studentomgeving |
| Thema | ~~Donker voor studie + beheer, licht voor marketing~~ **Herzien, zie hieronder: licht + paars/wit overal, geen donker thema meer in gebruik.** |
| Proefpagina/goedkeuring | Fase D (pagina's als inhoud) — **twee feedbackrondes verwerkt (zie hieronder), nog niet definitief goedgekeurd.** |

### Eerste visuele feedbackronde (na fase D's eerste twee pagina's, in Replit)

De gebruiker heeft het in Replit bekeken en vier dingen expliciet afgekeurd/
gewijzigd — dit **overschrijft** de eerdere thema-keuze uit de tabel hierboven:

1. **Rasterachtergrond weg.** `.grid-ground` (het fijne 24px-lijnenpatroon
   onder de schil, `app-shell.tsx`) vond de gebruiker niet mooi. Verwijderd:
   de class-toepassing én de nu ongebruikte CSS-regel in `index.css`.
2. **Donker groen/zwart thema weg — licht + paars/wit, overal.** De
   gebruiker noemde het "geeky". `ShellSurface` riep `useSurfaceTheme('dark')`
   aan; dat is nu `useSurfaceTheme('light')`. Omdat er maar één licht-palet
   bestaat (gedeeld met marketing, dat al licht was maar groen-getint), is
   het **hele licht-palet** in `geslaagd-momentum/tokens.json` herzien naar
   wit/bijna-wit oppervlakken met een paars (`#6d28d9`) primair —
   `pnpm run build-tokens` (draait ook automatisch in `pretypecheck`)
   genereert daaruit `index.css`/`tokens.tsx`/`favicon.svg` opnieuw. Dit is dus
   een **merk-brede** kleurwijziging, niet alleen studie/beheer — marketing
   verandert mee van groen naar paars. Alle 12 semantische paren zijn
   opnieuw met de hand gecontroleerd tegen WCAG AA vóór het genereren (zie
   `check-contrast.mjs`); allemaal ruim boven 4.5:1 (5.2–17:1). Het donkere
   bos/emerald-palet in `tokens.json` is **niet verwijderd** — niets
   gebruikt het meer, maar het theme-systeem (`useSurfaceTheme`) ondersteunt
   nog gewoon beide, mocht een donker-thema-toggle ooit terugkomen.
3. **Ruwe markdown werd als platte tekst getoond — echte bug, geen
   ontwerpkeuze.** `CitedText` (`components/study/citation-tag.tsx`, gebruikt
   in zowel hoofdstuksamenvattingen als chatberichten) deed nooit meer dan
   op `[Bron X]`-markers splitsen; het AI-gegenereerde Markdown (`##`,
   `**vet**`, tabellen) kwam letterlijk op het scherm terecht. Verklaart een
   groot deel van "tekst past niet/loopt uit". Opgelost met `react-markdown`
   + `remark-gfm` (nieuwe dependencies in `geslaagd-app`): `[Bron X]` wordt
   vóór het renderen omgezet naar een markdown-link met een eigen
   `geslaagd-citation:`-schema, en een custom `a`-component in de
   `components`-prop onderschept die en rendert 'm als de bekende
   citatie-knop (niet-schema-links worden gewoon externe links). Tabellen
   krijgen een eigen `overflow-x: auto`-wrapper zodat een brede tabel niet de
   hele leeskolom breder duwt. Bijbehorende CSS voor koppen/lijsten/tabellen/
   code binnen `.cited-text` toegevoegd in `index.css`.
4. **Hoofdstukrijen (`.chapter-row`, `chapter-list.tsx`) gemoderniseerd.**
   Rond icoon-badge in plaats van los glyph (paars-getint accentkleurtje
   zodra een hoofdstuk beschikbaar is), titel nu op de heading3-stijl
   (Sora-lettertype) in plaats van gewone body-tekst, hover geeft een zachte
   paarse accent-wash in plaats van grijs.

**Nog niet opnieuw visueel bekeken na deze ronde.** Geverifieerd met
`pnpm typecheck` (root, inclusief de contrastpoort) en
`PORT=5173 BASE_PATH=/ pnpm build`. Zie "Hoe visueel te verifiëren" onderaan.

### Tweede feedbackronde: grondige controle na screenshots

De gebruiker heeft opnieuw gekeken (na sync) en met screenshots drie
concrete problemen aangewezen: tekst die "te groot"/rommelig oogt op de
vak-pagina, te weinig contrast, en niet-gecentreerde hoofdstuk-iconen —met
de expliciete vraag om **grondig alles na te lopen** vóórdat verder gegaan
wordt. Omdat schatten op basis van een screenshot al één keer een bug had
gemist (de `dl`-layout in de rail, precies het risico dat in de vorige ronde
al benoemd was), is dit keer **empirisch getest**: de gecompileerde CSS-bundle
plus een losse HTML-reproductie van de exacte DOM-structuur, gerenderd en
gescreenshot met Playwright/Chromium in deze sandbox (dat werkt prima voor
statische opmaak — het is specifiek de *live Supabase-verbinding* die hier
niet werkt, niet Chromium zelf). Dat leverde vier bevestigde, concrete bugs
op, elk met een screenshot-voor/na geverifieerde fix:

1. **De rail-tekst was echt kapot, niet alleen "weinig contrast".**
   `.review-plan li`/`.weakness-card li` waren een flex-rij met de titel
   links en een `flex-shrink: 0`-blok (badge + knop) rechts — prima in de
   brede hoofdkolom waar dit vandaan kwam, maar in de 280px-rail duwde het
   niet-krimpende actieblok de titel terug tot een reepje van ~40px, waarna
   Chromium woord-voor-woord (soms letter-voor-letter) ellipsissen ging
   toevoegen. Reproduceerbaar gemaakt, en opgelost door de rij te laten
   stapelen (`flex-direction: column`) in plaats van naast elkaar te zetten —
   werkt daardoor sowieso op elke breedte, dus ook op de bredere
   `study-plan-page.tsx` waar `ReviewPlan` ook nog wordt gebruikt.
2. **`.cited-text ul`/`ol` toonden geen bullets/nummers.** Tailwind's eigen
   preflight-reset (`ol, ul { list-style: none }`, onderdeel van
   `@import "tailwindcss"`) gold ook voor markdown-lijsten in
   hoofdstuksamenvattingen — ze zagen er daardoor uit als losse, niet-
   ingesprongen alinea's zonder duidelijke lijst-structuur, wat een groot deel
   van het "rommelige/te grote tekst"-gevoel verklaart bij content met veel
   opsommingen. Hersteld met expliciete `list-style: disc`/`decimal`.
3. **`.key-notes dl`** (kernpunten/formules) zette label en waarde naast
   elkaar met `justify-content: space-between` — bij een korte term en een
   lange definitie in de smalle rail oogde dat gedrongen. Nu gestapeld:
   label boven, waarde eronder — consistenter met de rest van de rail-kaarten
   en leesbaarder bij lange definities.
4. **`.chapter-icon svg`** (het ronde icoon-badge uit de vorige ronde) miste
   `display: block`, waardoor de inline-SVG zijn standaard baseline-uitlijning
   behield en net niet perfect gecentreerd oogde binnen de cirkel.
5. **Sidebar: `SidebarMenuBadge` met de tekst "Tentamen"** overlapte de
   hoofdstuktitel in de compacte zijbalk. De primitive positioneert deze badge
   `absolute right-1` — bedoeld voor een korte teller (bijv. "3"), niet voor
   een woord van 7 tekens naast een titel die zelf al de volle breedte
   gebruikt. Er is geen automatische ruimte-reservering voor deze combinatie.
   Verwijderd uit de zijbalk (stond al **wél** correct, niet-overlappend, in
   de rijkere `ChapterList` in het middenpaneel — dat blijft de plek waar dit
   zichtbaar is).
6. **`mutedForeground` verdiept** (`#6b6178` → `#5c5368`) voor meer marge
   boven de WCAG-AA-ondergrens: deze kleur wordt op tekst tot 12px gebruikt
   (badges, tijdstempels, hoofdstukpercentages), waar een ratio net boven
   4.5:1 nog dun aanvoelt. Alle 12 gate-paren opnieuw gecontroleerd na de
   wijziging (blijven ruim boven 4.5:1).

Los hiervan: de eigenlijke `--text-body-long-size` (17px) is **niet**
verkleind — na de screenshot-analyse leek de gebruikers "te grote tekst"-
klacht vooral te komen van de kapotte lijst-opmaak en de rail-ramp (punt 1+2
hierboven), niet van de letterlijke lettergrootte, en die is bovendien een
bewuste fase-A-keuze. Als het na deze fixes nog steeds te groot aanvoelt,
is dat de eerstvolgende kandidaat om aan te passen.

**Methode voor een volgende sessie:** een geïsoleerde HTML-reproductie
(compiled CSS uit `dist/public/assets/*.css` + handgeschreven markup met
dezelfde classNamen) via Playwright renderen en screenshotten, in plaats van
puur op basis van een screenshot-beschrijving te redeneren over CSS-gedrag —
dat is deze keer wat de fix van de vorige ronde miste.

### Derde feedbackronde: hoofdstukkenlijst helemaal opnieuw ontworpen

De gebruiker stuurde een **mobiele** screenshot met een duidelijke paarse
"bubbel" achter elke hoofdstuktitel, en vroeg expliciet om **geen
bugfix maar een echt nieuw ontwerp** van de hoofdstukkenlijst — niet het
oude patroon (los omrand kaartje per hoofdstuk) met een paar aanpassingen.

**Het nieuwe ontwerp** (`components/study/chapter-list.tsx` +
`.chapter-list`/`.chapter-row`/... in `index.css`): één samenhangende lijst
met haarlijnen tussen rijen in plaats van N los omrande kaartjes — dit is
feitelijk ook een correctie richting de al eerder afgesproken Linear/
Firecrawl-taal ("haarlijnen, geen dozen"), die de vorige twee ronden nooit
consequent is doorgevoerd voor dit onderdeel. Elke rij: een tweecijferig
volgnummer in mono-lettertype (i.p.v. een icoon-in-cirkel), titel +
eventuele "Tentamen"-badge op één regel die kan wrappen, een op-één-regel-
geknipte beschrijving (`-webkit-line-clamp`, niet `nowrap`+ellipsis — werkt
betrouwbaar ongeacht de uiteindelijke kolombreedte), en status-icoon +
percentage rechts. Mobile-first opgebouwd met CSS Grid
(`grid-template-columns: auto 1fr auto`) en een `@media (max-width: 30rem)`
die de status-kolom naar een eigen rij onder de titel verplaatst in plaats
van 'm in een derde, te smalle kolom te proppen — er was voorheen **geen
enkele** mobiele aanpassing voor dit component.

**De paarse bubbel-bug, gevonden en opgelost.** Empirisch gereproduceerd
(zelfde Playwright-methode als de vorige ronde) en teruggeleid naar een
**losstaande, uit een oudere/verwijderde catalogus-zoekresultaten-opzet
overgebleven regel** in `index.css`:
`.catalog-search-results button > span, .chapter-list button > span { ... border-radius: 999px; background: hsl(var(--muted)); ... }`.
Deze generieke regel raakte élke kale `<span>` die rechtstreeks in een
`<button>` binnen `.chapter-list` zit — met de oude markup toevallig
onschadelijk (de specifieke classNamen wonnen toen het conflict), maar met
de nieuwe markup (drie directe span-kinderen: index/main/status) kreeg ook
de span met titel+beschrijving een paars pil-uiterlijk. **Tweede vondst bij
het uitpluizen ervan:** een volledig aparte, losstaande `.chapter-list {
display: grid; padding: 18px; background: ... }`-regel verderop in
hetzelfde dode blok, die stilzwijgend `display` en padding overschreef.
`.catalog-search-results` en `.recent-list` zelf blijken **nergens meer in
een `.tsx`-bestand voor te komen** — volledig dode CSS, niet door deze
sessie veroorzaakt. Alleen `.chapter-list` is uit die selectors verwijderd
(het heeft nu zijn eigen complete regelset); de rest van dat dode blok is
laten staan (niet mijn wijziging die het onbruikt maakte, dus niet
eigenhandig verwijderd — zie CLAUDE.md-afspraak "vraag het eerst").
Ook `.chapter-meta` in een gedeelde `@media`-blok (regel ~1249, een
override voor een classname die niet meer bestaat sinds de vorige ronde)
was hierdoor zichtbaar geworden en is verwijderd.

Geverifieerd met `pnpm typecheck` (contrastpoort inbegrepen),
`PORT=5173 BASE_PATH=/ pnpm build`, én — ditmaal vooraf, niet achteraf —
Playwright-screenshots op **zowel 900px (desktop) als 390px (mobiel,
iPhone-breedte)**, beide zonder de bubbel-bug en met een correct
reflowende status-rij op mobiel.

**Nog te overwegen, niet gedaan:** dezelfde "los dood CSS-blok"-controle
voor andere componenten is niet systematisch uitgevoerd — als iets ergens
anders onverklaarbaar oogt, is een losstaande verdwaalde regel (zoals hier
tweemaal het geval was) een reële eerste verdachte.

### Richting: laptop-first, geen mobile-first ontwerp

De gebruiker heeft expliciet gecorrigeerd: **geslaagd.app is gericht op
laptop-gebruikers, niet op mobiel.** Dit overschrijft geen eerdere
afspraak (mobiel werd nooit expliciet gekozen), maar is voortaan leidend:

- Ontwerp en visuele verificatie richten zich primair op laptop/desktop-
  breedtes. Niet meer standaard op telefoonbreedte (bijv. 390px)
  screenshotten of daarvoor optimaliseren, tenzij expliciet gevraagd.
- Smalle-scherm `@media`-regels die puur als vangnet dienen voor een
  **niet-gemaximaliseerd laptop-browservenster** (bijv. de
  `@media (max-width: 30rem)` in `.chapter-row`, of
  `@media (max-width: 900px)` op de nieuwe homepage) mogen blijven staan —
  dat is geen "mobiel ontwerp", maar dekt een laptop-randgeval dat al
  eerder een echte bug veroorzaakte (zie "Hoe visueel te verifiëren",
  punt 4: een eerdere ronde had een afgesneden zijbalk op een
  niet-gemaximaliseerd venster). Geen extra moeite hoeft gestoken te worden
  in verdere mobiele polish daarbovenop.

### Vierde feedbackronde: herhaalplan-tags + homepage helemaal opnieuw

Twee afzonderlijke verzoeken in één bericht: een kleine restformatterings-
fix, en een volledige herontwerp van de homepage met vier naamgenoemde
referentiesites (Attio, Firecrawl, Zapier, Linear.ai) als inspiratie.

**Herhaalplan-tags (`components/study/review-plan.tsx`).** De
onderwerp-tags per taak waren één samengevoegde string
(`topicTags.join(' · ')`) in een blok-`<span>`. In de smalle rail-context
wrapte die string midden in een woord af (bijv. "geneesmiddelenclassific"
afgekapt), onleesbaar. Vervangen door losse chips in een
`flex-wrap`-rij (`.review-plan-tags`) — elke tag wrapt nu als geheel naar
de volgende regel in plaats van een lange string die overal kan afbreken.

**Homepage (`pages/home-page.tsx`, nieuw bestand — verplaatst uit de
`Home()`-functie in `App.tsx`, zoals het plan al voor fase F voorzag).**

Belangrijke kanttekening vooraf: **de vier referentiesites konden niet
live bekeken worden.** Zowel Chromium-navigatie (ook met een expliciete
proxy-configuratie) als de WebFetch-tool gaven `EGRESS_BLOCKED` — dit is
een organisatiebreed egress-beleid voor deze sandbox, geen tijdelijke
proxy-storing zoals bij Supabase. Het ontwerp is dus gebaseerd op
trainingskennis van deze (bekende, veelgebruikte) producten, niet op een
actuele blik. Vraag de gebruiker om te vergelijken met de daadwerkelijke
huidige sites als er twijfel is.

Wat er is veranderd, samengevat:
- Hero: groter, zelfverzekerder opschrift (Sora, tot ~4.75rem), een zachte
  paarse radiale gloed + een fijn stippenraster op de achtergrond
  (`.home-hero-grid`, met een ellips-`mask-image` zodat het naar de randen
  wegvalt) — respectievelijk Attio- en Firecrawl-geïnspireerd.
- De oude "prompt-card" (een input-veld-achtig widget) is vervangen door
  een **echte productmoment**-preview: dezelfde `.citation-tag`-styling die
  de studie-chat gebruikt, in een chatbubbel-mockup met een voorbeeldvraag
  en -antwoord. Bewuste keuze om iets *echts* van het product te tonen
  (Attio/Linear-patroon) in plaats van een generieke illustratie.
- De ene "proof-row" is vervangen door drie korte waardekaarten
  (`.home-value-grid`) met een icoon, titel en toelichting.
- Het stappenproces (was: kleine cirkels + verbindingslijn) is nu een
  **haarlijn-lijst met grote "spooknummers"** (`.home-process-num`, tot
  ~3.4rem, uitgelijnd met `-webkit-text-stroke`) — bewust dezelfde
  haarlijn-tussen-rijen-structuur als de herontworpen hoofdstukkenlijst uit
  de derde ronde, zodat marketing en product visueel dezelfde taal spreken.
- CTA-sectie: een vol paars gradiëntpaneel in plaats van een lichte kaart
  met een decoratieve stippellijn-cirkel.
- Ruimte tussen secties eerst te ruim (twee opeenvolgende sections met elk
  ~100px padding gaven een kale strook van ~200px) — gecorrigeerd door
  padding asymmetrisch te verdelen (`clamp(...) 0 clamp(kleiner)` /
  `clamp(kleiner) 0 clamp(...)`), pas zichtbaar en gecorrigeerd ná een
  Playwright-screenshot, niet er vooraf op geraden.
- **Opgeruimd (mijn wijziging maakte dit ongebruikt):** de volledige oude
  `.hero*`/`.prompt-card*`/`.proof-*`/`.process-*`/`.cta-box*`/`.section`/
  `.section-header`/`.section-intro`/`.future-heading`-regels in
  `index.css` — stuk voor stuk gecontroleerd op gebruik elders (`grep` over
  alle `.tsx`-bestanden) vóór verwijdering. Uit de gedeelde mono-label-
  selector (`.prompt-label, .prompt-status, .study-kicker, ..., .step-number,
  ...`) zijn alleen `.prompt-label`, `.prompt-status` en `.step-number`
  verwijderd — de rest van die regel wordt door andere componenten gebruikt
  en is met rust gelaten.
- `App.tsx`: `Home()` weggehaald, `HomePage` geïmporteerd voor de `/`-route.
  Terzijde opgeruimd: `LogOut`- en `useState`-imports die al vóór deze
  sessie ongebruikt waren in dat bestand (niet door deze wijziging
  veroorzaakt, maar wel geraakt omdat dezelfde importregels toch al
  herschreven moesten worden).

Geverifieerd met `pnpm typecheck`, `PORT=5173 BASE_PATH=/ pnpm build`, en
een Playwright-screenshot op **1440px (laptop-breedte, niet mobiel — zie
hierboven)** vóór verzending, inclusief een tweede ronde na de
spacing-correctie.

---

## Het volledige goedgekeurde plan (verbatim)

> ### Context
>
> De vorige ronde is afgekeurd, en terecht. Ik heb de tokens vervangen
> (typografie, kleur, dichtheid) en het donkere thema aangezet, maar de
> *structuur* van elke pagina intact gelaten: kop bovenaan, dan een verticale
> stapel volle-breedte rijen. Het resultaat was een herkleuring, geen
> herontwerp.
>
> Je hebt richting A gekozen — de werkbank — met Notion en Linear als
> voorbeeld, en Firecrawl als afwerkingsniveau dat ook in de app mag
> doorwerken. Dat is een structurele ingreep, geen stijlingreep:
>
> - **Nu:** elke pagina rendert zijn eigen schil. Ga je van een vak naar een
>   hoofdstuk, dan verdwijnt de hoofdstukkenlijst, wordt de hele schil opnieuw
>   opgebouwd, en haalt de pagina het vak opnieuw op.
> - **Straks:** één schil die blijft staan. De hoofdstukkenlijst staat
>   permanent links, de context permanent rechts, en alleen het middenpaneel
>   wisselt.
>
> ### De visuele taal
>
> 1. **Vlak, geen schaduwen.** Diepte komt van haarlijnen en achtergrondlagen,
>    niet van slagschaduw. Elevatie blijft alleen voor wat écht boven de
>    pagina zweeft: dialogen, sheets, het commandopalet.
> 2. **Compacte chrome.** Zijbalkrijen naar Linear-niveau (~28-32px). Het
>    leesgebied gaat de andere kant op: groter lettertype, meer regelafstand.
> 3. **Rasterachtergrond en precisie.** Firecrawls handtekening is het fijne
>    raster achter de content en de haarscherpe uitlijning.
>
> ### Architectuur
>
> **De schil komt buiten de router te staan.**
> ```
> AppShell                    ← blijft gemonteerd, bevat zijbalk + contextkolom
>   RoutedErrorBoundary       ← reset nog steeds per route
>     Switch                  ← alleen nog paginainhoud
> ```
> `RoutedErrorBoundary` hangt aan `location` en hermontageert dus zijn hele
> subtree bij elke navigatie — daarom moet de schil er expliciet búiten.
>
> **Data delen zonder dubbel ophalen.** `QueryClientProvider` staat al
> gemonteerd maar werd nergens gebruikt. Voor het vak: de gegenereerde
> `useGetSubjectDetail(subjectId)` uit `@workspace/api-client-react` — schil
> en pagina roepen dezelfde hook aan en delen de cache.
>
> **Drie valkuilen:**
> - De sidebar-primitive registreert zelf Cmd+B op `window`, zónder
>   invoerveld-check. Moet afgevangen worden.
> - Hij schrijft naar een cookie die niemand leest (Next.js-only patroon).
>   Stand hoort in `localStorage`.
> - `CommandDialog` rendert geen `DialogTitle` — Radix-toegankelijkheids-
>   waarschuwing, oplossen met `sr-only` titel.
>
> ### Fasering
>
> - **Fase A** — Dichtheid en oppervlak herijken (tokens, schaduwen weg,
>   rasterachtergrond).
> - **Fase B** — De schil (AppShell, zijbalken, contextkolom-plumbing).
> - **Fase C** — Toetsenbord (Cmd+K, Cmd+B-fix, j/k, `?`).
> - **Fase D** — Pagina's in het middenpaneel (inhoud herstructureren,
>   leestypografie). **Goedkeuringsmoment.**
> - **Fase E** — Beheer in dezelfde schil (verificatie van alle 8 pagina's).
> - **Fase F** — Publiek en opruimen (homepage, auth, dode code).
>
> ### Verificatie
>
> 1. `pnpm typecheck` in de repo-root.
> 2. `PORT=5173 BASE_PATH=/ pnpm build` in `artifacts/geslaagd-app`.
> 3. Contrastpoort draait automatisch mee.
> 4. **Navigatietest die de hele opzet bewijst:** vak → hoofdstuk → ander
>    hoofdstuk. Zijbalk mag niet knipperen, vak mag maar één keer opgehaald
>    worden.
> 5. Toetsenbordtest: Cmd+B, Cmd+K, j/k, `?`, en dat Cmd+B geen tekst afkapt
>    in een invoerveld.
> 6. Eindreview in Replit met echte data, niet-gemaximaliseerd venster.

---

## Status: wat is af, wat niet

Voortgang wordt bijgehouden met de sessie-taaklijst (TaskCreate/TaskUpdate) —
die is **niet zichtbaar voor een nieuwe sessie**. Onderstaande tabel is de
bron van waarheid.

| Fase | Status | Commit |
|---|---|---|
| Fundament (typografie-ramp, donker thema, layout-primitieven) — *voorloper aan dit plan, uit de tweede/afgekeurde poging* | ✅ Af, blijft staan | `50c44ce`, `9aad87a`, `ff42509`, `2a28114`, `108abf2`-voorlopers |
| **A** — Dichtheid en oppervlak herijken | ✅ Af | `108abf2` |
| **B** — Persistente AppShell | ✅ Af | `ce5c9a5` |
| **C** — Toetsenbordlaag | ✅ Af | `e54e765` |
| **D** — Studentpagina's als inhoud (goedkeuringsmoment) | 🟡 Twee kernpagina's af, nog niet visueel goedgekeurd | `b41888f` |
| **E** — Beheer in dezelfde schil | ⬜ Nog niet begonnen (schil werkt al voor `/beheer/*` via fase B, maar de 8 paginabestanden zijn niet individueel nagelopen) | — |
| **F** — Publiek en opruimen | 🟡 Homepage opnieuw ontworpen, nog niet visueel goedgekeurd; auth-pagina en dode-code-opruiming nog niet gedaan | zie onderstaande commit |

### Wat fase B concreet heeft opgeleverd

- `artifacts/geslaagd-app/src/components/shell/app-shell.tsx` — `AppShell`,
  gemonteerd in `App.tsx` rond `RoutedErrorBoundary` (dus buiten de
  route-reset). Kiest `public`/`study`/`admin` op basis van het pad. Voor
  `study`/`admin`: shadcn `sidebar`-primitive
  (`@workspace/geslaagd-momentum/components/ui/sidebar`) met een dunne topbar,
  paginainhoud, en een contextkolom rechts.
- `components/shell/study-sidebar.tsx` — primaire navigatie + (binnen een vak)
  de hoofdstukkenlijst, via `useGetSubjectDetail` — **dezelfde query key** als
  de pagina zelf gebruikt, dus gedeelde cache, geen dubbele fetch.
- `components/shell/admin-sidebar.tsx` — de bestaande 7-item beheer-navigatie,
  nu op de sidebar-primitive. Geen ruimte meer voor de oude label+hint op twee
  regels — hint zit nu in de hover-tooltip die de primitive al ondersteunt.
- `components/shell/rail-context.tsx` — `useContextRail(node)` hook waarmee
  een pagina inhoud in de rechterkolom kan zetten zonder prop-drilling. **Nog
  niemand gebruikt dit** — dat is precies fase D's werk (voortgang,
  toetsaftelling, zwakke punten verplaatsen hierheen).
- `AdminShell` en `StudyPageShell` zijn drastisch verdund: ze renderen alleen
  nog de paginakop (titel/intro/acties) resp. de terug-knop-wrapper. De
  eigenlijke chrome (header, nav, uitloggen) zit nu in `AppShell`. **Belangrijk:
  alle bestaande aanroepen van deze twee componenten in alle paginabestanden
  zijn ongewijzigd gebleven** — dezelfde props, dus geen van de 8
  beheerpagina's of studentpagina's hoefde aangepast te worden voor fase B.

### Wat fase C concreet heeft opgeleverd

- `hooks/use-hotkeys.ts` — `useHotkeys(hotkeys[])`, generieke registratie op
  `window` met standaard invoerveld-bescherming
  (`isEditableTarget`: `INPUT`/`TEXTAREA`/`SELECT`/`contenteditable`), plus
  `useSuppressSidebarHotkeyInEditable()` — een capture-fase listener voor
  dezelfde Cmd/Ctrl+B-combinatie die `stopPropagation()` aanroept zodra het
  focus in een invoerveld staat, vóórdat de sidebar-primitive's eigen
  bubble-fase listener op `window` het event ziet. De ingebouwde toggle blijft
  verder gewoon werken buiten invoervelden — geen fork nodig.
- `hooks/use-arrow-key-list-focus.ts` — `useArrowKeyListFocus(itemsRef,
  activeIndex)`: j/k verplaatsen **DOM-focus** door een lijst van
  button-refs (disabled items worden overgeslagen), startend vanaf
  `activeIndex` als niets in de lijst al focus heeft. Bewuste keuze: geen
  losse Enter-binding — omdat focus echt naar de `SidebarMenuButton`
  (een native `<button>`) gaat, activeert de browser 'm al op Enter/Space.
  Een globale Enter-hotkey was overwogen en verworpen: die zou
  Enter-activatie van elke andere gefocuste knop/link elders in de app
  breken (preventDefault op keydown onderdrukt de synthetische click).
- `lib/study-routes.ts` — `subjectIdFrom`/`chapterIdFrom` verhuisd hierheen
  vanuit `study-sidebar.tsx` zodat `command-palette.tsx` dezelfde
  route-parsing gebruikt.
- `study-sidebar.tsx` — top-nav geëxporteerd als `STUDY_NAV`; j/k target de
  hoofdstukkenlijst zodra een vak open staat, anders de twee top-items.
- `admin-sidebar.tsx` — nav-array geëxporteerd als `ADMIN_NAV` (was `NAV`,
  alleen intern gebruikt); j/k target de 7 nav-items.
- `components/shell/command-palette.tsx` — Cmd/Ctrl+K, overal in de
  study/admin-schil. `CommandDialog` met een toegevoegde `sr-only`
  `DialogTitle`/`DialogDescription` (loste de Radix a11y-waarschuwing op).
  Toont `STUDY_NAV`/`ADMIN_NAV` voor de huidige sectie, plus — binnen een vak
  — de hoofdstukken via dezelfde gedeelde `useGetSubjectDetail`-query-key als
  de sidebar, plus twee acties (zijbalk in-/uitklappen, uitloggen).
- `components/shell/shortcuts-dialog.tsx` — `?` toont een overzicht van alle
  sneltoetsen. Let op: `?` wordt op een QWERTY-toetsenbord alleen geproduceerd
  mét Shift ingedrukt, dus de hotkey-registratie zet `shift: true` expliciet
  — zonder die vlag matcht `useHotkeys`'s strikte shift-check nooit.
- Beide dialogen worden gemonteerd in `AppShell`s `ShellSurface`, binnen
  `SidebarProvider` (nodig voor `useSidebar()` in het palet) en binnen
  `AuthProvider` (nodig voor `useAuth()` — de uitloggen-actie).
- Geverifieerd met `pnpm typecheck` (root) en
  `PORT=5173 BASE_PATH=/ pnpm build` — beide groen. **Niet visueel getest**
  (zie hieronder).

### Wat fase D concreet heeft opgeleverd (nog niet compleet — zie hieronder)

De twee pagina's die het plan als startpunt noemde:

- **`pages/subject-study-page.tsx`** (de vak-hub). Middenpaneel: paginakop
  (kicker/titel/beschrijving/acties, **geen breadcrumbs meer** — de zijbalk
  toont het vak en de hoofdstukken al) + de `ChapterList` (rijker dan de
  compacte zijbalkversie: beschrijvingen en per-hoofdstuk percentages, dus dit
  is bewust niet weggehaald als "duplicaat"). Naar de contextkolom via
  `useContextRail()`: voortgangsbalk, toetsaftelling, herhaalplan, zwakke
  punten, en een "Bekijk volledig studieplan"-link (was een Section-actie naast
  "Hoofdstukken", hoort inhoudelijk beter bij het herhaalplan).
- **`pages/chapter-page.tsx`** (de leespagina — het hart van de werkbank).
  Middenpaneel: paginakop zonder breadcrumbs, de hoofdstuksamenvatting (leest
  al met de `bodyLong`-typografie uit fase A: groter en luchtiger dan
  interface-tekst, `max-width: 72ch`), "Markeer als gelezen", en de
  oefenvragen/tentamen-kaarten. Naar de contextkolom: het "Kernpunten en
  formules"-blok (was een inline `Collapsible` die de leesflow onderbrak) —
  nu referentiemateriaal ernaast in plaats van ertussen. De rail-registratie
  staat **vóór** de loading/error-early-returns en is onafhankelijk van
  `activity` (lezen/oefenen/tentamen), zodat 'm niet knippert bij het wisselen
  tussen die weergaven.
- `hooks/use-list-navigation`-achtige aanpassingen waren niet nodig hier; wel
  is `.shell-rail` (`index.css`) van een kale flex-container zonder gap
  voorzien van `display:flex; flex-direction:column; gap: var(--density-block-gap)`
  — niemand vulde de rail vóór fase D, dus dit werd nooit zichtbaar.
  `.study-status`/`.study-secondary` (de oude twee-koloms-grid voor de
  status-strip) zijn verwijderd — echt niet meer gebruikt. `.study-card` blijft
  bestaan: de voortgangsbalk in de rail is er nog in gewrapt voor dezelfde
  kaart-rand/achtergrond als de andere rail-items.
- Geverifieerd met `pnpm typecheck` (root) en
  `PORT=5173 BASE_PATH=/ pnpm build` — beide groen. **Niet visueel getest** —
  dit is letterlijk het goedkeuringsmoment dat de gebruiker nog moet zien.

### Wat NIET is gedaan (bewust, hoort bij latere fases of een vervolg op fase D)

- Alleen deze twee pagina's zijn herstructureerd. `study-plan-page.tsx` (waar
  de nieuwe "Bekijk volledig studieplan"-link naartoe wijst),
  `subject-catalog-page.tsx` en `dashboard-page.tsx` dragen nog hun oude
  volle-breedte structuur — geen rail-gebruik, mogelijk nog eigen
  breadcrumbs. Niet gecontroleerd of dat al dan niet stoort naast de nu wel
  al aangepaste pagina's.
- De `.key-notes`-styling (kernpunten/formules) is ongewijzigd verplaatst; hij
  had `max-width: 72ch` voor de oude volle-breedte context, wat in de 280px
  rail een no-op is (niet stuk, maar ook geen doelbewuste keuze voor de
  smallere kolom). De `dl`-layout (`justify-content: space-between`) kan bij
  lange labels/waarden in een smalle kolom lelijk wrappen — niet visueel
  geverifieerd.
- De 8 beheerpagina's zijn niet individueel doorlopen om te checken of ze goed
  ogen binnen de nieuwe schil (fase E) — ze zouden moeten werken (props
  ongewijzigd) maar zijn niet visueel geverifieerd.
- Homepage (nog steeds ~225 regels inline in `App.tsx` als functie `Home()`)
  en `auth-page.tsx` zijn niet aangeraakt (fase F).

---

## Belangrijke technische kennis (kost tijd om opnieuw te ontdekken)

### Monorepo en typecheck
- **Gebruik altijd `pnpm typecheck` vanuit de repo-root**, nooit
  `pnpm --filter geslaagd-app typecheck` direct — dat slaat de
  `tsc --build` van de project-references over en geeft misleidende
  `TS6305`-fouten ("Output file has not been built from source").
- Root-script: `pnpm run typecheck:libs && pnpm -r --filter "./artifacts/**" ... run typecheck`.
- Design-tokens genereren via `node scripts/build-tokens.mjs` in
  `artifacts/geslaagd-momentum` (draait ook automatisch in `pretypecheck`),
  gevolgd door `node scripts/check-contrast.mjs` — dit is een **harde
  bouwpoort**: WCAG AA 4.5:1 op 12 semantische paren, in licht én donker. Een
  paletwijziging die hier doorheen faalt, faalt de build.

### Build vereist env-vars
`artifacts/geslaagd-app`'s `vite.config.ts` gooit een fout als `PORT` en
`BASE_PATH` niet gezet zijn — ze worden niet automatisch uit een `.env`
geladen door Vite's config-laag (dat is alleen voor `VITE_`-geprefixte
variabelen die naar client-code gaan). Gebruik:
```
PORT=5173 BASE_PATH=/ pnpm build
```

### Het kleurenpalet zit in één bestand, gedeeld door alles
`artifacts/geslaagd-momentum/tokens.json` is de **enige** bron voor kleur
(licht + donker), typografie, dichtheid en elevatie — niet los per artifact.
Wijzig alleen dit bestand, nooit de gegenereerde output met de hand:
- `node scripts/build-tokens.mjs` (in `geslaagd-momentum`, draait ook
  automatisch als `pretypecheck` vóór elke `pnpm typecheck`) genereert
  daaruit `src/index.css` (de `--foreground`/`--primary`/etc.
  CSS-variabelen), `src/generated/tokens.tsx` en `public/favicon.svg`.
- `node scripts/check-contrast.mjs` (draait mee in `pretypecheck`) is een
  **harde bouwpoort**: 12 semantische paren moeten WCAG AA (4.5:1) halen, in
  zowel `light` als `dark`. Reken dit met de hand na (luminantie-formule
  staat in het script zelf) vóórdat je een paletwijziging commit — anders
  faalt de build pas ná het schrijven van de tokens, met een minder
  behulpzame foutmelding.
- Er is maar **één** `light`-palet: study/admin en marketing delen het.
  "Licht thema voor studie" betekent dus automatisch "dezelfde kleuren als
  marketing" — er bestaat geen aparte lichte variant per sectie. Het
  `donkere` bos/emerald-palet bestaat nog in het bestand maar wordt sinds de
  eerste feedbackronde nergens meer aangeroepen (`useSurfaceTheme('dark')`
  is overal `'light'` geworden) — theoretisch nog bruikbaar voor een
  toekomstige donker-thema-toggle, verder dode configuratie.

### Markdown-weergave (`components/study/citation-tag.tsx`)
`CitedText` rendert AI-gegenereerde tekst (hoofdstuksamenvattingen, chat) nu
via `react-markdown` + `remark-gfm`, niet als platte string meer. De
`[Bron X]`-citatiemarkers worden vóór het renderen omgezet in een markdown-
link met een eigen `geslaagd-citation:N`-schema; een custom `a`-component in
de `components`-prop van `ReactMarkdown` herkent dat schema en rendert de
bekende citatie-knop in plaats van een echte link (een marker zonder
bijpassende bron in `citations` valt terug op platte tekst — ongewijzigd
gedrag). Een `table`-override wrapt elke tabel in een eigen
`overflow-x: auto`-container zodat een brede tabel niet de hele leeskolom
opdrukt. Bijbehorende typografie staat onder `.cited-text` in `index.css`.

### De sidebar-primitive (`@workspace/geslaagd-momentum/components/ui/sidebar`)
- 23 exports, provider verplicht (`useSidebar` gooit een fout buiten
  `SidebarProvider`). Volledig bruikbaar in Vite/React 19 ondanks de
  `"use client"`-directive bovenaan (die is een no-op buiten Next.js).
- **Cmd/Ctrl+B is al ingebouwd** (`SIDEBAR_KEYBOARD_SHORTCUT = "b"`), maar
  zonder invoerveld-bescherming — hij vuurt ook als je in een tekstveld typt.
  **Gefixt in fase C** zonder de primitive te forken: een capture-fase
  listener op `window` (`useSuppressSidebarHotkeyInEditable` in
  `hooks/use-hotkeys.ts`) roept `stopPropagation()` aan voor dezelfde
  combinatie zodra het focus in een invoerveld staat — capture-fase op
  `window` loopt altijd vóór de primitive's eigen bubble-fase listener op
  hetzelfde element, dus die krijgt het event dan nooit te zien.
- Schrijft zijn open/dicht-stand naar een cookie
  (`sidebar_state`) die **niemand leest** in deze SPA (dat werkt alleen in de
  Next.js-variant waar de server de cookie leest). Ik heb dit in `AppShell`
  vervangen door een eigen `localStorage`-hook (`useSidebarOpenState`),
  gebruikt via de `open`/`onOpenChange`-props van `SidebarProvider`.
- `CommandDialog` (in `components/ui/command.tsx`) rendert geen `DialogTitle`
  — gaf een Radix a11y-waarschuwing. **Gefixt in fase C**:
  `command-palette.tsx` voegt zelf een `sr-only` `DialogTitle` +
  `DialogDescription` toe, de primitive zelf is niet aangepast.

### Data delen tussen schil en pagina
`useGetSubjectDetail` (gegenereerd door orval in `@workspace/api-client-react`)
heeft een subtiele TypeScript-eigenaardigheid: als je `{ query: { enabled } }`
meegeeft zónder `queryKey`, klaagt TypeScript dat `queryKey` verplicht is in
het type (ook al vult de runtime-code een default in via
`queryOptions?.queryKey ?? getGetSubjectDetailQueryKey(subjectId)`). Oplossing
in `study-sidebar.tsx`: expliciet `queryKey: getGetSubjectDetailQueryKey(subjectId)`
meegeven — dat is exact dezelfde key als de default, dus de cache blijft
gedeeld met elke andere aanroep die de hook zonder override gebruikt.

`QueryClientProvider` staat al gemonteerd in `App.tsx` maar werd voor dit
project nergens gebruikt — alle pagina's deden handmatig
`useState`+`useEffect`+`await apiCall()`. Dit is bewust beperkt gehouden tot
wat de schil nodig heeft; er is geen bredere migratie naar react-query gedaan.

### Routing (wouter 3.10)
- Eén `<Switch>` in `App.tsx`, geen geneste routes in gebruik (wouter
  ondersteunt wél `nest`, maar dat wordt hier niet benut).
- Route-parameters komen binnen via de render-prop vorm
  (`<Route path="...">{(params) => <Page subjectId={params.subjectId} />}</Route>`),
  niet via `useParams()`.
- `RoutedErrorBoundary` (in `App.tsx`) hangt aan `useLocation()` als
  `resetKey` — zijn hele subtree hermontageert dus bij **elke** navigatie. Dit
  is de reden dat `AppShell` er expliciet buiten moet staan.

### Deze sandbox kan de live app niet visueel testen, maar wél losse opmaak
Chromium in deze containeromgeving kan geen stabiele verbinding met Supabase
opzetten door de netwerkproxy (herhaaldelijk vastgesteld, ook met
`--disable-quic`/`--disable-http2`). **Eindverificatie met echte data moet
via Replit.**

Dat betekent niet dat je hier blind moet gokken op CSS-gedrag. Chromium zelf
werkt hier prima voor **statische opmaak zonder netwerkverkeer**:
Playwright is voorgeïnstalleerd (`/opt/pw-browsers/chromium-*/chrome-linux/
chrome`, package op `/opt/node22/lib/node_modules/playwright`, niet in de
`node_modules` van dit project zelf). Bij twijfel over hoe een CSS-regel zich
gedraagt (vooral flex/grid in een smalle rail, of iets met tekst-wrapping):
bouw een losse HTML-reproductie met de gecompileerde bundel
(`artifacts/geslaagd-app/dist/public/assets/*.css`, na `pnpm build`) en
handgeschreven markup met dezelfde classNamen/DOM-structuur, en screenshot
die met een klein Playwright-scriptje. Dat is precies hoe de bugs uit de
tweede feedbackronde (de kapotte rail-lijst, ontbrekende lijst-markers) zijn
gevonden én de fix geverifieerd, in plaats van erop te vertrouwen dat de CSS
wel zou kloppen.

---

## Hoe visueel te verifiëren (Replit)

1. Vraag de Replit-agent (app "geslaagd_dev", of zoek via `search_apps`) om
   `origin/claude/repo-replit-sync-vgwk3g` te fetchen en uit te checken, en
   **daarna `pnpm install` te draaien** — bij eerdere branch-wissels moest dit
   expliciet gevraagd worden omdat nieuwe dependencies (bijv. `motion`) anders
   ontbreken in `node_modules` en de dev-server crasht met
   `Failed to resolve import "motion/react"`.
2. Er bestaat al een idempotent dev-adminaccount-script:
   `pnpm --filter @workspace/scripts run create-dev-admin <email> <wachtwoord>`
   (bestand: `scripts/src/create-dev-admin.ts`) — creëert of promoveert een
   Supabase-auth-gebruiker naar `app_metadata.role = "admin"` via de
   service-role key. Nodig om `/beheer/*` te kunnen bekijken.
3. Test specifiek de navigatie vak → hoofdstuk → ander hoofdstuk: de zijbalk
   mag niet knipperen en het netwerktabblad zou het vak maar één keer moeten
   ophalen.
4. Test op een **niet-gemaximaliseerd venster** — een eerdere ronde bracht een
   afgesneden zijbalk en horizontale overflow aan het licht die alleen
   zichtbaar waren op smallere/niet-gemaximaliseerde vensters.
5. **Toetsenbordtest (fase C, nog niet visueel bekeken):** Cmd/Ctrl+K opent
   het commandopalet (met zoekbalk, sectie-navigatie, en binnen een vak de
   hoofdstukken); Cmd/Ctrl+B klapt de zijbalk in/uit én doet dat **niet**
   meer terwijl je in een tekstveld typt; `j`/`k` verplaatsen de focus door
   de zichtbare lijst (hoofdstukken binnen een vak, anders de top-nav, in
   beheer de 7 nav-items) — Enter/Spatie activeert het gefocuste item via de
   normale knop-semantiek; `?` toont het sneltoetsenoverzicht.
6. **Fase D, hét goedkeuringsmoment:** open een vak
   (`/vakken/:subjectId`) — de contextkolom rechts moet de voortgangsbalk,
   toetsaftelling, herhaalplan en zwakke punten tonen (gestapeld, niet meer
   onder de hoofdstukkenlijst); open een hoofdstuk — de kernpunten/formules
   staan nu in dezelfde contextkolom in plaats van als inklapbaar blok tussen
   de samenvatting en de oefenkaarten. Check specifiek: ziet de rail er goed
   uit op 280px breed (met name de kernpunten-tabel bij lange labels/waarden),
   en knippert de rail niet bij het wisselen tussen lezen/oefenen/tentamen
   binnen hetzelfde hoofdstuk?
7. **Eerste feedbackronde verifiëren:** geen rasterpatroon meer zichtbaar;
   licht + paars/wit overal (ook marketing/homepage — niet alleen
   studie/beheer); een hoofdstuksamenvatting met opmaak (koppen, vet,
   tabellen) toont nu echt geformatteerde tekst in plaats van rauwe
   `##`/`**`/`|`-tekens; de hoofdstukrijen op de vak-hub hebben een ronde
   icoon-badge en een grotere/andere titelstijl.
8. **Tweede feedbackronde verifiëren:** in de rail van een vak met een
   herhaalplan — is elke taak nu titel/tags bovenaan met de actie-knoppen op
   hun eigen regel eronder (niet meer een rij die uit elkaar valt)? Een
   hoofdstuksamenvatting met een genummerde of opsommingslijst toont nu echt
   nummers/bullets. De kernpunten-tabel in de rail toont label boven, waarde
   eronder (niet meer naast elkaar). Kleine meta-tekst (percentages, badges)
   is iets donkerder dan de vorige ronde. De "Tentamen"-badge in de compacte
   zijbalk is weg (staat nog wel, correct, in de hoofdstukkenlijst in het
   middenpaneel).
9. **Derde feedbackronde verifiëren:** de hoofdstukkenlijst is nu één
   doorlopende lijst met dunne scheidingslijnen tussen rijen, geen losse
   omrande kaartjes meer; elke rij heeft een tweecijferig volgnummer (01, 02,
   …) in plaats van een rond icoon; geen paarse "bubbel" meer achter een
   titel. (Getest op laptop-breedte; het smalle-scherm-gedrag is een vangnet
   voor een niet-gemaximaliseerd venster, geen doel op zich — zie "Richting:
   laptop-first" hierboven.)
10. **Vierde feedbackronde verifiëren (nog niet gezien):** in het herhaalplan
    in de rail tonen de onderwerp-tags nu losse afgeronde chips die elk
    afzonderlijk wrappen, in plaats van één samengevoegde tekst die
    mid-woord kon afbreken. De homepage (`/`) heeft een volledig nieuwe hero
    (groot opschrift, zachte paarse gloed + stippenraster op de achtergrond,
    een chatbubbel-productpreview met een echte citatie-tag in plaats van
    een generiek invoerveld-widget), drie waardekaarten, een genummerde
    haarlijn-lijst voor de drie stappen (dezelfde stijl als de
    hoofdstukkenlijst), en een vol paars gradiëntpaneel als afsluitende CTA.
    Vergelijk gerust met de vier genoemde referentiesites (Attio, Firecrawl,
    Zapier, Linear.ai) zelf — dit ontwerp is gemaakt zonder ze live te
    kunnen bekijken (egress-blokkade in de sandbox), dus op basis van
    trainingskennis in plaats van een actuele blik.

---

## Aanbevolen vervolgstappen (in volgorde)

1. **Fase D afmaken.** `subject-study-page.tsx` en `chapter-page.tsx` zijn
   herstructureerd (zie hierboven) maar **nog niet visueel goedgekeurd** —
   dat is de eerste stap, via Replit (zie hieronder). Reken ook op mogelijke
   bijstelling van `.key-notes` in de smalle rail. Daarna, optioneel binnen
   dezelfde fase: `study-plan-page.tsx`, `subject-catalog-page.tsx` en
   `dashboard-page.tsx` zijn nog niet aangeraakt en dragen nog hun oude
   structuur.

2. **Fase E — Beheer verifiëren.** Loop de 8 `/beheer`-pagina's visueel na in
   Replit. De schil-integratie zou al moeten werken (props ongewijzigd), dit
   is vooral controleren of niets er raar uitziet in de compacte
   dichtheidsschaal.

3. **Fase F — Publiek en opruimen.** Homepage is al gedaan (zie de vierde
   feedbackronde hierboven, ✅) — nog wel visueel goed te keuren. Auth-
   pagina staat nog op de oude stijl. Daarna dode code: dubbele `.spin`-definitie (`admin-spin` en
   `study-spin` overschrijven elkaar — zoek naar beide), `framer-motion` uit
   `geslaagd-app` (0 imports, `motion`-package is de echte), de wees
   `components/ui/terminal.tsx` (298 regels, nergens geïmporteerd), en de
   verweesde `hooks/use-mobile.tsx` (duplicaat van
   `geslaagd-momentum/src/hooks/use-mobile.tsx`, alleen de laatste wordt echt
   gebruikt, door de sidebar-primitive).

## Werkwijze-afspraken die golden in dit traject

- **Commit na elke fase, direct pushen** — de gebruiker schakelt tussen
  sessies/omgevingen en wil elke voltooide stap in de git-historie hebben
  staan, niet alleen lokaal.
- **`pnpm typecheck` (root) + `PORT=5173 BASE_PATH=/ pnpm build` na élke
  fase**, voordat je commit. Geen fase is "af" zonder een groene build.
- De gebruiker reageert scherp op werk dat oppervlakkig oogt ("herkleuring
  in plaats van herontwerp") — bij twijfel over hoe grondig een verandering
  moet zijn, kies grondig, en leg uit wat je concreet hebt veranderd (met
  meetbare voorbeelden: rijhoogtes in px, welke schaduwen weg zijn, etc.) in
  plaats van alleen "ik heb het herontworpen" te zeggen.
