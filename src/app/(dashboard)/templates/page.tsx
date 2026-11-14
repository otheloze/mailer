import { PageHeading } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { TemplatesManager } from "@/components/templates-manager";

export const dynamic = "force-dynamic";
export default async function TemplatesPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Templates" description="Connect Supabase to manage reusable email designs." />;
  const { data, error } = await supabase.from("email_templates").select("id,name,subject,html,created_at,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
  return <div><PageHeading eyebrow="Library" title="Templates" description="Save reusable email designs for your next campaign." />{error && <div role="alert" className="mb-4 text-xs text-red-700">{error.message}</div>}<TemplatesManager templates={data ?? []} /></div>;
}
