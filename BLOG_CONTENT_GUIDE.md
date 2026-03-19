# PORTECO v3 - Blog Yazilari Rehberi

## Blog Sistemi Genel Bakis

PORTECO web sitesindeki blog, enerji sektorune yonelik bilgilendirici yazilar icermektedir. Blog icerikleri iki katmanda yonetilir:

1. **Frontend (statik):** `src/content/blog.ts` dosyasinda hardcoded olarak tanimli
2. **Veritabani (dinamik):** Supabase `posts` tablosu uzerinden admin panelinden yonetilir

Blog sayfalari:
- `/blog` - Yazi listesi (hero slider + kategori filtreleme)
- `/blog/:slug` - Tekil yazi detay sayfasi

---

## Kategoriler

| ID | Etiket | Aciklama |
|----|--------|----------|
| `elektrik-perakende` | Elektrik Perakende | Tarife secimi, sozlesme, serbest tuketici konulari |
| `enerji-etudu` | Enerji Etudu | Enerji verimliligi analizi ve tasarruf yontemleri |
| `ges-kurulum` | GES Kurulum | Gunes enerji santrali yatirim ve kurulum surecleri |
| `enerji-yonetimi` | Enerji Yonetimi | Tuketim izleme, reaktif guc, OSOS veri analizi |

---

## Mevcut Blog Yazilari

### 1. Dogru elektrik tarifesi nasil secilir?

- **Slug:** `dogru-elektrik-tarifesi-nasil-secilir`
- **Kategori:** Elektrik Perakende
- **Yayin Tarihi:** 10 Ocak 2025
- **Okuma Suresi:** 6 dakika
- **One Cikarilan:** Evet
- **Icerik Durumu:** Dolu (3 paragraf)

**Ozet:** Sanayi veya ticarethane abonelerinde yanlis tarife secimi, faturanin %10-20 oraninda gereksiz sismesine neden olabilir. Tarife tiplerini ve secim kriterlerini ozet olarak anlatir.

**Icerik Konulari:**
- Tek zamanli, cok zamanli, OSB ici/disi, serbest tuketici ve ikili anlasma tarife turleri
- Gun ici yuk profiline gore tarife secim stratejisi
- OSOS ve EPIAS verileriyle son 12 aylik tuketim analizi ve senaryolu tasarruf hesabi

---

### 2. Tesisiniz GES kurulumu icin uygun mu?

- **Slug:** `tesisiniz-ges-kurulumu-icin-uygun-mu`
- **Kategori:** GES Kurulum
- **Yayin Tarihi:** 5 Ocak 2025
- **Okuma Suresi:** 7 dakika
- **One Cikarilan:** Evet
- **Icerik Durumu:** Dolu (2 paragraf)

**Ozet:** Her cati GES icin uygun degil. Statik dayanim, cati kaplamasi, golgelenme ve tuketim profili gibi kriterler, yatirimin geri donus suresini dogrudan etkiler.

**Icerik Konulari:**
- GES yatirimi oncesi cati ve tuketim verisi analizi
- Yil ici uretim-tuketim eslesmesi
- OSOS verileri uzerinden saatlik tuketim profili incelemesi
- Kurulacak GES'in kW boyutlandirmasi ve sebekeye satis/cekis senaryolari

---

### 3. Enerji etudu ile tasarrufa nereden baslanmali?

- **Slug:** `enerji-etudu-ile-nereden-baslamali`
- **Kategori:** Enerji Etudu
- **Yayin Tarihi:** 15 Aralik 2024
- **Okuma Suresi:** 5 dakika
- **One Cikarilan:** Hayir
- **Icerik Durumu:** Bos (sadece ozet mevcut)

**Ozet:** Etut calismalari sirasinda, sahadaki her ekipmana tek tek bakmak yerine, en buyuk tasarruf potansiyeli olan alanlardan baslamaniz gerektigini anlatir.

---

### 4. Reaktif cezalar neden olur, nasil onlenir?

- **Slug:** `reaktif-cezalar-neden-olur-nasil-onlenir`
- **Kategori:** Enerji Yonetimi
- **Yayin Tarihi:** 20 Kasim 2024
- **Okuma Suresi:** 4 dakika
- **One Cikarilan:** Hayir
- **Icerik Durumu:** Bos (sadece ozet mevcut)

**Ozet:** Reaktif guc limitlerinin asilmasi, ozellikle buyuk motor yuku olan tesislerde sik gorulen ve onlem alinmadiginda ciddi maliyetler doguran bir problemdir.

---

### 5. OSOS'tan alinan verileri nasil okumaliyiz?

- **Slug:** `osostan-alinan-verileri-nasil-okumaliyiz`
- **Kategori:** Enerji Yonetimi
- **Yayin Tarihi:** 5 Ekim 2024
- **Okuma Suresi:** 5 dakika
- **One Cikarilan:** Hayir
- **Icerik Durumu:** Bos (sadece ozet mevcut)

**Ozet:** Saatlik tuketim verileri yalnizca grafik degil, dogru okundugunda uretim planlama ve bakim stratejisi icin de onemli bir girdi saglar.

---

### 6. Enerji perakende sozlesmesi icin kontrol listesi

- **Slug:** `enerji-perakende-sozlesmesi-icin-kontrol-listesi`
- **Kategori:** Elektrik Perakende
- **Yayin Tarihi:** 18 Eylul 2024
- **Okuma Suresi:** 6 dakika
- **One Cikarilan:** Hayir
- **Icerik Durumu:** Bos (sadece ozet mevcut)

**Ozet:** Birim fiyat disinda sozlesmede nelere bakmalisiniz? Taahhut suresi, dengesizlik, teminat ve cezai sartlar gibi kritik maddeleri ozetler.

---

## Blog Post Veri Yapisi

### Frontend (TypeScript)

```typescript
type BlogPost = {
  slug: string;           // URL-dostu benzersiz tanimlayici
  title: string;          // Yazi basligi (Turkce)
  summary: string;        // Kisa ozet/onizleme
  categoryId: BlogCategoryId; // Kategori siniflandirmasi
  bannerImage: string;    // Kapak gorseli yolu
  publishedAt: string;    // ISO tarih (YYYY-MM-DD)
  readingMinutes: number; // Tahmini okuma suresi
  isFeatured?: boolean;   // Blog sayfasinda hero slider'da gosterilir
  body?: string[];        // Paragraf dizisi (detay sayfasi icerigi)
};
```

### Veritabani (posts tablosu)

| Kolon | Tip | Aciklama |
|-------|-----|----------|
| `id` | UUID | Benzersiz kimlik (otomatik) |
| `title` | text | Yazi basligi |
| `slug` | text | URL-dostu tanimlayici (basliktan otomatik turetilir) |
| `category_id` | text | Kategori ID'si |
| `summary` | text | Kisa ozet |
| `cover_url` | text | Kapak gorseli URL'i |
| `content_md` | text | Yazi icerigi (Markdown formatinda) |
| `is_featured` | boolean | One cikarilmis mi |
| `reading_minutes` | number | Okuma suresi (dakika) |
| `published` | boolean | Yayinda mi |
| `seo_title` | text | SEO basligi |
| `seo_description` | text | SEO aciklamasi |
| `og_image_url` | text | Open Graph gorsel URL'i |
| `created_at` | timestamptz | Olusturma zamani |
| `updated_at` | timestamptz | Son guncelleme zamani |

---

## Icerik Durumu Ozeti

| Yazi | Icerik | Durum |
|------|--------|-------|
| Dogru elektrik tarifesi nasil secilir? | 3 paragraf | Tamamlandi |
| Tesisiniz GES kurulumu icin uygun mu? | 2 paragraf | Tamamlandi |
| Enerji etudu ile tasarrufa nereden baslanmali? | - | Icerik bekleniyor |
| Reaktif cezalar neden olur, nasil onlenir? | - | Icerik bekleniyor |
| OSOS'tan alinan verileri nasil okumaliyiz? | - | Icerik bekleniyor |
| Enerji perakende sozlesmesi icin kontrol listesi | - | Icerik bekleniyor |

> **Not:** Icerigi olmayan yazilar, detay sayfasinda "Bu yazinin ayrintili icerigi yakinda eklenecek..." placeholder metni gosterir.
