/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}"], // Make sure your JS file path is included here!
  theme: {
    extend: {
      colors: {
        ApplyOrange: "#ff5722", // Replace with your actual hex codes
        ApplyMaroon: "#800000",
        ApplyDark: "#1a1a1a",
        ApplyWhite: "#ffffff",
      },
    },
  },
  plugins: [],
};
