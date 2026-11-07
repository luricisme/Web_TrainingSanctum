import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Native flat-config exports (ESLint 9+) rather than the legacy
// `next/core-web-vitals` string run through FlatCompat, which crashes under
// this toolchain (eslint-plugin-react's flat config is self-referential and
// @eslint/eslintrc's error formatter can't JSON.stringify it).
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript];

export default eslintConfig;
