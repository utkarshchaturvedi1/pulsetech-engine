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
};