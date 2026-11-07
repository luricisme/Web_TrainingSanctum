// AD-1 enforcement: packages/domain must have zero imports from next, react,
// or @prisma/client (or any HTTP/DB library). This lint rule is the
// boundary guard called for by spec-1-1 even though no domain logic exists
// yet. Run via `npm run lint -w packages/domain`.
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "@prisma/client",
                "@prisma/client/*",
              ],
              message:
                "packages/domain must stay framework-free (AD-1): no next, react, or @prisma/client imports. HTTP/DB access belongs in apps/web/app/api/** or packages/db.",
            },
          ],
        },
      ],
    },
  }
);
