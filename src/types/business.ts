export type ConfigurationHistoryEvent = {
  source: "website" | "owner";
  leadQuestions?: string[];
  removedLeadQuestions?: string[];
};

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

  /**
   * Questions the owner explicitly told Peter to ask before handoff.
   * Undefined, with no configuration history, keeps every lead question required.
   * An empty array means website-generated discovery questions are not compulsory.
   * When this field is missing, configuration history can recover which questions
   * the website generated and which the owner required. A question with no
   * recorded origin stays required.
   */
  ownerLeadQuestions?: string[];

  /**
   * Append-only origin of lead questions. Website analysis and owner updates
   * record the questions they added or removed. Load uses this to repair saved
   * profiles that predate ownerLeadQuestions, and does not infer origin when
   * an entry is missing.
   */
  configurationHistory?: ConfigurationHistoryEvent[];

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