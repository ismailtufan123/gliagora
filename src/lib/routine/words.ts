import { MIN_DAYS_LEFT, OPEN_ENDED_RECENT_DAYS } from './rules'

// The decision rules of "Update the jobs" (D59) as the export gives them to Claude Code, in the
// words of docs/update-jobs.md, which explains each.

export const DECISION_RULES = [
  `publish only when every one of these holds: the post is in neuroscience; it is a research or research-support position (researchers, students, postdocs, faculty with research, technicians, lab and core-facility staff, research coordinators, data and software staff of a lab) at a research employer; its deadline is at least ${MIN_DAYS_LEFT} days ahead, or it is rolling or open until filled and was published in the last ${OPEN_ENDED_RECENT_DAYS} days; it is on the employer's own posting page; its institution is the one where the work happens; its facts (type, deadline, place, subfields) agree with the text; nothing that would be published (the title, the summary, the start) names a person or gives an email address, a phone number or a web address.`,
  'reject what clearly fails, with the review queue\'s reasons: "not-neuroscience", "not-research" (administrative, nursing, clinical-only, teaching-only, business roles), "closed" (deadline passed), "not-a-position" (news, events, admissions, open applications, calls for participants), "not-employer-page", "agency-or-intermediary", "other" (say why).',
  'ask the operator about anything uncertain, with one short question: a borderline field, a deadline the text does not settle, a title that names a person, an institution none of ours fits, a possible duplicate.',
  'every decision has one line saying why ("why"), in plain words, without the posting\'s text and without names.',
  'when the draft is wrong, correct it in the decision (deadline, place, summary, tags, language, start) from the text; never invent a fact the text does not give.',
  'the institution: on a source whose postings are at several sites (severalSites), always name the institution where the work happens (search ours by name); elsewhere only when the posting says the work is at another institution than the one given.',
  'the operator\'s word ("publish it", "reject it") is a decision with byOperator: true; it still never publishes a name, an email address, a phone number, a passed deadline or a page that is gone or says the position is closed.',
]
