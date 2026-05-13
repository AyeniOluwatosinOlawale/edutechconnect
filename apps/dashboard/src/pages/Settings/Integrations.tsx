export default function Integrations() {
  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-base font-semibold text-slate-800">Integrations</h2>

      <IntegrationCard
        title="Zoho CRM"
        description="Automatically create Zoho Leads when visitors start a chat. Configure OAuth credentials in your Supabase Edge Function secrets."
        docsKey="ZOHO_CLIENT_ID · ZOHO_CLIENT_SECRET · ZOHO_REFRESH_TOKEN"
        status="configured via secrets"
      />

      <IntegrationCard
        title="WhatsApp (Meta Cloud API)"
        description="Escalate conversations to WhatsApp when a visitor has a phone number on record."
        docsKey="WHATSAPP_TOKEN · WHATSAPP_PHONE_NUMBER_ID"
        status="configured via secrets"
      />

      <IntegrationCard
        title="Email (Resend)"
        description="Send CSAT surveys and agent notifications by email after conversations resolve."
        docsKey="RESEND_API_KEY"
        status="configured via secrets"
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
        <p className="font-medium mb-1">How to set secrets</p>
        <p>Run <code className="bg-amber-100 px-1 rounded">supabase secrets set KEY=value</code> for each secret above, then redeploy your Edge Functions.</p>
      </div>
    </div>
  )
}

function IntegrationCard({ title, description, docsKey, status }: {
  title: string; description: string; docsKey: string; status: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
          <p className="text-xs text-slate-500 mb-3">{description}</p>
          <p className="text-xs font-mono text-slate-400">{docsKey}</p>
        </div>
        <span className="text-xs bg-green-50 text-green-600 font-medium px-2.5 py-1 rounded-full whitespace-nowrap">{status}</span>
      </div>
    </div>
  )
}
