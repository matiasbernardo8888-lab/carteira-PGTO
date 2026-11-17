-- ============================================================
-- NEXUS PAY — Schema Supabase (PostgreSQL 15+)
-- Gateway de pagamentos: lojistas, cobranças, ledger, saques, webhooks
-- Convenções: valores em CENTAVOS (bigint), datas em timestamptz (UTC)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Utilitários
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ------------------------------------------------------------
-- merchants: o lojista (empresa ou pessoa física)
-- ------------------------------------------------------------
create table public.merchants (
  id                uuid primary key default gen_random_uuid(),
  legal_name        text not null,
  trade_name        text,
  document_type     text not null check (document_type in ('cnpj','cpf')),
  document          text not null unique,               -- somente dígitos
  email             text not null,
  phone             text,
  segment           text,
  website           text,
  kyc_status        text not null default 'pending'
                    check (kyc_status in ('pending','under_review','approved','rejected')),
  kyc_rejection_reason text,
  fee_plan_id       uuid,
  daily_payout_limit bigint not null default 500000,    -- R$ 5.000,00
  two_factor_enabled boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger merchants_updated_at before update on public.merchants
  for each row execute function public.set_updated_at();

-- membros (usuários do Supabase Auth com acesso ao lojista)
create table public.merchant_members (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner','admin','finance','developer','viewer')),
  created_at  timestamptz not null default now(),
  primary key (merchant_id, user_id)
);
create index idx_members_user on public.merchant_members(user_id);

-- helpers de RLS (security definer evita recursão de policy)
create or replace function public.is_member(p_merchant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merchant_members
    where merchant_id = p_merchant and user_id = auth.uid()
  );
$$;

create or replace function public.has_role(p_merchant uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merchant_members
    where merchant_id = p_merchant and user_id = auth.uid() and role = any(p_roles)
  );
$$;

-- permite chamadas internas (service_role não tem auth.uid())
create or replace function public.is_member_or_service(p_merchant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.role() = 'service_role' or public.is_member(p_merchant);
$$;

-- ------------------------------------------------------------
-- KYC
-- ------------------------------------------------------------
create table public.kyc_representatives (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  full_name    text not null,
  cpf          text not null,
  birth_date   date not null,
  is_legal_rep boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.kyc_documents (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  kind         text not null check (kind in ('id_front','id_back','selfie','proof_of_address','cnpj_card','social_contract')),
  storage_path text not null,                            -- bucket privado 'kyc'
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now()
);
create index idx_kyc_docs_merchant on public.kyc_documents(merchant_id);

-- ------------------------------------------------------------
-- Conta bancária para saque
-- ------------------------------------------------------------
create table public.bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references public.merchants(id) on delete cascade,
  bank_code     text not null,
  agency        text not null,
  account       text not null,
  account_type  text not null check (account_type in ('checking','savings')),
  holder_name   text not null,
  holder_document text not null,
  pix_key       text,
  pix_key_type  text check (pix_key_type in ('cpf','cnpj','email','phone','random')),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index idx_bank_accounts_merchant on public.bank_accounts(merchant_id);
create unique index uq_bank_default on public.bank_accounts(merchant_id) where is_default;

-- ------------------------------------------------------------
-- Planos de taxa
-- ------------------------------------------------------------
create table public.fee_plans (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  pix_percent_bps    integer not null default 99,     -- 0,99% (basis points)
  pix_fixed          bigint  not null default 0,
  boleto_percent_bps integer not null default 0,
  boleto_fixed       bigint  not null default 349,     -- R$ 3,49
  card_percent_bps   integer not null default 349,     -- 3,49%
  card_fixed         bigint  not null default 39,
  card_installment_bps integer not null default 199,   -- + por parcela adicional
  payout_fixed       bigint  not null default 367,     -- taxa de saque
  pix_release_days   integer not null default 0,
  boleto_release_days integer not null default 1,
  card_release_days  integer not null default 30,
  created_at         timestamptz not null default now()
);
alter table public.merchants
  add constraint merchants_fee_plan_fk foreign key (fee_plan_id) references public.fee_plans(id);

insert into public.fee_plans (name) values ('Padrão');

-- ------------------------------------------------------------
-- Chaves de API (apenas o hash é armazenado)
-- ------------------------------------------------------------
create table public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name        text not null,
  mode        text not null check (mode in ('test','live')),
  prefix      text not null,                           -- ex.: sk_live_a1b2 (exibível)
  key_hash    text not null unique,                    -- sha256 hex da chave completa
  last_used_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_api_keys_merchant on public.api_keys(merchant_id);

-- ------------------------------------------------------------
-- Clientes do lojista (pagadores)
-- ------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name        text not null,
  document    text,
  email       text,
  phone       text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index idx_customers_merchant on public.customers(merchant_id, created_at desc);
create index idx_customers_email on public.customers(merchant_id, email);

-- ------------------------------------------------------------
-- Links de pagamento
-- ------------------------------------------------------------
create table public.payment_links (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references public.merchants(id) on delete cascade,
  slug          text not null unique,
  name          text not null,
  description   text,
  amount        bigint check (amount is null or amount >= 100),   -- null = valor aberto
  methods       text[] not null default array['pix','card','boleto'],
  max_installments integer not null default 1 check (max_installments between 1 and 12),
  expires_at    timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index idx_links_merchant on public.payment_links(merchant_id);

-- ------------------------------------------------------------
-- Cobranças
-- ------------------------------------------------------------
create table public.charges (
  id              uuid primary key default gen_random_uuid(),
  public_id       text not null unique default ('ch_' || encode(gen_random_bytes(10), 'hex')),
  merchant_id     uuid not null references public.merchants(id) on delete restrict,
  customer_id     uuid references public.customers(id) on delete set null,
  payment_link_id uuid references public.payment_links(id) on delete set null,
  mode            text not null default 'live' check (mode in ('test','live')),
  method          text not null check (method in ('pix','card','boleto')),
  status          text not null default 'pending'
                  check (status in ('pending','paid','failed','expired','canceled',
                                    'refunded','partially_refunded','chargeback')),
  amount          bigint not null check (amount >= 100),
  fee             bigint not null default 0 check (fee >= 0),
  net_amount      bigint generated always as (amount - fee) stored,
  refunded_amount bigint not null default 0 check (refunded_amount >= 0),
  installments    integer not null default 1 check (installments between 1 and 12),
  description     text,
  metadata        jsonb not null default '{}',
  idempotency_key text,
  provider        text,                                 -- nome do PSP
  provider_charge_id text,
  payment_details jsonb not null default '{}',          -- qr_code, copy_paste, boleto_line, card_brand, last4
  failure_code    text,
  expires_at      timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint charges_refund_lte_amount check (refunded_amount <= amount)
);
create unique index uq_charges_idempotency on public.charges(merchant_id, idempotency_key)
  where idempotency_key is not null;
create unique index uq_charges_provider on public.charges(provider, provider_charge_id)
  where provider_charge_id is not null;
create index idx_charges_merchant_created on public.charges(merchant_id, created_at desc);
create index idx_charges_merchant_status on public.charges(merchant_id, status);
create index idx_charges_expiring on public.charges(expires_at) where status = 'pending';
create trigger charges_updated_at before update on public.charges
  for each row execute function public.set_updated_at();

-- linha do tempo da cobrança (auditoria de status)
create table public.charge_events (
  id          bigint generated always as identity primary key,
  charge_id   uuid not null references public.charges(id) on delete cascade,
  type        text not null,                            -- created, paid, failed, expired, refunded...
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index idx_charge_events_charge on public.charge_events(charge_id, created_at);

-- ------------------------------------------------------------
-- Reembolsos
-- ------------------------------------------------------------
create table public.refunds (
  id          uuid primary key default gen_random_uuid(),
  charge_id   uuid not null references public.charges(id) on delete restrict,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  amount      bigint not null check (amount > 0),
  reason      text,
  status      text not null default 'pending' check (status in ('pending','completed','failed')),
  created_at  timestamptz not null default now()
);
create index idx_refunds_charge on public.refunds(charge_id);

-- ------------------------------------------------------------
-- LEDGER (partida dobrada, imutável)
-- ------------------------------------------------------------
create table public.ledger_accounts (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.merchants(id) on delete restrict,   -- null = conta da plataforma
  kind        text not null check (kind in ('merchant_balance','merchant_reserve',
                                            'platform_fees','provider_clearing','payout_clearing')),
  created_at  timestamptz not null default now()
);
create unique index uq_ledger_merchant_kind on public.ledger_accounts(merchant_id, kind)
  where merchant_id is not null;
create unique index uq_ledger_platform_kind on public.ledger_accounts(kind)
  where merchant_id is null;

insert into public.ledger_accounts (merchant_id, kind) values
  (null,'platform_fees'), (null,'provider_clearing'), (null,'payout_clearing');

create table public.ledger_transactions (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid references public.merchants(id) on delete restrict,
  kind         text not null check (kind in ('charge_paid','refund','payout','payout_failed','adjustment','chargeback')),
  charge_id    uuid references public.charges(id),
  payout_id    uuid,
  description  text,
  created_at   timestamptz not null default now()
);
create index idx_ledger_tx_merchant on public.ledger_transactions(merchant_id, created_at desc);

-- amount: positivo = crédito na conta, negativo = débito. Cada transação soma zero.
create table public.ledger_entries (
  id             bigint generated always as identity primary key,
  transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  account_id     uuid not null references public.ledger_accounts(id) on delete restrict,
  amount         bigint not null check (amount <> 0),
  available_at   timestamptz not null default now(),     -- a partir de quando conta como disponível
  created_at     timestamptz not null default now()
);
create index idx_ledger_entries_account on public.ledger_entries(account_id, available_at);
create index idx_ledger_entries_tx on public.ledger_entries(transaction_id);

-- imutabilidade
create or replace function public.ledger_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'ledger_entries e ledger_transactions são imutáveis';
end $$;
create trigger ledger_entries_immutable before update or delete on public.ledger_entries
  for each row execute function public.ledger_block_mutation();
create trigger ledger_tx_immutable before update or delete on public.ledger_transactions
  for each row execute function public.ledger_block_mutation();

-- toda transação precisa somar zero (checado no commit)
create or replace function public.ledger_check_balanced()
returns trigger language plpgsql as $$
declare v_sum bigint;
begin
  select coalesce(sum(amount),0) into v_sum
  from public.ledger_entries where transaction_id = new.transaction_id;
  if v_sum <> 0 then
    raise exception 'transação % não está balanceada (soma = %)', new.transaction_id, v_sum;
  end if;
  return null;
end $$;
create constraint trigger ledger_balanced
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.ledger_check_balanced();

-- ------------------------------------------------------------
-- Saques
-- ------------------------------------------------------------
create table public.payouts (
  id              uuid primary key default gen_random_uuid(),
  public_id       text not null unique default ('po_' || encode(gen_random_bytes(10), 'hex')),
  merchant_id     uuid not null references public.merchants(id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  amount          bigint not null check (amount >= 1000),   -- mínimo R$ 10,00
  fee             bigint not null default 0 check (fee >= 0),
  status          text not null default 'requested'
                  check (status in ('requested','processing','completed','failed')),
  provider_payout_id text,
  failure_reason  text,
  idempotency_key text,
  requested_at    timestamptz not null default now(),
  completed_at    timestamptz,
  updated_at      timestamptz not null default now()
);
create unique index uq_payouts_idempotency on public.payouts(merchant_id, idempotency_key)
  where idempotency_key is not null;
create index idx_payouts_merchant on public.payouts(merchant_id, requested_at desc);
create trigger payouts_updated_at before update on public.payouts
  for each row execute function public.set_updated_at();

alter table public.ledger_transactions
  add constraint ledger_tx_payout_fk foreign key (payout_id) references public.payouts(id);

-- ------------------------------------------------------------
-- Webhooks (saída para o lojista)
-- ------------------------------------------------------------
create table public.webhook_endpoints (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  url         text not null check (url ~ '^https://'),
  secret      text not null default encode(gen_random_bytes(24), 'hex'),
  events      text[] not null default array['charge.paid','charge.failed','charge.expired','charge.refunded','payout.completed','payout.failed'],
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index idx_webhook_endpoints_merchant on public.webhook_endpoints(merchant_id);

create table public.webhook_deliveries (
  id             uuid primary key default gen_random_uuid(),
  endpoint_id    uuid not null references public.webhook_endpoints(id) on delete cascade,
  merchant_id    uuid not null references public.merchants(id) on delete cascade,
  event_type     text not null,
  payload        jsonb not null,
  status         text not null default 'pending' check (status in ('pending','delivered','failed')),
  attempts       integer not null default 0,
  next_attempt_at timestamptz default now(),
  last_status_code integer,
  last_error     text,
  created_at     timestamptz not null default now(),
  delivered_at   timestamptz
);
create index idx_webhook_deliveries_endpoint on public.webhook_deliveries(endpoint_id, created_at desc);
create index idx_webhook_deliveries_due on public.webhook_deliveries(next_attempt_at) where status = 'pending';

-- eventos recebidos do provedor (idempotência de entrada)
create table public.provider_events (
  id            bigint generated always as identity primary key,
  provider      text not null,
  event_id      text not null,
  type          text not null,
  payload       jsonb not null,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (provider, event_id)
);

-- log de requisições da API
create table public.api_request_logs (
  id          bigint generated always as identity primary key,
  merchant_id uuid references public.merchants(id) on delete cascade,
  api_key_id  uuid references public.api_keys(id) on delete set null,
  method      text not null,
  path        text not null,
  status_code integer not null,
  duration_ms integer,
  created_at  timestamptz not null default now()
);
create index idx_api_logs_merchant on public.api_request_logs(merchant_id, created_at desc);

-- auditoria de ações administrativas
create table public.audit_log (
  id          bigint generated always as identity primary key,
  merchant_id uuid references public.merchants(id) on delete cascade,
  actor_id    uuid,
  action      text not null,
  target      text,
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index idx_audit_merchant on public.audit_log(merchant_id, created_at desc);

-- ============================================================
-- FUNÇÕES DE NEGÓCIO
-- ============================================================

-- conta do ledger do lojista (cria sob demanda)
create or replace function public.ledger_account_for(p_merchant uuid, p_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.ledger_accounts where merchant_id = p_merchant and kind = p_kind;
  if v_id is null then
    insert into public.ledger_accounts (merchant_id, kind) values (p_merchant, p_kind)
    on conflict do nothing;
    select id into v_id from public.ledger_accounts where merchant_id = p_merchant and kind = p_kind;
  end if;
  return v_id;
end $$;

create or replace function public.platform_account(p_kind text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.ledger_accounts where merchant_id is null and kind = p_kind;
$$;

-- taxa de uma cobrança conforme plano do lojista
create or replace function public.calc_fee(p_merchant uuid, p_method text, p_amount bigint, p_installments integer default 1)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare p public.fee_plans;
        v_bps integer; v_fixed bigint;
begin
  select fp.* into p from public.fee_plans fp
  join public.merchants m on m.fee_plan_id = fp.id where m.id = p_merchant;
  if p.id is null then select * into p from public.fee_plans order by created_at limit 1; end if;

  if p_method = 'pix' then v_bps := p.pix_percent_bps; v_fixed := p.pix_fixed;
  elsif p_method = 'boleto' then v_bps := p.boleto_percent_bps; v_fixed := p.boleto_fixed;
  else
    v_bps := p.card_percent_bps + greatest(p_installments - 1, 0) * p.card_installment_bps;
    v_fixed := p.card_fixed;
  end if;
  return ceil(p_amount * v_bps / 10000.0)::bigint + v_fixed;
end $$;

-- confirma pagamento: atualiza cobrança e lança no ledger (idempotente)
create or replace function public.mark_charge_paid(p_charge uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.charges; p public.fee_plans; v_days integer; v_tx uuid;
begin
  select * into c from public.charges where id = p_charge for update;
  if c.id is null then raise exception 'cobrança não encontrada'; end if;
  if c.status <> 'pending' then return; end if;     -- já processada

  select fp.* into p from public.fee_plans fp
    join public.merchants m on m.fee_plan_id = fp.id where m.id = c.merchant_id;
  if p.id is null then select * into p from public.fee_plans order by created_at limit 1; end if;

  v_days := case c.method when 'pix' then p.pix_release_days
                          when 'boleto' then p.boleto_release_days
                          else p.card_release_days end;

  update public.charges set status = 'paid', paid_at = now() where id = c.id;
  insert into public.charge_events (charge_id, type) values (c.id, 'paid');

  if c.mode = 'live' then
    insert into public.ledger_transactions (merchant_id, kind, charge_id, description)
    values (c.merchant_id, 'charge_paid', c.id, 'Pagamento ' || c.public_id)
    returning id into v_tx;

    insert into public.ledger_entries (transaction_id, account_id, amount, available_at) values
      (v_tx, public.platform_account('provider_clearing'), -c.amount, now()),
      (v_tx, public.ledger_account_for(c.merchant_id, 'merchant_balance'), c.amount - c.fee,
         now() + make_interval(days => v_days)),
      (v_tx, public.platform_account('platform_fees'), c.fee, now());
  end if;
end $$;

-- saldos do lojista em centavos
create or replace function public.get_balance(p_merchant uuid)
returns table (available bigint, pending bigint, blocked bigint)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(e.amount) filter (where a.kind = 'merchant_balance' and e.available_at <= now()), 0)::bigint,
    coalesce(sum(e.amount) filter (where a.kind = 'merchant_balance' and e.available_at >  now()), 0)::bigint,
    coalesce(sum(e.amount) filter (where a.kind = 'merchant_reserve'), 0)::bigint
  from public.ledger_accounts a
  join public.ledger_entries e on e.account_id = a.id
  where a.merchant_id = p_merchant
    and public.is_member_or_service(p_merchant);
$$;

-- solicita saque: valida KYC, limite diário e saldo; debita no ledger
create or replace function public.request_payout(p_merchant uuid, p_bank_account uuid, p_amount bigint, p_idempotency text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.merchants; p public.fee_plans; v_fee bigint; v_avail bigint;
        v_today bigint; v_id uuid; v_tx uuid;
begin
  if not public.is_member_or_service(p_merchant) then raise exception 'acesso negado'; end if;

  -- serializa saques do mesmo lojista
  perform pg_advisory_xact_lock(hashtextextended(p_merchant::text, 0));

  select * into m from public.merchants where id = p_merchant;
  if m.kyc_status <> 'approved' then raise exception 'KYC não aprovado'; end if;

  if p_idempotency is not null then
    select id into v_id from public.payouts where merchant_id = p_merchant and idempotency_key = p_idempotency;
    if v_id is not null then return v_id; end if;
  end if;

  if not exists (select 1 from public.bank_accounts where id = p_bank_account and merchant_id = p_merchant) then
    raise exception 'conta bancária inválida';
  end if;

  select fp.* into p from public.fee_plans fp where fp.id = m.fee_plan_id;
  if p.id is null then select * into p from public.fee_plans order by created_at limit 1; end if;
  v_fee := p.payout_fixed;

  select coalesce(sum(amount),0) into v_today from public.payouts
   where merchant_id = p_merchant and status <> 'failed' and requested_at >= date_trunc('day', now());
  if v_today + p_amount > m.daily_payout_limit then raise exception 'limite diário de saque excedido'; end if;

  select available into v_avail from public.get_balance(p_merchant);
  if v_avail < p_amount + v_fee then raise exception 'saldo disponível insuficiente'; end if;

  insert into public.payouts (merchant_id, bank_account_id, amount, fee, idempotency_key)
  values (p_merchant, p_bank_account, p_amount, v_fee, p_idempotency) returning id into v_id;

  insert into public.ledger_transactions (merchant_id, kind, payout_id, description)
  values (p_merchant, 'payout', v_id, 'Saque') returning id into v_tx;

  insert into public.ledger_entries (transaction_id, account_id, amount) values
    (v_tx, public.ledger_account_for(p_merchant, 'merchant_balance'), -(p_amount + v_fee)),
    (v_tx, public.platform_account('payout_clearing'), p_amount),
    (v_tx, public.platform_account('platform_fees'), v_fee);

  return v_id;
end $$;

-- saque falhou: devolve ao saldo disponível
create or replace function public.fail_payout(p_payout uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare po public.payouts; v_tx uuid;
begin
  select * into po from public.payouts where id = p_payout for update;
  if po.id is null or po.status in ('failed','completed') then return; end if;

  update public.payouts set status = 'failed', failure_reason = p_reason where id = po.id;

  insert into public.ledger_transactions (merchant_id, kind, payout_id, description)
  values (po.merchant_id, 'payout_failed', po.id, 'Estorno de saque') returning id into v_tx;

  insert into public.ledger_entries (transaction_id, account_id, amount) values
    (v_tx, public.ledger_account_for(po.merchant_id, 'merchant_balance'), po.amount + po.fee),
    (v_tx, public.platform_account('payout_clearing'), -po.amount),
    (v_tx, public.platform_account('platform_fees'), -po.fee);
end $$;

-- expira cobranças vencidas (chamar por cron a cada minuto)
create or replace function public.expire_pending_charges()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with x as (
    update public.charges set status = 'expired'
    where status = 'pending' and expires_at is not null and expires_at < now()
    returning id
  )
  insert into public.charge_events (charge_id, type) select id, 'expired' from x;
  get diagnostics n = row_count;
  return n;
end $$;

-- ============================================================
-- VIEWS do painel
-- ============================================================
create or replace view public.v_daily_volume with (security_invoker = true) as
select merchant_id,
       date_trunc('day', paid_at)::date as day,
       count(*)                          as charges,
       sum(amount)                       as gross,
       sum(fee)                          as fees,
       sum(net_amount)                   as net
from public.charges
where status in ('paid','partially_refunded') and mode = 'live'
group by merchant_id, date_trunc('day', paid_at);

create or replace view public.v_method_breakdown_30d with (security_invoker = true) as
select merchant_id, method, count(*) as charges, sum(amount) as gross
from public.charges
where status in ('paid','partially_refunded') and mode = 'live'
  and paid_at >= now() - interval '30 days'
group by merchant_id, method;

create or replace view public.v_approval_rate_30d with (security_invoker = true) as
select merchant_id,
       count(*) filter (where status in ('paid','partially_refunded','refunded')) as paid,
       count(*) filter (where status in ('failed','expired','canceled'))          as lost,
       round(100.0 * count(*) filter (where status in ('paid','partially_refunded','refunded'))
             / nullif(count(*) filter (where status not in ('pending')), 0), 1)   as approval_pct
from public.charges
where created_at >= now() - interval '30 days' and mode = 'live'
group by merchant_id;

-- ============================================================
-- ROW LEVEL SECURITY
-- Escritas financeiras (charges, ledger, payouts) são feitas pelo backend
-- com service_role; o painel só LÊ essas tabelas.
-- ============================================================
alter table public.merchants           enable row level security;
alter table public.merchant_members    enable row level security;
alter table public.kyc_representatives enable row level security;
alter table public.kyc_documents       enable row level security;
alter table public.bank_accounts       enable row level security;
alter table public.fee_plans           enable row level security;
alter table public.api_keys            enable row level security;
alter table public.customers           enable row level security;
alter table public.payment_links       enable row level security;
alter table public.charges             enable row level security;
alter table public.charge_events       enable row level security;
alter table public.refunds             enable row level security;
alter table public.ledger_accounts     enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries      enable row level security;
alter table public.payouts             enable row level security;
alter table public.webhook_endpoints   enable row level security;
alter table public.webhook_deliveries  enable row level security;
alter table public.provider_events     enable row level security;
alter table public.api_request_logs    enable row level security;
alter table public.audit_log           enable row level security;

-- leitura por membros
create policy "members read merchant"  on public.merchants for select using (public.is_member(id));
create policy "owners update merchant" on public.merchants for update
  using (public.has_role(id, array['owner','admin'])) with check (public.has_role(id, array['owner','admin']));
create policy "members read members"   on public.merchant_members for select using (public.is_member(merchant_id));

create policy "members read kyc reps"  on public.kyc_representatives for select using (public.is_member(merchant_id));
create policy "admins write kyc reps"  on public.kyc_representatives for all
  using (public.has_role(merchant_id, array['owner','admin'])) with check (public.has_role(merchant_id, array['owner','admin']));
create policy "members read kyc docs"  on public.kyc_documents for select using (public.is_member(merchant_id));
create policy "admins write kyc docs"  on public.kyc_documents for insert
  with check (public.has_role(merchant_id, array['owner','admin']));

create policy "finance read bank"      on public.bank_accounts for select using (public.is_member(merchant_id));
create policy "finance write bank"     on public.bank_accounts for all
  using (public.has_role(merchant_id, array['owner','admin','finance']))
  with check (public.has_role(merchant_id, array['owner','admin','finance']));

create policy "authenticated read fee plans" on public.fee_plans for select using (auth.role() = 'authenticated');

create policy "devs read keys"         on public.api_keys for select using (public.has_role(merchant_id, array['owner','admin','developer']));
create policy "devs revoke keys"       on public.api_keys for update
  using (public.has_role(merchant_id, array['owner','admin','developer']))
  with check (public.has_role(merchant_id, array['owner','admin','developer']));

create policy "members read customers" on public.customers for select using (public.is_member(merchant_id));
create policy "members write customers" on public.customers for all
  using (public.has_role(merchant_id, array['owner','admin','finance'])) with check (public.has_role(merchant_id, array['owner','admin','finance']));

create policy "members read links"     on public.payment_links for select using (public.is_member(merchant_id));
create policy "members write links"    on public.payment_links for all
  using (public.has_role(merchant_id, array['owner','admin','finance'])) with check (public.has_role(merchant_id, array['owner','admin','finance']));

create policy "members read charges"   on public.charges for select using (public.is_member(merchant_id));
create policy "members read charge events" on public.charge_events for select
  using (exists (select 1 from public.charges c where c.id = charge_id and public.is_member(c.merchant_id)));
create policy "members read refunds"   on public.refunds for select using (public.is_member(merchant_id));

create policy "members read ledger accounts" on public.ledger_accounts for select
  using (merchant_id is not null and public.is_member(merchant_id));
create policy "members read ledger tx"  on public.ledger_transactions for select using (merchant_id is not null and public.is_member(merchant_id));
create policy "members read ledger entries" on public.ledger_entries for select
  using (exists (select 1 from public.ledger_accounts a where a.id = account_id and a.merchant_id is not null and public.is_member(a.merchant_id)));

create policy "members read payouts"   on public.payouts for select using (public.is_member(merchant_id));

create policy "devs manage webhooks"   on public.webhook_endpoints for all
  using (public.has_role(merchant_id, array['owner','admin','developer']))
  with check (public.has_role(merchant_id, array['owner','admin','developer']));
create policy "devs read deliveries"   on public.webhook_deliveries for select using (public.has_role(merchant_id, array['owner','admin','developer']));
create policy "devs read api logs"     on public.api_request_logs for select using (public.has_role(merchant_id, array['owner','admin','developer']));
create policy "admins read audit"      on public.audit_log for select using (public.has_role(merchant_id, array['owner','admin']));
-- provider_events: sem policy = acesso apenas via service_role

-- Realtime para o painel
alter publication supabase_realtime add table public.charges;
alter publication supabase_realtime add table public.payouts;

-- Storage (executar no dashboard): bucket privado 'kyc' para documentos.
-- Cron (pg_cron): select cron.schedule('expire-charges','* * * * *','select public.expire_pending_charges()');
