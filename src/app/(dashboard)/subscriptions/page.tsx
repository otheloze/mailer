import { PageHeading } from "@/components/app-shell";
import { SubscriptionDashboard } from "@/components/subscription-dashboard";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Subscriptions" description="Connect Supabase to manage your service package and credits." />;
  return <div>
    <PageHeading eyebrow="Billing & usage" title="Subscriptions" description="Manage your combined email marketing and verified email discovery package." />
    <SubscriptionDashboard />
  </div>;
}
