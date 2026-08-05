import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Filter,
  LineChart,
  PlayCircle,
  PlusCircle,
  Timer,
  ListChecks,
  FileDown,
  Layers,
} from 'lucide-react';
import clsx from 'clsx';
import { useHostData } from '../contexts/HostDataContext';

const statusFilters = ['All', 'draft', 'active', 'completed'];

const HostQuizzes = () => {
  const { data, updateQuizStatus, launchQuiz, endActiveSession, createQuiz } = useHostData();
  const [filter, setFilter] = useState('All');

  const filteredQuizzes = useMemo(() => {
    console.log('Filtering quizzes. Current filter:', filter);
    console.log('Total quizzes available:', data.quizzes.length);
    console.log('Quiz statuses:', data.quizzes.map(q => ({ id: q.id, title: q.title, status: q.status })));
    
    if (filter === 'All') {
      console.log('Showing all quizzes');
      return data.quizzes;
    }
    
    const filtered = data.quizzes.filter((quiz) => {
      const matches = quiz.status === filter;
      console.log(`Quiz "${quiz.title}" status "${quiz.status}" matches filter "${filter}": ${matches}`);
      return matches;
    });
    
    console.log('Filtered quizzes count:', filtered.length);
    return filtered;
  }, [data.quizzes, filter]);

  const quizzesByStatus = useMemo(() => {
    const buckets = { draft: 0, active: 0, completed: 0 };
    data.quizzes.forEach((quiz) => {
      if (buckets[quiz.status] !== undefined) {
        buckets[quiz.status] += 1;
      }
    });
    return buckets;
  }, [data.quizzes]);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-widest">Quizzes</p>
          <h1 className="mt-2 text-3xl font-semibold text-text">Every quiz in one productivity hub</h1>
          <p className="mt-2 text-text-light max-w-2xl">
            Track drafts, ready-to-go launches, live sessions, and historical results. Promote drafts to ready, launch instantly, or archive when finished.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            onClick={() => {
              const quiz = createQuiz({
                title: 'Untitled Quiz',
                description: 'Add instructions here.',
                status: 'Draft',
                questionCount: 3,
              });
              updateQuizStatus(quiz.id, 'Draft');
            }}
          >
            <PlusCircle className="w-4 h-4" /> New quiz draft
          </button>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            onClick={() => setFilter('Draft')}
          >
            <Filter className="w-4 h-4" /> Focus drafts
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatusMetric label="Draft" value={quizzesByStatus.Draft} tone="neutral" />
        <StatusMetric label="Ready" value={quizzesByStatus.Ready} tone="primary" />
        <StatusMetric label="Active" value={quizzesByStatus.Active} tone="accent" />
        <StatusMetric label="Ended" value={quizzesByStatus.Ended} tone="secondary" />
      </section>

      <section className="border border-gray-200 rounded-2xl p-6 bg-white shadow-soft">
        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-text">Manage quizzes</h2>
              <p className="text-sm text-text-light">Filter by status to find the right quiz faster.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {statusFilters.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={clsx(
                  'px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors',
                  option === filter
                    ? 'bg-primary/10 border-primary/20 text-primary'
                    : 'border-gray-200 text-text-light hover:border-primary/30'
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </header>

        {filteredQuizzes.length === 0 ? (
          <EmptyState
            icon={Filter}
            title={`No quizzes in ${filter.toLowerCase()} status`}
            description="Adjust filters or create a new quiz draft."
          />
        ) : (
          <div className="space-y-3">
            {filteredQuizzes.map((quiz) => (
              <QuizRow
                key={quiz.id}
                quiz={quiz}
                activeSession={data.activeSession}
                onLaunch={() => launchQuiz(quiz.id)}
                onEnd={endActiveSession}
                onPromote={() => updateQuizStatus(quiz.id, 'Ready')}
                onArchive={() => updateQuizStatus(quiz.id, 'Ended')}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const StatusMetric = ({ label, value, tone }) => {
  const chipClasses = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/10 text-secondary',
    accent: 'bg-yellow-400/10 text-yellow-500',
    neutral: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-light">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
        </div>
        <span className={clsx('inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold', chipClasses[tone] || chipClasses.neutral)}>
          <LineChart className="w-4 h-4" /> trend
        </span>
      </div>
    </div>
  );
};

const QuizRow = ({ quiz, activeSession, onLaunch, onEnd, onPromote, onArchive }) => {
  const isActive = activeSession?.type === 'quiz' && activeSession.quizId === quiz.id;
  const isDraft = quiz.status === 'Draft';
  const isReady = quiz.status === 'Ready';
  const isEnded = quiz.status === 'Ended';

  return (
    <div className="border border-gray-200 rounded-2xl p-4 bg-white">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-text">{quiz.title}</h3>
            <span
              className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
                statusChip(quiz.status)
              )}
            >
              {quiz.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-light">{quiz.description || 'No description added yet.'}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-light">
            <Badge icon={Timer} label={`${quiz.timer ?? 5} min`} />
            <Badge icon={ListChecks} label={`${quiz.questionCount ?? quiz.questions?.length ?? 0} questions`} />
            {quiz.avgScore !== null && <Badge icon={CheckCircle2} label={`Avg ${quiz.avgScore}%`} />}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <button type="button" className="btn-secondary" onClick={onPromote}>
              Mark ready
            </button>
          )}
          {isReady && (
            <button type="button" className="btn-primary" onClick={onLaunch}>
              Launch
            </button>
          )}
          {isActive && (
            <button type="button" className="btn-secondary" onClick={onEnd}>
              End active quiz
            </button>
          )}
          {!isEnded && (
            <button type="button" className="btn-secondary" onClick={onArchive}>
              Archive
            </button>
          )}
          <button type="button" className="btn-secondary">
            <FileDown className="w-4 h-4" /> Export
          </button>
        </div>
      </div>
    </div>
  );
};

const Badge = ({ icon: Icon, label }) => (
  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-xs font-semibold">
    <Icon className="w-4 h-4" />
    {label}
  </span>
);

const EmptyState = ({ icon: Icon, title, description }) => (
  <div className="text-center py-10 border border-dashed border-gray-300 rounded-xl">
    <Icon className="w-10 h-10 mx-auto text-gray-300" />
    <p className="mt-4 text-sm font-semibold text-text">{title}</p>
    <p className="mt-1 text-xs text-text-light">{description}</p>
  </div>
);

const statusChip = (status) => {
  switch (status) {
    case 'Ready':
      return 'bg-primary/10 text-primary';
    case 'Draft':
      return 'bg-gray-100 text-gray-600';
    case 'Active':
      return 'bg-primary/10 text-primary';
    case 'Ended':
      return 'bg-secondary/10 text-secondary';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

export default HostQuizzes;
