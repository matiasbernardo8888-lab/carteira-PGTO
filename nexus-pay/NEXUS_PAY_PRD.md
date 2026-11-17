# NEXUS PAY — PRD da Gateway de Pagamentos

Versão 1.0 · Escopo: MVP do painel do lojista + API pública

> Este documento substitui o PRD do NEXUS FIN (app de finanças pessoais). Tudo que era orçamento pessoal, metas, score, agenda e OCR de extrato foi removido.

---

## 1. Visão

NEXUS PAY é uma gateway de pagamentos para o Brasil: o lojista cria cobranças via API ou painel, o cliente paga por Pix, cartão ou boleto, e o dinheiro cai no saldo do lojista para saque.

**Proposta de valor**
- Integração em minutos: uma chamada de API cria a cobrança e devolve o QR Code Pix ou o link de pagamento.
- Taxas claras, por método de pagamento, visíveis antes de vender.
- Conciliação automática: cada centavo recebido, taxado e sacado fica registrado em um livro-razão (ledger).
- Painel único para vendas, saldo, saques e integração.

**Público**: infoprodutores, e-commerces pequenos e médios, prestadores de serviço e plataformas SaaS que precisam receber online.

**Fora de escopo no MVP**: split de pagamento, assinaturas recorrentes, antifraude próprio, adquirência própria (usa-se um provedor), conta digital completa, cartão físico, multi-moeda.

---

## 2. Princípios

1. Dinheiro é inteiro: todos os valores em centavos (`bigint`), nunca decimal flutuante.
2. Idempotência: toda criação de cobrança aceita `Idempotency-Key`.
3. Ledger de partida dobrada: saldo nunca é editado, só derivado de lançamentos imutáveis.
4. Segurança antes de velocidade: dados de cartão nunca tocam o servidor da NEXUS PAY (tokenização no provedor, escopo PCI SAQ-A).
5. Tudo auditável: cada mudança de status gera um evento.

---

## 3. Mapa de telas (painel do lojista)

```
NEXUS PAY
├── Entrada (abertura + login/cadastro)
├── Onboarding / KYC
│   ├── Dados da empresa (CNPJ/CPF, razão social, segmento)
│   ├── Responsável legal (nome, CPF, nascimento)
│   ├── Conta bancária para saque
│   └── Envio de documentos → status em análise
├── Visão geral (dashboard)
├── Cobranças
│   ├── Lista com filtros (status, método, período)
│   ├── Nova cobrança
│   └── Detalhe da cobrança (linha do tempo, reembolso)
├── Links de pagamento
├── Saldo e saques
│   ├── Saldo disponível / a liberar / bloqueado
│   ├── Solicitar saque
│   └── Extrato (ledger)
├── Clientes
├── Desenvolvedores
│   ├── Chaves de API (teste e produção)
│   ├── Webhooks (endpoints, eventos, entregas, reenvio)
│   └── Logs de requisições
└── Configurações (empresa, equipe, taxas, segurança)
```

---

## 4. Especificação funcional

### 4.1 Cadastro e KYC
- Cadastro com e-mail e senha (Supabase Auth), 2FA por app autenticador obrigatório antes do primeiro saque.
- KYC em 4 passos. Estados da conta: `pending` → `under_review` → `approved` | `rejected`.
- Conta `pending` ou `under_review` opera apenas em **modo teste** (chaves `sk_test_`).
- Conta `approved` libera chaves de produção e saques.
- Limites iniciais de saque por dia configuráveis pelo time interno.

### 4.2 Cobranças (charges)
Uma cobrança representa a intenção de receber um valor.

| Campo | Descrição |
|---|---|
| `amount` | Valor em centavos, mínimo 100 |
| `currency` | `BRL` |
| `method` | `pix`, `card`, `boleto` |
| `customer` | Nome, documento, e-mail |
| `description` | Texto livre |
| `due_at` | Vencimento (boleto) ou expiração (Pix, padrão 30 min) |
| `metadata` | Objeto JSON livre do lojista |

**Status**: `pending` → `paid` | `failed` | `expired` | `canceled`; depois de paga: `refunded` | `partially_refunded` | `chargeback`.

**Por método**
- **Pix**: gera `qr_code` (imagem) e `copy_paste` (BR Code). Confirmação por webhook do provedor, normalmente em segundos.
- **Cartão**: crédito em 1x a 12x, com tokenização no navegador do cliente. Aprovação síncrona, com captura imediata no MVP.
- **Boleto**: gera linha digitável e PDF. Compensação em até 2 dias úteis.

### 4.3 Links de pagamento
Página de checkout hospedada pela NEXUS PAY, sem código: o lojista informa nome, valor (fixo ou aberto), métodos aceitos e validade, e recebe uma URL para compartilhar.

### 4.4 Saldo, taxas e saques
- Três saldos: **disponível**, **a liberar** (aguardando prazo de liberação) e **bloqueado** (reserva por disputa).
- Prazo de liberação padrão: Pix D+0, boleto D+1 após compensação, cartão D+30 (configurável por lojista).
- Taxa por cobrança: percentual + valor fixo por método, definidos em `fee_plans`. Taxa é lançada no ledger no momento do pagamento.
- Saque: Pix para a conta cadastrada, valor mínimo R$ 10,00, taxa fixa por saque. Estados: `requested` → `processing` → `completed` | `failed`.
- Saque falho devolve o valor ao saldo disponível por lançamento de estorno no ledger.

### 4.5 Reembolsos
Total ou parcial, em até 90 dias após o pagamento. O valor sai do saldo disponível; se não houver saldo, a operação é recusada. Taxa original não é devolvida (configurável).

### 4.6 Webhooks
Eventos: `charge.created`, `charge.paid`, `charge.failed`, `charge.expired`, `charge.refunded`, `payout.completed`, `payout.failed`.
- Assinatura HMAC-SHA256 no header `Nexus-Signature`, calculada sobre o corpo bruto com o segredo do endpoint.
- Retentativas com backoff exponencial: 1 min, 5 min, 30 min, 2 h, 6 h, 24 h, depois marca como `failed`.
- Reenvio manual de qualquer entrega pelo painel.

### 4.7 API pública (REST, JSON)
Base: `https://api.nexuspay.com.br/v1` · Autenticação: `Authorization: Bearer sk_live_...`

| Método | Rota | Função |
|---|---|---|
| POST | `/charges` | Criar cobrança |
| GET | `/charges/:id` | Consultar cobrança |
| GET | `/charges` | Listar com filtros e paginação por cursor |
| POST | `/charges/:id/refund` | Reembolsar |
| POST | `/payment-links` | Criar link |
| GET | `/balance` | Saldos |
| POST | `/payouts` | Solicitar saque |
| GET | `/payouts/:id` | Consultar saque |
| POST | `/webhook-endpoints` | Cadastrar endpoint |

Exemplo:
```json
POST /v1/charges
Idempotency-Key: 7c1b6a50-...
{
  "amount": 14990,
  "method": "pix",
  "customer": { "name": "Maria Souza", "document": "12345678909", "email": "maria@exemplo.com" },
  "description": "Pedido #1042",
  "metadata": { "order_id": "1042" }
}
```
Resposta: `id`, `status: "pending"`, `amount`, `fee`, `net_amount`, `pix: { qr_code_url, copy_paste, expires_at }`.

### 4.8 Painel: visão geral
- Cards: volume pago (período), nº de cobranças, ticket médio, taxa de aprovação.
- Saldo disponível e a liberar, com botão de saque.
- Gráfico de volume por dia e gráfico de pizza por método.
- Lista das últimas cobranças.
- Alerta se algum webhook estiver falhando.

---

## 5. Regras de negócio críticas

1. `net_amount = amount − fee`. A taxa é calculada e gravada na cobrança no momento da criação e não muda depois.
2. Toda movimentação financeira gera **duas linhas** no ledger (débito e crédito) que somam zero.
3. Saldo disponível = soma dos lançamentos da conta do lojista com `available_at <= now()`.
4. Um pagamento confirmado nunca é apagado; correções são lançamentos de estorno.
5. Webhook do provedor é validado por assinatura e processado de forma idempotente (tabela `provider_events` com chave única).
6. Chaves de API são exibidas uma única vez na criação; o banco guarda apenas o hash.

---

## 6. Requisitos não-funcionais

| Área | Meta |
|---|---|
| Disponibilidade da API | 99,95% |
| Latência `POST /charges` | p95 < 400 ms |
| Segurança | TLS 1.2+, dados sensíveis criptografados, RLS no banco, rate limit por chave |
| Compliance | LGPD, PCI DSS SAQ-A, regras do Banco Central para instituição de pagamento (via parceiro, no início) |
| Auditoria | Log imutável de ações administrativas e de acesso a chaves |
| Observabilidade | Métricas de aprovação por método, fila de webhooks, saques pendentes |

---

## 7. Provedores e arquitetura

- **Pix e boleto**: parceiro PSP/banco com API (ex.: Efí, Asaas, Pagar.me ou outro). A escolha é decisão comercial e jurídica em aberto; o código isola isso atrás de uma interface `PaymentProvider`.
- **Cartão**: processador com tokenização (checkout hospedado ou SDK).
- **Stack**: Next.js (painel e API routes), Supabase (Auth, Postgres, Edge Functions para webhooks e jobs), Tailwind e shadcn/ui no painel.
- **Jobs**: expiração de cobranças, retentativa de webhooks, liberação de saldo, conciliação diária com o extrato do provedor.

---

## 8. Roadmap

**MVP (6–8 semanas)**: cadastro, KYC manual, cobranças Pix, links de pagamento, ledger, saldo, saque Pix, chaves de API, webhooks.
**V1**: cartão de crédito, boleto, reembolso, logs de requisições, equipe com papéis.
**V2**: split, assinaturas, antifraude, relatórios fiscais, conciliação avançada.

---

## 9. Pontos que dependem de decisão externa

- Escolha do provedor de Pix, boleto e cartão e as taxas negociadas com ele.
- Enquadramento regulatório (operar como subadquirente via parceiro vs. licença própria de instituição de pagamento). Precisa de assessoria jurídica antes de operar em produção.
- Política de reserva e prazo de liberação do cartão.
