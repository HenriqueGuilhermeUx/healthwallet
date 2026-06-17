import OpenAI from 'openai'

export async function generateHealthSummary(
 profile: any,
 records: any[]
) {

 const prompt = `
Crie um resumo de saúde.

Dados:

${JSON.stringify(profile)}

Registros:

${JSON.stringify(records)}

Inclua:

- perfil geral
- fatores de risco
- medicamentos
- exames
- recomendações

Não faça diagnóstico.
`

 return prompt
}
