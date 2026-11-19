import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { SignupForm } from "@/components/signup-form";

export const metadata: Metadata = {
  title: "Start your free trial | MYMAILMARKET",
  description: "Create a free account and try one test email and one email discovery before choosing a plan.",
};

export default function SignupPage() {
  if (process.env.NEXT_PUBLIC_ALLOW_SIGNUP === "false") redirect("/login");
  return <AuthCard title="Start your free trial" description="Create your account to send a test email and run a discovery, free.">
    <SignupForm />
  </AuthCard>;
}
