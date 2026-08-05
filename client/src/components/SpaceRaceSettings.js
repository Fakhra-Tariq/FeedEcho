import React, { useState } from 'react';
import { X, Trash2, Users, Clock, Trophy, Star, Check } from 'lucide-react';
import { copyToClipboard } from '../utils/copyToClipboard';

const SpaceRaceSettings = ({ race, onClose, onDelete, onUpdate }) => {
  const [settings, setSettings] = useState({
    numberOfTeams: race.settings?.numberOfTeams || 2,
    studentsPerTeam: Math.min(race.settings?.studentsPerTeam || 5, 6),
    teamAssignment: race.settings?.teamAssignment || race.teamAssignment || 'auto-assign',
    countdown: race.settings?.countdown || 300, // Default 5 minutes (300 seconds)
    joinDuration: race.settings?.joinDuration || 30, // Default 30 minutes
    shuffleQuestions: race.settings?.shuffleQuestions !== undefined ? race.settings.shuffleQuestions : false,
    shuffleAnswers: race.settings?.shuffleAnswers !== undefined ? race.settings.shuffleAnswers : false,
    showQuestionFeedback: race.settings?.showQuestionFeedback !== undefined ? race.settings.showQuestionFeedback : false,
    showFinalScore: race.settings?.showFinalScore !== undefined ? race.settings.showFinalScore : false,
  });
  const [copied, setCopied] = useState(false);
  const [showCopyNotification, setShowCopyNotification] = useState(false);

  const handleSave = async () => {
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Space Race Settings</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">

            {/* Race Code Section */}
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-primary mb-2">Race Code</h3>
              <div className="flex items-center space-x-3">
                <div className="flex-1">
                  <div className="bg-white border border-primary/40 rounded px-4 py-2 font-mono text-lg text-primary font-bold">
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
                  className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
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
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">{race.title}</h3>
              <p className="text-sm text-gray-600">{race.description}</p>
              <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
                <div className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>{race.participantsCount || race.participants || 0} participants</span>
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

            {/* Team Settings */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Team Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Teams
                  </label>
                  <select
                    value={settings.numberOfTeams}
                    onChange={(e) => setSettings({ ...settings, numberOfTeams: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Assignment
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
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
                    <label className="flex items-center">
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
                  <div key="students-per-team">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter max participants per team"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Maximum number of students allowed in each team
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Quiz Settings */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quiz Settings</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quiz Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={settings.countdown / 60}
                      onChange={(e) => setSettings({ ...settings, countdown: (parseInt(e.target.value) || 5) * 60 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter quiz duration in minutes"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Time for quiz attempt
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Join Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={settings.joinDuration}
                      onChange={(e) => setSettings({ ...settings, joinDuration: parseInt(e.target.value) || 30 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter join duration in minutes"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Time students can join
                    </p>
                  </div>
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.shuffleQuestions}
                      onChange={(e) => setSettings({ ...settings, shuffleQuestions: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Shuffle questions</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    Randomize question order for each student
                  </p>
                </div>
                <div>
                  <label className="flex items-center">
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
                  <label className="flex items-center">
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
                  <label className="flex items-center">
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

            {/* Footer */}
            <div className="flex items-center justify-between p-6 border-t border-gray-200">
              <button
                onClick={handleDelete}
                className="flex items-center space-x-2 px-4 py-2 text-[#6D415F] hover:bg-[#6D415F]/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Race</span>
              </button>

              <div className="flex items-center space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
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
