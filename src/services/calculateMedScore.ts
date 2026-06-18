export function calculateMedScore(profile: any, exams: any[] = [], conditions: any[] = []) {
  let score = 70
  let confidence = 30
  const missingExams: string[] = []
  const alerts: string[] = []

  const items = exams.flatMap((exam) => exam.ai_result?.items || [])

  const findItem = (names: string[]) =>
    items.find((item: any) =>
      names.some((name) =>
        String(item.name || '').toLowerCase().includes(name)
      )
    )

  const glicose = findItem(['glicose', 'glicemia'])
  const colesterolTotal = findItem(['colesterol total'])
  const ldl = findItem(['ldl'])
  const hdl = findItem(['hdl'])
  const triglicerides = findItem(['triglic'])
  const creatinina = findItem(['creatinina'])
  const tfg = findItem(['filtração', 'tfg'])
  const tsh = findItem(['tsh'])
  const hemoglobina = findItem(['hemoglobina'])

  if (profile?.weight && profile?.height) {
    confidence += 10
    const bmi = Number(profile.weight) / Math.pow(Number(profile.height) / 100, 2)

    if (bmi >= 18.5 && bmi < 25) score += 6
    else if (bmi >= 25 && bmi < 30) score -= 3
    else if (bmi >= 30) score -= 8
  }

  if (profile?.physicalActivity === 'active') score += 6
  if (profile?.physicalActivity === 'moderate') score += 4
  if (profile?.physicalActivity === 'sedentary') score -= 6

  if (profile?.smokingStatus === 'never') score += 5
  if (profile?.smokingStatus === 'current') score -= 12

  if (profile?.sleepHours >= 6 && profile?.sleepHours <= 9) score += 4
  if (profile?.sleepHours && profile.sleepHours < 6) score -= 4

  if (conditions.length > 0) score -= Math.min(12, conditions.length * 4)

  if (items.length > 0) confidence += 35
  else {
    missingExams.push('Hemograma Completo')
    missingExams.push('Perfil Lipídico')
    missingExams.push('Glicemia de Jejum')
  }

  if (!profile?.bloodType) missingExams.push('Tipagem Sanguínea')

  if (glicose) {
    const value = toNumber(glicose.value)
    confidence += 5
    if (value >= 100 && value < 126) {
      score -= 5
      alerts.push('Glicemia limítrofe')
    }
    if (value >= 126) {
      score -= 10
      alerts.push('Glicemia elevada')
    }
  } else {
    missingExams.push('Glicemia de Jejum')
  }

  if (ldl) {
    const value = toNumber(ldl.value)
    confidence += 8
    if (value >= 130 && value < 160) {
      score -= 8
      alerts.push('LDL acima do recomendado')
    }
    if (value >= 160) {
      score -= 14
      alerts.push('LDL muito elevado')
    }
  }

  if (colesterolTotal) {
    const value = toNumber(colesterolTotal.value)
    confidence += 5
    if (value >= 190 && value < 240) {
      score -= 5
      alerts.push('Colesterol total elevado')
    }
    if (value >= 240) {
      score -= 10
      alerts.push('Colesterol total muito elevado')
    }
  }

  if (hdl) {
    const value = toNumber(hdl.value)
    confidence += 4
    if (value >= 40) score += 3
    else {
      score -= 5
      alerts.push('HDL baixo')
    }
  }

  if (triglicerides) {
    const value = toNumber(triglicerides.value)
    confidence += 4
    if (value >= 150) {
      score -= 6
      alerts.push('Triglicérides elevados')
    }
  }

  if (creatinina) confidence += 4

  if (tfg) {
    const value = toNumber(tfg.value)
    confidence += 4
    if (value < 90) {
      score -= 4
      alerts.push('TFG abaixo do ideal')
    }
  }

  if (tsh) confidence += 3
  if (hemoglobina) confidence += 3

  const finalScore = Math.max(0, Math.min(100, Math.round(score)))
  const finalConfidence = Math.max(0, Math.min(100, Math.round(confidence)))

  let level = 'Regular'
  let levelColor = 'yellow'

  if (finalScore >= 85) {
    level = 'Excelente'
    levelColor = 'emerald'
  } else if (finalScore >= 70) {
    level = 'Bom'
    levelColor = 'teal'
  } else if (finalScore < 50) {
    level = 'Atenção'
    levelColor = 'red'
  }

  return {
    score: finalScore,
    level,
    levelColor,
    confidence: finalConfidence,
    missingExams: [...new Set(missingExams)],
    alerts,
    breakdown: [
      { category: 'Perfil', score: profile?.weight && profile?.height ? 80 : 50, icon: '👤' },
      { category: 'Hábitos', score: profile?.physicalActivity ? 75 : 50, icon: '🏃' },
      { category: 'Exames', score: items.length > 0 ? 85 : 30, icon: '🔬' },
      { category: 'Risco', score: alerts.length === 0 ? 90 : 60, icon: '❤️' },
    ],
  }
}

function toNumber(value: any) {
  return Number(String(value || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0
}
