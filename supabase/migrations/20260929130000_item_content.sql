-- M4-02D: allow validated item content (battle and material items, e.g. the Crown Shard) in the
-- read-only content seed.
alter table public.content_items drop constraint content_items_kind_check;
alter table public.content_items add constraint content_items_kind_check
  check (kind in ('unit', 'item', 'enemy', 'stage', 'banner'));
