/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",      // appフォルダの中
    "./components/**/*.{js,ts,jsx,tsx,mdx}", // componentsフォルダの中
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'), // さっきインストールしたプラグイン
  ],
};