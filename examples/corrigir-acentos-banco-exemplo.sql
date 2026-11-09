-- DBHub · conserta textos com acento gravados como ç no banco-exemplo.
-- Pode rodar mais de uma vez: só mexe no que ainda estiver errado.
begin;

create function pg_temp.dbhub_unescape(s text) returns text language plpgsql immutable as $fn$
declare m text[]; result text := s;
begin
  if s is null or position('\u' in s) = 0 then return s; end if;
  loop
    m := regexp_match(result, '\\u([0-9A-Fa-f]{4})');
    exit when m is null;
    result := replace(result, '\u' || m[1], chr(('x' || m[1])::bit(16)::int));
  end loop;
  return result;
end $fn$;

do $do$
declare r record; c record; defs text[] := '{}'; d text;
begin
  -- 1) valores de enum (renomear mantém as linhas que usam o valor)
  for r in
    select n.nspname, t.typname, e.enumlabel
      from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace
     where position('\u' in e.enumlabel) > 0
  loop
    execute format('alter type %I.%I rename value %L to %L', r.nspname, r.typname, r.enumlabel, pg_temp.dbhub_unescape(r.enumlabel));
  end loop;

  -- 2) CHECKs com texto escapado: remove agora, recria corrigido no fim
  for r in
    select con.conname, con.conrelid::regclass as tbl, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
     where con.contype = 'c' and position('\u' in pg_get_constraintdef(con.oid)) > 0
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    defs := defs || format('alter table %s add constraint %I %s', r.tbl, r.conname, pg_temp.dbhub_unescape(r.def));
  end loop;

  -- 3) colunas de texto, arrays de texto e jsonb das tabelas do usuário
  for c in
    select n.nspname, cl.relname, a.attname, format_type(a.atttypid, a.atttypmod) as typ
      from pg_attribute a
      join pg_class cl on cl.oid = a.attrelid and cl.relkind = 'r'
      join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_%'
       and a.attnum > 0 and not a.attisdropped
       and (a.atttypid in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype, 'text[]'::regtype, 'jsonb'::regtype))
  loop
    if c.typ = 'text[]' then
      -- no literal de array o "\" foi engolido: sobrou "u00ED" sem a barra
      execute format(
        $q$update %I.%I set %I = (select array_agg(pg_temp.dbhub_unescape(regexp_replace(x, '(^|[^\\])u00([0-9A-F]{2})', '\1\\u00\2', 'g')) order by o) from unnest(%I) with ordinality u(x, o))
            where array_to_string(%I, ',') ~ 'u00[0-9A-F]{2}'$q$,
        c.nspname, c.relname, c.attname, c.attname, c.attname);
    elsif c.typ = 'jsonb' then
      execute format($q$update %I.%I set %I = replace(%I::text, '\\u', '\u')::jsonb where position('\\u' in %I::text) > 0$q$,
        c.nspname, c.relname, c.attname, c.attname, c.attname);
    else
      execute format('update %I.%I set %I = pg_temp.dbhub_unescape(%I) where position(%L in %I) > 0',
        c.nspname, c.relname, c.attname, c.attname, '\u', c.attname);
    end if;
  end loop;

  foreach d in array defs loop execute d; end loop;
end $do$;

-- 4) e-mails gerados a partir do nome (o translate do seed também saiu errado)
update public.tutores
   set email = lower(translate(split_part(nome, ' ', 1), U&'\00E1\00E2\00E3\00E9\00EA\00ED\00F3\00F4\00F5\00FA\00E7\00C1\00C9\00CD\00D3\00DA', 'aaaeeioooucAEIOU'))
            || '.' || lower(translate(split_part(nome, ' ', 2), U&'\00E1\00E2\00E3\00E9\00EA\00ED\00F3\00F4\00F5\00FA\00E7', 'aaaeeiooouc'))
            || id || '@email.com'
 where email like '%@email.com';

commit;

select 'pets' as tabela, count(*) filter (where nome ~ '[^\x01-\x7F]') as com_acento from public.pets
union all select 'veterinarios', count(*) filter (where array_to_string(especialidades, ',') ~ '[^\x01-\x7F]') from public.veterinarios;
