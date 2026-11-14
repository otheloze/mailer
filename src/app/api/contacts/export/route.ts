import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const rows = [["email", "first_name", "last_name", "status", "consent_at", "consent_source", "tags"]];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("contact_emails")
      .select("email,status,consent_at,consent_source,contacts!inner(first_name,last_name,tags,user_id)")
      .eq("user_id", user.id)
      .eq("contacts.user_id", user.id)
      .order("id")
      .range(offset, offset + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const address of data ?? []) {
      const contact = address.contacts[0];
      if (!contact) return NextResponse.json({ error: `Could not load the contact for ${address.email}.` }, { status: 500 });
      rows.push([
      address.email,
      contact.first_name ?? "",
      contact.last_name ?? "",
      address.status,
      address.consent_at ?? "",
      address.consent_source ?? "",
      (contact.tags ?? []).join("|"),
    ]);
    }
    if (!data || data.length < 1000) break;
  }
  const csv = rows.map((row) => row.map(csvField).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="mymailmarket-contacts.csv"',
      "cache-control": "private, no-store",
    },
  });
}

function csvField(value: string) {
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
