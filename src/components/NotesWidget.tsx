import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StickyNote, X, Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Note {
  id: string;
  content: string;
  updated_at: string;
}

const NotesWidget = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notes')
      .select('id, content, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    setNotes(data || []);
  }, [user]);

  useEffect(() => {
    if (open) loadNotes();
  }, [open, loadNotes]);

  const createNote = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('notes')
      .insert({ user_id: user.id, content: '' })
      .select('id, content, updated_at')
      .single();
    if (error) { toast.error('Failed to create note'); return; }
    if (data) {
      setNotes(prev => [data, ...prev]);
      setActiveNote(data);
      setDraft('');
    }
  };

  const saveNote = async () => {
    if (!activeNote) return;
    setSaving(true);
    const { error } = await supabase
      .from('notes')
      .update({ content: draft, updated_at: new Date().toISOString() })
      .eq('id', activeNote.id);
    setSaving(false);
    if (error) { toast.error('Failed to save'); return; }
    toast.success('Saved');
    setNotes(prev => prev.map(n => n.id === activeNote.id ? { ...n, content: draft, updated_at: new Date().toISOString() } : n));
    setActiveNote(prev => prev ? { ...prev, content: draft } : null);
  };

  const deleteNote = async (id: string) => {
    await supabase.from('notes').delete().eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (activeNote?.id === id) { setActiveNote(null); setDraft(''); }
    toast.success('Note deleted');
  };

  const selectNote = (note: Note) => {
    setActiveNote(note);
    setDraft(note.content);
  };

  return (
    <>
      {/* Toggle Button */}
      <Button
        onClick={() => setOpen(!open)}
        size="icon"
        className="fixed bottom-24 right-4 z-50 rounded-full shadow-lg h-12 w-12 bg-primary text-primary-foreground"
      >
        <StickyNote className="w-5 h-5" />
      </Button>

      {/* Panel */}
      {open && (
        <div className="fixed inset-y-0 right-0 w-80 max-w-[90vw] bg-card border-l border-border shadow-xl z-50 flex flex-col animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-primary" /> Notes
            </h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={createNote} className="h-8 w-8">
                <Plus className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {activeNote ? (
            /* Editor */
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-1 p-2 border-b border-border">
                <Button variant="ghost" size="sm" onClick={() => { setActiveNote(null); setDraft(''); }} className="text-xs">
                  ← Back
                </Button>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" onClick={saveNote} disabled={saving} className="h-8 w-8">
                  <Save className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deleteNote(activeNote.id)} className="h-8 w-8 text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Write your note..."
                className="flex-1 border-0 rounded-none resize-none focus-visible:ring-0 text-sm"
              />
            </div>
          ) : (
            /* List */
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {notes.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">No notes yet. Tap + to add one.</p>
              )}
              {notes.map(note => (
                <button
                  key={note.id}
                  onClick={() => selectNote(note)}
                  className="w-full text-left bg-muted/50 hover:bg-muted rounded-lg p-3 transition-colors"
                >
                  <p className="text-sm truncate font-medium">{note.content || 'Empty note'}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(note.updated_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default NotesWidget;
