import { connectCefis, skipCefis } from "@/actions/cefis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function CefisConnectPage() {
  return (
    <main className="mx-auto max-w-md p-6">
      <Card className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Conectar sua conta CEFIS</h1>
        <p className="text-sm text-muted-foreground">
          Identifique sua conta para personalizar recomendações. Nenhuma chave é
          armazenada nesta versão.
        </p>
        <form action={connectCefis} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="account_label">Identificação da conta</Label>
            <Input id="account_label" name="account_label" placeholder="ex.: meu e-mail CEFIS" />
          </div>
          <Button type="submit" className="w-full">Conectar</Button>
        </form>
        <form action={skipCefis}>
          <Button variant="ghost" className="w-full" type="submit">Pular por agora</Button>
        </form>
      </Card>
    </main>
  );
}
