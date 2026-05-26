"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function setStatus(status: "connected" | "skipped", label: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error: upsertErr } = await supabase
    .from("cefis_connections")
    .upsert({ user_id: user.id, status, account_label: label });
  if (upsertErr) console.error("cefis_connections upsert failed:", upsertErr);
  redirect("/dashboard");
}

// MVP stores no secret — only status + a non-secret label.
export async function connectCefis(formData: FormData) {
  const label = String(formData.get("account_label") ?? "Conta CEFIS");
  await setStatus("connected", label);
}

export async function skipCefis() {
  await setStatus("skipped", null);
}
