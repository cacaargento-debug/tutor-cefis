import Link from "next/link";
import { signUp } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; "check-email"?: string }>;
}) {
  const params = await searchParams;

  if (params["check-email"] === "1") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm p-6 space-y-4 text-center">
          <h1 className="text-xl font-semibold">Verifique seu e-mail</h1>
          <p className="text-sm text-muted-foreground">
            Enviamos um link de confirmação. Clique nele para ativar sua conta e acessar o tutor.
          </p>
          <Link className="underline text-sm" href="/login">
            Já confirmei — entrar
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Criar conta</h1>
        {params.error && (
          <p className="text-sm text-destructive">{params.error}</p>
        )}
        <form action={signUp} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="full_name">Nome</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" minLength={6} required />
          </div>
          <Button type="submit" className="w-full">Cadastrar</Button>
        </form>
        <p className="text-sm text-muted-foreground">
          Já tem conta? <Link className="underline" href="/login">Entrar</Link>
        </p>
      </Card>
    </main>
  );
}
