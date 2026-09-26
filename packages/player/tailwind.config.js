/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        fadein: { from: { opacity: '0' }, to: { opacity: '1' } },
        dash: { to: { strokeDashoffset: '-28' } },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%,60%': { transform: 'translateX(-6px)' },
          '40%,80%': { transform: 'translateX(6px)' },
        },
      },
      animation: {
        fadein: 'fadein 220ms ease-out',
        shake: 'shake 360ms ease-in-out',
        dash: 'dash 1s linear infinite',
      },
    },
  },
  plugins: [],
}
