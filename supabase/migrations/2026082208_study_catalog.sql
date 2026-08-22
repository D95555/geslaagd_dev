create extension if not exists pgcrypto;

create table if not exists public.study_subjects (
  id text primary key,
  name text not null,
  slug text unique not null,
  description text not null default '',
  aliases text[] not null default '{}',
  sort_order integer not null default 0
);

create table if not exists public.study_books (
  id text primary key,
  subject_id text not null references public.study_subjects(id) on delete cascade,
  title text not null,
  publisher text not null default '',
  edition text not null default 'VWO 6',
  description text not null default '',
  sort_order integer not null default 0
);

create table if not exists public.study_chapters (
  id text primary key,
  book_id text not null references public.study_books(id) on delete cascade,
  chapter_number integer not null,
  title text not null,
  description text not null default '',
  topics text[] not null default '{}',
  sort_order integer not null default 0
);

create table if not exists public.study_spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_type text not null check (source_type in ('catalog', 'ai')),
  subject_id text references public.study_subjects(id) on delete set null,
  book_id text references public.study_books(id) on delete set null,
  chapter_id text references public.study_chapters(id) on delete set null,
  original_input text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_input text not null,
  subject_id text references public.study_subjects(id) on delete set null,
  proposed_subject text not null,
  proposed_topic text not null,
  rationale text not null default '',
  search_terms text[] not null default '{}',
  confidence numeric(4, 3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists study_books_subject_idx on public.study_books(subject_id);
create index if not exists study_chapters_book_idx on public.study_chapters(book_id);
create index if not exists study_spaces_user_idx on public.study_spaces(user_id, updated_at desc);
create index if not exists study_proposals_user_idx on public.study_proposals(user_id, created_at desc);

alter table public.study_subjects enable row level security;
alter table public.study_books enable row level security;
alter table public.study_chapters enable row level security;
alter table public.study_spaces enable row level security;
alter table public.study_proposals enable row level security;

drop policy if exists "Catalog subjects are readable" on public.study_subjects;
create policy "Catalog subjects are readable" on public.study_subjects for select to authenticated using (true);
drop policy if exists "Catalog books are readable" on public.study_books;
create policy "Catalog books are readable" on public.study_books for select to authenticated using (true);
drop policy if exists "Catalog chapters are readable" on public.study_chapters;
create policy "Catalog chapters are readable" on public.study_chapters for select to authenticated using (true);
drop policy if exists "Users read own study spaces" on public.study_spaces;
create policy "Users read own study spaces" on public.study_spaces for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users create own study spaces" on public.study_spaces;
create policy "Users create own study spaces" on public.study_spaces for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users update own study spaces" on public.study_spaces;
create policy "Users update own study spaces" on public.study_spaces for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users read own study proposals" on public.study_proposals;
create policy "Users read own study proposals" on public.study_proposals for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users create own study proposals" on public.study_proposals;
create policy "Users create own study proposals" on public.study_proposals for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users update own study proposals" on public.study_proposals;
create policy "Users update own study proposals" on public.study_proposals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.study_subjects (id, name, slug, description, aliases, sort_order) values
  ('nederlands', 'Nederlands', 'nederlands', 'Taal, literatuur en argumentatie voor het eindexamen.', array['nederlands', 'ne', 'nederlands vwo'], 10),
  ('engels', 'Engels', 'engels', 'Reading, writing, literature and language.', array['engels', 'en', 'english'], 20),
  ('wiskunde-a', 'Wiskunde A', 'wiskunde-a', 'Kansrekening, statistiek, verbanden en analyse.', array['wiskunde a', 'wisa', 'math a'], 30),
  ('wiskunde-b', 'Wiskunde B', 'wiskunde-b', 'Analyse, algebra, meetkunde en functies.', array['wiskunde b', 'wisb', 'math b'], 40),
  ('natuurkunde', 'Natuurkunde', 'natuurkunde', 'Mechanica, elektriciteit, straling en moderne natuurkunde.', array['natuurkunde', 'na', 'physics'], 50),
  ('scheikunde', 'Scheikunde', 'scheikunde', 'Stoffen, reacties, rekenen en chemische analyse.', array['scheikunde', 'sk', 'chemistry'], 60),
  ('biologie', 'Biologie', 'biologie', 'Cellen, erfelijkheid, ecologie en evolutie.', array['biologie', 'bio', 'genetica', 'biology'], 70),
  ('economie', 'Economie', 'economie', 'Markt, macro-economie, welvaart en financiële keuzes.', array['economie', 'eco', 'economics'], 80),
  ('geschiedenis', 'Geschiedenis', 'geschiedenis', 'Historische contexten, tijdvakken en historisch denken.', array['geschiedenis', 'gs', 'history'], 90),
  ('aardrijkskunde', 'Aardrijkskunde', 'aardrijkskunde', 'Gebieden, globalisering, klimaat en ontwikkeling.', array['aardrijkskunde', 'ak', 'geography'], 100),
  ('frans', 'Frans', 'frans', 'Leesvaardigheid en taal voor het vwo-examen.', array['frans', 'fa', 'french'], 110),
  ('duits', 'Duits', 'duits', 'Leesvaardigheid en taal voor het vwo-examen.', array['duits', 'du', 'german'], 120),
  ('maatschappijwetenschappen', 'Maatschappijwetenschappen', 'maatschappijwetenschappen', 'Politiek, cultuur, sociale structuren en onderzoek.', array['maatschappijwetenschappen', 'maw', 'maatschappijwetenschap'], 130),
  ('informatica', 'Informatica', 'informatica', 'Informatie, algoritmen, data en programmeren.', array['informatica', 'in', 'computer science'], 140),
  ('latijn', 'Latijn', 'latijn', 'Taal, tekst en cultuur van de klassieke oudheid.', array['latijn', 'la'], 150),
  ('grieks', 'Grieks', 'grieks', 'Taal, tekst en cultuur van de klassieke oudheid.', array['grieks', 'gri'], 160)
on conflict (id) do update set name = excluded.name, description = excluded.description, aliases = excluded.aliases, sort_order = excluded.sort_order;

insert into public.study_books (id, subject_id, title, publisher, edition, description, sort_order) values
  ('biologie-basis', 'biologie', 'Biologie voor jou', 'Malmberg', 'VWO 6', 'Biologie voor het vwo, met de examenonderwerpen als vertrekpunt.', 10),
  ('scheikunde-systematische', 'scheikunde', 'Systematische natuurkunde? Scheikunde', 'Noordhoff', 'VWO 6', 'Een naslagstructuur voor chemische begrippen, reacties en berekeningen.', 10),
  ('natuurkunde-nova', 'natuurkunde', 'NOVA natuurkunde', 'Malmberg', 'VWO 6', 'Mechanica, elektriciteit en moderne natuurkunde.', 10),
  ('wiskunde-getal-en-ruimte-a', 'wiskunde-a', 'Getal & Ruimte Wiskunde A', 'Noordhoff', 'VWO 6', 'Wiskunde A met statistiek, kansrekening en analyse.', 10),
  ('wiskunde-getal-en-ruimte-b', 'wiskunde-b', 'Getal & Ruimte Wiskunde B', 'Noordhoff', 'VWO 6', 'Wiskunde B met functies, analyse en meetkunde.', 10),
  ('geschiedenis-samevatting', 'geschiedenis', 'Memo geschiedenis', 'Malmberg', 'VWO 6', 'Historische contexten en examengerichte vaardigheden.', 10),
  ('economie-index', 'economie', 'Index Economie', 'ThiemeMeulenhoff', 'VWO 6', 'Micro-economie, macro-economie en welvaart.', 10),
  ('aardrijkskunde-buiteNland', 'aardrijkskunde', 'De Geo', 'ThiemeMeulenhoff', 'VWO 6', 'Wereldwijde thema’s, gebieden en geografisch denken.', 10),
  ('engels-new-interface', 'engels', 'New Interface', 'Noordhoff', 'VWO 6', 'Reading, vocabulary and exam skills.', 10),
  ('nederlands-laagland', 'nederlands', 'Laagland', 'ThiemeMeulenhoff', 'VWO 6', 'Literatuur, taal en argumentatie.', 10),
  ('frans-grand-cafe', 'frans', 'Grand Café', 'Noordhoff', 'VWO 6', 'Franse leesteksten en examenvaardigheden.', 10),
  ('duits-trabitour', 'duits', 'Trabitour', 'Noordhoff', 'VWO 6', 'Duitse leesteksten en examenvaardigheden.', 10),
  ('maatschappijwetenschappen-samenleving', 'maatschappijwetenschappen', 'Samenleving', 'Malmberg', 'VWO 6', 'Concepten, thema’s en onderzoek voor maatschappijwetenschappen.', 10),
  ('informatica-informaticawerkt', 'informatica', 'Informatica werkt', 'Malmberg', 'VWO 6', 'Algoritmen, data, informatiesystemen en programmeren.', 10),
  ('latijn-forum', 'latijn', 'Forum', 'Strepitus', 'VWO 6', 'Latijnse teksten en klassieke cultuur.', 10),
  ('grieks-phaedra', 'grieks', 'Palladion', 'Strepitus', 'VWO 6', 'Griekse teksten en klassieke cultuur.', 10)
on conflict (id) do update set title = excluded.title, publisher = excluded.publisher, edition = excluded.edition, description = excluded.description, subject_id = excluded.subject_id;

insert into public.study_chapters (id, book_id, chapter_number, title, description, topics, sort_order) values
  ('biologie-basis-1', 'biologie-basis', 1, 'Stofwisseling', 'Energie, enzymen en verbranding.', array['enzymen', 'celademhaling', 'fotosynthese'], 10),
  ('biologie-basis-2', 'biologie-basis', 2, 'Genetica', 'Erfelijkheid, DNA en variatie.', array['DNA', 'genotype', 'fenotype', 'erfelijkheid'], 20),
  ('biologie-basis-3', 'biologie-basis', 3, 'Evolutie', 'Selectie, populaties en soortvorming.', array['natuurlijke selectie', 'evolutie', 'populatie'], 30),
  ('biologie-basis-4', 'biologie-basis', 4, 'Ecologie', 'Ecosystemen, kringlopen en duurzaamheid.', array['ecosysteem', 'voedselweb', 'kringloop'], 40),
  ('natuurkunde-nova-1', 'natuurkunde-nova', 1, 'Beweging en krachten', 'Mechanica en modelleren.', array['krachten', 'beweging', 'impuls'], 10),
  ('natuurkunde-nova-2', 'natuurkunde-nova', 2, 'Elektriciteit', 'Lading, spanning en schakelingen.', array['spanning', 'stroom', 'weerstand'], 20),
  ('natuurkunde-nova-3', 'natuurkunde-nova', 3, 'Straling en materie', 'Radioactiviteit en deeltjes.', array['straling', 'radioactiviteit', 'halveringstijd'], 30),
  ('scheikunde-systematische-1', 'scheikunde-systematische', 1, 'Rekenen aan reacties', 'Mol, massa en concentratie.', array['mol', 'concentratie', 'reactievergelijking'], 10),
  ('scheikunde-systematische-2', 'scheikunde-systematische', 2, 'Zuren en basen', 'pH, buffers en titraties.', array['pH', 'zuur', 'base', 'titratie'], 20),
  ('wiskunde-getal-en-ruimte-a-1', 'wiskunde-getal-en-ruimte-a', 1, 'Kansrekening', 'Kansen, verdelingen en verwachtingswaarde.', array['kans', 'binomiale verdeling', 'verwachtingswaarde'], 10),
  ('wiskunde-getal-en-ruimte-a-2', 'wiskunde-getal-en-ruimte-a', 2, 'Statistiek', 'Data, regressie en betrouwbaarheidsintervallen.', array['gemiddelde', 'regressie', 'betrouwbaarheid'], 20),
  ('wiskunde-getal-en-ruimte-b-1', 'wiskunde-getal-en-ruimte-b', 1, 'Differentiaalrekening', 'Afgeleiden en toepassingen.', array['afgeleide', 'extremum', 'helling'], 10),
  ('wiskunde-getal-en-ruimte-b-2', 'wiskunde-getal-en-ruimte-b', 2, 'Integraalrekening', 'Oppervlakte, primitieve en toepassingen.', array['integraal', 'oppervlakte', 'primitieve'], 20),
  ('geschiedenis-samevatting-1', 'geschiedenis-samevatting', 1, 'Republiek en Gouden Eeuw', 'Macht, handel en staatsvorming.', array['republiek', 'Gouden Eeuw', 'regenten'], 10),
  ('geschiedenis-samevatting-2', 'geschiedenis-samevatting', 2, 'Duitsland in Europa', 'Van keizerrijk tot hereniging.', array['Duitsland', 'nazi-Duitsland', 'Koude Oorlog'], 20),
  ('economie-index-1', 'economie-index', 1, 'Markt en overheid', 'Vraag, aanbod en marktwerking.', array['vraag', 'aanbod', 'marktwerking'], 10),
  ('economie-index-2', 'economie-index', 2, 'Macro-economie', 'Groei, inflatie en werkloosheid.', array['bbp', 'inflatie', 'werkloosheid'], 20),
  ('aardrijkskunde-buiteNland-1', 'aardrijkskunde-buiteNland', 1, 'Globalisering', 'Wereldwijde netwerken en ongelijkheid.', array['globalisering', 'wereldhandel', 'ongelijkheid'], 10),
  ('aardrijkskunde-buiteNland-2', 'aardrijkskunde-buiteNland', 2, 'Klimaat en water', 'Klimaatsystemen en waterbeheer.', array['klimaat', 'waterbeheer', 'overstroming'], 20),
  ('engels-new-interface-1', 'engels-new-interface', 1, 'Reading skills', 'Tekststructuur, argumentatie en signaalwoorden.', array['reading', 'argumentation', 'text structure'], 10),
  ('nederlands-laagland-1', 'nederlands-laagland', 1, 'Argumentatie', 'Standpunten, argumenten en drogredenen.', array['argumentatie', 'drogreden', 'betoog'], 10),
  ('nederlands-laagland-2', 'nederlands-laagland', 2, 'Literatuurgeschiedenis', 'Periodes, genres en literaire begrippen.', array['literatuur', 'poëzie', 'roman'], 20),
  ('frans-grand-cafe-1', 'frans-grand-cafe', 1, 'Compréhension écrite', 'Leesstrategieën en tekstverbanden.', array['lecture', 'vocabulaire', 'texte'], 10),
  ('duits-trabitour-1', 'duits-trabitour', 1, 'Leseverstehen', 'Leesstrategieën en tekstverbanden.', array['Lesen', 'Wortschatz', 'Text'], 10),
  ('maatschappijwetenschappen-samenleving-1', 'maatschappijwetenschappen-samenleving', 1, 'Sociale ongelijkheid', 'Macht, kansen en maatschappelijke posities.', array['sociale ongelijkheid', 'macht', 'status'], 10),
  ('informatica-informaticawerkt-1', 'informatica-informaticawerkt', 1, 'Algoritmen', 'Probleemoplossing en efficiëntie.', array['algoritme', 'complexiteit', 'pseudocode'], 10),
  ('latijn-forum-1', 'latijn-forum', 1, 'Tekst en vertaling', 'Vertaalstrategie en stijlmiddelen.', array['vertalen', 'stijlfiguren', 'syntax'], 10),
  ('grieks-phaedra-1', 'grieks-phaedra', 1, 'Tekst en vertaling', 'Vertaalstrategie en stijlmiddelen.', array['vertalen', 'stijlfiguren', 'syntax'], 10)
on conflict (id) do update set title = excluded.title, description = excluded.description, topics = excluded.topics, book_id = excluded.book_id;