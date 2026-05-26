import Link from "next/link";
import { Chat } from "@/components/chat";
import { SignOutButton } from "@/components/sign-out-button";

export default function TutorPage() {
  return (
    <div>
      <header className="flex h-16 items-center justify-between border-b px-4">
        <Link href="/dashboard" className="font-semibold">CEFIS Tutor</Link>
        <SignOutButton />
      </header>
      <Chat />
    </div>
  );
}
