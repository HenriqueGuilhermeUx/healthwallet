export function generateHealthSummary(
  profile: any,
  records: any[] = [],
  medications: any[] = [],
  conditions: any[] = [],
  score: any = null
) {
  const healthScore = score?.score || profile?.med_score || profile?.medScore || 0

  const age = profile?.birth_date ? calculateAge(profile.birth_date) : null
  const bmi = profile?.weight && profile?.height
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

  const normalHighlights = analyzedRecords.flatMap((record) => {
    const items = record.ai_result?.items || []
    return items
      .filter((item: any) => item.status === 'normal')
      .slice(0, 8)
      .map((item: any) => `${item.name}: ${item.value}${item.unit ? ` ${item.unit}` : ''}`)
  })

  const allergies = Array.isArray(profile?.allergies)
    ? profile.allergies.join(', ')
    : profile?.allergies || 'Não informado'

  const medsText = medications.length
    ? medications.map((m) => `- ${m.name || m.medication_name || 'Medicamento'} ${m.dosage || ''} ${m.frequency || ''}`).join('\n')
    : profile?.current_medications || 'Nenhum medicamento informado'

  const conditionsText = conditions.length
    ? conditions.map((c) => `- ${c.name || c.condition || c.title || 'Condição'}`).join('\n')
    : profile?.chronic_conditions || 'Nenhuma condição informada'

  const alteredText = alteredItems.length
    ? alteredItems.map((item) =>
        `- ${item.name}: ${item.value}${item.unit ? ` ${item.unit}` : ''} | Ref: ${item.reference || 'não informada'} | Status: ${translateStatus(item.status)}${item.explanation ? `\n  Observação: ${item.explanation}` : ''}`
      ).join('\n')
    : 'Nenhum marcador alterado identificado nos exames analisados.'

  return `
RESUMO PROFISSIONAL DE SAÚDE

Identificação clínica:
- Idade: ${age ? `${age} anos` : 'Não informado'}
- Sexo: ${translateGender(profile?.gender)}
- Tipo sanguíneo: ${profile?.blood_type || 'Não informado'}
- Peso: ${profile?.weight ? `${profile.weight} kg` : 'Não informado'}
- Altura: ${profile?.height ? `${profile.height} cm` : 'Não informado'}
- IMC: ${bmi ? `${bmi.toFixed(1)} (${classifyBmi(bmi)})` : 'Não calculado'}
- Telefone: ${profile?.phone || 'Não informado'}

HealthScore:
- Score atual: ${healthScore}/100
- Nível: ${score?.status || profile?.med_score_status || 'Não informado'}

Hábitos e fatores de risco:
- Atividade física: ${translateLifestyle(profile?.physical_activity)}
- Tabagismo: ${translateLifestyle(profile?.smoking_status)}
- Álcool: ${translateLifestyle(profile?.alcohol_consumption)}
- Sono: ${profile?.sleep_hours ? `${profile.sleep_hours}h/noite` : 'Não informado'}
- Estresse: ${translateLifestyle(profile?.stress_level)}

Histórico e condições:
- Alergias: ${allergies}
- Condições/doenças: ${conditionsText}
- Histórico familiar: ${profile?.family_history || 'Não informado'}
- Cirurgias: ${profile?.surgeries || 'Não informado'}

Medicamentos:
${medsText}

Exames:
- Total de exames cadastrados: ${records.length}
- Exames com análise IA: ${analyzedRecords.length}

Principais pontos de atenção:
${alteredText}

Achados normais relevantes:
${normalHighlights.length ? normalHighlights.map((item) => `- ${item}`).join('\n') : 'Sem destaques normais estruturados disponíveis.'}

Interpretação geral:
Paciente com dados organizados no HealthWallet. O resumo considera informações declaradas no perfil, medicamentos, condições cadastradas, HealthScore e exames enviados. Os principais pontos de atenção devem ser avaliados em conjunto com sintomas, histórico clínico e exame físico.

Recomendações para consulta:
- Revisar os marcadores alterados com profissional de saúde.
- Confirmar medicamentos em uso, doses e aderência.
- Atualizar histórico de cirurgias, alergias e contato de emergência.
- Repetir exames conforme orientação médica, especialmente se houver alterações metabólicas, cardiovasculares, renais, hepáticas ou hormonais.
- Usar este resumo como apoio, não como diagnóstico.

Aviso:
Este resumo é informativo e não substitui avaliação médica profissional.
`.trim()
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
  }

  return map[value] || value || 'Não informado'
}

function translateLifestyle(value: string) {
  const map: Record<string, string> = {
    sedentary: 'Sedentário',
    light: 'Leve',
    moderate: 'Moderado',
    active: 'Ativo',
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
