export async function handler(event: any) {
  try {
    const { fileUrl, fileName } = JSON.parse(event.body || '{}')

    if (!fileUrl) return ok(fallbackAnalysis('Arquivo sem URL informada.'))

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return ok(fallbackAnalysis('OPENAI_API_KEY não configurada.'))

    const fileRes = await fetch(fileUrl)
    if (!fileRes.ok) return ok(fallbackAnalysis('Não foi possível baixar o arquivo.'))

    const contentType = fileRes.headers.get('content-type') || 'application/pdf'
    const arrayBuffer = await fileRes.arrayBuffer()

    const prompt = `
Você é um especialista em exames laboratoriais brasileiros.

Extraia TODOS os dados visíveis do exame:
- tipo do exame
- data
- laboratório
- paciente, se visível
- todos os marcadores
- valor
- unidade
- referência
- status: normal, alto, baixo ou atencao
- explicação simples
- próximos passos

Responda SOMENTE JSON válido:
{
  "summary": "resumo claro para paciente",
  "examType": "tipo do exame",
  "examDate": "YYYY-MM-DD ou null",
  "laboratory": "laboratório ou null",
  "patientName": "nome ou null",
  "confidence": 0.0,
  "items": [
    {
      "name": "Glicemia",
      "value": "95",
      "unit": "mg/dL",
      "reference": "70-99",
      "status": "normal|alto|baixo|atencao",
      "explanation": "explicação simples",
      "context": "contexto clínico sem diagnóstico"
    }
  ],
  "nextSteps": ["passo 1", "passo 2"],
  "extractedText": "texto relevante extraído"
}

Não dê diagnóstico.
Não substitua consulta médica.
`

    let content: any[] = [{ type: 'input_text', text: prompt }]

    if (contentType.startsWith('image/')) {
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      content.push({
        type: 'input_image',
        image_url: `data:${contentType};base64,${base64}`,
      })
    } else {
      const form = new FormData()
      form.append('purpose', 'user_data')
      form.append(
        'file',
        new Blob([arrayBuffer], { type: contentType }),
        fileName || 'exame.pdf'
      )

      const uploadRes = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      })

      const uploadJson = await uploadRes.json()

      if (!uploadRes.ok || !uploadJson.id) {
        return ok(fallbackAnalysis(uploadJson.error?.message || 'Erro ao subir arquivo para OpenAI.'))
      }

      content.push({
        type: 'input_file',
        file_id: uploadJson.id,
      })
    }

    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{ role: 'user', content }],
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
      examType: parsed.examType || null,
      examDate: parsed.examDate || null,
      laboratory: parsed.laboratory || null,
      patientName: parsed.patientName || null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
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
    examType: null,
    examDate: null,
    laboratory: null,
    patientName: null,
    confidence: 0,
    items: [],
    nextSteps: [
      'Tente enviar uma foto mais nítida ou PDF com texto selecionável.',
      'Leve o exame para avaliação de um profissional de saúde.',
    ],
    extractedText: reason,
    error: reason,
  }
}
