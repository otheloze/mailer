import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function escapeCsv(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const query = params.get("query")?.trim().replace(/[(),.%]/g, " ").slice(0, 100) ?? "";
  const industry = params.get("industry")?.trim().slice(0, 100) ?? "";
  const country = params.get("country")?.trim().slice(0, 100) ?? "";
  const companySize = params.get("company_size")?.trim().slice(0, 50) ?? "";
  const status = params.get("status")?.trim() ?? "";
  const domain = params.get("domain")?.trim().slice(0, 253) ?? "";
  const csv = params.get("format") === "csv";
  const limit = csv ? 2000 : 500;

  let requestQuery = supabase.from("prospect_leads")
    .select("id,email,first_name,last_name,job_title,seniority,department,company_name,company_domain,company_size,industry,country,email_type,email_confidence,email_status,lead_score,sources,provider,discovered_at,verified_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(0, limit - 1);
  if (query) requestQuery = requestQuery.or(`email.ilike.%${query}%,company_name.ilike.%${query}%,company_domain.ilike.%${query}%,job_title.ilike.%${query}%`);
  if (industry) requestQuery = requestQuery.ilike("industry", `%${industry}%`);
  if (country) requestQuery = requestQuery.ilike("country", `%${country}%`);
  if (companySize) requestQuery = requestQuery.ilike("company_size", `%${companySize}%`);
  if (domain) requestQuery = requestQuery.ilike("company_domain", `%${domain}%`);
  if (status && ["unverified", "valid", "risky", "invalid", "unknown"].includes(status)) requestQuery = requestQuery.eq("email_status", status);

  const { data, error } = await requestQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const leads = data ?? [];

  if (csv) {
    const header = ["email", "first_name", "last_name", "job_title", "department", "company_name", "company_domain", "company_size", "industry", "country", "email_status", "email_confidence", "lead_score", "provider", "discovered_at"];
    const rows = leads.map((lead) => header.map((key) => escapeCsv(lead[key as keyof typeof lead])).join(","));
    return new Response([header.join(","), ...rows].join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="mymailmarket-prospect-leads.csv"',
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json({ leads, limit, truncated: leads.length === limit });
}
