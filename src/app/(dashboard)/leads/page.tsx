import { LeadsWorkbench } from "@/components/leads-workbench";
import { PageHeading } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Prospecting" description="Connect Supabase to discover business leads." />;

  const [leadsResult, totalResult, verifiedResult, highFitResult] = await Promise.all([
    supabase.from("prospect_leads")
      .select("id,email,first_name,last_name,job_title,seniority,department,company_name,company_domain,company_size,industry,country,email_type,email_confidence,email_status,lead_score,sources,provider,discovered_at,verified_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("prospect_leads").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("prospect_leads").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("email_status", "valid"),
    supabase.from("prospect_leads").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("lead_score", 70),
  ]);
  const error = leadsResult.error || totalResult.error || verifiedResult.error || highFitResult.error;
  const leads = leadsResult.data ?? [];
  const metrics = {
    total: totalResult.count ?? 0,
    verified: verifiedResult.count ?? 0,
    highFit: highFitResult.count ?? 0,
  };
  const hunterConfigured = Boolean(process.env.HUNTER_API_KEY);

  return <div>
    <PageHeading eyebrow="MYMAILMARKET" title="Prospecting" description="Discover companies, search their domains for business emails, and manage saved prospects." />
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">{error.message}. Run the prospecting migration in Supabase.</div>}
    <LeadsWorkbench leads={leads} metrics={metrics} hunterConfigured={hunterConfigured} />
  </div>;
}
