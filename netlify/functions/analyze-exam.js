export async function handler(event: any) {
  try {
    const { fileUrl, fileName } = JSON.parse(event.body || '{}')

    if (!fileUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'fileUrl obrigatório' }),
      }
    }

    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OPENAI_API_KEY não configurada' }),
      }
    }

    const prompt = `
Você é um assistente de saúde.

Analise este exame enviado pelo paciente.

Extraia:
- nome dos exames encontrados
- valores
- referências
- status: normal, alto, baixo ou atenção
- resumo simples para paciente
- pontos de atenção para conversar com médico

Não dê diagnóstico.
Não substitua consulta médica.

Arquivo: ${fileName}
URL: ${fileUrl}
`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2,
      }),
    })

    const json = await openaiRes.json()
    const text = json.choices?.[0]?.message?.content || ''

    return {
      statusCode: 200,
      body: JSON.stringify({
        summary: text,
        extractedText: text,
        items: [],
      }),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Erro ao analisar exame',
      }),
    }
  }
}
