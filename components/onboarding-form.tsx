"use client";

import { saveOnboarding } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const GOALS = [
  "Tornar-me analista fiscal",
  "Ser promovido(a)",
  "Mudar de carreira",
  "Abrir um escritório contábil",
];

function Choice({ name, options }: { name: string; options: [string, string][] }) {
  return (
    <RadioGroup name={name} className="grid grid-cols-2 gap-2" required>
      {options.map(([value, label]) => (
        <Label
          key={value}
          className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent"
        >
          <RadioGroupItem value={value} /> {label}
        </Label>
      ))}
    </RadioGroup>
  );
}

export function OnboardingForm() {
  return (
    <form action={saveOnboarding} className="space-y-6">
      <div className="space-y-2">
        <Label>Qual o seu objetivo?</Label>
        <RadioGroup name="goal" className="grid gap-2" required>
          {GOALS.map((g) => (
            <Label key={g} className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent">
              <RadioGroupItem value={g} /> {g}
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>Seu nível atual</Label>
        <Choice name="level" options={[["beginner", "Iniciante"], ["intermediate", "Intermediário"], ["advanced", "Avançado"]]} />
      </div>

      <div className="space-y-2">
        <Label>Tempo de estudo por dia</Label>
        <Choice name="study_time" options={[["30min", "30 min/dia"], ["1h", "1h/dia"], ["2h", "2h/dia"]]} />
      </div>

      <div className="space-y-2">
        <Label>Estilo de aprendizagem preferido</Label>
        <Choice name="learning_style" options={[["practical", "Exemplos práticos"], ["videos", "Vídeos"], ["exercises", "Exercícios"], ["reading", "Leitura"]]} />
      </div>

      <Button type="submit" className="w-full">Gerar meu plano</Button>
    </form>
  );
}
