import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LogOut, Lock, Mail, ImageIcon, Trash2, Copy, Loader2, X, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface MediaItem {
  name: string;
  path: string;
  url: string;
  size: number;
  createdAt: string;
}

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

const ProfilePage = () => {
  const { user, signOut } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Media gallery
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [sizeFilter, setSizeFilter] = useState<'all' | 'small' | 'medium' | 'large'>('all');

  const handleChangePassword = async () => {
    if (!newPassword.trim()) return toast.error('Enter a new password');
    if (newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match');

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const loadMedia = useCallback(async () => {
    if (!user) return;
    setMediaLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('product-images')
        .list(user.id, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      const items: MediaItem[] = (data || [])
        .filter(o => o.name && !o.name.endsWith('/'))
        .map(o => {
          const path = `${user.id}/${o.name}`;
          const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path);
          return {
            name: o.name,
            path,
            url: pub.publicUrl,
            size: (o.metadata as any)?.size || 0,
            createdAt: o.created_at || '',
          };
        });
      setMedia(items);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load media');
    } finally {
      setMediaLoading(false);
    }
  }, [user]);

  useEffect(() => { if (mediaOpen) loadMedia(); }, [mediaOpen, loadMedia]);

  const handleDeleteMedia = async (item: MediaItem) => {
    if (!confirm(`Delete this image? This cannot be undone.`)) return;
    setDeleting(item.path);
    const { error } = await supabase.storage.from('product-images').remove([item.path]);
    setDeleting(null);
    if (error) { toast.error(error.message); return; }
    setMedia(prev => prev.filter(m => m.path !== item.path));
    toast.success('Image deleted');
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const totalSize = media.reduce((s, m) => s + m.size, 0);

  const filteredMedia = media.filter(m => {
    if (sizeFilter === 'all') return true;
    const kb = m.size / 1024;
    if (sizeFilter === 'small') return kb < 100;
    if (sizeFilter === 'medium') return kb >= 100 && kb < 1024;
    if (sizeFilter === 'large') return kb >= 1024;
    return true;
  });

  const filteredSize = filteredMedia.reduce((s, m) => s + m.size, 0);

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 pt-4 animate-fade-in">
      <h1 className="text-xl font-extrabold mb-4">👤 Profile</h1>

      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center gap-3 mb-1">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Email</span>
        </div>
        <p className="font-semibold text-sm ml-7">{user?.email}</p>
      </div>

      <Button
        variant="outline"
        onClick={() => setMediaOpen(true)}
        className="w-full h-11 font-bold mb-4 justify-start"
      >
        <ImageIcon className="w-4 h-4 mr-2" /> Media Library
      </Button>

      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-sm">Change Password</h2>
        </div>
        <div className="space-y-3">
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="h-11"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="h-11"
          />
          <Button onClick={handleChangePassword} disabled={loading} className="w-full h-11 font-bold">
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </div>

      <Button variant="destructive" onClick={signOut} className="w-full h-11 font-bold">
        <LogOut className="w-4 h-4 mr-2" /> Sign Out
      </Button>

      {/* Media Library Dialog */}
      <Dialog open={mediaOpen} onOpenChange={setMediaOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Media Library
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{filteredMedia.length} image{filteredMedia.length === 1 ? '' : 's'} · {formatBytes(filteredSize)}</span>
            <Button size="sm" variant="ghost" className="h-7" onClick={loadMedia} disabled={mediaLoading}>
              {mediaLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <ToggleGroup
              type="single"
              value={sizeFilter}
              onValueChange={(v) => v && setSizeFilter(v as typeof sizeFilter)}
              className="flex-wrap"
            >
              <ToggleGroupItem value="all" size="sm" className="text-xs h-7">All</ToggleGroupItem>
              <ToggleGroupItem value="small" size="sm" className="text-xs h-7">&lt;100 KB</ToggleGroupItem>
              <ToggleGroupItem value="medium" size="sm" className="text-xs h-7">100 KB – 1 MB</ToggleGroupItem>
              <ToggleGroupItem value="large" size="sm" className="text-xs h-7">&gt;1 MB</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {mediaLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredMedia.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {media.length === 0 ? 'No uploaded images yet.' : 'No images match this size filter.'}
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {filteredMedia.map(m => (
                <div key={m.path} className="group relative aspect-square rounded-md overflow-hidden border border-border bg-muted">
                  <button
                    type="button"
                    onClick={() => setPreview(m)}
                    className="block w-full h-full"
                  >
                    <img
                      src={m.url}
                      alt={m.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex items-center justify-between">
                    <span className="text-[9px] text-white/80">{formatBytes(m.size)}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(m.url)}
                        className="text-white/80 hover:text-white"
                        title="Copy URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMedia(m)}
                        disabled={deleting === m.path}
                        className="text-white/80 hover:text-destructive disabled:opacity-50"
                        title="Delete"
                      >
                        {deleting === m.path ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            Deleting an image here removes it from storage but won't update products that already reference it.
          </p>
        </DialogContent>
      </Dialog>

      {/* Image Preview */}
      <Dialog open={!!preview} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className="max-w-xl p-2">
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute right-2 top-2 z-10 bg-background/80 rounded-full p-1"
          >
            <X className="w-4 h-4" />
          </button>
          {preview && (
            <div>
              <img src={preview.url} alt={preview.name} className="w-full max-h-[70vh] object-contain rounded-md" />
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-xs text-muted-foreground">{formatBytes(preview.size)}</span>
                <Button size="sm" variant="outline" onClick={() => handleCopyUrl(preview.url)}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy URL
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfilePage;
