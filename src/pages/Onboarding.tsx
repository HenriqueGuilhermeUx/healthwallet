import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Heart, User, Activity, Brain, Pill, Users, AlertTriangle, ChevronRight, ChevronLeft, CheckCircle2, Loader2, Sparkles, FileText, Stethoscope, QrCode, Camera, Upload } from 'lucide-react'

interface OnboardingData {
  birthDate: string
  gender: string
  weight: string
  height: string
  bloodType: string
  smokingStatus: string
  alcoholConsumption: string
  physicalActivity: string
  sleepHours: string
  stressLevel: string
  allergies: string
  chronicConditions: string
  familyHistory: string
  currentMedications: string
}

const STEPS = [
  { id: 1, title: 'Bem-vindo', icon: Heart, description: 'Vamos criar seu perfil de saúde' },
  { id: 2, title: 'Dados Pessoais', icon: User, description: 'Informações básicas' },
  { id: 3, title: 'Estilo de Vida', icon: Activity, description: 'Seus hábitos diários' },
  { id: 4, title: 'Saúde Mental', icon: Brain, description: 'Bem-estar emocional' },
  { id: 5, title: 'Histórico Médico', icon: Stethoscope, description: 'Condições e alergias' },
  { id: 6, title: 'Medicamentos', icon: Pill, description: 'Medicamentos em uso' },
  { id: 7, title: 'Histórico Familiar', icon: Users, description: 'Doenças na família' },
  { id: 8, title: 'Quase lá!', icon: Sparkles, description: 'Solicitando exames importantes' },
]

export default function Onboarding() {
  const { user } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<OnboardingData>({
    birthDate: '',
    gender: '',
    weight: '',
    height: '',
    bloodType: '',
    smokingStatus: '',
    alcoholConsumption: '',
    physicalActivity: '',
    sleepHours: '',
    stressLevel: '',
    allergies: '',
    chronicConditions: '',
    familyHistory: '',
    currentMedications: '',
  })

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100

  const updateField = (field: keyof OnboardingData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

  const calculateBMI = () => {
    if (!data.weight || !data.height) return null
    const heightM = parseInt(data.height) / 100
    const weight = parseInt(data.weight)
    return (weight / (heightM * heightM)).toFixed(1)
  }

  const getBMICategory = (imc: number) => {
    if (imc < 18.5) return 'Abaixo do peso'
    if (imc < 25) return 'Peso normal'
    if (imc < 30) return 'Sobrepeso'
    return 'Obesidade'
  }

  const handleNext = async () => {
    if (currentStep === STEPS.length) {
      await saveAndFinish()
      return
    }
    setCurrentStep(prev => prev + 1)
  }

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1)
  }

  const saveAndFinish = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Salvar perfil no Supabase
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        birth_date: data.birthDate || null,
        gender: data.gender as 'male' | 'female' | 'other' || null,
        phone: null,
      })

      if (error) console.error('Erro ao salvar perfil:', error)

      // Calcular MedScore preliminar
      const bmi = calculateBMI()
      let baseScore = 50

      if (bmi && parseFloat(bmi) >= 18.5 && parseFloat(bmi) < 25) baseScore += 10
      if (data.physicalActivity === 'moderate' || data.physicalActivity === 'active') baseScore += 10
      if (data.sleepHours && parseInt(data.sleepHours) >= 6 && parseInt(data.sleepHours) <= 9) baseScore += 10
      if (data.smokingStatus === 'never') baseScore += 10
      if (data.bloodType) baseScore += 5

      // Salvar no localStorage como perfil completo
      localStorage.setItem(`healthwallet_profile_${user.id}`, JSON.stringify({
        ...data,
        bmi,
        medScore: baseScore,
        onboardingCompleted: true,
        completedAt: new Date().toISOString()
      }))

      // Redirecionar para dashboard
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Erro:', err)
    } finally {
      setLoading(false)
    }
  }

  const currentStepData = STEPS[currentStep - 1]

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">HealthWallet</span>
          </div>
          <span className="text-sm text-muted-foreground">
            Etapa {currentStep} de {STEPS.length}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Step Icon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <currentStepData.icon className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{currentStepData.title}</h1>
          <p className="text-gray-600">{currentStepData.description}</p>
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-2xl shadow-lg border p-6 mb-6">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-4">
                  Olá, {user?.email?.split('@')[0] || 'novo usuário'}!
                </h2>
                <p className="text-gray-600 mb-6">
                  Vamos criar seu perfil de saúde personalizado. Isso nos ajudará a oferecer análises e recomendações específicas para você.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 rounded-xl p-4 text-center">
                  <div className="text-3xl mb-2">📊</div>
                  <p className="font-medium text-sm">MedScore</p>
                  <p className="text-xs text-gray-600">Pontuação pessoal</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="text-3xl mb-2">🏥</div>
                  <p className="font-medium text-sm">Cofre Digital</p>
                  <p className="text-xs text-gray-600">Seus exames seguros</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 text-center">
                  <div className="text-3xl mb-2">🤖</div>
                  <p className="font-medium text-sm">IA Médica</p>
                  <p className="text-xs text-gray-600">Análises inteligentes</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                  <div className="text-3xl mb-2">📱</div>
                  <p className="font-medium text-sm">Compartilhar</p>
                  <p className="text-xs text-gray-600">QR Code para médicos</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Dados Pessoais */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Data de Nascimento</label>
                <input
                  type="date"
                  value={data.birthDate}
                  onChange={(e) => updateField('birthDate', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Sexo Biológico</label>
                <select
                  value={data.gender}
                  onChange={(e) => updateField('gender', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none"
                >
                  <option value="">Selecione</option>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Peso (kg)</label>
                  <input
                    type="number"
                    placeholder="70"
                    value={data.weight}
                    onChange={(e) => updateField('weight', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Altura (cm)</label>
                  <input
                    type="number"
                    placeholder="175"
                    value={data.height}
                    onChange={(e) => updateField('height', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              {calculateBMI() && (
                <div className="bg-emerald-50 rounded-xl p-4">
                  <p className="text-sm text-emerald-800">
                    <span className="font-semibold">IMC: </span>
                    {calculateBMI()} kg/m² ({getBMICategory(parseFloat(calculateBMI()!))})
                  </p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-1 block">Tipo Sanguíneo</label>
                <select
                  value={data.bloodType}
                  onChange={(e) => updateField('bloodType', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none"
                >
                  <option value="">Selecione (se souber)</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 3: Estilo de Vida */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Atividade Física</label>
                <select
                  value={data.physicalActivity}
                  onChange={(e) => updateField('physicalActivity', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none"
                >
                  <option value="">Selecione</option>
                  <option value="sedentary">Sedentário</option>
                  <option value="light">Leve (1-2x/semana)</option>
                  <option value="moderate">Moderado (3-4x/semana)</option>
                  <option value="active">Ativo (5-6x/semana)</option>
                  <option value="very_active">Muito ativo (diário)</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Horas de Sono (média)</label>
                <input
                  type="number"
                  placeholder="7"
                  value={data.sleepHours}
                  onChange={(e) => updateField('sleepHours', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Tabagismo</label>
                <select
                  value={data.smokingStatus}
                  onChange={(e) => updateField('smokingStatus', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none"
                >
                  <option value="">Selecione</option>
                  <option value="never">Nunca fumei</option>
                  <option value="former">Ex-fumante</option>
                  <option value="current">Fumante atual</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Consumo de Álcool</label>
                <select
                  value={data.alcoholConsumption}
                  onChange={(e) => updateField('alcoholConsumption', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none"
                >
                  <option value="">Selecione</option>
                  <option value="never">Nunca</option>
                  <option value="occasional">Ocasional</option>
                  <option value="moderate">Moderado</option>
                  <option value="frequent">Frequente</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 4: Saúde Mental */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Nível de Estresse</label>
                <select
                  value={data.stressLevel}
                  onChange={(e) => updateField('stressLevel', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none"
                >
                  <option value="">Selecione</option>
                  <option value="low">Baixo</option>
                  <option value="moderate">Moderado</option>
                  <option value="high">Alto</option>
                  <option value="very_high">Muito alto</option>
                </select>
              </div>

              <div className="bg-blue-50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Brain className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Saúde Mental é Importante</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Responda com base na sua percepção. Essas informações nos ajudam a oferecer suporte adequado.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 rounded-xl p-4">
                <p className="text-sm text-emerald-800">
                  💡 <strong>Dica:</strong> Manter hábitos saudáveis como exercício, sono adequado e conexões sociais ajuda a reduzir o estresse.
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Histórico Médico */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Alergias</label>
                <textarea
                  placeholder="Liste suas alergias (ex: Penicilina, Frutos do mar, Látex)"
                  value={data.allergies}
                  onChange={(e) => updateField('allergies', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none min-h-[80px]"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Condições Crônicas</label>
                <textarea
                  placeholder="Liste condições crônicas (ex: Diabetes, Hipertensão, Asma)"
                  value={data.chronicConditions}
                  onChange={(e) => updateField('chronicConditions', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none min-h-[80px]"
                />
              </div>

              <div className="bg-red-50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-900">Informações de Emergência</p>
                    <p className="text-xs text-red-700 mt-1">
                      Estas informações podem ser compartilhadas via QR Code em emergências.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Medicamentos */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Medicamentos em Uso</label>
                <textarea
                  placeholder="Liste seus medicamentos (ex: Losartana 50mg - 1x ao dia)"
                  value={data.currentMedications}
                  onChange={(e) => updateField('currentMedications', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none min-h-[120px]"
                />
              </div>

              <div className="bg-orange-50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Pill className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-orange-900">Importante</p>
                    <p className="text-xs text-orange-700 mt-1">
                      Inclua vitaminas, suplementos e fitoterápicos. Isso ajuda a evitar interações medicamentosas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 7: Histórico Familiar */}
          {currentStep === 7 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Histórico Familiar</label>
                <textarea
                  placeholder="Doença - Parentesco&#10;Ex: Diabetes - Mãe&#10;Hipertensão - Pai"
                  value={data.familyHistory}
                  onChange={(e) => updateField('familyHistory', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none min-h-[120px]"
                />
              </div>

              <div className="bg-purple-50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-purple-900">Predisposição Genética</p>
                    <p className="text-xs text-purple-700 mt-1">
                      Conhecer o histórico familiar ajuda a identificar riscos e prevenir doenças.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 8: Solicitação de Exames */}
          {currentStep === 8 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-4xl mb-3">🏥</div>
                <h2 className="text-xl font-semibold mb-2">Solicitação de Exames</h2>
                <p className="text-gray-600 text-sm">
                  Para calcular seu MedScore, você precisará fazer estes exames:
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { exam: 'Hemograma Completo', reason: 'Avaliação geral de saúde', urgency: 'high' },
                  { exam: 'Perfil Lipídico', reason: 'Saúde cardiovascular', urgency: 'medium' },
                  { exam: 'Glicemia de Jejum', reason: 'Diabetes e metabolismo', urgency: 'medium' },
                  { exam: 'PCR Ultrasensível', reason: 'Inflamações ocultas', urgency: 'low' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      item.urgency === 'high' ? 'bg-red-100' :
                      item.urgency === 'medium' ? 'bg-yellow-100' : 'bg-green-100'
                    }`}>
                      <FileText className={`w-5 h-5 ${
                        item.urgency === 'high' ? 'text-red-600' :
                        item.urgency === 'medium' ? 'text-yellow-600' : 'text-green-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.exam}</p>
                      <p className="text-xs text-gray-500">{item.reason}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      item.urgency === 'high' ? 'bg-red-100 text-red-700' :
                      item.urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {item.urgency === 'high' ? 'Urgente' : item.urgency === 'medium' ? 'Recomendado' : 'Opcional'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="bg-emerald-50 rounded-xl p-4">
                <p className="text-sm text-emerald-800">
                  📸 <strong>Próximo passo:</strong> Após fazer os exames, você pode fotografar ou enviar os resultados para análise com IA.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-gray-200"></div>
                <span className="text-sm text-gray-400">ou continue sem exames</span>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
              currentStep === 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            Voltar
          </button>

          <button
            onClick={handleNext}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : currentStep === STEPS.length ? (
              <>
                Finalizar
                <CheckCircle2 className="w-5 h-5" />
              </>
            ) : (
              <>
                Continuar
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>

        {/* Skip option */}
        {currentStep === STEPS.length && (
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="w-full mt-4 text-center text-sm text-gray-500 hover:text-gray-700"
          >
            Pular por agora e fazer depois
          </button>
        )}
      </div>
    </div>
  )
}