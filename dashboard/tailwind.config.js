export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#08111f",
        mist: "#dce7f8",
        electric: "#75e4b3",
        amberline: "#f4b860",
        danger: "#f06d6d",
      },
      boxShadow: {
        panel: "0 24px 70px rgba(2, 8, 23, 0.35)",
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["'Trebuchet MS'", "Verdana", "sans-serif"],
      },
    },
  },
  plugins: [],
};

