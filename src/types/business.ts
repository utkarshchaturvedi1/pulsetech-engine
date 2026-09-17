export type BusinessProfile = {
  website: string;

  businessName: string;
  tagline: string;

  logo: string;

  primaryColor: string;
  secondaryColor: string;

  phone: string;
  email: string;
  address: string;

  services: string[];

  serviceAreas: string[];

  faqs: {
    question: string;
    answer: string;
  }[];

  leadQuestions: string[];

  systemPrompt: string;

  /** When true, this profile is PulseTech test/demo data — not a paying client. */
  isTestData?: boolean;

  /** Customer-facing sales employee name, if the owner set one. */
  agentName?: string;
  /** Spoken / chat introduction, if the owner set one. */
  agentIntroduction?: string;
  businessHours?: string;
  /** Visit charges, free estimates, or pricing rules. Only if the owner explicitly provided them. */
  pricingRules?: string;
  tone?: string;
  /** Per-demo website-chat lead-alert email. Required for generated businesses. */
  leadNotificationEmail?: string;
  /** Per-demo internal SMS number in E.164. Required for generated businesses. */
  leadNotificationPhone?: string;
};