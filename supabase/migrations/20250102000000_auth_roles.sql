-- ============================================================
-- Сессия 2: авторизация и роли
-- ============================================================

-- Роли пользователей
do $$ begin
  create type user_role as enum ('owner', 'manager');
exception when duplicate_object then null; end $$;

create table if not exists user_profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  role      user_role not null default 'manager',
  name      text,                          -- отображаемое имя
  created_at timestamptz not null default now()
);

-- При регистрации автоматически создаём профиль с ролью manager
create or replace function handle_new_user() returns trigger as $$
begin
  insert into user_profiles (id, role, name)
  values (new.id, 'manager', new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger trg_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

-- RLS для user_profiles
alter table user_profiles enable row level security;

create policy "users can read own profile"
  on user_profiles for select
  using (auth.uid() = id);

create policy "owners can read all profiles"
  on user_profiles for select
  using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'owner')
  );

create policy "owners can update roles"
  on user_profiles for update
  using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'owner')
  );

-- ============================================================
-- Обновляем RLS на основных таблицах: только авторизованные
-- ============================================================

-- Вспомогательная функция: проверить роль текущего пользователя
create or replace function current_user_role() returns user_role as $$
  select role from user_profiles where id = auth.uid()
$$ language sql security definer stable;

-- Справочники: читают все авторизованные, пишут только owner
do $$ declare t text;
tables text[] := array['suppliers','fabric_types','colors','color_suppliers',
  'seamstresses','locations','product_types','sewing_prices','pricing_rules'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists allow_all on %I', t);
    execute format('
      create policy "auth read" on %I for select using (auth.uid() is not null)', t);
    execute format('
      create policy "owner write" on %I for insert with check (current_user_role() = ''owner'')', t);
    execute format('
      create policy "owner update" on %I for update using (current_user_role() = ''owner'')', t);
    execute format('
      create policy "owner delete" on %I for delete using (current_user_role() = ''owner'')', t);
  end loop;
end $$;

-- Складские операции: читают все, пишут все авторизованные
do $$ declare t text;
tables text[] := array['rolls','pieces','movements','reservations','consumptions'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists allow_all on %I', t);
    execute format('
      create policy "auth read" on %I for select using (auth.uid() is not null)', t);
    execute format('
      create policy "auth write" on %I for insert with check (auth.uid() is not null)', t);
    execute format('
      create policy "auth update" on %I for update using (auth.uid() is not null)', t);
  end loop;
end $$;

-- Заказы: читают/пишут все авторизованные, удаляет только owner
do $$ declare t text;
tables text[] := array['orders','order_items'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists allow_all on %I', t);
    execute format('
      create policy "auth read" on %I for select using (auth.uid() is not null)', t);
    execute format('
      create policy "auth write" on %I for insert with check (auth.uid() is not null)', t);
    execute format('
      create policy "auth update" on %I for update using (auth.uid() is not null)', t);
    execute format('
      create policy "owner delete" on %I for delete using (current_user_role() = ''owner'')', t);
  end loop;
end $$;

-- Фурнитура
do $$ declare t text;
tables text[] := array['consumables','consumable_stock','consumable_color_compat',
  'consumable_product_compat','consumable_receipts','consumable_usage'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists allow_all on %I', t);
    execute format('
      create policy "auth read" on %I for select using (auth.uid() is not null)', t);
    execute format('
      create policy "auth write" on %I for insert with check (auth.uid() is not null)', t);
    execute format('
      create policy "auth update" on %I for update using (auth.uid() is not null)', t);
  end loop;
end $$;
