"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LearningProfile } from "@/types";

export async function saveOnboarding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile: LearningProfile = {
    goal: String(formData.get("goal")),
    level: String(formData.get("level")) as LearningProfile["level"],
    study_time: String(formData.get("study_time")) as LearningProfile["study_time"],
    learning_style: String(formData.get("learning_style")) as LearningProfile["learning_style"],
  };

  const { error } = await supabase
    .from("learning_profiles")
    .upsert({ user_id: user.id, ...profile });
  if (error) redirect("/onboarding?error=" + encodeURIComponent(error.message));

  redirect("/cefis/connect");
}
