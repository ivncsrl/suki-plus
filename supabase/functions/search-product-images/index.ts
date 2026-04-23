import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => null);
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query || query.length > 200) {
      return new Response(JSON.stringify({ error: 'Invalid query' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('GOOGLE_SEARCH_API_KEY');
    const cx = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');
    if (!apiKey || !cx) {
      return new Response(JSON.stringify({ error: 'Image search is not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('num', '8');
    url.searchParams.set('safe', 'active');

    const res = await fetch(url.toString());
    const data = await res.json();
    if (!res.ok) {
      console.error('Google search error', data);
      const msg = data?.error?.message || 'Image search failed';
      return new Response(JSON.stringify({ error: msg }), { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const items = Array.isArray(data.items) ? data.items : [];
    const results = items.map((it: any) => ({
      url: it.link,
      thumbnail: it.image?.thumbnailLink || it.link,
      title: it.title || '',
      width: it.image?.width || 0,
      height: it.image?.height || 0,
      source: it.displayLink || '',
    }));

    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
