-- ============================================================
-- AMELI: система учёта ткани и пошива
-- Supabase (PostgreSQL). Версия 1.0
-- ============================================================

-- ===== ENUM-типы =====
do $$ begin
  create type location_kind as enum ('warehouse', 'seamstress', 'owner');
exception when duplicate_object then null; end $$;
do $$ begin
  create type order_kind as enum ('sewing', 'rework', 'repair', 'purchase');
exception when duplicate_object then null; end $$;
do $$ begin
  create type order_status as enum (
    'draft', 'pending', 'approved', 'fabric_needed',
    'in_progress', 'sewn', 'done', 'cancelled'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type stock_status as enum ('active', 'depleted', 'written_off');
exception when duplicate_object then null; end $$;
do $$ begin
  create type reservation_status as enum ('active', 'released', 'consumed');
exception when duplicate_object then null; end $$;

-- ===== СПРАВОЧНИКИ =====

create table if not exists suppliers (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique,
  phone text,
  note  text
);

create table if not exists fabric_types (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null unique,    -- Бархат, Габардин...
  site_alias            text,                    -- Бета, Альфа, Юми...
  default_width_m       numeric(5,2) not null,   -- 3.00 / 1.50
  default_roll_length_m numeric(6,2) not null default 32,
  needs_verification    boolean not null default false
);

create table if not exists colors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,                  -- Гранатовый
  code           text,                           -- 312-125
  fabric_type_id uuid not null references fabric_types(id),
  usage_note     text,                           -- «стулья, скатерти» / «салфетки, мини-фуфы»
  comment        text,
  active         boolean not null default true,
  unique (name, code, fabric_type_id)            -- два «Гранатовых» живут как разные записи
);

create table if not exists color_suppliers (                   -- у кого можно купить цвет
  color_id    uuid references colors(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  primary key (color_id, supplier_id)
);

create table if not exists seamstresses (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique,
  phone   text,
  active  boolean not null default true,
  comment text
);

create table if not exists locations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,            -- Склад, Елена, Кристина...
  kind          location_kind not null,
  seamstress_id uuid references seamstresses(id) -- заполнено для kind='seamstress'
);

create table if not exists product_types (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,        -- Скатерть круглая 330 см
  fabric_per_unit_m numeric(6,2),                -- расход ткани на 1 шт (для калькулятора)
  note              text
);

create table if not exists sewing_prices (
  id              uuid primary key default gen_random_uuid(),
  fabric_type_id  uuid references fabric_types(id),
  product_type_id uuid not null references product_types(id),
  price_rub       numeric(10,2) not null,
  includes_fabric boolean not null default true,
  note            text
);

create table if not exists pricing_rules (
  id             uuid primary key default gen_random_uuid(),
  fabric_type_id uuid references fabric_types(id), -- null = для всех
  rule_text      text not null                     -- мин. заказ, срочность
);

-- ===== ТКАНЬ: РУЛОНЫ И КУСКИ =====

create table if not exists rolls (
  id               uuid primary key default gen_random_uuid(),
  human_id         text unique,                  -- R-001 (читаемый номер)
  color_id         uuid not null references colors(id),
  initial_length_m numeric(6,2) not null,
  current_length_m numeric(6,2) not null,
  width_m          numeric(5,2),                 -- null = ширина типа ткани
  location_id      uuid not null references locations(id),
  status           stock_status not null default 'active',
  needs_remeasure  boolean not null default false,
  received_at      date,
  supplier_id      uuid references suppliers(id),
  original_note    text,                         -- исходная запись из старой таблицы
  created_at       timestamptz not null default now(),
  check (current_length_m >= 0),
  check (current_length_m <= initial_length_m)
);

create table if not exists pieces (
  id              uuid primary key default gen_random_uuid(),
  human_id        text unique,                   -- P-001
  color_id        uuid not null references colors(id),
  length_m        numeric(6,2),                  -- null = перемерить
  width_m         numeric(5,2),
  location_id     uuid not null references locations(id),
  status          stock_status not null default 'active',
  needs_remeasure boolean not null default false,
  source_roll_id  uuid references rolls(id),     -- из какого рулона родился
  original_note   text,
  created_at      timestamptz not null default now()
);

-- журнал передвижений (рулон ИЛИ кусок, ровно один)
create table if not exists movements (
  id               uuid primary key default gen_random_uuid(),
  roll_id          uuid references rolls(id),
  piece_id         uuid references pieces(id),
  from_location_id uuid references locations(id), -- null = приход от поставщика
  to_location_id   uuid not null references locations(id),
  moved_at         date not null default current_date,
  note             text,
  created_by       text,
  check (num_nonnulls(roll_id, piece_id) = 1)
);

-- ===== ЗАКАЗЫ =====

create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  human_id        text unique,                   -- Z-0001
  kind            order_kind not null default 'sewing',
  requires_fabric boolean not null default true, -- false для ремонта без перекроя
  title           text not null,
  status          order_status not null default 'draft',
  seamstress_id   uuid references seamstresses(id),
  is_urgent       boolean not null default false,
  urgency_pct     numeric(5,2) default 0,        -- наценка за срочность
  due_date        date,                          -- когда нужно клиенту
  given_at        date,                          -- отдано швее
  returned_at     date,                          -- получено от швеи
  estimate_rub    numeric(12,2),                 -- расчёт калькулятора
  brief           text,                          -- ТЗ для швеи
  comment         text,
  created_by      text,                          -- менеджер
  approved_by     text,                          -- Света/Наташа
  created_at      timestamptz not null default now()
);

create table if not exists order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  product_type_id uuid not null references product_types(id),
  color_id        uuid references colors(id),
  qty             integer not null check (qty > 0),
  fabric_est_m    numeric(7,2),                  -- расчётный расход ткани
  price_rub       numeric(10,2),
  note            text
);

-- ===== БРОНЬ И СПИСАНИЕ =====

-- бронь вешается на конкретный рулон/кусок
create table if not exists reservations (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references orders(id) on delete cascade,
  roll_id   uuid references rolls(id),
  piece_id  uuid references pieces(id),
  meters    numeric(7,2) not null check (meters > 0),
  status    reservation_status not null default 'active',
  created_at timestamptz not null default now(),
  check (num_nonnulls(roll_id, piece_id) = 1)
);

-- фактический расход: подтверждается вручную после пошива
create table if not exists consumptions (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id),
  roll_id      uuid references rolls(id),
  piece_id     uuid references pieces(id),
  meters       numeric(7,2) not null check (meters > 0),
  confirmed_at date not null default current_date,
  confirmed_by text,
  note         text,
  check (num_nonnulls(roll_id, piece_id) = 1)
);

-- триггер: подтверждение расхода уменьшает остаток рулона
create or replace function apply_consumption() returns trigger as $$
begin
  if new.roll_id is not null then
    update rolls set
      current_length_m = greatest(current_length_m - new.meters, 0),
      status = case when current_length_m - new.meters <= 0 then 'depleted' else status end
    where id = new.roll_id;
  elsif new.piece_id is not null then
    update pieces set status = 'written_off' where id = new.piece_id; -- кусок расходуется целиком
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_apply_consumption
after insert on consumptions
for each row execute function apply_consumption();

-- ===== ФУРНИТУРА =====

create table if not exists consumables (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,                       -- Молния рулонная s-226
  category  text not null,                       -- молния / бегунок / резинка / липучка / лента / нитки
  color_txt text,                                -- голубой сапфир
  code      text,                                -- s-226
  unit      text not null default 'шт'           -- шт / м / моток
);

create table if not exists consumable_stock (
  id            uuid primary key default gen_random_uuid(),
  consumable_id uuid not null references consumables(id) on delete cascade,
  location_id   uuid not null references locations(id),
  qty           numeric(10,2) not null default 0,
  updated_at    date,
  unique (consumable_id, location_id)
);

-- рекомендации совместимости (не жёсткие ограничения)
create table if not exists consumable_color_compat (
  consumable_id uuid references consumables(id) on delete cascade,
  color_id      uuid references colors(id) on delete cascade,
  primary key (consumable_id, color_id)
);

create table if not exists consumable_product_compat (
  consumable_id   uuid references consumables(id) on delete cascade,
  product_type_id uuid references product_types(id) on delete cascade,
  primary key (consumable_id, product_type_id)
);

-- приход фурнитуры (закупки)
create table if not exists consumable_receipts (
  id            uuid primary key default gen_random_uuid(),
  consumable_id uuid not null references consumables(id),
  location_id   uuid not null references locations(id),
  qty           numeric(10,2) not null check (qty > 0),
  price_rub     numeric(10,2),                  -- цена закупки (опционально)
  supplier_id   uuid references suppliers(id),
  received_at   date not null default current_date,
  note          text
);

-- расход фурнитуры по заказу (списание с конкретной локации)
create table if not exists consumable_usage (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id),
  consumable_id uuid not null references consumables(id),
  location_id   uuid not null references locations(id),
  qty           numeric(10,2) not null check (qty > 0),
  confirmed_at  date default current_date,
  note          text
);

-- триггеры: приход увеличивает остаток, расход уменьшает
create or replace function apply_consumable_receipt() returns trigger as $$
begin
  insert into consumable_stock (consumable_id, location_id, qty, updated_at)
  values (new.consumable_id, new.location_id, new.qty, new.received_at)
  on conflict (consumable_id, location_id)
  do update set qty = consumable_stock.qty + new.qty, updated_at = new.received_at;
  return new;
end;
$$ language plpgsql;

create trigger trg_consumable_receipt
after insert on consumable_receipts
for each row execute function apply_consumable_receipt();

create or replace function apply_consumable_usage() returns trigger as $$
begin
  update consumable_stock
  set qty = greatest(qty - new.qty, 0), updated_at = new.confirmed_at
  where consumable_id = new.consumable_id and location_id = new.location_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_consumable_usage
after insert on consumable_usage
for each row execute function apply_consumable_usage();

-- ===== ПРЕДСТАВЛЕНИЯ ДЛЯ ИНТЕРФЕЙСА =====

-- остатки и доступность по каждому рулону/куску
create or replace view v_stock as
select
  'roll' as kind, r.id, r.human_id, r.color_id, c.name as color_name, c.code,
  ft.name as fabric_type, r.current_length_m as length_m,
  coalesce(r.width_m, ft.default_width_m) as width_m,
  l.name as location, r.needs_remeasure, r.original_note,
  coalesce((select sum(meters) from reservations
            where roll_id = r.id and status = 'active'), 0) as reserved_m,
  r.current_length_m - coalesce((select sum(meters) from reservations
            where roll_id = r.id and status = 'active'), 0) as available_m
from rolls r
join colors c on c.id = r.color_id
join fabric_types ft on ft.id = c.fabric_type_id
join locations l on l.id = r.location_id
where r.status = 'active'
union all
select
  'piece', p.id, p.human_id, p.color_id, c.name, c.code,
  ft.name, p.length_m, p.width_m, l.name, p.needs_remeasure, p.original_note,
  coalesce((select sum(meters) from reservations
            where piece_id = p.id and status = 'active'), 0),
  coalesce(p.length_m, 0) - coalesce((select sum(meters) from reservations
            where piece_id = p.id and status = 'active'), 0)
from pieces p
join colors c on c.id = p.color_id
join fabric_types ft on ft.id = c.fabric_type_id
join locations l on l.id = p.location_id
where p.status = 'active';

-- сводка по цвету: всего / бронь / свободно
create or replace view v_stock_by_color as
select color_id, color_name, code, fabric_type,
  sum(coalesce(length_m,0))  as total_m,
  sum(reserved_m)            as reserved_m,
  sum(available_m)           as available_m,
  count(*) filter (where needs_remeasure) as items_to_remeasure
from v_stock
group by color_id, color_name, code, fabric_type;

-- загруженность швей: активные заказы
create or replace view v_seamstress_load as
select s.id, s.name,
  count(o.id) filter (where o.status in ('approved','in_progress')) as active_orders,
  count(o.id) filter (where o.is_urgent and o.status in ('approved','in_progress')) as urgent_orders,
  min(o.due_date) filter (where o.status in ('approved','in_progress')) as nearest_due
from seamstresses s
left join orders o on o.seamstress_id = s.id
where s.active
group by s.id, s.name;
