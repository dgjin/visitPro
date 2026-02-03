/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    // 禁用 preflight 以避免与小程序默认样式冲突 (例如 html/body 选择器)
    preflight: false,
  }
}
