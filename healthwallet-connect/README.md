# HealthWallet Connect

Companion app do HealthWallet para leitura consentida de dados do Apple Saúde / HealthKit no iOS e Health Connect no Android.

## Objetivo de produto

O Connect existe para realizar a conexão nativa com dados de dispositivos, mostrar ao usuário o que está autorizado e sincronizar as métricas selecionadas para a mesma conta e o mesmo modelo de dados do HealthWallet.

A experiência futura deve ser quase invisível no uso diário: o usuário entra no Connect principalmente no onboarding, para conceder/revisar permissões ou quando quiser revisar a sincronização. Os dados sincronizados passam a ser vistos principalmente dentro do HealthWallet. Consentimento, permissões e revogação continuam sempre explícitos.

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

## Ambiente

Copie `.env.example` para `.env` e use o mesmo projeto Supabase do HealthWallet:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

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

A configuração final do HealthKit (capabilities, usage descriptions e revisão da App Store) deve ser feita antes da distribuição iOS.

## Estratégia de integração com HealthWallet

1. Connect nasce como app companion separado, com identidade `br.com.healthwallet.connect`.
2. Usa a mesma autenticação e as mesmas tabelas do HealthWallet.
3. O HealthWallet passa a tratar `health_daily_summaries` como fonte normal do dashboard.
4. Uma etapa posterior adicionará deep link/one-time handoff do HealthWallet para o Connect e retorno automático após sincronização.
5. Depois do onboarding, a maior parte dos usuários não precisa abrir o Connect manualmente; ele vira uma camada de integração e gestão de permissões.

## Princípios

- sem venda de dados de saúde
- sem uso publicitário
- sem decisão automatizada clínica
- sem permissões de escrita nesta fase
- compartilhamento profissional separado do consentimento de leitura do dispositivo
- usuário pode revisar/revogar permissões
- dados de dispositivos são complementares e não substituem avaliação profissional
