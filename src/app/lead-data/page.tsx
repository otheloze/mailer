import type { Metadata } from "next";
import { LeadDataStore, type LeadPackage } from "@/components/lead-data-store";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verified email lead data",
  description: "Buy verified business email leads in packages of 10,000 to 100,000. Pay with PayPal or Paystack.",
  alternates: { canonical: "/lead-data" },
};

type SearchParams = { checkout?: string; reference?: string; trxref?: string; token?: string };

export default async function LeadDataPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let packages: LeadPackage[] = [];
  let loadError: string | undefined;
  try {
    const { data, error } = await createAdminClient().from("lead_data_packages")
      .select("id,slug,name,lead_count,price_cents,paystack_price_kobo")
      .eq("enabled", true).order("sort_order").order("lead_count");
    if (error) throw new Error(error.message);
    packages = data ?? [];
  } catch (error) {
    console.error("Could not load lead data packages:", error instanceof Error ? error.message : error);
    loadError = "Lead data packages are temporarily unavailable. Please try again shortly.";
  }

  return <div className="min-h-screen bg-[#f4f6fa] text-[#101828]">
    <SiteHeader />
    <LeadDataStore
      packages={packages}
      loadError={loadError}
      callback={{
        checkout: params.checkout,
        reference: params.checkout === "paypal" ? params.token : params.reference ?? params.trxref,
      }}
    />
    <SiteFooter />
  </div>;
}
