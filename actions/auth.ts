"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Normalize Supabase errors to prevent account enumeration via error messages.
function signupErrorMessage(msg: string): string {
  if (/already registered|already exists|email.*taken/i.test(msg)) {
    return "E-mail já cadastrado. Faça login ou redefina sua senha.";
  }
  return "Erro ao criar conta. Tente novamente.";
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const fullName = String(formData.get("full_name") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) redirect("/signup?error=" + encodeURIComponent(signupErrorMessage(error.message)));
  // No session means Supabase email confirmation is enabled — user must verify first.
  if (!data.session) redirect("/signup?check-email=1");
  redirect("/onboarding");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
