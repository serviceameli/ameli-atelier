-- ============================================================
-- Сессия 3: модуль заказов — автоинкремент human_id
-- ============================================================

create sequence if not exists order_seq start 1;

create or replace function set_order_human_id() returns trigger as $$
begin
  if new.human_id is null then
    new.human_id := 'З-' || lpad(nextval('order_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger trg_order_human_id
  before insert on orders
  for each row execute function set_order_human_id();
