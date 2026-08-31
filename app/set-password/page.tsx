import Image from "next/image";
import { redirect } from "next/navigation";
import { SetPasswordForm } from "@/components/set-password-form";

export const metadata = {
  title: "Set password",
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (code) {
    redirect(
      `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent("/set-password")}`
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-gradient-to-b from-background via-background to-muted/40 px-6 py-16">
      <Image
        src="/logo.png"
        alt="Avatar Natural Foods"
        width={200}
        height={64}
        className="mb-8 h-auto w-full max-w-[180px] object-contain"
        priority
      />
      <SetPasswordForm />
      <p className="mt-12 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Avatar Natural Foods. All rights
        reserved.
      </p>
    </div>
  );
}
