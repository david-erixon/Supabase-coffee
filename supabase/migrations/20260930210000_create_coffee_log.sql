create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ean text,
  roaster text not null check (length(trim(roaster)) > 0),
  name text not null check (length(trim(name)) > 0),
  origin_country text,
  roast_level text check (roast_level in ('light', 'medium', 'dark')),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique nulls not distinct (user_id, ean),
  check (ean is null or ean ~ '^[0-9]{8,14}$')
);

create table public.tastings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null,
  rating smallint not null check (rating between 1 and 5),
  tasted_on date not null default current_date,
  note text check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products(id, user_id) on delete cascade
);

create index tastings_user_date_idx on public.tastings (user_id, tasted_on desc, created_at desc);

alter table public.products enable row level security;
alter table public.tastings enable row level security;

create policy "Users manage their own products"
  on public.products for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own tastings"
  on public.tastings for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
