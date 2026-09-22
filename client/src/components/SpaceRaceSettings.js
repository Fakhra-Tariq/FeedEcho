import React, { useState } from 'react';
import { X, Trash2, Users, Clock, Trophy, Check } from 'lucide-react';
import { copyToClipboard } from '../utils/copyToClipboard';
import { toParticipantCount } from '../utils/toParticipantCount';
import {
  DURATION_MISMATCH_MSG,
  isJoinShorterThanQuiz,
} from '../utils/spaceRaceDuration';

const SpaceRaceSettings = ({ race, onClose, onDelete, onUpdate }) => {
  const [settings, setSettings] = useState({
    numberOfTeams: race.settings?.numberOfTeams || 2,
    studentsPerTeam: Math.min(race.settings?.studentsPerTeam || 5, 6),
    teamAssignment: race.settings?.teamAssignment || race.teamAssignment || 'auto-assign',
    icon: race.settings?.icon || 'rocket',
    countdown: race.settings?.countdown || 300, // Default 5 minutes (300 seconds)
    joinDuration: race.settings?.joinDuration || 30, // Default 30 minutes
    shuffleQuestions: race.settings?.shuffleQuestions !== undefined ? race.settings.shuffleQuestions : false,
    shuffleAnswers: race.settings?.shuffleAnswers !== undefined ? race.settings.shuffleAnswers : false,
    showQuestionFeedback: race.settings?.showQuestionFeedback !== undefined ? race.settings.showQuestionFeedback : false,
    showFinalScore: race.settings?.showFinalScore !== undefined ? race.settings.showFinalScore : false,
  });
  const [copied, setCopied] = useState(false);
  const [showCopyNotification, setShowCopyNotification] = useState(false);

  const durationInvalid = isJoinShorterThanQuiz(settings.joinDuration, settings.countdown);

  const handleSave = async () => {
    if (isJoinShorterThanQuiz(settings.joinDuration, settings.countdown)) {
      return;
    }
    const raceId = race?.id || race?.raceId;
    await onUpdate(raceId, { settings });
    onClose();
  };

  const handleDelete = () => {
    const raceId = race?.id || race?.raceId;
    onDelete(raceId);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto overflow-x-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 min-w-0 break-words">Space Race Settings</h2>
            <button
              onClick={onClose}
              className="p-2 min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 sm:px-6 py-4 space-y-4">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Race Code Section */}
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
              <h3 className="font-medium text-primary mb-2">Race Code</h3>
              <div className="flex items-center space-x-3 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="bg-white border border-primary/40 rounded px-4 py-2 font-mono text-lg text-primary font-bold break-all">
                    {race.joinCode || race.accessCode || 'No code available'}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const code = race.joinCode || race.accessCode;
                    if (code) {
                      const ok = await copyToClipboard(code);
                      if (ok) {
                        setCopied(true);
                        setShowCopyNotification(true);
                        setTimeout(() => setCopied(false), 2000);
                        setTimeout(() => setShowCopyNotification(false), 3000);
                      }
                    }
                  }}
                  className="px-3 py-2 min-h-11 shrink-0 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                  disabled={!(race.joinCode || race.accessCode)}
                >
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
              <p className="text-sm text-primary/80 mt-2">
                This is the original launch code generated when the race was created.
              </p>
            </div>

            {/* Race Info */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h3 className="font-medium text-gray-900 mb-1 break-words">{race.title}</h3>
              <p className="text-sm text-gray-600 break-words">{race.description}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-gray-500">
                <div className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>{toParticipantCount(race.participantsCount, race.participants)} participants</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>{race.timerMinutes ? `${race.timerMinutes} min` : 'No limit'}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Trophy className="w-4 h-4" />
                  <span>{race.settings?.numberOfTeams || race.teamsCount || 2} teams</span>
                </div>
              </div>
            </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-start">
              <div className="max-md:order-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Teams
                </label>
                <select
                  value={settings.numberOfTeams}
                  onChange={(e) => setSettings({ ...settings, numberOfTeams: parseInt(e.target.value) })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-lg"
                >
                  <option value={2}>2 Teams</option>
                  <option value={3}>3 Teams</option>
                  <option value={4}>4 Teams</option>
                  <option value={5}>5 Teams</option>
                  <option value={6}>6 Teams</option>
                  <option value={7}>7 Teams</option>
                  <option value={8}>8 Teams</option>
                  <option value={9}>9 Teams</option>
                  <option value={10}>10 Teams</option>
                </select>
              </div>

              <div className={`${settings.teamAssignment === 'student-choice' ? 'md:row-span-3' : 'md:row-span-2'} max-md:order-5 max-md:row-span-1`}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quiz Options</label>
                <div className="space-y-2">
                  <div>
                    <label className="flex items-center max-md:min-h-11">
                      <input
                        type="checkbox"
                        checked={settings.shuffleQuestions}
                        onChange={(e) => setSettings({ ...settings, shuffleQuestions: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Shuffle questions</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      Randomize question order for each audience member
                    </p>
                  </div>
                  <div>
                    <label className="flex items-center max-md:min-h-11">
                      <input
                        type="checkbox"
                        checked={settings.shuffleAnswers}
                        onChange={(e) => setSettings({ ...settings, shuffleAnswers: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Shuffle answers</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      Randomize answer options for each question
                    </p>
                  </div>
                  <div>
                    <label className="flex items-center max-md:min-h-11">
                      <input
                        type="checkbox"
                        checked={settings.showQuestionFeedback}
                        onChange={(e) => setSettings({ ...settings, showQuestionFeedback: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Show question feedback</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      Show correct/incorrect feedback after each question
                    </p>
                  </div>
                  <div>
                    <label className="flex items-center max-md:min-h-11">
                      <input
                        type="checkbox"
                        checked={settings.showFinalScore}
                        onChange={(e) => setSettings({ ...settings, showFinalScore: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Show final score</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      Display final score at the end of the quiz
                    </p>
                  </div>
                </div>
              </div>

              <div className="max-md:order-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team Assignment
                </label>
                <div className="space-y-2">
                  <label className="flex items-center max-md:min-h-11">
                    <input
                      type="radio"
                      name="teamAssignment"
                      value="auto-assign"
                      checked={settings.teamAssignment === 'auto-assign'}
                      onChange={(e) => setSettings({ ...settings, teamAssignment: e.target.value })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Auto-assign</span>
                  </label>
                  <label className="flex items-center max-md:min-h-11">
                    <input
                      type="radio"
                      name="teamAssignment"
                      value="student-choice"
                      checked={settings.teamAssignment === 'student-choice'}
                      onChange={(e) => setSettings({ ...settings, teamAssignment: e.target.value })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Audience Choice</span>
                  </label>
                </div>
              </div>

              {settings.teamAssignment === 'student-choice' ? (
                <div key="students-per-team" className="max-md:order-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    No. of participants per team
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={settings.studentsPerTeam}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setSettings({ ...settings, studentsPerTeam: Math.min(val, 6) });
                    }}
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg"
                    placeholder="Enter max participants per team"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Maximum number of audience members allowed in each team
                  </p>
                </div>
              ) : null}

              <div className="max-md:order-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quiz Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={settings.countdown / 60}
                      onChange={(e) => setSettings({ ...settings, countdown: (parseInt(e.target.value) || 5) * 60 })}
                      className={`w-full h-10 px-3 border rounded-lg ${
                        durationInvalid ? 'border-red-400 focus:ring-red-200 focus:border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter quiz duration in minutes"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Time for quiz attempt
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Join Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={settings.joinDuration}
                      onChange={(e) => setSettings({ ...settings, joinDuration: parseInt(e.target.value) || 30 })}
                      className={`w-full h-10 px-3 border rounded-lg ${
                        durationInvalid ? 'border-red-400 focus:ring-red-200 focus:border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter join duration in minutes"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Time the audience can join
                    </p>
                  </div>
                </div>
                {durationInvalid && (
                  <p className="text-xs text-red-600 mt-1">{DURATION_MISMATCH_MSG}</p>
                )}
              </div>

              <div className="max-md:order-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Race Icon</label>
                <select
                  value={settings.icon}
                  onChange={(e) => setSettings({ ...settings, icon: e.target.value })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-lg"
                >
                  <option value="rocket">🚀 Rocket</option>
                  <option value="trophy">🏆 Trophy</option>
                  <option value="star">⭐ Star</option>
                  <option value="flag">🚩 Flag</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white flex flex-col-reverse md:flex-row items-stretch md:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-200">
            <button
              onClick={handleDelete}
              className="flex items-center justify-center space-x-2 px-4 py-2 min-h-11 max-md:w-full text-[#6D415F] hover:bg-[#6D415F]/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Race</span>
            </button>

            <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center gap-3 max-md:w-full">
              <button
                onClick={onClose}
                className="px-4 py-2 min-h-11 max-md:w-full text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={durationInvalid}
                className="px-4 py-2 min-h-11 max-md:w-full bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Changes
              </button>
            </div>
          </div>

        </div>
        </div>
      </div>

      {/* Copy Success Notification */}
      {showCopyNotification && (
        <div className="fixed top-4 right-4 z-[60] animate-pulse">
          <div className="bg-[#6D415F] text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">Code copied successfully</span>
          </div>
        </div>
      )}
    </>
  );
};

export default SpaceRaceSettings;
