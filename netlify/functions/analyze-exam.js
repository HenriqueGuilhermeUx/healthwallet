export async function handler(event: any) {
  try {
    const { fileUrl, fileName } = JSON.parse(event.body || '{}')

    if (!fileUrl) {
      return {
        statusCode: 200,
        body: JSON.stringify(fallbackAnalysis('Arquivo sem URL informada.')),
      }
    }

    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return {
        statusCode: 200,
        body: JSON.stringify(fallbackAnalysis('OPENAI_API_KEY não configurada.')),
      }
    }

    const fileRes = await fetch(fileUrl)

    if (!fileRes.ok) {
      return {
        statusCode: 200,
        body: JSON.stringify(fallbackAnalysis('Não foi possível baixar o arquivo do exame.')),
      }
    }

    const contentType = fileRes.headers.get('content-type') || 'application/pdf'
    const arrayBuffer = await fileRes.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const dataUrl = `data:${contentType};base64,${base64}`

    const prompt = `
Analise este exame de saúde enviado pelo paciente.

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
Arquivo: ${fileName || 'exame'}
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
        statusCode: 200,
        body: JSON.stringify(
          fallbackAnalysis(json.error?.message || 'Erro ao analisar com OpenAI.')
        ),
      }
    }

    const outputText =
      json.output_text ||
      json.output?.[0]?.content?.[0]?.text ||
      json.output?.[0]?.content?.[0]?.json ||
      ''

    let parsed: any

    if (typeof outputText === 'object') {
      parsed = outputText
    } else {
      try {
        parsed = JSON.parse(outputText)
      } catch {
        parsed = fallbackAnalysis(String(outputText || 'IA não retornou JSON estruturado.'))
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        summary: parsed.summary || 'Exame recebido e analisado.',
        items: Array.isArray(parsed.items) ? parsed.items : [],
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        extractedText: parsed.extractedText || parsed.error || '',
        error: parsed.error || null,
      }),
    }
  } catch (error: any) {
    return {
      statusCode: 200,
      body: JSON.stringify(fallbackAnalysis(error.message || 'Erro inesperado na análise.')),
    }
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
