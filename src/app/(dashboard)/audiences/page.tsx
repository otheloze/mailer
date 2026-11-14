import { AudienceManager } from "@/components/audience-manager";
import { PageHeading } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AudiencesPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Audiences" description="Connect Supabase to create contact groups." />;
  const { data: audienceRows, error: audienceError } = await supabase.from("audiences").select("id,name,resend_segment_id,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  const audiences = audienceRows ?? [];
  const counts = await Promise.all(audiences.map(async (audience) => {
    const { count, error } = await supabase.from("contact_emails")
      .select("id,contacts!inner(user_id,audience_id)", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "subscribed")
      .not("consent_at", "is", null)
      .eq("contacts.user_id", user.id)
      .eq("contacts.audience_id", audience.id);
    return { id: audience.id, count: count ?? 0, error };
  }));
  const failedCount = counts.find((item) => item.error)?.error;
  return <div><PageHeading eyebrow="Audience" title="Audiences" description="Organize contacts into groups. Resend Segments power broadcast delivery." />
    {(audienceError || failedCount) && <div role="alert" className="mb-4 text-xs text-red-700">{audienceError?.message ?? failedCount?.message}</div>}
    <AudienceManager audiences={audiences} counts={Object.fromEntries(counts.map((item) => [item.id, item.count]))} />
  </div>;
}
