import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const isPublic = request.nextUrl.pathname === "/"
    || request.nextUrl.pathname.startsWith("/pricing")
    || request.nextUrl.pathname.startsWith("/products")
    || request.nextUrl.pathname.startsWith("/lead-data")
    || request.nextUrl.pathname.startsWith("/api/lead-orders")
    || request.nextUrl.pathname.startsWith("/api/guest-subscriptions")
    || request.nextUrl.pathname === "/api/domains/search"
    || request.nextUrl.pathname.startsWith("/domains/buy")
    || request.nextUrl.pathname.startsWith("/subscribe")
    || request.nextUrl.pathname.startsWith("/api/billing")
    || request.nextUrl.pathname.startsWith("/login")
    || request.nextUrl.pathname.startsWith("/forgot-password")
    || request.nextUrl.pathname.startsWith("/auth")
    || request.nextUrl.pathname.startsWith("/unsubscribe")
    || request.nextUrl.pathname.startsWith("/api/webhooks")
    || request.nextUrl.pathname.startsWith("/api/unsubscribe")
    || request.nextUrl.pathname === "/api/health";
  if (isPublic) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    return NextResponse.redirect(login);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies: { name: string; value: string; options: CookieOptions }[]) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
