import { motion } from "framer-motion";
import BlogCtaCard from "./BlogCtaCard";
import {
  blogSidebarCards,
  type BlogCtaCardData,
} from "@/content/blogSidebarCards";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function BlogSidebar({
  cards = blogSidebarCards,
}: {
  cards?: BlogCtaCardData[];
}) {
  return (
    <>
      {/* Desktop: sticky sidebar */}
      <motion.aside
        variants={container}
        initial="hidden"
        animate="show"
        className="hidden lg:flex sticky top-24 flex-col gap-6"
      >
        {cards.map((c) => (
          <motion.div key={c.id} variants={item}>
            <BlogCtaCard {...c} />
          </motion.div>
        ))}
      </motion.aside>

      {/* Mobil / tablet: yatay scroll */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="lg:hidden flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory"
      >
        {cards.map((c) => (
          <motion.div
            key={c.id}
            variants={item}
            className="min-w-[280px] snap-start"
          >
            <BlogCtaCard {...c} />
          </motion.div>
        ))}
      </motion.div>
    </>
  );
}
