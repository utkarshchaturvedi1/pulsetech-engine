"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ClientSignOutButton() {
  const router = useRouter();
  return <button className="text-sm font-medium text-slate-600 hover:text-blue-700" onClick={async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }}>Sign out</button>;
}
