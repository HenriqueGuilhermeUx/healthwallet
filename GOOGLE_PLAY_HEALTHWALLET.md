# HealthWallet - Preparação Google Play

Este guia deixa o app pronto para empacotar com Capacitor e enviar para o Google Play Console.

## Identidade do app

- Nome público: HealthWallet
- Package name / App ID: `br.com.healthwallet.app`
- Categoria sugerida: Saúde e fitness
- Público-alvo sugerido: adultos / famílias / cuidadores
- App pago: não
- Contém anúncios: não, nesta fase
- Contém compra no app: não, nesta fase
- Login obrigatório: sim
- Política de privacidade: usar a página pública `/privacy` do app HealthWallet

## Dados sensíveis que devem ser declarados no Play Console

O HealthWallet trabalha com dados pessoais e dados sensíveis de saúde. Na seção Data safety, declare de forma completa:

- Nome
- E-mail
- Telefone
- Data de nascimento
- Sexo/gênero, quando informado
- Dados de saúde: exames, medicamentos, alergias, condições, plano de saúde, histórico, MedScore, timeline, documentos e resumos
- Arquivos enviados: PDFs e imagens de exames
- Localização: somente quando o usuário aciona Ajuda Rápida/SOS
- Identificadores de usuário: Supabase Auth user id
- Conteúdo gerado pelo usuário: notas, documentos, familiares, cuidadores e eventos

Práticas de segurança a declarar:

- Dados trafegam por HTTPS
- Login protegido por Supabase Auth
- Dados ficam no Supabase
- Compartilhamento com profissional ocorre por autorização/código ou permissões do círculo de cuidado
- Usuário pode solicitar exclusão de dados pelo suporte/política de privacidade

## App Content no Play Console

Preencher:

1. Política de privacidade
2. Acesso ao app para revisão
3. Data safety
4. Público-alvo e conteúdo
5. Classificação de conteúdo
6. Apps de saúde: explicar que o app organiza dados de saúde, lembretes, exames e compartilhamento, mas não substitui consulta médica
7. Permissões sensíveis: localização é usada somente no recurso Ajuda Rápida/SOS
8. Declaração de anúncios: não possui anúncios nesta fase
9. Declaração de app governamental: não é app governamental
10. Declaração COVID: não é app de rastreamento/status COVID

## Login para revisão do Google

Criar uma conta de teste no Supabase Auth, por exemplo:

- E-mail: `reviewer@healthwallet.app`
- Senha: gerar uma senha temporária forte

No campo de instruções para revisão:

```text
Este app exige login. Use a conta de teste fornecida.
Após entrar, acesse Dashboard, Família, Medicamentos, Passport, Exames, Resumo, Ajuda Rápida e Compartilhar Dados.
O recurso Ajuda Rápida pode solicitar localização apenas quando o usuário toca no botão de ajuda.
O app não substitui atendimento médico e exibe recursos de organização pessoal/familiar de saúde.
```

## Build Android local ou GitHub Actions

O projeto usa Capacitor.

Scripts disponíveis:

```bash
pnpm android:init
pnpm android:sync
pnpm android:apk
pnpm android:aab
```

Para GitHub Actions, use o workflow:

`.github/workflows/android-release.yml`

Ele gera o artefato:

`healthwallet-android-release-aab`

## Secrets necessários no GitHub

Obrigatórios para build com Supabase:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Necessários para gerar AAB assinado para o Google Play:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Sem esses secrets de assinatura, o build pode gerar pacote de teste, mas o Google Play exigirá um App Bundle assinado para produção.

## Como gerar keystore no Android Studio

1. Abra Android Studio.
2. Build > Generate Signed Bundle / APK.
3. Escolha Android App Bundle.
4. Crie uma nova keystore.
5. Guarde o arquivo `.jks`, alias e senhas com segurança.
6. Converta o `.jks` para base64 e cole em `ANDROID_KEYSTORE_BASE64` no GitHub Secrets.

## Assets que ainda precisam ser enviados no Play Console

- Ícone 512 x 512 PNG
- Feature graphic 1024 x 500
- Screenshots de celular
- Descrição curta
- Descrição completa
- Política de privacidade pública

## Texto sugerido - descrição curta

HealthWallet organiza exames, medicamentos, Passport, MedScore e cuidados familiares em um cofre inteligente de saúde.

## Texto sugerido - descrição completa

HealthWallet é um aplicativo de saúde pessoal e familiar para organizar exames, medicamentos, Passport de emergência, MedScore, lembretes, dados de familiares, cuidadores e compartilhamento seguro com profissionais.

Com o HealthWallet, o usuário pode cadastrar medicamentos, receber lembretes, confirmar doses tomadas, acompanhar familiares e idosos, armazenar exames, gerar resumos com IA, usar um Passport de emergência e compartilhar informações de saúde com profissionais autorizados.

O app não substitui consulta médica, diagnóstico ou atendimento de emergência. As informações são organizadas para apoiar o cuidado, melhorar comunicação entre paciente, família, cuidadores e profissionais, e facilitar o acesso aos dados de saúde.

## Status técnico atual

- React + Vite
- Supabase
- Netlify web
- Capacitor Android configurado
- Workflow GitHub Actions para gerar AAB
- App ID definido como `br.com.healthwallet.app`
- Target SDK ajustado para 35 pelo script de build
- Permissões Android: internet e localização para Ajuda Rápida
