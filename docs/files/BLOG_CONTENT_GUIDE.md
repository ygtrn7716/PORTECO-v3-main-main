# PortEco — Blog İçerik Rehberi

Bu rehber, PortEco web sitesindeki blog yazılarının nasıl eklendiğini, hangi alanların doldurulduğunu ve render davranışını anlatır.

Kaynak dosyalar:

- `src/pages/admin/PostsAdmin.tsx` — admin tarafı CRUD
- `src/pages/BlogPage.tsx` — blog listesi
- `src/pages/BlogDetailPage.tsx` — tek yazı görünümü
- `src/components/blog/BlogSidebar.tsx`, `BlogCtaCard.tsx`, `TableOfContents.tsx`
- Tablo: `posts`

## 1. Genel Akış

1. Admin `/dashboard/admin/posts` sayfasında yeni satır ekler (`PostsAdmin.tsx` `TableManager` ile).
2. `published = false` olarak draft kaydedilebilir.
3. Yayına alındığında `published = true` set edilir.
4. Public sayfa `/blog` yalnızca `published = true` olan yazıları listeler.
5. Yazıya tek tek `/blog/:slug` üzerinden erişilir.

## 2. `posts` Tablosu Şeması

`PostsAdmin.tsx` içindeki `TableConfig.columns` tanımına göre tabloda aşağıdaki alanlar vardır:

| Kolon | Tip | Inline edit | Tabloda gözükür mü | Açıklama |
| --- | --- | --- | --- | --- |
| `id` | uuid | readonly | Evet | Postgres tarafından üretilir |
| `title` | text | Evet | Evet | Yazı başlığı |
| `slug` | text | Evet | Evet | URL ad parçası; `title` değiştiğinde otomatik üretilir (`autoSlugFrom: "title"`) |
| `category_id` | text | Evet | Evet | Kategori referansı |
| `summary` | text (multiline 4 satır) | Evet | Evet | Liste sayfasında gösterilen özet |
| `cover_url` | text | Evet | Evet | Kapak görseli URL'i |
| `content_md` | text (multiline 14 satır) | Evet | **Hayır** (`hideInTable`) | Markdown gövde |
| `is_featured` | bool | Evet | Evet | Öne çıkar (sidebar/anasayfada) |
| `reading_minutes` | number | Evet | Evet | Tahmini okuma süresi |
| `published` | bool | Evet | Evet | Yayına al / draft |
| `seo_title` | text | Evet | Evet | `<title>` ve OG title |
| `seo_description` | text (multiline 3 satır) | Evet | Evet | Meta description |
| `og_image_url` | text | Evet | Evet | Open Graph görseli URL'i |
| `created_at` | text | readonly | **Hayır** | Postgres timestamp |
| `updated_at` | text | readonly | **Hayır** | Postgres timestamp |

`matchKeys: ["id"]`. Sıralama: `created_at DESC`. Filtre: yalnızca `title` üzerinde text search (`ilike "%q%"`).

## 3. Yeni Yazı Ekleme Adımları

1. `/dashboard/admin/posts` sayfasını aç.
2. Sağ üstteki **+ Yeni Satır** butonuna tıkla.
3. Açılan modalda alanları doldur:
   - **`title`**: Yazı başlığı (TR karakterler dahil).
   - **`slug`**: Otomatik üretilir; gerekirse elle düzelt. Tüm karakterler küçük harf, Türkçe karakterler ASCII'ye çevrilir, boşluklar tire olur.
   - **`category_id`**: Kategori (örn. `enerji`, `mevzuat`, `tarife`).
   - **`summary`**: 1-2 cümlelik özet.
   - **`cover_url`**: Kapak görseli (Supabase Storage veya harici URL).
   - **`content_md`**: Tam markdown gövde (aşağıdaki bölüm 4'e bakın).
   - **`is_featured`**: Öne çıkar (sidebar'a ekler).
   - **`reading_minutes`**: 200 kelime/dakika kuralıyla tahmin et.
   - **`published`**: `false` ile başla; içerik son şeklini aldığında `true` yap.
   - **`seo_title`, `seo_description`, `og_image_url`**: SEO/sosyal medya kartı için.
4. Kaydet.

`TableManager` `INSERT` operasyonu Supabase tarafına `supabase.from("posts").insert(payload)` çağırır.

## 4. Markdown Desteği

`content_md` alanı tam markdown destekler. Render `react-markdown` + `remark-gfm` paketleriyle yapılır (`BlogDetailPage.tsx`).

Desteklenen özellikler:

- Başlıklar `# H1`, `## H2`, ... — `<h1>`-`<h6>` etiketleri.
- Liste, sıralı liste, görev listesi (`- [x]`).
- Tablo (GFM).
- Kod bloğu — fenced code block.
- Bağlantı, görsel.
- Otomatik linkler.
- Çift tilde ile silinmiş metin.
- HTML embed **kapalıdır** (varsayılan); ham HTML görmezden gelinir.

`TableOfContents.tsx` markdown içindeki `## ` ve `### ` başlıklarından otomatik içindekiler tablosu üretir; uzun yazılarda sayfanın yan tarafında gösterilir.

## 5. Yayınlama Akışı (Draft → Published)

1. **Draft**: `published = false`. Yazı admin tarafından görülür ama public listede çıkmaz. Önizleme için `/blog/:slug`'a doğrudan giderek kontrol etmek mümkün — ancak `BlogPage.tsx` ve `BlogDetailPage.tsx` `published = true` filtresi uygular; bu yüzden draft yazılar 404 döner.
2. **Published**: `published = true` set edildiğinde yazı public listede görünür ve `/blog/:slug` ile erişilebilir.
3. **Featured**: `is_featured = true` set edildiğinde `BlogSidebar` öne çıkanlar bölümüne eklenir.

## 6. Slug Otomasyonu

`TableManager` içindeki `slugifyTR()` fonksiyonu (`TableManager.tsx:22`):

```typescript
function slugifyTR(s: string) {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
```

`title` alanı değişince ve `slug` boşsa otomatik üretilir. Mevcut slug doluysa override etmez. Inline edit ve INSERT modal'ında her ikisinde de çalışır.

## 7. SEO Meta Alanları

Public blog sayfasında `BlogDetailPage.tsx` aşağıdaki SEO/social meta etiketlerini ekler:

| Alan | Kaynak | Etki |
| --- | --- | --- |
| `<title>` | `seo_title ?? title` | Tarayıcı sekme başlığı, Google sonuç başlığı |
| `<meta name="description">` | `seo_description ?? summary` | Google sonuç açıklaması |
| `<meta property="og:title">` | `seo_title ?? title` | Sosyal kart başlığı |
| `<meta property="og:description">` | `seo_description ?? summary` | Sosyal kart açıklaması |
| `<meta property="og:image">` | `og_image_url ?? cover_url` | Sosyal kart görseli |
| `<meta property="og:type">` | `article` | OG tipi |

Boş bırakılan SEO alanları otomatik olarak yazı verilerinden türetilir.

## 8. Görsel Yükleme

Repo içinde Supabase Storage entegrasyonuna otomatik yükleme yoktur. Kapak ve OG görselleri için:

1. **Supabase Storage**: Storage Studio üzerinden uygun bir bucket'a (örn. `blog-assets`) görseli yükle. Public URL'i kopyala.
2. **Harici CDN**: Cloudinary, Imgur, vb. herhangi bir public URL.
3. URL'i `cover_url` ve `og_image_url` alanlarına yapıştır.

> Önerilen iyileştirme: PostsAdmin sayfasına bir "Görsel Yükle" butonu eklenip Storage'a doğrudan upload yapması. Şu an manuel URL girişi gerekir.

## 9. Public Listeleme

`BlogPage.tsx` `posts` tablosundan `published = true` olan satırları çeker, `published_at DESC` veya `created_at DESC` sırasında listeler. Liste kartlarında gösterilen alanlar:

- Kapak görseli (`cover_url`)
- Başlık (`title`)
- Özet (`summary`)
- Kategori etiketi (`category_id`)
- Okuma süresi (`reading_minutes` dakika)
- Yayın tarihi (`created_at`)

`is_featured = true` olan yazılar listenin en üstünde rozetli olarak gösterilir.

## 10. Tek Yazı Sayfası

`BlogDetailPage.tsx` `/blog/:slug` parametresine göre `posts` tablosundan ilgili satırı çeker. Render bileşenleri:

- Üst banner: kapak görseli + başlık
- Sağ sidebar: `BlogSidebar` (öne çıkanlar, kategoriler)
- Sol sidebar: `TableOfContents` (auto)
- Ana içerik: `react-markdown` ile `content_md`
- Alt: `BlogCtaCard` (PortEco'ya kayıt çağrısı)

## 11. Kategoriler

`category_id` text alanıdır; ayrı bir `categories` tablosu **yoktur**. Kategoriler isteğe bağlı sabit string'lerdir (`"enerji"`, `"tarife"`, `"mevzuat"` gibi). Liste sayfasında tıklanabilir filtre olarak kullanılır.

> Önerilen iyileştirme: `categories` tablosu ekleyip `category_id` foreign key olarak çevirmek. Mevcut sürümde tutarlılık disiplini elle korunur.

## 12. Kaldırılan / Değişen Yapılar

- **`published_at` kolonu**: `PostsAdmin.tsx` üzerinde yorum satırı şu uyarıyı içeriyor: "published_at istemiyorum dediğin için". Yani şema bu alanı taşıyor olsa da admin paneli üzerinden gösterilmiyor; sıralama `created_at DESC` üzerinden yapılıyor. Yayına alma tarihi `published` toggle ile manuel kontrol edilir.
- **Realtime abonelik**: Posts tablosunda realtime yok. Admin yazısını kaydeder, kullanıcı sayfayı yenilemeden yeni yazıyı görmez.
- **Blog kategorileri**: Eski sürümde sabit dize listesi `src/content/blog.ts`'te tutulmaktaydı. Şu an `category_id` her yazıda serbest text olarak girilir; merkezi liste yoktur.
- **OG görseli zorunluluğu**: Eski sürümde `og_image_url` zorunluydu; admin'in INSERT modalı boş bırakılmasını engelliyordu. Şimdi opsiyonel; boşsa `cover_url` fallback olarak kullanılır.

---

## Son Güncelleme

- **Tarih:** 2026-05-03
- **Branch:** main
- **Son commit:** `03aa828` — valla bişeler yaptık da hatırlamıyom amk
- **Kapsanan dosyalar:** `src/pages/admin/PostsAdmin.tsx`, `src/pages/BlogPage.tsx`, `src/pages/BlogDetailPage.tsx`, `src/components/blog/BlogSidebar.tsx`, `src/components/blog/BlogCtaCard.tsx`, `src/components/blog/TableOfContents.tsx`, `src/components/admin/TableManager.tsx` (slugifyTR), `posts` tablosu şeması
