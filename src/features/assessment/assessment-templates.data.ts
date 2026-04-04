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

/** Pre-change leadership-style NAVI template (condensed from UAT question bank). */
export const NAVI_ASSESSMENT_TEMPLATES: AssessmentTemplateDef[] = [
  {
    id: 'navi-pre-change-leadership',
    name: 'NAVI — Pre-change (Leadership)',
    description: 'Readiness and alignment across Navigate, Activate, Validate, and Institutionalize pillars.',
    steps: [
      {
        title: 'N — Navigate (Leadership alignment)',
        questions: [
          'Leadership has a clearly defined vision for this change.',
          'Leaders are aligned on the purpose and expected outcomes.',
          'Executive sponsorship is visible and active.',
        ],
        pillars: ['N', 'N', 'N'],
      },
      {
        title: 'A — Activate (Culture)',
        questions: [
          'Employees understand why this change is necessary.',
          'There is trust in leadership to lead this change.',
          'Communication about the change is clear and consistent.',
        ],
        pillars: ['A', 'A', 'A'],
      },
      {
        title: 'V — Validate (Execution)',
        questions: [
          'Adequate resources are allocated for this change.',
          'Managers are capable of leading their teams through change.',
          'There is a clear implementation roadmap.',
        ],
        pillars: ['V', 'V', 'V'],
      },
      {
        title: 'I — Institutionalize',
        questions: [
          'Success metrics for the change are clearly defined.',
          'Ownership for sustaining the change is assigned.',
          'Reinforcement mechanisms are planned.',
        ],
        pillars: ['I', 'I', 'I'],
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
