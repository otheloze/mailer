"use client";

import { useEffect, useRef, useState } from "react";
import { CreditCard, LoaderCircle } from "lucide-react";

export type PaymentProvider = "paypal" | "paystack";

/** Response from /api/guest-subscriptions/checkout and /api/subscriptions/checkout. */
export type CheckoutStart = { url: string; reference: string; orderId?: string; accessCode?: string };

type PayPalButtonsInstance = {
  isEligible: () => boolean;
  render: (container: HTMLElement) => Promise<void>;
  close: () => Promise<void>;
};
type PayPalActions = { resolve: () => Promise<void>; reject: () => Promise<void> };
type PayPalNamespace = {
  Buttons: (options: {
    style?: Record<string, string | number | boolean>;
    onClick?: (data: unknown, actions: PayPalActions) => Promise<void> | void;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void> | void;
    onCancel?: () => void;
    onError?: (error: unknown) => void;
  }) => PayPalButtonsInstance;
};
type PaystackPopup = {
  resumeTransaction: (accessCode: string, callbacks?: {
    onSuccess?: (transaction: { reference?: string }) => void;
    onCancel?: () => void;
    onError?: (error: { message?: string }) => void;
  }) => void;
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
    PaystackPop?: new () => PaystackPopup;
  }
}

// Public client ID (safe to expose); mapped from PAYPAL_CLIENT_ID in next.config.ts.
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";
const PAYPAL_SDK = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&currency=USD&intent=capture&components=buttons`;
const PAYSTACK_SDK = "https://js.paystack.co/v2/inline.js";

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string) {
  let pending = scripts.get(src);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const element = document.createElement("script");
      element.src = src;
      element.async = true;
      element.onload = () => resolve();
      element.onerror = () => {
        scripts.delete(src);
        element.remove();
        reject(new Error(`Could not load ${new URL(src).hostname}.`));
      };
      document.head.appendChild(element);
    });
    scripts.set(src, pending);
  }
  return pending;
}

/**
 * Where the browser goes after a popup payment succeeds. These are the same
 * return URLs the hosted redirect flow uses, so the page's existing
 * server-side verification and activation runs unchanged.
 */
export function paymentReturnUrl(returnPath: string, provider: PaymentProvider, reference: string) {
  const params = provider === "paypal"
    ? new URLSearchParams({ checkout: "paypal", token: reference })
    : new URLSearchParams({ checkout: "paystack", reference });
  return `${returnPath}?${params.toString()}`;
}

export function PaymentButtons({
  paystackAmount,
  paypalAmount,
  disabled = false,
  validate,
  start,
  returnPath,
  onError,
}: {
  paystackAmount: string;
  paypalAmount: string;
  disabled?: boolean;
  /** Return an error message to block checkout (e.g. missing email), or null. */
  validate: () => string | null;
  start: (provider: PaymentProvider) => Promise<CheckoutStart>;
  returnPath: string;
  onError: (message: string) => void;
}) {
  const [paystackBusy, setPaystackBusy] = useState(false);
  const [paypalState, setPaypalState] = useState<"loading" | "ready" | "unavailable">(PAYPAL_CLIENT_ID ? "loading" : "unavailable");
  const [paypalFallbackBusy, setPaypalFallbackBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef({ validate, start, returnPath, onError, disabled });
  useEffect(() => { latest.current = { validate, start, returnPath, onError, disabled }; });

  useEffect(() => {
    if (!PAYPAL_CLIENT_ID) return;
    let cancelled = false;
    let buttons: PayPalButtonsInstance | undefined;
    let startError = "";
    loadScript(PAYPAL_SDK).then(async () => {
      if (cancelled || !container.current || !window.paypal) return;
      buttons = window.paypal.Buttons({
        style: { layout: "vertical", color: "gold", shape: "rect", label: "pay", height: 45, tagline: false },
        onClick: (_data, actions) => {
          const problem = latest.current.disabled ? "Checkout is unavailable right now." : latest.current.validate();
          if (problem) {
            latest.current.onError(problem);
            return actions.reject();
          }
          return actions.resolve();
        },
        createOrder: async () => {
          startError = "";
          try {
            const checkout = await latest.current.start("paypal");
            if (!checkout.orderId) throw new Error("PayPal did not return an order.");
            return checkout.orderId;
          } catch (reason) {
            startError = reason instanceof Error ? reason.message : "Could not start PayPal checkout.";
            throw reason;
          }
        },
        onApprove: (data) => {
          window.location.assign(paymentReturnUrl(latest.current.returnPath, "paypal", data.orderID));
        },
        onCancel: () => latest.current.onError("PayPal checkout was closed. No payment was taken."),
        onError: (error) => {
          console.error("PayPal button error:", error);
          latest.current.onError(startError || "PayPal could not complete the payment. Please try again.");
        },
      });
      if (!buttons.isEligible()) {
        setPaypalState("unavailable");
        return;
      }
      await buttons.render(container.current);
      if (!cancelled) setPaypalState("ready");
    }).catch(() => {
      if (!cancelled) setPaypalState("unavailable");
    });
    return () => {
      cancelled = true;
      void buttons?.close().catch(() => undefined);
    };
  }, []);

  async function payWithPaystack() {
    const problem = disabled ? "Checkout is unavailable right now." : validate();
    if (problem) { onError(problem); return; }
    setPaystackBusy(true);
    try {
      const checkout = await start("paystack");
      try {
        await loadScript(PAYSTACK_SDK);
      } catch {
        window.location.assign(checkout.url);
        return;
      }
      if (!checkout.accessCode || !window.PaystackPop) {
        window.location.assign(checkout.url);
        return;
      }
      new window.PaystackPop().resumeTransaction(checkout.accessCode, {
        // Always verify the reference this server issued; the server re-checks it with Paystack.
        onSuccess: () => window.location.assign(paymentReturnUrl(returnPath, "paystack", checkout.reference)),
        onCancel: () => { setPaystackBusy(false); onError("Paystack checkout was closed. No payment was taken."); },
        onError: (error) => { setPaystackBusy(false); onError(error?.message || "Paystack could not start. Please try again."); },
      });
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not start Paystack checkout.");
      setPaystackBusy(false);
    }
  }

  async function payWithPayPalRedirect() {
    const problem = disabled ? "Checkout is unavailable right now." : validate();
    if (problem) { onError(problem); return; }
    setPaypalFallbackBusy(true);
    try {
      const checkout = await start("paypal");
      window.location.assign(checkout.url);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not start PayPal checkout.");
      setPaypalFallbackBusy(false);
    }
  }

  return <div className="grid gap-2.5">
    <button
      type="button"
      onClick={() => void payWithPaystack()}
      disabled={paystackBusy}
      className="inline-flex h-[45px] w-full items-center justify-center gap-2 rounded-[4px] bg-[#011b33] px-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#0a2a4a] disabled:cursor-wait disabled:opacity-70"
    >
      {paystackBusy
        ? <><LoaderCircle size={16} className="animate-spin" /> Opening Paystack…</>
        : <><CreditCard size={16} /> Pay {paystackAmount} with Paystack</>}
    </button>
    <p className="-mt-1 text-center text-[11px] text-[#64748b]">Card · Bank transfer · USSD (NGN)</p>

    <div className="relative min-h-[45px]">
      <div ref={container} className={paypalState === "ready" ? "" : "hidden"} />
      {paypalState === "loading" && <div className="h-[45px] animate-pulse rounded-[4px] bg-[#ffc439]/60" aria-label="Loading PayPal" />}
      {paypalState === "unavailable" && <button
        type="button"
        onClick={() => void payWithPayPalRedirect()}
        disabled={paypalFallbackBusy}
        className="inline-flex h-[45px] w-full items-center justify-center gap-2 rounded-[4px] bg-[#ffc439] px-3 text-[15px] font-semibold text-[#003087] transition hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
      >
        {paypalFallbackBusy ? <><LoaderCircle size={16} className="animate-spin" /> Opening PayPal…</> : <>Pay {paypalAmount} with PayPal</>}
      </button>}
    </div>
  </div>;
}

/** POSTs to a checkout endpoint and returns the provider details, throwing the server's message on failure. */
export async function requestCheckout(endpoint: string, body: Record<string, unknown>): Promise<CheckoutStart> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null) as (Partial<CheckoutStart> & { error?: string }) | null;
  if (!response.ok) throw new Error(result?.error ?? "Could not start secure checkout.");
  if (!result?.url || !result.reference) throw new Error("Checkout did not return payment details.");
  return result as CheckoutStart;
}
