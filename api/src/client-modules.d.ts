/** `*.client.js` files are bundled as text (see `rules` in wrangler.jsonc), not as modules. */
declare module '*.client.js' {
  const source: string;
  export default source;
}
