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
        body: JSON.stringify({ error: 'OPENAI_API_KEY não configurada no Netlify' }),
      }
    }

    const fileRes = await fetch(fileUrl)

    if (!fileRes.ok) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Não foi possível baixar o arquivo do exame' }),
      }
    }

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'
    const arrayBuffer = await fileRes.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const dataUrl = `data:${contentType};base64,${base64}`

    const prompt = `
Você é um assistente de saúde.

Analise o exame enviado pelo paciente.

Extraia:
- exames encontrados
- valores
- referências
- status: normal, alto, baixo ou atenção
- resumo simples para paciente
- pontos de atenção para conversar com médico

Responda APENAS em JSON válido neste formato:

{
  "summary": "texto curto",
  "items": [
    {
      "name": "nome do exame",
      "value": "valor",
      "reference": "referência",
      "status": "normal|alto|baixo|atencao",
      "explanation": "explicação simples"
    }
  ],
  "nextSteps": ["orientação 1", "orientação 2"],
  "extractedText": "texto extraído resumido"
}

Não dê diagnóstico.
Não substitua consulta médica.
Arquivo: ${fileName}
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
              { type: 'input_file', filename: fileName || 'exame.pdf', file_data: dataUrl },
            ],
          },
        ],
      }),
    })

    const json = await openaiRes.json()

    if (!openaiRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: json.error?.message || 'Erro na OpenAI',
        }),
      }
    }

    const outputText =
      json.output_text ||
      json.output?.[0]?.content?.[0]?.text ||
      ''

    let parsed

    try {
      parsed = JSON.parse(outputText)
    } catch {
      parsed = {
        summary: outputText || 'Exame recebido, mas não foi possível estruturar a análise.',
        items: [],
        nextSteps: ['Converse com um profissional de saúde para interpretar o exame.'],
        extractedText: outputText,
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed),
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
