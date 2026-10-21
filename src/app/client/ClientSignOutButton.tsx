"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ClientSignOutButton() {
  const router = useRouter();
  return <div className="flex items-center gap-4">
    <Link href="/client/password?mode=change" className="text-sm font-medium text-slate-600 hover:text-blue-700">Password</Link>
    <button className="text-sm font-medium text-slate-600 hover:text-blue-700" onClick={async () => {
      await createClient().auth.signOut();
      router.replace("/login");
      router.refresh();
    }}>Sign out</button>
  </div>;
}
