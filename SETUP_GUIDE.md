# 🏥 HealthWallet - Guia de Configuração Completo

## Passo a Passo para Colocar no Ar

Este guia vai te ajudar a configurar tudo do zero, mesmo que você nunca tenha usado Supabase ou Netlify antes.

---

## 📋 Índice

1. [Criar conta no Supabase](#1-criar-conta-no-supabase)
2. [Criar projeto no Supabase](#2-criar-projeto-no-supabase)
3. [Configurar banco de dados](#3-configurar-banco-de-dados)
4. [Configurar autenticação](#4-configurar-autenticação)
5. [Obter chaves de API](#5-obter-chaves-de-api)
6. [Configurar OpenAI (opcional)](#6-configurar-openai-opcional)
7. [Deploy no Netlify](#7-deploy-no-netlify)
8. [Configurar variáveis no Netlify](#8-configurar-variáveis-no-netlify)
9. [Testar tudo](#9-testar-tudo)

---

## 1. Criar conta no Supabase

1. Acesse: **https://supabase.com**
2. Clique em **"Sign up"** (Cadastrar)
3. Você pode cadastrar com:
   - Email e senha
   - Ou conectar com GitHub (mais fácil)
4. Confirme seu email se cadastrou por email

---

## 2. Criar projeto no Supabase

1. No painel do Supabase, clique em **"New Project"** (Novo Projeto)
2. Preencha os dados:
   - **Organization**: Selecione sua organização (ou crie uma)
   - **Name**: `healthwallet` (ou outro nome)
   - **Database Password**: Crie uma senha forte (ANOTE ELA!)
   - **Region**: Selecione a mais próxima de você (ex: `São Paulo`)
3. Clique em **"Create new project"**
4. **AGUARDE** - a criação demora ~2 minutos

⚠️ **IMPORTANTE**: Anote a senha do banco de dados! Você precisará dela.

---

## 3. Configurar banco de dados

Agora vamos criar as tabelas no banco de dados.

### 3.1 Acesse o SQL Editor

1. No menu lateral do seu projeto, clique em **"SQL Editor"**
2. Clique em **"New Query"** (Nova Consulta)

### 3.2 Cole o SQL abaixo

```sql
-- ============================================
-- HealthWallet - Script de Criação do Banco
-- ============================================

-- Tabela de perfis de usuário
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  birth_date DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  blood_type TEXT,
  allergies TEXT[],
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de planos de saúde
CREATE TABLE public.health_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('private', 'sus')),
  card_number TEXT NOT NULL,
  operator_name TEXT,
  beneficiary_name TEXT NOT NULL,
  validity TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de prontuários/exames
CREATE TABLE public.medical_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  file_url TEXT,
  file_name TEXT NOT NULL,
  exam_type TEXT,
  exam_date DATE,
  laboratory TEXT,
  extracted_data JSONB,
  ai_analysis TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de medicamentos
CREATE TABLE public.medications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de membros da família
CREATE TABLE public.family_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  birth_date DATE,
  blood_type TEXT,
  allergies TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Políticas RLS para health_plans
CREATE POLICY "Users can view own plans" ON public.health_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plans" ON public.health_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own plans" ON public.health_plans
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas RLS para medical_records
CREATE POLICY "Users can view own records" ON public.medical_records
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own records" ON public.medical_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own records" ON public.medical_records
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas RLS para medications
CREATE POLICY "Users can view own medications" ON public.medications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own medications" ON public.medications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own medications" ON public.medications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own medications" ON public.medications
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas RLS para family_members
CREATE POLICY "Users can view own family" ON public.family_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own family" ON public.family_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own family" ON public.family_members
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own family" ON public.family_members
  FOR DELETE USING (auth.uid() = user_id);
```

### 3.3 Execute o SQL

1. Clique no botão **"RUN"** (Executar) ou pressione `Ctrl + Enter`
2. Você verá uma mensagem de sucesso
3. No menu lateral, clique em **"Table Editor"** - você verá as tabelas criadas

---

## 4. Configurar autenticação

### 4.1 Habilitar login por Email

1. No menu lateral, clique em **"Authentication"**
2. Clique em **"Providers"** (Provedores)
3. Encontre **"Email"** e clique nele
4. **Desabilite** "Confirm email" se quiser que usuários entrem sem confirmar email (mais fácil para testes)
5. Deixe as outras configurações como estão
6. Clique em **"Save"** (Salvar)

### 4.2 Configurar Redirecionamento (opcional)

1. Ainda em Authentication, clique em **"URL Configuration"**
2. Em **"Site URL"**, coloque a URL do seu site no Netlify (você vai obter depois)
3. Em **"Redirect URLs"**, adicione:
   ```
   https://seu-site.netlify.app/**
   ```
4. Salve

---

## 5. Obter chaves de API

### 5.1 URL do Projeto

1. No menu lateral, clique em **"Settings"** (Configurações)
2. Clique em **"API"**
3. Em **"Project URL"**, você verá algo como:
   ```
   https://xyzxyzxyz.supabase.co
   ```
4. **COPIE** essa URL

### 5.2 Chave Anônima (anon key)

1. Na mesma página de API, em **"Project API keys"**
2. Você verá a **"anon public"** key
3. **COPIE** essa chave (é bem longa, começa com `eyJ...`)

### 5.3 Suas variáveis

Agora você tem:
- `VITE_SUPABASE_URL` = `https://xyzxyzxyz.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1Ni...`

---

## 6. Configurar OpenAI (Opcional)

A OpenAI é para a análise inteligente de exames. Se você não configurar, o app usará dados simulados.

### 6.1 Criar conta na OpenAI

1. Acesse: **https://platform.openai.com**
2. Clique em **"Sign up"** ou **"Log in"**
3. Cadastre-se (pode usar email ou Google)

### 6.2 Obter a API Key

1. No menu lateral, clique em **"API keys"**
2. Clique em **"Create new secret key"**
3. Dê um nome (ex: "HealthWallet")
4. Clique em **"Create secret key"**
5. **COPIE** a chave (começa com `sk-...`)

⚠️ **IMPORTANTE**: Esta chave é muito importante! Não compartilhe com ninguém.

### 6.3 Adicionar crédito (opcional)

A OpenAI cobra por uso. Para testes, $5-$10 são suficientes.

1. Clique em **"Settings"** > **"Billing"**
2. Adicione cartão de crédito
3. Adicione créditos iniciais

---

## 7. Deploy no Netlify

### 7.1 Subir projeto no GitHub (recomendado)

Esta é a forma mais fácil de fazer deploy.

#### 7.1.1 Criar repositório no GitHub

1. Acesse: **https://github.com**
2. Faça login
3. Clique em **"New repository"** (Novo repositório)
4. Preencha:
   - **Repository name**: `healthwallet`
   - **Private**: Sim
5. Clique em **"Create repository"**

#### 7.1.2 Enviar código para o GitHub

No seu terminal (ou aqui no workspace), você precisará:

```bash
cd healthwallet
git init
git add .
git commit -m "HealthWallet app"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/healthwallet.git
git push -u origin main
```

(Substitua `SEU_USUARIO` pelo seu usuário do GitHub)

### 7.2 Conectar ao Netlify

1. Acesse: **https://app.netlify.com**
2. Clique em **"Add new site"** > **"Import an existing project"**
3. Selecione **"GitHub"**
4. Autorize o Netlify a acessar seu GitHub
5. Selecione o repositório `healthwallet`
6. Configure:
   - **Build command**: `pnpm build`
   - **Publish directory**: `dist`
7. Clique em **"Deploy site"**

⚠️ **NÃO CLIQUE EM "Open dashboard" AINDA** - primeiro precisamos configurar as variáveis.

---

## 8. Configurar variáveis no Netlify

### 8.1 Acessar configurações do site

1. No Netlify, clique no seu site
2. Vá em **"Site configuration"** > **"Environment variables"**

### 8.2 Adicionar variáveis

Clique em **"Add a variable"** para cada uma:

#### Variável 1:
- **Key**: `VITE_SUPABASE_URL`
- **Value**: Sua URL do Supabase (ex: `https://xyzxyzxyz.supabase.co`)

#### Variável 2:
- **Key**: `VITE_SUPABASE_ANON_KEY`
- **Value**: Sua chave anônima (ex: `eyJhbGciOiJIUzI1Ni...`)

#### Variável 3 (opcional):
- **Key**: `VITE_OPENAI_API_KEY`
- **Value**: Sua chave da OpenAI (ex: `sk-proj-...`)

### 8.3 Refazer o deploy

1. Vá em **"Deploys"**
2. Clique em **"Deploy your site"** (botão roxo)
3. Aguarde o deploy terminar

---

## 9. Testar tudo

### 9.1 Acesse seu site

1. O Netlify mostra a URL do seu site (algo como `random-name-12345.netlify.app`)
2. Clique para abrir

### 9.2 Testar funcionalidades

1. **Cadastro**: Clique em "Criar conta" e cadastre um email/senha
2. **Login**: Faça login com o cadastro
3. **Dashboard**: Verifique se carrega
4. **Wallet**: Adicione uma carteirinha
5. **Tradutor de Exames**: Cole um texto de exame e teste

### 9.3 Se der erro

1. Abra o console do navegador (F12 > Console)
2. Veja as mensagens de erro
3. Verifique se as variáveis de ambiente estão corretas

---

## 🎉 Parabéns!

Se você chegou até aqui, seu HealthWallet está funcionando!

### Próximos passos opcionais:

1. **Customizar domínio**: No Netlify, configure um domínio próprio
2. **HTTPS**: Já vem automático com Netlify
3. **Analytics**: Adicione Google Analytics
4. **Melhorias**: Podemos adicionar mais funcionalidades!

---

## 📞 Precisa de ajuda?

Se algo não funcionar:
1. Verifique os logs no console do navegador
2. Verifique se as variáveis estão corretas
3. Verifique se o deploy foi bem sucedido
4. Me chame para ajudar!

---

**Versão do App**: 1.0.0
**Última atualização**: 2026-05-23
