import { useEffect, useState } from 'react'

export default function Passport() {
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    const data = localStorage.getItem(
      'healthwallet_profile'
    )

    if (data) {
      setProfile(JSON.parse(data))
    }
  }, [])

  return (
    <div className="p-4">
      <div className="bg-white rounded-2xl shadow border p-6">

        <h1 className="text-xl font-bold mb-4">
          Health Passport
        </h1>

        <div className="space-y-2">

          <p>
            Nome: {profile?.fullName}
          </p>

          <p>
            Tipo Sanguíneo: {profile?.bloodType}
          </p>

          <p>
            Peso: {profile?.weight}
          </p>

          <p>
            Altura: {profile?.height}
          </p>

          <p>
            Emergência:
            {profile?.emergencyPhone}
          </p>

        </div>
      </div>
    </div>
  )
}
