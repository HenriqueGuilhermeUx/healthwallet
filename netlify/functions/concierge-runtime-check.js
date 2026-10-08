export async function handler(event) {
  const host = String(event.headers?.host || event.headers?.Host || event.headers?.['x-forwarded-host'] || '').toLowerCase()
  const isPreview = host.includes('deploy-preview-') || host.includes('--healthwallet1.netlify.app')

  if (!isPreview) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'not_found' }),
    }
  }

  const present = (value) => Boolean(String(value || '').trim())

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      ok: true,
      runtime: {
        supabase_url: present(process.env.SUPABASE_URL),
        vite_supabase_url: present(process.env.VITE_SUPABASE_URL),
        supabase_urls_match: present(process.env.SUPABASE_URL)
          && present(process.env.VITE_SUPABASE_URL)
          && String(process.env.SUPABASE_URL).replace(/\/$/, '') === String(process.env.VITE_SUPABASE_URL).replace(/\/$/, ''),
        supabase_anon_key: present(process.env.SUPABASE_ANON_KEY),
        vite_supabase_anon_key: present(process.env.VITE_SUPABASE_ANON_KEY),
        supabase_secret_key: present(process.env.SUPABASE_SECRET_KEY),
        supabase_service_role_key: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
        openai_api_key: present(process.env.OPENAI_API_KEY),
        concierge_internal_service_key: present(process.env.CONCIERGE_INTERNAL_SERVICE_KEY),
        docwallet_api_url: present(process.env.DOCWALLET_API_URL),
        docwallet_mydatamed_service_key: present(process.env.DOCWALLET_MYDATAMED_SERVICE_KEY),
        context: process.env.CONTEXT || null,
        effective_supabase_url_source: present(process.env.SUPABASE_URL) ? 'SUPABASE_URL' : present(process.env.VITE_SUPABASE_URL) ? 'VITE_SUPABASE_URL' : 'none',
        service_key_source: present(process.env.SUPABASE_SECRET_KEY) ? 'SUPABASE_SECRET_KEY' : present(process.env.SUPABASE_SERVICE_ROLE_KEY) ? 'SUPABASE_SERVICE_ROLE_KEY' : 'none',
      },
    }),
  }
}
