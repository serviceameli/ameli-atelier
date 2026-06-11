-- ============================================================
-- RLS: временные политики allow all (до добавления авторизации)
-- TODO: заменить в сессии 2 на политики с auth.uid()
-- ============================================================

do $$
declare
  t text;
  tables text[] := array[
    'suppliers','fabric_types','colors','color_suppliers',
    'seamstresses','locations','product_types','sewing_prices','pricing_rules',
    'rolls','pieces','movements','orders','order_items',
    'reservations','consumptions',
    'consumables','consumable_stock','consumable_color_compat',
    'consumable_product_compat','consumable_receipts','consumable_usage'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy allow_all on %I for all using (true) with check (true)',
      t
    );
  end loop;
end $$;
