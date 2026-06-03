import { useState, useEffect } from 'react';
import { MessageSquare, Search, CheckCircle2, Clock, Mail, User, Calendar, ChevronDown, ChevronUp, Send } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { coAdminNavItems } from './coAdminNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  resolver?: { full_name: string | null; email: string };
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
};

export default function CoAdminContactMessages() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null); // message id being resolved
  const [resolutionNote, setResolutionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('contact_messages')
      .select('*, resolver:resolved_by(full_name, email)')
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    if (data) setMessages(data as ContactMessage[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const filtered = messages.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.subject.toLowerCase().includes(search.toLowerCase()) ||
    m.message.toLowerCase().includes(search.toLowerCase())
  );

  const openCount = messages.filter(m => m.status === 'open').length;

  const startResolve = (id: string) => {
    setResolving(id);
    setResolutionNote('');
  };

  const handleResolve = async (msgId: string) => {
    if (!resolutionNote.trim()) {
      toast.error('Please describe how the issue was resolved.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('contact_messages').update({
        status: 'resolved',
        resolved_by: profile?.id,
        resolution_note: resolutionNote.trim(),
        resolved_at: new Date().toISOString(),
      }).eq('id', msgId);
      if (error) throw error;
      toast.success('Message marked as resolved.');
      setResolving(null);
      setResolutionNote('');
      load();
    } catch {
      toast.error('Failed to resolve message.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout navItems={coAdminNavItems} title="Contact Messages" subtitle="View and resolve messages from the public contact form">
      <div className="space-y-5 max-w-5xl">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-navy-800 rounded-2xl border border-slate-100 dark:border-navy-700 p-4 shadow-sm">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Messages</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{messages.length}</p>
          </div>
          <div className="bg-white dark:bg-navy-800 rounded-2xl border border-slate-100 dark:border-navy-700 p-4 shadow-sm">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Awaiting Response</p>
            <p className="text-2xl font-extrabold text-amber-600">{openCount}</p>
          </div>
          <div className="bg-white dark:bg-navy-800 rounded-2xl border border-slate-100 dark:border-navy-700 p-4 shadow-sm">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Resolved</p>
            <p className="text-2xl font-extrabold text-emerald-600">{messages.length - openCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, subject..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 text-sm"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'open', 'resolved'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors capitalize ${statusFilter === s ? 'bg-sky-600 text-white' : 'bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Message list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-navy-800 rounded-2xl border border-slate-100 dark:border-navy-700">
            <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">No messages found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(msg => (
              <div key={msg.id} className="bg-white dark:bg-navy-800 rounded-2xl border border-slate-100 dark:border-navy-700 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
                  className="w-full flex items-start gap-4 p-5 text-left hover:bg-slate-50 dark:hover:bg-navy-750 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${msg.status === 'resolved' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                    {msg.status === 'resolved'
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      : <Clock className="w-4 h-4 text-amber-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-white">{msg.name}</span>
                      <span className="text-slate-400 text-sm">—</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{msg.email}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-auto capitalize ${STATUS_COLORS[msg.status]}`}>
                        {msg.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{msg.subject}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {expanded === msg.id ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />}
                </button>

                {expanded === msg.id && (
                  <div className="px-5 pb-5 border-t border-slate-100 dark:border-navy-700 pt-4 space-y-4">
                    {/* Message body */}
                    <div>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Message</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-navy-900 rounded-xl p-4">{msg.message}</p>
                    </div>

                    {/* Meta */}
                    <div className="grid sm:grid-cols-3 gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5" />
                        <span>{msg.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5" />
                        <a href={`mailto:${msg.email}`} className="text-sky-600 hover:text-sky-700">{msg.email}</a>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(msg.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Resolution info (if already resolved) */}
                    {msg.status === 'resolved' && msg.resolution_note && (
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Resolution Note</span>
                          {msg.resolver && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-auto">
                              by {msg.resolver.full_name || msg.resolver.email}
                              {msg.resolved_at && ` · ${formatDistanceToNow(new Date(msg.resolved_at), { addSuffix: true })}`}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300 whitespace-pre-wrap leading-relaxed">{msg.resolution_note}</p>
                        <p className="text-xs text-emerald-500 dark:text-emerald-500 mt-2 italic">This resolution note cannot be edited.</p>
                      </div>
                    )}

                    {/* Resolve action — only for open messages */}
                    {msg.status === 'open' && (
                      <>
                        {resolving === msg.id ? (
                          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-4 space-y-3">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">How was this resolved?</p>
                            <textarea
                              value={resolutionNote}
                              onChange={e => setResolutionNote(e.target.value)}
                              rows={4}
                              placeholder="Describe the steps taken to resolve this issue. This note cannot be edited after saving."
                              className="input-field resize-none text-sm w-full"
                              autoFocus
                            />
                            <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                              Once submitted, this resolution note is permanent and cannot be modified.
                            </p>
                            <div className="flex gap-3">
                              <button
                                onClick={() => handleResolve(msg.id)}
                                disabled={submitting || !resolutionNote.trim()}
                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-60"
                              >
                                <Send className="w-4 h-4" />
                                {submitting ? 'Saving...' : 'Mark as Resolved'}
                              </button>
                              <button
                                onClick={() => setResolving(null)}
                                className="px-5 py-2.5 border border-slate-200 dark:border-navy-600 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => startResolve(msg.id)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Mark as Resolved
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
