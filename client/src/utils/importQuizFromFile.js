/**
 * Extract text from an uploaded quiz file and parse questions from that text.
 * Supports the same plain-text formats as Copy & Paste.
 */

import { getQuizTypeMismatchError } from './detectQuizContentType';

const readFileAsArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });

const getExtension = (fileName = '') => {
  const parts = String(fileName).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const extractTextFromPdf = async (arrayBuffer) => {
  const pdfjsModule = await import('pdfjs-dist/build/pdf');
  const pdfjs = pdfjsModule.default || pdfjsModule;
  // CDN worker avoids CRA bundler issues with pdf.worker
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    // Rebuild lines using transform Y when available
    let lastY = null;
    const lineParts = [];
    const lines = [];
    content.items.forEach((item) => {
      const y = item.transform ? item.transform[5] : null;
      if (lastY != null && y != null && Math.abs(y - lastY) > 2) {
        lines.push(lineParts.join(' ').trim());
        lineParts.length = 0;
      }
      if (item.str) lineParts.push(item.str);
      if (y != null) lastY = y;
    });
    if (lineParts.length) lines.push(lineParts.join(' ').trim());
    pages.push(lines.filter(Boolean).join('\n'));
  }

  return pages.filter(Boolean).join('\n');
};

const extractTextFromDocx = async (arrayBuffer) => {
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule.default || mammothModule;
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result?.value || '';
};

const extractTextFromSpreadsheet = async (arrayBuffer) => {
  const xlsxModule = await import('xlsx');
  const XLSX = xlsxModule.default || xlsxModule;
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const lines = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    rows.forEach((row) => {
      if (!Array.isArray(row)) return;
      const cells = row.map((cell) => String(cell ?? '').trim()).filter(Boolean);
      if (cells.length) lines.push(cells.join(' '));
    });
  });

  return lines.join('\n');
};

/** Normalize PDF/DOCX text so numbered questions and options land on separate lines. */
export const normalizeExtractedQuizText = (rawText = '') => {
  let text = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Ensure question numbers start on a new line
  text = text.replace(/([^\n])\s+(\d+\.\s+)/g, '$1\n$2');
  // Ensure A) B) C) D) options start on new lines
  text = text.replace(/([^\n])\s+([A-D]\))/gi, '$1\n$2');
  // Ensure Answer / Sample Answer markers start on new lines (optional spaces before :)
  text = text.replace(/([^\n])\s+(Answer\s*:)/gi, '$1\n$2');
  text = text.replace(/([^\n])\s+(Sample\s+Answer\s*:)/gi, '$1\n$2');
  text = text.replace(/([^\n])\s+(Expected\s+Answer\s*:)/gi, '$1\n$2');
  text = text.replace(/([^\n])\s+(Correct\s+Answer\s*:)/gi, '$1\n$2');
  // Mixed-type tags
  text = text.replace(
    /([^\n])\s*(\[(?:MCQ|TRUE\s*\/\s*FALSE|SHORT\s*ANSWER|LONG\s*ANSWER)\])/gi,
    '$1\n$2'
  );
  text = text.replace(
    /(\[(?:MCQ|TRUE\s*\/\s*FALSE|SHORT\s*ANSWER|LONG\s*ANSWER)\])\s*/gi,
    '$1\n'
  );

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
};

export async function extractTextFromQuizFile(file) {
  if (!file) throw new Error('No file provided');

  const ext = getExtension(file.name);

  if (ext === 'txt') {
    return normalizeExtractedQuizText(await readFileAsText(file));
  }

  if (ext === 'doc') {
    throw new Error(
      'Legacy .doc files are not supported. Please save as .docx or .txt and try again.'
    );
  }

  const buffer = await readFileAsArrayBuffer(file);

  if (ext === 'pdf') {
    return normalizeExtractedQuizText(await extractTextFromPdf(buffer));
  }

  if (ext === 'docx') {
    return normalizeExtractedQuizText(await extractTextFromDocx(buffer));
  }

  if (ext === 'xls' || ext === 'xlsx') {
    return normalizeExtractedQuizText(await extractTextFromSpreadsheet(buffer));
  }

  // Fallback: try as plain text
  return normalizeExtractedQuizText(await readFileAsText(file));
}

const parseMultipleChoice = (lines) => {
  const questions = [];
  let currentQuestion = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/^\d+\./.test(line)) {
      if (currentQuestion) questions.push(currentQuestion);
      currentQuestion = {
        id: Date.now() + questions.length,
        questionText: line.replace(/^\d+\.\s*/, ''),
        options: [
          { id: 'a', text: '', isCorrect: false },
          { id: 'b', text: '', isCorrect: false },
          { id: 'c', text: '', isCorrect: false },
          { id: 'd', text: '', isCorrect: false },
        ],
      };
    } else if (/^[A-D]\)/i.test(line) && currentQuestion) {
      const optionId = line[0].toLowerCase();
      const optionText = line.replace(/^[A-D]\)\s*/i, '');
      const optionIndex = optionId.charCodeAt(0) - 97;
      if (optionIndex < 4) {
        currentQuestion.options[optionIndex].text = optionText;
      }
    } else if (/^answer:\s*/i.test(line) && currentQuestion) {
      const letter = line.replace(/^answer:\s*/i, '').trim().charAt(0).toLowerCase();
      if (letter >= 'a' && letter <= 'd') {
        currentQuestion.options.forEach((opt) => {
          opt.isCorrect = opt.id === letter;
        });
      }
    }
  }

  if (currentQuestion) questions.push(currentQuestion);
  return questions;
};

const parseTrueFalse = (lines) => {
  const questions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!/^\d+\./.test(line)) continue;

    const questionText = line.replace(/^\d+\.\s*/, '');
    let correctAnswer = null;

    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const nextLine = lines[j].trim().toLowerCase();
      if (nextLine.includes('answer:')) {
        if (nextLine.includes('true')) correctAnswer = 'true';
        else if (nextLine.includes('false')) correctAnswer = 'false';
        break;
      }
    }

    questions.push({
      id: Date.now() + questions.length,
      questionText,
      correctAnswer,
    });
  }

  return questions;
};

/**
 * Extract Sample / Expected Answer for a Short Answer question.
 * Accepts common file labels (Answer / Sample Answer / Expected Answer / Correct Answer)
 * and optional spaces around the colon (common in PDF text extraction).
 * Scans until the next numbered question so wrapped PDF lines are not missed.
 */
const SHORT_ANSWER_MARKER =
  /^(?:sample\s*answer|expected\s*answer|correct\s*answer|answer)\s*:\s*(.*)$/i;

const extractShortAnswerValue = (lines, questionIndex) => {
  for (let j = questionIndex + 1; j < lines.length; j++) {
    const nextLine = String(lines[j] || '').trim();
    if (!nextLine) continue;
    // Stop at the next question
    if (/^\d+\.\s*/.test(nextLine)) break;

    const match = nextLine.match(SHORT_ANSWER_MARKER);
    if (!match) continue;

    let sampleAnswer = String(match[1] || '').trim();
    // PDF often puts the value on the following line after "Sample Answer :"
    if (!sampleAnswer) {
      for (let k = j + 1; k < lines.length; k++) {
        const following = String(lines[k] || '').trim();
        if (!following) continue;
        if (/^\d+\.\s*/.test(following) || SHORT_ANSWER_MARKER.test(following)) break;
        sampleAnswer = following;
        break;
      }
    }
    return sampleAnswer;
  }
  return '';
};

const parseShortAnswer = (lines) => {
  const questions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!/^\d+\./.test(line)) continue;

    const questionText = line.replace(/^\d+\.\s*/, '').trim();
    const sampleAnswer = extractShortAnswerValue(lines, i);

    questions.push({
      id: Date.now() + questions.length,
      questionText,
      sampleAnswer,
      // Keep both keys so editor normalization always finds the expected answer
      correctAnswer: sampleAnswer,
    });
  }

  return questions;
};

const normalizeMixedTag = (raw) => {
  const key = String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (key === 'MCQ' || key === 'MULTIPLE CHOICE') return 'MCQ';
  if (key === 'TRUE/FALSE' || key === 'TRUE / FALSE' || key === 'T/F') return 'TRUE/FALSE';
  if (key === 'SHORT ANSWER' || key === 'SHORTANSWER') return 'SHORT ANSWER';
  if (key === 'LONG ANSWER' || key === 'LONGANSWER') return 'LONG ANSWER';
  return null;
};

const parseMixedMultipleChoice = (lines) => {
  const questions = [];
  let currentQuestion = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\d+\./.test(line)) {
      if (currentQuestion) questions.push(currentQuestion);
      currentQuestion = {
        id: Date.now() + questions.length,
        type: 'multiple-choice',
        questionText: line.replace(/^\d+\.\s*/, ''),
        options: ['', '', '', ''],
        correctAnswer: 0,
      };
    } else if (/^[A-D]\)/i.test(line) && currentQuestion) {
      const optionIndex = line[0].toUpperCase().charCodeAt(0) - 65;
      const optionText = line.replace(/^[A-D]\)\s*/i, '');
      if (optionIndex >= 0 && optionIndex < 4) {
        currentQuestion.options[optionIndex] = optionText;
      }
    } else if (/^answer:\s*/i.test(line) && currentQuestion) {
      const letter = line.replace(/^answer:\s*/i, '').trim().charAt(0).toUpperCase();
      if (letter >= 'A' && letter <= 'D') {
        currentQuestion.correctAnswer = letter.charCodeAt(0) - 65;
      }
    }
  }

  if (currentQuestion) questions.push(currentQuestion);
  return questions;
};

const parseMixedTrueFalse = (lines) => {
  const questions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\d+\./.test(line)) continue;

    const questionText = line.replace(/^\d+\.\s*/, '');
    let correctAnswer = true;

    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const nextLine = lines[j].toLowerCase();
      if (nextLine.includes('answer:')) {
        if (nextLine.includes('false')) correctAnswer = false;
        else if (nextLine.includes('true')) correctAnswer = true;
        break;
      }
    }

    questions.push({
      id: Date.now() + questions.length,
      type: 'true-false',
      questionText,
      correctAnswer,
    });
  }

  return questions;
};

const parseMixedShortAnswer = (lines) => {
  const questions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!/^\d+\./.test(line)) continue;

    const questionText = line.replace(/^\d+\.\s*/, '').trim();
    // Same extraction as standalone Short Answer import
    const sampleAnswer = extractShortAnswerValue(lines, i);

    questions.push({
      id: Date.now() + questions.length,
      type: 'short-answer',
      questionText,
      sampleAnswer,
      // Keep both keys so Mixed Type editor normalization finds the expected answer
      correctAnswer: sampleAnswer,
    });
  }

  return questions;
};

const parseMixedType = (content) => {
  const questions = [];
  const tagRegex =
    /\[\s*(MCQ|MULTIPLE\s+CHOICE|TRUE\s*\/\s*FALSE|T\/F|SHORT\s*ANSWER|LONG\s*ANSWER)\s*\]/gi;
  const sections = [];
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    const kind = normalizeMixedTag(match[1]);
    if (!kind) continue;
    sections.push({
      kind,
      bodyStart: match.index + match[0].length,
      tagStart: match.index,
    });
  }

  if (sections.length === 0) return [];

  for (let i = 0; i < sections.length; i++) {
    const { kind, bodyStart } = sections[i];
    if (kind === 'LONG ANSWER') continue;

    const bodyEnd = i + 1 < sections.length ? sections[i + 1].tagStart : content.length;
    const lines = content
      .slice(bodyStart, bodyEnd)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (kind === 'MCQ') questions.push(...parseMixedMultipleChoice(lines));
    else if (kind === 'TRUE/FALSE') questions.push(...parseMixedTrueFalse(lines));
    else if (kind === 'SHORT ANSWER') questions.push(...parseMixedShortAnswer(lines));
  }

  return questions;
};

/** Parse quiz questions from extracted file text for the selected type. */
export function parseImportedQuizContent(content, type) {
  const text = String(content || '').trim();
  if (!text) return [];

  if (type === 'Mixed Type') {
    return parseMixedType(text);
  }

  const lines = text.split('\n').filter((line) => line.trim());

  switch (type) {
    case 'Multiple Choice':
      return parseMultipleChoice(lines);
    case 'True / False':
      return parseTrueFalse(lines);
    case 'Short Answer':
      return parseShortAnswer(lines);
    default:
      return [];
  }
}

/** Full import pipeline: read file → extract text → validate type → parse questions. */
export async function importQuestionsFromFile(file, type) {
  const text = await extractTextFromQuizFile(file);
  if (!text.trim()) {
    throw new Error('No readable text found in the uploaded file.');
  }

  const mismatchError = getQuizTypeMismatchError(text, type, 'uploaded');
  if (mismatchError) {
    throw new Error(mismatchError);
  }

  const questions = parseImportedQuizContent(text, type);
  return { text, questions };
}
