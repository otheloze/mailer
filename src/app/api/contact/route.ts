import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { sendSupportEmail } from "@/lib/support";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(200).optional(), // honeypot
});

export async function POST(request: Request) {
  const limited = await rateLimitResponse(`contact:${clientIp(request.headers)}`, 5, 3600);
  if (limited) return limited;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please complete every field with a valid email and a message of at least 10 characters." }, { status: 400 });
  // Bots fill the hidden field; pretend success without sending.
  if (parsed.data.website) return NextResponse.json({ ok: true });

  try {
    await sendSupportEmail({ ...parsed.data, source: "contact-form" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Contact form email failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "We could not send your message right now. Please try again shortly." }, { status: 502 });
  }
}
