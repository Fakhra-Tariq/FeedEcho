/** Easy to extend. Used only in "Each word" mode for Short Text. */
export const EXIT_TICKET_STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'and',
  'or',
  'of',
  'to',
  'in',
  'it',
  'this',
  'that',
  'was',
  'be',
  'i',
  'we',
  'you',
  'bit',
  'etc',
]);

const WORD_TOKEN_RE = /[\p{L}\p{N}]+/gu;

const optionText = (option) => {
  if (option == null) return '';
  if (typeof option === 'string') return option.trim();
  return String(option.text || option.label || option.id || '').trim();
};

export function normalizeExitTicketQuestionType(raw) {
  const t = String(raw || 'short_text')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (t === 'shorttext') return 'short_text';
  if (t === 'multiplechoice' || t === 'mcq') return 'multiple_choice';
  if (t === 'truefalse' || t === 'true/false') return 'true_false';
  return t || 'short_text';
}

export function getExitTicketQuestionOptions(question) {
  const type = normalizeExitTicketQuestionType(question?.type);
  if (type === 'true_false') return ['True', 'False'];
  if (type === 'likert') {
    const fromQuestion = Array.isArray(question?.options)
      ? question.options.map(optionText).filter(Boolean)
      : [];
    if (fromQuestion.length) return fromQuestion;
    return ['Strongly Agree', 'Agree', 'Neutral', 'Disagree', 'Strongly Disagree'];
  }
  if (type === 'multiple_choice') {
    return (Array.isArray(question?.options) ? question.options : []).map(optionText).filter(Boolean);
  }
  return [];
}

export function getResponseAnswerAt(response, index) {
  const answers = response?.answers;
  if (Array.isArray(answers)) {
    const byIndex = answers[index];
    if (byIndex && typeof byIndex === 'object' && 'answer' in byIndex) return byIndex.answer;
    const byQ = answers.find((row) => Number(row?.questionIndex) === Number(index));
    if (byQ && typeof byQ === 'object' && 'answer' in byQ) return byQ.answer;
    return byIndex;
  }
  if (answers && typeof answers === 'object') {
    const row = answers[index] || answers[String(index)];
    if (row && typeof row === 'object' && 'answer' in row) return row.answer;
    return row;
  }
  return null;
}

export function resolveExitTicketAnswerLabel(answer, question) {
  if (answer == null || answer === '') return '';
  const raw =
    typeof answer === 'object' ? optionText(answer) : String(answer).trim();
  if (!raw) return '';
  const options = getExitTicketQuestionOptions(question);
  if (!options.length) return raw;
  const asNum = Number(raw);
  if (
    Number.isInteger(asNum) &&
    String(raw).trim() === String(asNum) &&
    options[asNum]
  ) {
    return options[asNum];
  }
  const matched = options.find(
    (opt) => opt.toLowerCase() === raw.toLowerCase()
  );
  return matched || raw;
}

export function extractWordTokens(text) {
  const raw = String(text || '');
  const tokens = raw.match(WORD_TOKEN_RE);
  return tokens || [];
}

const pickDisplayForm = (forms) => {
  let best = '';
  let bestCount = -1;
  forms.forEach((n, form) => {
    if (n > bestCount || (n === bestCount && form.length > best.length)) {
      best = form;
      bestCount = n;
    }
  });
  return best;
};

const addItem = (map, key, display) => {
  let entry = map.get(key);
  if (!entry) {
    entry = { key, count: 0, forms: new Map() };
    map.set(key, entry);
  }
  entry.count += 1;
  entry.forms.set(display, (entry.forms.get(display) || 0) + 1);
};

export function buildExitTicketWordCloudItems({
  texts,
  mode = 'words',
} = {}) {
  const map = new Map();
  (texts || []).forEach((text) => {
    if (mode === 'words') {
      extractWordTokens(text).forEach((token) => {
        if (token.length <= 1) return;
        const key = token.toLowerCase();
        if (EXIT_TICKET_STOP_WORDS.has(key)) return;
        addItem(map, key, token);
      });
      return;
    }
    const collapsed = String(text || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!collapsed) return;
    addItem(map, collapsed.toLowerCase(), collapsed);
  });

  return Array.from(map.values())
    .map((entry) => ({
      key: entry.key,
      label: pickDisplayForm(entry.forms),
      count: entry.count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const WORD_CLOUD_MAX_ITEMS = 60;

export function capWordCloudItems(items, max = WORD_CLOUD_MAX_ITEMS) {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= max) return { items: list, extra: 0 };
  return { items: list.slice(0, max), extra: list.length - max };
}
