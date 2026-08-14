"use client";

import { useState } from "react";

type WebsiteInputProps = {
  onGenerate: (website: string) => void;
  loading?: boolean;
};

export default function WebsiteInput({
  onGenerate,
  loading = false,
}: WebsiteInputProps) {
  const [website, setWebsite] = useState("https://texassolar.pro");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const value = website.trim();

    if (!value) return;

    onGenerate(value);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3"
    >
      <input
        type="url"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        placeholder="https://example.com"
        className="w-[420px] rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
      />

      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Generating..." : "Generate AI Sales Employee"}
      </button>
    </form>
  );
}