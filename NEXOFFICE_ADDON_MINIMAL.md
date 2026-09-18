# MyDataMed → NexOffice: benefício opcional e desacoplado

## Princípio

O HealthWallet/MyDataMed continua sendo um produto completo e independente. O NexOffice é somente um benefício opcional para assinantes MyDataMed ativos.

Se o NexOffice estiver fora do ar, desconfigurado ou desabilitado, o HealthWallet/MyDataMed continua funcionando normalmente.

## Fluxo único

1. Profissional autenticado no MyDataMed clica em **NexOffice**.
2. A Netlify Function valida a sessão Supabase.
3. A Function confirma assinatura profissional MyDataMed com `status = active` usando as tabelas canônicas já existentes.
4. O servidor provisiona/recupera um workspace NexOffice idempotente.
5. O servidor solicita um handoff one-time de curta duração.
6. O browser abre a URL temporária do NexOffice.
7. Acessos seguintes usam o mesmo `externalWorkspaceRef`, portanto recuperam o mesmo workspace.

## Workspace

O identificador é derivado no servidor do UUID autenticado:

```text
mydatamed:<auth-user-id>
```

O browser não escolhe tenant/workspace.

## Dados que cruzam

Somente identidade profissional mínima e metadados de provisioning:

- `sourceProduct = mydatamed`
- `vertical = health`
- referência técnica estável do workspace
- subject federado do usuário
- e-mail profissional
- nome de exibição profissional
- nome do workspace
- role `owner`
- entitlement `addon.mydatamed`

## Dados que NÃO cruzam

Não há sincronização de paciente ou clínica. Não são enviados exames, medicamentos, prontuário, Medical Passport, MedScore, Health Connect, wearables, dados de dispositivos, sintomas, mensagens, notas clínicas, anexos ou qualquer payload clínico bruto.

Não há Health signals, jobs, cron, webhook de dados clínicos ou sync automático.

## Cobrança

O bridge não chama endpoint de billing, checkout ou cobrança do NexOffice. O NexOffice é provisionado como entitlement `addon.mydatamed`, incluído no benefício do assinante MyDataMed.

## Kill switches

A integração começa desligada em ambos os lados:

```env
VITE_NEXOFFICE_ENABLED=false
NEXOFFICE_MYDATAMED_ENABLED=false
```

- `VITE_NEXOFFICE_ENABLED=false`: o botão não aparece.
- `NEXOFFICE_MYDATAMED_ENABLED=false`: o servidor recusa qualquer handoff mesmo se alguém chamar a rota diretamente.

## Configuração futura

```env
VITE_NEXOFFICE_ENABLED=true
NEXOFFICE_MYDATAMED_ENABLED=true
NEXOFFICE_API_BASE_URL=https://api.nexoffices.com.br
NEXOFFICE_INTERNAL_KEY=<segredo compartilhado somente server-side>
NEXOFFICE_TIMEOUT_MS=12000
```

`NEXOFFICE_INTERNAL_KEY` nunca pode usar prefixo `VITE_` nem chegar ao browser.

## Validação de preview

O Deploy Preview é validado separadamente da produção. Durante a investigação de paridade, o contexto `deploy-preview` da Netlify usa Node 22.23.2; isso não altera o runtime/configuração de produção. O Smart Secret Detection pode ser desligado temporariamente apenas no preview para diagnosticar falso positivo e deve ser restaurado antes do release.

## Regra de release

Não publicar antes de um E2E controlado com um assinante de teste:

```text
assinante MyDataMed
→ Ativar/Abrir NexOffice
→ provisionar workspace
→ SSO/handoff
→ NexOffice aberto
→ repetir acesso
→ mesmo workspace
→ nenhuma cobrança NexOffice
```

Também validar falha isolada:

```text
NexOffice indisponível
→ launcher mostra erro local
→ HealthWallet/MyDataMed continua funcionando normalmente
```
