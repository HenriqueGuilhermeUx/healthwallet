export function generateHealthSummary(
  profile: any,
  records: any[] = [],
  medications: any[] = [],
  conditions: any[] = [],
  score: any = null
) {
  const healthScore = score?.score || profile?.medScore || profile?.medscore || 0

  const bloodType = profile?.bloodType || 'Não informado'
  const weight = profile?.weight || 'Não informado'
  const height = profile?.height || 'Não informado'

  return `
RESUMO DE SAÚDE

Health Score:
${healthScore}/100

Dados principais:
- Tipo sanguíneo: ${bloodType}
- Peso: ${weight}
- Altura: ${height}

Condições cadastradas:
${conditions.length || 0}

Medicamentos em uso:
${medications.length || 0}

Exames disponíveis:
${records.length || 0}

Resumo:
Paciente com dados de saúde organizados no HealthWallet. Recomenda-se manter exames atualizados, revisar medicamentos em uso e compartilhar este resumo com um profissional de saúde quando necessário.

Pontos de atenção:
- Este resumo não substitui avaliação médica.
- Procure um profissional em caso de sintomas, alterações em exames ou dúvidas clínicas.
`
}
