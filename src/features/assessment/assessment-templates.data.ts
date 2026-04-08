import type { NaviPillar } from '../../utils/navi-score';

export type TemplateStep = {
  title: string;
  questions: string[];
  /** Same length as questions; maps each item to NAVI pillar for scoring. */
  pillars: NaviPillar[];
};

export type AssessmentTemplateDef = {
  id: string;
  name: string;
  description: string;
  steps: TemplateStep[];
};

const repeat = <T,>(n: number, v: T): T[] => Array.from({ length: n }, () => v);

/**
 * Full NAVI question banks (1–5: Strongly Disagree → Strongly Agree).
 * Leadership templates: super admin & leaders. Employee templates: employee-facing wording.
 */
export const NAVI_ASSESSMENT_TEMPLATES: AssessmentTemplateDef[] = [
  {
    id: 'navi-pre-change-leadership',
    name: 'NAVI — Pre-change (Leadership)',
    description: 'Readiness and alignment: Navigate, Activate, Validate, Institutionalize (full leadership bank).',
    steps: [
      {
        title: 'N — Navigate Leadership Alignment',
        questions: [
          'Leadership has a clearly defined vision for this change.',
          'Leaders are aligned on the purpose and expected outcomes.',
          'Decision-making authority is clearly defined.',
          'Leaders are aligned on priorities and trade-offs.',
          'Executive sponsorship is visible and active.',
          'Leaders are prepared to address resistance.',
        ],
        pillars: repeat(6, 'N') as NaviPillar[],
      },
      {
        title: 'A — Activate Culture',
        questions: [
          'Employees understand why this change is necessary.',
          'There is trust in leadership to lead this change.',
          'Employees feel psychologically safe to express concerns.',
          'Change fatigue levels are manageable.',
          'Key influencers are supportive of the change.',
          'Communication about the change is clear and consistent.',
        ],
        pillars: repeat(6, 'A') as NaviPillar[],
      },
      {
        title: 'V — Validate Execution',
        questions: [
          'Adequate resources are allocated for this change.',
          'Systems and tools can support the change.',
          'Managers are capable of leading their teams through change.',
          'Risks and dependencies have been identified.',
          'There is a clear implementation roadmap.',
          'Accountability for execution is defined.',
        ],
        pillars: repeat(6, 'V') as NaviPillar[],
      },
      {
        title: 'I — Institutionalize Change (Forward-Looking)',
        questions: [
          'Success metrics for the change are clearly defined.',
          'Reinforcement mechanisms are planned.',
          'Ownership for sustaining the change is assigned.',
          'Performance measures will reflect the change.',
          'Policies and processes will be updated accordingly.',
        ],
        pillars: repeat(5, 'I') as NaviPillar[],
      },
    ],
  },
  {
    id: 'navi-during-change-leadership',
    name: 'NAVI — During-change (Leadership)',
    description: 'Adoption and execution tracking: leadership live signals, culture activation, execution, early institutionalization.',
    steps: [
      {
        title: 'N — Leadership Alignment (Live)',
        questions: [
          'Leaders are consistently communicating the change.',
          'Leaders are modeling the desired behaviors.',
          'Leadership messaging is aligned across levels.',
          'Leaders are making timely decisions.',
          'Leaders are visible and accessible during the change.',
        ],
        pillars: repeat(5, 'N') as NaviPillar[],
      },
      {
        title: 'A — Culture Activation (Adoption)',
        questions: [
          'Employees understand what is expected of them.',
          'Employees are actively engaging with the change.',
          'Resistance is being addressed effectively.',
          'Managers are reinforcing new behaviors.',
          'Employees feel supported during the transition.',
          'Communication remains clear and ongoing.',
        ],
        pillars: repeat(6, 'A') as NaviPillar[],
      },
      {
        title: 'V — Execution Validation',
        questions: [
          'Milestones are being achieved on time.',
          'Teams are executing tasks effectively.',
          'Systems and processes are functioning as expected.',
          'Issues are escalated and resolved quickly.',
          'There is accountability for delivery.',
          'Cross-functional collaboration is effective.',
        ],
        pillars: repeat(6, 'V') as NaviPillar[],
      },
      {
        title: 'I — Institutionalization (Early Signals)',
        questions: [
          'New behaviors are starting to become habits.',
          'Teams are adapting to new ways of working.',
          'Informal reinforcement is happening.',
          'Performance expectations reflect the change.',
          'Early wins are being recognized.',
        ],
        pillars: repeat(5, 'I') as NaviPillar[],
      },
    ],
  },
  {
    id: 'navi-post-change-leadership',
    name: 'NAVI — Post-change (Leadership)',
    description: 'Sustainability and impact: leadership, culture integration, execution stability, core institutionalization.',
    steps: [
      {
        title: 'N — Leadership Sustainability',
        questions: [
          'Leaders continue to reinforce the change.',
          'Leadership decisions reflect the new direction.',
          'Leaders hold teams accountable to new standards.',
          'Leadership transitions do not disrupt the change.',
        ],
        pillars: repeat(4, 'N') as NaviPillar[],
      },
      {
        title: 'A — Culture Integration',
        questions: [
          'New behaviors are consistently demonstrated.',
          'Employees identify with the new way of working.',
          'Old behaviors are no longer dominant.',
          'Engagement levels have improved or remained stable.',
        ],
        pillars: repeat(4, 'A') as NaviPillar[],
      },
      {
        title: 'V — Execution Stability',
        questions: [
          'Processes are consistently followed.',
          'KPIs show sustained improvement.',
          'Teams operate effectively under the new model.',
          'Operational efficiency has improved.',
        ],
        pillars: repeat(4, 'V') as NaviPillar[],
      },
      {
        title: 'I — Institutionalization (Core)',
        questions: [
          'The change is embedded in policies and SOPs.',
          'Performance management reflects the change.',
          'Recognition systems reinforce new behaviors.',
          'Training and onboarding reflects the new state.',
          'The change is considered “business as usual”.',
        ],
        pillars: repeat(5, 'I') as NaviPillar[],
      },
    ],
  },
  {
    id: 'navi-pre-change-employee',
    name: 'NAVI — Pre-change (Employee)',
    description: 'Employee readiness: perception of leadership, culture, execution readiness, and expectations for sustainment.',
    steps: [
      {
        title: 'N — Leadership Alignment (Employee Perception)',
        questions: [
          'I understand why this change is happening.',
          'Leadership has clearly communicated the purpose.',
          'I trust leadership to lead this change effectively.',
        ],
        pillars: repeat(3, 'N') as NaviPillar[],
      },
      {
        title: 'A — Culture Activation',
        questions: [
          'I feel open to this change.',
          'I understand how this change will impact me.',
          'I feel comfortable asking questions or raising concerns.',
          'I believe this change is necessary.',
        ],
        pillars: repeat(4, 'A') as NaviPillar[],
      },
      {
        title: 'V — Execution Readiness',
        questions: [
          'I understand what will be expected of me.',
          'I feel I will receive the training and support needed.',
          'I believe we have the tools to make this change successful.',
        ],
        pillars: repeat(3, 'V') as NaviPillar[],
      },
      {
        title: 'I — Institutionalization (Expectation)',
        questions: [
          'I believe this change will be sustained over time.',
          'I believe leadership will follow through.',
          'I believe this will become part of how we work.',
        ],
        pillars: repeat(3, 'I') as NaviPillar[],
      },
    ],
  },
  {
    id: 'navi-during-change-employee',
    name: 'NAVI — During-change (Employee)',
    description: 'Adoption reality: leadership visibility, personal experience, ability to execute, early habit signals.',
    steps: [
      {
        title: 'N — Leadership Visibility',
        questions: [
          'Leaders are visible during this change.',
          'Leaders are consistent in their messaging.',
          'Leaders are addressing concerns.',
        ],
        pillars: repeat(3, 'N') as NaviPillar[],
      },
      {
        title: 'A — Culture / Experience',
        questions: [
          'I feel supported during this change.',
          'I understand what I need to do differently.',
          'I feel confident in my ability to adapt.',
          'My concerns are being heard.',
        ],
        pillars: repeat(4, 'A') as NaviPillar[],
      },
      {
        title: 'V — Execution (Ability)',
        questions: [
          'I have the tools and resources I need.',
          'I have received sufficient training.',
          'I am able to apply the new way of working.',
          'Issues are resolved quickly.',
        ],
        pillars: repeat(4, 'V') as NaviPillar[],
      },
      {
        title: 'I — Institutionalization (Early Signals)',
        questions: [
          'The new way of working is becoming normal.',
          'My manager reinforces the change.',
          'I see others adopting the change.',
        ],
        pillars: repeat(3, 'I') as NaviPillar[],
      },
    ],
  },
  {
    id: 'navi-post-change-employee',
    name: 'NAVI — Post-change (Employee)',
    description: 'Sustainability reality: leadership continuity, culture integration, execution stability, embedded ways of working.',
    steps: [
      {
        title: 'N — Leadership Continuity',
        questions: [
          'Leaders continue to reinforce this change.',
          'Leadership actions reflect the change.',
        ],
        pillars: repeat(2, 'N') as NaviPillar[],
      },
      {
        title: 'A — Culture Integration',
        questions: [
          'The new way of working feels natural.',
          'I no longer rely on old processes.',
          'I feel confident in the new way of working.',
        ],
        pillars: repeat(3, 'A') as NaviPillar[],
      },
      {
        title: 'V — Execution Stability',
        questions: [
          'I can consistently perform under the new model.',
          'Processes are clear and effective.',
          'Work feels more efficient.',
        ],
        pillars: repeat(3, 'V') as NaviPillar[],
      },
      {
        title: 'I — Institutionalization',
        questions: [
          'This change is now “how we work”.',
          'New employees are trained in this way.',
          'The organization reinforces this consistently.',
        ],
        pillars: repeat(3, 'I') as NaviPillar[],
      },
    ],
  },
  {
    id: 'navi-culture-pulse',
    name: 'NAVI — Culture pulse (short)',
    description: 'Quick culture and alignment pulse (4 questions).',
    steps: [
      {
        title: 'Pulse',
        questions: [
          'Leaders are aligned on priorities for this change.',
          'Employees feel psychologically safe to express concerns.',
          'Tools and systems can support the change.',
          'Policies and processes will be updated to reflect the change.',
        ],
        pillars: ['N', 'A', 'V', 'I'],
      },
    ],
  },
  {
    id: 'navi-risk-readiness',
    name: 'NAVI — Risk & readiness',
    description: 'Focus on execution risk and leadership alignment.',
    steps: [
      {
        title: 'Risk & readiness',
        questions: [
          'Risks and dependencies have been identified.',
          'Accountability for execution is defined.',
          'Change fatigue levels are manageable.',
          'Key influencers are supportive of the change.',
        ],
        pillars: ['V', 'V', 'A', 'A'],
      },
    ],
  },
];
