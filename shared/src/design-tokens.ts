export const designTokens = {
  color: {
    brand: {
      50: "#f0f3f5",
      100: "#dbe3e6",
      200: "#bdccd1",
      300: "#9fb4bc",
      400: "#708a93",
      500: "#334e58",
      600: "#2b434c",
      700: "#253941",
      800: "#1a282d",
      900: "#111a1d"
    },
    accent: {
      50: "#fff9e8",
      100: "#fff0c2",
      200: "#ffe189",
      300: "#ffd055",
      400: "#ffbe22",
      500: "#e6a400",
      600: "#b98000",
      700: "#8f6200",
      800: "#664500",
      900: "#402b00"
    },
    neutral: {
      0: "#ffffff",
      50: "#f8f9fb",
      100: "#eef1f5",
      200: "#dce2ea",
      300: "#c2ccd8",
      400: "#98a7ba",
      500: "#6f8196",
      600: "#53657a",
      700: "#3e4c5d",
      800: "#2a3442",
      900: "#111827"
    },
    semantic: {
      success: "#0f9f6e",
      warning: "#c58900",
      danger: "#d92d20",
      info: "#2563eb"
    }
  },
  typography: {
    fontFamily: {
      sans: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      mono: '"Fira Code", "Consolas", "Courier New", monospace'
    },
    fontSize: {
      xs: "0.75rem",
      sm: "0.875rem",
      md: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem"
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.7
    },
    fontWeight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    }
  },
  spacing: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem"
  },
  radius: {
    none: "0",
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    full: "9999px"
  },
  elevation: {
    sm: "0 1px 2px rgba(16, 24, 40, 0.08)",
    md: "0 4px 10px rgba(16, 24, 40, 0.1)",
    lg: "0 12px 24px rgba(16, 24, 40, 0.14)"
  },
  iconography: {
    size: {
      sm: "16px",
      md: "20px",
      lg: "24px"
    },
    strokeWidth: {
      regular: 1.5,
      bold: 2
    }
  },
  layout: {
    maxWidth: {
      content: "1200px",
      reading: "720px"
    },
    sidebarWidth: "272px",
    headerHeight: "72px"
  },
  component: {
    controlHeight: {
      sm: "32px",
      md: "40px",
      lg: "48px"
    },
    focusRing: "0 0 0 3px rgba(51, 78, 88, 0.24)"
  }
} as const;

export type DesignTokens = typeof designTokens;
