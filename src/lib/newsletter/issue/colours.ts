// The colours of Glia Notes' email (PLAN §7.2, §13). Mail programs cannot read the site's CSS
// variables, so the values of tokens.css are written out here: light by default, dark through
// `prefers-color-scheme` where a mail program supports it. Each line names its token, and
// src/app/(frontend)/raw-colours.test.ts checks that the two agree; nowhere else may a colour be
// written as a value.
export const EMAIL_COLOURS = {
  light: {
    bg: '#eef0f4', // --bg
    surface: '#ffffff', // --surface
    text: '#1e2152', // --text
    muted: '#4a4f72', // --text-muted
    accent: '#b8286e', // --accent
    link: '#146992', // --link
    line: '#d3d6e0', // --line
  },
  dark: {
    bg: '#161942', // --bg
    surface: '#1e2152', // --surface
    text: '#e9ebf4', // --text
    muted: '#aeb3d2', // --text-muted
    accent: '#f06aae', // --accent
    link: '#5cc8ec', // --link
    line: '#2f346b', // --line
  },
} as const
