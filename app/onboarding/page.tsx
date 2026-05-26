import { OnboardingForm } from "@/components/onboarding-form";
import { Card } from "@/components/ui/card";

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <Card className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Vamos personalizar seu aprendizado</h1>
          <p className="text-muted-foreground">Responda 4 perguntas rápidas.</p>
        </div>
        <OnboardingForm />
      </Card>
    </main>
  );
}
