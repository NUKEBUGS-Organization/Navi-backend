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

/** Full NAVI / change readiness bank (aligned with application assessment form categories). */
export const NAVI_ASSESSMENT_TEMPLATES: AssessmentTemplateDef[] = [
  {
    id: 'navi-pre-change-leadership',
    name: 'NAVI — Pre-change (Leadership)',
    description:
      'Full readiness assessment: leadership, communication, stakeholders, resources, process & systems, and culture (NAVI-scored).',
    steps: [
      {
        title: 'Leadership Alignment',
        questions: [
          'To what extent has the leadership team communicated a shared vision for this change?',
          'How visible is executive sponsorship for the initiative across the organization?',
          'How well do leaders model the behaviors expected from the change?',
        ],
        pillars: ['N', 'N', 'N'],
      },
      {
        title: 'Communication Readiness',
        questions: [
          'How clear is the messaging about why this change is needed?',
          'How often do employees receive updates on the initiative?',
          'How well are different channels (email, meetings, etc.) used for communication?',
          'To what extent do employees feel they can ask questions about the change?',
          'How consistent is the change narrative across leaders?',
          'How well are milestones and successes communicated?',
          'How accessible is information about the change to frontline staff?',
          'How would you rate the overall change communication plan?',
        ],
        pillars: repeat(8, 'A') as NaviPillar[],
      },
      {
        title: 'Stakeholder Engagement',
        questions: [
          'How well have key stakeholders been identified?',
          'How engaged are resistant stakeholders in the change process?',
          'How effective are the feedback mechanisms for stakeholders?',
          'To what extent are stakeholder concerns being addressed?',
          'How strong are the relationships between the change team and key stakeholders?',
        ],
        pillars: repeat(5, 'N') as NaviPillar[],
      },
      {
        title: 'Resource Availability',
        questions: [
          'How adequate is the budget allocated for this initiative?',
          'How available are key people to work on the change?',
          'How well do teams have the skills needed for the change?',
          'How realistic is the timeline given other priorities?',
          'How sufficient are tools and technology to support the change?',
        ],
        pillars: repeat(5, 'V') as NaviPillar[],
      },
      {
        title: 'Process & Systems Readiness',
        questions: [
          'How well are current processes documented?',
          'How ready are systems for the planned changes?',
          'How clear are the process change requirements?',
          'How integrated are the systems that need to work together?',
          'How well do workflows support the new way of working?',
        ],
        pillars: repeat(5, 'V') as NaviPillar[],
      },
      {
        title: 'Cultural Readiness',
        questions: [
          'How open is the culture to trying new approaches?',
          'How strong is psychological safety for voicing concerns?',
          'How well does the culture support collaboration across teams?',
          'To what extent do employees feel ownership of the change?',
          'How aligned is the culture with the desired future state?',
        ],
        pillars: ['A', 'A', 'A', 'I', 'I'],
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
