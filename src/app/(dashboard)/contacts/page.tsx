import { ContactsTable } from "@/components/contacts-table";
import { PageHeading } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Contacts" description="Connect Supabase to manage your contacts." />;
  const { data, error, count } = await supabase.from("contacts").select("id,email,first_name,last_name,status,tags,created_at,audience_id,consent_at,consent_source,contact_emails(id,email,status,consent_at,consent_source,is_primary)", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).range(0, 99);
  const { data: audiences } = await supabase.from("audiences").select("id,name").eq("user_id", user.id).order("name");
  return <div>
    <PageHeading eyebrow="Audience" title="Contacts" description={`${count ?? 0} contacts · Consent and suppression status are managed in your workspace.`} />
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">{error.message}</div>}
    <ContactsTable contacts={data ?? []} totalCount={count ?? 0} audiences={audiences ?? []} />
  </div>;
}
