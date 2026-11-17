# NEXUS PAY

Gateway de pagamentos (Pix, cartão, boleto) — protótipo do painel + PRD + schema.

## Conteúdo

| Arquivo | O que é |
|---|---|
| `NEXUS_PAY_PRD.md` | PRD: escopo, telas, regras de negócio, API, webhooks |
| `nexus_pay_schema.sql` | Schema Supabase/PostgreSQL (21 tabelas, ledger, RLS, funções) |
| `nexus_pay_app.jsx` | Painel do lojista (React, dados simulados) |
| `brand/` | Logo em PNG (ícone 512/1024 e horizontal) e SVG |

## Rodar o painel

```bash
npm create vite@latest nexus-pay -- --template react
cd nexus-pay && npm install
# substitua src/App.jsx pelo conteúdo de nexus_pay_app.jsx
npm run dev
```

## Aplicar o schema

Supabase → SQL Editor → cole `nexus_pay_schema.sql` → Run.
Depois: crie o bucket privado `kyc` e agende o cron `expire_pending_charges()` (comentário no fim do arquivo).

## O que é simulado

- Nenhuma chamada de rede: cobranças, saldo e saques vivem só no estado do React.
- O QR Code Pix é um desenho de exemplo, não um Pix válido.
- Integração com PSP/banco (Pix, boleto, cartão) ainda não existe; o PRD prevê uma interface `PaymentProvider`.
