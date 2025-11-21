/*****************
 Tailwind Config
*****************/
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6",
        secondary: "#f97316",
        bgdark: "#0f172a",
        carddark: "#1e293b"
      }
    }
  },
  plugins: []
};
