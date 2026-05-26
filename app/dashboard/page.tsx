import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("learning_profiles")
    .select("goal, level")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Seu painel</h1>
        <SignOutButton />
      </div>
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Objetivo</p>
        <p className="font-medium">{profile?.goal ?? "—"}</p>
        <p className="mt-2 text-sm text-muted-foreground">Nível</p>
        <p className="font-medium">{profile?.level ?? "—"}</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/tutor"><Card className="p-4 hover:bg-accent"><h2 className="font-medium">Tutor IA</h2><p className="text-sm text-muted-foreground">Tire dúvidas fiscais</p></Card></Link>
        <Link href="/roadmap"><Card className="p-4 hover:bg-accent"><h2 className="font-medium">Trilha</h2><p className="text-sm text-muted-foreground">Em breve</p></Card></Link>
        <Link href="/cases"><Card className="p-4 hover:bg-accent"><h2 className="font-medium">Casos práticos</h2><p className="text-sm text-muted-foreground">Em breve</p></Card></Link>
      </div>
    </main>
  );
}
