// MyDataMed Concierge legal onboarding bridge (server-side only).
import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' })

  try {
    const token = bearer(event.headers?.authorization || event.headers?.Authorization)
    if (!token) return json(401, { error: 'authentication_required' })

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    const docwalletBase = String(process.env.DOCWALLET_API_URL || '').replace(/\/$/, '')
    const docwalletKey = String(process.env.DOCWALLET_MYDATAMED_SERVICE_KEY || '')

    if (!supabaseUrl || !anonKey || !serviceKey) return json(503, { error: 'server_not_configured' })
    if (!docwalletBase || !docwalletKey) return json(503, { error: 'docwallet_not_configured' })

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    const user = authData?.user
    if (authError || !user) return json(401, { error: 'invalid_session' })

    const body = JSON.parse(event.body || '{}')
    const action = String(body.action || 'create')

    const [{ data: membership }, { data: entitlement }, { data: existingAuth }] = await Promise.all([
      admin
        .from('concierge_memberships')
        .select('patient_id,status,plan_code,consent_status,metadata')
        .eq('patient_id', user.id)
        .maybeSingle(),
      admin
        .from('concierge_entitlements')
        .select('status,plan_code,current_period_end,grace_until')
        .eq('patient_id', user.id)
        .maybeSingle(),
      admin
        .from('concierge_legal_authorizations')
        .select('*')
        .eq('patient_id', user.id)
        .eq('authorization_type', 'combined_onboarding')
        .maybeSingle(),
    ])

    const entitlementAllowed = entitlement
      ? ['trial','active','grace'].includes(entitlement.status)
      : Boolean(membership && ['pilot','active'].includes(membership.status))

    if (!membership || !entitlementAllowed) {
      return json(403, { error: 'concierge_subscription_required' })
    }

    if (membership.consent_status !== 'accepted') {
      return json(409, { error: 'concierge_consent_required' })
    }

    if (action === 'sync') {
      if (!existingAuth?.docwallet_signature_request_id) {
        return json(200, { status: existingAuth?.status || 'pending', signed: false })
      }

      const response = await fetch(
        `${docwalletBase}/api/internal/mydatamed/concierge/signatures/${encodeURIComponent(existingAuth.docwallet_signature_request_id)}`,
        {
          headers: { 'X-MyDataMed-Key': docwalletKey },
        },
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success === false) {
        return json(response.status || 502, { error: result?.error || 'signature_status_failed' })
      }

      const req = result.request || {}
      const signed = req.status === 'completed'
      const patch = {
        status: signed ? 'signed' : 'signature_pending',
        content_hash: req.contentHash || existingAuth.content_hash || null,
        final_hash: req.finalHash || existingAuth.final_hash || null,
        signed_at: signed ? (req.completedAt || new Date().toISOString()) : null,
        metadata: {
          ...(existingAuth.metadata || {}),
          provider: 'docwallet',
          required_evidence: 'verified_evidence',
          last_synced_at: new Date().toISOString(),
        },
      }

      await admin
        .from('concierge_legal_authorizations')
        .update(patch)
        .eq('id', existingAuth.id)

      return json(200, {
        status: patch.status,
        signed,
        requestId: req.id || existingAuth.docwallet_signature_request_id,
      })
    }

    if (existingAuth?.status === 'signed') {
      return json(200, {
        status: 'signed',
        signed: true,
        requestId: existingAuth.docwallet_signature_request_id,
      })
    }

    const fullName = String(
      membership?.metadata?.patient_name
      || user.user_metadata?.full_name
      || user.user_metadata?.name
      || user.email
      || 'Paciente'
    ).trim()
    const email = String(membership?.metadata?.patient_email || user.email || '').trim().toLowerCase()

    if (!email) return json(400, { error: 'patient_email_required' })

    const content = buildCombinedOnboarding({
      fullName,
      email,
    })

    const response = await fetch(`${docwalletBase}/api/internal/mydatamed/concierge/signatures`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MyDataMed-Key': docwalletKey,
        'X-Idempotency-Key': `healthwallet:${user.id}:combined_onboarding:v1`,
      },
      body: JSON.stringify({
        documentType: 'combined_onboarding',
        externalReference: `subscriber:${user.id}`,
        title: 'Termo Integrado de Serviço, Privacidade e Representação — MyDataMed Concierge',
        content,
        signer: {
          name: fullName,
          email,
        },
      }),
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok || result?.success === false) {
      return json(response.status || 502, { error: result?.error || 'docwallet_create_failed' })
    }

    const req = result.request || {}
    const party = req.parties?.[0] || {}

    const row = {
      patient_id: user.id,
      authorization_type: 'combined_onboarding',
      status: req.status === 'completed' ? 'signed' : 'signature_pending',
      docwallet_signature_request_id: req.id || null,
      content_hash: req.contentHash || null,
      final_hash: req.finalHash || null,
      signed_at: req.completedAt || null,
      metadata: {
        provider: 'docwallet',
        template_version: 'v1',
        required_evidence: 'verified_evidence',
        source: 'healthwallet_self_service',
      },
    }

    await admin
      .from('concierge_legal_authorizations')
      .upsert(row, { onConflict: 'patient_id,authorization_type' })

    return json(200, {
      status: row.status,
      signed: row.status === 'signed',
      requestId: req.id || null,
      signUrl: party.signUrl || null,
      requiredEvidence: result.requiredEvidence || 'verified_evidence',
    })
  } catch (error) {
    console.error('Concierge legal onboarding error:', error)
    return json(500, { error: 'concierge_legal_onboarding_failed' })
  }
}

function buildCombinedOnboarding({ fullName, email }) {
  const today = new Intl.DateTimeFormat('pt-BR').format(new Date())

  return `TERMO INTEGRADO MYDATAMED CONCIERGE

Data: ${today}
Titular/signatário: ${fullName}
E-mail: ${email}

1. OBJETO
O MyDataMed Concierge presta coordenação administrativa e operacional da jornada de saúde, incluindo organização de demandas, comunicação, acompanhamento de protocolos, busca e agendamento de prestadores, autorizações, reembolsos, documentação e acompanhamento de pendências.

2. LIMITES ASSISTENCIAIS E JURÍDICOS
O Concierge não substitui atendimento médico, não diagnostica, não prescreve e não altera tratamento. Informações regulatórias são educativas e operacionais e não constituem parecer jurídico individualizado. Ações judiciais, liminares e atos privativos da advocacia dependem de profissional habilitado.

3. DADOS PESSOAIS E DADOS DE SAÚDE
O titular autoriza o tratamento dos dados pessoais e sensíveis estritamente necessários à prestação do Concierge, com finalidade determinada, controles de acesso, registro de operações e compartilhamento somente com pessoas e organizações necessárias à execução da demanda.

4. REPRESENTAÇÃO ADMINISTRATIVA
O titular autoriza a equipe Concierge, por representantes designados, a contatar operadoras, prestadores, centrais de atendimento e Ouvidorias; solicitar e acompanhar informações, protocolos, autorizações, agendamentos, reembolsos e reanálises; encaminhar documentos fornecidos pelo titular; e registrar reclamações administrativas quando o canal admitir representação por terceiro.

Esta autorização não permite movimentação financeira, contratação ou cancelamento de plano, alteração de beneficiários, aceitação de acordo com renúncia de direitos, compartilhamento ou armazenamento de senha pessoal, decisão médica, prescrição, alteração de tratamento ou representação judicial.

5. CÍRCULO DE CUIDADO
O Concierge pode ajudar o titular a organizar a saúde de familiares vinculados à HealthWallet. Para adultos capazes, a atuação em nome do familiar depende de autorização própria quando necessária. Para menores ou dependentes, podem ser exigidos documentos que comprovem representação legal.

6. REVOGAÇÃO
O titular pode revogar a autorização para atos futuros, sem apagar registros necessários à comprovação de operações já realizadas ou ao cumprimento de obrigações legais.

Ao assinar eletronicamente, o titular declara que leu, compreendeu e concorda com o presente termo e autoriza o registro das evidências técnicas da assinatura.`
}

function bearer(value) {
  const match = String(value || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1] || null
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  }
}
