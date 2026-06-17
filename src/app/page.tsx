import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Board from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const meta = (user.user_metadata ?? {}) as {
    name?: string;
    username?: string;
  };
  const name =
    meta.name || meta.username || user.email?.split("@")[0] || "Usuario";

  return <Board currentUserName={name} />;
}
