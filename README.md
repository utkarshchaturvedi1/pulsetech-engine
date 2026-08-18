This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Lead notification email (V1)

Qualified Customer AI leads are emailed server-side via SMTP.

PulseTech sends from its Hostinger mailbox. The recipient is configurable.

Required in `.env.local`:

```bash
# Recipient (configurable — test destination shown)
LEAD_NOTIFICATION_EMAIL=pulsetechlabs1@gmail.com

# Sender (PulseTech Hostinger mailbox)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=leads@pulsetechlabs.com
SMTP_PASS=
SMTP_FROM=leads@pulsetechlabs.com
```

Use port **465** with SSL/TLS. Put the real mailbox password only in `.env.local` (never commit it).

A lead is emailed once when:
- `leadStatus` is `SECURED`
- intent is `HIGH` or `READY_TO_ACT`
- name, phone, and address are present
- customer need is concrete (not browsing)
- `handoffReady` is `true` (natural conversation endpoint — not merely secured)

`leadDeliveryStatus` becomes `SENT` only after successful delivery. The Customer AI may claim handoff only when status is `SENT`.

Handoff timing (V1):
- Do **not** email merely because the lead became `SECURED`
- Immediate email only on **genuine customer agreement** (`detectCustomerAgreement` / `customerAgreed`) when `handoffReady`
- Or email after **5 minutes of customer inactivity** when `handoffReady` (timer resets on each new customer message)
- Bare “Yes…” answers to triage questions are **not** closure
- Only one notification per conversation
- Each Customer AI session has an immutable `conversationId` and bound business identity

Automated handoff tests must set `LEAD_HANDOFF_DRY_RUN=true` so SMTP is never called.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
