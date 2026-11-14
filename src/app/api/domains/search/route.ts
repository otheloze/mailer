import { createHmac } from "node:crypto";
import { domainToASCII } from "node:url";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";

const requestSchema = z.object({
  domain: z.string().trim().min(1).max(253),
});

const multiLabelSuffixes = new Set([
  "co.uk", "org.uk", "net.uk", "com.au", "net.au", "org.au",
  "co.nz", "org.nz", "co.za", "org.za", "com.ng", "org.ng",
  "com.ke", "co.ke", "co.in", "firm.in", "com.br", "com.mx",
]);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function normalizeDomain(value: string) {
  const withoutProtocol = value.trim().replace(/^[a-z][a-z\d+.-]*:\/\//i, "");
  const host = withoutProtocol.split(/[/?#]/, 1)[0].replace(/^www\./i, "").replace(/\.$/, "");
  const ascii = domainToASCII(host).toLowerCase();
  const labels = ascii.split(".");
  if (!ascii || labels.length < 2 || labels.some((label) => !/^(?!-)[a-z\d-]{1,63}(?<!-)$/.test(label))) {
    return null;
  }

  const suffix = labels.slice(-2).join(".");
  const suffixLabels = multiLabelSuffixes.has(suffix) ? 2 : 1;
  if (labels.length !== suffixLabels + 1) return null;

  const tld = labels.slice(-suffixLabels).join(".");
  const finalLabel = labels[labels.length - 1];
  if (!/^(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/.test(finalLabel)) return null;

  const name = labels[0];
  return {
    domain: `${name}.${tld}`,
    name,
    tld,
    isIdn: ascii !== host.toLowerCase(),
  };
}

function createToken(apiKey: string, username: string) {
  const now = new Date();
  const timestamp = `${String(now.getUTCFullYear()).slice(-2)}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")} ${String(now.getUTCHours()).padStart(2, "0")}`;
  const digest = createHmac("sha256", `${username}:${timestamp}`).update(apiKey).digest("hex");
  return Buffer.from(digest, "utf8").toString("base64");
}

function findDomainResult(payload: unknown, domain: string): JsonRecord | null {
  const queue: unknown[] = [payload];
  const visited = new Set<object>();
  const availabilityStatuses = ["available", "unavailable", "true", "false", "1", "0", "yes", "no", "taken"];

  while (queue.length > 0) {
    const value = queue.shift();
    if (Array.isArray(value)) {
      queue.push(...value.slice(0, 20));
      continue;
    }

    const record = asRecord(value);
    if (!record || visited.has(record)) continue;
    visited.add(record);

    const exact = asRecord(record[domain]);
    if (exact) return exact;

    if (typeof record.domain === "string" && record.domain.toLowerCase() === domain) return record;
    if ("isAvailable" in record || "available" in record) return record;
    if (typeof record.status === "string" && availabilityStatuses.includes(record.status.trim().toLowerCase())) return record;

    for (const key of ["data", "result", "results", "domains", "items"]) {
      if (record[key] !== undefined) queue.push(record[key]);
    }
  }

  return null;
}

function readAvailability(result: JsonRecord) {
  const value = result.isAvailable ?? result.available ?? result.status;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["available", "true", "1", "yes"].includes(normalized)) return true;
  if (["unavailable", "false", "0", "no", "taken"].includes(normalized)) return false;
  return null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const amount = typeof value === "number" ? value : Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function readQuote(result: JsonRecord) {
  const pricing = asRecord(result.pricing);
  const candidates = [
    result.registrationPrice, result.registerPrice, result.registration,
    pricing?.registration, pricing?.register, result.price, result.register,
    pricing?.price, result.amount, result.cost,
  ];

  for (const candidate of candidates) {
    const record = asRecord(candidate);
    const amount = parseAmount(record ? record.amount ?? record.price ?? record.register ?? record.value : candidate);
    const currencyValue = record?.currency ?? record?.currencyCode ?? result.currency ?? result.currencyCode ?? pricing?.currency;
    const currency = typeof currencyValue === "string" ? currencyValue.toUpperCase() : "";
    if (amount && /^[A-Z]{3}$/.test(currency)) return { amount, currency };
  }

  return null;
}

async function getUsdNgnRate() {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as {
      result?: string;
      rates?: { NGN?: number };
      time_last_update_utc?: string;
    };
    const rate = payload.rates?.NGN;
    if (payload.result !== "success" || !rate || !Number.isFinite(rate)) return null;
    return { ngnPerUsd: rate, updatedAt: payload.time_last_update_utc ?? null };
  } catch {
    return null;
  }
}

function roundAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function POST(request: Request) {
  const limited = await rateLimitResponse(`domain-search:${clientIp(request.headers)}`, 30, 600);
  if (limited) return limited;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter a full domain name, such as yourbrand.com." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a full domain name, such as yourbrand.com." }, { status: 400 });
  }

  const domain = normalizeDomain(parsed.data.domain);
  if (!domain) {
    return NextResponse.json({ error: "Enter a supported full domain, such as yourbrand.com or yourbrand.co.uk." }, { status: 400 });
  }

  const endpoint = process.env.TRUEHOST_API_URL?.trim();
  const username = process.env.TRUEHOST_API_USERNAME?.trim();
  const apiKey = process.env.TRUEHOST_API_KEY?.trim();
  if (!endpoint || !username || !apiKey) {
    return NextResponse.json({ error: "Domain search is not configured. Please try again later." }, { status: 503 });
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(endpoint);
    if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
      throw new Error("Invalid endpoint");
    }
  } catch {
    return NextResponse.json({ error: "Domain search is not configured correctly." }, { status: 503 });
  }

  const form = new URLSearchParams({
    searchTerm: domain.name,
    punnyCodeSearchTerm: domain.name,
    "tldsToInclude[0]": `.${domain.tld}`,
    isIdnDomain: String(domain.isIdn),
    premiumEnabled: "true",
  });

  let providerResponse: Response;
  try {
    providerResponse = await fetch(`${baseUrl.toString().replace(/\/$/, "")}/domains/lookup`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        username,
        token: createToken(apiKey, username),
      },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return NextResponse.json({ error: "Truehost domain search is temporarily unavailable." }, { status: 502 });
  }

  if (!providerResponse.ok) {
    console.error("Truehost domain lookup failed with HTTP status", providerResponse.status);
    const error = providerResponse.status === 401
      ? "Truehost rejected the API credentials. Verify the reseller API key, username, and account activation."
      : "Truehost domain search is temporarily unavailable.";
    return NextResponse.json({ error }, { status: 502 });
  }

  const payload: unknown = await providerResponse.json().catch(() => null);
  const providerResult = findDomainResult(payload, domain.domain);
  if (!providerResult) {
    console.error("Truehost domain lookup response did not contain a matching result.");
    return NextResponse.json({ error: "Truehost returned an unexpected availability response." }, { status: 502 });
  }

  const available = readAvailability(providerResult);
  if (available === null) {
    console.error("Truehost domain lookup response did not contain an availability status.");
    return NextResponse.json({ error: "Truehost returned an unexpected availability response." }, { status: 502 });
  }

  const providerQuote = available ? readQuote(providerResult) : null;
  const pricing: { currency: string; amount: number; providerAmount: number }[] = [];
  let fxUpdatedAt: string | null = null;
  if (providerQuote) {
    pricing.push({
      currency: providerQuote.currency,
      providerAmount: roundAmount(providerQuote.amount),
      amount: roundAmount(providerQuote.amount * 1.3),
    });

    if (providerQuote.currency === "USD" || providerQuote.currency === "NGN") {
      const exchangeRate = await getUsdNgnRate();
      if (exchangeRate) {
        fxUpdatedAt = exchangeRate.updatedAt;
        const otherCurrency = providerQuote.currency === "USD" ? "NGN" : "USD";
        const convertedAmount = providerQuote.currency === "USD"
          ? providerQuote.amount * exchangeRate.ngnPerUsd
          : providerQuote.amount / exchangeRate.ngnPerUsd;
        pricing.push({
          currency: otherCurrency,
          providerAmount: roundAmount(convertedAmount),
          amount: roundAmount(convertedAmount * 1.3),
        });
      }
    }
  }

  return NextResponse.json({ domain: domain.domain, available, pricing, fxUpdatedAt });
}
