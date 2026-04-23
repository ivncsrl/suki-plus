
## Add Web Image Search to Inventory

Add the ability to search the web for product images directly when adding/editing inventory items, with auto-suggestions based on the product name.

### How it will work

1. In the Add/Edit Product modal, next to the existing image upload area, add a **"Search Web"** button.
2. Clicking it opens an image picker that searches the web using the current product name (and brand, if filled) as the query.
3. Results appear as a grid of thumbnails. Tapping one downloads the image, uploads it to the product-images storage bucket, and sets it as the product's image.
4. A search input inside the picker lets the user refine the query (e.g. "Coca-Cola 1.5L") if the auto-suggested results aren't right.
5. The existing "Upload from device" flow stays as-is — web search is an additional option.

### Technical Plan

**Image search provider**
- Use **Google Programmable Search Engine (Custom Search JSON API)** with image search enabled. It's the most reliable for product imagery and has a free tier (100 queries/day).
- Requires two secrets from the user:
  - `GOOGLE_SEARCH_API_KEY` — from Google Cloud Console
  - `GOOGLE_SEARCH_ENGINE_ID` — from programmablesearchengine.google.com (configure to "Search the entire web" + "Image search on")
- I will request these via the secrets tool and provide step-by-step setup instructions before writing code.

**Edge function: `search-product-images`**
- Input: `{ query: string }`
- Calls Google Custom Search API with `searchType=image`, `num=8`, `safe=active`.
- Returns a normalized list: `[{ url, thumbnail, title, width, height }]`.
- JWT-verified (only signed-in users can search), with Zod input validation.

**Edge function: `import-image-from-url`**
- Input: `{ url: string }`
- Server-side fetches the remote image (avoids browser CORS issues), validates content-type is an image, enforces a max size (~5 MB).
- Uploads to the existing `product-images` bucket under `{user_id}/{uuid}.{ext}`.
- Returns the public URL.
- Doing this server-side keeps the storage RLS policy (folder = user_id) intact and prevents broken hotlinked URLs.

**Frontend changes (`src/pages/InventoryPage.tsx`)**
- New `WebImagePicker` component (inline or `src/components/WebImagePicker.tsx`):
  - Dialog with a search input pre-filled with `name + brand`.
  - Grid of 8 thumbnails with loading skeletons.
  - On select → calls `import-image-from-url`, then sets `image_url` on the product form.
- Add a "Search web" button beside the existing upload button in the product modal.
- Auto-trigger an initial search when the dialog opens if the product name is non-empty.

### Setup Steps for You

Before I can build this, you'll need to provide two API keys. After you approve this plan, I will:
1. Walk you through creating a Google Cloud API key and a Programmable Search Engine (takes ~3 minutes, free).
2. Request the two secrets via the secure secrets tool.
3. Then build the edge functions and UI.

### Notes & Limitations

- Google free tier = 100 image searches/day per project. Sufficient for a single-store app; we can add caching later if needed.
- Some web images may be copyrighted — the picker will show source/title so you can pick freely-usable ones. We won't add a license filter in v1 but can add it later.
- If you'd prefer a different provider (Bing, Unsplash, SerpAPI), let me know and I'll swap it in.
