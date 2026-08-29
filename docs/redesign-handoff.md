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
| Thema | Donker voor studie + beheer, licht voor marketing |
| Proefpagina/goedkeuring | Fase D (pagina's als inhoud) is het volgende goedkeuringsmoment — nog niet bereikt |

**Dit is nog niet in een browser bekeken door de gebruiker.** Alles hieronder
is geverifieerd op `pnpm typecheck` en `pnpm build`, niet visueel. Zie
"Hoe visueel te verifiëren" onderaan.

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
| **D** — Studentpagina's als inhoud (goedkeuringsmoment) | 🟡 Twee kernpagina's af, nog niet visueel goedgekeurd | zie onderstaande commit |
| **E** — Beheer in dezelfde schil | ⬜ Nog niet begonnen (schil werkt al voor `/beheer/*` via fase B, maar de 8 paginabestanden zijn niet individueel nagelopen) | — |
| **F** — Publiek en opruimen | ⬜ Nog niet begonnen | — |

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

### Deze sandbox kan de app niet visueel testen
Chromium in deze containeromgeving kan geen stabiele verbinding met Supabase
opzetten door de netwerkproxy (herhaaldelijk vastgesteld, ook met
`--disable-quic`/`--disable-http2`). **Visuele verificatie moet via Replit.**

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

3. **Fase F — Publiek en opruimen.** Homepage uit `App.tsx` naar een eigen
   paginabestand, in de Firecrawl-behandeling (rasterlijnen, precisie). Auth-
   pagina. Daarna dode code: dubbele `.spin`-definitie (`admin-spin` en
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
