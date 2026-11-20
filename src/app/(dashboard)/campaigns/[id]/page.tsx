import { notFound } from "next/navigation";
import { CampaignEditor } from "@/components/campaign-editor";
import { requireUser } from "@/lib/auth";
import { getAllowedSenderDomains, platformSender } from "@/lib/sender-domains";

export const dynamic = "force-dynamic";
export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <div className="text-sm">Connect Supabase to manage campaigns.</div>;
  const [campaign, audiences, profile, senderDomains] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("audiences").select("id,name").eq("user_id", user.id).order("name"),
    supabase.from("profiles").select("default_from_name,default_from_email,default_reply_to,email_footer,company_name,timezone").eq("id", user.id).maybeSingle(),
    getAllowedSenderDomains(supabase, user.id),
  ]);
  if (campaign.error || !campaign.data) notFound();
  return <CampaignEditor campaign={campaign.data} audiences={audiences.data ?? []} defaults={profile.data ?? null} senderDomains={[...senderDomains.domains].sort()} platformSender={platformSender()} />;
}
