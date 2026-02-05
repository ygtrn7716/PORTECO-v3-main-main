/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", lg: "2rem" },
      screens: { "2xl": "72rem" }
    },
    extend: {
      colors: {
        // Tasarım tokenları (senin verdiğin hex’ler)
        brand: {
          blue: "#00AEEF",       // Ana mavi
          blueLight: "#40CFFF",  // Hover / açık mavi
          blueDark: "#005B96"    // Başlık / koyu mavi
        },
        neutral: {
          dark: "#0F1C2E",       // Koyu arka plan
          gray: "#7A8C99",       // İkincil metin
          white: "#FFFFFF",
          lightBlue: "#E6F8FD"   // Secondary hover bg
        }
      },
      borderRadius: {
        DEFAULT: "8px",
        md: "8px"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
};
