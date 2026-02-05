import TableManager from "@/components/admin/TableManager";

export default function PostsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Blog Posts",
        table: "posts",
        matchKeys: ["id"],

        // published_at istemiyorum dediğin için:
        orderBy: { key: "created_at", asc: false },

        // title araması
        filters: [{ key: "title", label: "Title", type: "text" }],

        columns: [
          { key: "id", label: "id", type: "uuid", readOnly: true },

          { key: "title", label: "title", type: "text" },
          { key: "slug", label: "slug", type: "text", autoSlugFrom: "title" },

          { key: "category_id", label: "category_id", type: "text" },

          { key: "summary", label: "summary", type: "text", multiline: true, rows: 4 },

          { key: "cover_url", label: "cover_url", type: "text" },

          {
            key: "content_md",
            label: "content_md (markdown)",
            type: "text",
            multiline: true,
            rows: 14,
            hideInTable: true,
          },

          { key: "is_featured", label: "is_featured", type: "bool" },
          { key: "reading_minutes", label: "reading_minutes", type: "number" },

          { key: "published", label: "published", type: "bool" },

          { key: "seo_title", label: "seo_title", type: "text" },
          { key: "seo_description", label: "seo_description", type: "text", multiline: true, rows: 3 },
          { key: "og_image_url", label: "og_image_url", type: "text" },

          { key: "created_at", label: "created_at", type: "text", readOnly: true, hideInTable: true },
          { key: "updated_at", label: "updated_at", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
