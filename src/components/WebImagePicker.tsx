import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, Globe, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImageResult {
  url: string;
  thumbnail: string;
  title: string;
  source: string;
  width: number;
  height: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  onPicked: (publicUrl: string) => void;
}

const WebImagePicker = ({ open, onOpenChange, initialQuery, onPicked }: Props) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingUrl, setImportingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('search-product-images', {
        body: { query: trimmed },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setResults(data?.results || []);
      if ((data?.results || []).length === 0) setError('No images found. Try a different search.');
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search when dialog opens
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      if (initialQuery.trim()) runSearch(initialQuery);
      else { setResults([]); setError(null); }
    }
  }, [open, initialQuery, runSearch]);

  const handlePick = async (img: ImageResult) => {
    setImportingUrl(img.url);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('import-image-from-url', {
        body: { url: img.url },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error('Import failed');
      onPicked(data.url);
      toast.success('Image added');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to import image');
    } finally {
      setImportingUrl(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl z-[60]" overlayClassName="z-[60]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-4 h-4" /> Search Web for Image
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch(query)}
              placeholder="e.g. Coca-Cola 1.5L"
              className="pl-9 h-10"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button onClick={() => runSearch(query)} disabled={loading || !query.trim()} className="h-10">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-muted-foreground text-center py-8">{error}</p>
          )}

          {!loading && !error && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Type a product name and tap Search.
            </p>
          )}

          {!loading && results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {results.map((img, i) => {
                const isImporting = importingUrl === img.url;
                const disabled = importingUrl !== null;
                return (
                  <button
                    key={`${img.url}-${i}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => handlePick(img)}
                    className="group relative aspect-square rounded-md overflow-hidden border border-border hover:ring-2 hover:ring-primary transition-all bg-muted disabled:opacity-50"
                    title={img.title}
                  >
                    <img
                      src={img.thumbnail}
                      alt={img.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                    />
                    {isImporting && (
                      <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] text-white truncate">{img.source}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground">
          Tip: Some results may be copyrighted. Pick images you have rights to use.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default WebImagePicker;
