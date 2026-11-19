import { PageHeading } from "@/components/app-shell";
import { SubscriptionDashboard } from "@/components/subscription-dashboard";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ trial?: string }> }) {
  const { trial } = await searchParams;
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Subscriptions" description="Connect Supabase to manage your service package and credits." />;
  return <div>
    <PageHeading eyebrow="Billing & usage" title="Subscriptions" description="Manage your combined email marketing and verified email discovery package." />
    {trial === "ended" && <div role="status" className="mb-6 rounded-2xl border border-[#dbe4fb] bg-[#eef3ff] px-5 py-4 text-[14px] leading-5 text-[#2f4a9e]">
      <strong className="block text-[15px]">Your free trial is complete.</strong>
      Choose a subscription below to keep sending campaigns and discovering contacts.
    </div>}
    <SubscriptionDashboard />
  </div>;
}
