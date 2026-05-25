# ✅ CHECKLIST DE CONFIGURAÇÃO - HealthWallet

## 📋 Progresso

- [ ] 1. Criar conta no Supabase
- [ ] 2. Criar projeto no Supabase
- [ ] 3. Executar SQL no Supabase
- [ ] 4. Configurar autenticação (Email provider)
- [ ] 5. Obter chaves do Supabase
- [ ] 6. (Opcional) Criar conta na OpenAI
- [ ] 7. (Opcional) Obter chave da OpenAI
- [ ] 8. Criar repositório no GitHub
- [ ] 9. Enviar código para o GitHub
- [ ] 10. Conectar ao Netlify
- [ ] 11. Configurar variáveis de ambiente no Netlify
- [ ] 12. Refazer deploy
- [ ] 13. TESTAR TUDO!

---

## 📌 Onde Encontrar Cada Coisa

### Supabase - Settings > API
```
VITE_SUPABASE_URL = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Supabase - Authentication > Providers
```
Email: Habilitado ✓
```

### OpenAI - API Keys
```
VITE_OPENAI_API_KEY = sk-proj-...
```

### Netlify - Site Configuration > Environment Variables
```
VITE_SUPABASE_URL = (cola aqui)
VITE_SUPABASE_ANON_KEY = (cola aqui)
VITE_OPENAI_API_KEY = (cola aqui - opcional)
```

---

## 🚨 Troubleshooting

### "Login não funciona"
→ Verifique se o Email provider está habilitado no Supabase

### "Dados não salvam"
→ Execute o SQL novamente e verifique se não deu erro

### "IA não funciona"
→ Adicione a VITE_OPENAI_API_KEY no Netlify

### "Deploy falhou"
→ Verifique se o build command está como: pnpm build
→ Verifique se o publish directory está como: dist

---

## 📞 Links Úteis

- Supabase: https://supabase.com
- OpenAI: https://platform.openai.com
- Netlify: https://app.netlify.com
- GitHub: https://github.com
- Guia completo: SETUP_GUIDE.md
- SQL para executar: SQL_SUPABASE.sql