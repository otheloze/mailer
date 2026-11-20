import { CampaignEditor } from "@/components/campaign-editor";
import { requireUser } from "@/lib/auth";
import { getAllowedSenderDomains, platformSender } from "@/lib/sender-domains";

export const dynamic = "force-dynamic";
export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <SetupHint />;
  const { template: templateId } = await searchParams;
  const senderDomains = await getAllowedSenderDomains(supabase, user.id);
  const [audiences, profile, template] = await Promise.all([
    supabase.from("audiences").select("id,name").eq("user_id", user.id).order("name"),
    supabase.from("profiles").select("default_from_name,default_from_email,default_reply_to,email_footer,company_name,timezone").eq("id", user.id).maybeSingle(),
    templateId ? supabase.from("email_templates").select("name,subject,html").eq("id", templateId).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  return <CampaignEditor audiences={audiences.data ?? []} defaults={profile.data ?? null} template={template.data ?? undefined} senderDomains={[...senderDomains.domains].sort()} platformSender={platformSender()} />;
}
function SetupHint() { return <div className="rounded-xl border border-line bg-white p-8 text-sm">Connect Supabase to create campaigns.</div>; }
