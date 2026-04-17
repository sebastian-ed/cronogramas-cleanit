-- ─────────────────────────────────────────────────────────────
--  Ejecutá este SQL en Supabase → SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────

create table services (
  id          uuid primary key,
  name        text,
  address     text,
  workers     text,
  schedule    text,
  supervisor  text,
  critical    text,
  notes       text,
  tasks       jsonb default '[]'::jsonb,
  created_at  timestamptz default now()
);

-- Habilitar Row Level Security (recomendado)
alter table services enable row level security;

-- Política: cualquier persona con la anon key puede leer y escribir
-- (acceso abierto, ideal para uso interno de equipo)
create policy "Acceso abierto lectura"
  on services for select using (true);

create policy "Acceso abierto inserción"
  on services for insert with check (true);

create policy "Acceso abierto actualización"
  on services for update using (true);

create policy "Acceso abierto eliminación"
  on services for delete using (true);

-- Habilitar Realtime para esta tabla
-- (hacerlo también desde Supabase → Database → Replication → supabase_realtime → services ✓)
alter publication supabase_realtime add table services;
