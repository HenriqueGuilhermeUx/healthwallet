export async function handler(event: any) {
  try {
    const { fileUrl, fileName } = JSON.parse(event.body || '{}')

    if (!fileUrl) {
      return { statusCode: 400, body: JSON.stringify({ error: 'fileUrl obrigatório' }) }
    }

    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY não configurada' }) }
    }

    const fileRes = await fetch(fileUrl)

    if (!fileRes.ok) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Não foi possível baixar o exame' }) }
    }

    const contentType = fileRes.headers.get('content-type') || 'application/pdf'
    const buffer = await fileRes.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const dataUrl = `data:${contentType};base64,${base64}`

    const prompt = `
Analise este exame de saúde.

Responda somente JSON válido:
{
  "summary": "resumo claro para paciente",
  "items": [
    {
      "name": "nome do marcador",
      "value": "valor encontrado",
      "reference": "referência",
      "status": "normal|alto|baixo|atencao",
      "explanation": "explicação simples"
    }
  ],
  "nextSteps": ["próximo passo 1", "próximo passo 2"],
  "extractedText": "texto relevante extraído"
}

Não dê diagnóstico.
Não substitua consulta médica.
`

    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              {
                type: 'input_file',
                filename: fileName || 'exame.pdf',
                file_data: dataUrl,
              },
            ],
          },
        ],
      }),
    })

    const json = await openaiRes.json()

    if (!openaiRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: json.error?.message || 'Erro na análise IA' }),
      }
    }

    const text =
      json.output_text ||
      json.output?.[0]?.content?.[0]?.text ||
      ''

    let parsed

    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = {
        summary: text || 'Exame recebido, mas a IA não conseguiu estruturar a análise.',
        items: [],
        nextSteps: ['Procure um profissional de saúde para interpretação.'],
        extractedText: text,
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Erro ao analisar exame' }),
    }
  }
}
