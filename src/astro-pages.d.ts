// `import Landing from './index.astro'` has no types of its own: Astro's
// language server resolves a page component and tsc does not. The site tests
// render pages through astro/container, which takes exactly this factory.
declare module '*.astro' {
  const page: import('astro/runtime/server/index.js').AstroComponentFactory
  export default page
}
