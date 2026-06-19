export function calculateMedScore(profile: any, exams: any[] = [], conditions: any[] = []) {
  const items = exams.flatMap((exam) => exam.ai_result?.items || [])

  const metrics = {
    fastingGlucose: getValue(items, ['glicose', 'glicemia']),
    ldl: getValue(items, ['ldl']),
    hdl: getValue(items, ['hdl']),
    totalCholesterol: getValue(items, ['colesterol total']),
    triglycerides: getValue(items, ['triglic']),
    creatinine: getValue(items, ['creatinina']),
    tfg: getValue(items, ['tfg', 'filtra']),
    tsh: getValue(items, ['tsh']),
    hemoglobin: getValue(items, ['hemoglobina']),
  }

  const lab = calculateLabScore(metrics)
  const risk = calculateRiskScore(profile, conditions)
  const completeness = calculateCompletenessScore(profile, exams, metrics)

  const score = Math.max(0, Math.min(100, Math.round(lab.score + risk.score + completeness.score)))
  const confidence = Math.max(0, Math.min(100, Math.round(completeness.confidence)))

  const alerts = [...lab.alerts, ...risk.alerts]
  const missingExams = [...new Set([...lab.missingExams, ...completeness.missingExams])]
  const recommendations = [...lab.recommendations, ...risk.recommendations, ...completeness.recommendations]

  let level = 'Regular'
  let levelColor = 'yellow'

  if (score >= 85) {
    level = 'Excelente'
    levelColor = 'emerald'
  } else if (score >= 70) {
    level = 'Bom'
    levelColor = 'teal'
  } else if (score < 50) {
    level = 'Atenção'
    levelColor = 'red'
  }

  return {
    score,
    level,
    levelColor,
    confidence,
    alerts,
    missingExams,
    recommendations,
    metrics,
    breakdown: [
      { category: 'Laboratório', score: Math.round(lab.score), max: 40, icon: '🔬' },
      { category: 'Fatores de risco', score: Math.round(risk.score), max: 30, icon: '❤️' },
      { category: 'Completude', score: Math.round(completeness.score), max: 30, icon: '📋' },
    ],
    cockpit: {
      strengths: lab.strengths,
      needsAttention: alerts,
      missingInfo: completeness.missingInfo,
      nextActions: recommendations,
    },
  }
}

function calculateLabScore(metrics: any) {
  let score = 0
  const alerts: string[] = []
  const strengths: string[] = []
  const recommendations: string[] = []
  const missingExams: string[] = []

  if (metrics.fastingGlucose !== null) {
    if (metrics.fastingGlucose < 100) {
      score += 8
      strengths.push('Glicemia em jejum dentro da faixa normal')
    } else if (metrics.fastingGlucose < 126) {
      score += 4
      alerts.push('Glicemia limítrofe')
      recommendations.push('Avaliar hemoglobina glicada')
    } else {
      alerts.push('Glicemia elevada')
      recommendations.push('Conversar com médico sobre investigação metabólica')
    }
  } else {
    missingExams.push('Glicemia de jejum')
  }

  if (metrics.ldl !== null) {
    if (metrics.ldl < 100) {
      score += 10
      strengths.push('LDL em faixa favorável')
    } else if (metrics.ldl < 130) {
      score += 7
    } else if (metrics.ldl < 160) {
      score += 4
      alerts.push('LDL acima do recomendado')
      recommendations.push('Avaliar ApoB e Lipoproteína(a)')
    } else {
      score += 2
      alerts.push('LDL muito elevado')
      recommendations.push('Discutir risco cardiovascular com médico')
    }
  } else {
    missingExams.push('LDL colesterol')
  }

  if (metrics.hdl !== null) {
    if (metrics.hdl >= 60) {
      score += 5
      strengths.push('HDL em nível protetor')
    } else if (metrics.hdl >= 40) {
      score += 3
      strengths.push('HDL adequado')
    } else {
      alerts.push('HDL baixo')
    }
  }

  if (metrics.triglycerides !== null) {
    if (metrics.triglycerides < 150) {
      score += 5
      strengths.push('Triglicerídeos normais')
    } else {
      alerts.push('Triglicerídeos elevados')
      recommendations.push('Revisar açúcar, álcool e carboidratos refinados')
    }
  }

  if (metrics.totalCholesterol !== null && metrics.totalCholesterol >= 190) {
    alerts.push('Colesterol total elevado')
  }

  if (metrics.tfg !== null) {
    if (metrics.tfg >= 90) {
      score += 4
      strengths.push('TFG dentro da faixa esperada')
    } else {
      score += 2
      alerts.push('TFG discretamente abaixo do ideal')
      recommendations.push('Considerar urina tipo 1 e relação albumina/creatinina')
    }
  }

  if (metrics.creatinine !== null) {
    score += 3
    strengths.push('Creatinina avaliada')
  }

  if (metrics.tsh !== null) {
    score += 3
    strengths.push('Tireoide rastreada por TSH')
  }

  if (metrics.hemoglobin !== null) {
    score += 2
    strengths.push('Hemoglobina avaliada')
  } else {
    missingExams.push('Hemograma completo')
  }

  return {
    score: Math.min(40, score),
    alerts,
    strengths,
    recommendations,
    missingExams,
  }
}

function calculateRiskScore(profile: any, conditions: any[]) {
  let score = 30
  const alerts: string[] = []
  const recommendations: string[] = []

  const weight = Number(profile?.weight || profile?.peso)
  const height = Number(profile?.height || profile?.altura)

  if (weight && height) {
    const bmi = weight / Math.pow(height / 100, 2)

    if (bmi >= 25 && bmi < 30) {
      score -= 3
      alerts.push('IMC em faixa de sobrepeso')
      recommendations.push('Acompanhar peso, cintura e composição corporal')
    }

    if (bmi >= 30) {
      score -= 8
      alerts.push('IMC em faixa de obesidade')
      recommendations.push('Considerar plano de redução de peso com profissional')
    }
  } else {
    score -= 3
  }

  const smoking = profile?.smokingStatus || profile?.smoking_status
  if (smoking === 'current') {
    score -= 10
    alerts.push('Tabagismo ativo')
    recommendations.push('Considerar programa de cessação do tabagismo')
  } else if (smoking === 'former') {
    score -= 3
  }

  const alcohol = profile?.alcoholConsumption || profile?.alcohol_consumption
  if (alcohol === 'frequent') {
    score -= 5
    alerts.push('Consumo frequente de álcool')
  }

  const activity = profile?.physicalActivity || profile?.physical_activity
  if (activity === 'sedentary') {
    score -= 5
    alerts.push('Sedentarismo')
    recommendations.push('Buscar pelo menos 150 minutos/semana de atividade física')
  }

  if (conditions.length > 0) {
    score -= Math.min(6, conditions.length * 2)
  }

  return {
    score: Math.max(0, score),
    alerts,
    recommendations,
  }
}

function calculateCompletenessScore(profile: any, exams: any[], metrics: any) {
  let score = 0
  let confidence = 20
  const missingExams: string[] = []
  const missingInfo: string[] = []
  const recommendations: string[] = []

  if (profile?.birthDate || profile?.birth_date) score += 3
  else missingInfo.push('Data de nascimento')

  if (profile?.weight && profile?.height) score += 7
  else missingInfo.push('Peso e altura')

  if (profile?.bloodType || profile?.blood_type) score += 3
  else missingExams.push('Tipagem sanguínea')

  if (profile?.familyHistory || profile?.family_history) score += 3
  else missingInfo.push('Histórico familiar')

  if (profile?.currentMedications || profile?.current_medications) score += 3
  else missingInfo.push('Medicamentos atuais')

  if (profile?.allergies?.length) score += 2

  if (exams.length > 0) {
    score += 7
    confidence += 45
  } else {
    missingExams.push('Hemograma completo')
    missingExams.push('Perfil lipídico')
    missingExams.push('Glicemia de jejum')
  }

  if (metrics.ldl !== null && metrics.fastingGlucose !== null) confidence += 20

  if (missingInfo.length > 0) {
    recommendations.push('Completar informações pendentes no perfil')
  }

  if (missingExams.length > 0) {
    recommendations.push('Enviar ou realizar exames pendentes para aumentar precisão do MedScore')
  }

  return {
    score: Math.min(30, score),
    confidence,
    missingExams,
    missingInfo,
    recommendations,
  }
}

function getValue(items: any[], names: string[]) {
  const found = items.find((item: any) =>
    names.some((name) =>
      String(item.name || '').toLowerCase().includes(name)
    )
  )

  if (!found) return null

  return toNumber(found.value)
}

function toNumber(value: any) {
  return Number(String(value || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0
}
