export type Persona =
  | "policyholder"
  | "financial-adviser"
  | "life-insured"
  | "beneficiary"
  | "claims-assessor"
  | "service-agent";

export interface PersonaOption {
  key: Persona;
  label: string;
  email: string;
}

export interface MockUser {
  password: string;
  persona: Persona;
}

export interface DashboardAction {
  title: string;
  subtitle: string;
  badge: string;
}

export interface DashboardItem {
  label: string;
  value: string;
}

export interface DashboardInsight {
  title: string;
  value: string;
  detail: string;
}

export interface PersonaDashboardView {
  greeting: string;
  roleLabel: string;
  intro: string;
  milestone: string;
  quickActions: DashboardAction[];
  snapshotTitle: string;
  snapshotValue: string;
  snapshotDescription: string;
  snapshotDetails: DashboardItem[];
  activity: DashboardItem[];
  insights: DashboardInsight[];
}

export interface MockPortalData {
  personas: PersonaOption[];
  users: Record<string, MockUser>;
  dashboards: Record<Persona, PersonaDashboardView>;
}

export const PERSONA_DASHBOARD_VIEWS: Record<Persona, PersonaDashboardView> = {
  policyholder: {
    greeting: "Welcome back, Maya.",
    roleLabel: "Policyholder",
    intro:
      "Your policy companion helps you understand your coverage, prepare for a claim, and make guided updates without friction.",
    milestone: "Review your beneficiary update before the next review date.",
    quickActions: [
      {
        title: "Open policy summary",
        subtitle: "Review your core coverage and beneficiaries",
        badge: "Live",
      },
      {
        title: "Start a claim",
        subtitle: "Upload documents and track the next step",
        badge: "New",
      },
      {
        title: "Update beneficiary",
        subtitle: "Make a change in a few guided steps",
        badge: "Recommended",
      },
    ],
    snapshotTitle: "Policy snapshot",
    snapshotValue: "$500,000 coverage",
    snapshotDescription:
      "Your account is active, your premium is current, and help is available whenever you need it.",
    snapshotDetails: [
      { label: "Coverage type", value: "Term life" },
      { label: "Premium status", value: "Current" },
    ],
    activity: [
      { label: "Coverage active", value: "$500k life coverage" },
      { label: "Premium status", value: "Current through August" },
      { label: "Claim activity", value: "No open claims" },
    ],
    insights: [
      {
        title: "Policy health",
        value: "Excellent",
        detail: "No issues detected this month",
      },
      {
        title: "Document readiness",
        value: "Ready",
        detail: "All required forms are current",
      },
      {
        title: "Support access",
        value: "24/7",
        detail: "Help available in-app and by phone",
      },
    ],
  },
  "financial-adviser": {
    greeting: "Welcome back, Daniel.",
    roleLabel: "Financial Adviser",
    intro:
      "You can review client readiness, coordinate next steps, and share tailored guidance in a single workspace.",
    milestone:
      "Send the latest policy review summary before your client check-in.",
    quickActions: [
      {
        title: "Review client plans",
        subtitle: "Compare options and coverage updates",
        badge: "Priority",
      },
      {
        title: "Prepare recommendations",
        subtitle: "Draft next best actions for each client",
        badge: "New",
      },
      {
        title: "Book follow-up",
        subtitle: "Coordinate with the member services team",
        badge: "Suggested",
      },
    ],
    snapshotTitle: "Client overview",
    snapshotValue: "12 active portfolios",
    snapshotDescription:
      "Coverage reviews are current and clients have clear next actions outlined.",
    snapshotDetails: [
      { label: "Upcoming reviews", value: "3 this week" },
      { label: "Client readiness", value: "High" },
    ],
    activity: [
      { label: "Client follow-ups", value: "5 pending" },
      { label: "Plan changes", value: "2 this month" },
      { label: "Risk notes", value: "No urgent action" },
    ],
    insights: [
      {
        title: "Opportunity",
        value: "Healthy",
        detail: "Three clients are ready for a policy review",
      },
      {
        title: "Capacity",
        value: "Balanced",
        detail: "Your schedule stays within target this week",
      },
      {
        title: "Support",
        value: "Shared",
        detail: "Service desk hand-offs are prepared",
      },
    ],
  },
  "life-insured": {
    greeting: "Welcome back, Olivia.",
    roleLabel: "Life Insured",
    intro:
      "Stay informed about your coverage, update your preferences, and understand what support is available.",
    milestone:
      "Confirm your address and beneficiary details before the next review.",
    quickActions: [
      {
        title: "View coverage details",
        subtitle: "See the terms that matter most to you",
        badge: "Live",
      },
      {
        title: "Check documents",
        subtitle: "Review the latest forms and notices",
        badge: "Updated",
      },
      {
        title: "Contact support",
        subtitle: "Ask for help with claims or life updates",
        badge: "Support",
      },
    ],
    snapshotTitle: "Coverage summary",
    snapshotValue: "Protected and active",
    snapshotDescription:
      "Your records are up to date and your policy remains in good standing.",
    snapshotDetails: [
      { label: "Policy status", value: "Active" },
      { label: "Next review", value: "September" },
    ],
    activity: [
      { label: "Coverage status", value: "Active" },
      { label: "Documents", value: "All current" },
      { label: "Beneficiary notes", value: "Reviewed" },
    ],
    insights: [
      {
        title: "Readiness",
        value: "Ready",
        detail: "All personal details are on file",
      },
      {
        title: "Notifications",
        value: "Enabled",
        detail: "You will receive updates when anything changes",
      },
      {
        title: "Support",
        value: "Guided",
        detail: "Help is available in a few quick steps",
      },
    ],
  },
  beneficiary: {
    greeting: "Welcome back, Sofia.",
    roleLabel: "Beneficiary",
    intro:
      "You can review what has been prepared for you and access the right next steps with clarity.",
    milestone:
      "Check the latest beneficiary update before the next review window.",
    quickActions: [
      {
        title: "View beneficiary notice",
        subtitle: "Understand the current policy status",
        badge: "New",
      },
      {
        title: "Read next steps",
        subtitle: "See what support is available right now",
        badge: "Guide",
      },
      {
        title: "Contact a service agent",
        subtitle: "Ask questions about documentation",
        badge: "Support",
      },
    ],
    snapshotTitle: "Beneficiary update",
    snapshotValue: "Ready to review",
    snapshotDescription:
      "The latest information is available and the support team is ready to help.",
    snapshotDetails: [
      { label: "Status", value: "Prepared" },
      { label: "Contact", value: "Service team" },
    ],
    activity: [
      { label: "Recent notice", value: "Viewed today" },
      { label: "Documents", value: "Available" },
      { label: "Support", value: "On call" },
    ],
    insights: [
      {
        title: "Clarity",
        value: "High",
        detail: "The next steps are simple and clearly explained",
      },
      {
        title: "Support",
        value: "Fast",
        detail: "Agents can help with questions in minutes",
      },
      {
        title: "Confidence",
        value: "Steady",
        detail: "You have what you need to move forward",
      },
    ],
  },
  "claims-assessor": {
    greeting: "Welcome back, Priya.",
    roleLabel: "Claims Assessor",
    intro:
      "Track claims in motion, understand the latest evidence, and coordinate the next review quickly.",
    milestone:
      "Prioritize the new claims that need a follow-up this afternoon.",
    quickActions: [
      {
        title: "Review claims queue",
        subtitle: "Open the highest-priority cases",
        badge: "Priority",
      },
      {
        title: "Check documentation",
        subtitle: "Review submitted evidence and gaps",
        badge: "Ready",
      },
      {
        title: "Escalate a case",
        subtitle: "Route complex issues to the right team",
        badge: "Action",
      },
    ],
    snapshotTitle: "Claims view",
    snapshotValue: "4 active files",
    snapshotDescription:
      "The current intake is stable and all urgent tasks have been flagged.",
    snapshotDetails: [
      { label: "Urgent", value: "2 cases" },
      { label: "Average review", value: "1.5 days" },
    ],
    activity: [
      { label: "Pending reviews", value: "4" },
      { label: "Completed today", value: "3" },
      { label: "Escalations", value: "1" },
    ],
    insights: [
      {
        title: "Queue",
        value: "Healthy",
        detail: "No backlog build-up is expected today",
      },
      {
        title: "Evidence",
        value: "Complete",
        detail: "Most case files are ready for review",
      },
      {
        title: "Support",
        value: "Connected",
        detail: "Operations and service teams are available",
      },
    ],
  },
  "service-agent": {
    greeting: "Welcome back, Jordan.",
    roleLabel: "Service Agent",
    intro:
      "Help members quickly with clear, guided responses and dependable next steps.",
    milestone:
      "Prepare the newest service requests for the afternoon hand-off.",
    quickActions: [
      {
        title: "Open incoming requests",
        subtitle: "Review the latest member needs",
        badge: "Live",
      },
      {
        title: "Draft a response",
        subtitle: "Send a clear, policy-aware update",
        badge: "Suggested",
      },
      {
        title: "Escalate if needed",
        subtitle: "Route complex issues to specialists",
        badge: "Action",
      },
    ],
    snapshotTitle: "Service snapshot",
    snapshotValue: "18 requests today",
    snapshotDescription:
      "The team is operating smoothly and requests are moving with strong context.",
    snapshotDetails: [
      { label: "Resolved", value: "12" },
      { label: "Awaiting reply", value: "6" },
    ],
    activity: [
      { label: "Open requests", value: "6" },
      { label: "Follow-ups", value: "3" },
      { label: "Escalations", value: "1" },
    ],
    insights: [
      {
        title: "Response time",
        value: "Fast",
        detail: "The team is staying within target response windows",
      },
      {
        title: "Knowledge base",
        value: "Updated",
        detail: "The latest policy updates are available",
      },
      {
        title: "Coverage",
        value: "Clear",
        detail: "Members are receiving concise next steps",
      },
    ],
  },
};

export const MOCK_PORTAL_DATA: MockPortalData = {
  personas: [
    {
      key: "policyholder",
      label: "Policyholder",
      email: "member@momentum.test",
    },
    {
      key: "financial-adviser",
      label: "Financial Adviser",
      email: "adviser@momentum.test",
    },
    {
      key: "life-insured",
      label: "Life Insured",
      email: "insured@momentum.test",
    },
    {
      key: "beneficiary",
      label: "Beneficiary",
      email: "beneficiary@momentum.test",
    },
    {
      key: "claims-assessor",
      label: "Claims Assessor",
      email: "claims@momentum.test",
    },
    {
      key: "service-agent",
      label: "Service Agent",
      email: "service@momentum.test",
    },
  ],
  users: {
    "member@momentum.test": {
      password: "password123",
      persona: "policyholder",
    },
    "adviser@momentum.test": {
      password: "password123",
      persona: "financial-adviser",
    },
    "insured@momentum.test": {
      password: "password123",
      persona: "life-insured",
    },
    "beneficiary@momentum.test": {
      password: "password123",
      persona: "beneficiary",
    },
    "claims@momentum.test": {
      password: "password123",
      persona: "claims-assessor",
    },
    "service@momentum.test": {
      password: "password123",
      persona: "service-agent",
    },
  },
  dashboards: PERSONA_DASHBOARD_VIEWS,
};

export async function getMockPortalData(): Promise<MockPortalData> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_PORTAL_DATA), 120);
  });
}

export function getPersonaByEmail(email: string): Persona | undefined {
  return MOCK_PORTAL_DATA.users[email.trim().toLowerCase()]?.persona;
}

export function getDashboardViewByEmail(
  email: string,
): PersonaDashboardView | undefined {
  const persona = getPersonaByEmail(email);
  return persona ? MOCK_PORTAL_DATA.dashboards[persona] : undefined;
}
