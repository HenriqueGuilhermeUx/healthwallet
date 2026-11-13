# HealthWallet — preparação iOS: evidências e próximos gates

**Fase atual:** inventário / QA preparatório. Não autoriza TestFlight, assinatura, cadastro Apple ou merge.

## Evidências confirmadas

| Verificação | Resultado | Fonte |
| --- | --- | --- |
| Código web Vite/React e Capacitor | Identificado no repositório | `package.json`, `capacitor.config.ts` |
| ID iOS de código `br.com.healthwallet.app` | Identificado no Capacitor | `capacitor.config.ts` |
| Build iOS unsigned | **PASS** | [GitHub Actions 42693000085](https://github.com/HenriqueGuilhermeUx/healthwallet/actions/runs/42693000085) |
| Abertura no simulador | **PASS** (smoke CI, sem QA funcional) | Mesmo run, passo `Launch app on iPhone simulator (smoke)` |
| Correspondência AAB Android/Play comercial | **NÃO VERIFICADA** | Necessário registro do Play Console |
| Controles, rede e privacidade reais | **NÃO HOMOLOGADOS** | Exige execução dos fluxos de negócio |
| Fase 2 / TestFlight | **BLOQUEADA** | Governança do inventário |

## Revisão de configuração de origem

- `capacitor.config.ts`: `appId: br.com.healthwallet.app`, `server.androidScheme: https`, SplashScreen com 1200 ms, Geolocation com permissão `location`. Isto **não** comprova que geolocalização seja necessária no iOS ou que tenha texto de permissão adequado; revisar uso real antes de incluir entitlements/permissões.
- `package.json`: `@capgo/capacitor-health` (versão 7) e `@capacitor/geolocation` são dependências declaradas. Não inferir que HealthKit esteja autorizado, com consentimento ou funcional; exigir verificação explícita de entitlement/capability e textos de uso em build iOS definitivo.
- Dependências `@supabase/supabase-js` e `@supabase/ssr` identificadas; a existência do SDK não comprova login, persistência da sessão, isolamento de dados nem política de retenção no iPhone.
- Não alterar configuração Android para satisfazer requisitos Apple. Qualquer mudança potencialmente compartilhada deve ser proposta primeiro em branch separada e auditada.

## Roteiro individual de QA (bloqueios reais antes da publicação)

| Gate | Teste objetivo a executar | Estado |
| --- | --- | --- |
| Origem comercial | Confrontar package Android, último AAB, commit de build e ficha Google Play | PENDENTE |
| Fluxo inicial | Verificar primeira abertura e telas de consentimento com iPhone sem sessão | PENDENTE |
| Conta | Cadastro/login/logout, recuperação, sessão após reinício, exclusão de conta se aplicável | PENDENTE |
| HealthKit | Testar solicitação granular, recusa, revogação e app sem autorização, se houver uso | PENDENTE |
| Localização | Verificar justificativa, prompt iOS, recusa e UX sem permissão, se houver uso | PENDENTE |
| Dados sensíveis | Acessos segregados, uploads/consultas, exclusão, retenção e nenhum vazamento em logs | PENDENTE |
| Rede | HTTPS, falha de rede, sessão expirada, fallback; sem URLs locais ou dados reais no CI | PENDENTE |
| Privacidade Apple | Declaração App Privacy, SDKs, Privacy Manifest, propósitos de uso e política pública | PENDENTE |
| Artefatos finais | Ícone/splash comerciais, screenshots reais, classificação, suporte e testes de revisão | PENDENTE |

**Critério de saída:** nenhuma aprovação comercial automática com base no smoke CI. Revisar evidências por requisito e obter aprovação humana individual da Fase 2. Nenhuma chave, conta real, token, informação de saúde ou dado do paciente neste repositório.
