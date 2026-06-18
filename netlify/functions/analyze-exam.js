import pdfParse from 'pdf-parse'

export async function handler(event: any) {
  try {
    const { fileUrl, fileName } = JSON.parse(event.body || '{}')

    if (!fileUrl) return ok(fallback('Arquivo sem URL.'))

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return ok(fallback('OPENAI_API_KEY não configurada.'))

    const fileRes = await fetch(fileUrl)
    if (!fileRes.ok) return ok(fallback('Não foi possível baixar o exame.'))

    const contentType = fileRes.headers.get('content-type') || ''
    const buffer = Buffer.from(await fileRes.arrayBuffer())

    let extractedText = ''

    if (contentType.includes('pdf') || fileName?.toLowerCase().endsWith('.pdf')) {
      const pdf = await pdfParse(buffer)
      extractedText = pdf.text || ''
    } else {
      return ok(fallback('Imagem recebida. OCR visual será tratado no próximo passo.'))
    }

    if (!extractedText.trim()) {
      return ok(fallback('PDF sem texto extraível. Provavelmente é escaneado/imagem.'))
    }

    const prompt = `
Analise este exame de saúde brasileiro.

Texto extraído:
${extractedText.slice(0, 12000)}

Responda SOMENTE JSON válido:
{
  "summary": "resumo simples para paciente",
  "examType": "tipo do exame",
  "examDate": null,
  "laboratory": null,
  "confidence": 0.8,
  "items": [
    {
      "name": "nome do marcador",
      "value": "valor",
      "unit": "unidade",
      "reference": "referência",
      "status": "normal|alto|baixo|atencao",
      "explanation": "explicação simples",
      "context": "contexto clínico sem diagnóstico"
    }
  ],
  "nextSteps": ["orientação 1", "orientação 2"],
  "extractedText": "resumo do texto extraído"
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
      return ok(fallback(json.error?.message || 'Erro OpenAI.'))
    }

    const text = json.output_text || ''
    let parsed: any

    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = fallback('IA não retornou JSON válido.')
    }

    return ok({
      summary: parsed.summary || 'Exame analisado.',
      examType: parsed.examType || 'Exame',
      examDate: parsed.examDate || null,
      laboratory: parsed.laboratory || null,
      confidence: parsed.confidence || 0.7,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      extractedText: parsed.extractedText || extractedText.slice(0, 3000),
      error: null,
    })
  } catch (error: any) {
    return ok(fallback(error.message || 'Erro inesperado.'))
  }
}

function ok(body: any) {
  return {
    statusCode: 200,
    body: JSON.stringify(body),
  }
}

function fallback(reason: string) {
  return {
    summary:
      'Exame recebido com sucesso, mas a análise automática não conseguiu interpretar o arquivo.',
    examType: null,
    examDate: null,
    laboratory: null,
    confidence: 0,
    items: [],
    nextSteps: [
      'Envie PDF pesquisável ou arquivo com texto selecionável.',
      'Se for exame escaneado, enviaremos suporte visual no próximo passo.',
    ],
    extractedText: reason,
    error: reason,
  }
}
