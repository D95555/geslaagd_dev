# Overdracht: social platform

Dit document is geschreven voor een Claude-sessie die dit werk overneemt
zonder de voorgaande conversatie te kennen. Lees dit eerst, in zijn geheel,
voordat je iets aanraakt. Branch: `claude/repo-replit-sync-vgwk3g`.

## Waar dit vandaan komt

De gebruiker vroeg om een grote uitbreiding in twee delen: (1) een
credit-/pakkettensysteem met beheer-uitbreidingen, en (2) een volledig
social platform (profielen, DM's, groepsapps, foto's, beheer-moderatie) met
een Discord-achtige chat-redesign. Beide zijn via `superpowers:brainstorming`
uitgewerkt tot een spec en een plan; deel 1 is **al gebouwd en live** (zie
git-geschiedenis vanaf commit `b15fd8f` t/m `083ad09` op `main`). Dit
document gaat over deel 2, dat nog **niet** gestart is.

## Status

- **Spec**: [docs/superpowers/specs/2026-09-05-social-platform-design.md](superpowers/specs/2026-09-05-social-platform-design.md) — volledig uitgewerkt en door de gebruiker per sectie goedgekeurd.
- **Plan**: [docs/superpowers/plans/2026-09-05-social-platform.md](superpowers/plans/2026-09-05-social-platform.md) — taak-voor-taak implementatieplan, nog **niet uitgevoerd**.
- **Vorige, al voltooide sub-project** (voor context over bestaande patronen): [docs/superpowers/specs/2026-09-05-credits-packages-admin-design.md](superpowers/specs/2026-09-05-credits-packages-admin-design.md) + [docs/superpowers/plans/2026-09-05-credits-packages-admin.md](superpowers/plans/2026-09-05-credits-packages-admin.md), volledig geïmplementeerd. De credits/pakketten-code (`artifacts/api-server/src/lib/credits.ts`, de gesplitste admin-routes, het notificatiesysteem) is een goed voorbeeld van de conventies die dit project verwacht: service-role-only tabellen, alle client-toegang via Express-routes, `broadcast()` voor live updates i.p.v. polling of client-side Realtime.

## Wat te doen

1. Lees eerst de spec volledig — die legt architectuur, datamodel en elke
   productbeslissing uit, inclusief de redenering erachter.
2. Lees daarna het plan — dat is de concrete, taak-voor-taak uitvoering
   ervan, met bestandslocaties en (waar nuttig) code.
3. Voer het plan uit zoals beschreven (het plan zelf zegt met welke skill:
   `superpowers:subagent-driven-development` of
   `superpowers:executing-plans`).
4. Na afronding: dezelfde afronding als het vorige sub-project — mergen
   naar `main`, en de Replit-app opnieuw laten syncen via
   `update_app_using_prompt` (replId is op te zoeken via `search_apps` met
   query "geslaagd" — niet gokken).

## Let op

- Er bestaat **geen testframework** in deze codebase. Verificatie gaat via
  wegwerp-`scratch-*.ts`-scripts tegen de echte Supabase-backend, met
  wegwerpbare testaccounts die je meteen weer opruimt — nooit tegen echte
  gebruikersdata testen zonder expliciet te controleren dat het om een
  door jezelf aangemaakt testaccount gaat (dit is eerder in dit project
  een keer misgegaan: een testscript pakte per ongeluk een bestaand echt
  account i.p.v. een vers testaccount — controleer dus altijd eerst welk
  account je raakt voordat je muteert).
- Alle nieuwe API-endpoints gaan via `lib/api-spec/openapi.yaml` +
  `pnpm --filter @workspace/api-spec run codegen`, niet los toegevoegd.
- `pnpm -w run typecheck` moet schoon zijn voordat je een taak als
  afgerond beschouwt.
