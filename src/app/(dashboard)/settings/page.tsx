import { SettingsForm } from "@/components/settings-form";
import { PageHeading } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { getAllowedSenderDomains, platformSender } from "@/lib/sender-domains";

export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Settings" description="Connect Supabase to configure your workspace." />;
  const [{ data: profile, error }, senderDomains] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    getAllowedSenderDomains(supabase, user.id),
  ]);
  return <div><PageHeading eyebrow="Workspace" title="Settings" description="Manage your sender identity, brand, and platform connections." />{error && <div role="alert" className="mb-4 text-xs text-red-700">{error.message}</div>}<SettingsForm profile={profile} accountEmail={user.email ?? ""} senderDomains={[...senderDomains.domains].sort()} platformSender={platformSender()} configured={{ supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), resend: Boolean(process.env.RESEND_API_KEY), webhook: Boolean(process.env.RESEND_WEBHOOK_SECRET) }} /></div>;
}
