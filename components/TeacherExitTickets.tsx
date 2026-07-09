import React, { useState, useEffect } from 'react';
import ExitTicketCard from '../components/ExitTicketCard';

interface ExitTicket {
  id: string;
  title: string;
  status: 'draft' | 'active' | 'ended' | 'archived';
  joinCode?: string;
  questions: any[];
  responsesCount: number;
  createdAt: any;
}

const TeacherExitTickets: React.FC = () => {
  const [exitTickets, setExitTickets] = useState<ExitTicket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<ExitTicket[]>([]);
  const [counts, setCounts] = useState({
    draft: 0,
    active: 0,
    ended: 0,
    archived: 0
  });
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const fetchExitTickets = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/exit-tickets?userId=current-user-id'); // In production, get actual user ID
      const result = await response.json();
      
      if (result.success) {
        setExitTickets(result.data);
        setCounts(result.counts);
      } else {
        showToast('Failed to fetch exit tickets', 'error');
      }
    } catch (error) {
      showToast('Failed to fetch exit tickets', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExitTickets();
  }, []);

  useEffect(() => {
    if (filter === 'all') {
      setFilteredTickets(exitTickets);
    } else {
      setFilteredTickets(exitTickets.filter(ticket => ticket.status === filter));
    }
  }, [exitTickets, filter]);

  const handleUpdate = () => {
    fetchExitTickets();
  };

  const handleDelete = (id: string) => {
    setExitTickets(exitTickets.filter(ticket => ticket.id !== id));
    fetchExitTickets();
  };

  const handleLaunch = (id: string) => {
    fetchExitTickets();
  };

  const handleEnd = (id: string) => {
    fetchExitTickets();
  };

  const handleArchive = (id: string) => {
    fetchExitTickets();
  };

  const handleViewCode = (joinCode: string) => {
    // Copy to clipboard
    navigator.clipboard.writeText(joinCode);
    showToast(`Join code ${joinCode} copied to clipboard!`, 'success');
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
      type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Exit Tickets</h1>
        
        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center">
              <div className="p-3 bg-gray-100 rounded-full">
                <span className="text-xl font-semibold text-gray-600">{counts.draft}</span>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Draft</h3>
                <p className="text-sm text-gray-600">Tickets being created</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-full">
                <span className="text-xl font-semibold text-green-600">{counts.active}</span>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Active</h3>
                <p className="text-sm text-gray-600">Currently running</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center">
              <div className="p-3 bg-orange-100 rounded-full">
                <span className="text-xl font-semibold text-orange-600">{counts.ended}</span>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Ended</h3>
                <p className="text-sm text-gray-600">Completed sessions</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-full">
                <span className="text-xl font-semibold text-blue-600">{counts.archived}</span>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Archived</h3>
                <p className="text-sm text-gray-600">Stored for reference</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filter Tickets</h2>
          <div className="flex flex-wrap gap-2">
            {['all', 'draft', 'active', 'ended', 'archived'].map((filterOption) => (
              <button
                key={filterOption}
                type="button"
                onClick={() => setFilter(filterOption)}
                className={`px-4 py-2 rounded-md font-medium ${
                  filter === filterOption
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Exit Tickets List */}
        <div className="space-y-4">
          {filteredTickets.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <p className="text-gray-500 text-lg">No exit tickets found</p>
              <p className="text-gray-400 mt-2">
                {filter === 'all' 
                  ? 'Create your first exit ticket to get started.'
                  : `No ${filter} exit tickets found.`
                }
              </p>
            </div>
          ) : (
            filteredTickets.map((exitTicket) => (
              <ExitTicketCard
                key={exitTicket.id}
                exitTicket={exitTicket}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onLaunch={handleLaunch}
                onEnd={handleEnd}
                onArchive={handleArchive}
                onViewCode={handleViewCode}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherExitTickets;
