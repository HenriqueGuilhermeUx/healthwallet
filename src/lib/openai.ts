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
  if (!examText || !examText.trim()) {
    throw new Error('Texto do exame é obrigatório')
  }

  const response = await fetch('/.netlify/functions/analyze-exam', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      examText,
      examType,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))

    throw new Error(
      errorData.error ||
        errorData.message ||
        `Erro ao analisar exame: ${response.status}`
    )
  }

  const result = await response.json()

  if (!result || !result.summary || !Array.isArray(result.items)) {
    throw new Error('Resposta inválida da análise de exame')
  }

  return result as ExamAnalysisResult
}

// Fallback mock data for when API is not available
export function getMockExamAnalysis(examType: string): ExamAnalysisResult {
  return {
    summary:
      'Seus exames apresentam resultados relevantes que merecem atenção. Alguns valores estão fora da faixa de referência e devem ser discutidos com seu médico.',
    items: [
      {
        name: 'Colesterol Total',
        value: '224 mg/dL',
        reference: '< 190 mg/dL',
        status: 'alto',
        explanation:
          'O colesterol total está acima do valor desejável. Isso pode aumentar o risco de doenças cardiovasculares. Recomenda-se conversar com seu médico e avaliar hábitos alimentares e atividade física.',
      },
      {
        name: 'LDL Cholesterol',
        value: '145 mg/dL',
        reference: '< 100 mg/dL',
        status: 'alto',
        explanation:
          'O LDL, conhecido como colesterol ruim, está elevado. Esse marcador pode estar associado ao acúmulo de placas nas artérias e deve ser avaliado por um profissional de saúde.',
      },
      {
        name: 'HDL Cholesterol',
        value: '52 mg/dL',
        reference: '> 40 mg/dL',
        status: 'normal',
        explanation:
          'O HDL, conhecido como colesterol bom, está dentro de uma faixa considerada adequada.',
      },
      {
        name: 'Triglicerídeos',
        value: '138 mg/dL',
        reference: '< 150 mg/dL',
        status: 'normal',
        explanation:
          'Os triglicerídeos estão dentro dos valores de referência informados.',
      },
    ],
    nextSteps: [
      'Consulte um médico para avaliar os resultados no contexto do seu histórico de saúde',
      'Mantenha uma alimentação equilibrada e acompanhe seus exames regularmente',
      'Pratique atividade física conforme orientação profissional',
    ],
  }
}
