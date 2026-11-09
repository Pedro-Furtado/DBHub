-- ════════════════════════════════════════════════════════════════════
--  DBHub · banco de exemplo — "Clínica Veterinária Patas & Cia"
--
--  Cria um banco de teste com tipos variados para explorar o DBHub:
--  enum, uuid, serial, numeric, boolean, jsonb, text[], date, timestamptz,
--  chaves estrangeiras, PK composta, uma view e uma tabela SEM chave primária.
--
--  Pode rodar quantas vezes quiser: apaga e recria tudo do zero.
--  Execute no SQL Editor do DBHub (Ctrl + Enter).
-- ════════════════════════════════════════════════════════════════════

drop schema if exists financeiro cascade;
drop view if exists public.agenda_do_dia;
drop table if exists public.logs_importacao, public.itens_venda, public.vendas, public.produtos,
  public.pet_vacinas, public.vacinas, public.consultas, public.pets, public.tutores, public.veterinarios cascade;
drop type if exists public.especie, public.status_consulta;

create type public.especie as enum ('cachorro', 'gato', 'ave', 'roedor', 'réptil');
create type public.status_consulta as enum ('agendada', 'confirmada', 'realizada', 'cancelada', 'faltou');

-- ── Pessoas ─────────────────────────────────────────────────────────
create table public.tutores (
  id          serial primary key,
  nome        text not null,
  email       text unique,
  telefone    varchar(20),
  cpf         char(14) unique,
  cidade      text not null default 'Palmas',
  uf          char(2) not null default 'TO',
  aceita_whatsapp boolean not null default true,
  observacoes text,
  criado_em   timestamptz not null default now()
);
comment on table public.tutores is 'Donos dos pets';

create table public.veterinarios (
  id            serial primary key,
  nome          text not null,
  crmv          varchar(20) not null unique,
  especialidades text[] not null default '{}',
  ativo         boolean not null default true,
  plantonista   boolean not null default false
);

-- ── Pets e atendimento ──────────────────────────────────────────────
create table public.pets (
  id             uuid primary key default gen_random_uuid(),
  tutor_id       integer not null references public.tutores(id) on delete cascade,
  nome           text not null,
  especie        public.especie not null,
  raca           text,
  sexo           char(1) check (sexo in ('M', 'F')),
  nascimento     date,
  peso_kg        numeric(5,2),
  castrado       boolean not null default false,
  alergias       text[],
  ficha          jsonb,
  criado_em      timestamptz not null default now()
);
create index pets_tutor_idx on public.pets(tutor_id);

create table public.consultas (
  id              bigserial primary key,
  pet_id          uuid not null references public.pets(id) on delete cascade,
  veterinario_id  integer references public.veterinarios(id),
  agendada_para   timestamptz not null,
  status          public.status_consulta not null default 'agendada',
  motivo          text not null,
  diagnostico     text,
  valor           numeric(10,2),
  pago            boolean not null default false,
  emergencia      boolean not null default false
);
create index consultas_data_idx on public.consultas(agendada_para);

create table public.vacinas (
  id        serial primary key,
  nome      text not null unique,
  especie   public.especie not null,
  reforco_dias integer
);

-- PK composta: um pet pode tomar a mesma vacina em datas diferentes
create table public.pet_vacinas (
  pet_id      uuid not null references public.pets(id) on delete cascade,
  vacina_id   integer not null references public.vacinas(id),
  aplicada_em date not null,
  lote        varchar(30),
  primary key (pet_id, vacina_id, aplicada_em)
);

-- ── Loja ────────────────────────────────────────────────────────────
create table public.produtos (
  id          serial primary key,
  sku         varchar(20) not null unique,
  nome        text not null,
  categoria   text not null,
  preco       numeric(10,2) not null check (preco >= 0),
  estoque     integer not null default 0,
  ativo       boolean not null default true,
  atributos   jsonb not null default '{}'
);

create table public.vendas (
  id          bigserial primary key,
  tutor_id    integer references public.tutores(id) on delete set null,
  vendida_em  timestamptz not null default now(),
  forma_pagamento text not null check (forma_pagamento in ('pix', 'cartão', 'dinheiro', 'boleto')),
  desconto    numeric(10,2) not null default 0
);

create table public.itens_venda (
  id          bigserial primary key,
  venda_id    bigint not null references public.vendas(id) on delete cascade,
  produto_id  integer not null references public.produtos(id),
  quantidade  integer not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null
);

-- Tabela SEM chave primária: o DBHub deve exibir, mas bloquear edição
create table public.logs_importacao (
  arquivo     text,
  linhas      integer,
  status      text,
  importado_em timestamptz default now()
);

-- Outro schema, para testar o agrupamento na lista de tabelas
create schema financeiro;
create table financeiro.contas_a_pagar (
  id          serial primary key,
  descricao   text not null,
  fornecedor  text,
  vencimento  date not null,
  valor       numeric(12,2) not null,
  paga        boolean not null default false
);

-- ════════════════════════════════════════════════════════════════════
--  DADOS
-- ════════════════════════════════════════════════════════════════════

insert into public.veterinarios (nome, crmv, especialidades, plantonista) values
  ('Dra. Marina Albuquerque', 'CRMV-TO 1234', '{clínica geral,dermatologia}', false),
  ('Dr. Rafael Monteiro',     'CRMV-TO 1587', '{cirurgia,ortopedia}', true),
  ('Dra. Beatriz Nogueira',   'CRMV-TO 2011', '{felinos,clínica geral}', false),
  ('Dr. Thiago Barros',       'CRMV-TO 2240', '{silvestres,exóticos}', true),
  ('Dra. Camila Rezende',     'CRMV-TO 2398', '{cardiologia}', false);

-- 120 tutores com nomes brasileiros
insert into public.tutores (nome, email, telefone, cpf, cidade, uf, aceita_whatsapp, observacoes, criado_em)
select
  n.nome || ' ' || s.sobrenome,
  case when g % 9 = 0 then null
       else lower(translate(n.nome, 'áâãéêíóôõúçÁÉÍÓÚ', 'aaaeeioooucAEIOU')) || '.' ||
            lower(translate(s.sobrenome, 'áâãéêíóôõúç', 'aaaeeiooouc')) || g || '@email.com' end,
  '(63) 9' || lpad(((g * 7919) % 10000)::text, 4, '0') || '-' || lpad(((g * 104729) % 10000)::text, 4, '0'),
  lpad((g * 3)::text, 3, '0') || '.' || lpad((g * 7 % 1000)::text, 3, '0') || '.' || lpad((g * 11 % 1000)::text, 3, '0') || '-' || lpad((g % 100)::text, 2, '0'),
  (array['Palmas','Palmas','Palmas','Porto Nacional','Paraíso do Tocantins','Gurupi','Araguaína'])[1 + g % 7],
  'TO',
  g % 5 <> 0,
  case when g % 13 = 0 then 'Prefere atendimento no fim da tarde' when g % 17 = 0 then 'Cliente VIP' end,
  now() - (g || ' days')::interval
from generate_series(1, 120) g
cross join lateral (select (array['Ana','Bruno','Carla','Diego','Eduarda','Felipe','Gabriela','Henrique','Isabela','João','Larissa','Marcos','Natália','Otávio','Patrícia','Rodrigo','Sabrina','Tiago','Vanessa','William'])[1 + g % 20] as nome) n
cross join lateral (select (array['Silva','Souza','Oliveira','Lima','Pereira','Costa','Rocha','Almeida','Carvalho','Ribeiro','Martins','Araújo'])[1 + (g * 7) % 12] as sobrenome) s;

-- 1 a 3 pets por tutor
insert into public.pets (tutor_id, nome, especie, raca, sexo, nascimento, peso_kg, castrado, alergias, ficha, criado_em)
select
  t.id,
  (array['Thor','Mel','Luna','Bob','Nina','Fred','Amora','Zeus','Pipoca','Bela','Simba','Lola','Tobias','Paçoca','Frida','Jade','Chico','Maya'])[1 + (t.id * 3 + p) % 18],
  e.especie,
  case e.especie
    when 'cachorro' then (array['SRD','Golden Retriever','Shih Tzu','Labrador','Spitz Alemão','Pinscher','Border Collie'])[1 + (t.id + p) % 7]
    when 'gato'     then (array['SRD','Siamês','Persa','Maine Coon'])[1 + (t.id + p) % 4]
    when 'ave'      then (array['Calopsita','Periquito','Papagaio'])[1 + (t.id + p) % 3]
    when 'roedor'   then (array['Hamster','Porquinho-da-índia'])[1 + (t.id + p) % 2]
    else 'Jabuti'
  end,
  case when (t.id + p) % 2 = 0 then 'M' else 'F' end,
  current_date - ((300 + (t.id * 97 + p * 53) % 4000) || ' days')::interval,
  case e.especie
    when 'cachorro' then round((3 + (t.id * 13 + p * 7) % 35 + ((t.id + p) % 10) / 10.0)::numeric, 2)
    when 'gato'     then round((2.5 + (t.id + p) % 5 + ((t.id * 3) % 10) / 10.0)::numeric, 2)
    else round((0.1 + ((t.id + p) % 9) / 10.0)::numeric, 2)
  end,
  (t.id + p) % 3 <> 0,
  case when (t.id + p) % 11 = 0 then '{dipirona}'::text[] when (t.id + p) % 7 = 0 then '{frango,trigo}'::text[] end,
  jsonb_build_object(
    'microchip', (t.id * 1000 + p)::text,
    'temperamento', (array['dócil','agitado','medroso','agressivo com outros animais'])[1 + (t.id + p) % 4],
    'plano_saude', (t.id + p) % 4 = 0
  ),
  t.criado_em + interval '1 hour'
from public.tutores t
cross join generate_series(1, 1 + t.id % 3) p
cross join lateral (
  select (case
    when (t.id + p) % 10 < 6 then 'cachorro'
    when (t.id + p) % 10 < 9 then 'gato'
    else (array['ave','roedor','réptil'])[1 + t.id % 3]
  end)::public.especie as especie
) e;

-- Consultas nos últimos 90 dias e próximos 14 dias
insert into public.consultas (pet_id, veterinario_id, agendada_para, status, motivo, diagnostico, valor, pago, emergencia)
select
  p.id,
  1 + (row_number() over () % 5)::int,
  date_trunc('hour', now()) - ((r * 37 % 104) - 14 || ' days')::interval + ((8 + r % 10) || ' hours')::interval - date_trunc('hour', now())::time::interval,
  case
    when (r * 37 % 104) - 14 < 0 then (array['agendada','confirmada'])[1 + r % 2]::public.status_consulta
    else (array['realizada','realizada','realizada','cancelada','faltou'])[1 + r % 5]::public.status_consulta
  end,
  (array['Vacinação','Consulta de rotina','Vômito e diarreia','Coceira intensa','Check-up','Retorno pós-cirúrgico','Mancando da pata traseira','Castração','Limpeza dentária'])[1 + r % 9],
  case when (r * 37 % 104) - 14 >= 0 and r % 5 < 3
       then (array['Saudável','Dermatite alérgica','Gastroenterite','Otite','Tártaro','Luxação leve'])[1 + r % 6] end,
  (array[120, 150, 180, 250, 90, 380, 650])[1 + r % 7]::numeric(10,2),
  (r * 37 % 104) - 14 >= 0 and r % 5 < 3 and r % 8 <> 0,
  r % 23 = 0
from (select id, row_number() over (order by criado_em, id) as r from public.pets) p
cross join generate_series(1, 2) rep;

insert into public.vacinas (nome, especie, reforco_dias) values
  ('V10 (polivalente)', 'cachorro', 365),
  ('Antirrábica', 'cachorro', 365),
  ('Gripe canina', 'cachorro', 365),
  ('Giárdia', 'cachorro', 365),
  ('V4 felina', 'gato', 365),
  ('Antirrábica felina', 'gato', 365),
  ('FeLV', 'gato', 365);

insert into public.pet_vacinas (pet_id, vacina_id, aplicada_em, lote)
select p.id, v.id, current_date - ((p.r * 31 + v.id * 17) % 700 || ' days')::interval, 'L' || (2026000 + (p.r * v.id) % 999)
from (select id, especie, row_number() over (order by id) as r from public.pets) p
join public.vacinas v on v.especie = p.especie
where (p.r + v.id) % 3 <> 0;

insert into public.produtos (sku, nome, categoria, preco, estoque, ativo, atributos) values
  ('RAC-001', 'Ração Premium Cães Adultos 15kg', 'Ração', 289.90, 24, true, '{"marca":"NutriPet","peso_kg":15,"porte":"médio"}'),
  ('RAC-002', 'Ração Gatos Castrados 10kg', 'Ração', 239.90, 18, true, '{"marca":"FelinaMax","peso_kg":10}'),
  ('RAC-003', 'Ração Filhotes 3kg', 'Ração', 89.90, 40, true, '{"marca":"NutriPet","peso_kg":3,"porte":"pequeno"}'),
  ('PET-001', 'Petisco Ossinho 500g', 'Petiscos', 24.90, 120, true, '{"sabor":"carne"}'),
  ('PET-002', 'Sachê Gato Salmão', 'Petiscos', 4.50, 300, true, '{"sabor":"salmão"}'),
  ('HIG-001', 'Shampoo Hipoalergênico 500ml', 'Higiene', 39.90, 35, true, '{"volume_ml":500}'),
  ('HIG-002', 'Areia Higiênica 4kg', 'Higiene', 29.90, 60, true, '{"tipo":"bentonita"}'),
  ('HIG-003', 'Tapete Higiênico 30un', 'Higiene', 59.90, 0, true, '{"unidades":30}'),
  ('ACE-001', 'Coleira Antipulgas', 'Acessórios', 119.90, 15, true, '{"duracao_meses":8}'),
  ('ACE-002', 'Cama Pet Média', 'Acessórios', 149.90, 6, true, '{"cor":"cinza","tamanho":"M"}'),
  ('ACE-003', 'Arranhador Torre', 'Acessórios', 199.90, 4, true, '{"altura_cm":90}'),
  ('MED-001', 'Vermífugo Comprimido', 'Medicamentos', 34.90, 80, true, '{"dose":"1 comp/10kg"}'),
  ('MED-002', 'Antipulgas Pipeta', 'Medicamentos', 69.90, 45, true, '{"peso":"10-20kg"}'),
  ('BRI-001', 'Bolinha com Guizo', 'Brinquedos', 12.90, 90, true, '{}'),
  ('BRI-002', 'Mordedor Corda', 'Brinquedos', 19.90, 0, false, '{"descontinuado":true}');

-- 300 vendas com 1 a 4 itens
insert into public.vendas (tutor_id, vendida_em, forma_pagamento, desconto)
select
  case when g % 10 = 0 then null else 1 + (g * 13) % 120 end,
  now() - ((g * 7 % 120) || ' days')::interval - ((g * 53 % 600) || ' minutes')::interval,
  (array['pix','pix','pix','cartão','cartão','dinheiro','boleto'])[1 + g % 7],
  case when g % 6 = 0 then 10 else 0 end
from generate_series(1, 300) g;

insert into public.itens_venda (venda_id, produto_id, quantidade, preco_unitario)
select v.id, pr.id, 1 + (v.id + i) % 3, pr.preco
from public.vendas v
cross join generate_series(1, 1 + v.id % 4) i
join public.produtos pr on pr.id = 1 + ((v.id * 7 + i * 3) % 14);

insert into public.logs_importacao (arquivo, linhas, status, importado_em) values
  ('tutores_2025.csv', 98, 'ok', now() - interval '40 days'),
  ('tutores_2026.csv', 22, 'ok', now() - interval '10 days'),
  ('produtos_fornecedor.xlsx', 0, 'erro: coluna preço ausente', now() - interval '3 days'),
  ('produtos_fornecedor_v2.xlsx', 15, 'ok', now() - interval '3 days' + interval '20 minutes');

insert into financeiro.contas_a_pagar (descricao, fornecedor, vencimento, valor, paga)
select
  (array['Aluguel da clínica','Energia elétrica','Fornecedor de ração','Laboratório de exames','Internet','Folha de pagamento','Manutenção do raio-x'])[1 + g % 7],
  (array['Imobiliária Central','Energisa','NutriPet Distribuidora','LabVet Palmas','FibraTO','—','TecMed'])[1 + g % 7],
  date_trunc('month', current_date)::date + ((g * 5) % 60 - 30),
  (array[4500, 980.45, 7230, 1890.6, 199.9, 18500, 1200])[1 + g % 7],
  (g * 5) % 60 - 30 < 0
from generate_series(1, 28) g;

-- ── View ────────────────────────────────────────────────────────────
create view public.agenda_do_dia as
select c.agendada_para, p.nome as pet, p.especie, t.nome as tutor, t.telefone, v.nome as veterinario, c.motivo, c.status
from public.consultas c
join public.pets p on p.id = c.pet_id
join public.tutores t on t.id = p.tutor_id
left join public.veterinarios v on v.id = c.veterinario_id
where c.agendada_para::date = current_date
order by c.agendada_para;

-- Atualiza as estatísticas (contagem de linhas na lista de tabelas do DBHub)
analyze;

-- Resumo do que foi criado
select 'tutores' as tabela, count(*) as linhas from public.tutores
union all select 'pets', count(*) from public.pets
union all select 'consultas', count(*) from public.consultas
union all select 'pet_vacinas', count(*) from public.pet_vacinas
union all select 'produtos', count(*) from public.produtos
union all select 'vendas', count(*) from public.vendas
union all select 'itens_venda', count(*) from public.itens_venda
union all select 'financeiro.contas_a_pagar', count(*) from financeiro.contas_a_pagar;
