import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import type { BlogCtaCardData } from "@/content/blogSidebarCards";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

export default function BlogCtaCard({
  title,
  description,
  buttonText,
  buttonLink,
  gradient,
  iconName,
}: BlogCtaCardData) {
  const Icon = (Icons as Record<string, ComponentType<LucideProps>>)[iconName] ?? Icons.Zap;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden"
    >
      {/* gradient bant */}
      <div className={`h-2 bg-gradient-to-r ${gradient}`} />

      <div className="p-5">
        {/* ikon */}
        <div
          className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} text-white mb-3`}
        >
          <Icon size={20} />
        </div>

        {/* başlık */}
        <h4 className="font-bold text-lg text-brand-dark leading-snug mb-1">
          {title}
        </h4>

        {/* açıklama */}
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          {description}
        </p>

        {/* buton */}
        <Link
          to={buttonLink}
          className={`inline-flex items-center justify-center w-full rounded-xl bg-gradient-to-r ${gradient} px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:scale-105 transition-transform duration-200`}
        >
          {buttonText}
        </Link>
      </div>
    </motion.div>
  );
}
