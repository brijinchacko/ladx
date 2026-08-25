/**
 * CSS modules, for the type checker.
 *
 * This package imports @ladx/studio, which resolves to its source, and that
 * source imports a CSS module. Without this the checker fails on a file this
 * package does not own.
 */
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
