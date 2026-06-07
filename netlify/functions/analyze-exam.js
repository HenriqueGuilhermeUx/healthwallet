exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({
          error: 'Method not allowed',
        }),
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'OPENAI_API_KEY não configurada no Netlify',
        }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const examText = body.examText || '';
    const examType = body.examType || 'outro';

    if (!examText) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'examText é obrigatório',
        }),
      };
    }

    const examTypeLabels = {
      hemograma: 'Hemograma Completo',
      lipidico: 'Perfil Lipídico',
      tireoide: 'Função Tireoidiana',
      glicemia: 'Glicemia e Diabetes',
      renal: 'Função Renal',
      hepatico: 'Função Hepática',
      outro: 'Exame Geral',
    };

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
5. Não dê diagnóstico médico definitivo
6. Recomende sempre consultar um profissional de saúde
7. Responda APENAS com o JSON, sem texto adicional`;

    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Você é um assistente educativo de saúde. Explique exames laboratoriais em português claro. Não dê diagnóstico definitivo, não prescreva medicamentos e recomende acompanhamento médico quando apropriado. Responda apenas com JSON válido.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      return {
        statusCode: response.status,
        body: JSON.stringify({
          error:
            errorData.error?.message ||
            `OpenAI API error: ${response.status}`,
        }),
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'No response from OpenAI',
        }),
      };
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Invalid response format',
        }),
      };
    }

    return {
      statusCode: 200,
      body: jsonMatch[0],
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || String(error),
      }),
    };
  }
};
