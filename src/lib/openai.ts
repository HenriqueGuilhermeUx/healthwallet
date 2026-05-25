const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''

interface ExamAnalysisResult {
  summary: string
  items: Array<{
    name: string
    value: string
    reference: string
    status: 'normal' | 'alto' | 'baixo' | 'atencao'
    explanation: string
  }>
  nextSteps: string[]
}

export async function analyzeExamWithAI(
  examText: string,
  examType: string
): Promise<ExamAnalysisResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }

  const examTypeLabels: Record<string, string> = {
    hemograma: 'Hemograma Completo',
    lipidico: 'Perfil Lipídico',
    tireoide: 'Função Tireoidiana',
    glicemia: 'Glicemia e Diabetes',
    renal: 'Função Renal',
    hepatico: 'Função Hepática',
    outro: 'Exame Geral',
  }

  const prompt = `Você é um assistente médico especializado em análise de exames laboratoriais. Analise o texto do exame abaixo e forneça uma interpretação clara em português.

Tipo de exame: ${examTypeLabels[examType] || examType}

Texto do exame:
${examText}

Siga EXATAMENTE este formato JSON (sem markdown, sem código, apenas o JSON puro):
{
  "summary": "Resumo geral dos resultados em 2-3 frases, linguagem acessível para paciente",
  "items": [
    {
      "name": "Nome do exame",
      "value": "valor encontrado",
      "reference": "faixa de referência",
      "status": "normal|alto|baixo|atencao",
      "explanation": "Explicação simples do que significa este valor"
    }
  ],
  "nextSteps": ["Passo 1", "Passo 2", "Passo 3"]
}

Regras importantes:
1. STATUS: Use "normal" se dentro da referência, "alto" se acima, "baixo" se abaixo, "atencao" se muito fora ou crítico
2. Cada item deve ter name, value, reference, status e explanation
3. nextSteps deve ter 2-4 sugestões práticas
4. summary deve ser uma visão geral em português simples
5. Responda APENAS com o JSON, sem texto adicional`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente médico especializado. Analise exames laboratoriais e forneça resultados em português claro e acessível. Sempre responda apenas com JSON válido.'
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('No response from OpenAI')
  }

  // Parse JSON response
  try {
    // Try to extract JSON from the response (in case there's any extra text)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Invalid response format')
    }
    const result = JSON.parse(jsonMatch[0])
    return result as ExamAnalysisResult
  } catch (parseError) {
    console.error('Failed to parse AI response:', content)
    throw new Error('Failed to parse exam analysis result')
  }
}

// Fallback mock data for when API is not available
export function getMockExamAnalysis(examType: string): ExamAnalysisResult {
  return {
    summary: 'Seus exames apresentam resultados relevantes que merecem atenção. Alguns valores estão fora da faixa de referência e devem ser discutidos com seu médico.',
    items: [
      {
        name: 'Colesterol Total',
        value: '224 mg/dL',
        reference: '< 190 mg/dL',
        status: 'alto',
        explanation: 'O colesterol total está acima do valor desejável. Isso pode aumentar o risco de doenças cardiovasculares. Recomenda-se adotar uma dieta com menos gorduras saturadas.'
      },
      {
        name: 'LDL Cholesterol',
        value: '145 mg/dL',
        reference: '< 100 mg/dL',
        status: 'alto',
        explanation: 'O LDL (colesterol "ruim") está elevado. Este é o principal indicador de risco para acúmulo de placas nas artérias.'
      },
      {
        name: 'HDL Cholesterol',
        value: '52 mg/dL',
        reference: '> 40 mg/dL',
        status: 'normal',
        explanation: 'O HDL (colesterol "bom") está em níveis adequados.'
      },
      {
        name: 'Triglicerídeos',
        value: '138 mg/dL',
        reference: '< 150 mg/dL',
        status: 'normal',
        explanation: 'Os triglicerídeos estão dentro dos valores de referência.'
      },
    ],
    nextSteps: [
      'Consulte seu médico para avaliar os resultados',
      'Adote uma dieta com menos gorduras saturadas',
      'Pratique exercícios físicos regularmente',
    ],
  }
}