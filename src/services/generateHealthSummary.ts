export function generateHealthSummary(
  profile: any,
  records: any[] = [],
  medications: any[] = [],
  conditions: any[] = [],
  score: any = null
) {
  const healthScore = score?.score || profile?.med_score || profile?.medScore || 0
  const age = profile?.birth_date ? calculateAge(profile.birth_date) : null

  const bmi =
    profile?.weight && profile?.height
      ? Number(profile.weight) / Math.pow(Number(profile.height) / 100, 2)
      : null

  const analyzedRecords = records.filter((r) => r.ai_result || r.ai_analysis)

  const alteredItems = analyzedRecords.flatMap((record) => {
    const items = record.ai_result?.items || []
    return items
      .filter((item: any) => item.status && item.status !== 'normal')
      .map((item: any) => ({
        exam: record.file_name || record.exam_type || 'Exame',
        name: item.name,
        value: item.value,
        unit: item.unit || '',
        reference: item.reference || item.referenceRange || '',
        status: item.status,
        explanation: item.explanation || '',
      }))
  })

  const goodNews = analyzedRecords.flatMap((record) => {
    const arr = record.ai_result?.goodNews || []
    return Array.isArray(arr) ? arr : []
  })

  const alerts = analyzedRecords.flatMap((record) => {
    const arr = record.ai_result?.mainAlerts || []
    return Array.isArray(arr) ? arr : []
  })

  const examSummaries = analyzedRecords.map((record) => {
    const result = record.ai_result || {}
    const items = Array.isArray(result.items) ? result.items : []
    const altered = items.filter((item: any) => item.status && item.status !== 'normal')

    return {
      name: record.file_name || record.exam_type || 'Exame',
      date: record.exam_date || record.created_at,
      summary: result.clinicalSummary || result.summary || record.ai_analysis || '',
      altered,
    }
  })

  const allergies = Array.isArray(profile?.allergies)
    ? profile.allergies.join(', ')
    : profile?.allergies || 'Não informado'

  const medsText = medications.length
    ? medications
        .map((m) => `- ${m.name || m.medication_name || 'Medicamento'} ${m.dosage || ''} ${m.frequency || ''}`)
        .join('\n')
    : profile?.current_medications || 'Nenhum medicamento informado'

  const conditionsText = conditions.length
    ? conditions.map((c) => `- ${c.name || c.condition || c.title || 'Condição'}`).join('\n')
    : profile?.chronic_conditions || 'Nenhuma condição informada'

  const alteredText = alteredItems.length
    ? alteredItems
        .map(
          (item) =>
            `- ${item.name}: ${item.value}${item.unit ? ` ${item.unit}` : ''} | Ref: ${
              item.reference || 'não informada'
            } | ${translateStatus(item.status)}${item.explanation ? `\n  Obs: ${item.explanation}` : ''}`
        )
        .join('\n')
    : 'Nenhum marcador alterado identificado nos exames analisados.'

  return `
PRONTUÁRIO DIGITAL — RESUMO PROFISSIONAL

1. VISÃO GERAL DO PACIENTE

- Idade: ${age ? `${age} anos` : 'Não informado'}
- Sexo: ${translateGender(profile?.gender)}
- Tipo sanguíneo: ${profile?.blood_type || 'Não informado'}
- Peso: ${profile?.weight ? `${profile.weight} kg` : 'Não informado'}
- Altura: ${profile?.height ? `${profile.height} cm` : 'Não informado'}
- IMC: ${bmi ? `${bmi.toFixed(1)} (${classifyBmi(bmi)})` : 'Não calculado'}

MedScore:
- Score atual: ${healthScore}/100
- Nível: ${score?.status || profile?.med_score_status || 'Não informado'}
- Confiança dos dados: ${score?.factors?.confidence || 'Não informado'}%

2. HISTÓRICO CLÍNICO

Condições / doenças:
${conditionsText}

Alergias:
- ${allergies}

Histórico familiar:
- ${profile?.family_history || 'Não informado'}

Cirurgias / internações:
- ${profile?.surgeries || 'Não informado'}

Medicamentos em uso:
${medsText}

3. HÁBITOS E FATORES DE RISCO

- Atividade física: ${translateLifestyle(profile?.physical_activity)}
- Tabagismo: ${translateLifestyle(profile?.smoking_status)}
- Álcool: ${translateLifestyle(profile?.alcohol_consumption)}
- Sono: ${profile?.sleep_hours ? `${profile.sleep_hours}h/noite` : 'Não informado'}
- Estresse: ${translateLifestyle(profile?.stress_level)}

4. EXAMES DISPONÍVEIS

- Total de exames cadastrados: ${records.length}
- Exames com análise por IA: ${analyzedRecords.length}

${examSummaries.length ? examSummaries.map(formatExamSummary).join('\n\n') : 'Nenhum exame analisado disponível.'}

5. PRINCIPAIS PONTOS DE ATENÇÃO

${alerts.length ? unique(alerts).map((a) => `- ${a}`).join('\n') : alteredText}

6. ACHADOS POSITIVOS / DADOS TRANQUILIZADORES

${goodNews.length ? unique(goodNews).map((g) => `- ${g}`).join('\n') : 'Sem achados positivos estruturados disponíveis.'}

7. MARCADORES ALTERADOS

${alteredText}

8. RECOMENDAÇÕES PARA CONSULTA

- Revisar os marcadores alterados com profissional de saúde.
- Avaliar risco cardiovascular quando houver LDL, colesterol total, pressão arterial, histórico familiar ou tabagismo relevantes.
- Confirmar medicamentos em uso, doses e aderência.
- Atualizar alergias, cirurgias, histórico familiar e hábitos.
- Repetir exames conforme orientação profissional.
- Usar este resumo como apoio para consulta, não como diagnóstico.

9. OBSERVAÇÃO

Este resumo foi gerado a partir de dados informados pelo paciente, exames enviados e análises automáticas do HealthWallet. Não substitui avaliação clínica, exame físico ou decisão médica profissional.
`.trim()
}

function formatExamSummary(exam: any) {
  const date = exam.date ? new Date(exam.date).toLocaleDateString('pt-BR') : 'Data não informada'

  const altered =
    exam.altered && exam.altered.length
      ? exam.altered
          .map((item: any) => `  • ${item.name}: ${item.value} (${translateStatus(item.status)})`)
          .join('\n')
      : '  • Sem alterações estruturadas relevantes.'

  return `Exame: ${exam.name}
Data: ${date}

Resumo:
${exam.summary || 'Sem resumo disponível.'}

Alterações principais:
${altered}`
}

function calculateAge(birthDate: string) {
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function classifyBmi(bmi: number) {
  if (bmi < 18.5) return 'baixo peso'
  if (bmi < 25) return 'adequado'
  if (bmi < 30) return 'sobrepeso'
  if (bmi < 35) return 'obesidade grau I'
  if (bmi < 40) return 'obesidade grau II'
  return 'obesidade grau III'
}

function translateGender(value: string) {
  if (value === 'male') return 'Masculino'
  if (value === 'female') return 'Feminino'
  if (value === 'other') return 'Outro'
  return 'Não informado'
}

function translateStatus(value: string) {
  const map: Record<string, string> = {
    alto: 'Acima do recomendado',
    high: 'Acima do recomendado',
    baixo: 'Abaixo do recomendado',
    low: 'Abaixo do recomendado',
    atencao: 'Atenção',
    critical: 'Crítico',
    normal: 'Normal',
  }

  return map[value] || value || 'Não informado'
}

function translateLifestyle(value: string) {
  const map: Record<string, string> = {
    sedentary: 'Sedentário',
    light: 'Leve',
    moderate: 'Moderado',
    active: 'Ativo',
    very_active: 'Muito ativo',
    never: 'Nunca',
    former: 'Ex-fumante',
    current: 'Atual',
    occasional: 'Ocasional',
    frequent: 'Frequente',
    low: 'Baixo',
    medium: 'Moderado',
    high: 'Alto',
  }

  return value ? map[value] || value : 'Não informado'
}

function unique(arr: string[]) {
  return [...new Set(arr.filter(Boolean))]
}
