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

## Auditoria pontual de fluxos reais — 13/11/2026

### Escopo de Apple Saúde, consentimento e publicidade da função

- `src/services/nativeHealthSync.ts` declara explicitamente `IOS_READ_TYPES: ['steps']` e `ANDROID_READ_TYPES: ['steps']`. Apenas passos são lidos automaticamente; as demais métricas ficam disponíveis por inserção manual na tela `DeviceData`. **Não afirmar sincronização automática de sono, batimentos, pressão, peso ou SpO2**.
- A comunicação de `src/pages/DeviceData.tsx` foi alinhada a essa realidade na branch de preparação (commit `ec4c3e4`). Essa alteração é somente de texto, não altera permissões, banco ou os serviços de sincronização. O PR permanece draft; como UI é compartilhada, avaliar também a redação Android antes de eventual merge.
- A sincronização sob `requestAuthorization: false` depende de conexão e autorização prévias, e a rotina automática tenta atualizar dados a cada seis horas. **Exigir teste de revogação/recusa no iPhone** e comprovação do tratamento de exceções, porque o smoke de abertura não exercita isso.
- `src/hooks/useAuth.tsx` implementa `supabase.auth.signInWithPassword`, `signUp`, `signOut`, restauração por `getSession` e possível handoff federado Nexa. Presença de código **não comprova** que fluxos, recuperação de conta e exclusão funcionem no iPhone; QA ainda pendente.

### SOS — risco funcional relevante

- Em `src/pages/Emergency.tsx`, o botão **ACIONAR AJUDA** obtém geolocalização, cria um registro em `sos_events` incluindo `notified_contacts` e grava evento clínico; o código inspecionado **não confirma entrega automática de mensagens, SMS, push ou chamada aos contatos**. As ações `tel:` separadas fornecem chamada manual.
- Não inferir que a persistência de `notified_contacts` dispara entrega. O título `Contatos que recebem alerta` pode criar expectativa de notificação automática, especialmente em emergência; antes da publicação, validar o mecanismo de envio e recibo reais, ou ajustar a interface para descrever apenas registro e chamada manual. **Gate de segurança bloqueado até evidência.**
- Testar localização negada, ausência de rede, contato não cadastrado, histórico de SOS ativo, status resolvido/falso alarme, e instrução explícita de que HealthWallet não substitui emergência pública (SAMU 192).

### Bloqueios específicos novos

| Verificação | Estado |
| --- | --- |
| Escopo automático Apple Saúde (passos) e texto da tela | Corrigido na branch iOS; teste funcional pendente |
| SOS: comprovação real de alertas a contatos | **BLOQUEADO** |
| Restauração, logout e exclusão de conta | QA pendente |
| Consentimento e revogação HealthKit | QA pendente |
| Declarações App Privacy e localização | QA pendente |

Não usar pacientes reais, geolocalização real ou tokens neste PR. Não ativar efeitos externos a partir do CI.

## Mitigação de comunicação SOS em branch iOS — 13/11/2026

Na branch exploratória do HealthWallet, commit `5bd2a4b`, a tela `src/pages/Emergency.tsx` passou a evitar afirmar que contatos cadastrados **receberam** alertas sem confirmação de entrega. A interface distingue **registrar solicitação** de **ligar para 192 ou para contato principal** e informa que um registro não confirma envio de mensagens ou chegada de socorro. Botões `tel:`, `sos_events` e fluxo do backend foram preservados; nenhuma mensagem foi enviada por esta alteração.

**Pendente antes de publicação:** rastrear possíveis efeitos de backend no evento SOS (trigger, Edge Function, webhook, SMS ou push), testar se existe entrega real, incluir observabilidade/estado de entrega e verificar UX de rejeição de permissão e modo offline. Esta mudança é uma mitigação de comunicação, não uma certificação de segurança operacional nem de atendimento de emergência.

O workflow iniciado após essa alteração ainda requer verificação. Por se tratar de código visual compartilhado com Android/web, **não realizar merge sem revisar impacto entre plataformas**.
