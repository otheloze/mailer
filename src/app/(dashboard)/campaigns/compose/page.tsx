import { QuickCompose } from "@/components/quick-compose";
import { requireUser } from "@/lib/auth";
import { getAllowedSenderDomains, platformSender } from "@/lib/sender-domains";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <div className="rounded-xl border border-line bg-white p-8 text-sm">Connect Supabase to send email.</div>;
  const [audiences, profile, senderDomains] = await Promise.all([
    supabase.from("audiences").select("id,name").eq("user_id", user.id).order("name"),
    supabase.from("profiles").select("default_from_name,default_from_email,default_reply_to,email_footer,company_name,brand_color,timezone").eq("id", user.id).maybeSingle(),
    getAllowedSenderDomains(supabase, user.id),
  ]);
  return <QuickCompose
    audiences={audiences.data ?? []}
    defaults={profile.data ?? null}
    accountEmail={user.email ?? ""}
    senderDomains={[...senderDomains.domains].sort()}
    platformSender={platformSender()}
  />;
}
