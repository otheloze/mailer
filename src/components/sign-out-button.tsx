"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [error, setError] = useState("");
  const router = useRouter();
  async function signOut() {
    setError("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signOut();
      if (authError) throw authError;
      router.replace("/login");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); }
  }
  return <div className="relative">
    <button onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="ml-1 rounded-md p-2 text-muted hover:bg-[#f3f3f0] dark:hover:bg-[#282826]"><LogOut size={15} /></button>
    {error && <span role="alert" className="absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md bg-red-50 px-2 py-1 text-[13px] text-red-700">{error}</span>}
  </div>;
}
