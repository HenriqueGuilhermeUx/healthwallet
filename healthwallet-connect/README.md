# HealthWallet Connect

Companion app do HealthWallet para leitura consentida de dados do Apple Saúde / HealthKit no iOS e Health Connect no Android.

## Objetivo de produto

O Connect realiza a conexão nativa com dados de dispositivos, mostra ao usuário o que está autorizado e sincroniza as métricas selecionadas para a mesma conta e o mesmo modelo de dados do HealthWallet.

A experiência foi desenhada para ser quase invisível no uso diário: o usuário inicia em **Meus dispositivos** no HealthWallet, passa pelo Connect somente para a autorização nativa e sincronização e retorna automaticamente à HealthWallet. Consentimento, permissões e revogação continuam sempre explícitos.

## Fluxo HealthWallet → Connect → HealthWallet

1. O usuário toca em **Conectar dados avançados** no HealthWallet.
2. O HealthWallet autenticado chama a Edge Function `healthwallet-connect-handoff` com `action=issue`.
3. A função cria um código criptograficamente aleatório, armazena somente seu SHA-256 e o expira em aproximadamente 2 minutos.
4. O HealthWallet abre `healthwallet-connect://handoff` com esse código de uso único. **Access token e refresh token nunca são colocados na URL.**
5. O Connect troca o código na mesma Edge Function (`action=redeem`). A troca marca o handoff como usado e devolve um token hash one-time do Supabase Auth.
6. O Connect cria sua própria sessão, solicita as permissões nativas necessárias, sincroniza e grava no mesmo Device Data Hub.
7. O Connect retorna por `healthwallet://connect-complete`; o app principal abre `/devices`, recarrega os dados e mostra o resultado.

Se o handoff expirar ou falhar, o Connect mantém o login tradicional como contingência.

## Métricas preparadas

- passos
- sono
- frequência cardíaca
- frequência cardíaca de repouso
- saturação de oxigênio (SpO2)
- variabilidade da frequência cardíaca (HRV)
- pressão arterial
- peso
- calorias ativas
- tempo de atividade/exercício

O código solicita somente as métricas selecionadas pelo usuário.

## Modelo de dados

O Connect grava nas tabelas já usadas pelo HealthWallet:

- `health_device_connections`
- `health_daily_summaries`

Os registros usam `source_app = healthwallet_connect`, preservando rastreabilidade sem criar uma segunda base de saúde.

O handoff usa uma tabela separada e bloqueada para clientes:

- `health_connect_handoffs`

Aplique `SQL_HEALTHWALLET_CONNECT_HANDOFF_V1.sql` no mesmo projeto Supabase do HealthWallet. A tabela tem RLS habilitado, nenhum acesso para `anon`/`authenticated` e é acessada somente pela Edge Function usando `service_role`.

## Edge Function

Código versionado em:

```text
supabase/functions/healthwallet-connect-handoff/index.ts
```

Ela possui autenticação própria nos dois caminhos:

- `issue`: exige e valida o JWT real da sessão HealthWallet;
- `redeem`: exige o código aleatório, não usado e ainda válido.

Por isso o deploy dessa função deve permitir a chamada de `redeem` sem JWT no gateway, isto é, `verify_jwt=false`; a própria função faz a autenticação necessária. **Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no cliente.**

Opcionalmente configure `HEALTHWALLET_WEB_ORIGIN` na Edge Function para permitir retorno web a uma origem HTTPS específica. O retorno nativo aceito é `healthwallet://connect-complete`.

## Perfis Android

Existem dois perfis de Manifest para não misturar capacidade técnica com escopo de publicação.

### Minimal

Mantém somente `READ_STEPS` no Manifest. É o padrão seguro para uma publicação inicial ou revisão limitada.

```bash
npm run android:sync:minimal
```

### Full

Habilita os tipos de leitura preparados para a experiência completa de smartwatch. Use somente quando cada métrica estiver claramente visível no produto e a declaração/vídeo de revisão estiverem coerentes.

```bash
npm run android:sync:full
```

O perfil full inclui leitura de Steps, Sleep, Heart Rate, Resting Heart Rate, Oxygen Saturation, HRV, Blood Pressure, Weight, Active Calories e Exercise. Permissões de escrita, Steps Cadence e Distance permanecem removidas.

O script de sync também registra `healthwallet-connect://handoff` no Manifest Android. O app principal registra `healthwallet://connect-complete` durante a geração do APK/AAB da branch.

## Ambiente

Copie `.env.example` para `.env` e use o mesmo projeto Supabase do HealthWallet:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_HEALTHWALLET_WEB_ORIGIN=...
```

`VITE_HEALTHWALLET_WEB_ORIGIN` é opcional e serve somente para uma futura volta web permitida. No app instalado, o fluxo usa o scheme nativo.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Android

Primeira criação do projeto nativo:

```bash
npm run android:init
```

Abrir Android Studio no perfil mínimo:

```bash
npm run android:open
```

Abrir Android Studio no perfil full:

```bash
npm run android:open:full
```

## iOS

```bash
npm run ios:init
npm run ios:open
```

A configuração final do HealthKit (capabilities, usage descriptions, URL schemes e revisão da App Store) deve ser concluída antes da distribuição iOS.

## CI

O workflow `HealthWallet Connect CI` valida:

- compilação web do Connect;
- deep link `healthwallet-connect://handoff` no Android;
- build Android minimal + auditoria `READ_STEPS` somente;
- build Android full + auditoria das permissões permitidas;
- compilação TypeScript/Vite do HealthWallet principal da branch;
- sintaxe do patch de retorno `healthwallet://connect-complete`.

## Princípios

- sem venda de dados de saúde
- sem uso publicitário
- sem decisão automatizada clínica
- sem permissões de escrita nesta fase
- compartilhamento profissional separado do consentimento de leitura do dispositivo
- usuário pode revisar/revogar permissões
- dados de dispositivos são complementares e não substituem avaliação profissional
