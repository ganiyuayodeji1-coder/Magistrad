import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = { title: "Signed out" };

export default function SignedOutPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <Wordmark className="mb-10 justify-center" />
        <h1 className="font-serif text-[28px]">You are signed out</h1>
        <p className="mt-2 text-ink-soft">Your session has ended on this device.</p>
        <Button asChild variant="secondary" className="mt-8"><Link href="/sign-in">Sign in again</Link></Button>
      </div>
    </main>
  );
}
