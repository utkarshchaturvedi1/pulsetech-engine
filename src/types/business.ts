export type BusinessProfile = {
  website: string;

  businessName: string;
  tagline: string;

  logo: string;
  /** Compact site icon / favicon for small avatar contexts. */
  siteIcon?: string;

  primaryColor: string;
  secondaryColor: string;

  phone: string;
  /** Public contact email shown to customers when appropriate. */
  email: string;
  /** Internal recipient for new-lead notifications. Never customer-facing knowledge. */
  leadNotificationEmail?: string;
  address: string;

  services: string[];

  serviceAreas: string[];

  faqs: {
    question: string;
    answer: string;
  }[];

  leadQuestions: string[];

  systemPrompt: string;
};
