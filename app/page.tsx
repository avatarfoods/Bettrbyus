import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">Protein Thaw Manager</h1>
        <p className="max-w-md text-center text-zinc-600">
          Add your Supabase credentials to{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm">
            .env.local
          </code>{" "}
          and restart the dev server.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("items").select("id").limit(1);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">Protein Thaw Manager</h1>
        <p className="text-red-600">Supabase error: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Protein Thaw Manager</h1>
      <p className="text-green-700">
        Connected to Supabase — items query returned {data?.length ?? 0}{" "}
        row(s).
      </p>
    </div>
  );
}
