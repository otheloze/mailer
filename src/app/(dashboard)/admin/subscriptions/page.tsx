import { redirect } from "next/navigation";
import { PageHeading } from "@/components/app-shell";
import { AdminSubscriptions } from "@/components/admin-subscriptions";
import { AdminLeadOrders } from "@/components/admin-lead-orders";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Administration" description="Connect Supabase to manage subscriptions." />;
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");
  return <div>
    <PageHeading eyebrow="Platform operations" title="Subscription administration" description="Manage clients, packages, payments, credit balances, and lead data orders." />
    <AdminSubscriptions />
    <AdminLeadOrders />
  </div>;
}
