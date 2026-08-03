import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Brain,
  CheckCircle,
  Dna,
  Dumbbell,
  FileText,
  HeartPulse,
  Leaf,
  Loader2,
  Lock,
  Pill,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createMedicalEvent } from '@/services/medicalTimeline'

const OCR_API_URL = 'https://healthwallet-ocr-api.onrender.com'
const CONSENT_TEXT = 'Autorizo o HealthWallet a armazenar este arquivo genetico em bucket privado e gerar resumo educativo. Entendo que genetica e dado sensivel e que o app nao faz diagnostico, prescricao, troca ou ajuste de medicamentos.'

const emptyInterest = {
  interest_type: 'health_genetics',
  city: '',
  state: '',
  preferred_price_range: '',
  consent_to_contact: false,
}

type GeneticReport = {
  id: string
  file_name?: string | null
  source_company?: string | null
  test_type?: string | null
  ai_summary?: string | null
  categories?: any[] | null
  analysis_status?: string | null
  raw_data_uploaded?: boolean | null
  created_at?: string | null
}

type GeneticFinding = {
  category: string
  gene?: string | null
  variant?: string | null
  rsid?: string | null
  condition_or_trait?: string | null
  evidence_level?: string | null
  clinical_actionability?: string | null
  summary?: string | null
  recommendation_text?: string | null
  requires_professional_review?: boolean
  metadata?: Record<string, any>
}

export default function Genetics() {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [reports, setReports] = useState<GeneticReport[]>([])
  const [findings, setFindings] = useState<GeneticFinding[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [sourceCompany, setSourceCompany] = useState('')
  const [testType, setTestType] = useState('unknown')
  const [error, setError] = useState<string | null>(null)
  const [interest, setInterest] = useState<any>(emptyInterest)
  const [interestSaved, setInterestSaved] = useState(false)

  useEffect(() => {
    loadGenetics()
  }, [user])

  async function loadGenetics() {
    if (!user) return
    setLoading(true)
    try {
      const [reportsRes, findingsRes] = await Promise.all([
        supabase.from('genetic_reports').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('genetic_report_findings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      ])

      if (reportsRes.error) throw reportsRes.error
      setReports(reportsRes.data || [])
      setFindings(findingsRes.data || [])
    } catch (err) {
      console.warn('Genetics tables not ready yet. Run SQL_HEALTHWALLET_GENETICA_V1.sql.', err)
    } finally {
      setLoading(false)
    }
  }

  function openPicker() {
    if (!consentAccepted) {
      setError('Aceite o consentimento específico para dados genéticos antes de enviar.')
      return
    }
    fileInputRef.current?.click()
  }

  async function handleFileSelect(file: File) {
    if (!user) return

    setError(null)

    if (file.size > 25 * 1024 * 1024) {
      setError('Para este MVP, envie arquivos de até 25 MB. Raw data muito grande ficará para a próxima fase.')
      return
    }

    const allowed = isAllowedGeneticFile(file)
    if (!allowed) {
      setError('Envie PDF, JPG, PNG, WEBP, TXT, CSV ou VCF.')
      return
    }

    setUploading(true)
    setAnalyzing(false)

    try {
      const inferredType = testType === 'unknown' ? inferTestType(file, sourceCompany) : testType
      const rawDataUploaded = ['microarray_raw', 'vcf_raw', 'wes', 'wgs'].includes(inferredType)
      const filePath = `${user.id}/${Date.now()}-${safeFileName(file.name)}`

      await supabase.from('genetic_upload_consents').insert({
        user_id: user.id,
        consent_text: CONSENT_TEXT,
        metadata: {
          source_company: sourceCompany || null,
          selected_test_type: inferredType,
          file_name: file.name,
          file_size: file.size,
          privacy_level: 'genetic_sensitive',
        },
      })

      const { error: uploadError } = await supabase.storage.from('genetic-reports').upload(filePath, file, {
        contentType: file.type || guessMimeFromName(file.name),
        upsert: false,
      })
      if (uploadError) throw uploadError

      setUploading(false)
      setAnalyzing(true)

      const signed = await supabase.storage.from('genetic-reports').createSignedUrl(filePath, 60 * 60)
      const analysis = await analyzeGeneticFile({
        signedUrl: signed.data?.signedUrl || '',
        file,
        inferredType,
        sourceCompany,
      })

      const normalizedFindings = extractGeneticFindings(analysis)
      const categories = buildCategorySummary(analysis, inferredType, normalizedFindings)

      const { data: report, error: reportError } = await supabase
        .from('genetic_reports')
        .insert({
          user_id: user.id,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || guessMimeFromName(file.name),
          source_company: sourceCompany || inferCompanyFromName(file.name) || null,
          test_type: inferredType,
          raw_data_uploaded: rawDataUploaded,
          analysis_status: analysis?.fallback ? 'needs_review' : 'processed',
          ai_summary: analysis?.summary || buildEducationalSummary(inferredType, sourceCompany),
          categories,
          extraction_payload: analysis || {},
        })
        .select()
        .single()

      if (reportError) throw reportError

      if (normalizedFindings.length > 0) {
        await supabase.from('genetic_report_findings').insert(
          normalizedFindings.map((finding) => ({
            report_id: report.id,
            user_id: user.id,
            ...finding,
          }))
        )
      }

      await createMedicalEvent({
        userId: user.id,
        type: 'genetic_report_uploaded',
        title: 'Exame genético salvo',
        description: `${file.name} salvo no cofre genético. Uso educativo; revise achados relevantes com profissional de saúde/geneticista.`,
      })

      setConsentAccepted(false)
      setSourceCompany('')
      setTestType('unknown')
      loadGenetics()
    } catch (err: any) {
      console.error('Genetics upload error:', err)
      setError(err.message || 'Não foi possível salvar o exame genético. Rode SQL_HEALTHWALLET_GENETICA_V1.sql no Supabase e tente novamente.')
    } finally {
      setUploading(false)
      setAnalyzing(false)
    }
  }

  async function analyzeGeneticFile({ signedUrl, file, inferredType, sourceCompany }: any) {
    if (!signedUrl) return buildFallbackAnalysis(inferredType, sourceCompany)

    try {
      const response = await fetch(`${OCR_API_URL}/analyze-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          fileUrl: signedUrl,
          fileName: file.name,
          documentType: 'genetic_report',
          extractionHints: {
            documentType: 'genetic_report',
            sensitiveData: true,
            genetics: true,
            testType: inferredType,
            sourceCompany: sourceCompany || null,
            preferredFields: [
              'source_company',
              'test_type',
              'gene',
              'variant',
              'rsid',
              'condition_or_trait',
              'category',
              'evidence_level',
              'clinical_actionability',
              'pharmacogenomics',
              'nutrition',
              'fitness',
              'hereditary_risk',
              'carrier_status',
            ],
            instruction:
              'Trate como laudo genetico ou raw data genetico. Gere resumo educativo em portugues. Categorize achados em farmacogenomica, nutricao/metabolismo, performance, riscos hereditarios, carrier status e privacidade. Nao diagnostique, nao recomende medicamento, nao altere dose e sempre oriente revisao com medico/geneticista para achados relevantes.',
          },
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload) return buildFallbackAnalysis(inferredType, sourceCompany)
      return payload
    } catch {
      return buildFallbackAnalysis(inferredType, sourceCompany)
    }
  }

  async function submitInterest() {
    if (!user) return
    if (!interest.consent_to_contact) {
      alert('Marque a autorização de contato para registrar interesse em parceria futura.')
      return
    }

    try {
      await supabase.from('genetic_partner_interest').insert({
        user_id: user.id,
        interest_type: interest.interest_type,
        city: interest.city || null,
        state: interest.state || null,
        preferred_price_range: interest.preferred_price_range || null,
        consent_to_contact: interest.consent_to_contact,
        metadata: {
          source: 'healthwallet_genetics_page',
          user_email: user.email || null,
        },
      })

      await createMedicalEvent({
        userId: user.id,
        type: 'genetic_partner_interest',
        title: 'Interesse em exame genético',
        description: 'Usuário demonstrou interesse em futura parceria de exame genético.',
      })

      setInterest(emptyInterest)
      setInterestSaved(true)
    } catch (err: any) {
      alert(err.message || 'Não foi possível registrar o interesse. Rode SQL_HEALTHWALLET_GENETICA_V1.sql no Supabase.')
    }
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-2xl bg-gradient-to-br from-violet-700 via-indigo-800 to-slate-900 p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Dna className="h-7 w-7" /></div>
          <div>
            <h1 className="text-2xl font-bold">Genética</h1>
            <p className="text-sm text-white/80">Salve laudos genéticos, entenda categorias e prepare perguntas para seu médico.</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 space-y-2">
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" /><div><p className="font-bold">Uso educativo e seguro</p><p>O HealthWallet não diagnostica, não prescreve, não troca remédio e não ajusta dose com base em genética. Achados relevantes devem ser revisados com médico/geneticista.</p></div></div>
      </section>

      <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 space-y-3">
        <div className="flex items-start gap-2"><Lock className="mt-0.5 h-5 w-5 text-violet-700" /><div><p className="font-bold">Cofre genético privado</p><p>Arquivos genéticos ficam em bucket privado. Eles não entram automaticamente em compartilhamentos com profissionais.</p></div></div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Empresa/laboratório" value={sourceCompany} onChange={setSourceCompany} placeholder="Genera, 23andMe..." />
          <div>
            <label className="mb-1 block text-xs font-semibold">Tipo</label>
            <select value={testType} onChange={(e) => setTestType(e.target.value)} className="w-full rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm">
              <option value="unknown">Não sei</option>
              <option value="pdf_report">Laudo PDF</option>
              <option value="microarray_raw">Raw data / microarray</option>
              <option value="vcf_raw">VCF</option>
              <option value="pharmacogenomics">Farmacogenômica</option>
              <option value="wes">Exoma / WES</option>
              <option value="wgs">Genoma completo / WGS</option>
              <option value="ancestry">Ancestralidade</option>
            </select>
          </div>
        </div>

        <label className="flex items-start gap-2 rounded-xl border bg-white p-3">
          <input type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} className="mt-1" />
          <span>{CONSENT_TEXT}</span>
        </label>

        <input ref={fileInputRef} type="file" accept="application/pdf,image/*,.txt,.csv,.vcf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
        <button onClick={openPicker} disabled={uploading || analyzing} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 py-3 font-semibold text-white disabled:opacity-60">
          {uploading || analyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {uploading ? 'Enviando...' : analyzing ? 'Analisando...' : 'Enviar exame genético'}
        </button>
        <p className="text-xs text-violet-800">Aceita PDF, imagem, TXT, CSV ou VCF até 25 MB. Raw data muito grande fica para fase 2.</p>
      </section>

      {error && <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</section>}

      <section className="grid grid-cols-2 gap-3">
        <CategoryCard icon={Pill} title="Farmacogenômica" text="Organiza sinais sobre resposta a medicamentos para discutir com profissional." />
        <CategoryCard icon={Leaf} title="Nutrição" text="Agrupa pontos ligados a metabolismo, dieta e bem-estar." />
        <CategoryCard icon={Dumbbell} title="Performance" text="Ajuda a entender traços ligados a exercício e recuperação." />
        <CategoryCard icon={HeartPulse} title="Riscos" text="Destaca achados que exigem cautela e revisão clínica." />
      </section>

      <section className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-bold">Meus exames genéticos</h2>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-violet-700" /></div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            <Dna className="mx-auto mb-2 h-9 w-9 text-violet-600" />
            Nenhum exame genético salvo ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => <ReportCard key={report.id} report={report} />)}
          </div>
        )}
      </section>

      {findings.length > 0 && (
        <section className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-bold">Achados organizados para revisão</h2>
          {findings.slice(0, 6).map((finding, index) => <FindingCard key={index} finding={finding} />)}
        </section>
      )}

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3 text-sm text-emerald-950">
        <div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-5 w-5 text-emerald-700" /><div><p className="font-bold">Ainda não fez exame genético?</p><p>Registre interesse para uma futura parceria. Não é compra automática.</p></div></div>
        {interestSaved && <p className="rounded-lg bg-white p-2 text-emerald-700">Interesse registrado. Vamos usar isso para negociar parcerias melhores.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Cidade" value={interest.city} onChange={(v: string) => setInterest({ ...interest, city: v })} />
          <Input label="UF" value={interest.state} onChange={(v: string) => setInterest({ ...interest, state: v.toUpperCase().slice(0, 2) })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Principal interesse</label>
          <select value={interest.interest_type} onChange={(e) => setInterest({ ...interest, interest_type: e.target.value })} className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 text-sm">
            <option value="health_genetics">Saúde preventiva</option>
            <option value="pharmacogenomics">Farmacogenômica</option>
            <option value="nutrition_fitness">Nutrição e performance</option>
            <option value="ancestry">Ancestralidade</option>
            <option value="complete_genome">Genoma completo</option>
          </select>
        </div>
        <Input label="Faixa de preço aceitável" value={interest.preferred_price_range} onChange={(v: string) => setInterest({ ...interest, preferred_price_range: v })} placeholder="Ex: até R$300, R$300-600..." />
        <label className="flex items-start gap-2 rounded-xl bg-white p-3"><input type="checkbox" checked={interest.consent_to_contact} onChange={(e) => setInterest({ ...interest, consent_to_contact: e.target.checked })} className="mt-1" /><span>Autorizo contato futuro sobre parceria de exame genético.</span></label>
        <button onClick={submitInterest} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white">Tenho interesse</button>
      </section>
    </div>
  )
}

function CategoryCard({ icon: Icon, title, text }: any) {
  return <div className="rounded-xl border bg-white p-3"><Icon className="mb-2 h-5 w-5 text-violet-700" /><p className="font-bold text-sm">{title}</p><p className="mt-1 text-xs text-muted-foreground">{text}</p></div>
}

function ReportCard({ report }: { report: GeneticReport }) {
  const categories = Array.isArray(report.categories) ? report.categories : []
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100"><FileText className="h-5 w-5 text-violet-700" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{report.file_name || 'Exame genético'}</p>
          <p className="text-xs text-muted-foreground">{translateTestType(report.test_type)}{report.source_company ? ` · ${report.source_company}` : ''}</p>
          {report.ai_summary && <p className="mt-2 text-sm text-gray-700">{report.ai_summary}</p>}
          {categories.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{categories.slice(0, 4).map((item: any, index: number) => <span key={index} className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">{item.title || item.category || item}</span>)}</div>}
          <p className="mt-2 flex items-center gap-1 text-xs text-amber-700"><ShieldCheck className="h-3 w-3" /> Revisar achados relevantes com profissional.</p>
        </div>
      </div>
    </div>
  )
}

function FindingCard({ finding }: { finding: GeneticFinding }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3 text-sm">
      <div className="flex items-center gap-2"><Brain className="h-4 w-4 text-violet-700" /><p className="font-semibold">{translateCategory(finding.category)}</p></div>
      <p className="mt-1 text-muted-foreground">{[finding.gene, finding.rsid, finding.condition_or_trait].filter(Boolean).join(' · ') || 'Achado genético'}</p>
      {finding.summary && <p className="mt-2">{finding.summary}</p>}
      <p className="mt-2 text-xs text-amber-700">Uso educativo. Não tomar decisão clínica sem revisão profissional.</p>
    </div>
  )
}

function Input({ label, value, onChange, placeholder = '' }: any) {
  return <div><label className="mb-1 block text-xs font-semibold">{label}</label><input value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border bg-white px-3 py-3 text-sm" /></div>
}

function isAllowedGeneticFile(file: File) {
  const name = file.name.toLowerCase()
  return file.type.startsWith('image/') || file.type === 'application/pdf' || ['.txt', '.csv', '.vcf'].some((ext) => name.endsWith(ext))
}

function safeFileName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120)
}

function guessMimeFromName(name: string) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.txt') || lower.endsWith('.vcf')) return 'text/plain'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}

function inferCompanyFromName(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('genera')) return 'Genera'
  if (lower.includes('23andme')) return '23andMe'
  if (lower.includes('nebula')) return 'Nebula Genomics'
  if (lower.includes('tellmegen')) return 'tellmeGen'
  if (lower.includes('circle')) return 'CircleDNA'
  return ''
}

function inferTestType(file: File, company: string) {
  const lower = file.name.toLowerCase()
  const c = company.toLowerCase()
  if (lower.endsWith('.vcf')) return 'vcf_raw'
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'microarray_raw'
  if (c.includes('nebula')) return 'wgs'
  if (c.includes('circle')) return 'wes'
  if (c.includes('23andme') || c.includes('genera') || c.includes('tellmegen')) return 'microarray_raw'
  if (lower.endsWith('.pdf')) return 'pdf_report'
  return 'unknown'
}

function buildFallbackAnalysis(testType: string, company: string) {
  return {
    fallback: true,
    summary: buildEducationalSummary(testType, company),
    geneticFindings: [],
    note: 'Arquivo salvo com segurança. A análise automática completa depende de qualidade do laudo e suporte da IA/OCR.',
  }
}

function buildEducationalSummary(testType: string, company: string) {
  const origin = company ? ` da ${company}` : ''
  return `Exame genético${origin} salvo no cofre. O HealthWallet organiza este conteúdo como informação educativa. Não use estes dados para diagnóstico, prescrição ou ajuste de tratamento sem revisão profissional.`
}

function buildCategorySummary(analysis: any, testType: string, findings: GeneticFinding[]) {
  const categories = [
    { category: 'summary', title: 'Resumo educativo' },
    { category: 'pharmacogenomics', title: 'Farmacogenômica' },
    { category: 'nutrition', title: 'Nutrição/metabolismo' },
    { category: 'fitness', title: 'Performance' },
    { category: 'hereditary_risk', title: 'Riscos hereditários' },
    { category: 'privacy', title: 'Privacidade' },
  ]

  const found = new Set(findings.map((item) => item.category))
  return categories.map((item) => ({
    ...item,
    present: item.category === 'summary' || item.category === 'privacy' || found.has(item.category),
    test_type: testType,
    source: analysis?.fallback ? 'fallback' : 'ai',
  }))
}

function extractGeneticFindings(analysis: any): GeneticFinding[] {
  const direct = analysis?.geneticFindings || analysis?.genetic_findings || analysis?.findings || analysis?.variants || []
  if (!Array.isArray(direct)) return []

  return direct
    .map((item: any) => ({
      category: normalizeCategory(item.category || item.type),
      gene: normalizeText(item.gene),
      variant: normalizeText(item.variant),
      rsid: normalizeText(item.rsid || item.snp),
      condition_or_trait: normalizeText(item.condition_or_trait || item.condition || item.trait),
      evidence_level: normalizeText(item.evidence_level || item.evidence),
      clinical_actionability: normalizeText(item.clinical_actionability || 'educational'),
      summary: normalizeText(item.summary || item.description),
      recommendation_text: normalizeText(item.recommendation_text || item.recommendation),
      requires_professional_review: true,
      metadata: { source: 'ai_extraction' },
    }))
    .filter((item: GeneticFinding) => item.summary || item.gene || item.rsid || item.condition_or_trait)
    .slice(0, 25)
}

function normalizeCategory(value: any) {
  const text = String(value || '').toLowerCase()
  if (text.includes('pharma') || text.includes('medic')) return 'pharmacogenomics'
  if (text.includes('nutri') || text.includes('metabolism') || text.includes('metabol')) return 'nutrition'
  if (text.includes('fitness') || text.includes('sport') || text.includes('exercise') || text.includes('performance')) return 'fitness'
  if (text.includes('risk') || text.includes('risco') || text.includes('cancer') || text.includes('heredit')) return 'hereditary_risk'
  if (text.includes('carrier') || text.includes('portador')) return 'carrier_status'
  if (text.includes('ancestry') || text.includes('ancestral')) return 'ancestry'
  if (text.includes('wellness')) return 'wellness'
  return 'general'
}

function normalizeText(value: any) {
  return String(value || '').trim().replace(/\s+/g, ' ') || null
}

function translateTestType(value: any) {
  const map: Record<string, string> = {
    pdf_report: 'Laudo PDF',
    microarray_raw: 'Raw data / microarray',
    vcf_raw: 'VCF',
    wes: 'Exoma / WES',
    wgs: 'Genoma completo / WGS',
    ancestry: 'Ancestralidade',
    pharmacogenomics: 'Farmacogenômica',
    unknown: 'Tipo não informado',
  }
  return map[value] || 'Tipo não informado'
}

function translateCategory(value: any) {
  const map: Record<string, string> = {
    summary: 'Resumo',
    pharmacogenomics: 'Farmacogenômica',
    nutrition: 'Nutrição/metabolismo',
    metabolism: 'Metabolismo',
    fitness: 'Performance/exercício',
    hereditary_risk: 'Risco hereditário',
    carrier_status: 'Portador/carrier status',
    ancestry: 'Ancestralidade',
    wellness: 'Bem-estar',
    general: 'Geral',
  }
  return map[value] || 'Geral'
}
