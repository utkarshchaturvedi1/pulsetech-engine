"use client";

import { useState } from "react";

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function ClientInstallation({
  businessName,
  demoId,
  baseUrl,
}: {
  businessName: string;
  demoId: string;
  baseUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!baseUrl) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
        <h2 className="text-xl font-bold">Website installation link is being prepared</h2>
        <p className="mt-2 text-sm leading-6">PulseTech needs to finish configuring the public service address before it can provide your website code. Contact <a className="font-semibold underline" href="mailto:leads@pulsetechlabs.com">leads@pulsetechlabs.com</a>.</p>
      </section>
    );
  }
  const widgetUrl = `${baseUrl}/widget/${encodeURIComponent(demoId)}`;
  const snippet = `<iframe\n  src="${widgetUrl}"\n  title="${escapeHtmlAttribute(businessName)} AI Sales Employee"\n  width="100%"\n  height="640"\n  style="max-width: 420px; border: 0; border-radius: 20px;"\n  loading="lazy"\n  referrerpolicy="strict-origin-when-cross-origin"\n></iframe>`;

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Website chat installation</p>
      <h2 className="mt-2 text-xl font-bold text-slate-950">Add the chat to your website</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Copy this block and place it where you want the chat panel to appear. It resizes to the available width and keeps the conversation isolated from the rest of your site.
      </p>
      <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="pt-chat-install-code">Installation code</label>
      <textarea id="pt-chat-install-code" readOnly value={snippet} rows={8} className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-800" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copySnippet} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">{copied ? "Copied" : "Copy code"}</button>
        <a href={widgetUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700 hover:underline">Open chat preview</a>
      </div>
      <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
        <div>
          <h3 className="font-semibold text-slate-900">WordPress</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Edit the page, add a <strong>Custom HTML</strong> block where the chat should appear, paste the code, then publish.</p>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Wix or Squarespace</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Add an <strong>Embed HTML</strong> or <strong>Code</strong> block, paste the code, and set its width to fill the section.</p>
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Before launch, check the installed chat on desktop and mobile and complete a test enquiry. For the first clients, PulseTech will review the placement with you.
      </p>
      <div className="mt-5 border-t border-slate-100 pt-5">
        <h3 className="font-semibold text-slate-900">Inbound phone setup</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Phone activation is configured with PulseTech for each business. We will confirm whether you are using a dedicated line or connecting an existing business number, configure the inbound route, then test a real call and its lead alerts before marking the service live. Your callers will not be asked for a demo code.
        </p>
      </div>
    </section>
  );
}
