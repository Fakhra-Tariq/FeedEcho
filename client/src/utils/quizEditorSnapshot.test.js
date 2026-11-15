import { serializeQuizEditorSnapshot } from './quizEditorSnapshot';

describe('serializeQuizEditorSnapshot', () => {
  it('ignores ids and treats equivalent MCQ shapes as equal', () => {
    const a = serializeQuizEditorSnapshot({
      title: '  Demo ',
      quizType: 'Multiple Choice',
      questions: [
        {
          id: 1,
          questionText: 'Q1',
          options: [
            { id: 'a', text: 'A', isCorrect: true },
            { id: 'b', text: 'B', isCorrect: false },
          ],
        },
      ],
    });
    const b = serializeQuizEditorSnapshot({
      title: 'Demo',
      quizType: 'Multiple Choice',
      questions: [
        {
          id: 99,
          questionText: 'Q1',
          options: [
            { id: 'x', text: 'A', isCorrect: true },
            { id: 'y', text: 'B', isCorrect: false },
          ],
        },
      ],
    });
    expect(a).toBe(b);
  });

  it('detects a title change as dirty', () => {
    const base = { quizType: 'Short Answer', questions: [{ questionText: 'Q', sampleAnswer: 'A' }] };
    const a = serializeQuizEditorSnapshot({ ...base, title: 'One' });
    const b = serializeQuizEditorSnapshot({ ...base, title: 'Two' });
    expect(a).not.toBe(b);
  });
});
