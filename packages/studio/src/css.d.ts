/**
 * CSS Modules are resolved by the bundler, not by TypeScript. Without this,
 * `import s from "./ladx.module.css"` is an unresolved module and every
 * `s.rung` below it is an error.
 *
 * Typed as a string index rather than the exact class names: generating those
 * needs a build step, and the payoff — catching a typo'd class name — is not
 * worth adding one to a package that otherwise compiles straight from source.
 */
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.css";
