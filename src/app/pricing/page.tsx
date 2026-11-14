import { PricingPage } from "@/components/pricing-page";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SearchParams = {
  checkout?: string;
  reference?: string;
  trxref?: string;
  token?: string;
  claim_error?: string;
};

export default async function Pricing({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let packages: Awaited<ReturnType<typeof loadPackages>> = [];
  let loadError: string | undefined;
  try {
    packages = await loadPackages();
  } catch (error) {
    console.error("Could not load public package pricing:", error instanceof Error ? error.message : "Database error.");
    loadError = "Package pricing is temporarily unavailable. Please try again later.";
  }
  return <PricingPage
    packages={packages}
    loadError={loadError}
    callback={{
      checkout: params.checkout,
      reference: params.reference ?? params.trxref,
      token: params.token,
      claimError: params.claim_error,
    }}
  />;
}

async function loadPackages() {
  const admin = createAdminClient();
  const { data, error } = await admin.from("subscription_packages")
    .select("id,slug,name,price_cents,paystack_price_kobo,email_sending_credits,email_discovery_credits,duration_days,rollover_policy")
    .eq("enabled", true).order("price_cents")
    .abortSignal(AbortSignal.timeout(10000));
  if (error) throw error;
  return data ?? [];
}
