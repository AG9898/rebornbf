-- M5-01E: allow validated summon banners in the read-only content seed.
alter table public.content_items drop constraint content_items_kind_check;
alter table public.content_items add constraint content_items_kind_check
  check (kind in ('unit', 'enemy', 'stage', 'banner'));
