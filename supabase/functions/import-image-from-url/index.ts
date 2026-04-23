import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const extFromContentType = (ct: string): string => {
  const t = ct.toLowerCase().split(';')[0].trim();
  if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg';
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  if (t === 'image/gif') return 'gif';
  return '';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => null);
    const imageUrl = typeof body?.url === 'string' ? body.url : '';
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl) || imageUrl.length > 2048) {
      return new Response(JSON.stringify({ error: 'Invalid url' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch the remote image
    const imgRes = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SukiPlusBot/1.0)' },
      redirect: 'follow',
    });
    if (!imgRes.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch image (${imgRes.status})` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const contentType = imgRes.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return new Response(JSON.stringify({ error: 'URL is not an image' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const ext = extFromContentType(contentType) || 'jpg';

    const buf = await imgRes.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'Image too large (max 5MB)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Upload using service role (bypasses storage RLS) but still scoped to user folder
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await adminClient.storage
      .from('product-images')
      .upload(path, new Uint8Array(buf), { contentType, upsert: false });
    if (upErr) {
      console.error('Upload error', upErr);
      return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: pub } = adminClient.storage.from('product-images').getPublicUrl(path);

    return new Response(JSON.stringify({ url: pub.publicUrl, path }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
