export async function handler(event: any) {
  try {
    const { fileUrl, fileName } = JSON.parse(event.body || '{}')

    if (!fileUrl) {
      return ok(fallbackAnalysis('Arquivo sem URL informada.'))
    }

    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return ok(fallbackAnalysis('OPENAI_API_KEY não configurada.'))
    }

    const prompt = `
Analise este exame de saúde pela URL pública abaixo.

URL do arquivo:
${fileUrl}

Arquivo:
${fileName || 'exame'}

Responda SOMENTE JSON válido:
{
  "summary": "resumo simples para paciente",
  "items": [
    {
      "name": "nome do marcador",
      "value": "valor",
      "reference": "referência",
      "status": "normal|alto|baixo|atencao",
      "explanation": "explicação simples"
    }
  ],
  "nextSteps": ["orientação 1", "orientação 2"],
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
        input: prompt,
      }),
    })

    const json = await openaiRes.json()

    if (!openaiRes.ok) {
      return ok(fallbackAnalysis(json.error?.message || 'Erro OpenAI sem mensagem.'))
    }

    const text = json.output_text || ''
    let parsed: any

    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = fallbackAnalysis(text || 'IA não retornou JSON válido.')
    }

    return ok({
      summary: parsed.summary || 'Exame recebido e analisado.',
      items: Array.isArray(parsed.items) ? parsed.items : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      extractedText: parsed.extractedText || parsed.error || '',
      error: parsed.error || null,
    })
  } catch (error: any) {
    return ok(fallbackAnalysis(error.message || 'Erro inesperado.'))
  }
}

function ok(body: any) {
  return {
    statusCode: 200,
    body: JSON.stringify(body),
  }
}

function fallbackAnalysis(reason: string) {
  return {
    summary:
      'Exame recebido com sucesso. A análise automática não conseguiu interpretar o arquivo neste momento, mas o documento foi salvo no seu cofre de saúde.',
    items: [],
    nextSteps: [
      'Tente enviar uma foto mais nítida ou PDF com texto selecionável.',
      'Leve o exame para avaliação de um profissional de saúde.',
    ],
    extractedText: reason,
    error: reason,
  }
}
